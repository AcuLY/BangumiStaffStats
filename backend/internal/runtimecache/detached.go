package runtimecache

import (
	"context"
	"time"

	"golang.org/x/sync/singleflight"
)

type sharedValue[V any] struct {
	value V
}

// DetachedGroup coalesces same-key work while giving the shared function a
// timeout independent from every waiter.
type DetachedGroup[K comparable, V any] struct {
	group   singleflight.Group
	timeout time.Duration
	key     func(K) string
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

	result := group.group.DoChan(group.key(key), func() (any, error) {
		workerContext, cancel := context.WithTimeout(context.Background(), group.timeout)
		defer cancel()
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
		return zero, contextOutcome(ctx)
	case completed := <-result:
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
