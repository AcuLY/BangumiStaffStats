package query

import (
	"context"
	"errors"
	"reflect"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
)

func TestLoadCachedFactSetCoalescesAndReusesCompleteValue(t *testing.T) {
	store := new(archive.Store)
	key := factSetCacheKey{store: store, subjectType: "anime"}
	factSets.Delete(key)
	t.Cleanup(func() { factSets.Delete(key) })

	want := cacheTestFactSet(101)
	started := make(chan struct{})
	release := make(chan struct{})
	var loads atomic.Int64
	loader := func(context.Context, *archive.Store, string) (FactSet, error) {
		if loads.Add(1) == 1 {
			close(started)
		}
		<-release
		return want, nil
	}

	const callers = 8
	start := make(chan struct{})
	results := make(chan FactSet, callers)
	errors := make(chan error, callers)
	var wait sync.WaitGroup
	for range callers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			facts, err := loadCachedFactSet(context.Background(), store, "anime", loader)
			results <- facts
			errors <- err
		}()
	}
	close(start)
	<-started
	close(release)
	wait.Wait()
	close(results)
	close(errors)

	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	for facts := range results {
		if !reflect.DeepEqual(facts, want) {
			t.Fatalf("cached facts = %+v, want %+v", facts, want)
		}
		if &facts.Subjects[0] != &want.Subjects[0] ||
			&facts.StaffCredits[0] != &want.StaffCredits[0] ||
			&facts.CastCredits[0] != &want.CastCredits[0] ||
			&facts.Plans[0] != &want.Plans[0] {
			t.Fatal("cached load did not reuse the complete immutable value")
		}
	}
	if loads.Load() != 1 {
		t.Fatalf("concurrent loads = %d, want 1", loads.Load())
	}

	again, err := loadCachedFactSet(context.Background(), store, "anime", loader)
	if err != nil || !reflect.DeepEqual(again, want) || loads.Load() != 1 {
		t.Fatalf("sequential cache result = %+v, %v; loads = %d", again, err, loads.Load())
	}
}

func TestLoadCachedFactSetSeparatesStoreAndSubjectType(t *testing.T) {
	storeA := new(archive.Store)
	storeB := new(archive.Store)
	keys := []factSetCacheKey{
		{store: storeA, subjectType: "anime"},
		{store: storeA, subjectType: "game"},
		{store: storeB, subjectType: "anime"},
	}
	for _, key := range keys {
		factSets.Delete(key)
	}
	t.Cleanup(func() {
		for _, key := range keys {
			factSets.Delete(key)
		}
	})

	var loads atomic.Int64
	loader := func(_ context.Context, store *archive.Store, subjectType string) (FactSet, error) {
		loads.Add(1)
		switch {
		case store == storeA && subjectType == "anime":
			return cacheTestFactSet(1), nil
		case store == storeA && subjectType == "game":
			return cacheTestFactSet(2), nil
		case store == storeB && subjectType == "anime":
			return cacheTestFactSet(3), nil
		default:
			return FactSet{}, errors.New("unexpected cache key")
		}
	}

	for index, key := range keys {
		for range 2 {
			facts, err := loadCachedFactSet(context.Background(), key.store, key.subjectType, loader)
			if err != nil {
				t.Fatal(err)
			}
			if facts.Subjects[0].SubjectID != int64(index+1) {
				t.Fatalf("key %d subject = %d, want %d", index, facts.Subjects[0].SubjectID, index+1)
			}
		}
	}
	if loads.Load() != int64(len(keys)) {
		t.Fatalf("isolated key loads = %d, want %d", loads.Load(), len(keys))
	}
}

func TestCanceledFactSetWaiterDoesNotStopOrDeleteSharedLoad(t *testing.T) {
	store := new(archive.Store)
	key := factSetCacheKey{store: store, subjectType: "anime"}
	factSets.Delete(key)
	t.Cleanup(func() { factSets.Delete(key) })

	started := make(chan struct{})
	release := make(chan struct{})
	winnerDone := make(chan error, 1)
	var loads atomic.Int64
	loader := func(context.Context, *archive.Store, string) (FactSet, error) {
		loads.Add(1)
		close(started)
		<-release
		return cacheTestFactSet(4), nil
	}
	go func() {
		_, err := loadCachedFactSet(context.Background(), store, "anime", loader)
		winnerDone <- err
	}()
	<-started

	waiterContext, cancelWaiter := context.WithCancelCause(context.Background())
	waiterCause := errors.New("waiter canceled")
	observedWaiterContext := &observedDoneContext{
		Context:  waiterContext,
		observed: make(chan struct{}),
	}
	waiterDone := make(chan error, 1)
	go func() {
		_, err := loadCachedFactSet(observedWaiterContext, store, "anime", loader)
		waiterDone <- err
	}()
	<-observedWaiterContext.observed
	cancelWaiter(waiterCause)
	if err := <-waiterDone; !errors.Is(err, waiterCause) {
		t.Fatalf("waiter error = %v, want %v", err, waiterCause)
	}

	close(release)
	if err := <-winnerDone; err != nil {
		t.Fatalf("winner error = %v", err)
	}
	facts, err := loadCachedFactSet(context.Background(), store, "anime", loader)
	if err != nil || facts.Subjects[0].SubjectID != 4 || loads.Load() != 1 {
		t.Fatalf("post-waiter cache = %+v, %v; loads = %d", facts, err, loads.Load())
	}
}

