package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/costar"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi/wire"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/partners"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/persondetail"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/ranking"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
)

// These adapters observe real service outcomes; they do not fabricate errors.
type deadlineObservedExecutor[Request, Projection any] struct {
	execute     func(context.Context, Request) (Projection, error)
	dataVersion string
	before      func(context.Context)
	observed    chan deadlineObservation
}

type deadlineObservation struct{ requestErr, err error }

func (e deadlineObservedExecutor[Request, Projection]) CurrentDataVersion() string {
	return e.dataVersion
}
func (e deadlineObservedExecutor[Request, Projection]) Execute(ctx context.Context, request Request) (Projection, error) {
	if e.before != nil {
		e.before(ctx)
	}
	result, err := e.execute(ctx, request)
	e.observed <- deadlineObservation{ctx.Err(), err}
	return result, err
}

func deadlineRealServices(t *testing.T, timeout time.Duration, before func(context.Context)) (middlewareOptions, <-chan deadlineObservation, string) {
	t.Helper()
	state := loadUnrestrictedHTTPArchive(t)
	var bindings []runtimecache.ResultBinding
	for _, bind := range []func() (runtimecache.ResultBinding, error){ranking.ResultBinding, persondetail.ResultBinding, partners.ResultBinding, costar.ResultBinding} {
		binding, err := bind()
		if err != nil {
			t.Fatal(err)
		}
		bindings = append(bindings, binding)
	}
	config := runtimecache.DefaultQueryRuntimeConfig()
	config.Result.LoadTimeout = timeout
	shared, err := runtimecache.NewQueryRuntime(config, bindings...)
	if err != nil {
		t.Fatal(err)
	}
	observed := make(chan deadlineObservation, 1)
	options := middlewareOptions{requestTimeout: time.Second, requestID: func() string { return "req-deadline-ownership" }}
	rankings, err := ranking.NewServiceWithRuntime(state.Current, nil, shared)
	if err != nil {
		t.Fatal(err)
	}
	options.rankings = deadlineObservedExecutor[ranking.Request, ranking.Projection]{
		execute: rankings.Execute, dataVersion: rankings.CurrentDataVersion(), before: before, observed: observed,
	}
	personDetail, err := persondetail.NewServiceWithRuntime(state.Current, nil, shared)
	if err != nil {
		t.Fatal(err)
	}
	options.personDetail = deadlineObservedExecutor[persondetail.Request, persondetail.Projection]{
		execute: personDetail.Execute, dataVersion: personDetail.CurrentDataVersion(), before: before, observed: observed,
	}
	partnerService, err := partners.NewServiceWithRuntime(state.Current, nil, shared)
	if err != nil {
		t.Fatal(err)
	}
	options.partners = deadlineObservedExecutor[partners.Request, partners.Projection]{
		execute: partnerService.Execute, dataVersion: partnerService.CurrentDataVersion(), before: before, observed: observed,
	}
	coStar, err := costar.NewServiceWithRuntime(state.Current, nil, shared)
	if err != nil {
		t.Fatal(err)
	}
	options.coStar = deadlineObservedExecutor[costar.Request, costar.Projection]{
		execute: coStar.Execute, dataVersion: coStar.CurrentDataVersion(), before: before, observed: observed,
	}
	return options, observed, rankings.CurrentDataVersion()
}

