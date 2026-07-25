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

	"github.com/AcuLY/BangumiStaffStats/backend/internal/candidates"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
)

const routeCandidates = "/api/v1/candidates"

type candidatesExecutor interface {
	Execute(context.Context, candidates.Request) (candidates.Projection, error)
	CurrentDataVersion() string
}

type candidatesTerminalContextKey struct{}

var (
	candidatesMethodResponse = responseError{
		status:       http.StatusMethodNotAllowed,
		code:         codeInvalidRequest,
		message:      "method not allowed",
		cacheControl: "private, no-store",
	}
	candidatesQueryResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidRequest,
		message:      "candidates does not accept query parameters",
		cacheControl: "private, no-store",
		fieldErrors: map[string][]fieldErrorCode{
			"/query": {"UNKNOWN_FIELD"},
		},
	}
	candidatesInvalidResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidRequest,
		message:      "candidates request is invalid",
		cacheControl: "private, no-store",
	}
	candidatesInvalidJSONResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidJSON,
		message:      "request body is invalid JSON",
		cacheControl: "private, no-store",
	}
	candidatesSecondDocumentResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidJSON,
		message:      "request body must contain one JSON document",
		cacheControl: "private, no-store",
	}
	candidatesTooLargeResponse = responseError{
		status:       http.StatusRequestEntityTooLarge,
		code:         codeRequestTooLarge,
		message:      "candidates request body is too large",
		cacheControl: "private, no-store",
	}
	candidatesMediaResponse = responseError{
		status:       http.StatusUnsupportedMediaType,
		code:         codeUnsupportedMediaType,
		message:      "candidates requires application/json",
		cacheControl: "private, no-store",
	}
	candidatesNotReadyResponse = responseError{
		status:       http.StatusServiceUnavailable,
		code:         codeNotReady,
		message:      "candidates is not ready",
		retryable:    true,
		cacheControl: "private, no-store",
	}
	candidatesTimeoutResponse = responseError{
		status:       http.StatusGatewayTimeout,
		code:         codeUpstreamTimeout,
		message:      "candidates request timed out",
		retryable:    true,
		cacheControl: "private, no-store",
	}
)

func candidatesTerminalFromContext(ctx context.Context) *observability.QueryTerminal {
	if ctx == nil {
		return nil
	}
	terminal, _ := ctx.Value(candidatesTerminalContextKey{}).(*observability.QueryTerminal)
	return terminal
}

