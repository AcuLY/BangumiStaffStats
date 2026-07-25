package runtimecache

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/querytiming"
)

type resultCore struct {
	IDs []int64
}

type doneObservedContext struct {
	context.Context
	observed chan struct{}
	once     sync.Once
}

func (ctx *doneObservedContext) Done() <-chan struct{} {
	ctx.once.Do(func() { close(ctx.observed) })
	return ctx.Context.Done()
}

func cloneResultCore(value resultCore) resultCore {
	value.IDs = append([]int64(nil), value.IDs...)
	return value
}

func TestResultKeysAreSemanticAndScopeSeparated(t *testing.T) {
	dataVersion := "dv1-" + stringsOf("a", 64)
	queryDigest := "q1:" + stringsOf("b", 64)
	inputDigest := EmptyInputDigestV1
	collectionDigest := "c1:" + stringsOf("c", 64)

	global, err := NewGlobalResultKey(
		OperationRankingsV1,
		dataVersion,
		queryDigest,
		inputDigest,
	)
	if err != nil {
		t.Fatalf("global key: %v", err)
	}
	personal, err := NewPersonalResultKey(
		OperationRankingsV1,
		dataVersion,
		queryDigest,
		inputDigest,
		collectionDigest,
	)
	if err != nil {
		t.Fatalf("personal key: %v", err)
	}
	if global == personal || global.String() == personal.String() {
		t.Fatal("global and personal key spaces collided")
	}

	nextVersion, err := NewGlobalResultKey(
		OperationRankingsV1,
		"dv1-"+stringsOf("d", 64),
		queryDigest,
		inputDigest,
	)
	if err != nil {
		t.Fatalf("next-version key: %v", err)
	}
	if global == nextVersion {
		t.Fatal("dataVersion did not change result key")
	}
	if strings.Contains(global.String(), "search") ||
		strings.Contains(global.String(), "page") ||
		strings.Contains(global.String(), "sort") {
		t.Fatalf("view field entered key: %s", global.String())
	}
}

func TestResultStoreSameKeyComputeAndOwnership(t *testing.T) {
	executor, err := NewExecutor(DefaultExecutorConfig())
	if err != nil {
		t.Fatalf("NewExecutor: %v", err)
	}
	store, err := NewResultStore(
		ResultConfig{
			Limits:      Limits{MaxCost: 1024, MaxItems: 4, MaxItemCost: 512},
			LoadTimeout: time.Second,
		},
		executor,
		cloneResultCore,
		func(value resultCore) int64 { return int64(len(value.IDs) * 8) },
	)
	if err != nil {
		t.Fatalf("NewResultStore: %v", err)
	}
	key := mustResultKey(t, "a")
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int64
	compute := func(ctx context.Context) (resultCore, error) {
		if querytiming.FromContext(ctx) == nil {
			return resultCore{}, errors.New("worker trace is absent")
		}
		if calls.Add(1) == 1 {
			close(started)
		}
		select {
		case <-release:
			querytiming.ObserveSQLiteFromContext(ctx, 7*time.Millisecond, nil)
			return resultCore{IDs: []int64{1, 2, 3}}, nil
		case <-ctx.Done():
			return resultCore{}, ctx.Err()
		}
	}

	type outcome struct {
		value resultCore
		err   error
	}
	first := make(chan outcome, 1)
	second := make(chan outcome, 1)
	firstTrace := querytiming.New()
	secondTrace := querytiming.New()
	secondWaiting := make(chan struct{})
	go func() {
		value, callErr := store.GetOrCompute(
			querytiming.WithContext(context.Background(), firstTrace),
			key,
			compute,
		)
		first <- outcome{value: value, err: callErr}
	}()
	<-started
	go func() {
		value, callErr := store.GetOrCompute(
			querytiming.WithContext(
				&doneObservedContext{
					Context:  context.Background(),
					observed: secondWaiting,
				},
				secondTrace,
			),
			key,
			compute,
		)
		second <- outcome{value: value, err: callErr}
	}()
	<-secondWaiting
	close(release)
	left, right := <-first, <-second
	if left.err != nil || right.err != nil ||
		!slices.Equal(left.value.IDs, []int64{1, 2, 3}) ||
		!slices.Equal(right.value.IDs, []int64{1, 2, 3}) {
		t.Fatalf("outcomes = %+v, %+v", left, right)
	}
	left.value.IDs[0] = 99
	right.value.IDs[1] = 88
	cached, found := store.Get(key)
	if !found || !slices.Equal(cached.IDs, []int64{1, 2, 3}) {
		t.Fatalf("cached core mutated: %+v, found=%v", cached, found)
	}
	if calls.Load() != 1 {
		t.Fatalf("compute calls = %d", calls.Load())
	}
	firstSnapshot := firstTrace.Freeze()
	secondSnapshot := secondTrace.Freeze()
	for _, phase := range []querytiming.Phase{
		querytiming.PhaseSQLite,
		querytiming.PhaseCompute,
	} {
		firstDuration, firstPresent := firstSnapshot.Phase(phase)
		secondDuration, secondPresent := secondSnapshot.Phase(phase)
		if !firstPresent ||
			!secondPresent ||
			firstDuration != secondDuration {
			t.Fatalf(
				"shared %s = (%f, %t), (%f, %t)",
				phase,
				firstDuration,
				firstPresent,
				secondDuration,
				secondPresent,
			)
		}
	}
}

