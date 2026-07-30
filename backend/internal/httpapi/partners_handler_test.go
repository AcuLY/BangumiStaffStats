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
	"github.com/AcuLY/BangumiStaffStats/backend/internal/partners"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

type stubPartnersExecutor struct {
	execute     func(context.Context, partners.Request) (partners.Projection, error)
	dataVersion string
	calls       atomic.Int64
}

func (stub *stubPartnersExecutor) Execute(
	ctx context.Context,
	request partners.Request,
) (partners.Projection, error) {
	stub.calls.Add(1)
	if stub.execute == nil {
		return partners.Projection{}, errors.New("unexpected partners execution")
	}
	return stub.execute(ctx, request)
}

func (stub *stubPartnersExecutor) CurrentDataVersion() string {
	return stub.dataVersion
}

func TestPartnersStrictTransportRejectsBeforeExecution(t *testing.T) {
	executor := &stubPartnersExecutor{
		execute: func(
			context.Context,
			partners.Request,
		) (partners.Projection, error) {
			return partners.Projection{}, errors.New("must not execute")
		},
	}
	handler := standalonePartnersHandler(
		executor,
		nil,
		func() string { return "req-partners-strict" },
	)
	valid := validPartnersBody()
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
			name: "method", method: http.MethodGet, target: routePartners,
			status: http.StatusMethodNotAllowed, code: codeInvalidRequest,
			message: "method not allowed", allow: http.MethodPost,
		},
		{
			name: "query", method: http.MethodPost, target: routePartners + "?page=1",
			body: valid, contentType: "application/json",
			status: http.StatusBadRequest, code: codeInvalidRequest,
			message: "partners does not accept query parameters",
		},
		{
			name: "media parameters", method: http.MethodPost, target: routePartners,
			body: valid, contentType: "application/json; charset=utf-8",
			status: http.StatusUnsupportedMediaType, code: codeUnsupportedMediaType,
			message: "partners requires application/json",
		},
		{
			name: "content encoding", method: http.MethodPost, target: routePartners,
			body: valid, contentType: "application/json", contentEncode: "identity",
			status: http.StatusUnsupportedMediaType, code: codeUnsupportedMediaType,
			message: "partners requires application/json",
		},
		{
			name: "refresh forbidden", method: http.MethodPost, target: routePartners,
			body:        strings.TrimSuffix(valid, "}") + `,"refreshCollection":true}`,
			contentType: "application/json", status: http.StatusBadRequest,
			code: codeInvalidRequest, message: "partners request is invalid",
		},
		{
			name: "missing input", method: http.MethodPost, target: routePartners,
			body:        `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}}`,
			contentType: "application/json", status: http.StatusBadRequest,
			code: codeInvalidRequest, message: "partners request is invalid",
		},
		{
			name: "non-object", method: http.MethodPost, target: routePartners,
			body: `[]`, contentType: "application/json",
			status: http.StatusBadRequest, code: codeInvalidRequest,
			message: "partners request is invalid",
		},
		{
			name: "second document", method: http.MethodPost, target: routePartners,
			body: valid + ` {}`, contentType: "application/json",
			status: http.StatusBadRequest, code: codeInvalidJSON,
			message: "request body must contain one JSON document",
		},
		{
			name: "too large by length", method: http.MethodPost, target: routePartners,
			body: valid, contentType: "application/json",
			status: http.StatusRequestEntityTooLarge, code: codeRequestTooLarge,
			message:       "partners request body is too large",
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
			assertPartnersError(
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

func TestPartnersTransportPreservesExactOperationDocuments(t *testing.T) {
	privateFailure := errors.New("partners stub complete")
	executor := &stubPartnersExecutor{
		execute: func(
			_ context.Context,
			request partners.Request,
		) (partners.Projection, error) {
			if string(request.Query) !=
				`{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}` ||
				string(request.Input) !=
					`{"source":{"personId":1e2,"positionKeys":["staff:anime:2"]}}` ||
				string(request.View) != `{"page":1e0,"pageSize":2e1}` {
				t.Fatalf("partners request changed: %+v", request)
			}
			return partners.Projection{}, privateFailure
		},
	}
	handler := standalonePartnersHandler(
		executor,
		nil,
		func() string { return "req-partners-documents" },
	)
	response := performPartnersRequest(
		handler,
		`{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"source":{"personId":1e2,"positionKeys":["staff:anime:2"]}},"view":{"page":1e0,"pageSize":2e1}}`,
	)
	assertPartnersError(
		t,
		response,
		http.StatusInternalServerError,
		codeInternalError,
		"partners is unavailable",
	)
	if executor.calls.Load() != 1 ||
		strings.Contains(response.Body.String(), privateFailure.Error()) {
		t.Fatalf("execution/body = %d %s", executor.calls.Load(), response.Body)
	}
}

func TestPartnersDecoderRejectsInvalidUTF8AndStreamingOverflow(t *testing.T) {
	executor := &stubPartnersExecutor{
		execute: func(
			context.Context,
			partners.Request,
		) (partners.Projection, error) {
			return partners.Projection{}, errors.New("must not execute")
		},
	}
	handler := standalonePartnersHandler(
		executor,
		nil,
		func() string { return "req-partners-body" },
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
				routePartners,
				bytes.NewReader(testCase.body),
			)
			request.Header.Set("Content-Type", "application/json")
			request.ContentLength = -1
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			assertPartnersError(t, response, testCase.status, testCase.code, "")
		})
	}
	if executor.calls.Load() != 0 {
		t.Fatalf("invalid bodies executed service %d times", executor.calls.Load())
	}
}

