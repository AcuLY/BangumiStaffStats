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
	mu sync.RWMutex
}

func (gate *maintenanceGate) Wrap(next http.Handler) http.Handler {
	if next == nil {
		next = http.NotFoundHandler()
	}
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		gate.mu.RLock()
		defer gate.mu.RUnlock()
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
	for !gate.mu.TryLock() {
		select {
		case <-ctx.Done():
			return context.Cause(ctx)
		case <-ticker.C:
		}
	}
	defer gate.mu.Unlock()
	for idle != nil && !idle() {
		select {
		case <-ctx.Done():
			return context.Cause(ctx)
		case <-ticker.C:
		}
	}
	return work()
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
	if ctx == nil || gate == nil || state == nil || runtime == nil ||
		request.Candidate == nil || request.CommitPointer == nil {
		if request.Candidate != nil {
			_ = request.Candidate.Close()
		}
		return errors.New("app: invalid Archive activation")
	}
	dataVersion, err := probeArchiveStore(ctx, request.Candidate)
	if err != nil {
		_ = request.Candidate.Close()
		return err
	}
	activated := false
	err = gate.exclusive(ctx, idle, func() error {
		old, oldReady := state.Current()
		oldVersion := ""
		if oldReady && old != nil {
			oldVersion = old.Identity().DataVersion
		}
		_ = runtime.SetReadiness(false, "")
		previous, replaceErr := state.Replace(ctx, request.Candidate)
		if replaceErr != nil {
			if oldVersion != "" {
				_ = runtime.SetReadiness(true, oldVersion)
			}
			return replaceErr
		}
		rollback := func(cause error) error {
			rollbackContext := context.WithoutCancel(ctx)
			stateErr := state.Restore(rollbackContext, request.Candidate, previous)
			var pointerErr error
			if request.RollbackPointer != nil {
				pointerErr = request.RollbackPointer(rollbackContext)
			}
			_ = request.Candidate.Close()
			if oldVersion != "" {
				_ = runtime.SetReadiness(true, oldVersion)
			} else {
				_ = runtime.SetReadiness(false, "")
			}
			return errors.Join(cause, stateErr, pointerErr)
		}
		if commitErr := request.CommitPointer(ctx); commitErr != nil {
			return rollback(commitErr)
		}
		if readinessErr := runtime.SetReadiness(true, dataVersion); readinessErr != nil {
			return rollback(readinessErr)
		}
		activated = true
		if previous != nil {
			return previous.Close()
		}
		return nil
	})
	if err != nil {
		if !activated {
			_ = request.Candidate.Close()
		}
		return err
	}
	if request.Cleanup != nil {
		return request.Cleanup(context.WithoutCancel(ctx))
	}
	return nil
}
