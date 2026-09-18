package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

func activationFixture(t *testing.T) (*archive.State, *archive.Store, *archive.Store, *maintenanceGate, http.Handler) {
	t.Helper()
	root := arrangeArchive(t)
	state := new(archive.State)
	if err := state.OpenCurrent(context.Background(), root); err != nil {
		t.Fatal(err)
	}
	old, _ := state.Current()
	candidate, err := archive.OpenVersion(context.Background(), root, old.Identity().DataVersion)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		retireArchive(old)
		retireArchive(candidate)
		_ = candidate.Close()
		_ = old.Close()
		_ = state.Close()
	})
	view := &preparedArchive{archiveRuntime: state}
	view.publish(old)
	runtime := testRuntimeObservability(t, io.Discard)
	runtime.SetLive(true)
	_ = runtime.SetReadiness(true, old.Identity().DataVersion)
	services, err := newQueryServices(view, new(recordingCollectionProvider))
	if err != nil {
		t.Fatal(err)
	}
	gate := &maintenanceGate{view: view, process: context.Background(), runtime: runtime}
	h := runtime.HandlerWithAdmission(readinessProbe(view), currentCatalogStore(view), services.rankings, services.candidates, services.personDetail, services.partners, services.coStar, gate.wrapRoutes)
	return state, old, candidate, gate, h
}

func TestActivationPreparesBeforeCommitAndKeepsMaintenanceResponsive(t *testing.T) {
	state, old, candidate, gate, h := activationFixture(t)
	entered, release := make(chan struct{}), make(chan struct{})
	gate.warm = func(ctx context.Context, s *archive.Store) error {
		if s != candidate {
			t.Error("unexpected recovery")
		}
		close(entered)
		<-release
		return warmArchive(ctx, s)
	}
	committed, cleaned := false, false
	done := make(chan error, 1)
	go func() {
		done <- activateCandidate(context.Background(), gate, state, nil, gate.runtime, ArchiveActivation{Candidate: candidate, CommitPointer: func(context.Context) error { committed = true; return nil }, Cleanup: func(context.Context) error { cleaned = true; return nil }})
	}()
	select {
	case <-entered:
	case err := <-done:
		t.Fatalf("activation skipped candidate preparation: %v", err)
	case <-time.After(time.Second):
		t.Fatal("no preparation")
	}
	if current, _ := state.Current(); current != old {
		t.Error("raw State changed before warmup")
	}
	responses := make(chan struct{})
	go func() { defer close(responses); assertWarmNotReady(t, h) }()
	select {
	case <-responses:
	case <-time.After(100 * time.Millisecond):
		t.Error("maintenance blocked HTTP")
	}
	close(release)
	err := <-done
	<-responses
	if err != nil {
		t.Fatal(err)
	}
	if !committed || !cleaned {
		t.Error("missing commit/cleanup")
	}
	if current, ok := gate.view.Current(); !ok || current != candidate {
		t.Error("prepared candidate not published")
	}
	if _, err := probeArchiveStore(context.Background(), old); err == nil {
		t.Error("old Store not closed")
	}
}

func TestActivationCommitFailureUsesIndependentBoundedRecovery(t *testing.T) {
	state, old, candidate, gate, _ := activationFixture(t)
	update, cancel := context.WithCancel(context.Background())
	defer cancel()
	var warmed []*archive.Store
	gate.warm = func(ctx context.Context, s *archive.Store) error {
		warmed = append(warmed, s)
		if ctx.Err() != nil {
			t.Error("recovery inherited canceled update")
		}
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) > archivePreparationTimeout {
			t.Error("unbounded preparation")
		}
		return warmArchive(ctx, s)
	}
	failure := errors.New("commit failure")
	rollback, cleaned := false, false
	err := activateCandidate(update, gate, state, nil, gate.runtime, ArchiveActivation{Candidate: candidate, CommitPointer: func(context.Context) error { cancel(); return failure }, RollbackPointer: func(ctx context.Context) error { rollback = true; return ctx.Err() }, Cleanup: func(context.Context) error { cleaned = true; return nil }})
	if !errors.Is(err, failure) {
		t.Fatalf("error=%v", err)
	}
	if !reflect.DeepEqual(warmed, []*archive.Store{candidate, old}) {
		t.Errorf("preparation sequence=%v", warmed)
	}
	if !rollback || cleaned {
		t.Errorf("rollback=%t cleanup=%t", rollback, cleaned)
	}
	if current, ok := gate.view.Current(); !ok || current != old {
		t.Error("old prepared view not recovered")
	}
	if _, err := probeArchiveStore(context.Background(), candidate); err == nil {
		t.Error("failed candidate remained open")
	}
}

