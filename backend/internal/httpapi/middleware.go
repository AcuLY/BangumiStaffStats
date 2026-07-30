package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/querytiming"
)

// DefaultRequestTimeout bounds downstream request work.
const DefaultRequestTimeout = 30 * time.Second

const requestIDHeader = "X-Request-ID"

var (
	requestDeadlineCause = errors.New("httpapi: request deadline")
	responseTerminated   = errors.New("httpapi: response terminated")
	fallbackRequestID    atomic.Uint64
)

type requestIDContextKey struct{}

// RequestIDFromContext returns the server-generated request ID.
func RequestIDFromContext(ctx context.Context) (string, bool) {
	value, ok := ctx.Value(requestIDContextKey{}).(string)
	return value, ok && value != ""
}

type middlewareOptions struct {
	requestTimeout   time.Duration
	requestID        func() string
	metrics          *observability.Registry
	images           imageFetcher
	events           *observability.EventSink
	catalogs         CatalogStoreProvider
	catalogProjector catalogProjector
	rankings         rankingsExecutor
	candidates       candidatesExecutor
	personDetail     personDetailExecutor
	partners         partnersExecutor
	coStar           coStarExecutor
}

func runtimeMiddleware(handler http.Handler, options middlewareOptions) http.Handler {
	if handler == nil {
		handler = http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	}
	if options.requestTimeout <= 0 {
		options.requestTimeout = DefaultRequestTimeout
	}
	if options.requestID == nil {
		options.requestID = generateRequestID
	}

	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		startedAt := time.Now()
		requestID := options.requestID()
		if requestID == "" {
			requestID = generateRequestID()
		}
		request.Header.Del(requestIDHeader)

		recorder := newCommitWriter(writer, requestID)
		recorder.Header().Set(requestIDHeader, requestID)

		identityContext := context.WithValue(request.Context(), requestIDContextKey{}, requestID)
		var queryTerminal *observability.QueryTerminal
		if metricRoute(request) == observability.RouteCatalog {
			queryTerminal, _ = observability.NewQueryTerminal(
				requestID,
				observability.QueryOperationCatalog,
			)
			if queryTerminal != nil {
				identityContext = context.WithValue(
					identityContext,
					catalogTerminalContextKey{},
					queryTerminal,
				)
			}
		}
		if metricRoute(request) == observability.RouteRankings {
			queryTerminal, _ = observability.NewQueryTerminal(
				requestID,
				observability.QueryOperationRankings,
			)
			if queryTerminal != nil {
				identityContext = context.WithValue(
					identityContext,
					rankingsTerminalContextKey{},
					queryTerminal,
				)
			}
		}
		if metricRoute(request) == observability.RouteCandidates {
			queryTerminal, _ = observability.NewQueryTerminal(
				requestID,
				observability.QueryOperationCandidates,
			)
			if queryTerminal != nil {
				identityContext = context.WithValue(
					identityContext,
					candidatesTerminalContextKey{},
					queryTerminal,
				)
			}
		}
		if metricRoute(request) == observability.RoutePersonDetail {
			queryTerminal, _ = observability.NewQueryTerminal(
				requestID,
				observability.QueryOperationPerson,
			)
			if queryTerminal != nil {
				identityContext = context.WithValue(
					identityContext,
					personDetailTerminalContextKey{},
					queryTerminal,
				)
			}
		}
		if metricRoute(request) == observability.RoutePartners {
			queryTerminal, _ = observability.NewQueryTerminal(
				requestID,
				observability.QueryOperationPartners,
			)
			if queryTerminal != nil {
				identityContext = context.WithValue(
					identityContext,
					partnersTerminalContextKey{},
					queryTerminal,
				)
			}
		}
		if metricRoute(request) == observability.RouteCoStar {
			queryTerminal, _ = observability.NewQueryTerminal(
				requestID,
				observability.QueryOperationCoStar,
			)
			if queryTerminal != nil {
				identityContext = context.WithValue(
					identityContext,
					coStarTerminalContextKey{},
					queryTerminal,
				)
			}
		}
		var timingTrace *querytiming.Trace
		if timedBusinessRoute(metricRoute(request)) {
			timingTrace = querytiming.New()
			identityContext = querytiming.WithContext(
				identityContext,
				timingTrace,
			)
		}
		requestDeadline := startedAt.Add(options.requestTimeout)
		effectiveDeadline := requestDeadline
		if parentDeadline, ok := identityContext.Deadline(); ok &&
			parentDeadline.Before(effectiveDeadline) {
			effectiveDeadline = parentDeadline
		}
		requestContext, cancel := context.WithCancelCause(deadlineContext{
			Context:  context.WithoutCancel(identityContext),
			deadline: effectiveDeadline,
		})
		defer cancel(nil)
		timeoutTimer := time.NewTimer(max(time.Until(requestDeadline), 0))
		defer timeoutTimer.Stop()
		request = request.WithContext(requestContext)
		recorder.setContext(requestContext)
		recorder.setTrace(timingTrace)

		type handlerResult struct {
			panicValue any
		}
		handlerDone := make(chan handlerResult, 1)
		go func() {
			result := handlerResult{}
			defer func() {
				result.panicValue = recover()
				handlerDone <- result
			}()
			handler.ServeHTTP(recorder, request)
		}()

		var snapshot responseSnapshot
		var outcome observability.Outcome
		var abortConnection bool
		select {
		case result := <-handlerDone:
			if cause := context.Cause(identityContext); cause != nil {
				snapshot, outcome = finishContextOutcome(
					recorder,
					cause,
					timeoutResponseForRequest(
						request,
						options.rankings,
						options.candidates,
						options.personDetail,
						options.partners,
						options.coStar,
					),
				)
				cancel(cause)
				break
			}
			if !time.Now().Before(requestDeadline) {
				snapshot, outcome = finishContextOutcome(
					recorder,
					requestDeadlineCause,
					timeoutResponseForRequest(
						request,
						options.rankings,
						options.candidates,
						options.personDetail,
						options.partners,
						options.coStar,
					),
				)
				cancel(requestDeadlineCause)
				break
			}
			if result.panicValue != nil {
				if errors.Is(panicError(result.panicValue), http.ErrAbortHandler) &&
					recorder.isCommitted() {
					snapshot = recorder.terminate(nil)
					outcome = observability.OutcomeError
					abortConnection = true
				} else {
					snapshot = recorder.terminate(
						internalResponseForRequest(
							request,
							options.rankings,
							options.candidates,
							options.personDetail,
							options.partners,
							options.coStar,
						),
					)
					outcome = observability.OutcomePanic
				}
				break
			}
			snapshot = recorder.finish()
			outcome = outcomeForStatus(snapshot.status)
		case <-timeoutTimer.C:
			snapshot, outcome = finishContextOutcome(
				recorder,
				requestDeadlineCause,
				timeoutResponseForRequest(
					request,
					options.rankings,
					options.candidates,
					options.personDetail,
					options.partners,
					options.coStar,
				),
			)
			cancel(requestDeadlineCause)
		case <-identityContext.Done():
			cause := context.Cause(identityContext)
			snapshot, outcome = finishContextOutcome(
				recorder,
				cause,
				timeoutResponseForRequest(
					request,
					options.rankings,
					options.candidates,
					options.personDetail,
					options.partners,
					options.coStar,
				),
			)
			cancel(cause)
		}

		if options.metrics != nil {
			_ = options.metrics.ObserveRequest(observability.RequestObservation{
				Route:         metricRoute(request),
				Operation:     metricOperation(request),
				Method:        metricMethod(request),
				StatusClass:   metricStatusClass(snapshot.status),
				Outcome:       outcome,
				Duration:      time.Since(startedAt),
				ResponseBytes: snapshot.bytes,
			})
			if snapshot.timingPresent {
				_ = options.metrics.ObserveQueryExecution(
					queryExecutionObservation(
						metricOperation(request),
						snapshot.timing,
					),
				)
			}
		}
		if options.events != nil &&
			(metricRoute(request) == observability.RouteCatalog ||
				metricRoute(request) == observability.RouteRankings ||
				metricRoute(request) == observability.RouteCandidates ||
				metricRoute(request) == observability.RoutePersonDetail ||
				metricRoute(request) == observability.RoutePartners ||
				metricRoute(request) == observability.RouteCoStar) &&
			snapshot.committed &&
			(outcome == observability.OutcomeTimeout ||
				outcome == observability.OutcomePanic) &&
			queryTerminal != nil {
			if snapshot.status >= 200 && snapshot.status <= 399 {
				event, eventErr := queryTerminal.CompleteWithExecution(
					time.Since(startedAt),
					snapshot.bytes,
					queryExecutionFacts(snapshot.timing),
				)
				if eventErr == nil {
					_ = options.events.Emit(event)
				}
			} else {
				code := observability.QueryErrorInternal
				if outcome == observability.OutcomeTimeout {
					code = observability.QueryErrorUpstreamTimeout
				}
				event, eventErr := queryTerminal.RejectWithExecution(
					snapshot.status,
					code,
					nil,
					0,
					time.Since(startedAt),
					queryExecutionFacts(snapshot.timing),
				)
				if eventErr == nil {
					_ = options.events.Emit(event)
				}
			}
		}
		if outcome == observability.OutcomeCanceled && !snapshot.committed {
			panic(http.ErrAbortHandler)
		}
		if abortConnection {
			panic(http.ErrAbortHandler)
		}
	})
}