func TestPartnersCanceledExecutionDoesNotCommit(t *testing.T) {
	executor := &stubPartnersExecutor{
		execute: func(
			ctx context.Context,
			_ partners.Request,
		) (partners.Projection, error) {
			return partners.Projection{}, context.Cause(ctx)
		},
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	request := httptest.NewRequest(
		http.MethodPost,
		routePartners,
		strings.NewReader(validPartnersBody()),
	).WithContext(ctx)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	routes := &routeHandler{}
	routes.writePartnersWithExecutor(
		response,
		request,
		"req-partners-canceled",
		executor,
	)
	if response.Body.Len() != 0 || response.Header().Get("Content-Type") != "" {
		t.Fatalf("canceled execution committed response: %v %s", response.Header(), response.Body)
	}
}

func TestPartnersSuccessEnforcesScopeOmissions(t *testing.T) {
	for _, scope := range []string{"global", "personal"} {
		t.Run(scope, func(t *testing.T) {
			projection := testPartnersProjection(t, scope)
			executor := &stubPartnersExecutor{
				execute: func(
					context.Context,
					partners.Request,
				) (partners.Projection, error) {
					return projection, nil
				},
			}
			handler := standalonePartnersHandler(
				executor,
				nil,
				func() string { return "req-partners-" + scope },
			)
			response := performPartnersRequest(handler, validPartnersBody())
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
			item := data["items"].([]any)[0].(map[string]any)
			_, hasCollection := meta["collection"]
			_, hasPreference := item["preference"]
			wantPersonal := scope == "personal"
			if hasCollection != wantPersonal || hasPreference != wantPersonal {
				t.Fatalf("scope omission mismatch: %s", response.Body)
			}
		})
	}
}

func TestPartnersMapsPublicInputAndEntityFailures(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		err    error
		status int
		code   errorCode
		path   string
	}{
		{
			name:   "source identity mismatch",
			err:    partnersBuildFailure(t, false),
			status: http.StatusBadRequest,
			code:   errorCode(partners.CodeFieldInvalid),
			path:   "/input/source/positionKeys/0",
		},
		{
			name:   "source entity absent",
			err:    partnersBuildFailure(t, true),
			status: http.StatusNotFound,
			code:   codeEntityNotFound,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			executor := &stubPartnersExecutor{
				execute: func(
					context.Context,
					partners.Request,
				) (partners.Projection, error) {
					return partners.Projection{}, testCase.err
				},
			}
			handler := standalonePartnersHandler(
				executor,
				nil,
				func() string { return "req-partners-domain" },
			)
			response := performPartnersRequest(handler, validPartnersBody())
			assertPartnersError(t, response, testCase.status, testCase.code, "")
			if testCase.path != "" {
				var envelope wire.ErrorEnvelopeV1
				if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
					t.Fatal(err)
				}
				if _, found := envelope.Error.FieldErrors[testCase.path]; !found {
					t.Fatalf("field error missing: %+v", envelope.Error.FieldErrors)
				}
			}
		})
	}
}

