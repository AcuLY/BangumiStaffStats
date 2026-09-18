package app

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi"
)

const maintenancePollInterval = 10 * time.Millisecond

type maintenanceGate struct {
	// Configured once before serving; activation and startup share this view.
	view      *preparedArchive
	process   context.Context
	warm      func(context.Context, *archive.Store) error
	runtime   *httpapi.RuntimeObservability
	mu        sync.Mutex
	readiness sync.RWMutex
	paused    bool
	terminal  bool
	active    int
}

// terminate closes admission without waiting for a readiness publisher. The
// caller must cancel producers next, before joining through pause.
func (gate *maintenanceGate) terminate() {
	gate.mu.Lock()
	defer gate.mu.Unlock()
	gate.terminateLocked()
}

func (gate *maintenanceGate) terminateLocked() {
	gate.terminal = true
	gate.paused = true
	if gate.view != nil {
		gate.view.admission(false)
	}
	if gate.runtime != nil {
		_ = gate.runtime.SetReadiness(false, "")
	}
}

// publishStartup serializes publication with terminal closure. Checking the
// process before publishing without this lock leaves a shutdown race.
func (gate *maintenanceGate) publishStartup(store *archive.Store) {
	gate.readiness.Lock()
	defer gate.readiness.Unlock()
	gate.mu.Lock()
	defer gate.mu.Unlock()
	if gate.terminal || gate.process != nil && gate.process.Err() != nil {
		gate.terminateLocked()
		return
	}
	gate.view.publish(store)
	if !gate.paused && gate.runtime != nil {
		_ = gate.runtime.SetReadiness(true, store.Identity().DataVersion)
	}
}

func (gate *maintenanceGate) pause() {
	// Close admission first, including while an already admitted readiness probe
	// finishes. Then join its metric publication and clear any stale ready value.
	gate.mu.Lock()
	gate.paused = true
	if gate.view != nil {
		gate.view.admission(false)
	}
	gate.mu.Unlock()
	gate.readiness.Lock()
	if gate.runtime != nil {
		_ = gate.runtime.SetReadiness(false, "")
	}
	gate.readiness.Unlock()
}

func (gate *maintenanceGate) resume() {
	gate.readiness.Lock()
	defer gate.readiness.Unlock()
	gate.mu.Lock()
	defer gate.mu.Unlock()
	if gate.terminal || gate.process != nil && gate.process.Err() != nil {
		gate.terminateLocked()
		return
	}
	gate.paused = false
	if gate.view != nil {
		gate.view.admission(true)
		if gate.runtime != nil {
			store, ok := gate.view.Current()
			if ok {
				_ = gate.runtime.SetReadiness(true, store.Identity().DataVersion)
			} else {
				_ = gate.runtime.SetReadiness(false, "")
			}
		}
	}
}

func (gate *maintenanceGate) Wrap(next http.Handler) http.Handler {
	return gate.wrapRoutes(next, nil)
}

// wrapRoutes runs inside httpapi's asynchronous middleware, so cancellation
// of the HTTP waiter cannot release a still-running Store user.
func (gate *maintenanceGate) wrapRoutes(next, unavailable http.Handler) http.Handler {
	if next == nil {
		next = http.NotFoundHandler()
	}
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet && request.URL.Path == "/readyz" {
			gate.readiness.RLock()
			defer gate.readiness.RUnlock()
		}
		gate.mu.Lock()
		admitted := !gate.paused
		if admitted {
			gate.active++
		}
		gate.mu.Unlock()
		if admitted {
			defer func() { gate.mu.Lock(); gate.active--; gate.mu.Unlock() }()
		}
		// Pin maintenance arrivals to the existing no-dependency handlers. A slow
		// request body must never become an uncounted reader after admission resumes.
		if !admitted && unavailable != nil {
			unavailable.ServeHTTP(writer, request)
			return
		}
		next.ServeHTTP(writer, request)
	})
}

func (gate *maintenanceGate) exclusive(
	ctx context.Context,
	idle func() bool,
	work func() error,
) error {
	if gate == nil || ctx == nil || work == nil {
		return errors.New("app: invalid maintenance request")
	}
	ticker := time.NewTicker(maintenancePollInterval)
	defer ticker.Stop()
	gate.pause()
	defer gate.resume()
	for {
		if err := ctx.Err(); err != nil {
			return context.Cause(ctx)
		}
		gate.mu.Lock()
		active := gate.active
		gate.mu.Unlock()
		if active == 0 && (idle == nil || idle()) {
			return work()
		}
		select {
		case <-ctx.Done():
			return context.Cause(ctx)
		case <-ticker.C:
		}
	}
}

// ArchiveActivation is one already-open candidate plus exact pointer/cleanup
// operations owned by the builder run.
type ArchiveActivation struct {
	Candidate       *archive.Store
	CommitPointer   func(context.Context) error
	RollbackPointer func(context.Context) error
	Cleanup         func(context.Context) error
}

