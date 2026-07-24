package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi/wire"
)

// MaxJSONBodyBytes is the pre-decode request body limit.
const MaxJSONBodyBytes = 65_536

type errorCode = wire.ErrorEnvelopeV1ErrorCode
type fieldErrorCode = wire.ErrorEnvelopeV1ErrorFieldErrors

const (
	codeInvalidJSON          errorCode = "INVALID_JSON"
	codeInvalidRequest       errorCode = "INVALID_REQUEST"
	codeEntityNotFound       errorCode = "ENTITY_NOT_FOUND"
	codeRequestTooLarge      errorCode = "REQUEST_TOO_LARGE"
	codeUnsupportedMediaType errorCode = "UNSUPPORTED_MEDIA_TYPE"
	codeServerBusy           errorCode = "SERVER_BUSY"
	codeNotReady             errorCode = "NOT_READY"
	codeUpstreamTimeout      errorCode = "UPSTREAM_TIMEOUT"
	codeUpstreamUnavailable  errorCode = "UPSTREAM_UNAVAILABLE"
	codeUpstreamProtocol     errorCode = "UPSTREAM_PROTOCOL_ERROR"
	codeInternalError        errorCode = "INTERNAL_ERROR"
)

type responseError struct {
	status      int
	code        errorCode
	message     string
	retryable   bool
	fieldErrors map[string][]fieldErrorCode
}

var (
	notFoundResponse = responseError{
		status:  http.StatusNotFound,
		code:    codeEntityNotFound,
		message: "resource not found",
	}
	methodResponse = responseError{
		status:  http.StatusMethodNotAllowed,
		code:    codeInvalidRequest,
		message: "method not allowed",
	}
	notReadyResponse = responseError{
		status:    http.StatusServiceUnavailable,
		code:      codeNotReady,
		message:   "service not ready",
		retryable: true,
	}
	timeoutResponse = responseError{
		status:    http.StatusGatewayTimeout,
		code:      codeUpstreamTimeout,
		message:   "request timed out",
		retryable: true,
	}
	serverBusyResponse = responseError{
		status:    http.StatusServiceUnavailable,
		code:      codeServerBusy,
		message:   "service busy",
		retryable: true,
	}
	upstreamUnavailableResponse = responseError{
		status:    http.StatusServiceUnavailable,
		code:      codeUpstreamUnavailable,
		message:   "upstream unavailable",
		retryable: true,
	}
	upstreamProtocolResponse = responseError{
		status:    http.StatusBadGateway,
		code:      codeUpstreamProtocol,
		message:   "upstream response invalid",
		retryable: true,
	}
	internalResponse = responseError{
		status:    http.StatusInternalServerError,
		code:      codeInternalError,
		message:   "internal server error",
		retryable: true,
	}
)

// TransportError is a bounded strict-decoder classification.
type TransportError struct {
	response responseError
}

// Error returns only the stable error code.
func (e *TransportError) Error() string {
	if e == nil {
		return ""
	}
	return string(e.response.code)
}

// Status returns the stable HTTP status classification.
func (e *TransportError) Status() int {
	if e == nil {
		return 0
	}
	return e.response.status
}

// Code returns the stable machine-readable classification.
func (e *TransportError) Code() string {
	if e == nil {
		return ""
	}
	return string(e.response.code)
}

// Retryable reports the stable retryability classification.
func (e *TransportError) Retryable() bool {
	return e != nil && e.response.retryable
}

// JSONStructuralValidator validates endpoint-owned required, null-presence, and
// unknown-field rules against the exact bounded raw JSON before typed decoding.
type JSONStructuralValidator func(json.RawMessage) error

// DecodeStrictJSON decodes exactly one bounded parameter-free application/json
// value only after a mandatory endpoint-owned structural validator accepts the
// exact raw value.
func DecodeStrictJSON(
	request *http.Request,
	destination any,
	validateStructure JSONStructuralValidator,
) *TransportError {
	if request == nil || request.Body == nil {
		return invalidJSONResponse()
	}
	if destination == nil || validateStructure == nil {
		return invalidRequestResponse()
	}
	for name := range request.Header {
		if strings.EqualFold(name, "Content-Encoding") {
			return unsupportedMediaResponse()
		}
	}
	contentTypes := request.Header.Values("Content-Type")
	if len(contentTypes) != 1 || !strings.EqualFold(strings.TrimSpace(contentTypes[0]), "application/json") {
		return unsupportedMediaResponse()
	}
	if request.ContentLength > MaxJSONBodyBytes {
		return requestTooLargeResponse()
	}

	data, err := io.ReadAll(io.LimitReader(request.Body, MaxJSONBodyBytes+1))
	if err != nil {
		return invalidJSONResponse()
	}
	if len(data) > MaxJSONBodyBytes {
		return requestTooLargeResponse()
	}
	if !utf8.Valid(data) {
		return invalidJSONResponse()
	}
	if !json.Valid(data) {
		return invalidJSONResponse()
	}
	if err := validateStructure(json.RawMessage(bytes.Clone(data))); err != nil {
		return invalidRequestResponse()
	}

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return invalidRequestResponse()
	}
	var trailing json.RawMessage
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return invalidRequestResponse()
	}
	return nil
}

func invalidJSONResponse() *TransportError {
	return &TransportError{response: responseError{
		status:  http.StatusBadRequest,
		code:    codeInvalidJSON,
		message: "invalid JSON",
	}}
}

func invalidRequestResponse() *TransportError {
	return &TransportError{response: responseError{
		status:  http.StatusBadRequest,
		code:    codeInvalidRequest,
		message: "invalid request",
	}}
}

func requestTooLargeResponse() *TransportError {
	return &TransportError{response: responseError{
		status:  http.StatusRequestEntityTooLarge,
		code:    codeRequestTooLarge,
		message: "request body too large",
	}}
}

func unsupportedMediaResponse() *TransportError {
	return &TransportError{response: responseError{
		status:  http.StatusUnsupportedMediaType,
		code:    codeUnsupportedMediaType,
		message: "unsupported media type",
	}}
}

func writeTransportError(writer http.ResponseWriter, requestID string, transportError *TransportError) {
	if transportError == nil {
		writeError(writer, requestID, internalResponse)
		return
	}
	writeError(writer, requestID, transportError.response)
}

func writeError(writer http.ResponseWriter, requestID string, response responseError) {
	data := errorEnvelopeBytes(requestID, response)
	header := writer.Header()
	header.Set("Content-Type", "application/json")
	header.Set("Cache-Control", "no-store")
	writer.WriteHeader(response.status)
	_, _ = writer.Write(data)
}

func errorEnvelopeBytes(requestID string, response responseError) []byte {
	var envelope wire.ErrorEnvelopeV1
	envelope.Error.Code = response.code
	envelope.Error.Message = response.message
	envelope.Error.Retryable = response.retryable
	envelope.Error.FieldErrors = make(map[string][]wire.ErrorEnvelopeV1ErrorFieldErrors, len(response.fieldErrors))
	for path, values := range response.fieldErrors {
		envelope.Error.FieldErrors[path] = append([]wire.ErrorEnvelopeV1ErrorFieldErrors(nil), values...)
	}
	envelope.Meta.RequestId = requestID
	data, err := json.Marshal(envelope)
	if err != nil {
		panic("fixed error envelope cannot be encoded")
	}
	return data
}