func TestResultTimingSeparatesNestedSQLiteFromCompute(t *testing.T) {
	executor, err := NewExecutor(DefaultExecutorConfig())
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewResultStore(
		ResultConfig{
			Limits:      Limits{MaxCost: 1024, MaxItems: 4, MaxItemCost: 512},
			LoadTimeout: time.Second,
		},
		executor,
		cloneResultCore,
		func(value resultCore) int64 { return int64(len(value.IDs) * 8) },
	)
	if err != nil {
		t.Fatal(err)
	}
	trace := querytiming.New()
	ctx := querytiming.WithContext(context.Background(), trace)
	started := time.Now()
	_, err = store.GetOrCompute(
		ctx,
		mustResultKey(t, "d"),
		func(workerContext context.Context) (resultCore, error) {
			sqliteStarted := time.Now()
			time.Sleep(5 * time.Millisecond)
			querytiming.ObserveSQLiteFromContext(
				workerContext,
				time.Since(sqliteStarted),
				nil,
			)
			time.Sleep(10 * time.Millisecond)
			return resultCore{IDs: []int64{1}}, nil
		},
	)
	elapsed := time.Since(started).Seconds()
	if err != nil {
		t.Fatal(err)
	}
	snapshot := trace.Freeze()
	sqlite, sqlitePresent := snapshot.Phase(querytiming.PhaseSQLite)
	compute, computePresent := snapshot.Phase(querytiming.PhaseCompute)
	if !sqlitePresent || !computePresent ||
		sqlite < 0.004 ||
		compute < 0.008 ||
		compute >= elapsed ||
		compute+sqlite > elapsed+0.005 {
		t.Fatalf(
			"sqlite=%f compute=%f elapsed=%f snapshot=%#v",
			sqlite,
			compute,
			elapsed,
			snapshot,
		)
	}
}

func TestResultTimingDetachedWorkerOutlivesFrozenFirstWaiter(t *testing.T) {
	executor, err := NewExecutor(DefaultExecutorConfig())
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewResultStore(
		ResultConfig{
			Limits:      Limits{MaxCost: 1024, MaxItems: 4, MaxItemCost: 512},
			LoadTimeout: time.Second,
		},
		executor,
		cloneResultCore,
		func(value resultCore) int64 { return int64(len(value.IDs) * 8) },
	)
	if err != nil {
		t.Fatal(err)
	}

	key := mustResultKey(t, "e")
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int64
	compute := func(ctx context.Context) (resultCore, error) {
		if querytiming.FromContext(ctx) == nil {
			return resultCore{}, errors.New("worker trace is absent")
		}
		if calls.Add(1) == 1 {
			close(started)
		}
		select {
		case <-release:
			querytiming.ObserveSQLiteFromContext(ctx, time.Millisecond, nil)
			time.Sleep(5 * time.Millisecond)
			return resultCore{IDs: []int64{5}}, nil
		case <-ctx.Done():
			return resultCore{}, ctx.Err()
		}
	}

	firstTrace := querytiming.New()
	firstContext, cancelFirst := context.WithCancel(
		querytiming.WithContext(context.Background(), firstTrace),
	)
	firstDone := make(chan error, 1)
	go func() {
		_, callErr := store.GetOrCompute(firstContext, key, compute)
		firstDone <- callErr
	}()
	<-started
	cancelFirst()
	if err := <-firstDone; !errors.Is(err, context.Canceled) {
		t.Fatalf("first waiter = %v", err)
	}
	frozenFirst := firstTrace.Freeze()

	secondTrace := querytiming.New()
	secondDone := make(chan error, 1)
	secondWaiting := make(chan struct{})
	go func() {
		_, callErr := store.GetOrCompute(
			querytiming.WithContext(
				&doneObservedContext{
					Context:  context.Background(),
					observed: secondWaiting,
				},
				secondTrace,
			),
			key,
			compute,
		)
		secondDone <- callErr
	}()
	<-secondWaiting
	close(release)
	if err := <-secondDone; err != nil {
		t.Fatalf("second waiter = %v", err)
	}
	if calls.Load() != 1 {
		t.Fatalf("compute calls = %d", calls.Load())
	}
	secondSnapshot := secondTrace.Freeze()
	if sqlite, present := secondSnapshot.Phase(querytiming.PhaseSQLite); !present ||
		sqlite != 0.001 ||
		secondSnapshot.SQLiteOutcome() != querytiming.DependencySuccess {
		t.Fatalf(
			"second SQLite = %f, %t, %q",
			sqlite,
			present,
			secondSnapshot.SQLiteOutcome(),
		)
	}
	if compute, present := secondSnapshot.Phase(querytiming.PhaseCompute); !present ||
		compute <= 0 {
		t.Fatalf("second compute = %f, %t", compute, present)
	}
	if firstTrace.Freeze() != frozenFirst {
		t.Fatal("detached worker mutated the frozen first waiter trace")
	}
	if _, present := frozenFirst.Phase(querytiming.PhaseSQLite); present {
		t.Fatal("cancelled waiter received late SQLite execution")
	}
	if _, present := frozenFirst.Phase(querytiming.PhaseCompute); present {
		t.Fatal("cancelled waiter received wait time as compute")
	}
}

