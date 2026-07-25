package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/ranking"
)

const routeRankings = "/api/v1/rankings"

const maxRankingsRetryAfter = 60 * time.Second

type rankingsExecutor interface {
	Execute(context.Context, ranking.Request) (ranking.Projection, error)
	CurrentDataVersion() string
}

type rankingsTerminalContextKey struct{}

var (
	rankingsMethodResponse = responseError{
		status:       http.StatusMethodNotAllowed,
		code:         codeInvalidRequest,
		message:      "method not allowed",
		cacheControl: "private, no-store",
	}
	rankingsQueryResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidRequest,
		message:      "rankings does not accept query parameters",
		cacheControl: "private, no-store",
		fieldErrors: map[string][]fieldErrorCode{
			"/query": {"UNKNOWN_FIELD"},
		},
	}
	rankingsInvalidResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidRequest,
		message:      "rankings request is invalid",
		cacheControl: "private, no-store",
	}
	rankingsInvalidJSONResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidJSON,
		message:      "request body is invalid JSON",
		cacheControl: "private, no-store",
	}
	rankingsSecondDocumentResponse = responseError{
		status:       http.StatusBadRequest,
		code:         codeInvalidJSON,
		message:      "request body must contain one JSON document",
		cacheControl: "private, no-store",
	}
	rankingsTooLargeResponse = responseError{
		status:       http.StatusRequestEntityTooLarge,
		code:         codeRequestTooLarge,
		message:      "rankings request body is too large",
		cacheControl: "private, no-store",
	}
	rankingsMediaResponse = responseError{
		status:       http.StatusUnsupportedMediaType,
		code:         codeUnsupportedMediaType,
		message:      "rankings requires application/json",
		cacheControl: "private, no-store",
	}
	rankingsNotReadyResponse = responseError{
		status:       http.StatusServiceUnavailable,
		code:         codeNotReady,
		message:      "rankings is not ready",
		retryable:    true,
		cacheControl: "private, no-store",
	}
	rankingsTimeoutResponse = responseError{
		status:       http.StatusGatewayTimeout,
		code:         codeUpstreamTimeout,
		message:      "rankings request timed out",
		retryable:    true,
		cacheControl: "private, no-store",
	}
)

func rankingsTerminalFromContext(ctx context.Context) *observability.QueryTerminal {
	if ctx == nil {
		return nil
	}
	terminal, _ := ctx.Value(rankingsTerminalContextKey{}).(*observability.QueryTerminal)
	return terminal
}