type activationFaultState struct {
	*archive.State
	replaceErr, restoreErr error
}

func (s activationFaultState) Replace(ctx context.Context, c *archive.Store) (*archive.Store, error) {
	if s.replaceErr != nil {
		return nil, s.replaceErr
	}
	return s.State.Replace(ctx, c)
}
func (s activationFaultState) Restore(ctx context.Context, c, old *archive.Store) error {
	if s.restoreErr != nil {
		return s.restoreErr
	}
	return s.State.Restore(ctx, c, old)
}

func TestActivationFailureMatrix(t *testing.T) {
	for _, kind := range []string{"warm", "replace", "commit", "state restore", "pointer restore", "recovery", "shutdown"} {
		t.Run(kind, func(t *testing.T) {
			state, old, candidate, gate, h := activationFixture(t)
			process, stop := context.WithCancel(context.Background())
			defer stop()
			gate.process = process
			failure := errors.New(kind)
			wrapped := activationFaultState{State: state}
			if kind == "replace" {
				wrapped.replaceErr = failure
			}
			if kind == "state restore" {
				wrapped.restoreErr = failure
			}
			var warmed []*archive.Store
			gate.warm = func(ctx context.Context, s *archive.Store) error {
				warmed = append(warmed, s)
				if kind == "shutdown" {
					stop()
					<-ctx.Done()
					return ctx.Err()
				}
				if s == candidate && (kind == "warm" || kind == "recovery") {
					return failure
				}
				if s == old && kind == "recovery" {
					return failure
				}
				return warmArchive(ctx, s)
			}
			cleaned := false
			err := activateCandidate(context.Background(), gate, wrapped, nil, gate.runtime, ArchiveActivation{Candidate: candidate, CommitPointer: func(context.Context) error { return failure }, RollbackPointer: func(context.Context) error {
				if kind == "pointer restore" {
					return failure
				}
				return nil
			}, Cleanup: func(context.Context) error { cleaned = true; return nil }})
			if err == nil {
				t.Fatal("failure accepted")
			}
			if cleaned {
				t.Error("cleanup after failure")
			}
			failClosed := kind == "state restore" || kind == "pointer restore" || kind == "recovery" || kind == "shutdown"
			current, ready := gate.view.Current()
			if failClosed {
				if ready {
					t.Error("failed recovery admitted queries")
				}
				assertWarmNotReady(t, h)
			} else if !ready || current != old {
				t.Error("recoverable failure did not rewarm old")
			}
			raw, _ := state.Current()
			if kind == "state restore" {
				if raw != candidate {
					t.Error("missing referenced candidate")
				}
				if _, err := probeArchiveStore(context.Background(), candidate); err != nil {
					t.Error("closed State-owned candidate")
				}
			} else if raw != old {
				t.Error("old State not restored")
			}
			if (kind == "state restore" || kind == "pointer restore" || kind == "shutdown") && len(warmed) != 1 {
				t.Errorf("unsafe recovery started: %d", len(warmed))
			}
		})
	}
}

// canceledWaiter deliberately returns before the real middleware route joins.
func canceledWaiter(t *testing.T, h http.Handler, req *http.Request, entered <-chan struct{}) {
	t.Helper()
	ctx, cancel := context.WithCancel(req.Context())
	defer cancel()
	done := make(chan struct{})
	go func() {
		defer close(done)
		defer func() {
			if p := recover(); p != nil && p != http.ErrAbortHandler {
				t.Errorf("HTTP panic: %v", p)
			}
		}()
		h.ServeHTTP(httptest.NewRecorder(), req.WithContext(ctx))
	}()
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("inner handler did not enter")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("cancellation waited for inner handler")
	}
}

func waitGatePaused(t *testing.T, gate *maintenanceGate) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for {
		gate.mu.Lock()
		paused := gate.paused
		gate.mu.Unlock()
		if paused {
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("gate did not close admission")
		}
		time.Sleep(time.Millisecond)
	}
}

