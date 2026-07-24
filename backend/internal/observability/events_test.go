package observability

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestArchiveLoadFailureEventIsExactBoundedAndOnce(t *testing.T) {
	var output bytes.Buffer
	sink := NewEventSink(&output)
	if err := sink.EmitArchiveLoadFailed(ArchiveErrorRootInvalid); err != nil {
		t.Fatal(err)
	}
	if err := sink.EmitArchiveLoadFailed(ArchiveErrorInternal); !errors.Is(err, ErrArchiveLoadEventAlreadyEmitted) {
		t.Fatalf("second event error = %v", err)
	}
	if output.String() != `{"event":"archive_load_failed","channel":"app","phase":"startup","error_code":"ARCHIVE_ROOT_INVALID"}`+"\n" {
		t.Fatalf("event = %q", output.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(output.Bytes()), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload) != 4 {
		t.Fatalf("fields = %#v", payload)
	}
	for _, forbidden := range []string{
		`"dataVersion":`, `"data_version":`, `"path":`, `"root":`,
		`"manifest":`, `"sqlite":`, `"request":`, `"uid":`, `"token":`,
		`"error_message":`, `"raw":`,
	} {
		if strings.Contains(strings.ToLower(output.String()), strings.ToLower(forbidden)) {
			t.Fatalf("event contains forbidden field/value %q", forbidden)
		}
	}
}

func TestArchiveLoadFailureCodeSetIsClosed(t *testing.T) {
	validCodes := []ArchiveErrorCode{
		ArchiveErrorManifestSchemaInvalid,
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
		ArchiveErrorInternal,
	}
	for _, code := range validCodes {
		parsed, ok := ParseArchiveErrorCode(string(code))
		if !ok || parsed != code {
			t.Fatalf("code %q did not round trip", code)
		}
		event, err := archiveLoadFailedEvent(code)
		if err != nil || event.payload == nil {
			t.Fatalf("event for %q = %#v, %v", code, event, err)
		}
	}
	if _, ok := ParseArchiveErrorCode("private error /tmp/archive"); ok {
		t.Fatal("accepted raw error as Archive code")
	}
	if _, err := archiveLoadFailedEvent(ArchiveErrorCode("UNKNOWN")); err == nil {
		t.Fatal("constructed event with unknown code")
	}
}

func TestQueryTerminalEventsAreMutuallyExclusiveAndAllowlisted(t *testing.T) {
	t.Run("completed then rejected", func(t *testing.T) {
		terminal, err := NewQueryTerminal("0123456789abcdef", QueryOperationRankings)
		if err != nil {
			t.Fatal(err)
		}
		event, err := terminal.Complete(125*time.Millisecond, 512)
		if err != nil {
			t.Fatal(err)
		}
		var output bytes.Buffer
		if err := NewEventSink(&output).Emit(event); err != nil {
			t.Fatal(err)
		}
		if err := NewEventSink(io.Discard).Emit(event); !errors.Is(err, ErrEventAlreadyEmitted) {
			t.Fatalf("duplicate event emission = %v", err)
		}
		if output.String() != `{"event":"query_completed","channel":"query","request_id":"0123456789abcdef","operation":"rankings","status":200,"duration_ms":125,"response_bytes":512}`+"\n" {
			t.Fatalf("event = %q", output.String())
		}
		if _, err := terminal.Reject(400, QueryErrorInvalidRequest, nil, 1, time.Millisecond); !errors.Is(err, ErrTerminalEventAlreadyBuilt) {
			t.Fatalf("rejection after completion = %v", err)
		}
	})

	t.Run("rejected then completed", func(t *testing.T) {
		terminal, err := NewQueryTerminal("0123456789abcdef", QueryOperationCoStar)
		if err != nil {
			t.Fatal(err)
		}
		event, err := terminal.Reject(
			400,
			QueryErrorInvalidRequest,
			[]FieldPath{FieldPathView, FieldPathBody, FieldPathView},
			1<<40,
			10*time.Millisecond,
		)
		if err != nil {
			t.Fatal(err)
		}
		var output bytes.Buffer
		if err := NewEventSink(&output).Emit(event); err != nil {
			t.Fatal(err)
		}
		if output.String() != `{"event":"query_rejected","channel":"query","request_id":"0123456789abcdef","operation":"co_star","content_length":65537,"status":400,"error_code":"INVALID_REQUEST","field_paths":["/body","/view"],"duration_ms":10}`+"\n" {
			t.Fatalf("event = %q", output.String())
		}
		if _, err := terminal.Complete(time.Millisecond, 1); !errors.Is(err, ErrTerminalEventAlreadyBuilt) {
			t.Fatalf("completion after rejection = %v", err)
		}
	})
}

func TestEventConstructorsRejectControlCharactersAndUnknownFields(t *testing.T) {
	for _, requestID := range []string{"", "id\nuid=1", "id\rtoken", strings.Repeat("a", 129)} {
		if _, err := NewQueryTerminal(requestID, QueryOperationRankings); err == nil {
			t.Fatalf("accepted request ID %q", requestID)
		}
	}
	if _, err := NewQueryTerminal("safe-id", QueryOperation("uid-1")); err == nil {
		t.Fatal("accepted arbitrary operation")
	}
	terminal, err := NewQueryTerminal("safe-id", QueryOperationRankings)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := terminal.Reject(400, QueryErrorCode("raw error"), nil, 0, 0); err == nil {
		t.Fatal("accepted arbitrary error code")
	}
	if _, err := terminal.Reject(400, QueryErrorInvalidRequest, []FieldPath{FieldPath("/attacker")}, 0, 0); err == nil {
		t.Fatal("accepted attacker field path")
	}
	if _, err := terminal.Complete(-time.Second, 0); err == nil {
		t.Fatal("accepted negative duration")
	}
}

func TestArchiveLoadFailureConcurrentEmissionWritesOneLine(t *testing.T) {
	var output lockedBuffer
	sink := NewEventSink(&output)
	var workers sync.WaitGroup
	results := make(chan error, 32)
	for index := 0; index < 32; index++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			results <- sink.EmitArchiveLoadFailed(ArchiveErrorContextCanceled)
		}()
	}
	workers.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
			continue
		}
		if !errors.Is(err, ErrArchiveLoadEventAlreadyEmitted) {
			t.Fatalf("unexpected error: %v", err)
		}
	}
	if successes != 1 || strings.Count(output.String(), "\n") != 1 {
		t.Fatalf("successes = %d, output = %q", successes, output.String())
	}
}