func (handler *routeHandler) writeRankings(
	writer http.ResponseWriter,
	request *http.Request,
	requestID string,
) {
	startedAt := time.Now()
	terminal := rankingsTerminalFromContext(request.Context())
	if terminal == nil {
		var err error
		terminal, err = observability.NewQueryTerminal(
			requestID,
			observability.QueryOperationRankings,
		)
		if err != nil {
			writeError(writer, requestID, internalResponse)
			return
		}
	}
	if request.Method != http.MethodPost {
		writer.Header().Set("Allow", http.MethodPost)
		handler.rejectRankings(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			rankingsMethodResponse,
			nil,
		)
		return
	}
	if request.URL.RawQuery != "" {
		handler.rejectRankings(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			rankingsQueryResponse,
			[]observability.FieldPath{observability.FieldPathQuery},
		)
		return
	}
	decoded, decodeFailure := decodeRankingsRequest(request)
	if decodeFailure != nil {
		handler.rejectRankings(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			*decodeFailure,
			[]observability.FieldPath{observability.FieldPathBody},
		)
		return
	}
	if handler.rankings == nil {
		handler.rejectRankings(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			rankingsNotReadyResponse,
			nil,
		)
		return
	}
	result, err := handler.rankings.Execute(request.Context(), decoded)
	if err != nil {
		if context.Cause(request.Context()) != nil ||
			errors.Is(err, context.Canceled) ||
			errors.Is(err, context.DeadlineExceeded) {
			return
		}
		response := rankingsErrorResponse(err)
		if response.code == codeServerBusy ||
			response.code == errorCode(ranking.CodeRateLimited) {
			retryAfter := time.Duration(0)
			if failure, found := ranking.ErrorDetails(err); found &&
				failure.RetryAfter() > 0 {
				retryAfter = failure.RetryAfter()
			}
			setRankingsRetryAfter(writer.Header(), retryAfter)
		}
		handler.rejectRankings(
			writer,
			request,
			requestID,
			terminal,
			startedAt,
			response,
			rankingsEventPaths(response),
		)
		return
	}
	data, err := result.MarshalEnvelope(requestID)
	if err != nil || context.Cause(request.Context()) != nil {
		if context.Cause(request.Context()) != nil {
			return
		}
		handler.rejectRankings(
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

func setRankingsRetryAfter(header http.Header, retryAfter time.Duration) {
	header.Set("Retry-After", boundedRetryAfterSeconds(retryAfter))
}

func boundedRetryAfterSeconds(retryAfter time.Duration) string {
	if retryAfter <= 0 {
		retryAfter = time.Second
	}
	if retryAfter > maxRankingsRetryAfter {
		retryAfter = maxRankingsRetryAfter
	}
	seconds := int64(retryAfter / time.Second)
	if retryAfter%time.Second != 0 {
		seconds++
	}
	return strconv.FormatInt(max(1, seconds), 10)
}

func decodeRankingsRequest(request *http.Request) (ranking.Request, *responseError) {
	if request == nil || request.Body == nil {
		response := rankingsInvalidJSONResponse
		return ranking.Request{}, &response
	}
	for name := range request.Header {
		if strings.EqualFold(name, "Content-Encoding") {
			response := rankingsMediaResponse
			return ranking.Request{}, &response
		}
	}
	contentTypes := request.Header.Values("Content-Type")
	if len(contentTypes) != 1 ||
		!strings.EqualFold(strings.TrimSpace(contentTypes[0]), "application/json") {
		response := rankingsMediaResponse
		return ranking.Request{}, &response
	}
	if request.ContentLength > MaxJSONBodyBytes {
		response := rankingsTooLargeResponse
		return ranking.Request{}, &response
	}
	data, err := io.ReadAll(io.LimitReader(request.Body, MaxJSONBodyBytes+1))
	if err != nil || !utf8.Valid(data) {
		response := rankingsInvalidJSONResponse
		return ranking.Request{}, &response
	}
	if len(data) > MaxJSONBodyBytes {
		response := rankingsTooLargeResponse
		return ranking.Request{}, &response
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var fields map[string]json.RawMessage
	if err := decoder.Decode(&fields); err != nil {
		var typeError *json.UnmarshalTypeError
		if errors.As(err, &typeError) {
			response := rankingsInvalidResponse
			return ranking.Request{}, &response
		}
		response := rankingsInvalidJSONResponse
		return ranking.Request{}, &response
	}
	if fields == nil {
		response := rankingsInvalidResponse
		return ranking.Request{}, &response
	}
	var trailing any
	switch err := decoder.Decode(&trailing); {
	case err == nil:
		response := rankingsSecondDocumentResponse
		return ranking.Request{}, &response
	case !errors.Is(err, io.EOF):
		response := rankingsInvalidJSONResponse
		return ranking.Request{}, &response
	}
	for name := range fields {
		switch name {
		case "query", "view", "refreshCollection":
		default:
			response := rankingsInvalidResponse
			return ranking.Request{}, &response
		}
	}
	queryDocument, found := fields["query"]
	if !found || bytes.Equal(bytes.TrimSpace(queryDocument), []byte("null")) {
		response := rankingsInvalidResponse
		return ranking.Request{}, &response
	}
	result := ranking.Request{Query: bytes.Clone(queryDocument)}
	if view, found := fields["view"]; found {
		result.View = bytes.Clone(view)
	}
	if refresh, found := fields["refreshCollection"]; found {
		if err := json.Unmarshal(refresh, &result.RefreshCollection); err != nil ||
			bytes.Equal(bytes.TrimSpace(refresh), []byte("null")) {
			response := rankingsInvalidResponse
			return ranking.Request{}, &response
		}
	}
	return result, nil
}

func rankingsErrorResponse(err error) responseError {
	failure, found := ranking.ErrorDetails(err)
	if !found {
		return internalResponse
	}
	response := responseError{
		code:         errorCode(failure.Code()),
		message:      failure.Message(),
		retryable:    failure.Retryable(),
		dataVersion:  failure.DataVersion(),
		cacheControl: "private, no-store",
	}
	switch failure.Code() {
	case ranking.CodeInvalidJSON,
		ranking.CodeInvalidRequest,
		ranking.CodeFieldInvalid,
		ranking.CodePositionSelectionConflict,
		ranking.CodePositionNotFound,
		ranking.CodePositionNotSelectable,
		ranking.CodePositionSubjectMismatch,
		ranking.CodeCapabilityNotAvailable:
		response.status = http.StatusBadRequest
	case ranking.CodeCollectionNotPublic:
		response.status = http.StatusForbidden
	case ranking.CodeUserNotFound:
		response.status = http.StatusNotFound
	case ranking.CodeRateLimited:
		response.status = http.StatusTooManyRequests
	case ranking.CodeUpstreamProtocol:
		response.status = http.StatusBadGateway
	case ranking.CodeUpstreamTimeout:
		response.status = http.StatusGatewayTimeout
	case ranking.CodeServerBusy,
		ranking.CodeNotReady,
		ranking.CodeUpstreamUnavailable:
		response.status = http.StatusServiceUnavailable
	default:
		response.status = http.StatusInternalServerError
		response.code = codeInternalError
		response.message = "rankings is unavailable"
		response.retryable = true
	}
	if failure.Path() != "" && failure.FieldCode() != "" {
		response.fieldErrors = map[string][]fieldErrorCode{
			failure.Path(): {fieldErrorCode(failure.FieldCode())},
		}
	}
	return response
}

func rankingsEventPaths(response responseError) []observability.FieldPath {
	for path := range response.fieldErrors {
		switch {
		case path == "/query" || strings.HasPrefix(path, "/query/"):
			return []observability.FieldPath{observability.FieldPathQuery}
		case path == "/view" || strings.HasPrefix(path, "/view/"):
			return []observability.FieldPath{observability.FieldPathView}
		}
	}
	return nil
}

func (handler *routeHandler) rejectRankings(
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
		rankingsEventErrorCode(response.code),
		paths,
		contentLength,
		time.Since(startedAt),
	)
	if eventErr == nil {
		_ = handler.events.Emit(event)
	}
}

func rankingsEventErrorCode(code errorCode) observability.QueryErrorCode {
	switch code {
	case codeInvalidJSON:
		return observability.QueryErrorInvalidJSON
	case codeInvalidRequest,
		errorCode(ranking.CodeFieldInvalid),
		errorCode(ranking.CodePositionSelectionConflict),
		errorCode(ranking.CodePositionNotFound),
		errorCode(ranking.CodePositionNotSelectable),
		errorCode(ranking.CodePositionSubjectMismatch),
		errorCode(ranking.CodeCapabilityNotAvailable):
		return observability.QueryErrorInvalidRequest
	case codeEntityNotFound, errorCode(ranking.CodeUserNotFound):
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
