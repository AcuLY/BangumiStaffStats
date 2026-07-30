package contracttest

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

const (
	outcomeValid                = "VALID"
	outcomeManifestSchema       = "MANIFEST_SCHEMA_INVALID"
	outcomeManifestAccounting   = "MANIFEST_ACCOUNTING_INVALID"
	outcomeArchiveUnsupported   = "ARCHIVE_VERSION_UNSUPPORTED"
	sqliteHeader                = "SQLite format 3\x00"
	manifestFilename            = "archive-manifest.json"
	pointerFilename             = "current-pointer.json"
	sqliteFilename              = "bangumi.sqlite"
	manifestSchemaFilename      = "archive-manifest.schema.json"
	pointerSchemaFilename       = "current-pointer.schema.json"
	compatibilityFilename       = "compatibility-matrix.json"
	schemaSQLFilename           = "schema.sql"
	archiveGoldenIndexFilename  = "index.json"
	discardedSchemaSQLDigest    = "sha256:4a09c42d8f9c401fba24fe2c4b17a5f4a482825e1617cd40024757503e2bd249"
	discardedSchemaObjectDigest = "sha256:f7b6b3795b16d32fad3503e7976d5598ca3e92e6327f2875fb745fb8d095f35d"
	discardedDataVersion        = "dv1-9bcb52b9134d58713a5e3a54ca83c5fb77a595e52e06a56f755afe1f644e96eb"
	supersededBoundSQLDigest    = "sha256:fe3ff18c4601a6e7fae894db0a4c58e26a7ded6f2d8ad19716946db32789d7b8"
	supersededBoundObjectDigest = "sha256:4f035a17c18ac49708d48ae333ac2aecefcbbbb279508162f43b893e1be71a46"
	supersededBoundDataVersion  = "dv1-8577238451268b0a71275b73074e505b2d37a8be35a2db71ce16f81f3c5f2129"
)

type archiveIndex struct {
	IndexSchemaVersion int                `json:"indexSchemaVersion"`
	Files              []archiveIndexFile `json:"files"`
}

type archiveIndexFile struct {
	Path            string `json:"path"`
	Digest          string `json:"digest"`
	CaseID          string `json:"caseId"`
	ValidationStage string `json:"validationStage"`
	Expected        string `json:"expected"`
}

type schemaShape struct {
	Required   []string                   `json:"required"`
	Properties map[string]json.RawMessage `json:"properties"`
}

type sourceFile struct {
	RecordsTotal int64 `json:"recordsTotal"`
	Imported     int64 `json:"imported"`
	Duplicate    int64 `json:"duplicate"`
	Invalid      int64 `json:"invalid"`
	Unresolved   int64 `json:"unresolved"`
}

type manifestIdentity struct {
	ManifestSchemaVersion int          `json:"manifestSchemaVersion"`
	SQLiteSchemaVersion   int          `json:"sqliteSchemaVersion"`
	DataVersionAlgorithm  string       `json:"dataVersionAlgorithm"`
	DataVersion           string       `json:"dataVersion"`
	SchemaSQLDigest       string       `json:"schemaSqlDigest"`
	DomainRulesVersion    string       `json:"domainRulesVersion"`
	CastRulesVersion      string       `json:"castRulesVersion"`
	SourceFiles           []sourceFile `json:"sourceFiles"`
	SQLiteFile            string       `json:"sqliteFile"`
	SQLiteSize            int64        `json:"sqliteSize"`
	SQLiteDigest          string       `json:"sqliteDigest"`
}

type pointerIdentity struct {
	PointerSchemaVersion int    `json:"pointerSchemaVersion"`
	DataVersion          string `json:"dataVersion"`
	ManifestDigest       string `json:"manifestDigest"`
}

type compatibilityMatrix struct {
	MatrixSchemaVersion  int                  `json:"matrixSchemaVersion"`
	Supported            []compatibilityTuple `json:"supported"`
	CanonicalSchema      canonicalSchema      `json:"canonicalSchema"`
	RequiredTables       []string             `json:"requiredTables"`
	RequiredIndexes      []string             `json:"requiredIndexes"`
	ValidationPrecedence []struct {
		Order  int      `json:"order"`
		Stage  string   `json:"stage"`
		Errors []string `json:"errors"`
	} `json:"validationPrecedence"`
	Sentinels []struct {
		ID              string `json:"id"`
		SQL             string `json:"sql"`
		ExpectedInteger int64  `json:"expectedInteger"`
	} `json:"sentinels"`
}