func TestResultTimingSharesOrdinaryComputeFailureAcrossWaiters(t *testing.T) {
	executor, err := NewExecutor(DefaultExecutorConfig())
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewResultStore(
		ResultConfig{
			Limits:      Limits{MaxCost: 1024, MaxItems: 4, MaxItemCost: 512},
			LoadTimeout: time.Second,
		},
		executor,
		cloneResultCore,
		func(value resultCore) int64 { return int64(len(value.IDs) * 8) },
	)
	if err != nil {
		t.Fatal(err)
	}

	computeFailure := errors.New("ordinary compute failure")
	key := mustResultKey(t, "6")
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int64
	compute := func(ctx context.Context) (resultCore, error) {
		if calls.Add(1) == 1 {
			close(started)
		}
		select {
		case <-release:
		case <-ctx.Done():
			return resultCore{}, ctx.Err()
		}
		sqliteStarted := time.Now()
		time.Sleep(5 * time.Millisecond)
		querytiming.ObserveSQLiteFromContext(
			ctx,
			time.Since(sqliteStarted),
			computeFailure,
		)
		time.Sleep(10 * time.Millisecond)
		return resultCore{}, computeFailure
	}

	firstTrace := querytiming.New()
	secondTrace := querytiming.New()
	type callResult struct {
		err error
	}
	first := make(chan callResult, 1)
	second := make(chan callResult, 1)
	secondWaiting := make(chan struct{})
	go func() {
		_, callErr := store.GetOrCompute(
			querytiming.WithContext(context.Background(), firstTrace),
			key,
			compute,
		)
		first <- callResult{err: callErr}
	}()
	<-started
	go func() {
		_, callErr := store.GetOrCompute(
			querytiming.WithContext(
				&doneObservedContext{
					Context:  context.Background(),
					observed: secondWaiting,
				},
				secondTrace,
			),
			key,
			compute,
		)
		second <- callResult{err: callErr}
	}()
	<-secondWaiting
	close(release)

	firstResult, secondResult := <-first, <-second
	if !errors.Is(firstResult.err, computeFailure) ||
		!errors.Is(secondResult.err, computeFailure) {
		t.Fatalf(
			"shared errors = %v, %v",
			firstResult.err,
			secondResult.err,
		)
	}
	if calls.Load() != 1 {
		t.Fatalf("compute calls = %d", calls.Load())
	}
	firstSnapshot := firstTrace.Freeze()
	secondSnapshot := secondTrace.Freeze()
	if firstSnapshot.SQLiteOutcome() != querytiming.DependencyError ||
		secondSnapshot.SQLiteOutcome() != querytiming.DependencyError {
		t.Fatalf(
			"SQLite outcomes = %q, %q",
			firstSnapshot.SQLiteOutcome(),
			secondSnapshot.SQLiteOutcome(),
		)
	}
	for _, phase := range []querytiming.Phase{
		querytiming.PhaseSQLite,
		querytiming.PhaseCompute,
	} {
		firstDuration, firstPresent := firstSnapshot.Phase(phase)
		secondDuration, secondPresent := secondSnapshot.Phase(phase)
		if !firstPresent ||
			!secondPresent ||
			firstDuration <= 0 ||
			firstDuration != secondDuration {
			t.Fatalf(
				"shared failed %s = (%f, %t), (%f, %t)",
				phase,
				firstDuration,
				firstPresent,
				secondDuration,
				secondPresent,
			)
		}
	}
}

func TestResultTimingWorkerDeadlineDropsLateExecution(t *testing.T) {
	executor, err := NewExecutor(DefaultExecutorConfig())
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewResultStore(
		ResultConfig{
			Limits:      Limits{MaxCost: 1024, MaxItems: 4, MaxItemCost: 512},
			LoadTimeout: 20 * time.Millisecond,
		},
		executor,
		cloneResultCore,
		func(value resultCore) int64 { return int64(len(value.IDs) * 8) },
	)
	if err != nil {
		t.Fatal(err)
	}

	trace := querytiming.New()
	_, err = store.GetOrCompute(
		querytiming.WithContext(context.Background(), trace),
		mustResultKey(t, "7"),
		func(ctx context.Context) (resultCore, error) {
			<-ctx.Done()
			querytiming.ObserveSQLiteFromContext(
				ctx,
				time.Millisecond,
				ctx.Err(),
			)
			return resultCore{}, ctx.Err()
		},
	)
	if code, found := ErrorCode(err); !found || code != CodeTimeout {
		t.Fatalf("worker timeout = %v, code = %q, found = %t", err, code, found)
	}
	snapshot := trace.Freeze()
	if _, present := snapshot.Phase(querytiming.PhaseSQLite); present {
		t.Fatal("worker timeout merged late SQLite execution")
	}
	if _, present := snapshot.Phase(querytiming.PhaseCompute); present {
		t.Fatal("worker timeout merged late compute execution")
	}
}

