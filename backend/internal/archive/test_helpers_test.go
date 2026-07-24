package archive

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

type goldenIndex struct {
	Files []goldenIndexFile `json:"files"`
}

type goldenIndexFile struct {
	Path     string `json:"path"`
	CaseID   string `json:"caseId"`
	Expected Code   `json:"expected"`
}

func repositoryRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve test source")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", "..", ".."))
}

func archiveGoldenRoot(t *testing.T) string {
	t.Helper()
	return filepath.Join(repositoryRoot(t), "contracts", "goldens", "archive")
}

func archiveSchemaRoot(t *testing.T) string {
	t.Helper()
	return filepath.Join(repositoryRoot(t), "contracts", "schemas", "archive")
}

func readGoldenIndex(t *testing.T) goldenIndex {
	t.Helper()
	var index goldenIndex
	mustDecodeJSON(t, mustReadFile(t, filepath.Join(archiveGoldenRoot(t), "index.json")), &index)
	return index
}

func arrangeValidCandidate(t *testing.T, includeCurrent bool) (string, string) {
	t.Helper()
	return arrangeBundle(t, filepath.Join(archiveGoldenRoot(t), "valid", "minimal"), includeCurrent)
}

func arrangeBundle(t *testing.T, bundleRoot string, includeCurrent bool) (string, string) {
	t.Helper()
	pointerData := mustReadFile(t, filepath.Join(bundleRoot, "current-pointer.json"))
	var pointerValue pointer
	mustDecodeJSON(t, pointerData, &pointerValue)

	root := t.TempDir()
	versionRoot := filepath.Join(root, versionsDirectory, pointerValue.DataVersion)
	if err := os.MkdirAll(versionRoot, 0o755); err != nil {
		t.Fatalf("create version root: %v", err)
	}
	copyTestFile(t, filepath.Join(bundleRoot, "archive-manifest.json"), filepath.Join(versionRoot, manifestFilename))
	copyTestFile(t, filepath.Join(bundleRoot, sqliteFilename), filepath.Join(versionRoot, sqliteFilename))
	if includeCurrent {
		if err := os.WriteFile(filepath.Join(root, currentPointerFilename), pointerData, 0o644); err != nil {
			t.Fatalf("write current pointer: %v", err)
		}
	}
	return root, pointerValue.DataVersion
}

func runtimeManifestPath(root, dataVersion string) string {
	return filepath.Join(root, versionsDirectory, dataVersion, manifestFilename)
}

func runtimeSQLitePath(root, dataVersion string) string {
	return filepath.Join(root, versionsDirectory, dataVersion, sqliteFilename)
}

func copyTestFile(t *testing.T, source, destination string) {
	t.Helper()
	data := mustReadFile(t, source)
	if err := os.WriteFile(destination, data, 0o644); err != nil {
		t.Fatalf("copy test file: %v", err)
	}
}

func mustReadFile(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read test file: %v", err)
	}
	return data
}

func mustDecodeJSON(t *testing.T, data []byte, target any) {
	t.Helper()
	if err := json.Unmarshal(data, target); err != nil {
		t.Fatalf("decode test JSON: %v", err)
	}
}

func requireCode(t *testing.T, err error, expected Code) {
	t.Helper()
	if expected == CodeValid {
		if err != nil {
			t.Fatalf("error = %v, want success", err)
		}
		return
	}
	code, ok := ErrorCode(err)
	if !ok || code != expected {
		t.Fatalf("error = %v, code = %q, want %q", err, code, expected)
	}
}

func queryOne(t *testing.T, store *Store, query string, destinations ...any) {
	t.Helper()
	if err := scanOne(store, query, destinations...); err != nil {
		t.Fatal(err)
	}
}

func scanOne(store *Store, query string, destinations ...any) error {
	rows, err := store.QueryContext(context.Background(), query)
	if err != nil {
		return fmt.Errorf("query %q: %w", query, err)
	}
	defer rows.Close()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return fmt.Errorf("advance query %q: %w", query, err)
		}
		return fmt.Errorf("query %q returned no row", query)
	}
	if err := rows.Scan(destinations...); err != nil {
		return fmt.Errorf("scan query %q: %w", query, err)
	}
	if rows.Next() {
		return fmt.Errorf("query %q returned more than one row", query)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("finish query %q: %w", query, err)
	}
	return nil
}