func TestCanceledInnerHandlerBlocksCandidateWarmAndRetirement(t *testing.T) {
	state, old, candidate, gate, h := activationFixture(t)
	index, err := statistics.LoadSeriesIndex(context.Background(), old)
	if err != nil {
		t.Fatal(err)
	}
	body := &maintenanceBody{Reader: strings.NewReader(`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}}`), entered: make(chan struct{}), release: make(chan struct{})}
	req := httptest.NewRequest("POST", "/api/v1/rankings", body)
	req.Header.Set("Content-Type", "application/json")
	canceledWaiter(t, h, req, body.entered)
	var warmed atomic.Bool
	gate.warm = func(context.Context, *archive.Store) error { warmed.Store(true); return nil }
	done := make(chan error, 1)
	go func() {
		done <- activateCandidate(context.Background(), gate, state, nil, gate.runtime, ArchiveActivation{Candidate: candidate, CommitPointer: func(context.Context) error { return nil }})
	}()
	waitGatePaused(t, gate)
	gate.mu.Lock()
	active := gate.active
	gate.mu.Unlock()
	if active != 1 {
		t.Errorf("canceled inner handler missing from drain: active=%d", active)
	}
	if warmed.Load() {
		t.Error("candidate warmed before inner handler joined")
	}
	retained, err := statistics.LoadSeriesIndex(context.Background(), old)
	if err != nil || retained != index {
		t.Errorf("old cache retired before inner handler joined: %v", err)
	}
	if _, err := probeArchiveStore(context.Background(), old); err != nil {
		t.Error("old Store closed before inner join")
	}
	close(body.release)
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("activation failed to finish after inner join")
	}
	if !warmed.Load() {
		t.Error("candidate never warmed")
	}
}

func TestCanceledInnerReadyPublisherCannotOutlivePause(t *testing.T) {
	_, old, _, gate, _ := activationFixture(t)
	entered, release := make(chan struct{}), make(chan struct{})
	probe := func(ctx context.Context) (string, error) {
		version, err := probeArchiveStore(ctx, old)
		close(entered)
		<-release // Successful read, stale publication still pending after cancellation.
		return version, err
	}
	h := gate.runtime.HandlerWithAdmission(probe, nil, nil, nil, nil, nil, nil, gate.wrapRoutes)
	canceledWaiter(t, h, httptest.NewRequest("GET", "/readyz", nil), entered)
	paused := make(chan struct{})
	go func() { gate.pause(); close(paused) }()
	waitGatePaused(t, gate)
	select {
	case <-paused:
		t.Error("pause passed still-running readiness publisher")
	default:
	}
	close(release)
	select {
	case <-paused:
	case <-time.After(time.Second):
		t.Fatal("pause failed to join publisher")
	}
	metrics, err := gate.runtime.RenderPrometheus()
	if err != nil || !strings.Contains(string(metrics), "bgmss_readiness 0\n") {
		t.Errorf("stale ready survived completed pause: %v\n%s", err, metrics)
	}
}

func TestTerminalClosureRejectsLateStartupPublication(t *testing.T) {
	_, old, _, gate, h := activationFixture(t)
	gate.terminate()
	gate.publishStartup(old)
	gate.resume()
	if _, ok := gate.view.Current(); ok {
		t.Error("late startup reopened terminal view")
	}
	metrics, err := gate.runtime.RenderPrometheus()
	if err != nil || !strings.Contains(string(metrics), "bgmss_readiness 0\n") {
		t.Errorf("late startup marked ready: %v\n%s", err, metrics)
	}
	assertWarmNotReady(t, h)
}

func TestProcessCancellationDuringActivationDrainCannotResume(t *testing.T) {
	state, old, candidate, gate, h := activationFixture(t)
	process, cancel := context.WithCancel(context.Background())
	defer cancel()
	gate.process = process
	draining := make(chan struct{}, 1)
	done := make(chan error, 1)
	go func() {
		done <- activateCandidate(context.Background(), gate, state, func() bool {
			select {
			case draining <- struct{}{}:
			default:
			}
			return false
		}, gate.runtime, ArchiveActivation{Candidate: candidate, CommitPointer: func(context.Context) error { return nil }})
	}()
	<-draining
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Errorf("activation cancellation = %v", err)
	}
	if _, ok := gate.view.Current(); ok {
		t.Error("process cancellation reopened prepared admission")
	}
	if _, err := probeArchiveStore(context.Background(), old); err != nil {
		t.Error("activation closed State-owned old Store before shutdown drain")
	}
	metrics, err := gate.runtime.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(metrics), "bgmss_readiness 1") {
		t.Error("deferred resume marked stopped process ready")
	}
	assertWarmNotReady(t, h)
}

