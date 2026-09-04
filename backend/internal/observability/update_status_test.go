package observability

import (
	"sync"
	"testing"
	"time"
)

func TestUpdateTrackerKeepsOnlyCurrentAndLastTerminals(t *testing.T) {
	tracker := NewUpdateTracker()
	start := time.Date(2026, 9, 2, 4, 15, 0, 0, time.UTC)
	if err := tracker.Start(start); err != nil {
		t.Fatal(err)
	}
	if err := tracker.SetPhase(UpdatePhaseBuild); err != nil {
		t.Fatal(err)
	}
	running, err := tracker.Snapshot()
	if err != nil || !running.Running || running.Phase != UpdatePhaseBuild {
		t.Fatalf("running = %#v, err = %v", running, err)
	}
	failed, err := tracker.Finish(
		start.Add(time.Minute),
		UpdateStatusFailed,
		UpdatePhaseBuild,
	)
	if err != nil || failed.Duration != time.Minute {
		t.Fatalf("failed = %#v, err = %v", failed, err)
	}

	second := start.Add(time.Hour)
	if err := tracker.Start(second); err != nil {
		t.Fatal(err)
	}
	if _, err := tracker.Finish(
		second.Add(2*time.Minute),
		UpdateStatusActivated,
		UpdatePhaseCleanup,
	); err != nil {
		t.Fatal(err)
	}
	snapshot, err := tracker.Snapshot()
	if err != nil || snapshot.Running || snapshot.LastAttempt == nil ||
		snapshot.LastSuccess == nil ||
		snapshot.LastAttempt.Status != UpdateStatusActivated ||
		snapshot.LastSuccess.Status != UpdateStatusActivated {
		t.Fatalf("snapshot = %#v, err = %v", snapshot, err)
	}
}

func TestUpdateTrackerRejectsOverlapAndInvalidTransitions(t *testing.T) {
	tracker := NewUpdateTracker()
	now := time.Now().UTC()
	if err := tracker.SetPhase(UpdatePhaseBuild); err == nil {
		t.Fatal("phase without run accepted")
	}
	if err := tracker.Start(now); err != nil {
		t.Fatal(err)
	}
	if err := tracker.Start(now); err == nil {
		t.Fatal("overlapping run accepted")
	}
	if _, err := tracker.Finish(
		now.Add(-time.Second),
		UpdateStatusFailed,
		UpdatePhaseBuild,
	); err == nil {
		t.Fatal("negative duration accepted")
	}
}

func TestUpdateTrackerConcurrentSnapshots(t *testing.T) {
	tracker := NewUpdateTracker()
	if err := tracker.Start(time.Now().UTC()); err != nil {
		t.Fatal(err)
	}
	var wait sync.WaitGroup
	for range 32 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			if snapshot, err := tracker.Snapshot(); err != nil || !snapshot.Running {
				t.Errorf("snapshot = %#v, err = %v", snapshot, err)
			}
		}()
	}
	wait.Wait()
}
