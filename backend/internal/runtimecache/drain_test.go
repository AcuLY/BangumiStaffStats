package runtimecache

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func TestRuntimeDrainCoversPreScheduleCanceledCoalescedAndPublication(t *testing.T) {
	binding, _ := NewResultBinding(OperationRankingsV1, func(v int) int { return v }, func(int) int64 { return 1 })
	runtime, err := NewQueryRuntime(DefaultQueryRuntimeConfig(), binding)
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewSharedResultStore[int](runtime, OperationRankingsV1)
	if err != nil {
		t.Fatal(err)
	}
	entered, scheduled, callback, release := make(chan struct{}), make(chan struct{}), make(chan struct{}), make(chan struct{})
	store.loads.key = func(ResultKey) string { close(entered); <-scheduled; return "same" }
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	var calls atomic.Int32
	work := func(context.Context) (resultExecution[int], error) {
		calls.Add(1)
		close(callback)
		<-release
		return resultExecution[int]{value: 42}, nil
	}
	go func() { _, err := store.loads.Do(ctx, ResultKey{}, work); done <- err }()
	<-entered
	if runtime.Idle() {
		t.Error("idle before asynchronous scheduling")
	}
	cancel()
	close(scheduled)
	<-callback
	<-done
	if runtime.Idle() {
		t.Error("canceled final waiter hid pre-executor callback")
	}
	// Coalesced canceled callers cannot duplicate work or leak registrations.
	store2ctx, cancel2 := context.WithCancel(context.Background())
	observed := make(chan struct{})
	// First caller no longer accesses key; publication is still blocked.
	store.loads.key = func(ResultKey) string { close(observed); return "same" }
	go func() { _, err := store.loads.Do(store2ctx, ResultKey{}, work); done <- err }()
	<-observed
	cancel2()
	<-done
	if runtime.Idle() {
		t.Error("coalesced cancellation hid worker")
	}
	close(release)
	deadline := time.After(time.Second)
	for !runtime.Idle() {
		select {
		case <-deadline:
			t.Fatal("drain registration leaked")
		default:
			time.Sleep(time.Millisecond)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("computations=%d", calls.Load())
	}
}

func TestRuntimeDrainIncludesDetachedCollection(t *testing.T) {
	runtime, err := NewQueryRuntime(DefaultQueryRuntimeConfig())
	if err != nil {
		t.Fatal(err)
	}
	key, _ := NewCollectionKey("test", "anime", []string{"completed"})
	started, release := make(chan struct{}), make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		_, err := runtime.CollectionCache().Get(ctx, key, func(context.Context) (CollectionSnapshot, error) {
			close(started)
			<-release
			return CollectionSnapshot{}, nil
		})
		done <- err
	}()
	<-started
	cancel()
	<-done
	if runtime.Idle() {
		t.Error("detached collection hidden from drain")
	}
	close(release)
	deadline := time.After(time.Second)
	for !runtime.Idle() {
		select {
		case <-deadline:
			t.Fatal("collection registration leaked")
		default:
			time.Sleep(time.Millisecond)
		}
	}
}