func TestActivationClosesAdmissionBeforeDetachedDrainAndCancellationKeepsOld(t *testing.T) {
	state, old, candidate, gate, h := activationFixture(t)
	if err := warmArchive(context.Background(), old); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	drainEntered := make(chan struct{}, 1)
	var warmed atomic.Bool
	gate.warm = func(context.Context, *archive.Store) error { warmed.Store(true); return nil }
	done := make(chan error, 1)
	go func() {
		done <- activateCandidate(ctx, gate, state, func() bool {
			select {
			case drainEntered <- struct{}{}:
			default:
			}
			return false
		}, gate.runtime, ArchiveActivation{Candidate: candidate, CommitPointer: func(context.Context) error { return nil }})
	}()
	<-drainEntered
	assertWarmNotReady(t, h)
	if warmed.Load() {
		t.Error("prepared before detached drain")
	}
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Errorf("error=%v", err)
	}
	if warmed.Load() {
		t.Error("cancellation before retirement started recovery")
	}
	if current, ok := gate.view.Current(); !ok || current != old {
		t.Error("cancellation lost prepared old")
	}
}

func TestActivationInvalidRequestsKeepCurrentOwnership(t *testing.T) {
	for _, kind := range []string{"same current", "nil context", "nil state", "nil candidate", "nil commit"} {
		t.Run(kind, func(t *testing.T) {
			state, old, _, gate, _ := activationFixture(t)
			ctx := context.Background()
			var target replaceableArchive = state
			request := ArchiveActivation{Candidate: old, CommitPointer: func(context.Context) error { return nil }}
			switch kind {
			case "nil context":
				ctx = nil
			case "nil state":
				target = nil
			case "nil candidate":
				request.Candidate = nil
			case "nil commit":
				request.CommitPointer = nil
			}
			if err := activateCandidate(ctx, gate, target, nil, gate.runtime, request); err == nil {
				t.Error("invalid request accepted")
			}
			if _, err := probeArchiveStore(context.Background(), old); err != nil {
				t.Error("invalid request closed current Store")
			}
		})
	}
}

type maintenanceBody struct {
	io.Reader
	entered, release chan struct{}
	once             atomic.Bool
}

