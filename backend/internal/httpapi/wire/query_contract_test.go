package wire

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

type queryCasesFile struct {
	Cases []struct {
		ID        string          `json:"id"`
		Submitted json.RawMessage `json:"submitted"`
	} `json:"cases"`
	NegativeCases []struct {
		ID           string          `json:"id"`
		Submitted    json.RawMessage `json:"submitted"`
		ExpectedCode string          `json:"expectedCode"`
		ExpectedPath string          `json:"expectedPath"`
	} `json:"negativeCases"`
}

type unknownFieldCasesFile struct {
	ExpectedCode     string          `json:"expectedCode"`
	InjectedProperty string          `json:"injectedProperty"`
	InjectedValue    json.RawMessage `json:"injectedValue"`
	Cases            []struct {
		ID       string `json:"id"`
		Target   string `json:"target"`
		BaseCase string `json:"baseCase"`
		Pointer  string `json:"pointer"`
	} `json:"cases"`
}

type textualCasesFile struct {
	Cases []struct {
		ID           string `json:"id"`
		Text         string `json:"text"`
		ExpectedCode string `json:"expectedCode"`
	} `json:"cases"`
}

func TestSelectedPositiveQueryCasesDecodeThroughGeneratedModels(t *testing.T) {
	root := queryGoldenRoot(t)
	var queryCases queryCasesFile
	decodeContractFile(t, filepath.Join(root, "cases", "queries.json"), &queryCases)

	for _, id := range []string{"personal-normalization", "global-series-staffset"} {
		t.Run(id, func(t *testing.T) {
			submitted := positiveQueryCase(t, queryCases, id)
			decoded, err := decodeSharedQuery(submitted)
			if err != nil {
				t.Fatalf("decode generated SharedQueryV1: %v", err)
			}
			encoded, err := json.Marshal(decoded)
			if err != nil {
				t.Fatalf("marshal generated SharedQueryV1: %v", err)
			}
			if len(encoded) == 0 {
				t.Fatal("generated SharedQueryV1 marshaled to empty bytes")
			}
		})
	}
}

func TestSelectedStructuralNegativeQueryCasesAreRejected(t *testing.T) {
	root := queryGoldenRoot(t)
	var queryCases queryCasesFile
	decodeContractFile(t, filepath.Join(root, "cases", "queries.json"), &queryCases)

	t.Run("unknown field", func(t *testing.T) {
		var cases unknownFieldCasesFile
		decodeContractFile(t, filepath.Join(root, "cases", "unknown-fields.json"), &cases)
		selected := findUnknownCase(t, cases, "unknown-query-root")
		if selected.Target != "query" || selected.Pointer != "" {
			t.Fatalf("unexpected selected case shape: target=%q pointer=%q", selected.Target, selected.Pointer)
		}
		if cases.ExpectedCode != "FIELD_INVALID" {
			t.Fatalf("contract expectedCode = %q, want FIELD_INVALID", cases.ExpectedCode)
		}

		var object map[string]json.RawMessage
		if err := decodeOne(selectedQueryBase(t, queryCases, selected.BaseCase), &object, false); err != nil {
			t.Fatalf("decode base query: %v", err)
		}
		object[cases.InjectedProperty] = cases.InjectedValue
		submitted, err := json.Marshal(object)
		if err != nil {
			t.Fatalf("marshal injected query: %v", err)
		}
		assertQueryRejected(t, submitted, cases.ExpectedCode)
	})

	for _, test := range []struct {
		name         string
		id           string
		expectedCode string
		expectedPath string
	}{
		{
			name:         "personal field forbidden in global query",
			id:           "global-personal-field",
			expectedCode: "FIELD_INVALID",
			expectedPath: "/uid",
		},
		{
			name:         "undeclared query version",
			id:           "undeclared-query-version",
			expectedCode: "FIELD_INVALID",
			expectedPath: "/schemaVersion",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			selected := negativeQueryCase(t, queryCases, test.id)
			if selected.ExpectedCode != test.expectedCode || selected.ExpectedPath != test.expectedPath {
				t.Fatalf(
					"contract identity = %s %s, want %s %s",
					selected.ExpectedCode,
					selected.ExpectedPath,
					test.expectedCode,
					test.expectedPath,
				)
			}
			assertQueryRejected(t, selected.Submitted, selected.ExpectedCode)
		})
	}

	t.Run("trailing data", func(t *testing.T) {
		var cases textualCasesFile
		decodeContractFile(t, filepath.Join(root, "cases", "textual-invalid.json"), &cases)
		for _, selected := range cases.Cases {
			if selected.ID != "textual-trailing-data" {
				continue
			}
			if selected.ExpectedCode != "INVALID_JSON" {
				t.Fatalf("contract expectedCode = %q, want INVALID_JSON", selected.ExpectedCode)
			}
			assertQueryRejected(t, []byte(selected.Text), selected.ExpectedCode)
			return
		}
		t.Fatal("textual-trailing-data case not found")
	})
}