type deadlineContext struct {
	context.Context
	deadline time.Time
}

func (ctx deadlineContext) Deadline() (time.Time, bool) {
	return ctx.deadline, true
}

func panicError(value any) error {
	err, _ := value.(error)
	return err
}

func finishContextOutcome(
	recorder *commitWriter,
	cause error,
	timeout *responseError,
) (responseSnapshot, observability.Outcome) {
	if errors.Is(cause, requestDeadlineCause) {
		if timeout == nil {
			timeout = &timeoutResponse
		}
		return recorder.terminate(timeout), observability.OutcomeTimeout
	}
	return recorder.terminate(nil), observability.OutcomeCanceled
}

func generateRequestID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err == nil {
		return hex.EncodeToString(value[:])
	}
	// rand.Read documents that it never returns an error on supported systems.
	// Keep the invariant non-empty even if that platform guarantee changes.
	return fmt.Sprintf("%032x", fallbackRequestID.Add(1))
}

func metricRoute(request *http.Request) observability.Route {
	if request == nil || request.URL == nil {
		return observability.RouteUnknown
	}
	switch request.URL.Path {
	case routeLivez:
		return observability.RouteLivez
	case routeReadyz:
		return observability.RouteReadyz
	case routeMetrics:
		return observability.RouteMetrics
	case routeCatalog:
		return observability.RouteCatalog
	case routeRankings:
		return observability.RouteRankings
	case routeCandidates:
		return observability.RouteCandidates
	case routePersonDetail:
		return observability.RoutePersonDetail
	case routePartners:
		return observability.RoutePartners
	case routeCoStar:
		return observability.RouteCoStar
	default:
		if imageRouteCandidate(request) {
			return observability.RouteImage
		}
		return observability.RouteUnknown
	}
}