func TestResultStoreOversizeAndPublicationFailureAreNeutral(t *testing.T) {
	executor, err := NewExecutor(DefaultExecutorConfig())
	if err != nil {
		t.Fatalf("NewExecutor: %v", err)
	}
	store, err := NewResultStore(
		ResultConfig{
			Limits:      Limits{MaxCost: 8, MaxItems: 2, MaxItemCost: 8},
			LoadTimeout: time.Second,
		},
		executor,
		cloneResultCore,
		func(value resultCore) int64 { return int64(len(value.IDs) * 8) },
	)
	if err != nil {
		t.Fatalf("NewResultStore: %v", err)
	}
	key := mustResultKey(t, "b")
	var calls atomic.Int64
	for index := 0; index < 2; index++ {
		value, err := store.GetOrCompute(context.Background(), key, func(context.Context) (resultCore, error) {
			calls.Add(1)
			return resultCore{IDs: []int64{1, 2}}, nil
		})
		if err != nil || !slices.Equal(value.IDs, []int64{1, 2}) {
			t.Fatalf("oversize result = %+v, %v", value, err)
		}
	}
	if calls.Load() != 2 {
		t.Fatalf("oversize compute calls = %d", calls.Load())
	}
	if stats := store.Stats(); stats.Items != 0 || stats.Oversize != 2 {
		t.Fatalf("oversize stats = %+v", stats)
	}

	skipStore, err := NewResultStore(
		ResultConfig{
			Limits:      Limits{MaxCost: 8, MaxItems: 2, MaxItemCost: 8},
			LoadTimeout: time.Second,
		},
		executor,
		cloneResultCore,
		func(resultCore) int64 { return -1 },
	)
	if err != nil {
		t.Fatalf("skip NewResultStore: %v", err)
	}
	value, err := skipStore.GetOrCompute(context.Background(), key, func(context.Context) (resultCore, error) {
		return resultCore{IDs: []int64{7}}, nil
	})
	if err != nil || !slices.Equal(value.IDs, []int64{7}) {
		t.Fatalf("publication-failure result = %+v, %v", value, err)
	}
	if _, found := skipStore.Get(key); found {
		t.Fatal("negative-cost value was published")
	}
}

func TestResultStoreWaiterCancellationDoesNotCancelComputation(t *testing.T) {
	executor, err := NewExecutor(DefaultExecutorConfig())
	if err != nil {
		t.Fatalf("NewExecutor: %v", err)
	}
	store, err := NewResultStore(
		ResultConfig{
			Limits:      Limits{MaxCost: 128, MaxItems: 2, MaxItemCost: 128},
			LoadTimeout: time.Second,
		},
		executor,
		cloneResultCore,
		func(resultCore) int64 { return 8 },
	)
	if err != nil {
		t.Fatalf("NewResultStore: %v", err)
	}
	key := mustResultKey(t, "c")
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int64
	compute := func(ctx context.Context) (resultCore, error) {
		if calls.Add(1) == 1 {
			close(started)
		}
		select {
		case <-release:
			return resultCore{IDs: []int64{5}}, nil
		case <-ctx.Done():
			return resultCore{}, ctx.Err()
		}
	}

	cancelContext, cancel := context.WithCancel(context.Background())
	first := make(chan error, 1)
	second := make(chan error, 1)
	go func() {
		_, err := store.GetOrCompute(cancelContext, key, compute)
		first <- err
	}()
	<-started
	go func() {
		_, err := store.GetOrCompute(context.Background(), key, compute)
		second <- err
	}()
	time.Sleep(10 * time.Millisecond)
	cancel()
	if err := <-first; !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled waiter = %v", err)
	}
	close(release)
	if err := <-second; err != nil {
		t.Fatalf("remaining waiter = %v", err)
	}
	if calls.Load() != 1 {
		t.Fatalf("compute calls = %d", calls.Load())
	}
}

func TestSharedResultStoreRequiresPreRegisteredOperationAndMatchingKeys(t *testing.T) {
	config := DefaultQueryRuntimeConfig()
	config.Result = ResultConfig{
		Limits:      Limits{MaxCost: 128, MaxItems: 2, MaxItemCost: 128},
		LoadTimeout: time.Second,
	}
	rankingBinding := mustResultBinding(
		t,
		OperationRankingsV1,
		cloneResultCore,
		func(resultCore) int64 { return 8 },
	)
	queryRuntime, err := NewQueryRuntime(config, rankingBinding)
	if err != nil {
		t.Fatal(err)
	}
	cores, err := NewSharedResultStore[resultCore](
		queryRuntime,
		OperationRankingsV1,
	)
	if err != nil {
		t.Fatal(err)
	}
	candidateKey := resultKeyForOperation(t, OperationCandidatesV1, 99)
	if _, err := cores.GetOrCompute(
		context.Background(),
		candidateKey,
		func(context.Context) (resultCore, error) {
			return resultCore{IDs: []int64{2}}, nil
		},
	); err == nil {
		t.Fatal("operation-mismatched shared facade accepted a key")
	} else if code, ok := ErrorCode(err); !ok || code != CodeInvalidInput {
		t.Fatalf("operation mismatch = %v, code=%q, ok=%t", err, code, ok)
	}

	unboundRuntime, err := NewQueryRuntime(config)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewSharedResultStore[resultCore](
		unboundRuntime,
		OperationRankingsV1,
	); err == nil {
		t.Fatal("facade consumed an absent binding")
	} else if code, ok := ErrorCode(err); !ok || code != CodeInvalidInput {
		t.Fatalf("absent binding = %v, code=%q, ok=%t", err, code, ok)
	}
}

