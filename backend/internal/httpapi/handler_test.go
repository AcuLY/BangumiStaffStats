package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi/wire"
)

func TestHealthRoutesHaveExactBodiesAndDoNotShareProbeWork(t *testing.T) {
	metrics := newTestMetrics(t)
	metrics.SetLive(true)
	dataVersion := "dv1-" + strings.Repeat("a", 64)
	var probes atomic.Int64
	handler := newHandler(func(ctx context.Context) (string, error) {
		probes.Add(1)
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) <= 0 || time.Until(deadline) > readinessProbeTimeout {
			t.Errorf("probe deadline = %v, present = %t", deadline, ok)
		}
		return dataVersion, nil
	}, metrics, middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "fixed-id" },
		metrics:        metrics,
	})

	live := performRequest(handler, http.MethodGet, "/livez")
	if live.Code != http.StatusOK ||
		live.Body.String() != `{"data":{"status":"live"},"meta":{"requestId":"fixed-id"}}` {
		t.Fatalf("live response = %d %q", live.Code, live.Body.String())
	}
	assertJSONNoStore(t, live)
	if probes.Load() != 0 {
		t.Fatal("liveness touched Archive probe")
	}

	ready := performRequest(handler, http.MethodGet, "/readyz")
	wantReady := `{"data":{"status":"ready"},"meta":{"requestId":"fixed-id","dataVersion":"` + dataVersion + `"}}`
	if ready.Code != http.StatusOK || ready.Body.String() != wantReady {
		t.Fatalf("ready response = %d %q", ready.Code, ready.Body.String())
	}
	assertJSONNoStore(t, ready)
	if probes.Load() != 1 {
		t.Fatalf("probe count = %d", probes.Load())
	}

	metricsResponse := performRequest(handler, http.MethodGet, "/metrics")
	if metricsResponse.Code != http.StatusOK ||
		metricsResponse.Header().Get("Content-Type") != "text/plain; version=0.0.4; charset=utf-8" ||
		metricsResponse.Header().Get("Cache-Control") != "no-store" ||
		!strings.HasSuffix(metricsResponse.Body.String(), "\n") {
		t.Fatalf("metrics response = %d %#v %q", metricsResponse.Code, metricsResponse.Header(), metricsResponse.Body.String())
	}
	if !strings.Contains(metricsResponse.Body.String(), `bgmss_current_snapshot_info{data_version="`+dataVersion+`"} 1`) {
		t.Fatal("metrics omitted current snapshot identity")
	}
}

func TestReadinessFailuresReturnGeneratedNotReadyWithoutDataVersion(t *testing.T) {
	testCases := []struct {
		name  string
		probe ReadinessProbe
	}{
		{name: "nil", probe: nil},
		{name: "failure", probe: func(context.Context) (string, error) { return "", errors.New("private path /tmp/archive") }},
		{name: "empty identity", probe: func(context.Context) (string, error) { return "", nil }},
		{name: "invalid identity", probe: func(context.Context) (string, error) { return "attacker-value", nil }},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			metrics := newTestMetrics(t)
			if err := metrics.SetReadiness(true, "dv1-"+strings.Repeat("b", 64)); err != nil {
				t.Fatal(err)
			}
			handler := newHandler(testCase.probe, metrics, middlewareOptions{
				requestTimeout: time.Second,
				requestID:      func() string { return "ready-failure-id" },
				metrics:        metrics,
			})
			response := performRequest(handler, http.MethodGet, "/readyz")
			if response.Code != http.StatusServiceUnavailable {
				t.Fatalf("status = %d", response.Code)
			}
			var envelope wire.ErrorEnvelopeV1
			if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
				t.Fatal(err)
			}
			if envelope.Error.Code != codeNotReady || !envelope.Error.Retryable ||
				envelope.Error.FieldErrors == nil || envelope.Meta.RequestId != "ready-failure-id" ||
				envelope.Meta.DataVersion != nil {
				t.Fatalf("envelope = %#v", envelope)
			}
			if strings.Contains(response.Body.String(), "private path") ||
				strings.Contains(response.Body.String(), "attacker-value") {
				t.Fatal("readiness response leaked probe detail")
			}
			rendered, err := metrics.RenderPrometheus()
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(string(rendered), "bgmss_readiness 0") ||
				strings.Contains(string(rendered), "bgmss_current_snapshot_info{") {
				t.Fatalf("not-ready metrics:\n%s", rendered)
			}
		})
	}
}

