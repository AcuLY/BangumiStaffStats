package app

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
)

func TestShutdownClosesAdmissionBeforeLifecycleJoin(t *testing.T) {
	root := arrangeArchive(t)
	state := new(archive.State)
	runtime := testRuntimeObservability(t, io.Discard)
	served := make(chan http.Handler, 1)
	updaterStarted, canceled, release := make(chan struct{}), make(chan struct{}), make(chan struct{})
	failServe := make(chan struct{})
	failure := errors.New("serve failure before lifecycle join")
	done := make(chan error, 1)
	go func() {
		done <- runListener(context.Background(), nil, root, runDependencies{
			archive: state, collections: new(recordingCollectionProvider), runtime: runtime,
			warm: func(context.Context, *archive.Store) error { return nil },
			updater: archiveUpdateRunnerFunc(func(ctx context.Context, _ ArchiveActivator) (ArchiveUpdateResult, error) {
				close(updaterStarted)
				<-ctx.Done()
				close(canceled) // Serve's terminal result was observed and stop called.
				<-release
				return ArchiveUpdateResult{}, ctx.Err()
			}),
			server: func(h http.Handler) servingRuntime {
				return servingRuntimeFunc(func(context.Context, net.Listener) error {
					served <- h
					<-failServe
					return failure
				})
			},
		})
	}()
	h := <-served
	<-updaterStarted
	close(failServe)
	<-canceled
	// The lifecycle intentionally cannot join yet. Its Store must remain open,
	// but every public provider must already reject it.
	if store, ok := state.Current(); !ok {
		t.Error("closed Store before lifecycle joined")
	} else if _, err := probeArchiveStore(context.Background(), store); err != nil {
		t.Error("Store closed during lifecycle join")
	}
	assertWarmNotReady(t, h)
	close(release)
	if err := <-done; !errors.Is(err, failure) {
		t.Errorf("shutdown error = %v", err)
	}
}

func TestPreparationSerialSameStoreSingleBudget(t *testing.T) {
	state := new(archive.State)
	if err := state.OpenCurrent(context.Background(), arrangeArchive(t)); err != nil {
		t.Fatal(err)
	}
	defer state.Close()
	store, _ := state.Current()
	var steps []string
	var first context.Context
	check := func(ctx context.Context, s *archive.Store, name string) error {
		if first == nil {
			first = ctx
		}
		if ctx != first {
			t.Error("per-step context instead of whole attempt")
		}
		if s != store {
			t.Error("different Store")
		}
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) > 120*time.Second || time.Until(deadline) < 119*time.Second {
			t.Error("missing whole-attempt 120s budget")
		}
		steps = append(steps, name)
		return nil
	}
	err := prepareArchive(context.Background(), store, func(ctx context.Context, s *archive.Store) error {
		return warmPublicData(ctx, s, publicDataLoaders{
			series: func(ctx context.Context, s *archive.Store) error { return check(ctx, s, "series") },
			facts:  func(ctx context.Context, s *archive.Store, typ string) error { return check(ctx, s, typ) },
		})
	})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(steps, []string{"series", "anime", "book", "music", "game", "real"}) {
		t.Fatalf("steps=%v", steps)
	}
}

func TestStartupWarmupGatesRoutesAndJoinsBeforeClose(t *testing.T) {
	for _, end := range []string{"success", "failure", "cancellation", "serve failure"} {
		t.Run(end, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			warmStarted, release, warmDone := make(chan struct{}), make(chan struct{}), make(chan struct{})
			served := make(chan http.Handler, 1)
			serverEnd := make(chan error, 1)
			state := new(archive.State)
			collections := new(recordingCollectionProvider)
			sentinel := errors.New("warm failed")
			done := make(chan error, 1)
			go func() {
				done <- runListener(ctx, nil, arrangeArchive(t), runDependencies{
					archive: state, collections: collections, runtime: testRuntimeObservability(t, io.Discard),
					warm: func(ctx context.Context, s *archive.Store) error {
						close(warmStarted)
						defer close(warmDone)
						select {
						case <-release:
						case <-ctx.Done():
							<-release
						}
						if _, err := probeArchiveStore(context.Background(), s); err != nil {
							t.Error("Store closed before warmup joined")
						}
						if end == "failure" {
							return sentinel
						}
						return ctx.Err()
					},
					server: func(h http.Handler) servingRuntime {
						return servingRuntimeFunc(func(ctx context.Context, _ net.Listener) error {
							served <- h
							select {
							case err := <-serverEnd:
								return err
							case <-ctx.Done():
								return nil
							}
						})
					},
				})
			}()
			h := <-served
			select {
			case <-warmStarted:
			case <-time.After(time.Second):
				cancel()
				close(release)
				<-done
				t.Fatal("startup never called bounded preparation")
			}
			assertWarmNotReady(t, h)
			if len(collections.snapshotCalls()) != 0 {
				t.Error("warmup contacted collection")
			}
			switch end {
			case "cancellation":
				cancel()
			case "serve failure":
				serverEnd <- sentinel
			}
			if end == "cancellation" || end == "serve failure" {
				select {
				case <-done:
					t.Error("closed before preparation joined")
				default:
				}
			}
			close(release)
			<-warmDone
			if end == "success" {
				deadline := time.Now().Add(time.Second)
				for {
					r := httptest.NewRecorder()
					h.ServeHTTP(r, httptest.NewRequest("GET", "/readyz", nil))
					if r.Code == 200 {
						break
					}
					if time.Now().After(deadline) {
						t.Fatalf("never ready: %s", r.Body)
					}
					time.Sleep(time.Millisecond)
				}
				cancel()
			}
			select {
			case err := <-done:
				if (end == "failure" || end == "serve failure") && !errors.Is(err, sentinel) {
					t.Errorf("error=%v", err)
				}
			case <-time.After(time.Second):
				t.Fatal("startup did not stop")
			}
			if _, ok := state.Current(); ok {
				t.Error("Store not closed")
			}
		})
	}
}