func TestQueryRuntimeRejectsDuplicateAndConflictingBindings(t *testing.T) {
	rankingBinding := mustResultBinding(
		t,
		OperationRankingsV1,
		cloneResultCore,
		func(resultCore) int64 { return 8 },
	)
	conflictingType := mustResultBinding(
		t,
		OperationRankingsV1,
		func(value string) string { return value },
		func(string) int64 { return 8 },
	)
	conflictingPolicy := mustResultBinding(
		t,
		OperationRankingsV1,
		func(value resultCore) resultCore {
			return resultCore{IDs: append([]int64{99}, value.IDs...)}
		},
		func(resultCore) int64 { return 16 },
	)
	tests := []struct {
		name   string
		second ResultBinding
	}{
		{name: "duplicate", second: rankingBinding},
		{name: "type", second: conflictingType},
		{name: "clone-and-cost", second: conflictingPolicy},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := NewQueryRuntime(
				DefaultQueryRuntimeConfig(),
				rankingBinding,
				test.second,
			); err == nil {
				t.Fatal("duplicate operation binding was accepted")
			} else if code, ok := ErrorCode(err); !ok || code != CodeInvalidInput {
				t.Fatalf("duplicate binding = %v, code=%q, ok=%t", err, code, ok)
			}
		})
	}
}

func TestSharedResultStoreWrongTypeFirstCannotPolluteCanonicalBinding(t *testing.T) {
	rankingBinding := mustResultBinding(
		t,
		OperationRankingsV1,
		cloneResultCore,
		func(resultCore) int64 { return 8 },
	)
	queryRuntime, err := NewQueryRuntime(
		DefaultQueryRuntimeConfig(),
		rankingBinding,
	)
	if err != nil {
		t.Fatal(err)
	}
	before := queryRuntime.Stats().Result
	if _, err := NewSharedResultStore[string](
		queryRuntime,
		OperationRankingsV1,
	); err == nil {
		t.Fatal("wrong typed facade was constructed first")
	} else if code, ok := ErrorCode(err); !ok || code != CodeInvalidInput {
		t.Fatalf("wrong-type-first = %v, code=%q, ok=%t", err, code, ok)
	}
	if after := queryRuntime.Stats().Result; after != before {
		t.Fatalf("wrong-type-first changed cache state: before=%+v after=%+v", before, after)
	}

	cores, err := NewSharedResultStore[resultCore](
		queryRuntime,
		OperationRankingsV1,
	)
	if err != nil {
		t.Fatal(err)
	}
	key := mustResultKey(t, "e")
	want := resultCore{IDs: []int64{7}}
	if _, err := cores.GetOrCompute(
		context.Background(),
		key,
		func(context.Context) (resultCore, error) { return want, nil },
	); err != nil {
		t.Fatal(err)
	}
	sameType, err := NewSharedResultStore[resultCore](
		queryRuntime,
		OperationRankingsV1,
	)
	if err != nil {
		t.Fatalf("same typed facade: %v", err)
	}
	if sameType.pool != cores.pool {
		t.Fatal("same typed facade did not reuse the canonical operation pool")
	}
	cached, found := cores.Get(key)
	if !found || !slices.Equal(cached.IDs, want.IDs) {
		t.Fatalf("correct cached value changed: %+v, found=%t", cached, found)
	}
}

func TestSharedResultStoreConcurrentConstructionUsesImmutableBindings(t *testing.T) {
	rankingBinding := mustResultBinding(
		t,
		OperationRankingsV1,
		cloneResultCore,
		func(resultCore) int64 { return 8 },
	)
	queryRuntime, err := NewQueryRuntime(
		DefaultQueryRuntimeConfig(),
		rankingBinding,
	)
	if err != nil {
		t.Fatal(err)
	}
	canonical, err := NewSharedResultStore[resultCore](
		queryRuntime,
		OperationRankingsV1,
	)
	if err != nil {
		t.Fatal(err)
	}

	type construction struct {
		correct bool
		store   *ResultStore[resultCore]
		err     error
	}
	results := make(chan construction, 64)
	var group sync.WaitGroup
	for index := 0; index < 32; index++ {
		group.Add(2)
		go func() {
			defer group.Done()
			store, err := NewSharedResultStore[resultCore](
				queryRuntime,
				OperationRankingsV1,
			)
			results <- construction{correct: true, store: store, err: err}
		}()
		go func() {
			defer group.Done()
			_, err := NewSharedResultStore[string](
				queryRuntime,
				OperationRankingsV1,
			)
			results <- construction{err: err}
		}()
	}
	group.Wait()
	close(results)
	for result := range results {
		if result.correct && result.err != nil {
			t.Fatalf("canonical facade construction = %v", result.err)
		}
		if result.correct && result.store != canonical {
			t.Fatal("concurrent canonical facade did not reuse the registered store")
		}
		if !result.correct {
			if code, ok := ErrorCode(result.err); !ok || code != CodeInvalidInput {
				t.Fatalf(
					"concurrent wrong facade = %v, code=%q, ok=%t",
					result.err,
					code,
					ok,
				)
			}
		}
	}
	if stats := queryRuntime.Stats().Result; stats != (LRUStats{}) {
		t.Fatalf("facade construction changed cache state: %+v", stats)
	}
}