func (b *maintenanceBody) Read(p []byte) (int, error) {
	if b.once.CompareAndSwap(false, true) {
		close(b.entered)
		<-b.release
	}
	return b.Reader.Read(p)
}
func TestMaintenanceClosesAdmissionBeforeStaleReadyProbeDrains(t *testing.T) {
	_, old, _, gate, h := activationFixture(t)
	entered, release, readyDone, paused := make(chan struct{}), make(chan struct{}), make(chan struct{}), make(chan struct{})
	stale := gate.Wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(entered)
		<-release
		_ = gate.runtime.SetReadiness(true, old.Identity().DataVersion)
		w.WriteHeader(http.StatusOK)
	}))
	go func() {
		defer close(readyDone)
		stale.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/readyz", nil))
	}()
	<-entered
	go func() { gate.pause(); close(paused) }()
	deadline := time.Now().Add(time.Second)
	admissionClosed := false
	for time.Now().Before(deadline) {
		gate.mu.Lock()
		admissionClosed = gate.paused
		gate.mu.Unlock()
		if admissionClosed {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if !admissionClosed {
		t.Error("admission remained open while stale readiness handler drained")
	}
	if admissionClosed {
		if _, ok := gate.view.Current(); ok {
			t.Error("old Store exposed during drain")
		}
		r := httptest.NewRecorder()
		h.ServeHTTP(r, httptest.NewRequest("GET", "/api/v1/catalog", nil))
		if r.Code != 503 {
			t.Errorf("catalog during readiness drain = %d", r.Code)
		}
	}
	close(release)
	<-readyDone
	select {
	case <-paused:
	case <-time.After(time.Second):
		t.Fatal("pause did not finish")
	}
	assertWarmNotReady(t, h)
}

func TestFailedRestoreOrShutdownDoesNotLeakUnownedOldStore(t *testing.T) {
	for _, kind := range []string{"restore failure", "shutdown after replace"} {
		t.Run(kind, func(t *testing.T) {
			state, old, candidate, gate, _ := activationFixture(t)
			process, cancel := context.WithCancel(context.Background())
			defer cancel()
			gate.process = process
			gate.warm = func(context.Context, *archive.Store) error { return nil }
			failure := errors.New(kind)
			wrapped := activationFaultState{State: state, restoreErr: failure}
			err := activateCandidate(context.Background(), gate, wrapped, nil, gate.runtime, ArchiveActivation{
				Candidate: candidate, CommitPointer: func(context.Context) error {
					if kind == "shutdown after replace" {
						cancel()
					}
					return failure
				}, RollbackPointer: func(context.Context) error { return nil },
			})
			if !errors.Is(err, failure) {
				t.Fatalf("activation = %v", err)
			}
			if raw, _ := state.Current(); raw != candidate {
				t.Fatal("candidate ownership changed")
			}
			if _, err := probeArchiveStore(context.Background(), candidate); err != nil {
				t.Error("State-owned candidate was closed")
			}
			if _, err := probeArchiveStore(context.Background(), old); err == nil {
				t.Error("unowned previous Store leaked after terminal recovery failure")
			}
		})
	}
}

func TestMaintenanceRejectedRequestCannotJoinResumedGeneration(t *testing.T) {
	_, _, _, gate, h := activationFixture(t)
	gate.pause()
	body := &maintenanceBody{Reader: strings.NewReader(`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}}`), entered: make(chan struct{}), release: make(chan struct{})}
	r := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/v1/rankings", body)
	req.Header.Set("Content-Type", "application/json")
	done := make(chan struct{})
	go func() { defer close(done); h.ServeHTTP(r, req) }()
	<-body.entered
	gate.resume()
	close(body.release)
	<-done
	if r.Code != 503 {
		t.Errorf("maintenance arrival joined resumed generation: %d %s", r.Code, r.Body)
	}
}

func TestMaintenanceInfrastructureDuringExclusive(t *testing.T) {
	gate := new(maintenanceGate)
	runtime := testRuntimeObservability(t, io.Discard)
	runtime.SetLive(true)
	handler := gate.Wrap(runtime.Handler(nil))
	entered, release := make(chan struct{}), make(chan struct{})
	done := make(chan error, 1)
	go func() {
		done <- gate.exclusive(context.Background(), nil, func() error { close(entered); <-release; return nil })
	}()
	<-entered
	responses := make(chan struct{})
	go func() {
		defer close(responses)
		for _, path := range []string{"/livez", "/metrics", "/readyz"} {
			r := httptest.NewRecorder()
			handler.ServeHTTP(r, httptest.NewRequest("GET", path, nil))
			want := 200
			if path == "/readyz" {
				want = 503
			}
			if r.Code != want {
				t.Errorf("%s: %d", path, r.Code)
			}
		}
	}()
	select {
	case <-responses:
	case <-time.After(100 * time.Millisecond):
		t.Error("infrastructure blocked behind maintenance")
	}
	close(release)
	<-done
	<-responses
}

func TestMaintenanceGateWaitsForCompleteHandlerAndIdleExecutor(t *testing.T) {
	gate := new(maintenanceGate)
	handlerStarted := make(chan struct{})
	releaseHandler := make(chan struct{})
	handler := gate.Wrap(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		close(handlerStarted)
		<-releaseHandler
	}))
	handlerDone := make(chan struct{})
	go func() {
		defer close(handlerDone)
		handler.ServeHTTP(
			httptest.NewRecorder(),
			httptest.NewRequest(http.MethodGet, "/readyz", nil),
		)
	}()
	<-handlerStarted

	var idle atomic.Bool
	maintenanceDone := make(chan error, 1)
	go func() {
		maintenanceDone <- gate.exclusive(
			context.Background(),
			idle.Load,
			func() error { return nil },
		)
	}()
	select {
	case err := <-maintenanceDone:
		t.Fatalf("maintenance passed active handler: %v", err)
	case <-time.After(25 * time.Millisecond):
	}
	close(releaseHandler)
	<-handlerDone
	select {
	case err := <-maintenanceDone:
		t.Fatalf("maintenance ignored busy executor: %v", err)
	case <-time.After(25 * time.Millisecond):
	}
	idle.Store(true)
	select {
	case err := <-maintenanceDone:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("maintenance did not finish after handler/executor drained")
	}
}

