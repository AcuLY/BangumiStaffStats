package app

import (
	"bytes"
	"context"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
)

type archiveUpdateRunnerFunc func(
	context.Context,
	ArchiveActivator,
) (ArchiveUpdateResult, error)

func (runner archiveUpdateRunnerFunc) RunOnce(
	ctx context.Context,
	activate ArchiveActivator,
) (ArchiveUpdateResult, error) {
	return runner(ctx, activate)
}

func TestNextArchiveUpdateIsStrictlyFutureSundayAt0415UTC8(t *testing.T) {
	tests := []struct {
		now  string
		want string
	}{
		{now: "2026-09-05T20:14:59Z", want: "2026-09-05T20:15:00Z"},
		{now: "2026-09-05T20:15:00Z", want: "2026-09-12T20:15:00Z"},
		{now: "2026-09-06T00:00:00Z", want: "2026-09-12T20:15:00Z"},
	}
	for _, test := range tests {
		now, err := time.Parse(time.RFC3339, test.now)
		if err != nil {
			t.Fatal(err)
		}
		want, err := time.Parse(time.RFC3339, test.want)
		if err != nil {
			t.Fatal(err)
		}
		if got := nextArchiveUpdate(now); !got.Equal(want) {
			t.Errorf("nextArchiveUpdate(%s) = %s, want %s", now, got, want)
		}
	}
}

func TestSchedulerRunsStartupCheckOnceAndStopsOnCancellation(t *testing.T) {
	started := make(chan struct{}, 1)
	runner := archiveUpdateRunnerFunc(func(
		context.Context,
		ArchiveActivator,
	) (ArchiveUpdateResult, error) {
		started <- struct{}{}
		return ArchiveUpdateResult{
			Status: observability.UpdateStatusNoChange,
			Phase:  observability.UpdatePhaseFreshness,
		}, nil
	})
	var events bytes.Buffer
	runtime, err := httpapi.NewRuntimeObservability(&events)
	if err != nil {
		t.Fatal(err)
	}
	scheduler := &archiveScheduler{runner: runner, runtime: runtime}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		scheduler.Run(ctx, func(context.Context, ArchiveActivation) error {
			return nil
		})
	}()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("startup freshness check did not run")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("scheduler did not stop")
	}
	for _, value := range []string{
		`"event":"archive_update_started"`,
		`"event":"archive_update_no_change"`,
	} {
		if !strings.Contains(events.String(), value) {
			t.Fatalf("events lack %q: %s", value, events.String())
		}
	}
	metrics, err := runtime.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(
		string(metrics),
		`bgmss_archive_update_last_attempt_info{phase="freshness",status="no-change"} 1`,
	) {
		t.Fatalf("metrics lack no-change state: %s", metrics)
	}
}

func TestSchedulerCancellationMarksCanceledWithoutActivation(t *testing.T) {
	runner := archiveUpdateRunnerFunc(func(
		ctx context.Context,
		_ ArchiveActivator,
	) (ArchiveUpdateResult, error) {
		<-ctx.Done()
		return ArchiveUpdateResult{Phase: observability.UpdatePhaseBuild}, ctx.Err()
	})
	runtime, err := httpapi.NewRuntimeObservability(io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	scheduler := &archiveScheduler{runner: runner, runtime: runtime}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		scheduler.Run(ctx, func(context.Context, ArchiveActivation) error {
			t.Error("unexpected activation")
			return nil
		})
	}()
	time.Sleep(10 * time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("canceled scheduler did not stop")
	}
}
