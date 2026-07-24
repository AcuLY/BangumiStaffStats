package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi/wire"
)

func TestRunListenerPublishesArchiveServesThreeRoutesAndStops(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	var events bytes.Buffer
	runtimeObservability := testRuntimeObservability(t, &events)
	state := new(archive.State)
	dependencies := networkDependencies(state, runtimeObservability)
	archiveRoot := arrangeArchive(t)
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		result <- runListener(ctx, listener, archiveRoot, dependencies)
	}()

	client := &http.Client{Timeout: 5 * time.Second}
	live := getResponse(t, client, listener, "/livez")
	if live.status != http.StatusOK ||
		!strings.Contains(live.body, `"status":"live"`) {
		t.Fatalf("live = %d %q", live.status, live.body)
	}
	ready := getResponse(t, client, listener, "/readyz")
	if ready.status != http.StatusOK ||
		!strings.Contains(ready.body, `"status":"ready"`) ||
		!strings.Contains(ready.body, `"dataVersion":"dv1-`) {
		t.Fatalf("ready = %d %q", ready.status, ready.body)
	}
	metricResponse := getResponse(t, client, listener, "/metrics")
	if metricResponse.status != http.StatusOK ||
		!strings.Contains(metricResponse.body, "bgmss_readiness 1") ||
		!strings.Contains(metricResponse.body, "bgmss_current_snapshot_info{") {
		t.Fatalf("metrics = %d %q", metricResponse.status, metricResponse.body)
	}
	unknown := getResponse(t, client, listener, "/api/v1/rankings")
	if unknown.status != http.StatusNotFound {
		t.Fatalf("business route status = %d", unknown.status)
	}
	if events.Len() != 0 {
		t.Fatalf("successful startup emitted event: %q", events.String())
	}

	cancel()
	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("runListener returned error: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("runListener did not stop after cancellation")
	}
	if state.Ready() {
		t.Fatal("Archive remained published after serving stopped")
	}
	rendered, err := runtimeObservability.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(rendered), "bgmss_liveness 0") ||
		!strings.Contains(string(rendered), "bgmss_readiness 0") ||
		strings.Contains(string(rendered), "bgmss_current_snapshot_info{") {
		t.Fatalf("shutdown metrics:\n%s", rendered)
	}
}

func TestRunListenerArchiveFailureServesHealthOnlyPermanentlyNotReady(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	var events bytes.Buffer
	runtimeObservability := testRuntimeObservability(t, &events)
	state := new(archive.State)
	dependencies := networkDependencies(state, runtimeObservability)
	missingRoot := filepath.Join(t.TempDir(), "missing")
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		result <- runListener(ctx, listener, missingRoot, dependencies)
	}()

	client := &http.Client{Timeout: 5 * time.Second}
	if response := getResponse(t, client, listener, "/livez"); response.status != http.StatusOK {
		t.Fatalf("live status = %d", response.status)
	}
	ready := getResponse(t, client, listener, "/readyz")
	if ready.status != http.StatusServiceUnavailable {
		t.Fatalf("ready status = %d", ready.status)
	}
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal([]byte(ready.body), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Error.Code != "NOT_READY" || envelope.Meta.DataVersion != nil {
		t.Fatalf("ready envelope = %#v", envelope)
	}
	metricResponse := getResponse(t, client, listener, "/metrics")
	if metricResponse.status != http.StatusOK ||
		!strings.Contains(metricResponse.body, "bgmss_readiness 0") ||
		strings.Contains(metricResponse.body, "bgmss_current_snapshot_info{") {
		t.Fatalf("metrics = %d %q", metricResponse.status, metricResponse.body)
	}
	if response := getResponse(t, client, listener, "/api/v1/catalog"); response.status != http.StatusNotFound {
		t.Fatalf("business route status = %d", response.status)
	}
	if strings.Count(events.String(), "\n") != 1 ||
		!strings.Contains(events.String(), `"event":"archive_load_failed"`) ||
		!strings.Contains(events.String(), `"error_code":"ARCHIVE_ROOT_INVALID"`) {
		t.Fatalf("startup event = %q", events.String())
	}

	// A later readiness request remains false; no load retry or fallback exists.
	if response := getResponse(t, client, listener, "/readyz"); response.status != http.StatusServiceUnavailable {
		t.Fatalf("second ready status = %d", response.status)
	}
	if strings.Count(events.String(), "\n") != 1 {
		t.Fatalf("startup event duplicated: %q", events.String())
	}

	cancel()
	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("runListener returned error: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("failure runtime did not stop")
	}
}

