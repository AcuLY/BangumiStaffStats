package runtimecache

import (
	"context"
	"sync/atomic"
	"time"
)

const (
	DefaultRunningLimit = 2
	DefaultQueueLimit   = 8
	DefaultRetryAfter   = time.Second
)

// ExecutorConfig defines bounded expensive-computation admission.
type ExecutorConfig struct {
	RunningLimit int
	QueueLimit   int
	RetryAfter   time.Duration
}

// ExecutorStats is a lock-free operational snapshot.
type ExecutorStats struct {
	Running  int64
	Queued   int64
	Started  uint64
	Rejected uint64
}

// Executor admits a fixed number of running and queued computations.
type Executor struct {
	running    chan struct{}
	queue      chan struct{}
	retryAfter time.Duration
	active     atomic.Int64
	queued     atomic.Int64
	started    atomic.Uint64
	rejected   atomic.Uint64
}

// DefaultExecutorConfig returns the production two-running/eight-queued
// baseline.
func DefaultExecutorConfig() ExecutorConfig {
	return ExecutorConfig{
		RunningLimit: DefaultRunningLimit,
		QueueLimit:   DefaultQueueLimit,
		RetryAfter:   DefaultRetryAfter,
	}
}

// NewExecutor constructs an admission gate.
func NewExecutor(config ExecutorConfig) (*Executor, error) {
	if config.RunningLimit <= 0 ||
		config.QueueLimit < 0 ||
		config.RetryAfter <= 0 {
		return nil, outcome(CodeInvalidInput)
	}
	return &Executor{
		running:    make(chan struct{}, config.RunningLimit),
		queue:      make(chan struct{}, config.QueueLimit),
		retryAfter: config.RetryAfter,
	}, nil
}

// Do runs work after bounded admission. A full queue fails immediately.
func (executor *Executor) Do(
	ctx context.Context,
	work func(context.Context) error,
) error {
	if executor == nil || ctx == nil || work == nil {
		return outcome(CodeInvalidInput)
	}
	if err := contextOutcome(ctx); err != nil {
		return err
	}

	select {
	case executor.running <- struct{}{}:
		return executor.run(ctx, work)
	default:
	}

	select {
	case executor.queue <- struct{}{}:
		executor.queued.Add(1)
	default:
		executor.rejected.Add(1)
		return busyOutcome(executor.retryAfter)
	}

	select {
	case executor.running <- struct{}{}:
		<-executor.queue
		executor.queued.Add(-1)
		return executor.run(ctx, work)
	case <-ctx.Done():
		<-executor.queue
		executor.queued.Add(-1)
		return contextOutcome(ctx)
	}
}

// Stats returns current occupancy and cumulative admissions.
func (executor *Executor) Stats() ExecutorStats {
	if executor == nil {
		return ExecutorStats{}
	}
	return ExecutorStats{
		Running:  executor.active.Load(),
		Queued:   executor.queued.Load(),
		Started:  executor.started.Load(),
		Rejected: executor.rejected.Load(),
	}
}

func (executor *Executor) run(
	ctx context.Context,
	work func(context.Context) error,
) error {
	executor.active.Add(1)
	defer func() {
		executor.active.Add(-1)
		<-executor.running
	}()
	if err := contextOutcome(ctx); err != nil {
		return err
	}
	executor.started.Add(1)
	return normalizeContextOutcome(ctx, work(ctx))
}
