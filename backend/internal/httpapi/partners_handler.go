package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/partners"
)

const routePartners = "/api/v1/partners"

type partnersExecutor interface {
	Execute(context.Context, partners.Request) (partners.Projection, error)
	CurrentDataVersion() string
}

type partnersTerminalContextKey struct{}

var (
	partnersMethodResponse = responseError{
		status:       http.StatusMethodNotAllowed,
		code:         codeInvalidRequest,
		message:      "method not allowed",
		cacheControl: "private, no-store",
	}
	partnersQueryResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidRequest,
		message:      "partners does not accept query parameters",
		cacheControl: "private, no-store",
		fieldErrors: map[string][]fieldErrorCode{
			"/query": {"UNKNOWN_FIELD"},
		},
	}
	partnersInvalidResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidRequest,
		message:      "partners request is invalid",
		cacheControl: "private, no-store",
	}
	partnersInvalidJSONResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidJSON,
		message:      "request body is invalid JSON",
		cacheControl: "private, no-store",
	}
	partnersSecondDocumentResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidJSON,
		message:      "request body must contain one JSON document",
		cacheControl: "private, no-store",
	}
	partnersTooLargeResponse = responseError{
		status:       http.StatusRequestEntityTooLarge,
		code:         codeRequestTooLarge,
		message:      "partners request body is too large",
		cacheControl: "private, no-store",
	}
	partnersMediaResponse = responseError{
		status:       http.StatusUnsupportedMediaType,
		code:         codeUnsupportedMediaType,
		message:      "partners requires application/json",
		cacheControl: "private, no-store",
	}
	partnersNotReadyResponse = responseError{
		status:       http.StatusServiceUnavailable,
		code:         codeNotReady,
		message:      "partners is not ready",
		retryable:    true,
		cacheControl: "private, no-store",
	}
	partnersTimeoutResponse = responseError{
		status:       http.StatusGatewayTimeout,
		code:         codeUpstreamTimeout,
		message:      "partners request timed out",
		retryable:    true,
		cacheControl: "private, no-store",
	}
)

func partnersTerminalFromContext(ctx context.Context) *observability.QueryTerminal {
	if ctx == nil {
		return nil
	}
	terminal, _ := ctx.Value(partnersTerminalContextKey{}).(*observability.QueryTerminal)
	return terminal
}

// writePartnersWithExecutor is the complete strict transport boundary. Route
// registration supplies the runtime-owned executor after shared wiring lands.
func (handler *routeHandler) writePartnersWithExecutor(
	writer http.ResponseWriter,
	request *http.Request,
	requestID string,
	executor partnersExecutor,
) {
	startedAt := time.Now()
	terminal := partnersTerminalFromContext(request.Context())
	if terminal == nil {
		var err error
		terminal, err = observability.NewQueryTerminal(
			requestID,
			observability.QueryOperationPartners,
		)
		if err != nil {
			writeError(writer, requestID, internalResponse)
			return
		}
	}
	if request.Method != http.MethodPost {
		writer.Header().Set("Allow", http.MethodPost)
		handler.rejectPartners(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			partnersMethodResponse,
			nil,
		)
		return
	}
	if request.URL.RawQuery != "" {
		handler.rejectPartners(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			partnersQueryResponse,
			[]observability.FieldPath{observability.FieldPathQuery},
		)
		return
	}
	decoded, decodeFailure := decodePartnersRequest(request)
	if decodeFailure != nil {
		handler.rejectPartners(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			*decodeFailure,
			partnersEventPaths(*decodeFailure),
		)
		return
	}
	if executor == nil {
		handler.rejectPartners(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			partnersNotReadyResponse,
			nil,
		)
		return
	}
	result, err := executor.Execute(request.Context(), decoded)
	if err != nil {
		if context.Cause(request.Context()) != nil ||
			errors.Is(err, context.Canceled) ||
			errors.Is(err, context.DeadlineExceeded) {
			return
		}
		response := partnersErrorResponse(err)
		if response.code == codeServerBusy ||
			response.code == errorCode(partners.CodeRateLimited) {
			retryAfter := time.Duration(0)
			if failure, found := partners.ErrorDetails(err); found {
				retryAfter = failure.RetryAfter()
			}
			writer.Header().Set(
				"Retry-After",
				boundedRetryAfterSeconds(retryAfter),
			)
		}
		handler.rejectPartners(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			response,
			partnersEventPaths(response),
		)
		return
	}
	data, err := result.MarshalEnvelope(requestID)
	if err != nil || context.Cause(request.Context()) != nil {
		if context.Cause(request.Context()) != nil {
			return
		}
		handler.rejectPartners(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			internalResponse,
			nil,
		)
		return
	}
	writer.Header().Set("Content-Type", "application/json")
	writer.Header().Set("Cache-Control", "private, no-store")
	writer.WriteHeader(http.StatusOK)
	written, writeErr := writer.Write(data)
	if writeErr != nil || written != len(data) {
		return
	}
	if handler.events != nil {
		event, eventErr := terminal.Complete(time.Since(startedAt), int64(written))
		if eventErr == nil {
			_ = handler.events.Emit(event)
		}
	}
}

