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
	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
)

func TestNewQueryServicesPassesOneRuntimeToAllFiveOperations(t *testing.T) {
	collections := new(recordingCollectionProvider)
	services, err := newQueryServices(new(fakeArchiveRuntime), collections)
	if err != nil {
		t.Fatalf("newQueryServices: %v", err)
	}
	queryRuntime := services.rankings.QueryRuntime()
	if queryRuntime == nil ||
		services.runtime != queryRuntime ||
		services.candidates.QueryRuntime() != queryRuntime ||
		services.personDetail.QueryRuntime() != queryRuntime ||
		services.partners.QueryRuntime() != queryRuntime ||
		services.coStar.QueryRuntime() != queryRuntime {
		t.Fatal("app assembly did not pass one runtime to all five services")
	}
	if services.candidates.QueryRuntime().CollectionCache() !=
		queryRuntime.CollectionCache() {
		t.Fatal("app assembly did not preserve collection cache identity")
	}
	if len(collections.snapshotCalls()) != 0 {
		t.Fatal("app assembly contacted the collection source")
	}
	stats := queryRuntime.Stats()
	if stats.Executor.Running != 0 ||
		stats.Executor.Queued != 0 ||
		stats.CollectionPositive.Items != 0 ||
		stats.CollectionNegative.Items != 0 ||
		stats.Result.Items != 0 {
		t.Fatalf("assembly mutated empty process resources: %+v", stats)
	}
}

func TestNewQueryServicesRejectsMissingCollectionDependencies(t *testing.T) {
	t.Parallel()

	if _, err := newQueryServices(nil, new(recordingCollectionProvider)); err == nil {
		t.Fatal("newQueryServices accepted a nil Archive provider")
	}
	if _, err := newQueryServices(new(fakeArchiveRuntime), nil); err == nil {
		t.Fatal("newQueryServices accepted a nil collection provider")
	}
}

