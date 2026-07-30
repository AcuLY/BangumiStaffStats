package httpapi

import (
	"bytes"
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
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/ranking"
)

type stubRankingsExecutor struct {
	execute     func(context.Context, ranking.Request) (ranking.Projection, error)
	dataVersion string
	calls       atomic.Int64
}

func (stub *stubRankingsExecutor) Execute(
	ctx context.Context,
	request ranking.Request,
) (ranking.Projection, error) {
	stub.calls.Add(1)
	if stub.execute == nil {
		return ranking.Projection{}, errors.New("unexpected rankings execution")
	}
	return stub.execute(ctx, request)
}

func (stub *stubRankingsExecutor) CurrentDataVersion() string {
	return stub.dataVersion
}

func TestRankingsStrictTransportRejectsBeforeExecution(t *testing.T) {
	executor := &stubRankingsExecutor{
		execute: func(context.Context, ranking.Request) (ranking.Projection, error) {
			return ranking.Projection{}, errors.New("must not execute")
		},
	}
	handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "req-rankings-strict" },
		rankings:       executor,
	})
	valid := `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}}`
	cases := []struct {
		name          string
		method        string
		target        string
		body          string
		contentType   string
		status        int
		code          errorCode
		message       string
		allow         string
		contentLength int64
	}{
		{
			name: "method", method: http.MethodGet, target: routeRankings,
			status: 405, code: codeInvalidRequest, message: "method not allowed",
			allow: http.MethodPost,
		},
		{
			name: "query", method: http.MethodPost, target: routeRankings + "?page=1",
			body: valid, contentType: "application/json", status: 400,
			code: codeInvalidRequest, message: "rankings does not accept query parameters",
		},
		{
			name: "media", method: http.MethodPost, target: routeRankings,
			body: valid, contentType: "application/json; charset=utf-8", status: 415,
			code: codeUnsupportedMediaType, message: "rankings requires application/json",
		},
		{
			name: "unknown", method: http.MethodPost, target: routeRankings,
			body:        strings.TrimSuffix(valid, "}") + `,"mode":"rankings"}`,
			contentType: "application/json", status: 400,
			code: codeInvalidRequest, message: "rankings request is invalid",
		},
		{
			name: "non-object", method: http.MethodPost, target: routeRankings,
			body: `[]`, contentType: "application/json", status: 400,
			code: codeInvalidRequest, message: "rankings request is invalid",
		},
		{
			name: "second document", method: http.MethodPost, target: routeRankings,
			body: valid + ` {}`, contentType: "application/json", status: 400,
			code: codeInvalidJSON, message: "request body must contain one JSON document",
		},
		{
			name: "too large by length", method: http.MethodPost, target: routeRankings,
			body: valid, contentType: "application/json", status: 413,
			code: codeRequestTooLarge, message: "rankings request body is too large",
			contentLength: MaxJSONBodyBytes + 1,
		},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(
				testCase.method,
				testCase.target,
				strings.NewReader(testCase.body),
			)
			if testCase.contentType != "" {
				request.Header.Set("Content-Type", testCase.contentType)
			}
			if testCase.contentLength != 0 {
				request.ContentLength = testCase.contentLength
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			assertRankingsError(
				t,
				response,
				testCase.status,
				testCase.code,
				testCase.message,
			)
			if response.Header().Get("Allow") != testCase.allow {
				t.Fatalf("Allow = %q, want %q", response.Header().Get("Allow"), testCase.allow)
			}
		})
	}
	if executor.calls.Load() != 0 {
		t.Fatalf("strictly rejected requests executed service %d times", executor.calls.Load())
	}
}

func TestRankingsRouteIsRegisteredWhenServiceIsNotReady(t *testing.T) {
	handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "req-rankings-not-ready" },
	})
	response := performRankingsRequest(
		handler,
		`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}}`,
	)
	assertRankingsError(
		t,
		response,
		http.StatusServiceUnavailable,
		codeNotReady,
		"rankings is not ready",
	)
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if !envelope.Error.Retryable || envelope.Meta.DataVersion != nil {
		t.Fatalf("not-ready envelope = %+v", envelope)
	}
}

func TestRankingsTimeoutCancelsExecutionAndPublishesOneBoundedEvent(t *testing.T) {
	dataVersion := "dv1-" + strings.Repeat("f", 64)
	executionDone := make(chan error, 1)
	executor := &stubRankingsExecutor{
		dataVersion: dataVersion,
		execute: func(ctx context.Context, _ ranking.Request) (ranking.Projection, error) {
			<-ctx.Done()
			executionDone <- context.Cause(ctx)
			return ranking.Projection{}, ctx.Err()
		},
	}
	var events bytes.Buffer
	handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
		requestTimeout: 10 * time.Millisecond,
		requestID:      func() string { return "req-rankings-timeout" },
		events:         observability.NewEventSink(&events),
		rankings:       executor,
	})
	response := performRankingsRequest(
		handler,
		`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}}`,
	)
	assertRankingsError(
		t,
		response,
		http.StatusGatewayTimeout,
		codeUpstreamTimeout,
		"rankings request timed out",
	)
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Meta.DataVersion == nil || *envelope.Meta.DataVersion != dataVersion {
		t.Fatalf("timeout dataVersion = %+v", envelope.Meta.DataVersion)
	}
	select {
	case cause := <-executionDone:
		if cause == nil || cause.Error() != requestDeadlineCause.Error() {
			t.Fatalf("execution cause = %v", cause)
		}
	case <-time.After(time.Second):
		t.Fatal("rankings execution did not observe cancellation")
	}
	lines := strings.Split(strings.TrimSpace(events.String()), "\n")
	if len(lines) != 1 ||
		!strings.Contains(lines[0], `"operation":"rankings"`) ||
		!strings.Contains(lines[0], `"error_code":"UPSTREAM_TIMEOUT"`) {
		t.Fatalf("timeout events = %q", events.String())
	}
}