type canonicalSchema struct {
	SchemaSQLDigest string `json:"schemaSqlDigest"`
	Algorithm       string `json:"algorithm"`
	Digest          string `json:"digest"`
	ObjectCount     int    `json:"objectCount"`
}

type compatibilityTuple struct {
	PointerSchemaVersion  int    `json:"pointerSchemaVersion"`
	ManifestSchemaVersion int    `json:"manifestSchemaVersion"`
	SQLiteSchemaVersion   int    `json:"sqliteSchemaVersion"`
	SQLiteApplicationID   uint32 `json:"sqliteApplicationId"`
	DataVersionAlgorithm  string `json:"dataVersionAlgorithm"`
	DomainRulesVersion    string `json:"domainRulesVersion"`
	CastRulesVersion      string `json:"castRulesVersion"`
}

type archiveAuthority struct {
	repositoryRoot string
	goldenRoot     string
	schemaRoot     string
	index          archiveIndex
	manifestSchema schemaShape
	pointerSchema  schemaShape
	matrix         compatibilityMatrix
}

func TestIndexedArchiveFilesMatchTheirDigests(t *testing.T) {
	authority := loadAuthority(t)
	seen := make(map[string]struct{}, len(authority.index.Files))
	for _, entry := range authority.index.Files {
		if _, duplicate := seen[entry.Path]; duplicate {
			t.Errorf("duplicate index path: %s", entry.Path)
			continue
		}
		seen[entry.Path] = struct{}{}

		path, err := safeJoin(authority.goldenRoot, entry.Path)
		if err != nil {
			t.Errorf("unsafe index path %q: %v", entry.Path, err)
			continue
		}
		info, err := os.Stat(path)
		if err != nil {
			t.Errorf("stat indexed file %q: %v", entry.Path, err)
			continue
		}
		if !info.Mode().IsRegular() {
			t.Errorf("indexed path is not a regular file: %s", entry.Path)
			continue
		}
		data, err := os.ReadFile(path)
		if err != nil {
			t.Errorf("read indexed file %q: %v", entry.Path, err)
			continue
		}
		if got := digest(data); got != entry.Digest {
			t.Errorf("digest %s = %s, want %s", entry.Path, got, entry.Digest)
		}
	}
}

func TestCorrectedRawDomainAuthority(t *testing.T) {
	authority := loadAuthority(t)
	if len(authority.index.Files) != 32 {
		t.Fatalf("indexed canonical paths = %d, want 32", len(authority.index.Files))
	}
	if len(authority.matrix.Supported) != 1 {
		t.Fatalf("supported compatibility tuples = %d, want 1", len(authority.matrix.Supported))
	}
	if tuple := authority.matrix.Supported[0]; tuple.DomainRulesVersion != "domain-raw-v1" ||
		tuple.CastRulesVersion != "cast-exact-v1" {
		t.Fatalf("supported rule pair = %s/%s", tuple.DomainRulesVersion, tuple.CastRulesVersion)
	}

	schemaSQL := readFile(t, filepath.Join(authority.schemaRoot, schemaSQLFilename))
	for _, fragment := range []string{
		"relation_type INTEGER NOT NULL CHECK (",
		"relation_type > 0",
		"relation_type <= 9007199254740991",
		"role_type INTEGER NOT NULL CHECK (role_type BETWEEN 1 AND 6)",
		"length(set_key) BETWEEN 15 AND 96",
	} {
		if !bytes.Contains(schemaSQL, []byte(fragment)) {
			t.Fatalf("schema.sql is missing raw-domain constraint %q", fragment)
		}
	}
	for _, fragment := range []string{
		"relation_type TEXT",
		"role_type TEXT",
		"role_type IN ('main', 'support', 'guest')",
		"length(set_key) BETWEEN 17 AND 96",
	} {
		if bytes.Contains(schemaSQL, []byte(fragment)) {
			t.Fatalf("schema.sql retains discarded text-domain fragment %q", fragment)
		}
	}
	if got := digest(schemaSQL); got != authority.matrix.CanonicalSchema.SchemaSQLDigest {
		t.Fatalf("canonical schema digest = %s, want %s", got, authority.matrix.CanonicalSchema.SchemaSQLDigest)
	}
	if authority.matrix.CanonicalSchema.SchemaSQLDigest == discardedSchemaSQLDigest ||
		authority.matrix.CanonicalSchema.Digest == discardedSchemaObjectDigest {
		t.Fatalf("compatibility matrix retains a discarded schema identity: %+v", authority.matrix.CanonicalSchema)
	}

	sentinels := make(map[string]int64, len(authority.matrix.Sentinels))
	for _, sentinel := range authority.matrix.Sentinels {
		sentinels[sentinel.ID] = sentinel.ExpectedInteger
	}
	for id, expected := range map[string]int64{
		"main-cast-is-raw-role-1":                 1,
		"all-cast-includes-raw-roles-1-through-6": 6,
		"locked-raw-relation-domain":              52,
		"relation-code-2-source-direction":        1,
		"relation-code-3-source-direction":        1,
		"raw-domain-text-values-absent":           0,
		"normalized-subject-type-book":            1,
		"normalized-subject-type-anime":           1,
		"normalized-subject-type-music":           1,
		"normalized-subject-type-game":            1,
		"normalized-subject-type-real":            1,
	} {
		if got, ok := sentinels[id]; !ok || got != expected {
			t.Fatalf("raw-domain sentinel %s = %d, present %t, want %d", id, got, ok, expected)
		}
	}

	for _, path := range []string{
		filepath.Join(authority.schemaRoot, compatibilityFilename),
		filepath.Join(authority.goldenRoot, archiveGoldenIndexFilename),
		filepath.Join(authority.goldenRoot, "valid", "minimal", manifestFilename),
		filepath.Join(authority.goldenRoot, "valid", "minimal", pointerFilename),
	} {
		data := readFile(t, path)
		for _, discarded := range []string{
			discardedSchemaSQLDigest,
			discardedSchemaObjectDigest,
			discardedDataVersion,
			supersededBoundSQLDigest,
			supersededBoundObjectDigest,
			supersededBoundDataVersion,
		} {
			if bytes.Contains(data, []byte(discarded)) {
				t.Fatalf("%s retains discarded draft identity %s", path, discarded)
			}
		}
	}
}

