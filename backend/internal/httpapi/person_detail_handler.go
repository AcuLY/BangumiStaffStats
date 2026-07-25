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
	"github.com/AcuLY/BangumiStaffStats/backend/internal/persondetail"
)

const routePersonDetail = "/api/v1/person-detail"

type personDetailExecutor interface {
	Execute(context.Context, persondetail.Request) (persondetail.Projection, error)
	CurrentDataVersion() string
}

type personDetailTerminalContextKey struct{}

var (
	personDetailMethodResponse = responseError{
		status:       http.StatusMethodNotAllowed,
		code:         codeInvalidRequest,
		message:      "method not allowed",
		cacheControl: "private, no-store",
	}
	personDetailQueryResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidRequest,
		message:      "person detail does not accept query parameters",
		cacheControl: "private, no-store",
		fieldErrors: map[string][]fieldErrorCode{
			"/query": {"UNKNOWN_FIELD"},
		},
	}
	personDetailInvalidResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidRequest,
		message:      "person detail request is invalid",
		cacheControl: "private, no-store",
	}
	personDetailInvalidJSONResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidJSON,
		message:      "request body is invalid JSON",
		cacheControl: "private, no-store",
	}
	personDetailSecondDocumentResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidJSON,
		message:      "request body must contain one JSON document",
		cacheControl: "private, no-store",
	}
	personDetailTooLargeResponse = responseError{
		status:       http.StatusRequestEntityTooLarge,
		code:         codeRequestTooLarge,
		message:      "person detail request body is too large",
		cacheControl: "private, no-store",
	}
	personDetailMediaResponse = responseError{
		status:       http.StatusUnsupportedMediaType,
		code:         codeUnsupportedMediaType,
		message:      "person detail requires application/json",
		cacheControl: "private, no-store",
	}
	personDetailNotReadyResponse = responseError{
		status:       http.StatusServiceUnavailable,
		code:         codeNotReady,
		message:      "person detail is not ready",
		retryable:    true,
		cacheControl: "private, no-store",
	}
	personDetailTimeoutResponse = responseError{
		status:       http.StatusGatewayTimeout,
		code:         codeUpstreamTimeout,
		message:      "person detail request timed out",
		retryable:    true,
		cacheControl: "private, no-store",
	}
)

func personDetailTerminalFromContext(
	ctx context.Context,
) *observability.QueryTerminal {
	if ctx == nil {
		return nil
	}
	terminal, _ := ctx.Value(
		personDetailTerminalContextKey{},
	).(*observability.QueryTerminal)
	return terminal
}

