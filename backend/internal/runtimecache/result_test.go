package runtimecache

import (
	"context"
	"errors"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type resultCore struct {
	IDs []int64
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
		if calls.Add(1) == 1 {
			close(started)
		}
		select {
		case <-release:
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
	go func() {
		value, callErr := store.GetOrCompute(context.Background(), key, compute)
		first <- outcome{value: value, err: callErr}
	}()
	<-started
	go func() {
		value, callErr := store.GetOrCompute(context.Background(), key, compute)
		second <- outcome{value: value, err: callErr}
	}()
	waitFor(t, time.Second, func() bool {
		return calls.Load() == 1
	})
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
