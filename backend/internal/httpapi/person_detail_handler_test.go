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
	"github.com/AcuLY/BangumiStaffStats/backend/internal/persondetail"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

type stubPersonDetailExecutor struct {
	execute     func(context.Context, persondetail.Request) (persondetail.Projection, error)
	dataVersion string
	calls       atomic.Int64
}

func (stub *stubPersonDetailExecutor) Execute(
	ctx context.Context,
	request persondetail.Request,
) (persondetail.Projection, error) {
	stub.calls.Add(1)
	if stub.execute == nil {
		return persondetail.Projection{}, errors.New("unexpected person detail execution")
	}
	return stub.execute(ctx, request)
}

func (stub *stubPersonDetailExecutor) CurrentDataVersion() string {
	return stub.dataVersion
}

func TestPersonDetailStrictTransportRejectsBeforeExecution(t *testing.T) {
	executor := &stubPersonDetailExecutor{
		execute: func(
			context.Context,
			persondetail.Request,
		) (persondetail.Projection, error) {
			return persondetail.Projection{}, errors.New("must not execute")
		},
	}
	handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "req-person-detail-strict" },
		personDetail:   executor,
	})
	valid := `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"personId":100}}`
	for _, testCase := range []struct {
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
			name: "method", method: http.MethodGet, target: routePersonDetail,
			status: http.StatusMethodNotAllowed, code: codeInvalidRequest,
			message: "method not allowed", allow: http.MethodPost,
		},
		{
			name: "query", method: http.MethodPost, target: routePersonDetail + "?page=1",
			body: valid, contentType: "application/json",
			status: http.StatusBadRequest, code: codeInvalidRequest,
			message: "person detail does not accept query parameters",
		},
		{
			name: "media", method: http.MethodPost, target: routePersonDetail,
			body: valid, contentType: "application/json; charset=utf-8",
			status: http.StatusUnsupportedMediaType, code: codeUnsupportedMediaType,
			message: "person detail requires application/json",
		},
		{
			name: "refresh forbidden", method: http.MethodPost, target: routePersonDetail,
			body:        strings.TrimSuffix(valid, "}") + `,"refreshCollection":true}`,
			contentType: "application/json", status: http.StatusBadRequest,
			code: codeInvalidRequest, message: "person detail request is invalid",
		},
		{
			name: "missing input", method: http.MethodPost, target: routePersonDetail,
			body:        `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}}`,
			contentType: "application/json", status: http.StatusBadRequest,
			code: codeInvalidRequest, message: "person detail request is invalid",
		},
		{
			name: "non-object", method: http.MethodPost, target: routePersonDetail,
			body: `[]`, contentType: "application/json",
			status: http.StatusBadRequest, code: codeInvalidRequest,
			message: "person detail request is invalid",
		},
		{
			name: "second document", method: http.MethodPost, target: routePersonDetail,
			body: valid + ` {}`, contentType: "application/json",
			status: http.StatusBadRequest, code: codeInvalidJSON,
			message: "request body must contain one JSON document",
		},
		{
			name: "too large by length", method: http.MethodPost, target: routePersonDetail,
			body: valid, contentType: "application/json",
			status: http.StatusRequestEntityTooLarge, code: codeRequestTooLarge,
			message:       "person detail request body is too large",
			contentLength: MaxJSONBodyBytes + 1,
		},
	} {
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
			assertPersonDetailError(
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

func TestPersonDetailNestedRouteDoesNotShadowMainRoute(t *testing.T) {
	executor := &stubPersonDetailExecutor{
		execute: func(
			context.Context,
			persondetail.Request,
		) (persondetail.Projection, error) {
			return persondetail.Projection{}, errors.New("must not execute")
		},
	}
	handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "req-person-detail-shadow" },
		personDetail:   executor,
	})
	request := httptest.NewRequest(
		http.MethodPost,
		routePersonDetail+"/100",
		strings.NewReader(validPersonDetailBody()),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if executor.calls.Load() != 0 {
		t.Fatalf("nested route executed person detail %d times", executor.calls.Load())
	}
	if response.Code != http.StatusNotFound ||
		response.Header().Get("Content-Type") != "application/json" ||
		response.Header().Get("Cache-Control") != "no-store" ||
		response.Header().Get(requestIDHeader) != "req-person-detail-shadow" {
		t.Fatalf("nested response = %d %v %s", response.Code, response.Header(), response.Body)
	}
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Error.Code != codeEntityNotFound ||
		envelope.Error.Message != "resource not found" ||
		envelope.Meta.RequestId != "req-person-detail-shadow" {
		t.Fatalf("nested envelope = %+v", envelope)
	}
}

