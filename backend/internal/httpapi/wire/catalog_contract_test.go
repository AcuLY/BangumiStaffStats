package wire

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestCatalogGeneratedWireDecodesAcceptedSuccessGolden(t *testing.T) {
	root := repositoryRoot(t)
	data, err := os.ReadFile(filepath.Join(
		root,
		"contracts/goldens/api/catalog/cases/success-empty.json",
	))
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		SchemaVersion int             `json:"schemaVersion"`
		Kind          string          `json:"kind"`
		CaseID        string          `json:"caseId"`
		Description   string          `json:"description"`
		Source        json.RawMessage `json:"source"`
		Expected      struct {
			Status  int             `json:"status"`
			Headers json.RawMessage `json:"headers"`
			Body    json.RawMessage `json:"body"`
		} `json:"expected"`
	}
	decodeCatalogJSON(t, data, &fixture)
	if fixture.SchemaVersion != 1 || fixture.Kind != "catalog-success" ||
		fixture.CaseID != "five-type-empty-staff-sets" ||
		fixture.Expected.Status != 200 {
		t.Fatalf("unexpected catalog golden wrapper: %#v", fixture)
	}
	var envelope CatalogSuccessEnvelopeV1
	decodeCatalogJSON(t, fixture.Expected.Body, &envelope)
	encoded, err := json.Marshal(envelope)
	if err != nil {
		t.Fatalf("marshal generated catalog envelope: %v", err)
	}
	if len(encoded) == 0 || !bytes.Contains(encoded, []byte(`"staff:anime:106"`)) {
		t.Fatal("generated catalog envelope lost accepted position data")
	}
}

func TestCatalogGeneratedWireIsCatalogOnlyAndCurrent(t *testing.T) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve generated wire")
	}
	generatedPath := filepath.Join(filepath.Dir(filename), "catalog.gen.go")
	data, err := os.ReadFile(generatedPath)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(data)
	if actual := hex.EncodeToString(sum[:]); actual != "a50ccd6a148158a90111de7abb7bced4df1db084b718ad495b8dfcdc5373c04d" {
		t.Fatalf("catalog generated wire digest = %s", actual)
	}
	for _, forbidden := range []string{
		"type ErrorCodeV1 ",
		"type ErrorEnvelopeV1 ",
		"type ErrorMetaV1 ",
		"type FieldErrorsV1 ",
	} {
		if strings.Contains(string(data), forbidden) {
			t.Fatalf("catalog wire redeclares shared query type %q", forbidden)
		}
	}
}

func decodeCatalogJSON(t *testing.T, data []byte, target any) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		t.Fatalf("decode catalog contract: %v", err)
	}
}

func repositoryRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve repository root")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", "..", "..", ".."))
}
