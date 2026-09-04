package archive

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestOpenVersionDirectlyWithoutManifest(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	if _, err := os.Stat(runtimeSQLitePath(root, dataVersion)); err != nil {
		t.Fatal(err)
	}
	store, err := OpenVersion(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatalf("OpenVersion: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	if store.Identity().DataVersion != dataVersion {
		t.Fatalf("identity = %+v, want %s", store.Identity(), dataVersion)
	}
	var storedVersion string
	queryOne(t, store, "SELECT data_version FROM archive_meta WHERE singleton = 1", &storedVersion)
	if storedVersion != dataVersion {
		t.Fatalf("stored dataVersion = %q, want %q", storedVersion, dataVersion)
	}
	if _, err := store.QueryContext(context.Background(), "DELETE FROM archive_meta"); !errors.Is(err, ErrUnsafeQuery) {
		t.Fatalf("write error = %v, want ErrUnsafeQuery", err)
	}
}

func TestLoadCurrentPublishesDirectly(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, true)
	var state State
	if err := state.LoadCurrent(context.Background(), root); err != nil {
		t.Fatalf("LoadCurrent: %v", err)
	}
	store, ready := state.Current()
	if !ready || store == nil || store.Identity().DataVersion != dataVersion {
		t.Fatalf("current = %+v ready=%t", store, ready)
	}
	if err := state.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if state.Ready() {
		t.Fatal("state remained ready after close")
	}
}

func TestDirectOpenRejectsUnsafeSelectionAndSidecar(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, true)
	if _, err := OpenVersion(context.Background(), ".", dataVersion); err == nil {
		t.Fatal("relative root was accepted")
	}
	if _, err := OpenVersion(context.Background(), root, "../escape"); err == nil {
		t.Fatal("unsafe dataVersion was accepted")
	}

	sidecar := runtimeSQLitePath(root, dataVersion) + "-wal"
	if err := os.WriteFile(sidecar, []byte("unexpected"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := OpenVersion(context.Background(), root, dataVersion)
	requireCode(t, err, CodeArchiveImmutableLayoutInvalid)
}

func TestOpenVersionRejectsEmbeddedIdentityMismatch(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	otherVersion := dataVersion[:len(dataVersion)-1] + "0"
	if otherVersion == dataVersion {
		otherVersion = dataVersion[:len(dataVersion)-1] + "1"
	}
	if err := os.Rename(
		filepath.Join(root, versionsDirectory, dataVersion),
		filepath.Join(root, versionsDirectory, otherVersion),
	); err != nil {
		t.Fatal(err)
	}
	_, err := OpenVersion(context.Background(), root, otherVersion)
	requireCode(t, err, CodeArchiveFileInvalid)
}

func TestDirectOpenRejectsMalformedPointer(t *testing.T) {
	root, _ := arrangeValidCandidate(t, true)
	invalid := []byte(`{"pointerSchemaVersion":1,"dataVersion":"dv1-0000000000000000000000000000000000000000000000000000000000000000","manifestDigest":"sha256:0000000000000000000000000000000000000000000000000000000000000000","extra":true}`)
	if err := os.WriteFile(root+string(os.PathSeparator)+currentPointerFilename, invalid, 0o600); err != nil {
		t.Fatal(err)
	}
	var state State
	requireCode(t, state.LoadCurrent(context.Background(), root), CodeArchiveFileInvalid)
}

func TestDirectOpenCancellation(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := OpenVersion(ctx, root, dataVersion)
	requireCode(t, err, CodeArchiveContextCanceled)
}

func TestPublicationIsSingleAssignment(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	first, err := OpenVersion(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatal(err)
	}
	second, err := OpenVersion(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatal(err)
	}

	var state State
	errorsCh := make(chan error, 2)
	go func() { errorsCh <- state.publish(first) }()
	go func() { errorsCh <- state.publish(second) }()
	var success, rejected int
	for range 2 {
		if err := <-errorsCh; err == nil {
			success++
		} else if code, ok := ErrorCode(err); ok && code == CodeArchiveAlreadyPublished {
			rejected++
		} else {
			t.Fatalf("publish error = %v", err)
		}
	}
	if success != 1 || rejected != 1 {
		t.Fatalf("success=%d rejected=%d", success, rejected)
	}
	if err := state.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestStateReplaceAndRestoreOwnership(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	first, err := OpenVersion(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatal(err)
	}
	second, err := OpenVersion(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatal(err)
	}
	state := new(State)
	if err := state.publish(first); err != nil {
		t.Fatal(err)
	}
	previous, err := state.Replace(context.Background(), second)
	if err != nil || previous != first {
		t.Fatalf("Replace previous = %p, err = %v", previous, err)
	}
	if err := first.db.Ping(); err != nil {
		t.Fatalf("Replace closed old Store: %v", err)
	}
	if err := state.Restore(context.Background(), second, first); err != nil {
		t.Fatal(err)
	}
	if current, ready := state.Current(); !ready || current != first {
		t.Fatalf("restored current = %p, ready = %v", current, ready)
	}
	if err := second.Close(); err != nil {
		t.Fatal(err)
	}
	if err := state.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestConcurrentReadsAndCloseWaitForRows(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	store, err := OpenVersion(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatal(err)
	}

	var readers sync.WaitGroup
	for range 8 {
		readers.Add(1)
		go func() {
			defer readers.Done()
			var value int
			if err := scanOne(store, "SELECT 1", &value); err != nil || value != 1 {
				t.Errorf("read value=%d err=%v", value, err)
			}
		}()
	}
	readers.Wait()

	rows, err := store.QueryContext(context.Background(), "SELECT 1")
	if err != nil {
		t.Fatal(err)
	}
	closed := make(chan error, 1)
	go func() { closed <- store.Close() }()
	select {
	case err := <-closed:
		t.Fatalf("Close returned with active rows: %v", err)
	case <-time.After(20 * time.Millisecond):
	}
	if err := rows.Close(); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-closed:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("Close did not finish after rows closed")
	}
}