func (handler *routeHandler) writeCandidates(
	writer http.ResponseWriter,
	request *http.Request,
	requestID string,
) {
	startedAt := time.Now()
	terminal := candidatesTerminalFromContext(request.Context())
	if terminal == nil {
		var err error
		terminal, err = observability.NewQueryTerminal(
			requestID,
			observability.QueryOperationCandidates,
		)
		if err != nil {
			writeError(writer, requestID, internalResponse)
			return
		}
	}
	if request.Method != http.MethodPost {
		writer.Header().Set("Allow", http.MethodPost)
		handler.rejectCandidates(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			candidatesMethodResponse,
			nil,
		)
		return
	}
	if request.URL.RawQuery != "" {
		handler.rejectCandidates(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			candidatesQueryResponse,
			[]observability.FieldPath{observability.FieldPathQuery},
		)
		return
	}
	decoded, decodeFailure := decodeCandidatesRequest(request)
	if decodeFailure != nil {
		handler.rejectCandidates(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			*decodeFailure,
			candidatesEventPaths(*decodeFailure),
		)
		return
	}
	if handler.candidates == nil {
		handler.rejectCandidates(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			candidatesNotReadyResponse,
			nil,
		)
		return
	}
	result, err := handler.candidates.Execute(request.Context(), decoded)
	if err != nil {
		if context.Cause(request.Context()) != nil ||
			errors.Is(err, context.Canceled) ||
			errors.Is(err, context.DeadlineExceeded) {
			return
		}
		response := candidatesErrorResponse(err)
		if response.code == codeServerBusy ||
			response.code == errorCode(candidates.CodeRateLimited) {
			retryAfter := time.Duration(0)
			if failure, found := candidates.ErrorDetails(err); found {
				retryAfter = failure.RetryAfter()
			}
			writer.Header().Set(
				"Retry-After",
				boundedRetryAfterSeconds(retryAfter),
			)
		}
		handler.rejectCandidates(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			response,
			candidatesEventPaths(response),
		)
		return
	}
	data, err := result.MarshalEnvelope(requestID)
	if err != nil || context.Cause(request.Context()) != nil {
		if context.Cause(request.Context()) != nil {
			return
		}
		handler.rejectCandidates(
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

func decodeCandidatesRequest(
	request *http.Request,
) (candidates.Request, *responseError) {
	if request == nil || request.Body == nil {
		response := candidatesInvalidJSONResponse
		return candidates.Request{}, &response
	}
	for name := range request.Header {
		if strings.EqualFold(name, "Content-Encoding") {
			response := candidatesMediaResponse
			return candidates.Request{}, &response
		}
	}
	contentTypes := request.Header.Values("Content-Type")
	if len(contentTypes) != 1 ||
		!strings.EqualFold(strings.TrimSpace(contentTypes[0]), "application/json") {
		response := candidatesMediaResponse
		return candidates.Request{}, &response
	}
	if request.ContentLength > MaxJSONBodyBytes {
		response := candidatesTooLargeResponse
		return candidates.Request{}, &response
	}
	data, err := io.ReadAll(io.LimitReader(request.Body, MaxJSONBodyBytes+1))
	if err != nil || !utf8.Valid(data) {
		response := candidatesInvalidJSONResponse
		return candidates.Request{}, &response
	}
	if len(data) > MaxJSONBodyBytes {
		response := candidatesTooLargeResponse
		return candidates.Request{}, &response
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var fields map[string]json.RawMessage
	if err := decoder.Decode(&fields); err != nil {
		var typeError *json.UnmarshalTypeError
		if errors.As(err, &typeError) {
			response := candidatesInvalidResponse
			return candidates.Request{}, &response
		}
		response := candidatesInvalidJSONResponse
		return candidates.Request{}, &response
	}
	if fields == nil {
		response := candidatesInvalidResponse
		return candidates.Request{}, &response
	}
	var trailing any
	switch err := decoder.Decode(&trailing); {
	case err == nil:
		response := candidatesSecondDocumentResponse
		return candidates.Request{}, &response
	case !errors.Is(err, io.EOF):
		response := candidatesInvalidJSONResponse
		return candidates.Request{}, &response
	}
	for name := range fields {
		switch name {
		case "query", "input", "view", "refreshCollection":
		default:
			response := candidatesInvalidResponse
			response.fieldErrors = map[string][]fieldErrorCode{
				"/" + escapeCandidatesPointerToken(name): {"UNKNOWN_FIELD"},
			}
			return candidates.Request{}, &response
		}
	}
	queryDocument, found := fields["query"]
	if !found || bytes.Equal(bytes.TrimSpace(queryDocument), []byte("null")) {
		response := candidatesInvalidResponse
		response.fieldErrors = map[string][]fieldErrorCode{
			"/query": {"REQUIRED"},
		}
		return candidates.Request{}, &response
	}
	inputDocument, found := fields["input"]
	if !found || bytes.Equal(bytes.TrimSpace(inputDocument), []byte("null")) {
		response := candidatesInvalidResponse
		response.fieldErrors = map[string][]fieldErrorCode{
			"/input": {"REQUIRED"},
		}
		return candidates.Request{}, &response
	}
	result := candidates.Request{
		Query: bytes.Clone(queryDocument),
		Input: bytes.Clone(inputDocument),
	}
	if view, found := fields["view"]; found {
		result.View = bytes.Clone(view)
	}
	if refresh, found := fields["refreshCollection"]; found {
		if err := json.Unmarshal(refresh, &result.RefreshCollection); err != nil ||
			bytes.Equal(bytes.TrimSpace(refresh), []byte("null")) {
			response := candidatesInvalidResponse
			response.fieldErrors = map[string][]fieldErrorCode{
				"/refreshCollection": {"INVALID_TYPE"},
			}
			return candidates.Request{}, &response
		}
	}
	return result, nil
}

func candidatesErrorResponse(err error) responseError {
	failure, found := candidates.ErrorDetails(err)
	if !found {
		return responseError{
			status:       http.StatusInternalServerError,
			code:         codeInternalError,
			message:      "candidates is unavailable",
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
	case candidates.CodeInvalidJSON,
		candidates.CodeInvalidRequest,
		candidates.CodeFieldInvalid,
		candidates.CodePositionSelectionConflict,
		candidates.CodePositionNotFound,
		candidates.CodePositionNotSelectable,
		candidates.CodePositionSubjectMismatch,
		candidates.CodeCapabilityNotAvailable:
		response.status = http.StatusBadRequest
	case candidates.CodeCollectionNotPublic:
		response.status = http.StatusForbidden
	case candidates.CodeUserNotFound:
		response.status = http.StatusNotFound
	case candidates.CodeRateLimited:
		response.status = http.StatusTooManyRequests
	case candidates.CodeUpstreamProtocol:
		response.status = http.StatusBadGateway
	case candidates.CodeUpstreamTimeout:
		response.status = http.StatusGatewayTimeout
	case candidates.CodeServerBusy,
		candidates.CodeNotReady,
		candidates.CodeUpstreamUnavailable:
		response.status = http.StatusServiceUnavailable
	default:
		response.status = http.StatusInternalServerError
		response.code = codeInternalError
		response.message = "candidates is unavailable"
		response.retryable = true
	}
	if response.message == "" {
		response.message = "candidates is unavailable"
	}
	if failure.Path() != "" && failure.FieldCode() != "" {
		response.fieldErrors = map[string][]fieldErrorCode{
			failure.Path(): {fieldErrorCode(failure.FieldCode())},
		}
	}
	return response
}

func candidatesEventPaths(response responseError) []observability.FieldPath {
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

func (handler *routeHandler) rejectCandidates(
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
		candidatesEventErrorCode(response.code),
		paths,
		contentLength,
		time.Since(startedAt),
	)
	if eventErr == nil {
		_ = handler.events.Emit(event)
	}
}

func candidatesEventErrorCode(code errorCode) observability.QueryErrorCode {
	switch code {
	case codeInvalidJSON:
		return observability.QueryErrorInvalidJSON
	case codeInvalidRequest,
		errorCode(candidates.CodeFieldInvalid),
		errorCode(candidates.CodePositionSelectionConflict),
		errorCode(candidates.CodePositionNotFound),
		errorCode(candidates.CodePositionNotSelectable),
		errorCode(candidates.CodePositionSubjectMismatch),
		errorCode(candidates.CodeCapabilityNotAvailable):
		return observability.QueryErrorInvalidRequest
	case codeEntityNotFound, errorCode(candidates.CodeUserNotFound):
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

func escapeCandidatesPointerToken(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1")
}
