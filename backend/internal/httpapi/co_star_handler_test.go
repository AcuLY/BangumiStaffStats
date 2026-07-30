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

	"github.com/AcuLY/BangumiStaffStats/backend/internal/costar"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi/wire"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

type stubCoStarExecutor struct {
	execute     func(context.Context, costar.Request) (costar.Projection, error)
	dataVersion string
	calls       atomic.Int64
}

func (stub *stubCoStarExecutor) Execute(
	ctx context.Context,
	request costar.Request,
) (costar.Projection, error) {
	stub.calls.Add(1)
	if stub.execute == nil {
		return costar.Projection{}, errors.New("unexpected co-star execution")
	}
	return stub.execute(ctx, request)
}

func (stub *stubCoStarExecutor) CurrentDataVersion() string {
	return stub.dataVersion
}

func TestCoStarStrictTransportRejectsBeforeExecution(t *testing.T) {
	executor := &stubCoStarExecutor{
		execute: func(context.Context, costar.Request) (costar.Projection, error) {
			return costar.Projection{}, errors.New("must not execute")
		},
	}
	handler := standaloneCoStarHandler(
		executor,
		nil,
		func() string { return "req-co-star-strict" },
	)
	valid := validCoStarBody()
	testCases := []struct {
		name          string
		method        string
		target        string
		body          string
		contentType   string
		contentEncode string
		status        int
		code          errorCode
		message       string
		allow         string
		contentLength int64
	}{
		{
			name: "method", method: http.MethodGet, target: routeCoStar,
			status: http.StatusMethodNotAllowed, code: codeInvalidRequest,
			message: "method not allowed", allow: http.MethodPost,
		},
		{
			name: "query", method: http.MethodPost, target: routeCoStar + "?page=1",
			body: valid, contentType: "application/json",
			status: http.StatusBadRequest, code: codeInvalidRequest,
			message: "co-star does not accept query parameters",
		},
		{
			name: "media parameters", method: http.MethodPost, target: routeCoStar,
			body: valid, contentType: "application/json; charset=utf-8",
			status: http.StatusUnsupportedMediaType, code: codeUnsupportedMediaType,
			message: "co-star requires application/json",
		},
		{
			name: "content encoding", method: http.MethodPost, target: routeCoStar,
			body: valid, contentType: "application/json", contentEncode: "identity",
			status: http.StatusUnsupportedMediaType, code: codeUnsupportedMediaType,
			message: "co-star requires application/json",
		},
		{
			name: "refresh forbidden", method: http.MethodPost, target: routeCoStar,
			body:        strings.TrimSuffix(valid, "}") + `,"refreshCollection":true}`,
			contentType: "application/json", status: http.StatusBadRequest,
			code: codeInvalidRequest, message: "co-star request is invalid",
		},
		{
			name: "missing input", method: http.MethodPost, target: routeCoStar,
			body:        `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:1","staff:anime:2"]}}`,
			contentType: "application/json", status: http.StatusBadRequest,
			code: codeInvalidRequest, message: "co-star request is invalid",
		},
		{
			name: "non-object", method: http.MethodPost, target: routeCoStar,
			body: `[]`, contentType: "application/json",
			status: http.StatusBadRequest, code: codeInvalidRequest,
			message: "co-star request is invalid",
		},
		{
			name: "second document", method: http.MethodPost, target: routeCoStar,
			body: valid + ` {}`, contentType: "application/json",
			status: http.StatusBadRequest, code: codeInvalidJSON,
			message: "request body must contain one JSON document",
		},
		{
			name: "too large by length", method: http.MethodPost, target: routeCoStar,
			body: valid, contentType: "application/json",
			status: http.StatusRequestEntityTooLarge, code: codeRequestTooLarge,
			message:       "co-star request body is too large",
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
			if testCase.contentEncode != "" {
				request.Header.Set("Content-Encoding", testCase.contentEncode)
			}
			if testCase.contentLength != 0 {
				request.ContentLength = testCase.contentLength
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			assertCoStarError(
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

func TestCoStarTransportPreservesExactOperationDocuments(t *testing.T) {
	privateFailure := errors.New("co-star stub complete")
	executor := &stubCoStarExecutor{
		execute: func(
			_ context.Context,
			request costar.Request,
		) (costar.Projection, error) {
			if string(request.Query) !=
				`{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:1","staff:anime:2"]}` ||
				string(request.Input) !=
					`{"participants":[{"personId":1e2,"positionKeys":["staff:anime:1"]},{"personId":2e2,"positionKeys":["staff:anime:2"]}]}` ||
				string(request.View) != `{"page":1e0,"pageSize":2e1}` {
				t.Fatalf("co-star request changed: %+v", request)
			}
			return costar.Projection{}, privateFailure
		},
	}
	handler := standaloneCoStarHandler(
		executor,
		nil,
		func() string { return "req-co-star-documents" },
	)
	response := performCoStarRequest(
		handler,
		`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:1","staff:anime:2"]},"input":{"participants":[{"personId":1e2,"positionKeys":["staff:anime:1"]},{"personId":2e2,"positionKeys":["staff:anime:2"]}]},"view":{"page":1e0,"pageSize":2e1}}`,
	)
	assertCoStarError(
		t,
		response,
		http.StatusInternalServerError,
		codeInternalError,
		"co-star is unavailable",
	)
	if executor.calls.Load() != 1 ||
		strings.Contains(response.Body.String(), privateFailure.Error()) {
		t.Fatalf("execution/body = %d %s", executor.calls.Load(), response.Body)
	}
}

func TestCoStarDecoderRejectsInvalidUTF8AndStreamingOverflow(t *testing.T) {
	executor := &stubCoStarExecutor{
		execute: func(context.Context, costar.Request) (costar.Projection, error) {
			return costar.Projection{}, errors.New("must not execute")
		},
	}
	handler := standaloneCoStarHandler(
		executor,
		nil,
		func() string { return "req-co-star-body" },
	)
	for _, testCase := range []struct {
		name   string
		body   []byte
		status int
		code   errorCode
	}{
		{
			name:   "invalid UTF-8",
			body:   []byte{'{', '"', 'x', '"', ':', '"', 0xff, '"', '}'},
			status: http.StatusBadRequest,
			code:   codeInvalidJSON,
		},
		{
			name:   "streaming overflow",
			body:   bytes.Repeat([]byte{' '}, MaxJSONBodyBytes+1),
			status: http.StatusRequestEntityTooLarge,
			code:   codeRequestTooLarge,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				routeCoStar,
				bytes.NewReader(testCase.body),
			)
			request.Header.Set("Content-Type", "application/json")
			request.ContentLength = -1
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			assertCoStarError(t, response, testCase.status, testCase.code, "")
		})
	}
	if executor.calls.Load() != 0 {
		t.Fatalf("invalid bodies executed service %d times", executor.calls.Load())
	}
}

func TestCoStarCanceledExecutionDoesNotCommit(t *testing.T) {
	executor := &stubCoStarExecutor{
		execute: func(
			ctx context.Context,
			_ costar.Request,
		) (costar.Projection, error) {
			return costar.Projection{}, context.Cause(ctx)
		},
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	request := httptest.NewRequest(
		http.MethodPost,
		routeCoStar,
		strings.NewReader(validCoStarBody()),
	).WithContext(ctx)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	routes := &routeHandler{}
	routes.writeCoStarWithExecutor(
		response,
		request,
		"req-co-star-canceled",
		executor,
	)
	if response.Body.Len() != 0 || response.Header().Get("Content-Type") != "" {
		t.Fatalf("canceled execution committed response: %v %s", response.Header(), response.Body)
	}
}

func TestCoStarSuccessUsesNoStoreAndScopeOmissions(t *testing.T) {
	for _, scope := range []string{"global", "personal"} {
		t.Run(scope, func(t *testing.T) {
			executor := &stubCoStarExecutor{
				execute: func(
					context.Context,
					costar.Request,
				) (costar.Projection, error) {
					return testCoStarProjection(scope), nil
				},
			}
			handler := standaloneCoStarHandler(
				executor,
				nil,
				func() string { return "req-co-star-" + scope },
			)
			response := performCoStarRequest(handler, validCoStarBody())
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
			_, hasCollection := meta["collection"]
			_, hasPreference := data["preference"]
			wantPersonal := scope == "personal"
			if hasCollection != wantPersonal || hasPreference != wantPersonal {
				t.Fatalf("scope omission mismatch: %s", response.Body)
			}
			if _, hasMatrix := data["matrix"]; hasMatrix {
				t.Fatalf("pair response contains matrix: %s", response.Body)
			}
		})
	}
}

func TestCoStarTransientFailuresWriteBoundedRetryAfter(t *testing.T) {
	for _, testCase := range []struct {
		name       string
		code       costar.Code
		retryAfter time.Duration
		status     int
		wantHeader string
	}{
		{
			name: "busy upper bound", code: costar.CodeServerBusy,
			retryAfter: 90 * time.Second,
			status:     http.StatusServiceUnavailable,
			wantHeader: "60",
		},
		{
			name: "rate limited lower bound", code: costar.CodeRateLimited,
			retryAfter: 0,
			status:     http.StatusTooManyRequests,
			wantHeader: "1",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			failure, err := costar.NewTransientFailure(
				testCase.code,
				testCase.retryAfter,
				nil,
			)
			if err != nil {
				t.Fatal(err)
			}
			executor := &stubCoStarExecutor{
				execute: func(
					context.Context,
					costar.Request,
				) (costar.Projection, error) {
					return costar.Projection{}, failure
				},
			}
			handler := standaloneCoStarHandler(
				executor,
				nil,
				func() string { return "req-co-star-retry" },
			)
			response := performCoStarRequest(handler, validCoStarBody())
			assertCoStarError(
				t,
				response,
				testCase.status,
				errorCode(testCase.code),
				"",
			)
			if response.Header().Get("Retry-After") != testCase.wantHeader {
				t.Fatalf("Retry-After = %q", response.Header().Get("Retry-After"))
			}
		})
	}
}

func TestCoStarRejectEventUsesBoundedOperationAndFieldPath(t *testing.T) {
	var eventBytes bytes.Buffer
	events := observability.NewEventSink(&eventBytes)
	handler := standaloneCoStarHandler(
		nil,
		events,
		func() string { return "req-co-star-event" },
	)
	response := performCoStarRequest(
		handler,
		strings.TrimSuffix(validCoStarBody(), "}")+`,"unknown":true}`,
	)
	assertCoStarError(
		t,
		response,
		http.StatusBadRequest,
		codeInvalidRequest,
		"co-star request is invalid",
	)
	event := strings.TrimSpace(eventBytes.String())
	if !strings.Contains(event, `"operation":"co_star"`) ||
		!strings.Contains(event, `"error_code":"INVALID_REQUEST"`) {
		t.Fatalf("event = %q", event)
	}
}

func TestCoStarRegisteredRouteUsesTimeoutIdentityAndRejectsSuffix(t *testing.T) {
	dataVersion := "dv1-" + strings.Repeat("a", 64)
	executor := &stubCoStarExecutor{
		dataVersion: dataVersion,
		execute: func(
			ctx context.Context,
			_ costar.Request,
		) (costar.Projection, error) {
			<-ctx.Done()
			return costar.Projection{}, context.Cause(ctx)
		},
	}
	handler := newHandler(nil, nil, middlewareOptions{
		requestTimeout: 5 * time.Millisecond,
		requestID:      func() string { return "req-co-star-timeout" },
		coStar:         executor,
	})
	response := performCoStarRequest(handler, validCoStarBody())
	assertCoStarError(
		t,
		response,
		http.StatusGatewayTimeout,
		codeUpstreamTimeout,
		"co-star request timed out",
	)
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Meta.DataVersion == nil ||
		*envelope.Meta.DataVersion != dataVersion {
		t.Fatalf("timeout data version = %#v", envelope.Meta.DataVersion)
	}

	suffixRequest := httptest.NewRequest(
		http.MethodPost,
		routeCoStar+"/unexpected",
		strings.NewReader(validCoStarBody()),
	)
	suffixRequest.Header.Set("Content-Type", "application/json")
	suffixResponse := httptest.NewRecorder()
	handler.ServeHTTP(suffixResponse, suffixRequest)
	if suffixResponse.Code != http.StatusNotFound || executor.calls.Load() != 1 {
		t.Fatalf(
			"suffix route = %d, executor calls = %d",
			suffixResponse.Code,
			executor.calls.Load(),
		)
	}
}

func standaloneCoStarHandler(
	executor coStarExecutor,
	events *observability.EventSink,
	requestID func() string,
) http.Handler {
	routes := &routeHandler{events: events}
	base := http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		id, _ := RequestIDFromContext(request.Context())
		routes.writeCoStarWithExecutor(writer, request, id, executor)
	})
	return runtimeMiddleware(base, middlewareOptions{
		requestTimeout: time.Second,
		requestID:      requestID,
		events:         events,
	})
}

func performCoStarRequest(
	handler http.Handler,
	body string,
) *httptest.ResponseRecorder {
	request := httptest.NewRequest(
		http.MethodPost,
		routeCoStar,
		strings.NewReader(body),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func assertCoStarError(
	t *testing.T,
	response *httptest.ResponseRecorder,
	status int,
	code errorCode,
	message string,
) {
	t.Helper()
	if response.Code != status ||
		response.Header().Get("Content-Type") != "application/json" ||
		response.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("co-star error = %d %v %s", response.Code, response.Header(), response.Body)
	}
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Error.Code != code ||
		(message != "" && envelope.Error.Message != message) ||
		envelope.Meta.RequestId == "" {
		t.Fatalf("co-star error envelope = %+v", envelope)
	}
}

func validCoStarBody() string {
	return `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:1","staff:anime:2"]},"input":{"participants":[{"personId":1,"positionKeys":["staff:anime:1"]},{"personId":2,"positionKeys":["staff:anime:2"]}]}}`
}

func testCoStarProjection(scope string) costar.Projection {
	core := costar.Core{
		DataVersion: "dv1-" + strings.Repeat("a", 64),
		QueryDigest: "q1:" + strings.Repeat("b", 64),
		Scope:       scope,
		Kind:        "pair",
		WorkUnit:    statistics.UnitSubject,
		Participants: []costar.ParticipantCore{
			{
				Person:       costar.PersonReference{ID: 1, Name: "One"},
				PositionKeys: []string{"staff:anime:1"},
				Metrics:      costar.Metrics{WorkCount: 1},
			},
			{
				Person:       costar.PersonReference{ID: 2, Name: "Two"},
				PositionKeys: []string{"staff:anime:2"},
				Metrics:      costar.Metrics{WorkCount: 1},
			},
		},
		Summary: costar.Summary{
			UnionWorkCount:  2,
			CommonWorkCount: 0,
		},
		Tags:    costar.Tags{Meta: []costar.TagCount{}, Community: []costar.TagCount{}},
		Ratings: []costar.RatingDataset{},
		Matrix:  []costar.MatrixPair{},
	}
	projection := costar.Projection{
		Core:       core,
		Items:      []costar.WorkItem{},
		Pagination: costar.Pagination{Page: 1, PageSize: 10, Total: 0},
	}
	if scope == "personal" {
		zero := 0
		core.Summary.GlobalRatedWorkCount = &zero
		core.Tags.Personal = []costar.TagCount{}
		core.Preference = &costar.Preference{
			Mean:           nil,
			EvidenceWeight: statistics.Rational{Numerator: "0", Denominator: "1"},
			Score:          nil,
			Preferred:      []costar.PreferenceItem{},
			Conservative:   []costar.PreferenceItem{},
		}
		projection.Core = core
		projection.Collection = &costar.CollectionFreshness{
			FetchedAt:    time.Unix(0, 0).UTC(),
			WarningCodes: []string{},
		}
	}
	return projection
}
