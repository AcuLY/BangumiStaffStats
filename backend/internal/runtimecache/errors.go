package runtimecache

import (
	"context"
	"errors"
	"time"
)

// Code is a stable runtime-cache outcome.
type Code string

const (
	CodeInvalidInput Code = "CACHE_INPUT_INVALID"
	CodeCanceled     Code = "CANCELED"
	CodeTimeout      Code = "TIMEOUT"
	CodeServerBusy   Code = "SERVER_BUSY"
)

// Error exposes a bounded stable code and optional retry guidance while
// retaining a safe cause for errors.Is.
type Error struct {
	code       Code
	cause      error
	retryAfter time.Duration
}

func (e *Error) Error() string { return string(e.code) }

// Code returns the stable outcome code.
func (e *Error) Code() Code { return e.code }

// RetryAfter returns bounded retry guidance. It is non-zero only for
// SERVER_BUSY.
func (e *Error) RetryAfter() time.Duration { return e.retryAfter }

// Unwrap exposes context cancellation without adding sensitive data to the
// public error text.
func (e *Error) Unwrap() error { return e.cause }

func outcome(code Code) error {
	return &Error{code: code}
}

func outcomeCause(code Code, cause error) error {
	return &Error{code: code, cause: cause}
}

func busyOutcome(retryAfter time.Duration) error {
	return &Error{code: CodeServerBusy, retryAfter: retryAfter}
}

// ErrorCode extracts a stable runtime-cache outcome.
func ErrorCode(err error) (Code, bool) {
	var cacheError *Error
	if !errors.As(err, &cacheError) {
		return "", false
	}
	return cacheError.Code(), true
}

func contextOutcome(ctx context.Context) error {
	if ctx == nil {
		return outcome(CodeInvalidInput)
	}
	if cause := context.Cause(ctx); cause != nil {
		if errors.Is(cause, context.DeadlineExceeded) {
			return outcomeCause(CodeTimeout, cause)
		}
		return outcomeCause(CodeCanceled, cause)
	}
	return nil
}

func normalizeContextOutcome(ctx context.Context, err error) error {
	if err == nil {
		return nil
	}
	if ctx != nil {
		if cause := context.Cause(ctx); cause != nil {
			if errors.Is(cause, context.DeadlineExceeded) {
				return outcomeCause(CodeTimeout, cause)
			}
			return outcomeCause(CodeCanceled, cause)
		}
	}
	return err
}