func TestDetachedDeadlineHTTPErrorOwnership(t *testing.T) {
	cases := []struct {
		name, route, body, message string
		response                   func(error) responseError
	}{
		{"rankings", routeRankings, `{"query":{"scope":"global","subjectType":"anime","positionScope":"all","positionKeys":[]}}`, "rankings request timed out", rankingsErrorResponse},
		{"person_detail", routePersonDetail, validPersonDetailBody(), "person detail request timed out", personDetailErrorResponse},
		{"partners", routePartners, validPartnersBody(), "partners request timed out", partnersErrorResponse},
		{"co_star", routeCoStar, `{"query":{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]},"input":{"participants":[{"personId":100,"positionKeys":["staff:anime:2"]},{"personId":101,"positionKeys":["staff:anime:2"]}]}}`, "co-star request timed out", coStarErrorResponse},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for _, owner := range []string{"detached_worker", "client_cancel", "request_deadline"} {
				t.Run(owner, func(t *testing.T) {
					ctx, cancel := context.WithCancel(context.Background())
					defer cancel()
					var before func(context.Context)
					loadTimeout := time.Nanosecond // Real detached runtime expiry, not a mocked error.
					if owner != "detached_worker" {
						loadTimeout = 20 * time.Second
						before = func(ctx context.Context) {
							if owner == "client_cancel" {
								cancel()
							}
							<-ctx.Done()
						}
					}
					options, observed, dataVersion := deadlineRealServices(t, loadTimeout, before)
					if owner == "request_deadline" {
						options.requestTimeout = 10 * time.Millisecond
					}
					var events bytes.Buffer
					options.events = observability.NewEventSink(&events)
					metrics := newTestMetrics(t)
					options.metrics = metrics
					routes := &routeHandler{events: options.events, rankings: options.rankings, personDetail: options.personDetail, partners: options.partners, coStar: options.coStar}
					finished := make(chan struct{})
					handler := runtimeMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
						defer close(finished)
						routes.ServeHTTP(w, r)
					}), options)
					request := httptest.NewRequest(http.MethodPost, tc.route, strings.NewReader(tc.body)).WithContext(ctx)
					request.Header.Set("Content-Type", "application/json")
					response := httptest.NewRecorder()
					if owner == "client_cancel" {
						serveExpectAbortHandler(t, handler, response, request)
					} else {
						handler.ServeHTTP(response, request)
					}
					select {
					case <-finished:
					case <-time.After(time.Second):
						t.Fatal("handler did not finish")
					}
					var outcome deadlineObservation
					select {
					case outcome = <-observed:
					default:
						t.Fatal("real service was not executed")
					}
					if owner == "client_cancel" {
						if !errors.Is(outcome.requestErr, context.Canceled) || !errors.Is(outcome.err, context.Canceled) {
							t.Fatalf("cancellation ownership = %+v", outcome)
						}
						if response.Body.Len() != 0 || response.Header().Get("Content-Type") != "" || events.Len() != 0 {
							t.Fatalf("cancellation wrote response/event: %s %s", response.Body, &events)
						}
						assertMetricContains(t, metrics, `outcome="canceled"`, `status_class="none"`)
						return
					}
					if owner == "detached_worker" {
						if outcome.requestErr != nil || !errors.Is(outcome.err, context.DeadlineExceeded) {
							t.Fatalf("detached ownership = %+v", outcome)
						}
						code, ok := runtimecache.ErrorCode(outcome.err)
						if !ok || code != runtimecache.CodeTimeout || tc.response(outcome.err).code != codeUpstreamTimeout {
							t.Fatalf("not a typed runtime/service timeout: %v", outcome.err)
						}
					} else if outcome.requestErr == nil || !errors.Is(outcome.err, requestDeadlineCause) {
						t.Fatalf("middleware deadline ownership = %+v", outcome)
					}
					t.Logf("owner=%s HTTP=%d bodyBytes=%d events=%q", owner, response.Code, response.Body.Len(), events.String())
					assertRankingsError(t, response, http.StatusGatewayTimeout, codeUpstreamTimeout, tc.message)
					var envelope wire.ErrorEnvelopeV1
					if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
						t.Fatal(err)
					}
					if !envelope.Error.Retryable || envelope.Meta.RequestId != "req-deadline-ownership" || envelope.Meta.DataVersion == nil || *envelope.Meta.DataVersion != dataVersion {
						t.Fatalf("timeout envelope = %+v", envelope)
					}
					if !strings.Contains(response.Body.String(), `"fieldErrors":{}`) || strings.Contains(response.Body.String(), "context deadline exceeded") {
						t.Fatalf("unsafe timeout envelope: %s", response.Body)
					}
					lines := strings.Split(strings.TrimSpace(events.String()), "\n")
					if len(lines) != 1 || !strings.Contains(lines[0], `"operation":"`+tc.name+`"`) || !strings.Contains(lines[0], `"error_code":"UPSTREAM_TIMEOUT"`) || !strings.Contains(lines[0], `"query_rejected"`) {
						t.Fatalf("terminal events = %q", events.String())
					}
					assertMetricContains(t, metrics, `status_class="5xx"`, `operation="`+tc.name+`"`)
				})
			}
		})
	}
}
