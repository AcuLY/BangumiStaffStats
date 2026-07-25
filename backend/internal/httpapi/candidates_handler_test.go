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

	"github.com/AcuLY/BangumiStaffStats/backend/internal/candidates"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi/wire"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

type stubCandidatesExecutor struct {
	execute     func(context.Context, candidates.Request) (candidates.Projection, error)
	dataVersion string
	calls       atomic.Int64
}

func (stub *stubCandidatesExecutor) Execute(
	ctx context.Context,
	request candidates.Request,
) (candidates.Projection, error) {
	stub.calls.Add(1)
	if stub.execute == nil {
		return candidates.Projection{}, errors.New("unexpected candidates execution")
	}
	return stub.execute(ctx, request)
}

func (stub *stubCandidatesExecutor) CurrentDataVersion() string {
	return stub.dataVersion
}

func TestCandidatesStrictTransportRejectsBeforeExecution(t *testing.T) {
	executor := &stubCandidatesExecutor{
		execute: func(
			context.Context,
			candidates.Request,
		) (candidates.Projection, error) {
			return candidates.Projection{}, errors.New("must not execute")
		},
	}
	handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "req-candidates-strict" },
		candidates:     executor,
	})
	valid := `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"positionKey":"staff:anime:2"}}`
	testCases := []struct {
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
			name: "method", method: http.MethodGet, target: routeCandidates,
			status: http.StatusMethodNotAllowed, code: codeInvalidRequest,
			message: "method not allowed", allow: http.MethodPost,
		},
		{
			name: "query", method: http.MethodPost, target: routeCandidates + "?page=1",
			body: valid, contentType: "application/json",
			status: http.StatusBadRequest, code: codeInvalidRequest,
			message: "candidates does not accept query parameters",
		},
		{
			name: "media", method: http.MethodPost, target: routeCandidates,
			body: valid, contentType: "application/json; charset=utf-8",
			status: http.StatusUnsupportedMediaType, code: codeUnsupportedMediaType,
			message: "candidates requires application/json",
		},
		{
			name: "unknown", method: http.MethodPost, target: routeCandidates,
			body:        strings.TrimSuffix(valid, "}") + `,"selected":true}`,
			contentType: "application/json", status: http.StatusBadRequest,
			code: codeInvalidRequest, message: "candidates request is invalid",
		},
		{
			name: "missing input", method: http.MethodPost, target: routeCandidates,
			body:        `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}}`,
			contentType: "application/json", status: http.StatusBadRequest,
			code: codeInvalidRequest, message: "candidates request is invalid",
		},
		{
			name: "non-object", method: http.MethodPost, target: routeCandidates,
			body: `[]`, contentType: "application/json", status: http.StatusBadRequest,
			code: codeInvalidRequest, message: "candidates request is invalid",
		},
		{
			name: "second document", method: http.MethodPost, target: routeCandidates,
			body: valid + ` {}`, contentType: "application/json",
			status: http.StatusBadRequest, code: codeInvalidJSON,
			message: "request body must contain one JSON document",
		},
		{
			name: "too large by length", method: http.MethodPost, target: routeCandidates,
			body: valid, contentType: "application/json",
			status: http.StatusRequestEntityTooLarge, code: codeRequestTooLarge,
			message:       "candidates request body is too large",
			contentLength: MaxJSONBodyBytes + 1,
		},
	}
	for _, testCase := range testCases {
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
			assertCandidatesError(
				t,
				response,
				testCase.status,
				testCase.code,
				testCase.message,
			)
			if response.Header().Get("Allow") != testCase.allow {
				t.Fatalf(
					"Allow = %q, want %q",
					response.Header().Get("Allow"),
					testCase.allow,
				)
			}
		})
	}
	if executor.calls.Load() != 0 {
		t.Fatalf("rejected requests executed service %d times", executor.calls.Load())
	}
}