func TestReadinessProbeIsActivelyBoundedToOneSecond(t *testing.T) {
	metrics := newTestMetrics(t)
	probeDone := make(chan error, 1)
	handler := newHandler(func(ctx context.Context) (string, error) {
		<-ctx.Done()
		probeDone <- ctx.Err()
		return "private-data-version", ctx.Err()
	}, metrics, middlewareOptions{
		requestTimeout: 3 * time.Second,
		requestID:      func() string { return "probe-timeout-id" },
		metrics:        metrics,
	})

	startedAt := time.Now()
	response := performRequest(handler, http.MethodGet, "/readyz")
	if elapsed := time.Since(startedAt); elapsed >= 3*time.Second {
		t.Fatalf("readiness probe exceeded request bound: %s", elapsed)
	}
	select {
	case err := <-probeDone:
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("probe context error = %v", err)
		}
	default:
		t.Fatal("readiness probe did not observe its child deadline")
	}
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", response.Code)
	}
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Error.Code != codeNotReady ||
		envelope.Meta.RequestId != "probe-timeout-id" ||
		envelope.Meta.DataVersion != nil ||
		strings.Contains(response.Body.String(), "private-data-version") {
		t.Fatalf("envelope = %#v body = %q", envelope, response.Body.String())
	}
}

func TestRouterRejectsUnknownAndWrongMethodWithExactEnvelope(t *testing.T) {
	metrics := newTestMetrics(t)
	handler := newHandler(nil, metrics, middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "router-id" },
		metrics:        metrics,
	})

	for _, path := range []string{"/", "/livez/", "/health", "/not-a-route/private-token"} {
		response := performRequest(handler, http.MethodGet, path)
		assertErrorResponse(t, response, http.StatusNotFound, codeEntityNotFound, false)
		if strings.Contains(response.Body.String(), path) || strings.Contains(response.Body.String(), "private-token") {
			t.Fatalf("unknown response leaked path: %q", response.Body.String())
		}
	}
	rankings := performRequest(handler, http.MethodGet, routeRankings)
	assertRankingsError(
		t,
		rankings,
		http.StatusMethodNotAllowed,
		codeInvalidRequest,
		"method not allowed",
	)
	if rankings.Header().Get("Allow") != http.MethodPost {
		t.Fatalf("rankings Allow = %q", rankings.Header().Get("Allow"))
	}
	for _, path := range []string{"/livez", "/readyz", "/metrics"} {
		response := performRequest(handler, http.MethodPost, path)
		assertErrorResponse(t, response, http.StatusMethodNotAllowed, codeInvalidRequest, false)
		if response.Header().Get("Allow") != http.MethodGet {
			t.Fatalf("Allow = %q", response.Header().Get("Allow"))
		}
	}
}

func TestEveryRequestGetsAReplacementOpaqueID(t *testing.T) {
	handler := NewHandler(nil, newTestMetrics(t))
	firstRequest := httptest.NewRequest(http.MethodGet, "/livez", nil)
	firstRequest.Header.Set(requestIDHeader, "attacker")
	first := httptest.NewRecorder()
	handler.ServeHTTP(first, firstRequest)
	second := performRequest(handler, http.MethodGet, "/livez")

	firstID := first.Header().Get(requestIDHeader)
	secondID := second.Header().Get(requestIDHeader)
	if len(firstID) != 32 || len(secondID) != 32 || firstID == secondID ||
		firstID == "attacker" || secondID == "attacker" {
		t.Fatalf("request IDs = %q %q", firstID, secondID)
	}
	if !strings.Contains(first.Body.String(), `"requestId":"`+firstID+`"`) ||
		!strings.Contains(second.Body.String(), `"requestId":"`+secondID+`"`) {
		t.Fatal("success meta does not contain response request ID")
	}
}

func performRequest(handler http.Handler, method, path string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func assertJSONNoStore(t *testing.T, response *httptest.ResponseRecorder) {
	t.Helper()
	if response.Header().Get("Content-Type") != "application/json" ||
		response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("headers = %#v", response.Header())
	}
}

func assertErrorResponse(
	t *testing.T,
	response *httptest.ResponseRecorder,
	status int,
	code errorCode,
	retryable bool,
) {
	t.Helper()
	if response.Code != status {
		t.Fatalf("status = %d, want %d", response.Code, status)
	}
	assertJSONNoStore(t, response)
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Error.Code != code || envelope.Error.Retryable != retryable ||
		envelope.Error.FieldErrors == nil || envelope.Meta.RequestId != "router-id" {
		t.Fatalf("envelope = %#v", envelope)
	}
}