func TestSharedResultStoreRepeatedFacadesReuseDetachedGroup(t *testing.T) {
	rankingBinding := mustResultBinding(
		t,
		OperationRankingsV1,
		cloneResultCore,
		func(resultCore) int64 { return 8 },
	)
	queryRuntime, err := NewQueryRuntime(
		DefaultQueryRuntimeConfig(),
		rankingBinding,
	)
	if err != nil {
		t.Fatal(err)
	}
	first, err := NewSharedResultStore[resultCore](
		queryRuntime,
		OperationRankingsV1,
	)
	if err != nil {
		t.Fatal(err)
	}
	second, err := NewSharedResultStore[resultCore](
		queryRuntime,
		OperationRankingsV1,
	)
	if err != nil {
		t.Fatal(err)
	}
	if first != second || first.loads == nil || second.loads != first.loads {
		t.Fatal("repeated facade did not reuse the canonical detached group")
	}
}

func TestQueryRuntimeOwnsOneResourceSetAndExactDefaultBudgets(t *testing.T) {
	rankingBinding := mustResultBinding(
		t,
		OperationRankingsV1,
		cloneResultCore,
		func(value resultCore) int64 { return int64(len(value.IDs) * 8) },
	)
	candidateBinding := mustResultBinding(
		t,
		OperationCandidatesV1,
		func(value string) string { return value },
		func(value string) int64 { return int64(len(value)) },
	)
	queryRuntime, err := NewQueryRuntime(
		DefaultQueryRuntimeConfig(),
		rankingBinding,
		candidateBinding,
	)
	if err != nil {
		t.Fatalf("NewQueryRuntime: %v", err)
	}
	rankings, err := NewSharedResultStore[resultCore](
		queryRuntime,
		OperationRankingsV1,
	)
	if err != nil {
		t.Fatal(err)
	}
	candidates, err := NewSharedResultStore[string](
		queryRuntime,
		OperationCandidatesV1,
	)
	if err != nil {
		t.Fatal(err)
	}
	if rankings.pool != queryRuntime.results ||
		candidates.pool != queryRuntime.results ||
		rankings.executor != queryRuntime.executor ||
		candidates.executor != queryRuntime.executor {
		t.Fatal("typed stores did not share one result pool and executor")
	}
	if queryRuntime.CollectionCache() != queryRuntime.collection {
		t.Fatal("runtime did not expose its one collection cache")
	}
	if queryRuntime.results.values.limits != (Limits{
		MaxCost: 190 * megabyte, MaxItems: 512, MaxItemCost: 32 * megabyte,
	}) {
		t.Fatalf("result limits = %+v", queryRuntime.results.values.limits)
	}
	if queryRuntime.collection.positive.limits != (Limits{
		MaxCost: 64 * megabyte, MaxItems: 4096, MaxItemCost: 8 * megabyte,
	}) {
		t.Fatalf("positive limits = %+v", queryRuntime.collection.positive.limits)
	}
	if queryRuntime.collection.negative.limits != (Limits{
		MaxCost: 2 * megabyte, MaxItems: 4096, MaxItemCost: 4096,
	}) {
		t.Fatalf("negative limits = %+v", queryRuntime.collection.negative.limits)
	}
	stats := queryRuntime.Stats()
	if stats != (QueryRuntimeStats{}) ||
		rankings.Stats() != stats.Result ||
		candidates.Stats() != stats.Result {
		t.Fatalf("initial aggregate stats = %+v", stats)
	}
}