func TestCandidatesTransportPreservesExactOperationDocuments(t *testing.T) {
	privateFailure := errors.New("candidate stub complete")
	executor := &stubCandidatesExecutor{
		execute: func(
			_ context.Context,
			request candidates.Request,
		) (candidates.Projection, error) {
			if string(request.Query) !=
				`{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}` ||
				string(request.Input) != `{"positionKey":"staff:anime:2"}` ||
				string(request.View) != `{"page":1e0,"pageSize":2e1}` ||
				!request.RefreshCollection {
				t.Fatalf("candidate request changed: %+v", request)
			}
			return candidates.Projection{}, privateFailure
		},
	}
	handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "req-candidates-documents" },
		candidates:     executor,
	})
	response := performCandidatesRequest(
		handler,
		`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"positionKey":"staff:anime:2"},"view":{"page":1e0,"pageSize":2e1},"refreshCollection":true}`,
	)
	assertCandidatesError(
		t,
		response,
		http.StatusInternalServerError,
		codeInternalError,
		"candidates is unavailable",
	)
	if executor.calls.Load() != 1 ||
		strings.Contains(response.Body.String(), privateFailure.Error()) {
		t.Fatalf("execution/body = %d %s", executor.calls.Load(), response.Body)
	}
}

func TestCandidatesRouteIsRegisteredWhenServiceIsNotReady(t *testing.T) {
	handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "req-candidates-not-ready" },
	})
	response := performCandidatesRequest(
		handler,
		`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"positionKey":"staff:anime:2"}}`,
	)
	assertCandidatesError(
		t,
		response,
		http.StatusServiceUnavailable,
		codeNotReady,
		"candidates is not ready",
	)
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if !envelope.Error.Retryable || envelope.Meta.DataVersion != nil {
		t.Fatalf("not-ready envelope = %+v", envelope)
	}
}

func TestCandidatesSuccessCommitsScopeSpecificPrivateEnvelope(t *testing.T) {
	dataVersion := "dv1-" + strings.Repeat("a", 64)
	nameCN := "监督"
	for _, testCase := range []struct {
		name           string
		scope          string
		collection     *candidates.CollectionFreshness
		wantCollection bool
		requestID      string
	}{
		{
			name:      "global omits collection",
			scope:     "global",
			requestID: "req-candidates-global-success",
		},
		{
			name:  "personal includes collection",
			scope: "personal",
			collection: &candidates.CollectionFreshness{
				FetchedAt:    time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC),
				WarningCodes: []string{},
			},
			wantCollection: true,
			requestID:      "req-candidates-personal-success",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			projection, err := candidates.NewProjection(
				candidates.Page{
					PositionCounts: []candidates.PositionCount{{
						PositionKey: "staff:anime:2",
						Count:       1,
					}},
					PositionKey: "staff:anime:2",
					WorkUnit:    statistics.UnitSubject,
					Items: []candidates.Item{{
						Rank: 1,
						Person: candidates.PersonReference{
							ID:     100,
							Name:   "Director",
							NameCN: &nameCN,
						},
						WorkCount: 1,
					}},
					Page:     1,
					PageSize: 10,
					Total:    1,
				},
				dataVersion,
				testCase.scope,
				testCase.collection,
			)
			if err != nil {
				t.Fatal(err)
			}
			executor := &stubCandidatesExecutor{
				execute: func(
					context.Context,
					candidates.Request,
				) (candidates.Projection, error) {
					return projection, nil
				},
			}
			handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
				requestTimeout: time.Second,
				requestID:      func() string { return testCase.requestID },
				candidates:     executor,
			})
			response := performCandidatesRequest(
				handler,
				`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"positionKey":"staff:anime:2"}}`,
			)
			if response.Code != http.StatusOK ||
				response.Header().Get("Content-Type") != "application/json" ||
				response.Header().Get("Cache-Control") != "private, no-store" ||
				response.Header().Get(requestIDHeader) != testCase.requestID ||
				!strings.Contains(
					response.Body.String(),
					`"requestId":"`+testCase.requestID+`"`,
				) ||
				!strings.Contains(response.Body.String(), `"dataVersion":"`+dataVersion+`"`) {
				t.Fatalf(
					"candidate success = %d %v %s",
					response.Code,
					response.Header(),
					response.Body,
				)
			}
			hasCollection := strings.Contains(response.Body.String(), `"collection":`)
			if hasCollection != testCase.wantCollection {
				t.Fatalf(
					"collection presence = %t, want %t: %s",
					hasCollection,
					testCase.wantCollection,
					response.Body,
				)
			}
		})
	}
}