func TestRunListenerPublishesArchiveServesBusinessRoutesAndStops(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	var events bytes.Buffer
	runtimeObservability := testRuntimeObservability(t, &events)
	state := new(archive.State)
	collectionFailure, err := runtimecache.NewCollectionFailure(
		runtimecache.FailureOther,
		nil,
	)
	if err != nil {
		t.Fatal(err)
	}
	collections := &recordingCollectionProvider{err: collectionFailure}
	dependencies := networkDependencies(
		state,
		runtimeObservability,
		collections,
	)
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
		!strings.Contains(metricResponse.body, "bgmss_current_snapshot_info{") ||
		!strings.Contains(
			metricResponse.body,
			"bgmss_query_runtime_stats_valid 1",
		) ||
		strings.Count(
			metricResponse.body,
			`bgmss_query_cache_items{cache="result"}`,
		) != 1 {
		t.Fatalf("metrics = %d %q", metricResponse.status, metricResponse.body)
	}
	if events.Len() != 0 {
		t.Fatalf("successful startup emitted event: %q", events.String())
	}
	unknown := getResponse(t, client, listener, "/api/v1/rankings")
	if unknown.status != http.StatusMethodNotAllowed {
		t.Fatalf("business route status = %d", unknown.status)
	}

	personalRoutes := []struct {
		name string
		path string
		uid  string
		body string
	}{
		{
			name: "rankings",
			path: "/api/v1/rankings",
			uid:  "RankingsUser",
			body: `{"query":{"scope":"personal","uid":"RankingsUser","collectionStatuses":["completed"],"subjectType":"anime","positionKeys":["staff:anime:2"]}}`,
		},
		{
			name: "candidates",
			path: "/api/v1/candidates",
			uid:  "CandidatesUser",
			body: `{"query":{"scope":"personal","uid":"CandidatesUser","collectionStatuses":["completed"],"subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"positionKey":"staff:anime:2"}}`,
		},
		{
			name: "person detail",
			path: "/api/v1/person-detail",
			uid:  "PersonDetailUser",
			body: `{"query":{"scope":"personal","uid":"PersonDetailUser","collectionStatuses":["completed"],"subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"personId":100}}`,
		},
		{
			name: "partners",
			path: "/api/v1/partners",
			uid:  "PartnersUser",
			body: `{"query":{"scope":"personal","uid":"PartnersUser","collectionStatuses":["completed"],"subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"source":{"personId":100,"positionKeys":["staff:anime:2"]}}}`,
		},
		{
			name: "co-star",
			path: "/api/v1/co-star",
			uid:  "CoStarUser",
			body: `{"query":{"scope":"personal","uid":"CoStarUser","collectionStatuses":["completed"],"subjectType":"anime","positionKeys":["staff:anime:2","cast:anime:main"]},"input":{"participants":[{"personId":100,"positionKeys":["staff:anime:2"]},{"personId":101,"positionKeys":["cast:anime:main"]}]}}`,
		},
	}
	for _, route := range personalRoutes {
		response := postJSONResponse(
			t,
			client,
			listener,
			route.path,
			route.body,
		)
		if response.status != http.StatusServiceUnavailable ||
			!strings.Contains(response.body, `"code":"UPSTREAM_UNAVAILABLE"`) ||
			!strings.Contains(response.body, `"message":"collection is unavailable"`) {
			t.Fatalf(
				"%s personal runtime = %d %q",
				route.name,
				response.status,
				response.body,
			)
		}
	}
	assertCollectionCalls(t, collections.snapshotCalls(), personalRoutes)

	globalRoutes := []struct {
		name string
		path string
		body string
	}{
		{
			name: "rankings",
			path: "/api/v1/rankings",
			body: `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}}`,
		},
		{
			name: "candidates",
			path: "/api/v1/candidates",
			body: `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"positionKey":"staff:anime:2"}}`,
		},
		{
			name: "person detail",
			path: "/api/v1/person-detail",
			body: `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"personId":100}}`,
		},
		{
			name: "partners",
			path: "/api/v1/partners",
			body: `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"source":{"personId":100,"positionKeys":["staff:anime:2"]}}}`,
		},
		{
			name: "co-star",
			path: "/api/v1/co-star",
			body: `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2","cast:anime:main"]},"input":{"participants":[{"personId":100,"positionKeys":["staff:anime:2"]},{"personId":101,"positionKeys":["cast:anime:main"]}]}}`,
		},
	}
	for _, route := range globalRoutes {
		response := postJSONResponse(
			t,
			client,
			listener,
			route.path,
			route.body,
		)
		if response.status != http.StatusOK {
			t.Fatalf(
				"%s global runtime = %d %q",
				route.name,
				response.status,
				response.body,
			)
		}
	}
	if calls := collections.snapshotCalls(); len(calls) != len(personalRoutes) {
		t.Fatalf("global routes changed collection calls: %#v", calls)
	}

	coStarNotFoundResponse := postJSONResponse(
		t,
		client,
		listener,
		"/api/v1/co-star",
		`{"query":{"scope":"global","subjectType":"anime","positionKeys":["cast:anime:main"]},"input":{"participants":[{"personId":999999,"positionKeys":["cast:anime:main"]},{"personId":101,"positionKeys":["cast:anime:main"]}]}}`,
	)
	if coStarNotFoundResponse.status != http.StatusNotFound ||
		!strings.Contains(coStarNotFoundResponse.body, `"code":"ENTITY_NOT_FOUND"`) ||
		!strings.Contains(coStarNotFoundResponse.body, `"message":"Participant person was not found."`) ||
		!strings.Contains(coStarNotFoundResponse.body, `"dataVersion":"dv1-`) {
		t.Fatalf(
			"co-star not found runtime = %d %q",
			coStarNotFoundResponse.status,
			coStarNotFoundResponse.body,
		)
	}
	if calls := collections.snapshotCalls(); len(calls) != len(personalRoutes) {
		t.Fatalf("global not-found route changed collection calls: %#v", calls)
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

func TestRunListenerArchiveFailureServesRuntimeAndImagePermanentlyNotReady(t *testing.T) {
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
	catalogResponse := getResponse(t, client, listener, "/api/v1/catalog")
	if catalogResponse.status != http.StatusServiceUnavailable ||
		!strings.Contains(catalogResponse.body, `"code":"NOT_READY"`) {
		t.Fatalf("catalog route = %d %q", catalogResponse.status, catalogResponse.body)
	}
	if strings.Count(events.String(), "\n") != 2 ||
		!strings.Contains(events.String(), `"event":"archive_load_failed"`) ||
		!strings.Contains(events.String(), `"error_code":"ARCHIVE_ROOT_INVALID"`) ||
		!strings.Contains(events.String(), `"event":"query_rejected"`) ||
		!strings.Contains(events.String(), `"operation":"catalog"`) {
		t.Fatalf("startup event = %q", events.String())
	}

	// The exact image route is independent of Archive readiness. An invalid
	// shape proves that the route is registered without contacting upstream.
	imageResponse := getResponse(
		t,
		client,
		listener,
		"/api/v1/images/bangumi/subjects/0?type=small",
	)
	if imageResponse.status != http.StatusBadRequest ||
		!strings.Contains(imageResponse.body, `"code":"INVALID_REQUEST"`) {
		t.Fatalf("image route = %d %q", imageResponse.status, imageResponse.body)
	}
	if strings.Count(events.String(), "\n") != 3 ||
		!strings.Contains(events.String(), `"event":"image_proxy_completed"`) ||
		!strings.Contains(events.String(), `"outcome":"rejected"`) {
		t.Fatalf("image event = %q", events.String())
	}

	// A later readiness request remains false; no load retry or fallback exists.
	if response := getResponse(t, client, listener, "/readyz"); response.status != http.StatusServiceUnavailable {
		t.Fatalf("second ready status = %d", response.status)
	}
	if strings.Count(events.String(), "\n") != 3 {
		t.Fatalf("terminal events changed unexpectedly: %q", events.String())
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
		archive:     state,
		collections: emptyCollectionProvider(),
		runtime:     runtimeObservability,
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
		archive:     state,
		collections: emptyCollectionProvider(),
		runtime:     runtimeObservability,
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
			archive:     state,
			collections: emptyCollectionProvider(),
			runtime:     runtimeObservability,
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
				archive:     state,
				collections: emptyCollectionProvider(),
				runtime:     runtimeObservability,
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
		archive:     state,
		collections: emptyCollectionProvider(),
		runtime:     runtimeObservability,
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

func TestRunListenerWithOptionsRejectsUnsafeUpdateStatusPath(t *testing.T) {
	err := RunListenerWithOptions(
		context.Background(),
		nil,
		"/unused",
		RunOptions{UpdateStatusPath: filepath.Join(t.TempDir(), "other.json")},
	)
	if err == nil ||
		!strings.Contains(err.Error(), "configure update status") {
		t.Fatalf("RunListenerWithOptions error = %v", err)
	}
}

func TestRunListenerWithOptionsRejectsInvalidImageProxyBeforeServing(t *testing.T) {
	proxy := "http://CALLER-CONTROLLED.invalid:0"
	err := RunListenerWithOptions(
		context.Background(),
		nil,
		"/unused",
		RunOptions{ImageHTTPSProxy: &proxy},
	)
	if err == nil ||
		!strings.Contains(err.Error(), "create runtime observability") ||
		!strings.Contains(err.Error(), "invalid image proxy configuration") ||
		strings.Contains(err.Error(), proxy) ||
		strings.Contains(err.Error(), "CALLER-CONTROLLED") {
		t.Fatalf("RunListenerWithOptions error = %v", err)
	}
}

func networkDependencies(
	state archiveRuntime,
	runtimeObservability *httpapi.RuntimeObservability,
	collectionSources ...collectionProvider,
) runDependencies {
	collections := emptyCollectionProvider()
	if len(collectionSources) > 0 {
		collections = collectionSources[0]
	}
	return runDependencies{
		archive:     state,
		collections: collections,
		runtime:     runtimeObservability,
		server: func(handler http.Handler) servingRuntime {
			return httpapi.NewServer(handler)
		},
	}
}

type collectionProviderFunc func(
	context.Context,
	string,
	string,
	[]string,
) (runtimecache.CollectionSnapshot, error)

func (function collectionProviderFunc) Fetch(
	ctx context.Context,
	uid string,
	subjectType string,
	statuses []string,
) (runtimecache.CollectionSnapshot, error) {
	return function(ctx, uid, subjectType, statuses)
}

func emptyCollectionProvider() collectionProvider {
	return collectionProviderFunc(func(
		context.Context,
		string,
		string,
		[]string,
	) (runtimecache.CollectionSnapshot, error) {
		return runtimecache.CollectionSnapshot{
			Items: []runtimecache.CollectionItem{},
		}, nil
	})
}

type collectionCall struct {
	uid         string
	subjectType string
	statuses    []string
}

type recordingCollectionProvider struct {
	mu sync.Mutex

	calls []collectionCall
	err   error
}

func (provider *recordingCollectionProvider) Fetch(
	_ context.Context,
	uid string,
	subjectType string,
	statuses []string,
) (runtimecache.CollectionSnapshot, error) {
	provider.mu.Lock()
	defer provider.mu.Unlock()
	provider.calls = append(provider.calls, collectionCall{
		uid:         uid,
		subjectType: subjectType,
		statuses:    append([]string(nil), statuses...),
	})
	if provider.err != nil {
		return runtimecache.CollectionSnapshot{}, provider.err
	}
	return runtimecache.CollectionSnapshot{
		Items: []runtimecache.CollectionItem{},
	}, nil
}

func (provider *recordingCollectionProvider) snapshotCalls() []collectionCall {
	provider.mu.Lock()
	defer provider.mu.Unlock()
	result := append([]collectionCall(nil), provider.calls...)
	for index := range result {
		result[index].statuses = append([]string(nil), result[index].statuses...)
	}
	return result
}

func assertCollectionCalls(
	t *testing.T,
	calls []collectionCall,
	routes []struct {
		name string
		path string
		uid  string
		body string
	},
) {
	t.Helper()
	if len(calls) != len(routes) {
		t.Fatalf("collection calls = %#v, want %d calls", calls, len(routes))
	}
	for index, call := range calls {
		if call.uid != routes[index].uid ||
			call.subjectType != "anime" ||
			len(call.statuses) != 1 ||
			call.statuses[0] != "completed" {
			t.Fatalf(
				"collection call %d = %#v, want uid %q anime completed",
				index,
				call,
				routes[index].uid,
			)
		}
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

func postJSONResponse(
	t *testing.T,
	client *http.Client,
	listener net.Listener,
	path string,
	body string,
) response {
	t.Helper()
	request, err := http.NewRequest(
		http.MethodPost,
		"http://"+listener.Addr().String()+path,
		strings.NewReader(body),
	)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	httpResponse, err := client.Do(request)
	if err != nil {
		t.Fatalf("POST %s: %v", path, err)
	}
	defer httpResponse.Body.Close()
	data, err := io.ReadAll(httpResponse.Body)
	if err != nil {
		t.Fatal(err)
	}
	return response{status: httpResponse.StatusCode, body: string(data)}
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
