package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestRunValidatesPointerFreeCandidateAndClosesIt(t *testing.T) {
	root, dataVersion, manifestDigest, sqliteDigest := arrangeSmokeCandidate(t)
	before := treeDigest(t, root)
	var output bytes.Buffer
	status := run(
		context.Background(),
		[]string{"-archive-root", root, "-data-version", dataVersion},
		&output,
	)
	if status != 0 {
		t.Fatalf("status = %d, output = %s", status, output.String())
	}
	var result map[string]any
	if err := json.Unmarshal(output.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result) != 4 ||
		result["ok"] != true ||
		result["dataVersion"] != dataVersion ||
		result["manifestDigest"] != manifestDigest ||
		result["sqliteDigest"] != sqliteDigest {
		t.Fatalf("result = %#v", result)
	}
	if _, err := os.Lstat(filepath.Join(root, "current.json")); !os.IsNotExist(err) {
		t.Fatalf("smoke created/read current pointer: %v", err)
	}
	if after := treeDigest(t, root); after != before {
		t.Fatalf("candidate tree changed: %s -> %s", before, after)
	}

	sqlitePath := filepath.Join(root, "versions", dataVersion, "bangumi.sqlite")
	renamed := sqlitePath + ".renamed"
	if err := os.Rename(sqlitePath, renamed); err != nil {
		t.Fatalf("store was not closed: %v", err)
	}
}

func TestRunFailuresAreSanitized(t *testing.T) {
	secret := filepath.Join(t.TempDir(), "root-with-secret-123")
	tests := [][]string{
		{},
		{"-unknown"},
		{"-archive-root", secret, "-data-version", "unsafe/../version"},
	}
	for _, arguments := range tests {
		var output bytes.Buffer
		if status := run(context.Background(), arguments, &output); status == 0 {
			t.Fatalf("arguments %v unexpectedly succeeded", arguments)
		}
		if strings.Contains(output.String(), secret) ||
			strings.Contains(output.String(), "unsafe/../version") {
			t.Fatalf("failure leaked input: %s", output.String())
		}
		var result map[string]any
		if err := json.Unmarshal(output.Bytes(), &result); err != nil {
			t.Fatalf("failure is not one JSON value: %v", err)
		}
		if len(result) != 2 || result["ok"] != false || result["code"] == "" {
			t.Fatalf("failure result = %#v", result)
		}
	}
}

func TestRunReturnsNonZeroWhenSuccessOutputCannotBeWritten(t *testing.T) {
	root, dataVersion, _, _ := arrangeSmokeCandidate(t)
	status := run(
		context.Background(),
		[]string{"-archive-root", root, "-data-version", dataVersion},
		rejectingWriter{},
	)
	if status == 0 {
		t.Fatal("writer failure was reported as a successful smoke")
	}

	sqlitePath := filepath.Join(root, "versions", dataVersion, "bangumi.sqlite")
	if err := os.Rename(sqlitePath, sqlitePath+".closed"); err != nil {
		t.Fatalf("store was not closed after output failure: %v", err)
	}
}

type rejectingWriter struct{}

func (rejectingWriter) Write([]byte) (int, error) {
	return 0, errors.New("deterministic output rejection")
}

func arrangeSmokeCandidate(t *testing.T) (string, string, string, string) {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve test source")
	}
	repositoryRoot := filepath.Clean(filepath.Join(filepath.Dir(filename), "..", "..", ".."))
	bundleRoot := filepath.Join(repositoryRoot, "contracts", "goldens", "archive", "valid", "minimal")
	manifestData := readSmokeFile(t, filepath.Join(bundleRoot, "archive-manifest.json"))
	var manifest struct {
		DataVersion  string `json:"dataVersion"`
		SQLiteDigest string `json:"sqliteDigest"`
	}
	if err := json.Unmarshal(manifestData, &manifest); err != nil {
		t.Fatal(err)
	}

	root := t.TempDir()
	versionRoot := filepath.Join(root, "versions", manifest.DataVersion)
	if err := os.MkdirAll(versionRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(versionRoot, "manifest.json"), manifestData, 0o644); err != nil {
		t.Fatal(err)
	}
	copySmokeFile(t, filepath.Join(bundleRoot, "bangumi.sqlite"), filepath.Join(versionRoot, "bangumi.sqlite"))
	return root, manifest.DataVersion, digest(manifestData), manifest.SQLiteDigest
}

func treeDigest(t *testing.T, root string) string {
	t.Helper()
	hasher := sha256.New()
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		hasher.Write([]byte(filepath.ToSlash(relative)))
		if !entry.IsDir() {
			hasher.Write(readSmokeFile(t, path))
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return hex.EncodeToString(hasher.Sum(nil))
}

func copySmokeFile(t *testing.T, source, destination string) {
	t.Helper()
	if err := os.WriteFile(destination, readSmokeFile(t, source), 0o644); err != nil {
		t.Fatal(err)
	}
}

func readSmokeFile(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func digest(data []byte) string {
	sum := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(sum[:])
}
