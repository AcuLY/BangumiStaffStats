package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi/wire"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
)

func TestMiddlewareReplacesInboundRequestIDBeforeCommit(t *testing.T) {
	metrics := newTestMetrics(t)
	var contextID string
	handler := runtimeMiddleware(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		var ok bool
		contextID, ok = RequestIDFromContext(request.Context())
		if !ok {
			t.Error("request ID absent from context")
		}
		if writer.Header().Get(requestIDHeader) != "server-generated-id" {
			t.Errorf("response request ID before commit = %q", writer.Header().Get(requestIDHeader))
		}
		writer.Header().Set(requestIDHeader, "handler-replaced-id")
		writer.WriteHeader(http.StatusNoContent)
	}), middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "server-generated-id" },
		metrics:        metrics,
	})

	request := httptest.NewRequest(http.MethodGet, "/livez", nil)
	request.Header.Set(requestIDHeader, "attacker-supplied-id")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if contextID != "server-generated-id" ||
		recorder.Header().Get(requestIDHeader) != "server-generated-id" {
		t.Fatalf("request IDs = context %q header %q", contextID, recorder.Header().Get(requestIDHeader))
	}
	if strings.Contains(recorder.Body.String(), "attacker") {
		t.Fatal("response contains inbound request ID")
	}
	rendered, err := metrics.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(rendered), "server-generated-id") ||
		strings.Contains(string(rendered), "attacker-supplied-id") {
		t.Fatal("request ID became a metric label")
	}
}

func TestMiddlewareDeadlineBeforeCommitWritesOneBoundedEnvelope(t *testing.T) {
	metrics := newTestMetrics(t)
	lateWrite := make(chan error, 1)
	handler := runtimeMiddleware(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		<-request.Context().Done()
		writer.WriteHeader(http.StatusCreated)
		_, err := writer.Write([]byte("late"))
		lateWrite <- err
	}), middlewareOptions{
		requestTimeout: 20 * time.Millisecond,
		requestID:      func() string { return "deadline-id" },
		metrics:        metrics,
	})

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if recorder.Code != http.StatusGatewayTimeout {
		t.Fatalf("status = %d", recorder.Code)
	}
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(recorder.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Error.Code != codeUpstreamTimeout || !envelope.Error.Retryable ||
		envelope.Error.FieldErrors == nil || envelope.Meta.RequestId != "deadline-id" ||
		envelope.Meta.DataVersion != nil {
		t.Fatalf("envelope = %#v", envelope)
	}
	select {
	case err := <-lateWrite:
		if !errors.Is(err, responseTerminated) {
			t.Fatalf("late write error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("deadline was not observed downstream")
	}
	assertMetricContains(t, metrics, `outcome="timeout"`, `status_class="5xx"`)
}

func TestMiddlewareLateHeaderMutationCannotPolluteTerminatedResponse(t *testing.T) {
	observedCancellation := make(chan struct{})
	allowLateMutation := make(chan struct{})
	lateMutationDone := make(chan struct{})
	handler := runtimeMiddleware(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		<-request.Context().Done()
		close(observedCancellation)
		<-allowLateMutation
		writer.Header().Set("X-Late-Handler", "private")
		writer.Header().Del("Cache-Control")
		writer.Header().Set(requestIDHeader, "late-replaced-id")
		close(lateMutationDone)
	}), middlewareOptions{
		requestTimeout: 20 * time.Millisecond,
		requestID:      func() string { return "late-header-id" },
	})

	recorder := httptest.NewRecorder()
	returned := make(chan struct{})
	go func() {
		defer close(returned)
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	}()
	select {
	case <-observedCancellation:
	case <-time.After(time.Second):
		t.Fatal("handler did not observe its deadline")
	}
	select {
	case <-returned:
	case <-time.After(time.Second):
		t.Fatal("middleware did not terminate the response")
	}
	close(allowLateMutation)
	select {
	case <-lateMutationDone:
	case <-time.After(time.Second):
		t.Fatal("late handler did not mutate its header")
	}

	if recorder.Code != http.StatusGatewayTimeout ||
		recorder.Header().Get("X-Late-Handler") != "" ||
		recorder.Header().Get("Content-Type") != "application/json" ||
		recorder.Header().Get("Cache-Control") != "no-store" ||
		recorder.Header().Get(requestIDHeader) != "late-header-id" {
		t.Fatalf("terminated response was polluted: status=%d headers=%#v", recorder.Code, recorder.Header())
	}
}