func TestServeFailureJoinsAdmittedHandlerBeforeArchiveClose(t *testing.T) {
	root := arrangeArchive(t)
	state := new(archive.State)
	body := &maintenanceBody{Reader: strings.NewReader(`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}}`), entered: make(chan struct{}), release: make(chan struct{})}
	failure := errors.New("listener failure")
	done := make(chan error, 1)
	go func() {
		done <- runListener(context.Background(), nil, root, runDependencies{archive: state, collections: new(recordingCollectionProvider), runtime: testRuntimeObservability(t, io.Discard), warm: func(context.Context, *archive.Store) error { return nil }, server: func(h http.Handler) servingRuntime {
			return servingRuntimeFunc(func(ctx context.Context, _ net.Listener) error {
				for {
					r := httptest.NewRecorder()
					h.ServeHTTP(r, httptest.NewRequest("GET", "/readyz", nil))
					if r.Code == 200 {
						break
					}
					time.Sleep(time.Millisecond)
				}
				requestContext, cancelRequest := context.WithCancel(context.Background())
				waiterDone := make(chan struct{})
				go func() {
					defer close(waiterDone)
					defer func() {
						if p := recover(); p != nil && p != http.ErrAbortHandler {
							t.Errorf("unexpected HTTP panic: %v", p)
						}
					}()
					req := httptest.NewRequest("POST", "/api/v1/rankings", body).WithContext(requestContext)
					req.Header.Set("Content-Type", "application/json")
					h.ServeHTTP(httptest.NewRecorder(), req)
				}()
				<-body.entered
				cancelRequest()
				<-waiterDone // Real middleware returned; inner body reader is still blocked.
				return failure
			})
		}})
	}()
	<-body.entered
	select {
	case err := <-done:
		t.Errorf("Serve returned before admitted handler joined: %v", err)
	case <-time.After(30 * time.Millisecond):
	}
	if store, ok := state.Current(); !ok {
		t.Error("Archive closed while admitted handler active")
	} else if _, err := probeArchiveStore(context.Background(), store); err != nil {
		t.Error("Store retired before handler joined")
	}
	close(body.release)
	select {
	case err := <-done:
		if !errors.Is(err, failure) {
			t.Errorf("error=%v", err)
		}
	case <-time.After(time.Second):
		if _, ok := state.Current(); ok {
			t.Error("shutdown failed to finish")
		}
	}
}