func TestMinimalArchiveEvidence(t *testing.T) {
	authority := loadAuthority(t)
	bundleRoot := filepath.Join(authority.goldenRoot, "valid", "minimal")
	for _, indexedPath := range []string{
		"valid/minimal/archive-manifest.json",
		"valid/minimal/current-pointer.json",
		"valid/minimal/bangumi.sqlite",
	} {
		if got := indexedOutcome(t, authority.index, indexedPath); got != outcomeValid {
			t.Fatalf("indexed outcome %s = %s, want %s", indexedPath, got, outcomeValid)
		}
	}
	manifestData := readFile(t, filepath.Join(bundleRoot, manifestFilename))
	pointerData := readFile(t, filepath.Join(bundleRoot, pointerFilename))

	outcome, manifest, pointer := validateDocuments(authority, manifestData, pointerData)
	if outcome != outcomeValid {
		t.Fatalf("minimal documents outcome = %s, want %s", outcome, outcomeValid)
	}

	schemaSQL := readFile(t, filepath.Join(authority.schemaRoot, schemaSQLFilename))
	if got := digest(schemaSQL); got != manifest.SchemaSQLDigest {
		t.Fatalf("schema.sql digest = %s, want %s", got, manifest.SchemaSQLDigest)
	}
	if got := digest(manifestData); got != pointer.ManifestDigest {
		t.Fatalf("manifest digest = %s, want pointer %s", got, pointer.ManifestDigest)
	}
	if manifest.DataVersion != pointer.DataVersion {
		t.Fatalf("dataVersion mismatch: manifest %s, pointer %s", manifest.DataVersion, pointer.DataVersion)
	}

	sqliteData := readFile(t, filepath.Join(bundleRoot, sqliteFilename))
	if int64(len(sqliteData)) != manifest.SQLiteSize {
		t.Fatalf("SQLite size = %d, want %d", len(sqliteData), manifest.SQLiteSize)
	}
	if got := digest(sqliteData); got != manifest.SQLiteDigest {
		t.Fatalf("SQLite digest = %s, want %s", got, manifest.SQLiteDigest)
	}
	if len(sqliteData) < 72 || string(sqliteData[:16]) != sqliteHeader {
		t.Fatalf("SQLite header is invalid")
	}

	tuple, ok := supportedTuple(authority.matrix, manifest, pointer)
	if !ok {
		t.Fatal("minimal compatibility tuple is not supported")
	}
	if got := binary.BigEndian.Uint32(sqliteData[68:72]); got != tuple.SQLiteApplicationID {
		t.Fatalf("SQLite application_id = %d, want %d", got, tuple.SQLiteApplicationID)
	}
}