func metricOperation(request *http.Request) observability.Operation {
	switch metricRoute(request) {
	case observability.RouteLivez, observability.RouteReadyz:
		return observability.OperationHealth
	case observability.RouteMetrics:
		return observability.OperationMetrics
	case observability.RouteImage:
		return observability.OperationImage
	case observability.RouteCatalog:
		return observability.OperationCatalog
	case observability.RouteRankings:
		return observability.OperationRankings
	case observability.RouteCandidates:
		return observability.OperationCandidates
	case observability.RoutePersonDetail:
		return observability.OperationPersonDetail
	case observability.RoutePartners:
		return observability.OperationPartners
	case observability.RouteCoStar:
		return observability.OperationCoStar
	default:
		return observability.OperationUnknown
	}
}

func metricMethod(request *http.Request) observability.Method {
	if request != nil && request.Method == http.MethodGet {
		return observability.MethodGET
	}
	if request != nil && request.Method == http.MethodPost {
		return observability.MethodPOST
	}
	return observability.MethodOther
}

func metricStatusClass(status int) observability.StatusClass {
	switch {
	case status == 0:
		return observability.StatusNone
	case status >= 200 && status <= 299:
		return observability.Status2xx
	case status >= 300 && status <= 399:
		return observability.Status3xx
	case status >= 400 && status <= 499:
		return observability.Status4xx
	default:
		return observability.Status5xx
	}
}