type replaceableArchive interface {
	Current() (*archive.Store, bool)
	Replace(context.Context, *archive.Store) (*archive.Store, error)
	Restore(context.Context, *archive.Store, *archive.Store) error
}

func activateCandidate(
	ctx context.Context,
	gate *maintenanceGate,
	state replaceableArchive,
	idle func() bool,
	runtime *httpapi.RuntimeObservability,
	request ArchiveActivation,
) error {
	// Invalid requests must never destroy the handle currently owned by State.
	closeCandidate := func() {
		if request.Candidate == nil {
			return
		}
		if state != nil {
			current, _ := state.Current()
			if current == request.Candidate {
				return
			}
		}
		if gate != nil && gate.view != nil {
			current, _ := gate.view.archiveRuntime.Current()
			if current == request.Candidate {
				return
			}
		}
		retireArchive(request.Candidate)
		_ = request.Candidate.Close()
	}
	if ctx == nil || gate == nil || state == nil || runtime == nil || request.Candidate == nil || request.CommitPointer == nil {
		closeCandidate()
		return errors.New("app: invalid Archive activation")
	}
	current, _ := state.Current()
	if current == request.Candidate {
		return errors.New("app: candidate is current Archive")
	}
	defer closeCandidate()
	process := gate.process
	if process == nil {
		process = context.Background()
	}
	attempt, cancel := context.WithCancel(ctx)
	defer cancel()
	stop := context.AfterFunc(process, cancel)
	defer stop()
	if process.Err() != nil {
		return context.Cause(process)
	}
	probe, cancelProbe := context.WithTimeout(attempt, time.Second)
	_, err := probeArchiveStore(probe, request.Candidate)
	cancelProbe()
	if err != nil {
		return err
	}
	activated := false
	err = gate.exclusive(attempt, idle, func() error {
		if err := attempt.Err(); err != nil {
			return err
		}
		old, _ := state.Current()
		if gate.view != nil {
			gate.view.publish(nil)
		}
		_ = runtime.SetReadiness(false, "")
		retireArchive(old)
		pointerTouched := false
		recoverOld := func(cause error) (recoveryErr error) {
			// A failed Restore or shutdown after Replace leaves the candidate owned
			// by State. No future owner can close the displaced old handle: release
			// it here after the drain, without deleting its immutable data files.
			defer func() {
				current, _ := state.Current()
				if old != nil && current != old {
					retireArchive(old)
					recoveryErr = errors.Join(recoveryErr, old.Close())
				}
			}()
			retireArchive(request.Candidate)
			// Shutdown joins this work but must not begin a new recovery attempt.
			if process.Err() != nil {
				return errors.Join(cause, context.Cause(process))
			}
			recovery, stopRecovery := context.WithTimeout(process, archivePreparationTimeout)
			defer stopRecovery()
			var stateErr, pointerErr error
			current, _ := state.Current()
			if current != old {
				stateErr = state.Restore(recovery, request.Candidate, old)
			}
			if pointerTouched {
				if request.RollbackPointer == nil {
					pointerErr = errors.New("app: missing pointer rollback")
				} else {
					pointerErr = request.RollbackPointer(recovery)
				}
			}
			if stateErr != nil || pointerErr != nil {
				return errors.Join(cause, stateErr, pointerErr)
			}
			if old == nil {
				return cause
			}
			if err := prepareArchive(recovery, old, gate.warm); err != nil {
				retireArchive(old)
				return errors.Join(cause, err)
			}
			if err := recovery.Err(); err != nil {
				retireArchive(old)
				return errors.Join(cause, err)
			}
			if gate.view != nil {
				gate.view.publish(old)
			}
			return cause
		}
		if err := prepareArchive(attempt, request.Candidate, gate.warm); err != nil {
			return recoverOld(err)
		}
		if err := attempt.Err(); err != nil {
			return recoverOld(err)
		}
		previous, err := state.Replace(attempt, request.Candidate)
		if err != nil {
			return recoverOld(err)
		}
		pointerTouched = true
		if err := request.CommitPointer(attempt); err != nil {
			return recoverOld(err)
		}
		if err := attempt.Err(); err != nil {
			return recoverOld(err)
		}
		if gate.view != nil {
			gate.view.publish(request.Candidate)
		}
		activated = true
		if previous != nil {
			return previous.Close()
		}
		return nil
	})
	if activated {
		// The successful pointer transaction owns cleanup even if old Close reports
		// an error. Failed activations never invoke successful cleanup.
		if gate.view == nil {
			_ = runtime.SetReadiness(true, request.Candidate.Identity().DataVersion)
		}
		if request.Cleanup != nil {
			err = errors.Join(err, request.Cleanup(context.WithoutCancel(ctx)))
		}
	}
	return err
}
