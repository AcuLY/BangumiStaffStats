package persondetail

import (
	"context"
	"errors"
	"time"
)

// Code is a stable person-detail outcome consumed by the transport boundary.
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
	CodePersonNotInQueryResult    Code = "PERSON_NOT_IN_QUERY_RESULT"
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
	CodeCanceled                  Code = "CANCELED"
)

// Failure is a bounded public classification. Error never exposes a source
// query, UID, entity name, upstream response, or arbitrary cause text.
type Failure struct {
	code        Code
	path        string
	fieldCode   string
	message     string
	retryable   bool
	retryAfter  time.Duration
	dataVersion string
	cause       error
}

func (failure *Failure) Error() string {
	if failure == nil {
		return ""
	}
	return string(failure.code)
}

func (failure *Failure) Unwrap() error {
	if failure == nil {
		return nil
	}
	return failure.cause
}

func (failure *Failure) Code() Code {
	if failure == nil {
		return ""
	}
	return failure.code
}

func (failure *Failure) Path() string {
	if failure == nil {
		return ""
	}
	return failure.path
}

func (failure *Failure) FieldCode() string {
	if failure == nil {
		return ""
	}
	return failure.fieldCode
}

func (failure *Failure) Message() string {
	if failure == nil {
		return ""
	}
	return failure.message
}

func (failure *Failure) Retryable() bool {
	return failure != nil && failure.retryable
}

func (failure *Failure) RetryAfter() time.Duration {
	if failure == nil {
		return 0
	}
	return failure.retryAfter
}

func (failure *Failure) DataVersion() string {
	if failure == nil {
		return ""
	}
	return failure.dataVersion
}

// ErrorDetails extracts a stable person-detail failure.
func ErrorDetails(err error) (*Failure, bool) {
	var failure *Failure
	if !errors.As(err, &failure) {
		return nil, false
	}
	return failure, true
}

// NewTransientFailure constructs one closed retryable pressure outcome for
// transport tests and adapters.
func NewTransientFailure(
	code Code,
	retryAfter time.Duration,
	cause error,
) (*Failure, error) {
	if retryAfter < 0 {
		return nil, errors.New("persondetail: negative retry delay")
	}
	failure := &Failure{
		code:       code,
		retryable:  true,
		retryAfter: retryAfter,
		cause:      cause,
	}
	switch code {
	case CodeRateLimited:
		failure.message = "collection is rate limited"
	case CodeServerBusy:
		failure.message = "person detail is busy"
	default:
		return nil, errors.New("persondetail: unsupported transient failure code")
	}
	return failure, nil
}

func fail(
	code Code,
	message string,
	path string,
	fieldCode string,
	retryable bool,
	cause error,
) error {
	return &Failure{
		code:      code,
		message:   message,
		path:      path,
		fieldCode: fieldCode,
		retryable: retryable,
		cause:     cause,
	}
}

func fieldError(path string) error {
	return fail(CodeFieldInvalid, "person detail field is invalid", path, "INVALID_FORMAT", false, nil)
}

func capabilityError(path string) error {
	return fail(
		CodeCapabilityNotAvailable,
		"position capability is not available",
		path,
		string(CodeCapabilityNotAvailable),
		false,
		nil,
	)
}

func contextError(ctx context.Context) error {
	if ctx == nil {
		return fieldError("")
	}
	if cause := context.Cause(ctx); cause != nil {
		return fail(CodeCanceled, "person detail request was canceled", "", "", false, cause)
	}
	return nil
}

func withDataVersion(err error, dataVersion string) error {
	var failure *Failure
	if !errors.As(err, &failure) || dataVersion == "" {
		return err
	}
	copy := *failure
	copy.dataVersion = dataVersion
	return &copy
}