func TestRunListenerArchiveFailureNeverConsultsLaterState(t *testing.T) {
	state := &fakeArchiveRuntime{
		load: func(context.Context, string) error {
			return errors.New("untyped load failure")
		},
		current: func() (*archive.Store, bool) {
			return nil, true
		},
	}
	var events bytes.Buffer
	runtimeObservability := testRuntimeObservability(t, &events)
	err := runListener(context.Background(), nil, "/unused", runDependencies{
		archive: state,
		runtime: runtimeObservability,
		server: func(handler http.Handler) servingRuntime {
			return servingRuntimeFunc(func(context.Context, net.Listener) error {
				request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusServiceUnavailable {
					t.Errorf("readiness status = %d", response.Code)
				}
				return nil
			})
		},
	})
	if err != nil {
		t.Fatalf("runListener: %v", err)
	}
	if state.currentCount() != 0 {
		t.Fatalf("Current called %d times after failed load", state.currentCount())
	}
	if state.closeCount() != 1 {
		t.Fatalf("close count = %d", state.closeCount())
	}
	if strings.Count(events.String(), "\n") != 1 ||
		!strings.Contains(events.String(), `"error_code":"INTERNAL_ERROR"`) {
		t.Fatalf("event = %q", events.String())
	}
}

func TestRunListenerCancellationDuringLoadEmitsOneEventAndNeverServes(t *testing.T) {
	state := &fakeArchiveRuntime{
		load: func(ctx context.Context, _ string) error {
			<-ctx.Done()
			return context.Canceled
		},
	}
	var events bytes.Buffer
	runtimeObservability := testRuntimeObservability(t, &events)
	var serverCalls atomic.Int64
	dependencies := runDependencies{
		archive: state,
		runtime: runtimeObservability,
		server: func(http.Handler) servingRuntime {
			serverCalls.Add(1)
			return immediateServer{}
		},
	}
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		result <- runListener(ctx, nil, "/unused", dependencies)
	}()
	cancel()

	select {
	case err := <-result:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("canceled load did not return")
	}
	if serverCalls.Load() != 0 {
		t.Fatal("serving began after load cancellation")
	}
	if state.loadCount() != 1 || state.closeCount() != 1 {
		t.Fatalf("load/close counts = %d/%d", state.loadCount(), state.closeCount())
	}
	if strings.Count(events.String(), "\n") != 1 ||
		!strings.Contains(events.String(), `"error_code":"INTERNAL_ERROR"`) {
		t.Fatalf("event = %q", events.String())
	}
	rendered, err := runtimeObservability.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(rendered), "bgmss_liveness 0") {
		t.Fatal("canceled load changed liveness")
	}
}

