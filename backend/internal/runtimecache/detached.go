package runtimecache

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/querytiming"
	"golang.org/x/sync/singleflight"
)

type sharedValue[V any] struct {
	value V
}

// DetachedGroup coalesces same-key work while giving the shared function a
// timeout independent from every waiter.
type DetachedGroup[K comparable, V any] struct {
	pending    atomic.Int64
	progressMu sync.Mutex
	progress   map[string]*sharedProgress
	group      singleflight.Group
	timeout    time.Duration
	key        func(K) string
}

// NewDetachedGroup constructs an independent singleflight owner.
func NewDetachedGroup[K comparable, V any](
	timeout time.Duration,
	key func(K) string,
) (*DetachedGroup[K, V], error) {
	if timeout <= 0 || key == nil {
		return nil, outcome(CodeInvalidInput)
	}
	return &DetachedGroup[K, V]{timeout: timeout, key: key}, nil
}

// Do waits for detached same-key work. Cancelling a waiter does not cancel the
// shared operation.
func (group *DetachedGroup[K, V]) Do(
	ctx context.Context,
	key K,
	work func(context.Context) (V, error),
) (V, error) {
	var zero V
	if group == nil || work == nil || ctx == nil {
		return zero, outcome(CodeInvalidInput)
	}
	if err := contextOutcome(ctx); err != nil {
		return zero, err
	}

	group.pending.Add(1)
	identity := group.key(key)
	group.progressMu.Lock()
	if group.progress == nil {
		group.progress = make(map[string]*sharedProgress)
	}
	bus := group.progress[identity]
	if bus == nil {
		bus = &sharedProgress{subscribers: make(map[*int]*progressSubscriber)}
		group.progress[identity] = bus
	}
	token := new(int)
	observer := &progressSubscriber{ctx: ctx, observer: querytiming.ProgressObserver(ctx)}
	bus.subscribers[token] = observer
	bus.receipts++
	latest, sequence := bus.latest, bus.sequence
	group.progressMu.Unlock()
	if latest != nil {
		observer.deliver(sequence, *latest)
	}

	defer func() {
		group.progressMu.Lock()
		delete(bus.subscribers, token)
		group.progressMu.Unlock()
	}()

	// Register synchronously, before DoChan can schedule its callback. Each
	// caller owns one completion receipt, not one worker: canceled waiters leave
	// their receipt with a joiner until singleflight has published completion.
	finishReceipt := func() {
		group.progressMu.Lock()
		bus.receipts--
		if bus.receipts == 0 && group.progress[identity] == bus {
			delete(group.progress, identity)
		}
		group.progressMu.Unlock()
		group.pending.Add(-1)
	}
	result := group.group.DoChan(identity, func() (any, error) {
		workerContext, cancel := context.WithTimeout(context.Background(), group.timeout)
		defer cancel()
		workerContext = querytiming.WithProgress(workerContext, func(value querytiming.Progress) {
			group.progressMu.Lock()
			bus.latest = &value
			bus.sequence++
			sequence := bus.sequence
			observers := make([]*progressSubscriber, 0, len(bus.subscribers))
			for _, observer := range bus.subscribers {
				if observer != nil {
					observers = append(observers, observer)
				}
			}
			group.progressMu.Unlock()
			for _, observer := range observers {
				observer.deliver(sequence, value)
			}
		})

		value, err := work(workerContext)
		if err != nil {
			return nil, normalizeContextOutcome(workerContext, err)
		}
		if err := contextOutcome(workerContext); err != nil {
			return nil, err
		}
		return sharedValue[V]{value: value}, nil
	})

	select {
	case <-ctx.Done():
		go func() { <-result; finishReceipt() }()
		return zero, contextOutcome(ctx)
	case completed := <-result:
		finishReceipt()
		if completed.Err != nil {
			return zero, completed.Err
		}
		value, ok := completed.Val.(sharedValue[V])
		if !ok {
			return zero, outcome(CodeInvalidInput)
		}
		return value.value, nil
	}
}

type sharedProgress struct {
	subscribers map[*int]*progressSubscriber
	sequence    uint64
	latest      *querytiming.Progress
	receipts    int
}

// A late replay may race a newer live report after the bus lock is released.
// Sequence admission prevents that old snapshot from regressing this waiter.
// Callbacks are serialized per subscriber, never under the group mutex.
type progressSubscriber struct {
	mu       sync.Mutex
	ctx      context.Context
	observer func(querytiming.Progress)
	last     uint64
}

func (subscriber *progressSubscriber) deliver(sequence uint64, value querytiming.Progress) {
	if subscriber.observer == nil {
		return
	}
	subscriber.mu.Lock()
	defer subscriber.mu.Unlock()
	if sequence <= subscriber.last || subscriber.ctx.Err() != nil {
		return
	}
	subscriber.last = sequence
	subscriber.observer(value)
}