func TestPersonDetailTransportPreservesExactOperationDocuments(t *testing.T) {
	privateFailure := errors.New("person detail stub complete")
	executor := &stubPersonDetailExecutor{
		execute: func(
			_ context.Context,
			request persondetail.Request,
		) (persondetail.Projection, error) {
			if string(request.Query) !=
				`{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}` ||
				string(request.Input) != `{"personId":1e2}` ||
				string(request.View) != `{"page":1e0,"pageSize":2e1}` {
				t.Fatalf("person detail request changed: %+v", request)
			}
			return persondetail.Projection{}, privateFailure
		},
	}
	handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "req-person-detail-documents" },
		personDetail:   executor,
	})
	response := performPersonDetailRequest(
		handler,
		`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"personId":1e2},"view":{"page":1e0,"pageSize":2e1}}`,
	)
	assertPersonDetailError(
		t,
		response,
		http.StatusInternalServerError,
		codeInternalError,
		"person detail is unavailable",
	)
	if executor.calls.Load() != 1 ||
		strings.Contains(response.Body.String(), privateFailure.Error()) {
		t.Fatalf("execution/body = %d %s", executor.calls.Load(), response.Body)
	}
}

func TestPersonDetailRouteIsRegisteredWhenServiceIsNotReady(t *testing.T) {
	handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "req-person-detail-not-ready" },
	})
	response := performPersonDetailRequest(handler, validPersonDetailBody())
	assertPersonDetailError(
		t,
		response,
		http.StatusServiceUnavailable,
		codeNotReady,
		"person detail is not ready",
	)
}

func TestPersonDetailSuccessEnforcesScopeOmissions(t *testing.T) {
	for _, testCase := range []struct {
		scope      string
		requestID  string
		collection bool
	}{
		{scope: "global", requestID: "req-person-detail-global"},
		{scope: "personal", requestID: "req-person-detail-personal", collection: true},
	} {
		t.Run(testCase.scope, func(t *testing.T) {
			projection := testPersonDetailProjection(testCase.scope)
			executor := &stubPersonDetailExecutor{
				execute: func(
					context.Context,
					persondetail.Request,
				) (persondetail.Projection, error) {
					return projection, nil
				},
			}
			handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
				requestTimeout: time.Second,
				requestID:      func() string { return testCase.requestID },
				personDetail:   executor,
			})
			response := performPersonDetailRequest(handler, validPersonDetailBody())
			if response.Code != http.StatusOK ||
				response.Header().Get("Content-Type") != "application/json" ||
				response.Header().Get("Cache-Control") != "private, no-store" {
				t.Fatalf(
					"success = %d %v %s",
					response.Code,
					response.Header(),
					response.Body,
				)
			}
			var envelope map[string]any
			if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
				t.Fatal(err)
			}
			data := envelope["data"].(map[string]any)
			meta := envelope["meta"].(map[string]any)
			metrics := data["metrics"].(map[string]any)
			tags := data["tags"].(map[string]any)
			ratings := data["ratings"].(map[string]any)
			_, hasCollection := meta["collection"]
			_, hasPreference := data["preference"]
			_, hasPersonalTags := tags["personal"]
			_, hasPersonalRatings := ratings["personal"]
			_, hasGlobalAverage := metrics["globalAverage"]
			for _, actual := range []bool{
				hasCollection,
				hasPreference,
				hasPersonalTags,
				hasPersonalRatings,
				hasGlobalAverage,
			} {
				if actual != testCase.collection {
					t.Fatalf("scope omission mismatch: %s", response.Body)
				}
			}
		})
	}
}

func TestPersonDetailTransientFailuresWriteBoundedRetryAfter(t *testing.T) {
	for _, testCase := range []struct {
		code       persondetail.Code
		retryAfter time.Duration
		status     int
		wantHeader string
	}{
		{
			code: persondetail.CodeRateLimited, status: http.StatusTooManyRequests,
			wantHeader: "1",
		},
		{
			code: persondetail.CodeServerBusy, retryAfter: 10 * time.Minute,
			status: http.StatusServiceUnavailable, wantHeader: "60",
		},
	} {
		failure, err := persondetail.NewTransientFailure(
			testCase.code,
			testCase.retryAfter,
			errors.New("private upstream detail"),
		)
		if err != nil {
			t.Fatal(err)
		}
		executor := &stubPersonDetailExecutor{
			execute: func(
				context.Context,
				persondetail.Request,
			) (persondetail.Projection, error) {
				return persondetail.Projection{}, failure
			},
		}
		handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
			requestTimeout: time.Second,
			requestID:      func() string { return "req-person-detail-retry" },
			personDetail:   executor,
		})
		response := performPersonDetailRequest(handler, validPersonDetailBody())
		if response.Code != testCase.status ||
			response.Header().Get("Retry-After") != testCase.wantHeader ||
			strings.Contains(response.Body.String(), "private upstream detail") {
			t.Fatalf(
				"transient response = %d %v %s",
				response.Code,
				response.Header(),
				response.Body,
			)
		}
	}
}

