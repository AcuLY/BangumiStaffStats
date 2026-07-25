package candidates

import (
	"context"
	"errors"
	"time"
)

// Code is a stable candidate-domain outcome.
type Code string

const (
	CodeInvalidJSON               Code = "INVALID_JSON"
	CodeInvalidRequest            Code = "INVALID_REQUEST"
	CodeFieldInvalid              Code = "FIELD_INVALID"
	CodePositionSelectionConflict Code = "POSITION_SELECTION_CONFLICT"
	CodePositionNotFound          Code = "POSITION_NOT_FOUND"
	CodePositionNotSelectable     Code = "POSITION_NOT_SELECTABLE"
	CodePositionSubjectMismatch   Code = "POSITION_SUBJECT_TYPE_MISMATCH"
	CodeCapabilityNotAvailable    Code = "CAPABILITY_NOT_AVAILABLE"
	CodeCollectionNotPublic       Code = "COLLECTION_NOT_PUBLIC"
	CodeUserNotFound              Code = "USER_NOT_FOUND"
	CodeRateLimited               Code = "RATE_LIMITED"
	CodeServerBusy                Code = "SERVER_BUSY"
	CodeNotReady                  Code = "NOT_READY"
	CodeUpstreamTimeout           Code = "UPSTREAM_TIMEOUT"
	CodeUpstreamUnavailable       Code = "UPSTREAM_UNAVAILABLE"
	CodeUpstreamProtocol          Code = "UPSTREAM_PROTOCOL_ERROR"
	CodeInternal                  Code = "INTERNAL_ERROR"
	CodePersonReferenceMissing    Code = "PERSON_REFERENCE_MISSING"
	CodeCanceled                  Code = "CANDIDATES_CANCELED"
	CodeEvaluationFailed          Code = "CANDIDATES_EVALUATION_FAILED"
)

// Error retains one safe field path and cause.
type Error struct {
	code        Code
	path        string
	fieldCode   string
	message     string
	retryable   bool
	retryAfter  time.Duration
	dataVersion string
	cause       error
}

func (err *Error) Error() string { return string(err.code) }

// Code returns the stable outcome code.
func (err *Error) Code() Code { return err.code }

// Path returns the request-relative field path when applicable.
func (err *Error) Path() string { return err.path }

// FieldCode returns the stable field classification, when applicable.
func (err *Error) FieldCode() string { return err.fieldCode }

// Message returns the endpoint-owned public message.
func (err *Error) Message() string { return err.message }

// Retryable reports whether retrying can succeed without changing the request.
func (err *Error) Retryable() bool { return err != nil && err.retryable }

// RetryAfter returns bounded retry guidance for admitted resource pressure.
func (err *Error) RetryAfter() time.Duration {
	if err == nil {
		return 0
	}
	return err.retryAfter
}

// DataVersion returns the Archive identity after the readiness boundary.
func (err *Error) DataVersion() string {
	if err == nil {
		return ""
	}
	return err.dataVersion
}

// Unwrap preserves cancellation and accepted domain causes.
func (err *Error) Unwrap() error { return err.cause }

// ErrorDetails extracts the stable candidates failure boundary.
func ErrorDetails(err error) (*Error, bool) {
	var candidateError *Error
	if !errors.As(err, &candidateError) {
		return nil, false
	}
	return candidateError, true
}

// NewTransientFailure constructs one closed admitted resource-pressure
// outcome for HTTP transport.
func NewTransientFailure(
	code Code,
	retryAfter time.Duration,
	cause error,
) (*Error, error) {
	if retryAfter < 0 {
		return nil, errors.New("candidates: negative retry delay")
	}
	failure := &Error{
		code:       code,
		retryable:  true,
		retryAfter: retryAfter,
		cause:      cause,
	}
	switch code {
	case CodeRateLimited:
		failure.message = "collection is rate limited"
	case CodeServerBusy:
		failure.message = "candidates is busy"
	default:
		return nil, errors.New("candidates: unsupported transient failure code")
	}
	return failure, nil
}

// ErrorCode extracts a candidate-domain outcome.
func ErrorCode(err error) (Code, bool) {
	var candidateError *Error
	if !errors.As(err, &candidateError) {
		return "", false
	}
	return candidateError.Code(), true
}

func fieldError(path string) error {
	return fail(
		CodeFieldInvalid,
		"candidates request is invalid",
		path,
		"INVALID_FORMAT",
		false,
		nil,
	)
}

func evaluationError(ctx context.Context, cause error) error {
	if ctx != nil {
		if contextCause := context.Cause(ctx); contextCause != nil {
			return &Error{code: CodeCanceled, cause: contextCause}
		}
	}
	return &Error{code: CodeEvaluationFailed, cause: cause}
}

func contextError(ctx context.Context) error {
	if ctx == nil {
		return fieldError("")
	}
	if cause := context.Cause(ctx); cause != nil {
		return &Error{code: CodeCanceled, cause: cause}
	}
	return nil
}

func fail(
	code Code,
	message string,
	path string,
	fieldCode string,
	retryable bool,
	cause error,
) *Error {
	return &Error{
		code:      code,
		path:      path,
		fieldCode: fieldCode,
		message:   message,
		retryable: retryable,
		cause:     cause,
	}
}

func withDataVersion(err error, dataVersion string) error {
	var failure *Error
	if !errors.As(err, &failure) || dataVersion == "" {
		return err
	}
	copy := *failure
	copy.dataVersion = dataVersion
	return &copy
}
