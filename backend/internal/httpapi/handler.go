package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
)

const readinessProbeTimeout = time.Second

const (
	routeLivez   = "/livez"
	routeReadyz  = "/readyz"
	routeMetrics = "/metrics"
)

// ReadinessProbe performs the sole fixed published-Archive identity query.
type ReadinessProbe func(context.Context) (string, error)

type routeHandler struct {
	readiness ReadinessProbe
	metrics   *observability.Registry
}

// RuntimeObservability owns the HTTP registry and typed event sink while
// keeping the application package dependent only on httpapi.
type RuntimeObservability struct {
	metrics *observability.Registry
	events  *observability.EventSink
}

// NewRuntimeObservability constructs process-scoped runtime instrumentation.
func NewRuntimeObservability(eventWriter io.Writer) (*RuntimeObservability, error) {
	if eventWriter == nil {
		return nil, errors.New("httpapi: nil event writer")
	}
	metrics, err := observability.NewRegistry(observability.BuildInfo{})
	if err != nil {
		return nil, err
	}
	return &RuntimeObservability{
		metrics: metrics,
		events:  observability.NewEventSink(eventWriter),
	}, nil
}

// Handler returns the exact three-route runtime handler.
func (r *RuntimeObservability) Handler(readiness ReadinessProbe) http.Handler {
	if r == nil {
		return NewHandler(readiness, nil)
	}
	return NewHandler(readiness, r.metrics)
}

// SetLive updates the process liveness metric.
func (r *RuntimeObservability) SetLive(live bool) {
	if r != nil {
		r.metrics.SetLive(live)
	}
}

// SetReadiness replaces the readiness and current-snapshot metrics.
func (r *RuntimeObservability) SetReadiness(ready bool, dataVersion string) error {
	if r == nil {
		return errors.New("httpapi: nil runtime observability")
	}
	return r.metrics.SetReadiness(ready, dataVersion)
}

// EmitArchiveLoadFailed emits at most one bounded startup event. Unknown
// values collapse to INTERNAL_ERROR rather than entering the event.
func (r *RuntimeObservability) EmitArchiveLoadFailed(stableCode string) error {
	if r == nil {
		return errors.New("httpapi: nil runtime observability")
	}
	code, valid := observability.ParseArchiveErrorCode(stableCode)
	if !valid {
		code = observability.ArchiveErrorInternal
	}
	return r.events.EmitArchiveLoadFailed(code)
}

// RenderPrometheus returns an atomic metric snapshot for lifecycle tests and
// the metrics route.
func (r *RuntimeObservability) RenderPrometheus() ([]byte, error) {
	if r == nil {
		return nil, errors.New("httpapi: nil runtime observability")
	}
	return r.metrics.RenderPrometheus()
}

// NewHandler returns the complete infrastructure-only handler. It registers
// exactly the liveness, readiness, and metrics routes.
func NewHandler(readiness ReadinessProbe, metrics *observability.Registry) http.Handler {
	return newHandler(readiness, metrics, middlewareOptions{
		requestTimeout: DefaultRequestTimeout,
		metrics:        metrics,
	})
}

func newHandler(readiness ReadinessProbe, metrics *observability.Registry, options middlewareOptions) http.Handler {
	options.metrics = metrics
	return runtimeMiddleware(&routeHandler{
		readiness: readiness,
		metrics:   metrics,
	}, options)
}

func (h *routeHandler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	requestID, _ := RequestIDFromContext(request.Context())
	switch request.URL.Path {
	case routeLivez:
		if request.Method != http.MethodGet {
			writeWrongMethod(writer, requestID)
			return
		}
		h.writeLive(writer, requestID)
	case routeReadyz:
		if request.Method != http.MethodGet {
			writeWrongMethod(writer, requestID)
			return
		}
		h.writeReady(writer, request, requestID)
	case routeMetrics:
		if request.Method != http.MethodGet {
			writeWrongMethod(writer, requestID)
			return
		}
		h.writeMetrics(writer, requestID)
	default:
		writeError(writer, requestID, notFoundResponse)
	}
}

func writeWrongMethod(writer http.ResponseWriter, requestID string) {
	writer.Header().Set("Allow", http.MethodGet)
	writeError(writer, requestID, methodResponse)
}

func (h *routeHandler) writeLive(writer http.ResponseWriter, requestID string) {
	response := struct {
		Data struct {
			Status string `json:"status"`
		} `json:"data"`
		Meta struct {
			RequestID string `json:"requestId"`
		} `json:"meta"`
	}{}
	response.Data.Status = "live"
	response.Meta.RequestID = requestID
	writeJSONSuccess(writer, response)
}

func (h *routeHandler) writeReady(writer http.ResponseWriter, request *http.Request, requestID string) {
	if h.readiness == nil {
		h.recordNotReady()
		writeError(writer, requestID, notReadyResponse)
		return
	}
	probeContext, cancel := context.WithTimeout(request.Context(), readinessProbeTimeout)
	dataVersion, err := h.readiness(probeContext)
	cancel()
	if err != nil || dataVersion == "" {
		h.recordNotReady()
		writeError(writer, requestID, notReadyResponse)
		return
	}
	if h.metrics != nil {
		if err := h.metrics.SetReadiness(true, dataVersion); err != nil {
			h.recordNotReady()
			writeError(writer, requestID, notReadyResponse)
			return
		}
	}

	response := struct {
		Data struct {
			Status string `json:"status"`
		} `json:"data"`
		Meta struct {
			RequestID   string `json:"requestId"`
			DataVersion string `json:"dataVersion"`
		} `json:"meta"`
	}{}
	response.Data.Status = "ready"
	response.Meta.RequestID = requestID
	response.Meta.DataVersion = dataVersion
	writeJSONSuccess(writer, response)
}

func (h *routeHandler) recordNotReady() {
	if h.metrics != nil {
		_ = h.metrics.SetReadiness(false, "")
	}
}

func (h *routeHandler) writeMetrics(writer http.ResponseWriter, requestID string) {
	if h.metrics == nil {
		writeError(writer, requestID, internalResponse)
		return
	}
	data, err := h.metrics.RenderPrometheus()
	if err != nil {
		writeError(writer, requestID, internalResponse)
		return
	}
	writer.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-store")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write(data)
}

func writeJSONSuccess(writer http.ResponseWriter, response any) {
	data, err := json.Marshal(response)
	if err != nil {
		panic(errors.New("fixed health response cannot be encoded"))
	}
	writer.Header().Set("Content-Type", "application/json")
	writer.Header().Set("Cache-Control", "no-store")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write(data)
}
