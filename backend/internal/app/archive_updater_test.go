package app

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/archivebuild"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
)

func TestLiveBuiltArchiveActivatesWithoutRestart(t *testing.T) {
	root := os.Getenv("BGMSS_LIVE_ARCHIVE_ROOT")
	if root == "" {
		t.Skip("BGMSS_LIVE_ARCHIVE_ROOT is not set")
	}
	entries, err := os.ReadDir(filepath.Join(root, "versions"))
	if err != nil {
		t.Fatal(err)
	}
	version := ""
	for _, entry := range entries {
		if entry.IsDir() && archiveVersionName.MatchString(entry.Name()) {
			version = entry.Name()
		}
	}
	manifest, err := os.ReadFile(filepath.Join(root, "versions", version, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(manifest)
	updater := &embeddedArchiveUpdater{
		root: root,
		run: func(context.Context, archivebuild.RunConfig) (archivebuild.RunResult, error) {
			return archivebuild.RunResult{
				Status: archivebuild.StatusNoChange, DataVersion: version,
				ManifestDigest: fmt.Sprintf("sha256:%x", digest),
			}, nil
		},
	}
	state := new(archive.State)
	runtime, err := httpapi.NewRuntimeObservability(io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	result, err := updater.RunOnce(
		context.Background(),
		func(ctx context.Context, request ArchiveActivation) error {
			return activateCandidate(
				ctx, new(maintenanceGate), state, func() bool { return true }, runtime, request,
			)
		},
	)
	if err != nil || result.Status != observability.UpdateStatusActivated {
		t.Fatalf("result=%+v err=%v", result, err)
	}
	store, ready := state.Current()
	if !ready || store == nil || store.Identity().DataVersion != version {
		t.Fatalf("current=%v ready=%t", store, ready)
	}
	if current, err := readCurrentDataVersion(root); err != nil || current != version {
		t.Fatalf("pointer=%q err=%v", current, err)
	}
	if err := state.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestLiveBuiltArchiveOpensAndQueries(t *testing.T) {
	root := os.Getenv("BGMSS_LIVE_ARCHIVE_ROOT")
	if root == "" {
		t.Skip("BGMSS_LIVE_ARCHIVE_ROOT is not set")
	}
	entries, err := os.ReadDir(filepath.Join(root, "versions"))
	if err != nil {
		t.Fatal(err)
	}
	version := ""
	for _, entry := range entries {
		if entry.IsDir() && archiveVersionName.MatchString(entry.Name()) {
			if version != "" {
				t.Fatal("multiple published versions in integration root")
			}
			version = entry.Name()
		}
	}
	if version == "" {
		t.Fatal("published version is absent")
	}
	store, err := archive.OpenVersion(context.Background(), root, version)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	for _, query := range []string{
		"SELECT COUNT(*) FROM subject",
		"SELECT COUNT(*) FROM catalog_position",
	} {
		rows, err := store.QueryContext(context.Background(), query)
		if err != nil {
			t.Fatal(err)
		}
		if !rows.Next() {
			t.Fatal("count query returned no row")
		}
		var count int64
		if err := rows.Scan(&count); err != nil || count <= 0 {
			t.Fatalf("query %q count=%d err=%v", query, count, err)
		}
		if err := rows.Close(); err != nil {
			t.Fatal(err)
		}
		t.Logf("%s = %d", query, count)
	}
}

func TestEmbeddedUpdaterNoChangeDoesNotActivate(t *testing.T) {
	root := arrangeArchive(t)
	version, err := readCurrentDataVersion(root)
	if err != nil {
		t.Fatal(err)
	}
	updater := &embeddedArchiveUpdater{
		root: root,
		run: func(context.Context, archivebuild.RunConfig) (archivebuild.RunResult, error) {
			return archivebuild.RunResult{
				Status: archivebuild.StatusNoChange, DataVersion: version,
			}, nil
		},
	}
	activated := false
	result, err := updater.RunOnce(
		context.Background(),
		func(context.Context, ArchiveActivation) error {
			activated = true
			return nil
		},
	)
	if err != nil || activated || result.Status != observability.UpdateStatusNoChange {
		t.Fatalf("result = %+v, activated = %t, err = %v", result, activated, err)
	}
}

func TestPreparedPointerCommitAndRollback(t *testing.T) {
	root := t.TempDir()
	oldVersion := "dv1-" + strings.Repeat("1", 64)
	newVersion := "dv1-" + strings.Repeat("2", 64)
	old := []byte(`{"pointerSchemaVersion":1,"dataVersion":"` + oldVersion + `","manifestDigest":"sha256:` + strings.Repeat("3", 64) + `"}` + "\n")
	current := filepath.Join(root, "current.json")
	if err := os.WriteFile(current, old, 0o640); err != nil {
		t.Fatal(err)
	}
	pointer, err := prepareCurrentPointer(root, newVersion, "sha256:"+strings.Repeat("4", 64))
	if err != nil {
		t.Fatal(err)
	}
	defer pointer.Discard()
	if err := pointer.Commit(context.Background()); err != nil {
		t.Fatal(err)
	}
	if version, err := readCurrentDataVersion(root); err != nil || version != newVersion {
		t.Fatalf("current version = %q, err = %v", version, err)
	}
	data, err := os.ReadFile(current)
	if err != nil || !strings.Contains(string(data), newVersion) {
		t.Fatalf("new pointer = %q, err = %v", data, err)
	}
	if err := pointer.Rollback(context.Background()); err != nil {
		t.Fatal(err)
	}
	data, err = os.ReadFile(current)
	if err != nil || string(data) != string(old) {
		t.Fatalf("restored pointer = %q, err = %v", data, err)
	}
}

func TestCleanupArchiveVersionsKeepsOnlyCurrent(t *testing.T) {
	root := t.TempDir()
	versions := filepath.Join(root, "versions")
	if err := os.Mkdir(versions, 0o750); err != nil {
		t.Fatal(err)
	}
	keep := "dv1-" + strings.Repeat("a", 64)
	old := "dv1-" + strings.Repeat("b", 64)
	for _, version := range []string{keep, old} {
		if err := os.Mkdir(filepath.Join(versions, version), 0o750); err != nil {
			t.Fatal(err)
		}
	}
	if err := cleanupArchiveVersions(context.Background(), root, keep); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(versions, keep)); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(versions, old)); !os.IsNotExist(err) {
		t.Fatalf("old version still exists: %v", err)
	}
}

func TestCleanupArchiveVersionsRejectsUnknownEntryBeforeDeletion(t *testing.T) {
	root := t.TempDir()
	versions := filepath.Join(root, "versions")
	if err := os.Mkdir(versions, 0o750); err != nil {
		t.Fatal(err)
	}
	keep := "dv1-" + strings.Repeat("c", 64)
	old := "dv1-" + strings.Repeat("d", 64)
	for _, version := range []string{keep, old, "unsafe"} {
		if err := os.Mkdir(filepath.Join(versions, version), 0o750); err != nil {
			t.Fatal(err)
		}
	}
	if err := cleanupArchiveVersions(context.Background(), root, keep); err == nil {
		t.Fatal("unsafe inventory was accepted")
	}
	if _, err := os.Stat(filepath.Join(versions, old)); err != nil {
		t.Fatalf("old version was partially deleted: %v", err)
	}
}