func outcomeForStatus(status int) observability.Outcome {
	switch {
	case status >= 200 && status <= 399:
		return observability.OutcomeSuccess
	case status >= 400 && status <= 499:
		return observability.OutcomeRejected
	default:
		return observability.OutcomeError
	}
}

func timedBusinessRoute(route observability.Route) bool {
	switch route {
	case observability.RouteRankings,
		observability.RouteCandidates,
		observability.RoutePersonDetail,
		observability.RoutePartners,
		observability.RouteCoStar:
		return true
	default:
		return false
	}
}

func queryExecutionObservation(
	operation observability.Operation,
	snapshot querytiming.Snapshot,
) observability.QueryExecutionObservation {
	upstream := snapshot.CollectionUpstream()
	return observability.QueryExecutionObservation{
		Operation:       operation,
		Scope:           observability.QueryScope(snapshot.Scope()),
		ResultCache:     observability.CacheOutcome(snapshot.ResultCache()),
		CollectionCache: observability.CacheOutcome(snapshot.CollectionCache()),
		Phases:          queryPhaseObservations(snapshot),
		SQLiteOutcome: observability.DependencyOutcome(
			snapshot.SQLiteOutcome(),
		),
		CollectionUpstream: observability.DependencyObservation{
			Outcome: observability.DependencyOutcome(upstream.Outcome),
			Seconds: upstream.Seconds,
			Present: upstream.Present,
		},
	}
}

func queryExecutionFacts(
	snapshot querytiming.Snapshot,
) observability.QueryExecutionFacts {
	return observability.QueryExecutionFacts{
		Scope:           observability.QueryScope(snapshot.Scope()),
		ResultCache:     observability.CacheOutcome(snapshot.ResultCache()),
		CollectionCache: observability.CacheOutcome(snapshot.CollectionCache()),
		Phases:          queryPhaseObservations(snapshot),
	}
}

func queryExecutionFactsFromContext(
	ctx context.Context,
) observability.QueryExecutionFacts {
	trace := querytiming.FromContext(ctx)
	if trace == nil {
		return observability.QueryExecutionFacts{}
	}
	return queryExecutionFacts(trace.Freeze())
}

func queryExecutionFactsForRequest(
	request *http.Request,
) observability.QueryExecutionFacts {
	if request == nil {
		return observability.QueryExecutionFacts{}
	}
	return queryExecutionFactsFromContext(request.Context())
}

func queryPhaseObservations(
	snapshot querytiming.Snapshot,
) []observability.QueryPhaseObservation {
	phases := snapshot.Phases()
	result := make(
		[]observability.QueryPhaseObservation,
		0,
		len(phases),
	)
	for _, phase := range phases {
		result = append(result, observability.QueryPhaseObservation{
			Phase:   observability.QueryPhase(phase.Phase),
			Seconds: phase.Seconds,
		})
	}
	return result
}

type responseSnapshot struct {
	committed     bool
	status        int
	bytes         int64
	timing        querytiming.Snapshot
	timingPresent bool
}

type commitWriter struct {
	mu sync.Mutex

	writer       http.ResponseWriter
	header       http.Header
	requestID    string
	context      context.Context
	trace        *querytiming.Trace
	committed    bool
	terminal     bool
	status       int
	bytes        int64
	timing       querytiming.Snapshot
	timingFrozen bool
}

func newCommitWriter(writer http.ResponseWriter, requestID string) *commitWriter {
	header := writer.Header().Clone()
	header.Set(requestIDHeader, requestID)
	writer.Header().Set(requestIDHeader, requestID)
	return &commitWriter{
		writer:    writer,
		header:    header,
		requestID: requestID,
	}
}

