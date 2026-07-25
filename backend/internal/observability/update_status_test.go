package observability

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestUpdateStatusReaderAcceptsContractGoldens(t *testing.T) {
	for _, name := range []string{
		"first-failure.json",
		"canceled.json",
		"no-change.json",
		"published.json",
	} {
		t.Run(name, func(t *testing.T) {
			data := readUpdateStatusGolden(t, name)
			path := filepath.Join(t.TempDir(), "update-status.json")
			if err := os.WriteFile(path, data, 0o600); err != nil {
				t.Fatal(err)
			}
			reader, err := NewUpdateStatusReader(path)
			if err != nil {
				t.Fatal(err)
			}
			status, err := reader.Read()
			if err != nil {
				t.Fatal(err)
			}
			if status.LastAttempt.Time.IsZero() ||
				status.LastAttempt.DurationSeconds < 0 ||
				!validUpdateStatus(status.LastAttempt.Status) ||
				!validUpdatePhase(status.LastAttempt.Phase) {
				t.Fatalf("invalid projection: %#v", status)
			}
			if name == "first-failure.json" && status.LastSuccess != nil {
				t.Fatalf("unexpected success: %#v", status.LastSuccess)
			}
			if name != "first-failure.json" && status.LastSuccess == nil {
				t.Fatal("expected retained success")
			}
		})
	}
}

func TestUpdateStatusReaderRejectsContractInvalidMutations(t *testing.T) {
	data := readUpdateStatusGolden(t, "invalid.json")
	var fixture struct {
		Mutations []struct {
			ID       string          `json:"id"`
			Document json.RawMessage `json:"document"`
		} `json:"mutations"`
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	for _, mutation := range fixture.Mutations {
		t.Run(mutation.ID, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "update-status.json")
			if err := os.WriteFile(path, mutation.Document, 0o600); err != nil {
				t.Fatal(err)
			}
			reader, err := NewUpdateStatusReader(path)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := reader.Read(); !errors.Is(
				err,
				ErrUpdateStatusInvalid,
			) {
				t.Fatalf("read error = %v", err)
			}
		})
	}
}

func TestUpdateStatusReaderRejectsDuplicatesLinksBoundsAndMalformedState(
	t *testing.T,
) {
	valid := readUpdateStatusGolden(t, "published.json")
	duplicateRoot := bytes.Replace(
		valid,
		[]byte(`"last_success":`),
		[]byte(`"last_attempt":null,"last_success":`),
		1,
	)
	duplicateRecord := bytes.Replace(
		valid,
		[]byte(`"status": "published",`),
		[]byte(`"status":"failed","status": "published",`),
		1,
	)
	testCases := []struct {
		name string
		data []byte
	}{
		{name: "empty", data: nil},
		{name: "malformed", data: []byte(`{"last_attempt":`)},
		{name: "duplicate root", data: duplicateRoot},
		{name: "duplicate record", data: duplicateRecord},
		{
			name: "oversized",
			data: []byte(strings.Repeat(" ", maxUpdateStatusBytes+1)),
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "update-status.json")
			if err := os.WriteFile(path, testCase.data, 0o600); err != nil {
				t.Fatal(err)
			}
			reader, err := NewUpdateStatusReader(path)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := reader.Read(); !errors.Is(
				err,
				ErrUpdateStatusInvalid,
			) {
				t.Fatalf("read error = %v", err)
			}
		})
	}

	t.Run("missing", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "update-status.json")
		reader, err := NewUpdateStatusReader(path)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := reader.Read(); !errors.Is(err, ErrUpdateStatusInvalid) {
			t.Fatalf("read error = %v", err)
		}
	})

	t.Run("symlink", func(t *testing.T) {
		directory := t.TempDir()
		target := filepath.Join(directory, "target.json")
		path := filepath.Join(directory, "update-status.json")
		if err := os.WriteFile(target, valid, 0o600); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(target, path); err != nil {
			t.Fatal(err)
		}
		reader, err := NewUpdateStatusReader(path)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := reader.Read(); !errors.Is(err, ErrUpdateStatusInvalid) {
			t.Fatalf("read error = %v", err)
		}
	})
}

func TestUpdateStatusReaderSeesAtomicReplacementWithoutRetainingInvalidData(
	t *testing.T,
) {
	directory := t.TempDir()
	path := filepath.Join(directory, "update-status.json")
	if err := os.WriteFile(
		path,
		readUpdateStatusGolden(t, "first-failure.json"),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	reader, err := NewUpdateStatusReader(path)
	if err != nil {
		t.Fatal(err)
	}
	first, err := reader.Read()
	if err != nil || first.LastAttempt.Status != UpdateStatusFailed {
		t.Fatalf("first = %#v, %v", first, err)
	}
	replacement := filepath.Join(directory, "replacement")
	if err := os.WriteFile(
		replacement,
		readUpdateStatusGolden(t, "published.json"),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(replacement, path); err != nil {
		t.Fatal(err)
	}
	second, err := reader.Read()
	if err != nil || second.LastAttempt.Status != UpdateStatusPublished {
		t.Fatalf("second = %#v, %v", second, err)
	}
	if err := os.WriteFile(path, []byte(`{"secret":"do-not-retain"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := reader.Read(); !errors.Is(err, ErrUpdateStatusInvalid) {
		t.Fatalf("invalid replacement error = %v", err)
	}
}

func TestUpdateStatusReaderRequiresExplicitCanonicalAbsoluteFilename(
	t *testing.T,
) {
	validPath := filepath.Join(t.TempDir(), "update-status.json")
	if _, err := NewUpdateStatusReader(validPath); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{
		"",
		"update-status.json",
		filepath.Join(t.TempDir(), "other.json"),
		t.TempDir() + string(filepath.Separator) + ".." +
			string(filepath.Separator) + "update-status.json",
	} {
		if _, err := NewUpdateStatusReader(path); !errors.Is(
			err,
			ErrUpdateStatusPath,
		) {
			t.Fatalf("path %q error = %v", path, err)
		}
	}
}

func readUpdateStatusGolden(t *testing.T, name string) []byte {
	t.Helper()
	_, sourceFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate test source")
	}
	path := filepath.Join(
		filepath.Dir(sourceFile),
		"..",
		"..",
		"..",
		"contracts",
		"goldens",
		"update-status",
		"cases",
		name,
	)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