func (handler *routeHandler) writePersonDetail(
	writer http.ResponseWriter,
	request *http.Request,
	requestID string,
) {
	startedAt := time.Now()
	terminal := personDetailTerminalFromContext(request.Context())
	if terminal == nil {
		var err error
		terminal, err = observability.NewQueryTerminal(
			requestID,
			observability.QueryOperationPerson,
		)
		if err != nil {
			writeError(writer, requestID, internalResponse)
			return
		}
	}
	if request.Method != http.MethodPost {
		writer.Header().Set("Allow", http.MethodPost)
		handler.rejectPersonDetail(
			writer, request, requestID, terminal, startedAt,
			personDetailMethodResponse, nil,
		)
		return
	}
	if request.URL.RawQuery != "" {
		handler.rejectPersonDetail(
			writer, request, requestID, terminal, startedAt,
			personDetailQueryResponse,
			[]observability.FieldPath{observability.FieldPathQuery},
		)
		return
	}
	decoded, decodeFailure := decodePersonDetailRequest(request)
	if decodeFailure != nil {
		handler.rejectPersonDetail(
			writer, request, requestID, terminal, startedAt,
			*decodeFailure, personDetailEventPaths(*decodeFailure),
		)
		return
	}
	if handler.personDetail == nil {
		handler.rejectPersonDetail(
			writer, request, requestID, terminal, startedAt,
			personDetailNotReadyResponse, nil,
		)
		return
	}
	result, err := handler.personDetail.Execute(request.Context(), decoded)
	if err != nil {
		if context.Cause(request.Context()) != nil ||
			errors.Is(err, context.Canceled) ||
			errors.Is(err, context.DeadlineExceeded) {
			return
		}
		response := personDetailErrorResponse(err)
		if response.code == codeServerBusy ||
			response.code == errorCode(persondetail.CodeRateLimited) {
			retryAfter := time.Duration(0)
			if failure, found := persondetail.ErrorDetails(err); found {
				retryAfter = failure.RetryAfter()
			}
			writer.Header().Set(
				"Retry-After",
				boundedRetryAfterSeconds(retryAfter),
			)
		}
		handler.rejectPersonDetail(
			writer, request, requestID, terminal, startedAt,
			response, personDetailEventPaths(response),
		)
		return
	}
	data, err := result.MarshalEnvelope(requestID)
	if err != nil || context.Cause(request.Context()) != nil {
		if context.Cause(request.Context()) != nil {
			return
		}
		handler.rejectPersonDetail(
			writer, request, requestID, terminal, startedAt,
			internalResponse, nil,
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

func decodePersonDetailRequest(
	request *http.Request,
) (persondetail.Request, *responseError) {
	if request == nil || request.Body == nil {
		response := personDetailInvalidJSONResponse
		return persondetail.Request{}, &response
	}
	for name := range request.Header {
		if strings.EqualFold(name, "Content-Encoding") {
			response := personDetailMediaResponse
			return persondetail.Request{}, &response
		}
	}
	contentTypes := request.Header.Values("Content-Type")
	if len(contentTypes) != 1 ||
		!strings.EqualFold(strings.TrimSpace(contentTypes[0]), "application/json") {
		response := personDetailMediaResponse
		return persondetail.Request{}, &response
	}
	if request.ContentLength > MaxJSONBodyBytes {
		response := personDetailTooLargeResponse
		return persondetail.Request{}, &response
	}
	data, err := io.ReadAll(io.LimitReader(request.Body, MaxJSONBodyBytes+1))
	if err != nil || !utf8.Valid(data) {
		response := personDetailInvalidJSONResponse
		return persondetail.Request{}, &response
	}
	if len(data) > MaxJSONBodyBytes {
		response := personDetailTooLargeResponse
		return persondetail.Request{}, &response
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var fields map[string]json.RawMessage
	if err := decoder.Decode(&fields); err != nil {
		var typeError *json.UnmarshalTypeError
		if errors.As(err, &typeError) {
			response := personDetailInvalidResponse
			return persondetail.Request{}, &response
		}
		response := personDetailInvalidJSONResponse
		return persondetail.Request{}, &response
	}
	if fields == nil {
		response := personDetailInvalidResponse
		return persondetail.Request{}, &response
	}
	var trailing any
	switch err := decoder.Decode(&trailing); {
	case err == nil:
		response := personDetailSecondDocumentResponse
		return persondetail.Request{}, &response
	case !errors.Is(err, io.EOF):
		response := personDetailInvalidJSONResponse
		return persondetail.Request{}, &response
	}
	for name := range fields {
		switch name {
		case "query", "input", "view":
		default:
			response := personDetailInvalidResponse
			response.fieldErrors = map[string][]fieldErrorCode{
				"/" + escapePersonDetailPointerToken(name): {"UNKNOWN_FIELD"},
			}
			return persondetail.Request{}, &response
		}
	}
	queryDocument, found := fields["query"]
	if !found || bytes.Equal(bytes.TrimSpace(queryDocument), []byte("null")) {
		response := personDetailInvalidResponse
		response.fieldErrors = map[string][]fieldErrorCode{
			"/query": {"REQUIRED"},
		}
		return persondetail.Request{}, &response
	}
	inputDocument, found := fields["input"]
	if !found || bytes.Equal(bytes.TrimSpace(inputDocument), []byte("null")) {
		response := personDetailInvalidResponse
		response.fieldErrors = map[string][]fieldErrorCode{
			"/input": {"REQUIRED"},
		}
		return persondetail.Request{}, &response
	}
	result := persondetail.Request{
		Query: bytes.Clone(queryDocument),
		Input: bytes.Clone(inputDocument),
	}
	if view, found := fields["view"]; found {
		result.View = bytes.Clone(view)
	}
	return result, nil
}

func personDetailErrorResponse(err error) responseError {
	failure, found := persondetail.ErrorDetails(err)
	if !found {
		return responseError{
			status:       http.StatusInternalServerError,
			code:         codeInternalError,
			message:      "person detail is unavailable",
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
	case persondetail.CodeInvalidJSON,
		persondetail.CodeInvalidRequest,
		persondetail.CodeFieldInvalid,
		persondetail.CodePositionSelectionConflict,
		persondetail.CodePositionNotFound,
		persondetail.CodePositionNotSelectable,
		persondetail.CodePositionSubjectMismatch,
		persondetail.CodeCapabilityNotAvailable,
		persondetail.CodePersonNotInQueryResult:
		response.status = http.StatusBadRequest
	case persondetail.CodeCollectionNotPublic:
		response.status = http.StatusForbidden
	case persondetail.CodeUserNotFound,
		persondetail.CodeEntityNotFound:
		response.status = http.StatusNotFound
	case persondetail.CodeRateLimited:
		response.status = http.StatusTooManyRequests
	case persondetail.CodeUpstreamProtocol:
		response.status = http.StatusBadGateway
	case persondetail.CodeUpstreamTimeout:
		response.status = http.StatusGatewayTimeout
	case persondetail.CodeServerBusy,
		persondetail.CodeNotReady,
		persondetail.CodeUpstreamUnavailable:
		response.status = http.StatusServiceUnavailable
	default:
		response.status = http.StatusInternalServerError
		response.code = codeInternalError
		response.message = "person detail is unavailable"
		response.retryable = true
	}
	if response.message == "" {
		response.message = "person detail is unavailable"
	}
	if failure.Path() != "" && failure.FieldCode() != "" {
		response.fieldErrors = map[string][]fieldErrorCode{
			failure.Path(): {fieldErrorCode(failure.FieldCode())},
		}
	}
	return response
}

func personDetailEventPaths(
	response responseError,
) []observability.FieldPath {
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

func (handler *routeHandler) rejectPersonDetail(
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
		personDetailEventErrorCode(response.code),
		paths,
		contentLength,
		time.Since(startedAt),
		queryExecutionFactsForRequest(request),
	)
	if eventErr == nil {
		_ = handler.events.Emit(event)
	}
}

func personDetailEventErrorCode(code errorCode) observability.QueryErrorCode {
	switch code {
	case codeInvalidJSON:
		return observability.QueryErrorInvalidJSON
	case codeInvalidRequest,
		errorCode(persondetail.CodeFieldInvalid),
		errorCode(persondetail.CodePositionSelectionConflict),
		errorCode(persondetail.CodePositionNotFound),
		errorCode(persondetail.CodePositionNotSelectable),
		errorCode(persondetail.CodePositionSubjectMismatch),
		errorCode(persondetail.CodeCapabilityNotAvailable),
		errorCode(persondetail.CodePersonNotInQueryResult):
		return observability.QueryErrorInvalidRequest
	case codeEntityNotFound, errorCode(persondetail.CodeUserNotFound):
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

func escapePersonDetailPointerToken(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1")
}