func TestArchiveLoadFailureWriteFailureIsTerminalAndNotRetried(t *testing.T) {
	writerFailure := errors.New("writer failed")
	testCases := []struct {
		name    string
		writer  io.Writer
		wantErr error
	}{
		{name: "writer error", writer: errorWriter{err: writerFailure}, wantErr: writerFailure},
		{name: "short write", writer: shortWriter{}, wantErr: io.ErrShortWrite},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			sink := NewEventSink(testCase.writer)
			if err := sink.EmitArchiveLoadFailed(ArchiveErrorInternal); !errors.Is(err, testCase.wantErr) {
				t.Fatalf("first attempt error = %v, want %v", err, testCase.wantErr)
			}
			if err := sink.EmitArchiveLoadFailed(ArchiveErrorInternal); !errors.Is(err, ErrArchiveLoadEventAlreadyEmitted) {
				t.Fatalf("second attempt error = %v", err)
			}
		})
	}
}

func TestEventSinkRejectsEmptyAndShortWrites(t *testing.T) {
	if err := NewEventSink(io.Discard).Emit(Event{}); err == nil {
		t.Fatal("accepted empty event")
	}
	sink := NewEventSink(shortWriter{})
	terminal, err := NewQueryTerminal("safe-id", QueryOperationCatalog)
	if err != nil {
		t.Fatal(err)
	}
	event, err := terminal.Complete(time.Millisecond, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := sink.Emit(event); !errors.Is(err, io.ErrShortWrite) {
		t.Fatalf("short write error = %v", err)
	}
}

type lockedBuffer struct {
	mu sync.Mutex
	bytes.Buffer
}

func (b *lockedBuffer) Write(value []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.Buffer.Write(value)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.Buffer.String()
}

type shortWriter struct{}

func (shortWriter) Write(value []byte) (int, error) {
	if len(value) == 0 {
		return 0, nil
	}
	return len(value) - 1, nil
}

type errorWriter struct {
	err error
}

func (w errorWriter) Write([]byte) (int, error) {
	return 0, w.err
}
