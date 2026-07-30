package costar

import (
	"context"
	"errors"
	"time"
)

// Code is one stable co-star-domain outcome.
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
	CodeParticipantLimitExceeded  Code = "PARTICIPANT_LIMIT_EXCEEDED"
	CodeIdentityLimitExceeded     Code = "IDENTITY_LIMIT_EXCEEDED"
	CodeEntityNotFound            Code = "ENTITY_NOT_FOUND"
	CodeCollectionNotPublic       Code = "COLLECTION_NOT_PUBLIC"
	CodeUserNotFound              Code = "USER_NOT_FOUND"
	CodeRateLimited               Code = "RATE_LIMITED"
	CodeServerBusy                Code = "SERVER_BUSY"
	CodeNotReady                  Code = "NOT_READY"
	CodeUpstreamTimeout           Code = "UPSTREAM_TIMEOUT"
	CodeUpstreamUnavailable       Code = "UPSTREAM_UNAVAILABLE"
	CodeUpstreamProtocol          Code = "UPSTREAM_PROTOCOL_ERROR"
	CodeInternal                  Code = "INTERNAL_ERROR"
	CodeReferenceMissing          Code = "REFERENCE_MISSING"
	CodeCanceled                  Code = "CO_STAR_CANCELED"
	CodeEvaluationFailed          Code = "CO_STAR_EVALUATION_FAILED"
)

// Error retains one safe field path and accepted cause.
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

func (err *Error) Error() string     { return string(err.code) }
func (err *Error) Code() Code        { return err.code }
func (err *Error) Path() string      { return err.path }
func (err *Error) FieldCode() string { return err.fieldCode }
func (err *Error) Message() string   { return err.message }
func (err *Error) Retryable() bool   { return err != nil && err.retryable }
func (err *Error) Unwrap() error     { return err.cause }
func (err *Error) DataVersion() string {
	if err == nil {
		return ""
	}
	return err.dataVersion
}
func (err *Error) RetryAfter() time.Duration {
	if err == nil {
		return 0
	}
	return err.retryAfter
}

// ErrorDetails extracts the stable co-star failure boundary.
func ErrorDetails(err error) (*Error, bool) {
	var failure *Error
	if !errors.As(err, &failure) {
		return nil, false
	}
	return failure, true
}

// ErrorCode extracts a co-star-domain outcome.
func ErrorCode(err error) (Code, bool) {
	failure, ok := ErrorDetails(err)
	if !ok {
		return "", false
	}
	return failure.Code(), true
}

// NewTransientFailure constructs a bounded admitted resource-pressure error.
func NewTransientFailure(code Code, retryAfter time.Duration, cause error) (*Error, error) {
	if retryAfter < 0 {
		return nil, errors.New("costar: negative retry delay")
	}
	failure := &Error{code: code, retryable: true, retryAfter: retryAfter, cause: cause}
	switch code {
	case CodeRateLimited:
		failure.message = "collection is rate limited"
	case CodeServerBusy:
		failure.message = "co-star is busy"
	default:
		return nil, errors.New("costar: unsupported transient failure code")
	}
	return failure, nil
}

func fieldError(path string) error {
	return fail(CodeFieldInvalid, "co-star request is invalid", path, "INVALID_FORMAT", false, nil)
}

func requestFailure(message, path, fieldCode string) *Error {
	return fail(CodeFieldInvalid, message, path, fieldCode, false, nil)
}

func unknownFieldFailure(path string) *Error {
	return fail(
		CodeInvalidRequest,
		"the request contains an unknown field",
		path,
		"UNKNOWN_FIELD",
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
		code: code, path: path, fieldCode: fieldCode, message: message,
		retryable: retryable, cause: cause,
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
