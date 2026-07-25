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

	"github.com/AcuLY/BangumiStaffStats/backend/internal/costar"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
)

const routeCoStar = "/api/v1/co-star"

type coStarExecutor interface {
	Execute(context.Context, costar.Request) (costar.Projection, error)
	CurrentDataVersion() string
}

type coStarTerminalContextKey struct{}

var (
	coStarMethodResponse = responseError{
		status:       http.StatusMethodNotAllowed,
		code:         codeInvalidRequest,
		message:      "method not allowed",
		cacheControl: "private, no-store",
	}
	coStarQueryResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidRequest,
		message:      "co-star does not accept query parameters",
		cacheControl: "private, no-store",
		fieldErrors: map[string][]fieldErrorCode{
			"/query": {"UNKNOWN_FIELD"},
		},
	}
	coStarInvalidResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidRequest,
		message:      "co-star request is invalid",
		cacheControl: "private, no-store",
	}
	coStarInvalidJSONResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidJSON,
		message:      "request body is invalid JSON",
		cacheControl: "private, no-store",
	}
	coStarSecondDocumentResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidJSON,
		message:      "request body must contain one JSON document",
		cacheControl: "private, no-store",
	}
	coStarTooLargeResponse = responseError{
		status:       http.StatusRequestEntityTooLarge,
		code:         codeRequestTooLarge,
		message:      "co-star request body is too large",
		cacheControl: "private, no-store",
	}
	coStarMediaResponse = responseError{
		status:       http.StatusUnsupportedMediaType,
		code:         codeUnsupportedMediaType,
		message:      "co-star requires application/json",
		cacheControl: "private, no-store",
	}
	coStarNotReadyResponse = responseError{
		status:       http.StatusServiceUnavailable,
		code:         codeNotReady,
		message:      "co-star is not ready",
		retryable:    true,
		cacheControl: "private, no-store",
	}
	coStarTimeoutResponse = responseError{
		status:       http.StatusGatewayTimeout,
		code:         codeUpstreamTimeout,
		message:      "co-star request timed out",
		retryable:    true,
		cacheControl: "private, no-store",
	}
)

func coStarTerminalFromContext(ctx context.Context) *observability.QueryTerminal {
	if ctx == nil {
		return nil
	}
	terminal, _ := ctx.Value(coStarTerminalContextKey{}).(*observability.QueryTerminal)
	return terminal
}