func TestRunListenerCancellationDuringLoadPropagatesCleanupFailures(t *testing.T) {
	eventFailure := errors.New("event writer failed")
	closeFailure := errors.New("archive close failed")
	state := &fakeArchiveRuntime{
		load: func(ctx context.Context, _ string) error {
			<-ctx.Done()
			return context.Canceled
		},
		close: func() error {
			return closeFailure
		},
	}
	runtimeObservability := testRuntimeObservability(t, failingWriter{err: eventFailure})
	var serverCalls atomic.Int64
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		result <- runListener(ctx, nil, "/unused", runDependencies{
			archive: state,
			runtime: runtimeObservability,
			server: func(http.Handler) servingRuntime {
				serverCalls.Add(1)
				return immediateServer{}
			},
		})
	}()
	cancel()

	select {
	case err := <-result:
		if !errors.Is(err, eventFailure) || !errors.Is(err, closeFailure) {
			t.Fatalf("error = %v", err)
		}
		if errors.Is(err, context.Canceled) {
			t.Fatalf("operational failures were masked as ordinary cancellation: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("canceled load did not return")
	}
	if serverCalls.Load() != 0 || state.closeCount() != 1 {
		t.Fatalf("server/close counts = %d/%d", serverCalls.Load(), state.closeCount())
	}
}

func TestRunListenerArchiveFailureEventWriteFailureClosesAndNeverServes(t *testing.T) {
	writerFailure := errors.New("event writer failed")
	testCases := []struct {
		name      string
		writerErr error
		short     bool
		wantErr   error
	}{
		{name: "writer error", writerErr: writerFailure, wantErr: writerFailure},
		{name: "short write", short: true, wantErr: io.ErrShortWrite},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			privateLoadFailure := errors.New("load failed at /private/archive/raw-secret")
			state := &fakeArchiveRuntime{
				load: func(context.Context, string) error {
					return privateLoadFailure
				},
			}
			eventWriter := &controlledEventWriter{
				err:   testCase.writerErr,
				short: testCase.short,
			}
			runtimeObservability := testRuntimeObservability(t, eventWriter)
			var serverCalls atomic.Int64

			err := runListener(context.Background(), nil, "/unused", runDependencies{
				archive: state,
				runtime: runtimeObservability,
				server: func(http.Handler) servingRuntime {
					serverCalls.Add(1)
					return immediateServer{}
				},
			})

			if !errors.Is(err, testCase.wantErr) {
				t.Fatalf("error = %v, want %v", err, testCase.wantErr)
			}
			if errors.Is(err, privateLoadFailure) {
				t.Fatalf("raw load error escaped instead of writer failure: %v", err)
			}
			if state.loadCount() != 1 || state.closeCount() != 1 {
				t.Fatalf("load/close counts = %d/%d", state.loadCount(), state.closeCount())
			}
			if serverCalls.Load() != 0 {
				t.Fatalf("server factory called %d times", serverCalls.Load())
			}

			calls, attempted := eventWriter.snapshot()
			const wantEvent = `{"event":"archive_load_failed","channel":"app","phase":"startup","error_code":"INTERNAL_ERROR"}` + "\n"
			if calls != 1 || string(attempted) != wantEvent {
				t.Fatalf("event attempts = %d, payload = %q", calls, attempted)
			}
			if bytes.Contains(attempted, []byte("/private/archive")) ||
				bytes.Contains(attempted, []byte("raw-secret")) {
				t.Fatalf("event leaked raw load error: %q", attempted)
			}
		})
	}
}

func TestRunListenerStopsServingBeforeArchiveClose(t *testing.T) {
	var stopped atomic.Bool
	state := &fakeArchiveRuntime{
		load: func(context.Context, string) error {
			return errors.New("untyped load failure")
		},
		close: func() error {
			if !stopped.Load() {
				return errors.New("archive closed before serving stopped")
			}
			return nil
		},
	}
	var events bytes.Buffer
	runtimeObservability := testRuntimeObservability(t, &events)
	err := runListener(context.Background(), nil, "/unused", runDependencies{
		archive: state,
		runtime: runtimeObservability,
		server: func(http.Handler) servingRuntime {
			return immediateServer{onStop: func() { stopped.Store(true) }}
		},
	})
	if err != nil {
		t.Fatalf("runListener: %v", err)
	}
	if !stopped.Load() || state.closeCount() != 1 {
		t.Fatalf("stopped=%t closeCount=%d", stopped.Load(), state.closeCount())
	}
}

func TestRunListenerPropagatesServeFailureAndClosesPublishedState(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	if err := listener.Close(); err != nil {
		t.Fatalf("close listener: %v", err)
	}

	state := new(archive.State)
	err = runListener(
		context.Background(),
		listener,
		arrangeArchive(t),
		networkDependencies(state, testRuntimeObservability(t, io.Discard)),
	)
	if err == nil || !errors.Is(err, net.ErrClosed) {
		t.Fatalf("runListener error = %v, want net.ErrClosed", err)
	}
	if state.Ready() {
		t.Fatal("state remained ready after serve failure")
	}
}

func TestRunRejectsInvalidAddress(t *testing.T) {
	err := Run(context.Background(), "127.0.0.1:not-a-port", t.TempDir())
	if err == nil {
		t.Fatal("Run returned nil for an invalid address")
	}
}

func networkDependencies(
	state archiveRuntime,
	runtimeObservability *httpapi.RuntimeObservability,
) runDependencies {
	return runDependencies{
		archive: state,
		runtime: runtimeObservability,
		server: func(handler http.Handler) servingRuntime {
			return httpapi.NewServer(handler)
		},
	}
}