func TestCandidatesTransientFailuresWriteBoundedRetryAfter(t *testing.T) {
	for _, testCase := range []struct {
		name       string
		code       candidates.Code
		retryAfter time.Duration
		status     int
		message    string
		wantHeader string
	}{
		{
			name:       "rate limited minimum",
			code:       candidates.CodeRateLimited,
			status:     http.StatusTooManyRequests,
			message:    "collection is rate limited",
			wantHeader: "1",
		},
		{
			name:       "server busy maximum",
			code:       candidates.CodeServerBusy,
			retryAfter: 10 * time.Minute,
			status:     http.StatusServiceUnavailable,
			message:    "candidates is busy",
			wantHeader: "60",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			failure, err := candidates.NewTransientFailure(
				testCase.code,
				testCase.retryAfter,
				errors.New("private upstream detail"),
			)
			if err != nil {
				t.Fatal(err)
			}
			executor := &stubCandidatesExecutor{
				execute: func(
					context.Context,
					candidates.Request,
				) (candidates.Projection, error) {
					return candidates.Projection{}, failure
				},
			}
			handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
				requestTimeout: time.Second,
				requestID:      func() string { return "req-candidates-retry" },
				candidates:     executor,
			})
			response := performCandidatesRequest(
				handler,
				`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"positionKey":"staff:anime:2"}}`,
			)
			assertCandidatesError(
				t,
				response,
				testCase.status,
				errorCode(testCase.code),
				testCase.message,
			)
			if got := response.Header().Get("Retry-After"); got != testCase.wantHeader {
				t.Fatalf(
					"Retry-After = %q, want %q",
					got,
					testCase.wantHeader,
				)
			}
			if seconds := response.Header().Get("Retry-After"); seconds < "1" ||
				seconds > "60" {
				t.Fatalf("Retry-After out of bounds: %q", seconds)
			}
			if strings.Contains(response.Body.String(), "private upstream detail") {
				t.Fatalf("private cause leaked: %s", response.Body)
			}
		})
	}
}

func TestCandidatesTimeoutCancelsExecutionAndEmitsBoundedEvent(t *testing.T) {
	dataVersion := "dv1-" + strings.Repeat("f", 64)
	executionDone := make(chan error, 1)
	executor := &stubCandidatesExecutor{
		dataVersion: dataVersion,
		execute: func(
			ctx context.Context,
			_ candidates.Request,
		) (candidates.Projection, error) {
			<-ctx.Done()
			executionDone <- context.Cause(ctx)
			return candidates.Projection{}, ctx.Err()
		},
	}
	var events bytes.Buffer
	handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
		requestTimeout: 10 * time.Millisecond,
		requestID:      func() string { return "req-candidates-timeout" },
		events:         observability.NewEventSink(&events),
		candidates:     executor,
	})
	response := performCandidatesRequest(
		handler,
		`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"positionKey":"staff:anime:2"}}`,
	)
	assertCandidatesError(
		t,
		response,
		http.StatusGatewayTimeout,
		codeUpstreamTimeout,
		"candidates request timed out",
	)
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Meta.DataVersion == nil ||
		*envelope.Meta.DataVersion != dataVersion {
		t.Fatalf("timeout dataVersion = %+v", envelope.Meta.DataVersion)
	}
	select {
	case cause := <-executionDone:
		if cause == nil || cause.Error() != requestDeadlineCause.Error() {
			t.Fatalf("execution cause = %v", cause)
		}
	case <-time.After(time.Second):
		t.Fatal("candidate execution did not observe cancellation")
	}
	lines := strings.Split(strings.TrimSpace(events.String()), "\n")
	if len(lines) != 1 ||
		!strings.Contains(lines[0], `"operation":"candidates"`) ||
		!strings.Contains(lines[0], `"error_code":"UPSTREAM_TIMEOUT"`) {
		t.Fatalf("timeout events = %q", events.String())
	}
}

func performCandidatesRequest(
	handler http.Handler,
	body string,
) *httptest.ResponseRecorder {
	request := httptest.NewRequest(
		http.MethodPost,
		routeCandidates,
		strings.NewReader(body),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func assertCandidatesError(
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
		t.Fatalf("candidates error headers = %v", response.Header())
	}
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Error.Code != code ||
		envelope.Error.Message != message ||
		envelope.Meta.RequestId == "" {
		t.Fatalf("candidates error envelope = %+v", envelope)
	}
}
