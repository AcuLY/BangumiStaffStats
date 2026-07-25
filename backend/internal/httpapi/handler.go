package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/imageproxy"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
)

const readinessProbeTimeout = time.Second

const (
	routeLivez   = "/livez"
	routeReadyz  = "/readyz"
	routeMetrics = "/metrics"
	routeImages  = "/api/v1/images/bangumi/"
)

// ReadinessProbe performs the sole fixed published-Archive identity query.
type ReadinessProbe func(context.Context) (string, error)

type imageFetcher interface {
	Fetch(context.Context, imageproxy.Request) (*imageproxy.Response, error)
}

type routeHandler struct {
	readiness    ReadinessProbe
	metrics      *observability.Registry
	images       imageFetcher
	events       *observability.EventSink
	catalogs     CatalogStoreProvider
	project      catalogProjector
	rankings     rankingsExecutor
	candidates   candidatesExecutor
	personDetail personDetailExecutor
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

// Handler returns the runtime handler with Catalog registered but not ready.
func (r *RuntimeObservability) Handler(readiness ReadinessProbe) http.Handler {
	return r.HandlerWithCatalog(readiness, nil)
}

// HandlerWithCatalog returns the runtime with the exact read-only catalog
// Store provider. A nil provider keeps the route registered but not ready.
func (r *RuntimeObservability) HandlerWithCatalog(
	readiness ReadinessProbe,
	catalogs CatalogStoreProvider,
) http.Handler {
	return r.HandlerWithDependencies(readiness, catalogs, nil)
}

// HandlerWithDependencies returns the runtime with explicit read-only Catalog
// and rankings services. Nil dependencies leave their routes registered and
// return stable NOT_READY responses.
func (r *RuntimeObservability) HandlerWithDependencies(
	readiness ReadinessProbe,
	catalogs CatalogStoreProvider,
	rankings rankingsExecutor,
) http.Handler {
	return r.HandlerWithQueryDependencies(readiness, catalogs, rankings, nil)
}

// HandlerWithQueryDependencies returns the runtime with explicit read-only
// Catalog, rankings, and candidates services. Nil dependencies leave their
// routes registered and return stable NOT_READY responses.
func (r *RuntimeObservability) HandlerWithQueryDependencies(
	readiness ReadinessProbe,
	catalogs CatalogStoreProvider,
	rankings rankingsExecutor,
	candidates candidatesExecutor,
) http.Handler {
	return r.HandlerWithResultDependencies(
		readiness,
		catalogs,
		rankings,
		candidates,
		nil,
	)
}

// HandlerWithResultDependencies registers every implemented read-only result
// route. Nil dependencies keep their routes visible with stable NOT_READY.
func (r *RuntimeObservability) HandlerWithResultDependencies(
	readiness ReadinessProbe,
	catalogs CatalogStoreProvider,
	rankings rankingsExecutor,
	candidates candidatesExecutor,
	personDetail personDetailExecutor,
) http.Handler {
	if r == nil {
		return newHandler(readiness, nil, middlewareOptions{
			requestTimeout: DefaultRequestTimeout,
			images:         imageproxy.NewClient(),
			catalogs:       catalogs,
			rankings:       rankings,
			candidates:     candidates,
			personDetail:   personDetail,
		})
	}
	return newHandler(readiness, r.metrics, middlewareOptions{
		requestTimeout: DefaultRequestTimeout,
		metrics:        r.metrics,
		images:         imageproxy.NewClient(),
		events:         r.events,
		catalogs:       catalogs,
		rankings:       rankings,
		candidates:     candidates,
		personDetail:   personDetail,
	})
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

// NewHandler returns the complete handler with Catalog registered but not
// ready and the infrastructure/image routes unchanged.
func NewHandler(readiness ReadinessProbe, metrics *observability.Registry) http.Handler {
	return newHandler(readiness, metrics, middlewareOptions{
		requestTimeout: DefaultRequestTimeout,
		metrics:        metrics,
		images:         imageproxy.NewClient(),
	})
}

func newHandler(readiness ReadinessProbe, metrics *observability.Registry, options middlewareOptions) http.Handler {
	options.metrics = metrics
	if options.images == nil {
		options.images = imageproxy.NewClient()
	}
	return runtimeMiddleware(&routeHandler{
		readiness:    readiness,
		metrics:      metrics,
		images:       options.images,
		events:       options.events,
		catalogs:     options.catalogs,
		project:      options.catalogProjector,
		rankings:     options.rankings,
		candidates:   options.candidates,
		personDetail: options.personDetail,
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
	case routeCatalog:
		h.writeCatalog(writer, request, requestID)
	case routeRankings:
		h.writeRankings(writer, request, requestID)
	case routeCandidates:
		h.writeCandidates(writer, request, requestID)
	case routePersonDetail:
		h.writePersonDetail(writer, request, requestID)
	default:
		if strings.HasPrefix(request.URL.Path, routeCatalog+string('/')) {
			writeError(writer, requestID, catalogNotFoundResponse)
			return
		}
		if strings.HasPrefix(request.URL.Path, routeRankings+string('/')) {
			writeError(writer, requestID, notFoundResponse)
			return
		}
		if strings.HasPrefix(request.URL.Path, routeCandidates+string('/')) {
			writeError(writer, requestID, notFoundResponse)
			return
		}
		if strings.HasPrefix(request.URL.Path, routePersonDetail+string('/')) {
			writeError(writer, requestID, notFoundResponse)
			return
		}
		if imageRouteCandidate(request) {
			if request.Method != http.MethodGet {
				writeWrongMethod(writer, requestID)
				return
			}
			h.writeImage(writer, request, requestID)
			return
		}
		writeError(writer, requestID, notFoundResponse)
	}
}

func imageRouteCandidate(request *http.Request) bool {
	if request == nil || request.URL == nil {
		return false
	}
	return strings.HasPrefix(request.URL.Path, routeImages) ||
		strings.HasPrefix(request.URL.EscapedPath(), routeImages)
}

func (h *routeHandler) writeImage(writer http.ResponseWriter, request *http.Request, requestID string) {
	startedAt := time.Now()
	observation := observability.ImageObservation{
		RequestID: requestID,
		Outcome:   observability.ImageOutcomeProtocol,
		Status:    http.StatusBadGateway,
	}
	defer func() {
		if h.events == nil {
			return
		}
		observation.Duration = time.Since(startedAt)
		_ = h.events.EmitImage(observation)
	}()

	imageRequest, ok := parseImageRequest(request)
	if !ok {
		observation.Outcome = observability.ImageOutcomeRejected
		observation.Status = http.StatusBadRequest
		writeError(writer, requestID, responseError{
			status:  http.StatusBadRequest,
			code:    codeInvalidRequest,
			message: "invalid request",
		})
		return
	}
	response, err := h.images.Fetch(request.Context(), imageRequest)
	if err != nil {
		observation.Outcome, observation.Status = h.writeImageError(writer, request, requestID, err)
		return
	}
	if response == nil || response.Body == nil {
		writeError(writer, requestID, upstreamProtocolResponse)
		return
	}
	defer response.Body.Close()

	if response.Status == http.StatusNotModified {
		observation.Outcome = observability.ImageOutcomeSuccess
		observation.Status = http.StatusNotModified
		writeImageCacheHeaders(writer.Header(), response)
		writer.WriteHeader(http.StatusNotModified)
		return
	}
	if response.Status != http.StatusOK || response.ContentType == "" ||
		response.ContentLength == 0 || response.ContentLength > imageproxy.MaxBodyBytes {
		writeError(writer, requestID, upstreamProtocolResponse)
		return
	}

	header := writer.Header()
	writeImageCacheHeaders(header, response)
	header.Set("Content-Type", response.ContentType)
	if response.ContentLength > 0 {
		header.Set("Content-Length", strconv.FormatInt(response.ContentLength, 10))
	}
	writer.WriteHeader(http.StatusOK)
	written, copyErr := io.Copy(writer, response.Body)
	observation.ResponseBytes = written
	if copyErr != nil || response.ContentLength >= 0 && written != response.ContentLength {
		observation.Outcome = observability.ImageOutcomeStreamError
		observation.Status = http.StatusOK
		panic(http.ErrAbortHandler)
	}
	observation.Outcome = observability.ImageOutcomeSuccess
	observation.Status = http.StatusOK
}

func writeImageCacheHeaders(header http.Header, response *imageproxy.Response) {
	if response.ETag != "" {
		header.Set("ETag", response.ETag)
	}
	if response.LastModified != "" {
		header.Set("Last-Modified", response.LastModified)
	}
	if response.CacheControl != "" {
		header.Set("Cache-Control", response.CacheControl)
	} else {
		header.Set("Cache-Control", "no-store")
	}
}

func (h *routeHandler) writeImageError(
	writer http.ResponseWriter,
	request *http.Request,
	requestID string,
	err error,
) (observability.ImageOutcome, int) {
	kind, ok := imageproxy.ErrorKindOf(err)
	if !ok {
		writeError(writer, requestID, upstreamProtocolResponse)
		return observability.ImageOutcomeProtocol, http.StatusBadGateway
	}
	switch kind {
	case imageproxy.ErrorInvalid:
		writeError(writer, requestID, responseError{
			status:  http.StatusBadRequest,
			code:    codeInvalidRequest,
			message: "invalid request",
		})
		return observability.ImageOutcomeRejected, http.StatusBadRequest
	case imageproxy.ErrorBusy:
		writer.Header().Set("Retry-After", "1")
		writeError(writer, requestID, serverBusyResponse)
		return observability.ImageOutcomeBusy, http.StatusServiceUnavailable
	case imageproxy.ErrorNotFound:
		writeError(writer, requestID, notFoundResponse)
		return observability.ImageOutcomeNotFound, http.StatusNotFound
	case imageproxy.ErrorTimeout:
		writeError(writer, requestID, timeoutResponse)
		return observability.ImageOutcomeTimeout, http.StatusGatewayTimeout
	case imageproxy.ErrorCanceled:
		if request.Context().Err() == nil {
			writeError(writer, requestID, upstreamUnavailableResponse)
			return observability.ImageOutcomeUnavailable, http.StatusServiceUnavailable
		}
		return observability.ImageOutcomeCanceled, 0
	case imageproxy.ErrorUnavailable:
		writeError(writer, requestID, upstreamUnavailableResponse)
		return observability.ImageOutcomeUnavailable, http.StatusServiceUnavailable
	case imageproxy.ErrorProtocol:
		writeError(writer, requestID, upstreamProtocolResponse)
		return observability.ImageOutcomeProtocol, http.StatusBadGateway
	default:
		writeError(writer, requestID, upstreamProtocolResponse)
		return observability.ImageOutcomeProtocol, http.StatusBadGateway
	}
}

func parseImageRequest(request *http.Request) (imageproxy.Request, bool) {
	if request == nil || request.URL == nil || request.URL.RawPath != "" ||
		request.URL.EscapedPath() != request.URL.Path {
		return imageproxy.Request{}, false
	}
	path := strings.TrimPrefix(request.URL.Path, routeImages)
	segments := strings.Split(path, string('/'))
	if len(segments) != 2 || segments[0] == "" || segments[1] == "" {
		return imageproxy.Request{}, false
	}
	resource := imageproxy.Resource(segments[0])
	switch resource {
	case imageproxy.ResourceSubjects, imageproxy.ResourcePersons, imageproxy.ResourceCharacters:
	default:
		return imageproxy.Request{}, false
	}
	if segments[1][0] == '0' || len(segments[1]) > 19 {
		return imageproxy.Request{}, false
	}
	id, err := strconv.ParseUint(segments[1], 10, 63)
	if err != nil || id == 0 || strconv.FormatUint(id, 10) != segments[1] {
		return imageproxy.Request{}, false
	}
	const typePrefix = "type="
	if !strings.HasPrefix(request.URL.RawQuery, typePrefix) ||
		strings.Count(request.URL.RawQuery, "=") != 1 ||
		strings.Contains(request.URL.RawQuery, "&") {
		return imageproxy.Request{}, false
	}
	imageType := imageproxy.Type(strings.TrimPrefix(request.URL.RawQuery, typePrefix))
	switch imageType {
	case imageproxy.TypeSmall, imageproxy.TypeGrid, imageproxy.TypeLarge, imageproxy.TypeMedium, imageproxy.TypeCommon:
	default:
		return imageproxy.Request{}, false
	}

	ifNoneMatch, ok := oneHeader(request.Header, "If-None-Match")
	if !ok {
		return imageproxy.Request{}, false
	}
	ifModifiedSince, ok := oneHeader(request.Header, "If-Modified-Since")
	if !ok {
		return imageproxy.Request{}, false
	}
	return imageproxy.Request{
		Resource:        resource,
		ID:              id,
		Type:            imageType,
		IfNoneMatch:     ifNoneMatch,
		IfModifiedSince: ifModifiedSince,
	}, true
}

func oneHeader(header http.Header, name string) (string, bool) {
	values := header.Values(name)
	if len(values) > 1 {
		return "", false
	}
	if len(values) == 0 {
		return "", true
	}
	return values[0], true
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
