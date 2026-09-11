package app

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
)

const archiveUpdateTimeout = 6 * time.Hour

var archiveScheduleZone = time.FixedZone("UTC+8", 8*60*60)

// ArchiveUpdateResult is the bounded app-facing outcome of one builder run.
type ArchiveUpdateResult struct {
	Status observability.UpdateStatus
	Phase  observability.UpdatePhase
}

// ArchiveActivator installs one already-open builder candidate.
type ArchiveActivator func(context.Context, ArchiveActivation) error

// ArchiveUpdateRunner is the sole small boundary to the embedded Go builder.
type ArchiveUpdateRunner interface {
	RunOnce(context.Context, ArchiveActivator) (ArchiveUpdateResult, error)
}

type archiveScheduler struct {
	runner  ArchiveUpdateRunner
	runtime *httpapi.RuntimeObservability
	nextID  atomic.Uint64
}

func (scheduler *archiveScheduler) Run(
	ctx context.Context,
	activate ArchiveActivator,
) {
	if scheduler == nil || scheduler.runner == nil || scheduler.runtime == nil ||
		ctx == nil || activate == nil {
		return
	}
	scheduler.runOnce(ctx, activate)
	for {
		now := time.Now()
		timer := time.NewTimer(nextArchiveUpdate(now).Sub(now))
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			return
		case <-timer.C:
			scheduler.runOnce(ctx, activate)
		}
	}
}

func (scheduler *archiveScheduler) runOnce(
	ctx context.Context,
	activate ArchiveActivator,
) {
	startedAt := time.Now().UTC()
	runID := fmt.Sprintf("run-%016x", scheduler.nextID.Add(1))
	_ = scheduler.runtime.BeginArchiveUpdate(runID, startedAt)
	runContext, cancel := context.WithTimeout(ctx, archiveUpdateTimeout)
	result, err := scheduler.runner.RunOnce(runContext, activate)
	cancel()
	status := result.Status
	phase := result.Phase
	if phase == "" {
		phase = observability.UpdatePhaseFreshness
	}
	if err != nil {
		status = observability.UpdateStatusFailed
		if errors.Is(err, context.Canceled) ||
			errors.Is(err, context.DeadlineExceeded) {
			status = observability.UpdateStatusCanceled
		}
	}
	if status != observability.UpdateStatusNoChange &&
		status != observability.UpdateStatusActivated &&
		status != observability.UpdateStatusFailed &&
		status != observability.UpdateStatusCanceled {
		status = observability.UpdateStatusFailed
	}
	_ = scheduler.runtime.FinishArchiveUpdate(
		runID,
		time.Now().UTC(),
		status,
		phase,
	)
}

func nextArchiveUpdate(now time.Time) time.Time {
	local := now.In(archiveScheduleZone)
	days := (int(time.Sunday) - int(local.Weekday()) + 7) % 7
	next := time.Date(
		local.Year(),
		local.Month(),
		local.Day()+days,
		4,
		15,
		0,
		0,
		archiveScheduleZone,
	)
	if !next.After(local) {
		next = next.AddDate(0, 0, 7)
	}
	return next
}