func decodeSharedQuery(data []byte) (SharedQueryV1, error) {
	var discriminator struct {
		Scope string `json:"scope"`
	}
	if err := decodeOne(data, &discriminator, false); err != nil {
		return SharedQueryV1{}, err
	}

	var query SharedQueryV1
	switch discriminator.Scope {
	case "personal":
		var personal SharedQueryV10
		if err := decodeOne(data, &personal, true); err != nil {
			return SharedQueryV1{}, err
		}
		if err := query.FromSharedQueryV10(personal); err != nil {
			return SharedQueryV1{}, fmt.Errorf("wrap personal query: %w", err)
		}
	case "global":
		var global SharedQueryV11
		if err := decodeOne(data, &global, true); err != nil {
			return SharedQueryV1{}, err
		}
		if err := query.FromSharedQueryV11(global); err != nil {
			return SharedQueryV1{}, fmt.Errorf("wrap global query: %w", err)
		}
	default:
		return SharedQueryV1{}, fmt.Errorf("unsupported query scope %q", discriminator.Scope)
	}
	return query, nil
}

func decodeOne(data []byte, target any, rejectUnknown bool) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	if rejectUnknown {
		decoder.DisallowUnknownFields()
	}
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return fmt.Errorf("trailing JSON value")
		}
		return err
	}
	return nil
}

func assertQueryRejected(t *testing.T, submitted []byte, contractCode string) {
	t.Helper()
	if contractCode == "" {
		t.Fatal("selected contract case has no expected code")
	}
	if _, err := decodeSharedQuery(submitted); err == nil {
		t.Fatalf("query with contract outcome %s was accepted", contractCode)
	}
}

func queryGoldenRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve query contract test path")
	}
	repositoryRoot := filepath.Clean(filepath.Join(filepath.Dir(filename), "..", "..", "..", ".."))
	return filepath.Join(repositoryRoot, "contracts", "goldens", "query")
}

func decodeContractFile(t *testing.T, filename string, target any) {
	t.Helper()
	data, err := os.ReadFile(filename)
	if err != nil {
		t.Fatalf("read %s: %v", filename, err)
	}
	if err := decodeOne(data, target, false); err != nil {
		t.Fatalf("decode %s: %v", filename, err)
	}
}

func positiveQueryCase(t *testing.T, cases queryCasesFile, id string) json.RawMessage {
	t.Helper()
	for _, candidate := range cases.Cases {
		if candidate.ID == id {
			return candidate.Submitted
		}
	}
	t.Fatalf("positive query case not found: %s", id)
	return nil
}

func selectedQueryBase(t *testing.T, cases queryCasesFile, id string) json.RawMessage {
	t.Helper()
	return positiveQueryCase(t, cases, id)
}

func negativeQueryCase(t *testing.T, cases queryCasesFile, id string) struct {
	ID           string          `json:"id"`
	Submitted    json.RawMessage `json:"submitted"`
	ExpectedCode string          `json:"expectedCode"`
	ExpectedPath string          `json:"expectedPath"`
} {
	t.Helper()
	for _, candidate := range cases.NegativeCases {
		if candidate.ID == id {
			return candidate
		}
	}
	t.Fatalf("negative query case not found: %s", id)
	return struct {
		ID           string          `json:"id"`
		Submitted    json.RawMessage `json:"submitted"`
		ExpectedCode string          `json:"expectedCode"`
		ExpectedPath string          `json:"expectedPath"`
	}{}
}

func findUnknownCase(t *testing.T, cases unknownFieldCasesFile, id string) struct {
	ID       string `json:"id"`
	Target   string `json:"target"`
	BaseCase string `json:"baseCase"`
	Pointer  string `json:"pointer"`
} {
	t.Helper()
	for _, candidate := range cases.Cases {
		if candidate.ID == id {
			return candidate
		}
	}
	t.Fatalf("unknown-field query case not found: %s", id)
	return struct {
		ID       string `json:"id"`
		Target   string `json:"target"`
		BaseCase string `json:"baseCase"`
		Pointer  string `json:"pointer"`
	}{}
}