func TestPartnersTransientFailuresWriteBoundedRetryAfter(t *testing.T) {
	for _, testCase := range []struct {
		name       string
		code       partners.Code
		retryAfter time.Duration
		status     int
		wantHeader string
	}{
		{
			name: "busy upper bound", code: partners.CodeServerBusy,
			retryAfter: 90 * time.Second,
			status:     http.StatusServiceUnavailable,
			wantHeader: "60",
		},
		{
			name: "rate limited lower bound", code: partners.CodeRateLimited,
			retryAfter: 0,
			status:     http.StatusTooManyRequests,
			wantHeader: "1",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			failure, err := partners.NewTransientFailure(
				testCase.code,
				testCase.retryAfter,
				nil,
			)
			if err != nil {
				t.Fatal(err)
			}
			executor := &stubPartnersExecutor{
				execute: func(
					context.Context,
					partners.Request,
				) (partners.Projection, error) {
					return partners.Projection{}, failure
				},
			}
			handler := standalonePartnersHandler(
				executor,
				nil,
				func() string { return "req-partners-retry" },
			)
			response := performPartnersRequest(handler, validPartnersBody())
			assertPartnersError(
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

func TestPartnersRejectEventUsesBoundedOperationAndFieldPath(t *testing.T) {
	var eventBytes bytes.Buffer
	events := observability.NewEventSink(&eventBytes)
	handler := standalonePartnersHandler(
		nil,
		events,
		func() string { return "req-partners-event" },
	)
	response := performPartnersRequest(
		handler,
		strings.TrimSuffix(validPartnersBody(), "}")+`,"unknown":true}`,
	)
	assertPartnersError(
		t,
		response,
		http.StatusBadRequest,
		codeInvalidRequest,
		"partners request is invalid",
	)
	event := strings.TrimSpace(eventBytes.String())
	if !strings.Contains(event, `"operation":"partners"`) ||
		!strings.Contains(event, `"error_code":"INVALID_REQUEST"`) {
		t.Fatalf("event = %q", event)
	}
}

func TestPartnersRegisteredRouteUsesTimeoutIdentityAndRejectsSuffix(t *testing.T) {
	dataVersion := "dv1-" + strings.Repeat("a", 64)
	executor := &stubPartnersExecutor{
		dataVersion: dataVersion,
		execute: func(
			ctx context.Context,
			_ partners.Request,
		) (partners.Projection, error) {
			<-ctx.Done()
			return partners.Projection{}, context.Cause(ctx)
		},
	}
	handler := newHandler(nil, nil, middlewareOptions{
		requestTimeout: 5 * time.Millisecond,
		requestID:      func() string { return "req-partners-timeout" },
		partners:       executor,
	})
	response := performPartnersRequest(handler, validPartnersBody())
	assertPartnersError(
		t,
		response,
		http.StatusGatewayTimeout,
		codeUpstreamTimeout,
		"partners request timed out",
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
		routePartners+"/unexpected",
		strings.NewReader(validPartnersBody()),
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

func standalonePartnersHandler(
	executor partnersExecutor,
	events *observability.EventSink,
	requestID func() string,
) http.Handler {
	routes := &routeHandler{events: events}
	base := http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		id, _ := RequestIDFromContext(request.Context())
		routes.writePartnersWithExecutor(writer, request, id, executor)
	})
	return runtimeMiddleware(base, middlewareOptions{
		requestTimeout: time.Second,
		requestID:      requestID,
		events:         events,
	})
}

func performPartnersRequest(
	handler http.Handler,
	body string,
) *httptest.ResponseRecorder {
	request := httptest.NewRequest(
		http.MethodPost,
		routePartners,
		strings.NewReader(body),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func assertPartnersError(
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
		t.Fatalf("partners error headers = %v", response.Header())
	}
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Error.Code != code || envelope.Meta.RequestId == "" {
		t.Fatalf("partners error envelope = %+v", envelope)
	}
	if message != "" && envelope.Error.Message != message {
		t.Fatalf("message = %q, want %q", envelope.Error.Message, message)
	}
}

func validPartnersBody() string {
	return `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"source":{"personId":100,"positionKeys":["staff:anime:2"]}}}`
}

func testPartnersProjection(t *testing.T, scope string) partners.Projection {
	t.Helper()
	partner := partners.PartnerCore{
		Person:       partners.PersonReference{ID: 2, Name: "Partner"},
		PositionKeys: []string{"staff:anime:2"},
		Metrics:      partners.Metrics{WorkCount: 1},
	}
	leaders := []partners.Leader{
		{Metric: partners.SortCount, Item: &partner},
		{Metric: partners.SortAverage},
		{Metric: partners.SortOverall},
	}
	var collection *partners.CollectionFreshness
	if scope == "personal" {
		partner.Preference = &partners.Preference{
			EvidenceWeight: statistics.Rational{
				Numerator: "0", Denominator: "1",
			},
		}
		leaders[0].Item = &partner
		leaders = append(leaders, partners.Leader{Metric: partners.SortPreference})
		collection = &partners.CollectionFreshness{
			FetchedAt:    time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC),
			WarningCodes: []string{},
		}
	}
	projection, err := partners.NewProjection(
		partners.Page{
			WorkUnit: statistics.UnitSubject,
			Source: partners.SourceCore{
				Person:       partners.PersonReference{ID: 1, Name: "Source"},
				PositionKeys: []string{"staff:anime:2"},
				Metrics:      partners.SourceMetrics{WorkCount: 1},
			},
			Summary: partners.Summary{
				PartnerCount: 1,
				Leaders:      leaders,
			},
			Items: []partners.Item{{
				Rank:        1,
				PartnerCore: partner,
			}},
			Page: 1, PageSize: 10, Total: 1,
		},
		"dv1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		scope,
		collection,
	)
	if err != nil {
		t.Fatal(err)
	}
	return projection
}

func partnersBuildFailure(t *testing.T, missingSource bool) error {
	t.Helper()
	people := []partners.PersonReference{{ID: 1, Name: "Source"}}
	candidateID := int64(2)
	if missingSource {
		people = nil
		candidateID = 1
	}
	_, err := partners.Build(context.Background(), partners.BuildRequest{
		DataVersion: "dv1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Query: query.Result{
			EffectiveQuery: query.EffectiveQuery{
				Scope:        "global",
				SubjectType:  "anime",
				PositionKeys: []string{"staff:anime:2"},
			},
			QueryDigest: "q1:test",
			PositionResults: []query.PositionResult{{
				PositionKey:        "staff:anime:2",
				CandidatePersonIDs: []int64{candidateID},
				Contributions: []query.Contribution{{
					PositionKey: "staff:anime:2",
					Kind:        "staff",
					SubjectID:   1,
					PersonID:    candidateID,
					PositionID:  2,
				}},
			}},
		},
		Input: partners.Input{Source: partners.SourceInput{
			PersonID:     1,
			PositionKeys: []string{"staff:anime:2"},
		}},
		People: people,
	})
	if err == nil {
		t.Fatal("expected partners build failure")
	}
	return err
}