func TestCanceledFactSetWinnerPublishesNothingAndRetries(t *testing.T) {
	store := new(archive.Store)
	key := factSetCacheKey{store: store, subjectType: "anime"}
	factSets.Delete(key)
	t.Cleanup(func() { factSets.Delete(key) })

	started := make(chan struct{})
	release := make(chan struct{})
	var loads atomic.Int64
	loader := func(context.Context, *archive.Store, string) (FactSet, error) {
		if loads.Add(1) == 1 {
			close(started)
			<-release
		}
		return cacheTestFactSet(5), nil
	}
	winnerContext, cancelWinner := context.WithCancelCause(context.Background())
	winnerCause := errors.New("winner canceled")
	winnerDone := make(chan struct {
		facts FactSet
		err   error
	}, 1)
	go func() {
		facts, err := loadCachedFactSet(winnerContext, store, "anime", loader)
		winnerDone <- struct {
			facts FactSet
			err   error
		}{facts: facts, err: err}
	}()
	<-started
	waiterContext := &observedDoneContext{
		Context:  context.Background(),
		observed: make(chan struct{}),
	}
	waiterDone := make(chan error, 1)
	go func() {
		_, err := loadCachedFactSet(waiterContext, store, "anime", loader)
		waiterDone <- err
	}()
	<-waiterContext.observed
	cancelWinner(winnerCause)
	close(release)
	first := <-winnerDone
	if !errors.Is(first.err, winnerCause) || !reflect.DeepEqual(first.facts, FactSet{}) {
		t.Fatalf("canceled winner = %+v, %v", first.facts, first.err)
	}
	if _, found := factSets.Load(key); found {
		t.Fatal("canceled winner populated cache")
	}
	if err := <-waiterDone; !errors.Is(err, winnerCause) {
		t.Fatalf("winner cancellation waiter error = %v, want %v", err, winnerCause)
	}

	facts, err := loadCachedFactSet(context.Background(), store, "anime", loader)
	if err != nil || facts.Subjects[0].SubjectID != 5 || loads.Load() != 2 {
		t.Fatalf("retry after winner cancellation = %+v, %v; loads = %d", facts, err, loads.Load())
	}
}

func TestFailedFactSetLoadPublishesNothingAndRetries(t *testing.T) {
	store := new(archive.Store)
	key := factSetCacheKey{store: store, subjectType: "anime"}
	factSets.Delete(key)
	t.Cleanup(func() { factSets.Delete(key) })

	failure := errors.New("fact load failed")
	var loads atomic.Int64
	loader := func(context.Context, *archive.Store, string) (FactSet, error) {
		if loads.Add(1) == 1 {
			return cacheTestFactSet(6), failure
		}
		return cacheTestFactSet(7), nil
	}
	first, err := loadCachedFactSet(context.Background(), store, "anime", loader)
	if !errors.Is(err, failure) || !reflect.DeepEqual(first, FactSet{}) {
		t.Fatalf("failed load = %+v, %v", first, err)
	}
	if _, found := factSets.Load(key); found {
		t.Fatal("failed load populated cache")
	}

	second, err := loadCachedFactSet(context.Background(), store, "anime", loader)
	if err != nil || second.Subjects[0].SubjectID != 7 || loads.Load() != 2 {
		t.Fatalf("retry after failure = %+v, %v; loads = %d", second, err, loads.Load())
	}
}

func cacheTestFactSet(subjectID int64) FactSet {
	return FactSet{
		Subjects: []Subject{{
			SubjectID:     subjectID,
			SubjectType:   "anime",
			RatingBuckets: []RatingBucket{{Rating: 8, Count: 3}},
			Tags:          []SubjectTag{{Scope: "public", Name: "test"}},
		}},
		StaffCredits: []StaffCredit{{SubjectID: subjectID, PersonID: 11, PositionID: 2}},
		CastCredits:  []CastCredit{{SubjectID: subjectID, PersonID: 12, CharacterID: 13, RoleType: 1}},
		Plans: []SelectionPlan{{
			PositionKey:        "staffset:anime:test",
			RuleKind:           "staffSetUnion",
			MemberPositionKeys: []string{"staff:anime:2"},
		}},
	}
}

type observedDoneContext struct {
	context.Context
	observed chan struct{}
	once     sync.Once
}

func (c *observedDoneContext) Done() <-chan struct{} {
	c.once.Do(func() { close(c.observed) })
	return c.Context.Done()
}