func TestMiddlewareConcurrentLateHeaderMutationIsRaceSafe(t *testing.T) {
	lateMutationDone := make(chan struct{})
	handler := runtimeMiddleware(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		defer close(lateMutationDone)
		<-request.Context().Done()
		for index := 0; index < 1_000; index++ {
			writer.Header().Set("X-Late-Handler", "private")
			writer.Header().Del("X-Late-Handler")
			writer.Header().Set(requestIDHeader, "late-replaced-id")
			writer.Header().Del(requestIDHeader)
		}
	}), middlewareOptions{
		requestTimeout: 20 * time.Millisecond,
		requestID:      func() string { return "late-race-id" },
	})

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	select {
	case <-lateMutationDone:
	case <-time.After(time.Second):
		t.Fatal("late handler did not finish")
	}
	if recorder.Code != http.StatusGatewayTimeout ||
		recorder.Header().Get("X-Late-Handler") != "" ||
		recorder.Header().Get(requestIDHeader) != "late-race-id" {
		t.Fatalf("terminated response was polluted: status=%d headers=%#v", recorder.Code, recorder.Header())
	}
}

func TestMiddlewareCancellationBeforeCommitWritesNothing(t *testing.T) {
	metrics := newTestMetrics(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	handlerFinished := make(chan struct{})
	handler := runtimeMiddleware(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		defer close(handlerFinished)
		<-request.Context().Done()
		writer.WriteHeader(http.StatusCreated)
		_, _ = writer.Write([]byte("late"))
	}), middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "cancel-id" },
		metrics:        metrics,
	})

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil).WithContext(ctx)
	serveExpectAbortHandler(t, handler, recorder, request)
	if recorder.Body.Len() != 0 {
		t.Fatalf("cancellation body = %q", recorder.Body.String())
	}
	if recorder.Header().Get("Content-Type") != "" {
		t.Fatalf("cancellation content type = %q", recorder.Header().Get("Content-Type"))
	}
	select {
	case <-handlerFinished:
	case <-time.After(time.Second):
		t.Fatal("cancellation was not observed downstream")
	}
	assertMetricContains(t, metrics, `outcome="canceled"`, `status_class="none"`)
}

func TestMiddlewareLateHeaderMutationAfterCancellationIsIsolated(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	handlerStarted := make(chan struct{})
	allowLateMutation := make(chan struct{})
	lateMutationDone := make(chan struct{})
	handler := runtimeMiddleware(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		close(handlerStarted)
		<-request.Context().Done()
		<-allowLateMutation
		writer.Header().Set("X-Late-Handler", "private")
		writer.Header().Set(requestIDHeader, "late-replaced-id")
		_, _ = writer.Write([]byte("late"))
		close(lateMutationDone)
	}), middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "cancel-late-id" },
	})

	recorder := httptest.NewRecorder()
	returned := make(chan any, 1)
	go func() {
		defer func() {
			returned <- recover()
		}()
		request := httptest.NewRequest(http.MethodGet, "/readyz", nil).WithContext(ctx)
		handler.ServeHTTP(recorder, request)
	}()
	select {
	case <-handlerStarted:
	case <-time.After(time.Second):
		t.Fatal("handler did not start")
	}
	cancel()
	select {
	case recovered := <-returned:
		if recovered != http.ErrAbortHandler {
			t.Fatalf("panic = %#v, want http.ErrAbortHandler", recovered)
		}
	case <-time.After(time.Second):
		t.Fatal("middleware did not return after cancellation")
	}
	close(allowLateMutation)
	select {
	case <-lateMutationDone:
	case <-time.After(time.Second):
		t.Fatal("late handler did not finish")
	}
	if recorder.Body.Len() != 0 ||
		recorder.Header().Get("X-Late-Handler") != "" ||
		recorder.Header().Get("Content-Type") != "" ||
		recorder.Header().Get(requestIDHeader) != "cancel-late-id" {
		t.Fatalf("canceled response was polluted: body=%q headers=%#v", recorder.Body.String(), recorder.Header())
	}
}

func TestMiddlewareDoesNotOverwriteCommittedDeadlineResponse(t *testing.T) {
	metrics := newTestMetrics(t)
	handlerFinished := make(chan struct{})
	handler := runtimeMiddleware(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		defer close(handlerFinished)
		writer.WriteHeader(http.StatusAccepted)
		_, _ = writer.Write([]byte("prefix"))
		<-request.Context().Done()
		_, _ = writer.Write([]byte("late"))
	}), middlewareOptions{
		requestTimeout: 20 * time.Millisecond,
		requestID:      func() string { return "post-commit-id" },
		metrics:        metrics,
	})

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/livez", nil))
	if recorder.Code != http.StatusAccepted || recorder.Body.String() != "prefix" {
		t.Fatalf("response = %d %q", recorder.Code, recorder.Body.String())
	}
	select {
	case <-handlerFinished:
	case <-time.After(time.Second):
		t.Fatal("committed handler did not stop")
	}
	assertMetricContains(t, metrics, `outcome="timeout"`, `status_class="2xx"`)
}

