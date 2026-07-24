package observability

import (
	"encoding/json"
	"errors"
	"io"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// ArchiveErrorCode is the closed stable code set admitted to the startup
// failure event. It deliberately contains no raw error text.
type ArchiveErrorCode string

const (
	ArchiveErrorManifestSchemaInvalid       ArchiveErrorCode = "MANIFEST_SCHEMA_INVALID"
	ArchiveErrorPointerSchemaInvalid        ArchiveErrorCode = "POINTER_SCHEMA_INVALID"
	ArchiveErrorManifestAccountingInvalid   ArchiveErrorCode = "MANIFEST_ACCOUNTING_INVALID"
	ArchiveErrorVersionUnsupported          ArchiveErrorCode = "ARCHIVE_VERSION_UNSUPPORTED"
	ArchiveErrorDataVersionMismatch         ArchiveErrorCode = "DATA_VERSION_MISMATCH"
	ArchiveErrorSQLiteDataVersionMismatch   ArchiveErrorCode = "SQLITE_DATA_VERSION_MISMATCH"
	ArchiveErrorSQLiteFormatInvalid         ArchiveErrorCode = "SQLITE_FORMAT_INVALID"
	ArchiveErrorSQLiteDigestMismatch        ArchiveErrorCode = "SQLITE_DIGEST_MISMATCH"
	ArchiveErrorSQLiteRequiredObjectMissing ArchiveErrorCode = "SQLITE_REQUIRED_OBJECT_MISSING"
	ArchiveErrorSQLiteTableCountMismatch    ArchiveErrorCode = "SQLITE_TABLE_COUNT_MISMATCH"
	ArchiveErrorRootInvalid                 ArchiveErrorCode = "ARCHIVE_ROOT_INVALID"
	ArchiveErrorFileInvalid                 ArchiveErrorCode = "ARCHIVE_FILE_INVALID"
	ArchiveErrorImmutableLayoutInvalid      ArchiveErrorCode = "ARCHIVE_IMMUTABLE_LAYOUT_INVALID"
	ArchiveErrorContextCanceled             ArchiveErrorCode = "ARCHIVE_CONTEXT_CANCELED"
	ArchiveErrorAlreadyPublished            ArchiveErrorCode = "ARCHIVE_ALREADY_PUBLISHED"
	ArchiveErrorInternal                    ArchiveErrorCode = "INTERNAL_ERROR"
)

// ParseArchiveErrorCode converts a consumer-owned stable code into the closed
// observability code set.
func ParseArchiveErrorCode(value string) (ArchiveErrorCode, bool) {
	code := ArchiveErrorCode(value)
	switch code {
	case ArchiveErrorManifestSchemaInvalid,
		ArchiveErrorPointerSchemaInvalid,
		ArchiveErrorManifestAccountingInvalid,
		ArchiveErrorVersionUnsupported,
		ArchiveErrorDataVersionMismatch,
		ArchiveErrorSQLiteDataVersionMismatch,
		ArchiveErrorSQLiteFormatInvalid,
		ArchiveErrorSQLiteDigestMismatch,
		ArchiveErrorSQLiteRequiredObjectMissing,
		ArchiveErrorSQLiteTableCountMismatch,
		ArchiveErrorRootInvalid,
		ArchiveErrorFileInvalid,
		ArchiveErrorImmutableLayoutInvalid,
		ArchiveErrorContextCanceled,
		ArchiveErrorAlreadyPublished,
		ArchiveErrorInternal:
		return code, true
	default:
		return "", false
	}
}

// QueryOperation is a closed future business-operation event value. Runtime
// health and metrics routes never construct a QueryTerminal.
type QueryOperation string

const (
	QueryOperationRankings   QueryOperation = "rankings"
	QueryOperationCandidates QueryOperation = "candidates"
	QueryOperationPerson     QueryOperation = "person_detail"
	QueryOperationPartners   QueryOperation = "partners"
	QueryOperationCoStar     QueryOperation = "co_star"
	QueryOperationCatalog    QueryOperation = "catalog"
	QueryOperationImage      QueryOperation = "image"
)

// QueryErrorCode is a closed stable rejection classification.
type QueryErrorCode string

const (
	QueryErrorInvalidJSON          QueryErrorCode = "INVALID_JSON"
	QueryErrorInvalidRequest       QueryErrorCode = "INVALID_REQUEST"
	QueryErrorEntityNotFound       QueryErrorCode = "ENTITY_NOT_FOUND"
	QueryErrorRequestTooLarge      QueryErrorCode = "REQUEST_TOO_LARGE"
	QueryErrorUnsupportedMediaType QueryErrorCode = "UNSUPPORTED_MEDIA_TYPE"
	QueryErrorNotReady             QueryErrorCode = "NOT_READY"
	QueryErrorUpstreamTimeout      QueryErrorCode = "UPSTREAM_TIMEOUT"
	QueryErrorInternal             QueryErrorCode = "INTERNAL_ERROR"
)

// FieldPath is a closed safe field-path value for rejected query events.
type FieldPath string

const (
	FieldPathBody  FieldPath = "/body"
	FieldPathQuery FieldPath = "/query"
	FieldPathInput FieldPath = "/input"
	FieldPathView  FieldPath = "/view"
)

// Event is an allowlisted event value. Its payload cannot be populated with an
// arbitrary map by another package.
type Event struct {
	payload any
	emitted *atomic.Bool
}

type archiveLoadFailedPayload struct {
	Event     string `json:"event"`
	Channel   string `json:"channel"`
	Phase     string `json:"phase"`
	ErrorCode string `json:"error_code"`
}

type queryCompletedPayload struct {
	Event         string `json:"event"`
	Channel       string `json:"channel"`
	RequestID     string `json:"request_id"`
	Operation     string `json:"operation"`
	Status        int    `json:"status"`
	DurationMS    int64  `json:"duration_ms"`
	ResponseBytes int64  `json:"response_bytes"`
}

type queryRejectedPayload struct {
	Event         string   `json:"event"`
	Channel       string   `json:"channel"`
	RequestID     string   `json:"request_id"`
	Operation     string   `json:"operation"`
	ContentLength int64    `json:"content_length"`
	Status        int      `json:"status"`
	ErrorCode     string   `json:"error_code"`
	FieldPaths    []string `json:"field_paths"`
	DurationMS    int64    `json:"duration_ms"`
}

func archiveLoadFailedEvent(code ArchiveErrorCode) (Event, error) {
	if _, valid := ParseArchiveErrorCode(string(code)); !valid {
		return Event{}, errors.New("observability: invalid Archive error code")
	}
	return Event{
		payload: archiveLoadFailedPayload{
			Event:     "archive_load_failed",
			Channel:   "app",
			Phase:     "startup",
			ErrorCode: string(code),
		},
		emitted: new(atomic.Bool),
	}, nil
}

// QueryTerminal enforces one terminal query event for one typed business
// request.
type QueryTerminal struct {
	requestID string
	operation QueryOperation
	emitted   atomic.Bool
}

// NewQueryTerminal validates the only per-request values admitted to query
// event construction.
func NewQueryTerminal(requestID string, operation QueryOperation) (*QueryTerminal, error) {
	if !validRequestID(requestID) {
		return nil, errors.New("observability: invalid request ID")
	}
	if !validQueryOperation(operation) {
		return nil, errors.New("observability: invalid query operation")
	}
	return &QueryTerminal{requestID: requestID, operation: operation}, nil
}

// Complete constructs the sole completion event for this typed request.
func (q *QueryTerminal) Complete(duration time.Duration, responseBytes int64) (Event, error) {
	if q == nil || !validEventDuration(duration) || responseBytes < 0 || responseBytes > 1<<30 {
		return Event{}, errors.New("observability: invalid completion facts")
	}
	if !q.emitted.CompareAndSwap(false, true) {
		return Event{}, ErrTerminalEventAlreadyBuilt
	}
	return Event{
		payload: queryCompletedPayload{
			Event:         "query_completed",
			Channel:       "query",
			RequestID:     q.requestID,
			Operation:     string(q.operation),
			Status:        200,
			DurationMS:    duration.Milliseconds(),
			ResponseBytes: responseBytes,
		},
		emitted: new(atomic.Bool),
	}, nil
}

// Reject constructs the sole rejection event for this typed request.
func (q *QueryTerminal) Reject(
	status int,
	code QueryErrorCode,
	fieldPaths []FieldPath,
	contentLength int64,
	duration time.Duration,
) (Event, error) {
	if q == nil || status < 400 || status > 599 || !validQueryErrorCode(code) || !validEventDuration(duration) {
		return Event{}, errors.New("observability: invalid rejection facts")
	}
	safePaths, err := normalizeFieldPaths(fieldPaths)
	if err != nil {
		return Event{}, err
	}
	if !q.emitted.CompareAndSwap(false, true) {
		return Event{}, ErrTerminalEventAlreadyBuilt
	}
	if contentLength < 0 {
		contentLength = 0
	}
	if contentLength > 65_537 {
		contentLength = 65_537
	}
	return Event{
		payload: queryRejectedPayload{
			Event:         "query_rejected",
			Channel:       "query",
			RequestID:     q.requestID,
			Operation:     string(q.operation),
			ContentLength: contentLength,
			Status:        status,
			ErrorCode:     string(code),
			FieldPaths:    safePaths,
			DurationMS:    duration.Milliseconds(),
		},
		emitted: new(atomic.Bool),
	}, nil
}

func validRequestID(value string) bool {
	if len(value) == 0 || len(value) > 128 {
		return false
	}
	for _, character := range value {
		if character >= 'a' && character <= 'z' ||
			character >= 'A' && character <= 'Z' ||
			character >= '0' && character <= '9' {
			continue
		}
		switch character {
		case '.', '_', '-':
			continue
		default:
			return false
		}
	}
	return true
}

func validQueryOperation(value QueryOperation) bool {
	switch value {
	case QueryOperationRankings,
		QueryOperationCandidates,
		QueryOperationPerson,
		QueryOperationPartners,
		QueryOperationCoStar,
		QueryOperationCatalog,
		QueryOperationImage:
		return true
	default:
		return false
	}
}

func validQueryErrorCode(value QueryErrorCode) bool {
	switch value {
	case QueryErrorInvalidJSON,
		QueryErrorInvalidRequest,
		QueryErrorEntityNotFound,
		QueryErrorRequestTooLarge,
		QueryErrorUnsupportedMediaType,
		QueryErrorNotReady,
		QueryErrorUpstreamTimeout,
		QueryErrorInternal:
		return true
	default:
		return false
	}
}

func validEventDuration(value time.Duration) bool {
	return value >= 0 && value <= 24*time.Hour
}

func normalizeFieldPaths(values []FieldPath) ([]string, error) {
	seen := make(map[FieldPath]struct{}, len(values))
	for _, value := range values {
		switch value {
		case FieldPathBody, FieldPathQuery, FieldPathInput, FieldPathView:
			seen[value] = struct{}{}
		default:
			return nil, errors.New("observability: invalid field path")
		}
	}
	result := make([]string, 0, len(seen))
	for value := range seen {
		result = append(result, string(value))
	}
	slices.Sort(result)
	return result, nil
}

var (
	// ErrTerminalEventAlreadyBuilt indicates that a query request already has
	// its mutually exclusive completion or rejection event.
	ErrTerminalEventAlreadyBuilt = errors.New("observability: terminal query event already built")

	// ErrEventAlreadyEmitted indicates that an allowlisted event has already
	// been handed to a sink.
	ErrEventAlreadyEmitted = errors.New("observability: event already emitted")

	// ErrArchiveLoadEventAlreadyEmitted indicates that the process-level
	// startup failure event was already attempted.
	ErrArchiveLoadEventAlreadyEmitted = errors.New("observability: Archive load event already emitted")
)

// EventSink serializes one-line JSON events. It contains a process-local guard
// for the sole Archive startup failure event.
type EventSink struct {
	mu sync.Mutex

	writer             io.Writer
	archiveLoadEmitted bool
}

// NewEventSink returns an event sink for a process-owned writer.
func NewEventSink(writer io.Writer) *EventSink {
	return &EventSink{writer: writer}
}

// EmitArchiveLoadFailed emits at most one bounded app/startup event.
func (s *EventSink) EmitArchiveLoadFailed(code ArchiveErrorCode) error {
	event, err := archiveLoadFailedEvent(code)
	if err != nil {
		return err
	}
	if s == nil || s.writer == nil {
		return errors.New("observability: nil event sink")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.archiveLoadEmitted {
		return ErrArchiveLoadEventAlreadyEmitted
	}
	s.archiveLoadEmitted = true
	return writeEvent(s.writer, event)
}

// Emit emits one allowlisted query event.
func (s *EventSink) Emit(event Event) error {
	if s == nil || s.writer == nil {
		return errors.New("observability: nil event sink")
	}
	if event.payload == nil || event.emitted == nil {
		return errors.New("observability: empty event")
	}
	if !event.emitted.CompareAndSwap(false, true) {
		return ErrEventAlreadyEmitted
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return writeEvent(s.writer, event)
}

func writeEvent(writer io.Writer, event Event) error {
	if event.payload == nil {
		return errors.New("observability: empty event")
	}
	data, err := json.Marshal(event.payload)
	if err != nil {
		return errors.New("observability: encode event")
	}
	if bytesContainLineBreak(data) {
		return errors.New("observability: multiline event")
	}
	data = append(data, '\n')
	written, err := writer.Write(data)
	if err != nil {
		return err
	}
	if written != len(data) {
		return io.ErrShortWrite
	}
	return nil
}

func bytesContainLineBreak(value []byte) bool {
	return strings.ContainsRune(string(value), '\n') || strings.ContainsRune(string(value), '\r')
}
