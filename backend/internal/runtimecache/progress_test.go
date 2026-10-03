package runtimecache

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/querytiming"
)

func TestSharedProgressReplayIsolationAndCancellation(t *testing.T) {
	group, _ := NewDetachedGroup[string, int](time.Second, func(key string) string { return key })
	firstUpdates, secondUpdates, otherUpdates := make(chan querytiming.Progress, 8), make(chan querytiming.Progress, 8), make(chan querytiming.Progress, 8)
	observer := func(ch chan querytiming.Progress) func(querytiming.Progress) {
		return func(p querytiming.Progress) { ch <- p }
	}
	firstCtx, cancel := context.WithCancel(querytiming.WithProgress(context.Background(), observer(firstUpdates)))
	release, started := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	work := func(ctx context.Context) (int, error) {
		calls.Add(1)
		querytiming.Report(ctx, "compute", "共享分析")
		close(started)
		<-release
		querytiming.Report(ctx, "aggregate", "共享汇总")
		return 7, nil
	}
	firstDone, secondDone := make(chan struct{}), make(chan struct{})
	go func() { defer close(firstDone); group.Do(firstCtx, "same", work) }()
	<-started
	go func() {
		defer close(secondDone)
		group.Do(querytiming.WithProgress(context.Background(), observer(secondUpdates)), "same", work)
	}()
	select {
	case p := <-secondUpdates:
		if p.Message != "共享分析" {
			t.Fatal(p)
		}
	case <-time.After(time.Second):
		t.Fatal("latest phase not replayed")
	}
	group.Do(querytiming.WithProgress(context.Background(), observer(otherUpdates)), "other", func(ctx context.Context) (int, error) {
		querytiming.Report(ctx, "compute", "独立分析")
		return 3, nil
	})
	cancel()
	<-firstDone
	close(release)
	<-secondDone
	if calls.Load() != 1 {
		t.Fatal("duplicate shared worker")
	}
	if len(firstUpdates) != 1 {
		t.Fatal("canceled waiter received more progress")
	}
	if p := <-secondUpdates; p.Message != "共享汇总" {
		t.Fatal(p)
	}
	if len(otherUpdates) != 1 || (<-otherUpdates).Message != "独立分析" {
		t.Fatal("cross-key progress leak")
	}
	for deadline := time.Now().Add(time.Second); group.pending.Load() != 0 && time.Now().Before(deadline); {
		time.Sleep(time.Millisecond)
	}
	group.progressMu.Lock()
	defer group.progressMu.Unlock()
	if len(group.progress) != 0 {
		t.Fatal("completed progress retained")
	}
}

func TestProgressNestedDetachedWorkDoesNotHoldGroupLock(t *testing.T) {
	group, _ := NewDetachedGroup[string, int](time.Second, func(key string) string { return key })
	updates := make(chan querytiming.Progress, 8)
	ctx := querytiming.WithProgress(context.Background(), func(p querytiming.Progress) { updates <- p })
	done := make(chan error, 1)
	go func() {
		_, err := group.Do(ctx, "outer", func(outer context.Context) (int, error) {
			return group.Do(outer, "inner", func(inner context.Context) (int, error) {
				querytiming.Report(inner, "compute", "嵌套分析")
				return 1, nil
			})
		})
		done <- err
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("nested progress deadlocked")
	}
	if len(updates) != 1 {
		t.Fatal("nested stage not forwarded")
	}
}

func TestLateProgressReplayCannotRegressLiveState(t *testing.T) {
	updates := make(chan querytiming.Progress, 2)
	subscriber := &progressSubscriber{ctx: context.Background(), observer: func(p querytiming.Progress) { updates <- p }}
	// Model the worker publishing after the joiner reads latest but before its
	// replay callback can acquire admission. Only the new live stage survives.
	subscriber.deliver(2, querytiming.Progress{Phase: "aggregate", Message: "正在汇总"})
	subscriber.deliver(1, querytiming.Progress{Phase: "compute", Message: "正在计算"})
	if len(updates) != 1 || (<-updates).Phase != "aggregate" {
		t.Fatal("late replay regressed live progress")
	}
}

func TestProgressCacheHitsSkipFetchAndComputation(t *testing.T) {
	collectionCache, err := NewCollectionCache(DefaultCollectionConfig())
	if err != nil {
		t.Fatal(err)
	}
	collectionKey, _ := NewCollectionKey("__synthetic_cache__", "anime", []string{"completed"})
	if _, err = collectionCache.Get(context.Background(), collectionKey, func(context.Context) (CollectionSnapshot, error) { return CollectionSnapshot{}, nil }); err != nil {
		t.Fatal(err)
	}
	var stages []querytiming.Progress
	ctx := querytiming.WithProgress(context.Background(), func(p querytiming.Progress) { stages = append(stages, p) })
	_, err = collectionCache.Get(ctx, collectionKey, func(context.Context) (CollectionSnapshot, error) {
		t.Fatal("cache hit fetched upstream")
		return CollectionSnapshot{}, nil
	})
	if err != nil || stages[len(stages)-1].Phase != "collection_cache" {
		t.Fatalf("%v %+v", err, stages)
	}
	executor, _ := NewExecutor(DefaultExecutorConfig())
	store, err := NewResultStore[int](DefaultResultConfig(), executor, func(v int) int { return v }, func(int) int64 { return 1 })
	if err != nil {
		t.Fatal(err)
	}
	key, _ := NewGlobalResultKey(OperationRankingsV1, "dv1-"+stringsOf("a", 64), "q1:"+stringsOf("b", 64), EmptyInputDigestV1)
	if _, err = store.GetOrCompute(context.Background(), key, func(context.Context) (int, error) { return 7, nil }); err != nil {
		t.Fatal(err)
	}
	stages = nil
	value, err := store.GetOrCompute(ctx, key, func(context.Context) (int, error) { t.Fatal("cache hit recomputed"); return 0, nil })
	if err != nil || value != 7 || stages[len(stages)-1].Message != "已命中分析结果缓存" {
		t.Fatalf("%v %d %+v", err, value, stages)
	}
}