func TestPersonDetailTimeoutCancelsExecutionAndEmitsBoundedEvent(t *testing.T) {
	dataVersion := "dv1-" + strings.Repeat("f", 64)
	executionDone := make(chan error, 1)
	executor := &stubPersonDetailExecutor{
		dataVersion: dataVersion,
		execute: func(
			ctx context.Context,
			_ persondetail.Request,
		) (persondetail.Projection, error) {
			<-ctx.Done()
			executionDone <- context.Cause(ctx)
			return persondetail.Projection{}, ctx.Err()
		},
	}
	var events bytes.Buffer
	handler := newHandler(nil, newTestMetrics(t), middlewareOptions{
		requestTimeout: 10 * time.Millisecond,
		requestID:      func() string { return "req-person-detail-timeout" },
		events:         observability.NewEventSink(&events),
		personDetail:   executor,
	})
	response := performPersonDetailRequest(handler, validPersonDetailBody())
	assertPersonDetailError(
		t,
		response,
		http.StatusGatewayTimeout,
		codeUpstreamTimeout,
		"person detail request timed out",
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
		t.Fatal("person detail execution did not observe cancellation")
	}
	if !strings.Contains(events.String(), `"operation":"person_detail"`) ||
		!strings.Contains(events.String(), `"error_code":"UPSTREAM_TIMEOUT"`) {
		t.Fatalf("timeout events = %q", events.String())
	}
}

func testPersonDetailProjection(scope string) persondetail.Projection {
	average := int64(800)
	overall := int64(550)
	buckets := make([]persondetail.RatingBucket, 10)
	for index := range buckets {
		buckets[index] = persondetail.RatingBucket{
			Score:    index + 1,
			Examples: []persondetail.RatingExample{},
		}
	}
	core := persondetail.Core{
		DataVersion: "dv1-" + strings.Repeat("a", 64),
		Scope:       scope,
		Person: persondetail.PersonProfile{
			PersonReference: persondetail.PersonReference{
				ID:   100,
				Name: "Director",
			},
			Careers: []string{},
		},
		Summary: persondetail.Summary{
			WorkUnit: statistics.UnitSubject,
		},
		Metrics: persondetail.Metrics{
			Average: &average,
			Overall: &overall,
		},
		Tags: persondetail.Tags{
			Meta:      []persondetail.TagCount{},
			Community: []persondetail.TagCount{},
		},
		Ratings: persondetail.Ratings{
			Global: persondetail.RatingDistribution{
				Buckets:  buckets,
				Timeline: []persondetail.RatingTimelinePoint{},
			},
		},
	}
	projection := persondetail.Projection{
		Core:       core,
		Section:    persondetail.SectionWorks,
		Works:      []persondetail.WorkItem{},
		Pagination: persondetail.Pagination{Page: 1, PageSize: 10},
	}
	if scope == "personal" {
		globalAverage := int64(790)
		projection.Core.Metrics.GlobalAverage = &globalAverage
		projection.Core.Tags.Personal = []persondetail.TagCount{}
		personalRatings := projection.Core.Ratings.Global
		projection.Core.Ratings.Personal = &personalRatings
		projection.Core.Preference = &persondetail.Preference{
			EvidenceWeight: statistics.Rational{
				Numerator:   "0",
				Denominator: "1",
			},
			Preferred:    []persondetail.PreferenceItem{},
			Conservative: []persondetail.PreferenceItem{},
		}
		projection.Collection = &persondetail.CollectionFreshness{
			FetchedAt:    time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC),
			WarningCodes: []string{},
		}
	}
	return projection
}

func validPersonDetailBody() string {
	return `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"personId":100}}`
}

func performPersonDetailRequest(
	handler http.Handler,
	body string,
) *httptest.ResponseRecorder {
	request := httptest.NewRequest(
		http.MethodPost,
		routePersonDetail,
		strings.NewReader(body),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func assertPersonDetailError(
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
		t.Fatalf("person detail error headers = %v", response.Header())
	}
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Error.Code != code ||
		envelope.Error.Message != message ||
		envelope.Meta.RequestId == "" {
		t.Fatalf("person detail error envelope = %+v", envelope)
	}
}
