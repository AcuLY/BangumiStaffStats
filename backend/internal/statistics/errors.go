package statistics

import (
	"context"
	"errors"
)

// Code is a stable statistics outcome.
type Code string

const (
	CodeScoreInvalid       Code = "STATISTICS_SCORE_INVALID"
	CodeRatingCountInvalid Code = "STATISTICS_RATING_COUNT_INVALID"
	CodeInputInvalid       Code = "STATISTICS_INPUT_INVALID"
	CodeVersionMismatch    Code = "STATISTICS_VERSION_MISMATCH"
	CodeCanceled           Code = "STATISTICS_CANCELED"
	CodeSourceUnavailable  Code = "STATISTICS_SOURCE_UNAVAILABLE"
)

// Error exposes a bounded stable code while retaining a cause for errors.Is.
type Error struct {
	code  Code
	cause error
}

func (e *Error) Error() string { return string(e.code) }

// Code returns the stable outcome.
func (e *Error) Code() Code { return e.code }

// Unwrap exposes cancellation and source causes without adding them to Error.
func (e *Error) Unwrap() error { return e.cause }

func outcome(code Code) error { return &Error{code: code} }

func outcomeCause(code Code, cause error) error {
	return &Error{code: code, cause: cause}
}

// ErrorCode extracts a statistics outcome.
func ErrorCode(err error) (Code, bool) {
	var statisticsError *Error
	if !errors.As(err, &statisticsError) {
		return "", false
	}
	return statisticsError.Code(), true
}

func contextError(ctx context.Context) error {
	if ctx == nil {
		return outcome(CodeInputInvalid)
	}
	if cause := context.Cause(ctx); cause != nil {
		return outcomeCause(CodeCanceled, cause)
	}
	return nil
}