func TestStartupPreparationPrecedesUpdaterAndOpenFailureCanRecover(t *testing.T) {
	for _, mode := range []string{"existing Archive", "initial open failure"} {
		t.Run(mode, func(t *testing.T) {
			root := arrangeArchive(t)
			var candidate *archive.Store
			startupRoot := root
			if mode == "initial open failure" {
				source := new(archive.State)
				if err := source.OpenCurrent(context.Background(), root); err != nil {
					t.Fatal(err)
				}
				current, _ := source.Current()
				var err error
				candidate, err = archive.OpenVersion(context.Background(), root, current.Identity().DataVersion)
				if err != nil {
					t.Fatal(err)
				}
				_ = source.Close()
				startupRoot = t.TempDir()
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			served := make(chan http.Handler, 1)
			entered, release := make(chan struct{}), make(chan struct{})
			updaterEntered := make(chan struct{}, 1)
			activated := make(chan error, 1)
			state := new(archive.State)
			provider := new(recordingCollectionProvider)
			runner := archiveUpdateRunnerFunc(func(ctx context.Context, activate ArchiveActivator) (ArchiveUpdateResult, error) {
				updaterEntered <- struct{}{}
				if candidate != nil {
					err := activate(ctx, ArchiveActivation{Candidate: candidate, CommitPointer: func(context.Context) error { return nil }})
					activated <- err
					return ArchiveUpdateResult{Status: "activated", Phase: "activate"}, err
				}
				return ArchiveUpdateResult{Status: "no-change", Phase: "freshness"}, nil
			})
			done := make(chan error, 1)
			go func() {
				done <- runListener(ctx, nil, startupRoot, runDependencies{
					archive: state, collections: provider, runtime: testRuntimeObservability(t, io.Discard), updater: runner,
					warm: func(ctx context.Context, s *archive.Store) error {
						close(entered)
						select {
						case <-release:
						case <-ctx.Done():
							return ctx.Err()
						}
						return warmArchive(ctx, s)
					},
					server: func(h http.Handler) servingRuntime {
						return servingRuntimeFunc(func(ctx context.Context, _ net.Listener) error { served <- h; <-ctx.Done(); return nil })
					},
				})
			}()
			h := <-served
			select {
			case <-entered:
			case <-time.After(time.Second):
				cancel()
				t.Fatal("preparation did not start")
			}
			assertWarmNotReady(t, h)
			if mode == "existing Archive" {
				select {
				case <-updaterEntered:
					t.Error("updater overlapped startup preparation")
				default:
				}
			} else {
				select {
				case <-updaterEntered:
				default:
					t.Error("open failure did not start builder")
				}
				if _, ok := state.Current(); ok {
					t.Error("builder published before candidate preparation")
				}
			}
			if len(provider.snapshotCalls()) != 0 {
				t.Error("preparation used user collections")
			}
			close(release)
			if candidate != nil {
				if err := <-activated; err != nil {
					t.Error(err)
				}
			} else {
				select {
				case <-updaterEntered:
				case <-time.After(time.Second):
					t.Error("updater not started after preparation")
				}
			}
			deadline := time.Now().Add(time.Second)
			for {
				r := httptest.NewRecorder()
				h.ServeHTTP(r, httptest.NewRequest("GET", "/readyz", nil))
				if r.Code == 200 {
					break
				}
				if time.Now().After(deadline) {
					t.Error("preparation never published readiness")
					break
				}
				time.Sleep(time.Millisecond)
			}
			cancel()
			select {
			case err := <-done:
				if err != nil {
					t.Error(err)
				}
			case <-time.After(time.Second):
				t.Fatal("runListener did not stop")
			}
			if _, ok := state.Current(); ok {
				t.Error("Store still owned after shutdown")
			}
		})
	}
}

func assertWarmNotReady(t *testing.T, h http.Handler) {
	t.Helper()
	for _, test := range []struct {
		method, path, body string
		status             int
	}{
		{"GET", "/livez", "", 200}, {"GET", "/metrics", "", 200}, {"GET", "/readyz", "", 503}, {"GET", "/api/v1/catalog", "", 503},
		{"POST", "/api/v1/rankings", `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}}`, 503},
		{"POST", "/api/v1/candidates", `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"positionKey":"staff:anime:2"}}`, 503},
		{"POST", "/api/v1/person-detail", `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"personId":100}}`, 503},
		{"POST", "/api/v1/partners", `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"source":{"personId":100,"positionKeys":["staff:anime:2"]}}}`, 503},
		{"POST", "/api/v1/co-star", `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"participants":[{"personId":100,"positionKeys":["staff:anime:2"]},{"personId":101,"positionKeys":["staff:anime:2"]}]}}`, 503},
		{"GET", "/unknown", "", 404}, {"POST", "/readyz", "", 405}, {"GET", "/api/v1/rankings", "", 405}, {"GET", "/api/v1/images/bangumi/subjects/0?type=small", "", 400},
	} {
		r := httptest.NewRecorder()
		req := httptest.NewRequest(test.method, test.path, strings.NewReader(test.body))
		if test.body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		h.ServeHTTP(r, req)
		if r.Code != test.status {
			t.Errorf("%s %s = %d %s", test.method, test.path, r.Code, r.Body)
		}
		if test.status == 503 && !strings.Contains(r.Body.String(), "NOT_READY") {
			t.Errorf("not-ready envelope: %s", r.Body)
		}
	}
}