func TestMiddlewareDoesNotOverwriteCommittedCancellationResponse(t *testing.T) {
	metrics := newTestMetrics(t)
	ctx, cancel := context.WithCancel(context.Background())
	committed := make(chan struct{})
	handlerFinished := make(chan struct{})
	handler := runtimeMiddleware(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		defer close(handlerFinished)
		writer.WriteHeader(http.StatusAccepted)
		_, _ = writer.Write([]byte("prefix"))
		close(committed)
		<-request.Context().Done()
		_, _ = writer.Write([]byte("late"))
	}), middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "post-cancel-id" },
		metrics:        metrics,
	})

	recorder := httptest.NewRecorder()
	returned := make(chan struct{})
	go func() {
		defer close(returned)
		request := httptest.NewRequest(http.MethodGet, "/livez", nil).WithContext(ctx)
		handler.ServeHTTP(recorder, request)
	}()
	select {
	case <-committed:
	case <-time.After(time.Second):
		t.Fatal("handler did not commit")
	}
	cancel()
	select {
	case <-returned:
	case <-time.After(time.Second):
		t.Fatal("middleware did not return after cancellation")
	}
	select {
	case <-handlerFinished:
	case <-time.After(time.Second):
		t.Fatal("committed handler did not observe cancellation")
	}
	if recorder.Code != http.StatusAccepted || recorder.Body.String() != "prefix" {
		t.Fatalf("response = %d %q", recorder.Code, recorder.Body.String())
	}
	assertMetricContains(t, metrics, `outcome="canceled"`, `status_class="2xx"`)
}

func TestMiddlewareContainsPanicBeforeAndAfterCommit(t *testing.T) {
	t.Run("before commit", func(t *testing.T) {
		metrics := newTestMetrics(t)
		handler := runtimeMiddleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
			panic("private panic")
		}), middlewareOptions{
			requestTimeout: time.Second,
			requestID:      func() string { return "panic-id" },
			metrics:        metrics,
		})
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/livez", nil))
		if recorder.Code != http.StatusInternalServerError ||
			strings.Contains(recorder.Body.String(), "private panic") {
			t.Fatalf("response = %d %q", recorder.Code, recorder.Body.String())
		}
		var envelope wire.ErrorEnvelopeV1
		if err := json.Unmarshal(recorder.Body.Bytes(), &envelope); err != nil {
			t.Fatal(err)
		}
		if envelope.Error.Code != codeInternalError || !envelope.Error.Retryable {
			t.Fatalf("error = %#v", envelope.Error)
		}
		assertMetricContains(t, metrics, `outcome="panic"`, `status_class="5xx"`)
	})

	t.Run("abort sentinel before commit", func(t *testing.T) {
		metrics := newTestMetrics(t)
		handler := runtimeMiddleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
			panic(http.ErrAbortHandler)
		}), middlewareOptions{
			requestTimeout: time.Second,
			requestID:      func() string { return "panic-id" },
			metrics:        metrics,
		})
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/livez", nil))
		if recorder.Code != http.StatusInternalServerError {
			t.Fatalf("status = %d", recorder.Code)
		}
		var envelope wire.ErrorEnvelopeV1
		if err := json.Unmarshal(recorder.Body.Bytes(), &envelope); err != nil {
			t.Fatal(err)
		}
		if envelope.Error.Code != codeInternalError || !envelope.Error.Retryable {
			t.Fatalf("error = %#v", envelope.Error)
		}
		assertMetricContains(t, metrics, `outcome="panic"`, `status_class="5xx"`)
	})

	t.Run("after commit", func(t *testing.T) {
		metrics := newTestMetrics(t)
		handler := runtimeMiddleware(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
			writer.WriteHeader(http.StatusAccepted)
			_, _ = writer.Write([]byte("committed"))
			panic("private panic")
		}), middlewareOptions{
			requestTimeout: time.Second,
			requestID:      func() string { return "panic-id" },
			metrics:        metrics,
		})
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/livez", nil))
		if recorder.Code != http.StatusAccepted || recorder.Body.String() != "committed" {
			t.Fatalf("response = %d %q", recorder.Code, recorder.Body.String())
		}
		assertMetricContains(t, metrics, `outcome="panic"`, `status_class="2xx"`)
	})
}

func newTestMetrics(t *testing.T) *observability.Registry {
	t.Helper()
	metrics, err := observability.NewRegistry(observability.BuildInfo{
		Version: "test",
		Commit:  "test",
	})
	if err != nil {
		t.Fatal(err)
	}
	return metrics
}

func assertMetricContains(t *testing.T, metrics *observability.Registry, values ...string) {
	t.Helper()
	rendered, err := metrics.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	for _, value := range values {
		if !strings.Contains(string(rendered), value) {
			t.Fatalf("metrics do not contain %q:\n%s", value, rendered)
		}
	}
}

func serveExpectAbortHandler(
	t *testing.T,
	handler http.Handler,
	writer http.ResponseWriter,
	request *http.Request,
) {
	t.Helper()
	defer func() {
		if recovered := recover(); recovered != http.ErrAbortHandler {
			t.Fatalf("panic = %#v, want http.ErrAbortHandler", recovered)
		}
	}()
	handler.ServeHTTP(writer, request)
}
