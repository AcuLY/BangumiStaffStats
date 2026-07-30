package ranking

import (
	"errors"
	"time"
)

// Code is a stable rankings outcome consumed by the HTTP boundary.
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
)

// Failure is the bounded public classification of a rankings error. Cause is
// retained only for cancellation and errors.Is; it is never suitable for a
// response or log message.
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

// Code returns the stable machine-readable error code.
func (failure *Failure) Code() Code {
	if failure == nil {
		return ""
	}
	return failure.code
}

// Path returns a schema-owned RFC 6901 path, or an empty string.
func (failure *Failure) Path() string {
	if failure == nil {
		return ""
	}
	return failure.path
}

// FieldCode returns a stable field error code, or an empty string.
func (failure *Failure) FieldCode() string {
	if failure == nil {
		return ""
	}
	return failure.fieldCode
}

// Message returns a fixed endpoint-owned response message.
func (failure *Failure) Message() string {
	if failure == nil {
		return ""
	}
	return failure.message
}

// Retryable reports whether retrying can succeed without changing the request.
func (failure *Failure) Retryable() bool {
	return failure != nil && failure.retryable
}

// RetryAfter returns bounded retry guidance for server-busy outcomes.
func (failure *Failure) RetryAfter() time.Duration {
	if failure == nil {
		return 0
	}
	return failure.retryAfter
}

// DataVersion returns the Archive identity when work crossed the Archive
// readiness boundary before failing.
func (failure *Failure) DataVersion() string {
	if failure == nil {
		return ""
	}
	return failure.dataVersion
}

// ErrorDetails extracts the stable rankings failure boundary.
func ErrorDetails(err error) (*Failure, bool) {
	var failure *Failure
	if !errors.As(err, &failure) {
		return nil, false
	}
	return failure, true
}

// NewTransientFailure constructs one closed resource-pressure outcome for an
// admitted runtime adapter. Messages remain endpoint-owned and retry guidance
// is interpreted and bounded by the HTTP boundary.
func NewTransientFailure(
	code Code,
	retryAfter time.Duration,
	cause error,
) (*Failure, error) {
	if retryAfter < 0 {
		return nil, errors.New("ranking: negative retry delay")
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
		failure.message = "rankings is busy"
	default:
		return nil, errors.New("ranking: unsupported transient failure code")
	}
	return failure, nil
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
		path:      path,
		fieldCode: fieldCode,
		message:   message,
		retryable: retryable,
		cause:     cause,
	}
}