func TestSelectedArchiveNegativeOutcomes(t *testing.T) {
	authority := loadAuthority(t)
	tests := []struct {
		name        string
		manifest    string
		pointer     string
		indexedPath string
	}{
		{
			name:        "unknown manifest field",
			manifest:    "invalid/json/manifest-unknown-field.json",
			indexedPath: "invalid/json/manifest-unknown-field.json",
		},
		{
			name:        "source accounting mismatch",
			manifest:    "invalid/json/manifest-source-accounting-mismatch.json",
			indexedPath: "invalid/json/manifest-source-accounting-mismatch.json",
		},
		{
			name:        "unsafe SQLite filename",
			manifest:    "invalid/json/manifest-unsafe-sqlite-file.json",
			indexedPath: "invalid/json/manifest-unsafe-sqlite-file.json",
		},
		{
			name:        "unsupported SQLite schema",
			manifest:    "invalid/bundles/sqlite-unsupported-schema/archive-manifest.json",
			pointer:     "invalid/bundles/sqlite-unsupported-schema/current-pointer.json",
			indexedPath: "invalid/bundles/sqlite-unsupported-schema/archive-manifest.json",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			manifestData := readFile(t, filepath.Join(authority.goldenRoot, filepath.FromSlash(test.manifest)))
			var pointerData []byte
			if test.pointer != "" {
				pointerData = readFile(t, filepath.Join(authority.goldenRoot, filepath.FromSlash(test.pointer)))
			}
			outcome, _, _ := validateDocuments(authority, manifestData, pointerData)
			want := indexedOutcome(t, authority.index, test.indexedPath)
			if outcome != want {
				t.Fatalf("outcome = %s, want indexed %s", outcome, want)
			}
		})
	}
}

func loadAuthority(t *testing.T) archiveAuthority {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve archive contract test path")
	}
	repositoryRoot := filepath.Clean(filepath.Join(filepath.Dir(filename), "..", "..", "..", ".."))
	authority := archiveAuthority{
		repositoryRoot: repositoryRoot,
		goldenRoot:     filepath.Join(repositoryRoot, "contracts", "goldens", "archive"),
		schemaRoot:     filepath.Join(repositoryRoot, "contracts", "schemas", "archive"),
	}
	decodeStrict(t, readFile(t, filepath.Join(authority.goldenRoot, archiveGoldenIndexFilename)), &authority.index)
	if authority.index.IndexSchemaVersion != 1 || len(authority.index.Files) == 0 {
		t.Fatalf("unsupported or empty archive index")
	}
	decodeOne(t, readFile(t, filepath.Join(authority.schemaRoot, manifestSchemaFilename)), &authority.manifestSchema)
	decodeOne(t, readFile(t, filepath.Join(authority.schemaRoot, pointerSchemaFilename)), &authority.pointerSchema)
	decodeStrict(t, readFile(t, filepath.Join(authority.schemaRoot, compatibilityFilename)), &authority.matrix)
	if authority.matrix.MatrixSchemaVersion != 1 || len(authority.matrix.Supported) == 0 {
		t.Fatalf("unsupported or empty compatibility matrix")
	}
	return authority
}

func validateDocuments(authority archiveAuthority, manifestData, pointerData []byte) (string, manifestIdentity, pointerIdentity) {
	var manifestObject map[string]json.RawMessage
	if err := decodeOneError(manifestData, &manifestObject); err != nil {
		return outcomeManifestSchema, manifestIdentity{}, pointerIdentity{}
	}
	if !matchesRootShape(manifestObject, authority.manifestSchema) {
		return outcomeManifestSchema, manifestIdentity{}, pointerIdentity{}
	}

	sqliteFileConst, ok := schemaStringConstraint(authority.manifestSchema, "sqliteFile", "const")
	if !ok {
		return outcomeManifestSchema, manifestIdentity{}, pointerIdentity{}
	}
	var manifest manifestIdentity
	if err := decodeOneError(manifestData, &manifest); err != nil || manifest.SQLiteFile != sqliteFileConst {
		return outcomeManifestSchema, manifestIdentity{}, pointerIdentity{}
	}
	for _, source := range manifest.SourceFiles {
		if source.RecordsTotal != source.Imported+source.Duplicate+source.Invalid+source.Unresolved {
			return outcomeManifestAccounting, manifest, pointerIdentity{}
		}
	}

	var pointer pointerIdentity
	if len(pointerData) != 0 {
		var pointerObject map[string]json.RawMessage
		if err := decodeOneError(pointerData, &pointerObject); err != nil || !matchesRootShape(pointerObject, authority.pointerSchema) {
			return "POINTER_SCHEMA_INVALID", manifest, pointerIdentity{}
		}
		if err := decodeOneError(pointerData, &pointer); err != nil {
			return "POINTER_SCHEMA_INVALID", manifest, pointerIdentity{}
		}
	}

	if !tupleSupported(authority.matrix, manifest, pointer) {
		return outcomeArchiveUnsupported, manifest, pointer
	}
	return outcomeValid, manifest, pointer
}