func TestActivateCandidateSwapsWithoutListenerRestartAndCleansOld(t *testing.T) {
	root := arrangeArchive(t)
	var current struct {
		DataVersion string `json:"dataVersion"`
	}
	pointerPath := filepath.Join(root, "current.json")
	oldPointer, err := os.ReadFile(pointerPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(oldPointer, &current); err != nil {
		t.Fatal(err)
	}
	newVersion := "dv1-" + strings.Repeat("b", 64)
	oldVersionRoot := filepath.Join(root, "versions", current.DataVersion)
	newVersionRoot := filepath.Join(root, "versions", newVersion)
	if err := os.MkdirAll(newVersionRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	newSQLite := filepath.Join(newVersionRoot, "bangumi.sqlite")
	copyArchiveTestFile(t, filepath.Join(oldVersionRoot, "bangumi.sqlite"), newSQLite)
	dsn := (&url.URL{Scheme: "file", Path: "/" + filepath.ToSlash(newSQLite)}).String()
	database, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(
		"UPDATE archive_meta SET data_version = ? WHERE singleton = 1",
		newVersion,
	); err != nil {
		database.Close()
		t.Fatal(err)
	}
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}

	state := new(archive.State)
	if err := state.OpenCurrent(context.Background(), root); err != nil {
		t.Fatal(err)
	}
	oldStore, ready := state.Current()
	if !ready {
		t.Fatal("old Store not ready")
	}
	candidate, err := archive.OpenVersion(context.Background(), root, newVersion)
	if err != nil {
		t.Fatal(err)
	}
	runtime := testRuntimeObservability(t, io.Discard)
	if err := runtime.SetReadiness(true, current.DataVersion); err != nil {
		t.Fatal(err)
	}
	newPointer := []byte(`{"pointerSchemaVersion":1,"dataVersion":"` +
		newVersion + `","manifestDigest":"sha256:` + strings.Repeat("0", 64) + `"}`)
	err = activateCandidate(
		context.Background(),
		new(maintenanceGate),
		state,
		func() bool { return true },
		runtime,
		ArchiveActivation{
			Candidate: candidate,
			CommitPointer: func(context.Context) error {
				return os.WriteFile(pointerPath, newPointer, 0o644)
			},
			RollbackPointer: func(context.Context) error {
				return os.WriteFile(pointerPath, oldPointer, 0o644)
			},
			Cleanup: func(context.Context) error {
				return os.RemoveAll(oldVersionRoot)
			},
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if version, err := readinessProbe(state)(context.Background()); err != nil ||
		version != newVersion {
		t.Fatalf("ready version = %q, err = %v", version, err)
	}
	if _, err := oldStore.QueryContext(context.Background(), readinessQuery); err == nil {
		t.Fatal("old Store remained queryable")
	}
	if _, err := os.Stat(oldVersionRoot); !os.IsNotExist(err) {
		t.Fatalf("old version still exists: %v", err)
	}
	if err := state.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestActivateCandidatePointerFailureRestoresOldStore(t *testing.T) {
	root := arrangeArchive(t)
	state := new(archive.State)
	if err := state.OpenCurrent(context.Background(), root); err != nil {
		t.Fatal(err)
	}
	oldStore, ready := state.Current()
	if !ready {
		t.Fatal("old Store not ready")
	}
	candidate, err := archive.OpenVersion(
		context.Background(),
		root,
		oldStore.Identity().DataVersion,
	)
	if err != nil {
		t.Fatal(err)
	}
	runtime := testRuntimeObservability(t, io.Discard)
	if err := runtime.SetReadiness(true, oldStore.Identity().DataVersion); err != nil {
		t.Fatal(err)
	}
	pointerFailure := context.DeadlineExceeded
	err = activateCandidate(
		context.Background(),
		new(maintenanceGate),
		state,
		func() bool { return true },
		runtime,
		ArchiveActivation{
			Candidate: candidate,
			CommitPointer: func(context.Context) error {
				return pointerFailure
			},
		},
	)
	if err == nil || !strings.Contains(err.Error(), pointerFailure.Error()) {
		t.Fatalf("activation error = %v", err)
	}
	if current, currentReady := state.Current(); !currentReady || current != oldStore {
		t.Fatalf("current = %p, ready = %v", current, currentReady)
	}
	if _, err := candidate.QueryContext(context.Background(), readinessQuery); err == nil {
		t.Fatal("failed candidate remained open")
	}
	if version, err := readinessProbe(state)(context.Background()); err != nil ||
		version != oldStore.Identity().DataVersion {
		t.Fatalf("restored version = %q, err = %v", version, err)
	}
	if err := state.Close(); err != nil {
		t.Fatal(err)
	}
}