func TestRankingsSuccessUsesPrivateNoStoreAndServerRequestID(t *testing.T) {
	executor := &stubRankingsExecutor{
		execute: func(
			_ context.Context,
			request ranking.Request,
		) (ranking.Projection, error) {
			if string(request.Query) !=
				`{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}` ||
				string(request.View) != `{"page":1}` {
				t.Fatalf("request documents changed: query=%s view=%s", request.Query, request.View)
			}
			return ranking.Projection{}, nil
		},
	}
	handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "req-rankings-success" },
		rankings:       executor,
	})
	response := performRankingsRequest(
		handler,
		`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"view":{"page":1}}`,
	)
	if response.Code != http.StatusOK ||
		response.Header().Get("Content-Type") != "application/json" ||
		response.Header().Get("Cache-Control") != "private, no-store" ||
		response.Header().Get(requestIDHeader) != "req-rankings-success" ||
		!strings.Contains(response.Body.String(), `"requestId":"req-rankings-success"`) {
		t.Fatalf("success response = %d %v %s", response.Code, response.Header(), response.Body)
	}
}

func TestRankingsPanicUsesPrivateNoStoreAndCurrentDataVersion(t *testing.T) {
	dataVersion := "dv1-" + strings.Repeat("a", 64)
	executor := &stubRankingsExecutor{
		dataVersion: dataVersion,
		execute: func(context.Context, ranking.Request) (ranking.Projection, error) {
			panic("rankings panic")
		},
	}
	handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "req-rankings-panic" },
		rankings:       executor,
	})
	response := performRankingsRequest(
		handler,
		`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}}`,
	)
	assertRankingsError(
		t,
		response,
		http.StatusInternalServerError,
		codeInternalError,
		"rankings is unavailable",
	)
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Meta.DataVersion == nil || *envelope.Meta.DataVersion != dataVersion {
		t.Fatalf("panic dataVersion = %+v", envelope.Meta.DataVersion)
	}
}

func TestRankingsRetryAfterIsPresentAndBounded(t *testing.T) {
	for _, testCase := range []struct {
		name     string
		duration time.Duration
		want     string
	}{
		{name: "rate limited default", duration: 0, want: "1"},
		{name: "round up partial second", duration: 1500 * time.Millisecond, want: "2"},
		{name: "bounded maximum", duration: 10 * time.Minute, want: "60"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			header := make(http.Header)
			setRankingsRetryAfter(header, testCase.duration)
			if got := header.Get("Retry-After"); got != testCase.want {
				t.Fatalf("Retry-After = %q, want %q", got, testCase.want)
			}
		})
	}
}

func TestRankingsTransientFailuresWriteRetryAfter(t *testing.T) {
	for _, testCase := range []struct {
		name       string
		code       ranking.Code
		retryAfter time.Duration
		status     int
		message    string
		wantHeader string
	}{
		{
			name:       "rate limited defaults",
			code:       ranking.CodeRateLimited,
			status:     http.StatusTooManyRequests,
			message:    "collection is rate limited",
			wantHeader: "1",
		},
		{
			name:       "server busy rounds up",
			code:       ranking.CodeServerBusy,
			retryAfter: 1500 * time.Millisecond,
			status:     http.StatusServiceUnavailable,
			message:    "rankings is busy",
			wantHeader: "2",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			failure, err := ranking.NewTransientFailure(
				testCase.code,
				testCase.retryAfter,
				errors.New("private upstream detail"),
			)
			if err != nil {
				t.Fatal(err)
			}
			executor := &stubRankingsExecutor{
				execute: func(context.Context, ranking.Request) (ranking.Projection, error) {
					return ranking.Projection{}, failure
				},
			}
			handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
				requestTimeout: time.Second,
				requestID:      func() string { return "req-rankings-retry" },
				rankings:       executor,
			})
			response := performRankingsRequest(
				handler,
				`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}}`,
			)
			assertRankingsError(
				t,
				response,
				testCase.status,
				errorCode(testCase.code),
				testCase.message,
			)
			if got := response.Header().Get("Retry-After"); got != testCase.wantHeader {
				t.Fatalf("Retry-After = %q, want %q", got, testCase.wantHeader)
			}
			if strings.Contains(response.Body.String(), "private upstream detail") {
				t.Fatalf("private cause leaked: %s", response.Body)
			}
		})
	}
}

func performRankingsRequest(handler http.Handler, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, routeRankings, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func assertRankingsError(
	t *testing.T,
	response *httptest.ResponseRecorder,
	status int,
	code errorCode,
	message string,
) {
	t.Helper()
	if response.Code != status {
		t.Fatalf("status = %d, want %d: %s", response.Code, status, response.Body)
	}
	if response.Header().Get("Content-Type") != "application/json" ||
		response.Header().Get("Cache-Control") != "private, no-store" ||
		response.Header().Get(requestIDHeader) == "" {
		t.Fatalf("rankings error headers = %v", response.Header())
	}
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Error.Code != code || envelope.Error.Message != message ||
		envelope.Meta.RequestId == "" {
		t.Fatalf("rankings error envelope = %+v", envelope)
	}
}