func TestQueryRuntimeResultPoolUsesGlobalCapacityAndCrossOperationLRU(t *testing.T) {
	config := DefaultQueryRuntimeConfig()
	config.Result = ResultConfig{
		Limits:      Limits{MaxCost: 100, MaxItems: 3, MaxItemCost: 60},
		LoadTimeout: time.Second,
	}
	rankingBinding := mustResultBinding(
		t,
		OperationRankingsV1,
		cloneResultCore,
		func(value resultCore) int64 { return int64(len(value.IDs) * 8) },
	)
	candidateBinding := mustResultBinding(
		t,
		OperationCandidatesV1,
		func(value string) string { return value },
		func(value string) int64 { return int64(len(value)) },
	)
	queryRuntime, err := NewQueryRuntime(config, rankingBinding, candidateBinding)
	if err != nil {
		t.Fatal(err)
	}
	rankings, err := NewSharedResultStore[resultCore](
		queryRuntime,
		OperationRankingsV1,
	)
	if err != nil {
		t.Fatal(err)
	}
	candidates, err := NewSharedResultStore[string](
		queryRuntime,
		OperationCandidatesV1,
	)
	if err != nil {
		t.Fatal(err)
	}
	rankingKey := resultKeyForOperation(t, OperationRankingsV1, 1)
	candidateA := resultKeyForOperation(t, OperationCandidatesV1, 2)
	candidateB := resultKeyForOperation(t, OperationCandidatesV1, 3)
	value, err := rankings.GetOrCompute(
		context.Background(),
		rankingKey,
		func(context.Context) (resultCore, error) {
			return resultCore{IDs: []int64{1, 2, 3, 4, 5}}, nil
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	fortyBytes := strings.Repeat("x", 40)
	if _, err := candidates.GetOrCompute(
		context.Background(),
		candidateA,
		func(context.Context) (string, error) { return fortyBytes, nil },
	); err != nil {
		t.Fatal(err)
	}
	value.IDs[0] = 99
	if cached, found := rankings.Get(rankingKey); !found ||
		!slices.Equal(cached.IDs, []int64{1, 2, 3, 4, 5}) {
		t.Fatalf("immutable core = %+v, found=%t", cached, found)
	}
	if _, err := candidates.GetOrCompute(
		context.Background(),
		candidateB,
		func(context.Context) (string, error) { return fortyBytes, nil },
	); err != nil {
		t.Fatal(err)
	}
	if _, found := candidates.Get(candidateA); found {
		t.Fatal("global LRU retained the colder cross-operation entry")
	}
	if _, found := rankings.Get(rankingKey); !found {
		t.Fatal("global LRU evicted the promoted ranking entry")
	}
	stats := queryRuntime.Stats()
	if stats.Result.Items != 2 ||
		stats.Result.Cost != 80 ||
		stats.Result.Evictions != 1 ||
		rankings.Stats() != stats.Result ||
		candidates.Stats() != stats.Result {
		t.Fatalf("aggregate result stats = %+v", stats.Result)
	}
}

func TestQueryRuntimeResultPoolEnforcesOneCrossOperationItemLimit(t *testing.T) {
	config := DefaultQueryRuntimeConfig()
	config.Result = ResultConfig{
		Limits:      Limits{MaxCost: 1000, MaxItems: 2, MaxItemCost: 500},
		LoadTimeout: time.Second,
	}
	rankingBinding := mustResultBinding(
		t,
		OperationRankingsV1,
		cloneResultCore,
		func(resultCore) int64 { return 8 },
	)
	candidateBinding := mustResultBinding(
		t,
		OperationCandidatesV1,
		func(value string) string { return value },
		func(string) int64 { return 8 },
	)
	queryRuntime, err := NewQueryRuntime(config, rankingBinding, candidateBinding)
	if err != nil {
		t.Fatal(err)
	}
	rankings, err := NewSharedResultStore[resultCore](
		queryRuntime,
		OperationRankingsV1,
	)
	if err != nil {
		t.Fatal(err)
	}
	candidates, err := NewSharedResultStore[string](
		queryRuntime,
		OperationCandidatesV1,
	)
	if err != nil {
		t.Fatal(err)
	}
	oldRanking := resultKeyForOperation(t, OperationRankingsV1, 40)
	candidate := resultKeyForOperation(t, OperationCandidatesV1, 41)
	newRanking := resultKeyForOperation(t, OperationRankingsV1, 42)
	if _, err := rankings.GetOrCompute(
		context.Background(),
		oldRanking,
		func(context.Context) (resultCore, error) {
			return resultCore{IDs: []int64{1}}, nil
		},
	); err != nil {
		t.Fatal(err)
	}
	if _, err := candidates.GetOrCompute(
		context.Background(),
		candidate,
		func(context.Context) (string, error) { return "candidate", nil },
	); err != nil {
		t.Fatal(err)
	}
	if _, err := rankings.GetOrCompute(
		context.Background(),
		newRanking,
		func(context.Context) (resultCore, error) {
			return resultCore{IDs: []int64{2}}, nil
		},
	); err != nil {
		t.Fatal(err)
	}
	if _, found := rankings.Get(oldRanking); found {
		t.Fatal("global item limit did not evict the cross-operation LRU")
	}
	stats := queryRuntime.Stats().Result
	if stats.Items != 2 || stats.Cost != 16 || stats.Evictions != 1 {
		t.Fatalf("global item-limit stats = %+v", stats)
	}
}

func TestQueryRuntimeSharesCollectionPositiveNegativeAndDetachedLoad(t *testing.T) {
	config := DefaultQueryRuntimeConfig()
	config.Collection.Now = func() time.Time {
		return time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
	}
	queryRuntime, err := NewQueryRuntime(config)
	if err != nil {
		t.Fatal(err)
	}
	cache := queryRuntime.CollectionCache()
	alias := queryRuntime.CollectionCache()
	if cache == nil || alias != cache || alias.loads != cache.loads {
		t.Fatal("runtime did not retain one collection and detached-load owner")
	}
	key, err := NewCollectionKey("Alice", "anime", []string{"completed"})
	if err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int64
	fetch := func(ctx context.Context) (CollectionSnapshot, error) {
		calls.Add(1)
		return CollectionSnapshot{Items: []CollectionItem{}}, nil
	}
	if _, err := cache.Get(context.Background(), key, false, fetch); err != nil {
		t.Fatal(err)
	}
	if _, err := alias.Get(context.Background(), key, false, fetch); err != nil {
		t.Fatal(err)
	}
	notFoundKey, err := NewCollectionKey(
		"Missing",
		"anime",
		[]string{"completed"},
	)
	if err != nil {
		t.Fatal(err)
	}
	notFound, err := NewCollectionFailure(FailureNotFound, errors.New("not found"))
	if err != nil {
		t.Fatal(err)
	}
	var notFoundCalls atomic.Int64
	for index := 0; index < 2; index++ {
		_, callErr := []*CollectionCache{cache, alias}[index].Get(
			context.Background(),
			notFoundKey,
			false,
			func(context.Context) (CollectionSnapshot, error) {
				notFoundCalls.Add(1)
				return CollectionSnapshot{}, notFound
			},
		)
		var failure *CollectionFailure
		if !errors.As(callErr, &failure) || failure.Kind() != FailureNotFound {
			t.Fatalf("not-found call %d = %v", index, callErr)
		}
	}
	stats := queryRuntime.Stats()
	if calls.Load() != 1 ||
		notFoundCalls.Load() != 1 ||
		stats.CollectionPositive.Items != 1 ||
		stats.CollectionNegative.Items != 1 ||
		stats.Result.Items != 0 ||
		stats.Executor.Started != 0 {
		t.Fatalf("aggregate collection stats = %+v", stats)
	}
}

func TestQueryRuntimeExecutorBoundsMixedOperationsTogether(t *testing.T) {
	rankingBinding := mustResultBinding(
		t,
		OperationRankingsV1,
		cloneResultCore,
		func(resultCore) int64 { return 8 },
	)
	candidateBinding := mustResultBinding(
		t,
		OperationCandidatesV1,
		func(value string) string { return value },
		func(string) int64 { return 8 },
	)
	coStarBinding := mustResultBinding(
		t,
		OperationCoStarV1,
		func(value string) string { return value },
		func(string) int64 { return 8 },
	)
	queryRuntime, err := NewQueryRuntime(
		DefaultQueryRuntimeConfig(),
		rankingBinding,
		candidateBinding,
		coStarBinding,
	)
	if err != nil {
		t.Fatal(err)
	}
	rankings, err := NewSharedResultStore[resultCore](
		queryRuntime,
		OperationRankingsV1,
	)
	if err != nil {
		t.Fatal(err)
	}
	candidates, err := NewSharedResultStore[string](
		queryRuntime,
		OperationCandidatesV1,
	)
	if err != nil {
		t.Fatal(err)
	}
	coStar, err := NewSharedResultStore[string](
		queryRuntime,
		OperationCoStarV1,
	)
	if err != nil {
		t.Fatal(err)
	}
	rankingKeys := make([]ResultKey, 5)
	candidateKeys := make([]ResultKey, 5)
	for index := 0; index < 5; index++ {
		rankingKeys[index] = resultKeyForOperation(
			t,
			OperationRankingsV1,
			10+index*2,
		)
		candidateKeys[index] = resultKeyForOperation(
			t,
			OperationCandidatesV1,
			11+index*2,
		)
	}

	release := make(chan struct{})
	var releaseOnce sync.Once
	releaseAll := func() { releaseOnce.Do(func() { close(release) }) }
	defer releaseAll()
	started := make(chan struct{}, 10)
	outcomes := make(chan error, 10)
	for index := 0; index < 5; index++ {
		index := index
		go func() {
			_, callErr := rankings.GetOrCompute(
				context.Background(),
				rankingKeys[index],
				func(context.Context) (resultCore, error) {
					started <- struct{}{}
					<-release
					return resultCore{IDs: []int64{int64(index)}}, nil
				},
			)
			outcomes <- callErr
		}()
		go func() {
			_, callErr := candidates.GetOrCompute(
				context.Background(),
				candidateKeys[index],
				func(context.Context) (string, error) {
					started <- struct{}{}
					<-release
					return fmt.Sprintf("candidate-%d", index), nil
				},
			)
			outcomes <- callErr
		}()
	}
	waitFor(t, time.Second, func() bool {
		stats := queryRuntime.Stats().Executor
		return stats.Running == 2 &&
			stats.Queued == 8 &&
			len(started) == 2
	})
	if len(started) != 2 {
		t.Fatalf("started work = %d, want 2", len(started))
	}
	var overflowStarted atomic.Bool
	_, err = coStar.GetOrCompute(
		context.Background(),
		resultKeyForOperation(t, OperationCoStarV1, 30),
		func(context.Context) (string, error) {
			overflowStarted.Store(true)
			return "overflow", nil
		},
	)
	if code, ok := ErrorCode(err); !ok || code != CodeServerBusy {
		t.Fatalf("overflow = %v, code=%q, ok=%t", err, code, ok)
	}
	if overflowStarted.Load() {
		t.Fatal("overflow computation started")
	}
	releaseAll()
	for index := 0; index < 10; index++ {
		if callErr := <-outcomes; callErr != nil {
			t.Fatal(callErr)
		}
	}
	stats := queryRuntime.Stats()
	if stats.Executor.Running != 0 ||
		stats.Executor.Queued != 0 ||
		stats.Executor.Started != 10 ||
		stats.Executor.Rejected != 1 ||
		stats.Result.Items != 10 {
		t.Fatalf("final aggregate stats = %+v", stats)
	}
}

func resultKeyForOperation(
	t *testing.T,
	operation Operation,
	identity int,
) ResultKey {
	t.Helper()
	key, err := NewGlobalResultKey(
		operation,
		fmt.Sprintf("dv1-%064x", identity),
		"q1:"+strings.Repeat("f", 64),
		EmptyInputDigestV1,
	)
	if err != nil {
		t.Fatalf("NewGlobalResultKey: %v", err)
	}
	return key
}

func mustResultBinding[V any](
	t *testing.T,
	operation Operation,
	clone CloneFunc[V],
	cost CostFunc[V],
) ResultBinding {
	t.Helper()
	binding, err := NewResultBinding(operation, clone, cost)
	if err != nil {
		t.Fatalf("NewResultBinding: %v", err)
	}
	return binding
}

func mustResultKey(t *testing.T, fill string) ResultKey {
	t.Helper()
	key, err := NewGlobalResultKey(
		OperationRankingsV1,
		"dv1-"+stringsOf(fill, 64),
		"q1:"+stringsOf("f", 64),
		EmptyInputDigestV1,
	)
	if err != nil {
		t.Fatalf("NewGlobalResultKey: %v", err)
	}
	return key
}

func stringsOf(value string, count int) string {
	result := ""
	for index := 0; index < count; index++ {
		result += value
	}
	return result
}