func (handler *routeHandler) writeCoStarWithExecutor(
	writer http.ResponseWriter,
	request *http.Request,
	requestID string,
	executor coStarExecutor,
) {
	startedAt := time.Now()
	terminal := coStarTerminalFromContext(request.Context())
	if terminal == nil {
		var err error
		terminal, err = observability.NewQueryTerminal(
			requestID,
			observability.QueryOperationCoStar,
		)
		if err != nil {
			writeError(writer, requestID, internalResponse)
			return
		}
	}
	if request.Method != http.MethodPost {
		writer.Header().Set("Allow", http.MethodPost)
		handler.rejectCoStar(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			coStarMethodResponse,
			nil,
		)
		return
	}
	if request.URL.RawQuery != "" {
		handler.rejectCoStar(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			coStarQueryResponse,
			[]observability.FieldPath{observability.FieldPathQuery},
		)
		return
	}
	decoded, decodeFailure := decodeCoStarRequest(request)
	if decodeFailure != nil {
		handler.rejectCoStar(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			*decodeFailure,
			coStarEventPaths(*decodeFailure),
		)
		return
	}
	if executor == nil {
		handler.rejectCoStar(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			coStarNotReadyResponse,
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
		response := coStarErrorResponse(err)
		if response.code == codeServerBusy ||
			response.code == errorCode(costar.CodeRateLimited) {
			retryAfter := time.Duration(0)
			if failure, found := costar.ErrorDetails(err); found {
				retryAfter = failure.RetryAfter()
			}
			writer.Header().Set(
				"Retry-After",
				boundedRetryAfterSeconds(retryAfter),
			)
		}
		handler.rejectCoStar(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			response,
			coStarEventPaths(response),
		)
		return
	}
	data, err := result.MarshalEnvelope(requestID)
	if err != nil || context.Cause(request.Context()) != nil {
		if context.Cause(request.Context()) != nil {
			return
		}
		handler.rejectCoStar(
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
		event, eventErr := terminal.CompleteWithExecution(
			time.Since(startedAt),
			int64(written),
			queryExecutionFactsForRequest(request),
		)
		if eventErr == nil {
			_ = handler.events.Emit(event)
		}
	}
}

func decodeCoStarRequest(
	request *http.Request,
) (costar.Request, *responseError) {
	if request == nil || request.Body == nil {
		response := coStarInvalidJSONResponse
		return costar.Request{}, &response
	}
	for name := range request.Header {
		if strings.EqualFold(name, "Content-Encoding") {
			response := coStarMediaResponse
			return costar.Request{}, &response
		}
	}
	contentTypes := request.Header.Values("Content-Type")
	if len(contentTypes) != 1 ||
		!strings.EqualFold(strings.TrimSpace(contentTypes[0]), "application/json") {
		response := coStarMediaResponse
		return costar.Request{}, &response
	}
	if request.ContentLength > MaxJSONBodyBytes {
		response := coStarTooLargeResponse
		return costar.Request{}, &response
	}
	data, err := io.ReadAll(io.LimitReader(request.Body, MaxJSONBodyBytes+1))
	if err != nil || !utf8.Valid(data) {
		response := coStarInvalidJSONResponse
		return costar.Request{}, &response
	}
	if len(data) > MaxJSONBodyBytes {
		response := coStarTooLargeResponse
		return costar.Request{}, &response
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var fields map[string]json.RawMessage
	if err := decoder.Decode(&fields); err != nil {
		var typeError *json.UnmarshalTypeError
		if errors.As(err, &typeError) {
			response := coStarInvalidResponse
			return costar.Request{}, &response
		}
		response := coStarInvalidJSONResponse
		return costar.Request{}, &response
	}
	if fields == nil {
		response := coStarInvalidResponse
		return costar.Request{}, &response
	}
	var trailing any
	switch err := decoder.Decode(&trailing); {
	case err == nil:
		response := coStarSecondDocumentResponse
		return costar.Request{}, &response
	case !errors.Is(err, io.EOF):
		response := coStarInvalidJSONResponse
		return costar.Request{}, &response
	}
	for name := range fields {
		switch name {
		case "query", "input", "view":
		default:
			response := coStarInvalidResponse
			response.fieldErrors = map[string][]fieldErrorCode{
				"/" + escapeCoStarPointerToken(name): {"UNKNOWN_FIELD"},
			}
			return costar.Request{}, &response
		}
	}
	queryDocument, found := fields["query"]
	if !found || bytes.Equal(bytes.TrimSpace(queryDocument), []byte("null")) {
		response := coStarInvalidResponse
		response.fieldErrors = map[string][]fieldErrorCode{
			"/query": {"REQUIRED"},
		}
		return costar.Request{}, &response
	}
	inputDocument, found := fields["input"]
	if !found || bytes.Equal(bytes.TrimSpace(inputDocument), []byte("null")) {
		response := coStarInvalidResponse
		response.fieldErrors = map[string][]fieldErrorCode{
			"/input": {"REQUIRED"},
		}
		return costar.Request{}, &response
	}
	result := costar.Request{
		Query: bytes.Clone(queryDocument),
		Input: bytes.Clone(inputDocument),
	}
	if view, found := fields["view"]; found {
		result.View = bytes.Clone(view)
	}
	return result, nil
}

func coStarErrorResponse(err error) responseError {
	failure, found := costar.ErrorDetails(err)
	if !found {
		return responseError{
			status:       http.StatusInternalServerError,
			code:         codeInternalError,
			message:      "co-star is unavailable",
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
	case costar.CodeInvalidJSON,
		costar.CodeInvalidRequest,
		costar.CodeFieldInvalid,
		costar.CodePositionSelectionConflict,
		costar.CodePositionNotFound,
		costar.CodePositionNotSelectable,
		costar.CodePositionSubjectMismatch,
		costar.CodeCapabilityNotAvailable,
		costar.CodeParticipantLimitExceeded,
		costar.CodeIdentityLimitExceeded:
		response.status = http.StatusBadRequest
	case costar.CodeCollectionNotPublic:
		response.status = http.StatusForbidden
	case costar.CodeEntityNotFound,
		costar.CodeUserNotFound:
		response.status = http.StatusNotFound
	case costar.CodeRateLimited:
		response.status = http.StatusTooManyRequests
	case costar.CodeUpstreamProtocol:
		response.status = http.StatusBadGateway
	case costar.CodeUpstreamTimeout:
		response.status = http.StatusGatewayTimeout
	case costar.CodeServerBusy,
		costar.CodeNotReady,
		costar.CodeUpstreamUnavailable:
		response.status = http.StatusServiceUnavailable
	default:
		response.status = http.StatusInternalServerError
		response.code = codeInternalError
		response.message = "co-star is unavailable"
		response.retryable = true
	}
	if response.message == "" {
		response.message = "co-star is unavailable"
	}
	if failure.Path() != "" && failure.FieldCode() != "" {
		response.fieldErrors = map[string][]fieldErrorCode{
			failure.Path(): {fieldErrorCode(failure.FieldCode())},
		}
	}
	return response
}

func coStarEventPaths(response responseError) []observability.FieldPath {
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

func (handler *routeHandler) rejectCoStar(
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
	event, eventErr := terminal.RejectWithExecution(
		response.status,
		coStarEventErrorCode(response.code),
		paths,
		contentLength,
		time.Since(startedAt),
		queryExecutionFactsForRequest(request),
	)
	if eventErr == nil {
		_ = handler.events.Emit(event)
	}
}

func coStarEventErrorCode(code errorCode) observability.QueryErrorCode {
	switch code {
	case codeInvalidJSON:
		return observability.QueryErrorInvalidJSON
	case codeInvalidRequest,
		errorCode(costar.CodeFieldInvalid),
		errorCode(costar.CodePositionSelectionConflict),
		errorCode(costar.CodePositionNotFound),
		errorCode(costar.CodePositionNotSelectable),
		errorCode(costar.CodePositionSubjectMismatch),
		errorCode(costar.CodeCapabilityNotAvailable),
		errorCode(costar.CodeParticipantLimitExceeded),
		errorCode(costar.CodeIdentityLimitExceeded):
		return observability.QueryErrorInvalidRequest
	case codeEntityNotFound,
		errorCode(costar.CodeUserNotFound):
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

func escapeCoStarPointerToken(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1")
}
