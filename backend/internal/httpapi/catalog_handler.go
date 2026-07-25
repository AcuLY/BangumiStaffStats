package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/catalog"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi/wire"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
)

const routeCatalog = "/api/v1/catalog"

var catalogFieldPath = string([]byte{'/', 'c', 'a', 't', 'a', 'l', 'o', 'g'})

type catalogTerminalContextKey struct{}

// CatalogStoreProvider exposes only the currently published immutable Store.
type CatalogStoreProvider func() (*archive.Store, bool)

type catalogProjector func(context.Context, *archive.Store) (catalog.Result, error)

var (
	catalogQueryResponse = responseError{
		status:  http.StatusBadRequest,
		code:    codeInvalidRequest,
		message: "catalog does not accept query parameters",
		fieldErrors: map[string][]fieldErrorCode{
			catalogFieldPath: {"UNKNOWN_FIELD"},
		},
	}
	catalogBodyResponse = responseError{
		status:  http.StatusBadRequest,
		code:    codeInvalidRequest,
		message: "catalog does not accept a request body",
		fieldErrors: map[string][]fieldErrorCode{
			catalogFieldPath: {"VALUE_CONFLICT"},
		},
	}
	catalogMethodResponse = responseError{
		status:  http.StatusMethodNotAllowed,
		code:    codeInvalidRequest,
		message: "method not allowed",
		fieldErrors: map[string][]fieldErrorCode{
			catalogFieldPath: {"UNSUPPORTED_VALUE"},
		},
	}
	catalogNotFoundResponse = responseError{
		status:  http.StatusNotFound,
		code:    codeEntityNotFound,
		message: "route not found",
	}
	catalogNotReadyResponse = responseError{
		status:    http.StatusServiceUnavailable,
		code:      codeNotReady,
		message:   "catalog is not ready",
		retryable: true,
	}
	catalogInternalResponse = responseError{
		status:  http.StatusInternalServerError,
		code:    codeInternalError,
		message: "catalog is unavailable",
	}
	catalogTimeoutResponse = responseError{
		status:    http.StatusGatewayTimeout,
		code:      codeUpstreamTimeout,
		message:   "catalog request timed out",
		retryable: true,
	}
)

func timeoutResponseForRequest(request *http.Request) *responseError {
	if request != nil && request.URL != nil && request.URL.Path == routeCatalog {
		return &catalogTimeoutResponse
	}
	return &timeoutResponse
}

func catalogTerminalFromContext(ctx context.Context) *observability.QueryTerminal {
	if ctx == nil {
		return nil
	}
	terminal, _ := ctx.Value(catalogTerminalContextKey{}).(*observability.QueryTerminal)
	return terminal
}

func (h *routeHandler) writeCatalog(
	writer http.ResponseWriter,
	request *http.Request,
	requestID string,
) {
	startedAt := time.Now()
	terminal := catalogTerminalFromContext(request.Context())
	if terminal == nil {
		var err error
		terminal, err = observability.NewQueryTerminal(
			requestID,
			observability.QueryOperationCatalog,
		)
		if err != nil {
			writeError(writer, requestID, catalogInternalResponse)
			return
		}
	}
	if request.Method != http.MethodGet {
		writer.Header().Set("Allow", http.MethodGet)
		h.rejectCatalog(writer, request, requestID, terminal, startedAt, catalogMethodResponse, nil)
		return
	}
	if request.URL.RawQuery != "" {
		h.rejectCatalog(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			catalogQueryResponse,
			[]observability.FieldPath{observability.FieldPathQuery},
		)
		return
	}
	hasBody, err := catalogRequestHasBody(request)
	if err != nil || hasBody {
		h.rejectCatalog(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			catalogBodyResponse,
			[]observability.FieldPath{observability.FieldPathBody},
		)
		return
	}
	if h.catalogs == nil {
		h.rejectCatalog(writer, request, requestID, terminal, startedAt, catalogNotReadyResponse, nil)
		return
	}
	store, ready := h.catalogs()
	if !ready || store == nil {
		h.rejectCatalog(writer, request, requestID, terminal, startedAt, catalogNotReadyResponse, nil)
		return
	}
	project := h.project
	if project == nil {
		project = catalog.Project
	}
	result, err := project(request.Context(), store)
	if err != nil {
		if request.Context().Err() != nil ||
			errors.Is(err, context.Canceled) ||
			errors.Is(err, context.DeadlineExceeded) {
			return
		}
		h.rejectCatalog(writer, request, requestID, terminal, startedAt, catalogInternalResponse, nil)
		return
	}
	envelope := wire.CatalogSuccessEnvelopeV1{
		Data: result.Data,
		Meta: wire.CatalogMetaV1{
			RequestId:   requestID,
			DataVersion: result.DataVersion,
		},
	}
	data, err := json.Marshal(envelope)
	if err != nil || request.Context().Err() != nil {
		if request.Context().Err() != nil {
			return
		}
		h.rejectCatalog(writer, request, requestID, terminal, startedAt, catalogInternalResponse, nil)
		return
	}
	writer.Header().Set("Content-Type", "application/json")
	writer.Header().Set("Cache-Control", "no-cache")
	writer.WriteHeader(http.StatusOK)
	written, writeErr := writer.Write(data)
	if writeErr != nil || written != len(data) {
		return
	}
	if h.events != nil {
		event, eventErr := terminal.Complete(time.Since(startedAt), int64(written))
		if eventErr == nil {
			_ = h.events.Emit(event)
		}
	}
}

func catalogRequestHasBody(request *http.Request) (bool, error) {
	if request == nil || request.Body == nil || request.Body == http.NoBody {
		return false, nil
	}
	defer request.Body.Close()
	if request.ContentLength > 0 {
		return true, nil
	}
	var buffer [1]byte
	count, err := request.Body.Read(buffer[:])
	if err != nil && !errors.Is(err, io.EOF) {
		return false, err
	}
	return count != 0, nil
}

func (h *routeHandler) rejectCatalog(
	writer http.ResponseWriter,
	request *http.Request,
	requestID string,
	terminal *observability.QueryTerminal,
	startedAt time.Time,
	response responseError,
	paths []observability.FieldPath,
) {
	data := errorEnvelopeBytes(requestID, response)
	writer.Header().Set("Content-Type", "application/json")
	writer.Header().Set("Cache-Control", "no-store")
	writer.WriteHeader(response.status)
	written, err := writer.Write(data)
	if err != nil || written != len(data) || h.events == nil {
		return
	}
	contentLength := int64(0)
	if request != nil && request.ContentLength > 0 {
		contentLength = request.ContentLength
	}
	event, eventErr := terminal.Reject(
		response.status,
		catalogEventErrorCode(response.code),
		paths,
		contentLength,
		time.Since(startedAt),
	)
	if eventErr == nil {
		_ = h.events.Emit(event)
	}
}

func catalogEventErrorCode(code errorCode) observability.QueryErrorCode {
	switch code {
	case codeInvalidRequest:
		return observability.QueryErrorInvalidRequest
	case codeNotReady:
		return observability.QueryErrorNotReady
	case codeUpstreamTimeout:
		return observability.QueryErrorUpstreamTimeout
	default:
		return observability.QueryErrorInternal
	}
}