func testRuntimeObservability(t *testing.T, eventWriter io.Writer) *httpapi.RuntimeObservability {
	t.Helper()
	runtimeObservability, err := httpapi.NewRuntimeObservability(eventWriter)
	if err != nil {
		t.Fatal(err)
	}
	return runtimeObservability
}

type response struct {
	status int
	body   string
}

func getResponse(t *testing.T, client *http.Client, listener net.Listener, path string) response {
	t.Helper()
	httpResponse, err := client.Get("http://" + listener.Addr().String() + path)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	defer httpResponse.Body.Close()
	body, err := io.ReadAll(httpResponse.Body)
	if err != nil {
		t.Fatal(err)
	}
	return response{status: httpResponse.StatusCode, body: string(body)}
}

type fakeArchiveRuntime struct {
	mu sync.Mutex

	load         func(context.Context, string) error
	current      func() (*archive.Store, bool)
	close        func() error
	loadCalls    int
	currentCalls int
	closeCalls   int
}

func (f *fakeArchiveRuntime) LoadCurrent(ctx context.Context, root string) error {
	f.mu.Lock()
	f.loadCalls++
	load := f.load
	f.mu.Unlock()
	if load == nil {
		return nil
	}
	return load(ctx, root)
}

func (f *fakeArchiveRuntime) Current() (*archive.Store, bool) {
	f.mu.Lock()
	f.currentCalls++
	current := f.current
	f.mu.Unlock()
	if current != nil {
		return current()
	}
	return nil, false
}

func (f *fakeArchiveRuntime) Close() error {
	f.mu.Lock()
	f.closeCalls++
	closeFunction := f.close
	f.mu.Unlock()
	if closeFunction == nil {
		return nil
	}
	return closeFunction()
}

func (f *fakeArchiveRuntime) loadCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.loadCalls
}

func (f *fakeArchiveRuntime) currentCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.currentCalls
}

func (f *fakeArchiveRuntime) closeCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.closeCalls
}

type immediateServer struct {
	onStop func()
}

type failingWriter struct {
	err error
}

func (w failingWriter) Write([]byte) (int, error) {
	return 0, w.err
}

type controlledEventWriter struct {
	mu sync.Mutex

	err       error
	short     bool
	calls     int
	attempted []byte
}

func (w *controlledEventWriter) Write(value []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.calls++
	w.attempted = append([]byte(nil), value...)
	if w.err != nil {
		return 0, w.err
	}
	if w.short && len(value) > 0 {
		return len(value) - 1, nil
	}
	return len(value), nil
}

func (w *controlledEventWriter) snapshot() (int, []byte) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.calls, append([]byte(nil), w.attempted...)
}

type servingRuntimeFunc func(context.Context, net.Listener) error

func (f servingRuntimeFunc) Serve(ctx context.Context, listener net.Listener) error {
	return f(ctx, listener)
}

func (s immediateServer) Serve(context.Context, net.Listener) error {
	if s.onStop != nil {
		s.onStop()
	}
	return nil
}

func arrangeArchive(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve test source")
	}
	repositoryRoot := filepath.Clean(filepath.Join(filepath.Dir(filename), "..", "..", ".."))
	bundleRoot := filepath.Join(repositoryRoot, "contracts", "goldens", "archive", "valid", "minimal")
	pointerData, err := os.ReadFile(filepath.Join(bundleRoot, "current-pointer.json"))
	if err != nil {
		t.Fatal(err)
	}
	var pointer struct {
		DataVersion string `json:"dataVersion"`
	}
	if err := json.Unmarshal(pointerData, &pointer); err != nil {
		t.Fatal(err)
	}

	root := t.TempDir()
	versionRoot := filepath.Join(root, "versions", pointer.DataVersion)
	if err := os.MkdirAll(versionRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	copyArchiveTestFile(t, filepath.Join(bundleRoot, "archive-manifest.json"), filepath.Join(versionRoot, "manifest.json"))
	copyArchiveTestFile(t, filepath.Join(bundleRoot, "bangumi.sqlite"), filepath.Join(versionRoot, "bangumi.sqlite"))
	if err := os.WriteFile(filepath.Join(root, "current.json"), pointerData, 0o644); err != nil {
		t.Fatal(err)
	}
	return root
}

func copyArchiveTestFile(t *testing.T, source, destination string) {
	t.Helper()
	data, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(destination, data, 0o644); err != nil {
		t.Fatal(err)
	}
}
