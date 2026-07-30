package runtimecache

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestDetachedGroupWaiterCancellationDoesNotCancelSharedWork(t *testing.T) {
	group, err := NewDetachedGroup[string, int](time.Second, func(key string) string {
		return key
	})
	if err != nil {
		t.Fatalf("NewDetachedGroup: %v", err)
	}

	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int64
	work := func(ctx context.Context) (int, error) {
		if calls.Add(1) == 1 {
			close(started)
		}
		select {
		case <-release:
			return 42, nil
		case <-ctx.Done():
			return 0, ctx.Err()
		}
	}

	cancelContext, cancel := context.WithCancel(context.Background())
	type outcome struct {
		value int
		err   error
	}
	first := make(chan outcome, 1)
	second := make(chan outcome, 1)
	go func() {
		value, callErr := group.Do(cancelContext, "same", work)
		first <- outcome{value: value, err: callErr}
	}()
	<-started
	go func() {
		value, callErr := group.Do(context.Background(), "same", work)
		second <- outcome{value: value, err: callErr}
	}()
	time.Sleep(10 * time.Millisecond)
	cancel()
	cancelled := <-first
	if code, ok := ErrorCode(cancelled.err); !ok || code != CodeCanceled ||
		!errors.Is(cancelled.err, context.Canceled) {
		t.Fatalf("cancel outcome = %v, code=%q, ok=%v", cancelled.err, code, ok)
	}
	close(release)
	completed := <-second
	if completed.err != nil || completed.value != 42 {
		t.Fatalf("shared outcome = %+v", completed)
	}
	if calls.Load() != 1 {
		t.Fatalf("work calls = %d, want 1", calls.Load())
	}
}

func TestDetachedGroupTimeoutAllowsLaterRetry(t *testing.T) {
	group, err := NewDetachedGroup[string, int](20*time.Millisecond, func(key string) string {
		return key
	})
	if err != nil {
		t.Fatalf("NewDetachedGroup: %v", err)
	}
	_, err = group.Do(context.Background(), "key", func(ctx context.Context) (int, error) {
		<-ctx.Done()
		return 0, ctx.Err()
	})
	if code, ok := ErrorCode(err); !ok || code != CodeTimeout ||
		!errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("timeout = %v, code=%q, ok=%v", err, code, ok)
	}
	value, err := group.Do(context.Background(), "key", func(context.Context) (int, error) {
		return 7, nil
	})
	if err != nil || value != 7 {
		t.Fatalf("retry = %d, %v", value, err)
	}
}

func TestDetachedGroupDoesNotCoalesceDifferentKeys(t *testing.T) {
	group, err := NewDetachedGroup[string, string](time.Second, func(key string) string {
		return key
	})
	if err != nil {
		t.Fatalf("NewDetachedGroup: %v", err)
	}
	release := make(chan struct{})
	started := make(chan string, 2)
	var wait sync.WaitGroup
	for _, key := range []string{"a", "b"} {
		key := key
		wait.Add(1)
		go func() {
			defer wait.Done()
			value, callErr := group.Do(context.Background(), key, func(context.Context) (string, error) {
				started <- key
				<-release
				return key, nil
			})
			if callErr != nil || value != key {
				t.Errorf("%s outcome = %q, %v", key, value, callErr)
			}
		}()
	}
	seen := map[string]bool{<-started: true, <-started: true}
	if !seen["a"] || !seen["b"] {
		t.Fatalf("different keys did not run independently: %+v", seen)
	}
	close(release)
	wait.Wait()
}

func TestExecutorTwoRunningEightQueuedAndBusy(t *testing.T) {
	executor, err := NewExecutor(DefaultExecutorConfig())
	if err != nil {
		t.Fatalf("NewExecutor: %v", err)
	}
	release := make(chan struct{})
	started := make(chan struct{}, 10)
	errorsOut := make(chan error, 10)
	for index := 0; index < 10; index++ {
		go func() {
			errorsOut <- executor.Do(context.Background(), func(context.Context) error {
				started <- struct{}{}
				<-release
				return nil
			})
		}()
	}
	waitFor(t, time.Second, func() bool {
		stats := executor.Stats()
		return stats.Running == 2 && stats.Queued == 8
	})
	if len(started) != 2 {
		t.Fatalf("started work = %d, want 2", len(started))
	}
	var overflowStarted atomic.Bool
	err = executor.Do(context.Background(), func(context.Context) error {
		overflowStarted.Store(true)
		return nil
	})
	if code, ok := ErrorCode(err); !ok || code != CodeServerBusy {
		t.Fatalf("overflow = %v, code=%q, ok=%v", err, code, ok)
	}
	var cacheError *Error
	if !errors.As(err, &cacheError) || cacheError.RetryAfter() != time.Second {
		t.Fatalf("retry guidance = %v", err)
	}
	if overflowStarted.Load() {
		t.Fatal("overflow work started")
	}
	close(release)
	for index := 0; index < 10; index++ {
		if callErr := <-errorsOut; callErr != nil {
			t.Fatalf("admitted work failed: %v", callErr)
		}
	}
	stats := executor.Stats()
	if stats.Started != 10 || stats.Rejected != 1 ||
		stats.Running != 0 || stats.Queued != 0 {
		t.Fatalf("unexpected final stats: %+v", stats)
	}
}

func TestExecutorQueuedCancellationDoesNotStartWork(t *testing.T) {
	executor, err := NewExecutor(ExecutorConfig{
		RunningLimit: 1,
		QueueLimit:   1,
		RetryAfter:   time.Second,
	})
	if err != nil {
		t.Fatalf("NewExecutor: %v", err)
	}
	release := make(chan struct{})
	firstDone := make(chan error, 1)
	go func() {
		firstDone <- executor.Do(context.Background(), func(context.Context) error {
			<-release
			return nil
		})
	}()
	waitFor(t, time.Second, func() bool {
		return executor.Stats().Running == 1
	})
	queuedContext, cancel := context.WithCancel(context.Background())
	var queuedStarted atomic.Bool
	queuedDone := make(chan error, 1)
	go func() {
		queuedDone <- executor.Do(queuedContext, func(context.Context) error {
			queuedStarted.Store(true)
			return nil
		})
	}()
	waitFor(t, time.Second, func() bool {
		return executor.Stats().Queued == 1
	})
	cancel()
	err = <-queuedDone
	if code, ok := ErrorCode(err); !ok || code != CodeCanceled {
		t.Fatalf("queued cancellation = %v, code=%q, ok=%v", err, code, ok)
	}
	if queuedStarted.Load() {
		t.Fatal("canceled queued work started")
	}
	close(release)
	if err := <-firstDone; err != nil {
		t.Fatalf("first work: %v", err)
	}
}

func waitFor(t *testing.T, timeout time.Duration, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for !condition() {
		if time.Now().After(deadline) {
			t.Fatal("condition did not become true")
		}
		time.Sleep(time.Millisecond)
	}
}