func matchesRootShape(object map[string]json.RawMessage, schema schemaShape) bool {
	for _, required := range schema.Required {
		if _, ok := object[required]; !ok {
			return false
		}
	}
	for property := range object {
		if _, ok := schema.Properties[property]; !ok {
			return false
		}
	}
	return true
}

func schemaStringConstraint(schema schemaShape, property, constraint string) (string, bool) {
	raw, ok := schema.Properties[property]
	if !ok {
		return "", false
	}
	var shape map[string]json.RawMessage
	if err := json.Unmarshal(raw, &shape); err != nil {
		return "", false
	}
	value, ok := shape[constraint]
	if !ok {
		return "", false
	}
	var text string
	if err := json.Unmarshal(value, &text); err != nil {
		return "", false
	}
	return text, true
}

func tupleSupported(matrix compatibilityMatrix, manifest manifestIdentity, pointer pointerIdentity) bool {
	_, ok := supportedTuple(matrix, manifest, pointer)
	return ok
}

func supportedTuple(matrix compatibilityMatrix, manifest manifestIdentity, pointer pointerIdentity) (compatibilityTuple, bool) {
	if manifest.SchemaSQLDigest != matrix.CanonicalSchema.SchemaSQLDigest {
		return compatibilityTuple{}, false
	}
	for _, candidate := range matrix.Supported {
		pointerVersionMatches := pointer.PointerSchemaVersion == 0 || candidate.PointerSchemaVersion == pointer.PointerSchemaVersion
		if pointerVersionMatches &&
			candidate.ManifestSchemaVersion == manifest.ManifestSchemaVersion &&
			candidate.SQLiteSchemaVersion == manifest.SQLiteSchemaVersion &&
			candidate.DataVersionAlgorithm == manifest.DataVersionAlgorithm &&
			candidate.DomainRulesVersion == manifest.DomainRulesVersion &&
			candidate.CastRulesVersion == manifest.CastRulesVersion {
			return candidate, true
		}
	}
	return compatibilityTuple{}, false
}

func indexedOutcome(t *testing.T, index archiveIndex, path string) string {
	t.Helper()
	for _, entry := range index.Files {
		if entry.Path == path {
			return entry.Expected
		}
	}
	t.Fatalf("path is not indexed: %s", path)
	return ""
}

func safeJoin(root, slashPath string) (string, error) {
	if slashPath == "" || strings.Contains(slashPath, "\\") || filepath.IsAbs(slashPath) {
		return "", fmt.Errorf("not a canonical relative path")
	}
	clean := filepath.Clean(filepath.FromSlash(slashPath))
	if filepath.ToSlash(clean) != slashPath || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path escapes root")
	}
	joined := filepath.Join(root, clean)
	relative, err := filepath.Rel(root, joined)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path escapes root")
	}
	return joined, nil
}

func digest(data []byte) string {
	sum := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func readFile(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return data
}

func decodeStrict(t *testing.T, data []byte, target any) {
	t.Helper()
	if err := decodeStrictError(data, target); err != nil {
		t.Fatalf("decode strict JSON: %v", err)
	}
}

func decodeOne(t *testing.T, data []byte, target any) {
	t.Helper()
	if err := decodeOneError(data, target); err != nil {
		t.Fatalf("decode JSON: %v", err)
	}
}

func decodeStrictError(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	return requireJSONEOF(decoder)
}

func decodeOneError(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := decoder.Decode(target); err != nil {
		return err
	}
	return requireJSONEOF(decoder)
}

func requireJSONEOF(decoder *json.Decoder) error {
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return fmt.Errorf("trailing JSON value")
		}
		return err
	}
	return nil
}