func decodePartnersRequest(
	request *http.Request,
) (partners.Request, *responseError) {
	if request == nil || request.Body == nil {
		response := partnersInvalidJSONResponse
		return partners.Request{}, &response
	}
	for name := range request.Header {
		if strings.EqualFold(name, "Content-Encoding") {
			response := partnersMediaResponse
			return partners.Request{}, &response
		}
	}
	contentTypes := request.Header.Values("Content-Type")
	if len(contentTypes) != 1 ||
		!strings.EqualFold(strings.TrimSpace(contentTypes[0]), "application/json") {
		response := partnersMediaResponse
		return partners.Request{}, &response
	}
	if request.ContentLength > MaxJSONBodyBytes {
		response := partnersTooLargeResponse
		return partners.Request{}, &response
	}
	data, err := io.ReadAll(io.LimitReader(request.Body, MaxJSONBodyBytes+1))
	if err != nil || !utf8.Valid(data) {
		response := partnersInvalidJSONResponse
		return partners.Request{}, &response
	}
	if len(data) > MaxJSONBodyBytes {
		response := partnersTooLargeResponse
		return partners.Request{}, &response
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var fields map[string]json.RawMessage
	if err := decoder.Decode(&fields); err != nil {
		var typeError *json.UnmarshalTypeError
		if errors.As(err, &typeError) {
			response := partnersInvalidResponse
			return partners.Request{}, &response
		}
		response := partnersInvalidJSONResponse
		return partners.Request{}, &response
	}
	if fields == nil {
		response := partnersInvalidResponse
		return partners.Request{}, &response
	}
	var trailing any
	switch err := decoder.Decode(&trailing); {
	case err == nil:
		response := partnersSecondDocumentResponse
		return partners.Request{}, &response
	case !errors.Is(err, io.EOF):
		response := partnersInvalidJSONResponse
		return partners.Request{}, &response
	}
	for name := range fields {
		switch name {
		case "query", "input", "view":
		default:
			response := partnersInvalidResponse
			response.fieldErrors = map[string][]fieldErrorCode{
				"/" + escapePartnersPointerToken(name): {"UNKNOWN_FIELD"},
			}
			return partners.Request{}, &response
		}
	}
	queryDocument, found := fields["query"]
	if !found || bytes.Equal(bytes.TrimSpace(queryDocument), []byte("null")) {
		response := partnersInvalidResponse
		response.fieldErrors = map[string][]fieldErrorCode{
			"/query": {"REQUIRED"},
		}
		return partners.Request{}, &response
	}
	inputDocument, found := fields["input"]
	if !found || bytes.Equal(bytes.TrimSpace(inputDocument), []byte("null")) {
		response := partnersInvalidResponse
		response.fieldErrors = map[string][]fieldErrorCode{
			"/input": {"REQUIRED"},
		}
		return partners.Request{}, &response
	}
	result := partners.Request{
		Query: bytes.Clone(queryDocument),
		Input: bytes.Clone(inputDocument),
	}
	if view, found := fields["view"]; found {
		result.View = bytes.Clone(view)
	}
	return result, nil
}

func partnersErrorResponse(err error) responseError {
	failure, found := partners.ErrorDetails(err)
	if !found {
		return responseError{
			status:       http.StatusInternalServerError,
			code:         codeInternalError,
			message:      "partners is unavailable",
			retryable:    true,
			cacheControl: "private, no-store",
		}
	}
	response := responseError{
		code:         errorCode(failure.Code()),
		message:      failure.Message(),
		retryable:    failure.Retryable(),
		dataVersion:  failure.DataVersion(),
		cacheControl: "private, no-store",
	}
	switch failure.Code() {
	case partners.CodeInvalidJSON,
		partners.CodeInvalidRequest,
		partners.CodeFieldInvalid,
		partners.CodePositionSelectionConflict,
		partners.CodePositionNotFound,
		partners.CodePositionNotSelectable,
		partners.CodePositionSubjectMismatch,
		partners.CodeCapabilityNotAvailable:
		response.status = http.StatusBadRequest
	case partners.CodeCollectionNotPublic:
		response.status = http.StatusForbidden
	case partners.CodeEntityNotFound,
		partners.CodeUserNotFound:
		response.status = http.StatusNotFound
	case partners.CodeRateLimited:
		response.status = http.StatusTooManyRequests
	case partners.CodeUpstreamProtocol:
		response.status = http.StatusBadGateway
	case partners.CodeUpstreamTimeout:
		response.status = http.StatusGatewayTimeout
	case partners.CodeServerBusy,
		partners.CodeNotReady,
		partners.CodeUpstreamUnavailable:
		response.status = http.StatusServiceUnavailable
	default:
		response.status = http.StatusInternalServerError
		response.code = codeInternalError
		response.message = "partners is unavailable"
		response.retryable = true
	}
	if response.message == "" {
		response.message = "partners is unavailable"
	}
	if failure.Path() != "" && failure.FieldCode() != "" {
		response.fieldErrors = map[string][]fieldErrorCode{
			failure.Path(): {fieldErrorCode(failure.FieldCode())},
		}
	}
	return response
}

func partnersEventPaths(response responseError) []observability.FieldPath {
	for path := range response.fieldErrors {
		switch {
		case path == "/query" || strings.HasPrefix(path, "/query/"):
			return []observability.FieldPath{observability.FieldPathQuery}
		case path == "/input" || strings.HasPrefix(path, "/input/"):
			return []observability.FieldPath{observability.FieldPathInput}
		case path == "/view" || strings.HasPrefix(path, "/view/"):
			return []observability.FieldPath{observability.FieldPathView}
		}
	}
	return nil
}

func (handler *routeHandler) rejectPartners(
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
	writer.Header().Set("Cache-Control", "private, no-store")
	writer.WriteHeader(response.status)
	written, err := writer.Write(data)
	if err != nil || written != len(data) || handler.events == nil {
		return
	}
	contentLength := int64(0)
	if request != nil && request.ContentLength > 0 {
		contentLength = request.ContentLength
	}
	event, eventErr := terminal.Reject(
		response.status,
		partnersEventErrorCode(response.code),
		paths,
		contentLength,
		time.Since(startedAt),
	)
	if eventErr == nil {
		_ = handler.events.Emit(event)
	}
}

func partnersEventErrorCode(code errorCode) observability.QueryErrorCode {
	switch code {
	case codeInvalidJSON:
		return observability.QueryErrorInvalidJSON
	case codeInvalidRequest,
		errorCode(partners.CodeFieldInvalid),
		errorCode(partners.CodePositionSelectionConflict),
		errorCode(partners.CodePositionNotFound),
		errorCode(partners.CodePositionNotSelectable),
		errorCode(partners.CodePositionSubjectMismatch),
		errorCode(partners.CodeCapabilityNotAvailable):
		return observability.QueryErrorInvalidRequest
	case codeEntityNotFound,
		errorCode(partners.CodeUserNotFound):
		return observability.QueryErrorEntityNotFound
	case codeRequestTooLarge:
		return observability.QueryErrorRequestTooLarge
	case codeUnsupportedMediaType:
		return observability.QueryErrorUnsupportedMediaType
	case codeNotReady:
		return observability.QueryErrorNotReady
	case codeUpstreamTimeout:
		return observability.QueryErrorUpstreamTimeout
	default:
		return observability.QueryErrorInternal
	}
}

func escapePartnersPointerToken(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1")
}