func (w *commitWriter) Header() http.Header {
	return w.header
}

func (w *commitWriter) setContext(ctx context.Context) {
	w.mu.Lock()
	w.context = ctx
	w.mu.Unlock()
}

func (w *commitWriter) setTrace(trace *querytiming.Trace) {
	w.mu.Lock()
	w.trace = trace
	w.mu.Unlock()
}

func (w *commitWriter) isCommitted() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.committed
}

func (w *commitWriter) WriteHeader(status int) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.rejectWrite() || w.committed {
		return
	}
	w.ensureRequestID()
	w.freezeTiming()
	w.syncHeader()
	w.writer.WriteHeader(status)
	w.committed = true
	w.status = status
}

func (w *commitWriter) Write(data []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.rejectWrite() {
		return 0, responseTerminated
	}
	if !w.committed {
		w.ensureRequestID()
		w.freezeTiming()
		w.syncHeader()
		w.writer.WriteHeader(http.StatusOK)
		w.committed = true
		w.status = http.StatusOK
	}
	written, err := w.writer.Write(data)
	w.bytes += int64(written)
	return written, err
}

func (w *commitWriter) Flush() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.rejectWrite() {
		return
	}
	if !w.committed {
		w.ensureRequestID()
		w.freezeTiming()
		w.syncHeader()
		w.writer.WriteHeader(http.StatusOK)
		w.committed = true
		w.status = http.StatusOK
	}
	if flusher, ok := w.writer.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (w *commitWriter) ensureRequestID() {
	w.header.Set(requestIDHeader, w.requestID)
}

func (w *commitWriter) freezeTiming() {
	if !w.captureTiming() {
		return
	}
	if value := w.timing.ServerTiming(); value != "" {
		w.header.Set("Server-Timing", value)
	}
}

func (w *commitWriter) captureTiming() bool {
	if w.timingFrozen || w.trace == nil {
		return false
	}
	w.timing = w.trace.Freeze()
	w.timingFrozen = true
	return true
}

func (w *commitWriter) syncHeader() {
	target := w.writer.Header()
	for name := range target {
		delete(target, name)
	}
	for name, values := range w.header {
		target[name] = append([]string(nil), values...)
	}
}

func (w *commitWriter) rejectWrite() bool {
	return w.terminal || w.context != nil && w.context.Err() != nil
}

func (w *commitWriter) finish() responseSnapshot {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.terminal = true
	status := w.status
	w.freezeTiming()
	if status == 0 {
		w.ensureRequestID()
		w.syncHeader()
		status = http.StatusOK
	}
	return responseSnapshot{
		committed:     w.committed,
		status:        status,
		bytes:         w.bytes,
		timing:        w.timing,
		timingPresent: w.timingFrozen,
	}
}

func (w *commitWriter) terminate(response *responseError) responseSnapshot {
	w.mu.Lock()
	defer w.mu.Unlock()
	if !w.terminal && !w.committed && response != nil {
		w.resetForError(*response)
		w.captureTiming()
		if value := w.timing.ServerTiming(); value != "" {
			w.writer.Header().Set("Server-Timing", value)
		}
		data := errorEnvelopeBytes(w.requestID, *response)
		w.writer.WriteHeader(response.status)
		w.committed = true
		w.status = response.status
		written, _ := w.writer.Write(data)
		w.bytes += int64(written)
	}
	w.captureTiming()
	w.terminal = true
	return responseSnapshot{
		committed:     w.committed,
		status:        w.status,
		bytes:         w.bytes,
		timing:        w.timing,
		timingPresent: w.timingFrozen,
	}
}

func (w *commitWriter) resetForError(response responseError) {
	header := w.writer.Header()
	for name := range header {
		header.Del(name)
	}
	header.Set(requestIDHeader, w.requestID)
	header.Set("Content-Type", "application/json")
	cacheControl := response.cacheControl
	if cacheControl == "" {
		cacheControl = "no-store"
	}
	header.Set("Cache-Control", cacheControl)
}
