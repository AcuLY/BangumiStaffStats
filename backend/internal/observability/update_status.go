package observability

import (
	"errors"
	"sync"
	"time"
)

// UpdateStatus is one closed embedded Archive-update terminal status.
type UpdateStatus string

const (
	UpdateStatusFailed    UpdateStatus = "failed"
	UpdateStatusCanceled  UpdateStatus = "canceled"
	UpdateStatusNoChange  UpdateStatus = "no-change"
	UpdateStatusActivated UpdateStatus = "activated"
)

// UpdatePhase is one closed embedded Archive-update phase.
type UpdatePhase string

const (
	UpdatePhaseFreshness     UpdatePhase = "freshness"
	UpdatePhaseAcquisition   UpdatePhase = "acquisition"
	UpdatePhaseBuild         UpdatePhase = "build"
	UpdatePhaseCandidateOpen UpdatePhase = "candidate-open"
	UpdatePhaseActivation    UpdatePhase = "activation"
	UpdatePhaseCleanup       UpdatePhase = "cleanup"
)

// UpdateTerminalSnapshot is one bounded terminal observation.
type UpdateTerminalSnapshot struct {
	Time     time.Time
	Status   UpdateStatus
	Phase    UpdatePhase
	Duration time.Duration
}

// UpdateStatusSnapshot contains no history, path, identity, or raw error.
type UpdateStatusSnapshot struct {
	Running     bool
	Phase       UpdatePhase
	LastAttempt *UpdateTerminalSnapshot
	LastSuccess *UpdateTerminalSnapshot
}

// UpdateStatusProvider samples one in-process bounded update snapshot.
type UpdateStatusProvider func() (UpdateStatusSnapshot, error)

// UpdateTracker owns the sole in-process update snapshot.
type UpdateTracker struct {
	mu sync.RWMutex

	running     bool
	phase       UpdatePhase
	startedAt   time.Time
	lastAttempt *UpdateTerminalSnapshot
	lastSuccess *UpdateTerminalSnapshot
}

// NewUpdateTracker returns an empty process-owned tracker.
func NewUpdateTracker() *UpdateTracker { return new(UpdateTracker) }

// Start begins one run. Runs are serialized by the app scheduler.
func (tracker *UpdateTracker) Start(startedAt time.Time) error {
	if tracker == nil || startedAt.IsZero() {
		return errors.New("observability: invalid update start")
	}
	tracker.mu.Lock()
	defer tracker.mu.Unlock()
	if tracker.running {
		return errors.New("observability: update already running")
	}
	tracker.running = true
	tracker.phase = UpdatePhaseFreshness
	tracker.startedAt = startedAt.UTC()
	return nil
}

// SetPhase replaces the current closed phase while a run is active.
func (tracker *UpdateTracker) SetPhase(phase UpdatePhase) error {
	if tracker == nil || !validUpdatePhase(phase) {
		return errors.New("observability: invalid update phase")
	}
	tracker.mu.Lock()
	defer tracker.mu.Unlock()
	if !tracker.running {
		return errors.New("observability: update is not running")
	}
	tracker.phase = phase
	return nil
}

// Finish closes the current run and atomically replaces bounded terminal state.
func (tracker *UpdateTracker) Finish(
	finishedAt time.Time,
	status UpdateStatus,
	phase UpdatePhase,
) (UpdateTerminalSnapshot, error) {
	if tracker == nil || finishedAt.IsZero() ||
		!validUpdateStatus(status) || !validUpdatePhase(phase) {
		return UpdateTerminalSnapshot{}, errors.New("observability: invalid update terminal")
	}
	tracker.mu.Lock()
	defer tracker.mu.Unlock()
	if !tracker.running || finishedAt.Before(tracker.startedAt) {
		return UpdateTerminalSnapshot{}, errors.New("observability: invalid update terminal")
	}
	terminal := UpdateTerminalSnapshot{
		Time:     finishedAt.UTC(),
		Status:   status,
		Phase:    phase,
		Duration: finishedAt.Sub(tracker.startedAt),
	}
	tracker.running = false
	tracker.phase = ""
	tracker.startedAt = time.Time{}
	tracker.lastAttempt = cloneUpdateTerminal(&terminal)
	if status == UpdateStatusNoChange || status == UpdateStatusActivated {
		tracker.lastSuccess = cloneUpdateTerminal(&terminal)
	}
	return terminal, nil
}

// Snapshot returns one ownership-safe bounded state.
func (tracker *UpdateTracker) Snapshot() (UpdateStatusSnapshot, error) {
	if tracker == nil {
		return UpdateStatusSnapshot{}, errors.New("observability: nil update tracker")
	}
	tracker.mu.RLock()
	defer tracker.mu.RUnlock()
	return UpdateStatusSnapshot{
		Running:     tracker.running,
		Phase:       tracker.phase,
		LastAttempt: cloneUpdateTerminal(tracker.lastAttempt),
		LastSuccess: cloneUpdateTerminal(tracker.lastSuccess),
	}, nil
}

func cloneUpdateTerminal(value *UpdateTerminalSnapshot) *UpdateTerminalSnapshot {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func validUpdateStatus(status UpdateStatus) bool {
	switch status {
	case UpdateStatusFailed, UpdateStatusCanceled, UpdateStatusNoChange,
		UpdateStatusActivated:
		return true
	default:
		return false
	}
}

func validUpdatePhase(phase UpdatePhase) bool {
	switch phase {
	case UpdatePhaseFreshness, UpdatePhaseAcquisition, UpdatePhaseBuild,
		UpdatePhaseCandidateOpen, UpdatePhaseActivation, UpdatePhaseCleanup:
		return true
	default:
		return false
	}
}
