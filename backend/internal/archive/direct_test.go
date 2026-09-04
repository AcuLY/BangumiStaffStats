package archive

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestOpenCurrentSkipsManifestAdmission(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, true)
	if err := os.WriteFile(
		runtimeManifestPath(root, dataVersion),
		[]byte("not a manifest"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}
	state := new(State)
	if err := state.OpenCurrent(context.Background(), root); err != nil {
		t.Fatalf("minimal open: %v", err)
	}
	store, ready := state.Current()
	if !ready || store.Identity().DataVersion != dataVersion {
		t.Fatalf("identity = %#v, ready = %v", store.Identity(), ready)
	}
	if store.Identity().ManifestDigest != "" || store.Identity().SQLiteDigest != "" {
		t.Fatalf("minimal identity contains digests: %#v", store.Identity())
	}
	if err := state.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestOpenCandidateRejectsSidecarAndIdentityMismatch(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	sidecar := runtimeSQLitePath(root, dataVersion) + "-wal"
	if err := os.WriteFile(sidecar, []byte("sidecar"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := OpenCandidate(context.Background(), root, dataVersion)
	requireCode(t, err, CodeArchiveImmutableLayoutInvalid)
	if err := os.Remove(sidecar); err != nil {
		t.Fatal(err)
	}
	otherVersion := "dv1-" + dataVersion[len("dv1-")+1:] + "0"
	if otherVersion == dataVersion {
		t.Fatal("test version did not change")
	}
	otherRoot := filepath.Join(root, versionsDirectory, otherVersion)
	if err := os.Rename(
		filepath.Join(root, versionsDirectory, dataVersion),
		otherRoot,
	); err != nil {
		t.Fatal(err)
	}
	_, err = OpenCandidate(context.Background(), root, otherVersion)
	requireCode(t, err, CodeSQLiteDataVersionMismatch)
}

func TestStateReplaceAndRestoreOwnership(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	first, err := OpenCandidate(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatal(err)
	}
	second, err := OpenCandidate(context.Background(), root, dataVersion)
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
