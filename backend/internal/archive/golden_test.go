package archive

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestIndexedGoldenGroups(t *testing.T) {
	index := readGoldenIndex(t)
	type goldenCase struct {
		expected Code
		paths    []string
	}
	cases := make(map[string]*goldenCase)
	for _, entry := range index.Files {
		current := cases[entry.CaseID]
		if current == nil {
			current = &goldenCase{expected: entry.Expected}
			cases[entry.CaseID] = current
		}
		if current.expected != entry.Expected {
			t.Fatalf("case %s has conflicting outcomes", entry.CaseID)
		}
		current.paths = append(current.paths, entry.Path)
	}

	for caseID, golden := range cases {
		t.Run(caseID, func(t *testing.T) {
			switch caseID {
			case "data-version-vector":
				testDataVersionVector(t)
				return
			case "manifest-string-semantics-vector":
				testManifestStringSemanticsVector(t)
				return
			case "minimal-valid":
				root, _ := arrangeValidCandidate(t, true)
				state := new(State)
				err := state.LoadCurrent(context.Background(), root)
				requireCode(t, err, golden.expected)
				if !state.Ready() {
					t.Fatal("valid current did not publish readiness")
				}
				if err := state.Close(); err != nil {
					t.Fatalf("close state: %v", err)
				}
				return
			}

			root, dataVersion := arrangeGoldenCase(t, caseID, golden.paths)
			state := new(State)
			err := state.LoadCurrent(context.Background(), root)
			requireCode(t, err, golden.expected)
			if state.Ready() {
				t.Fatal("invalid golden published readiness")
			}
			if err := state.Close(); err != nil {
				t.Fatalf("close failed state: %v", err)
			}
			_ = dataVersion
		})
	}
}

func arrangeGoldenCase(t *testing.T, caseID string, paths []string) (string, string) {
	t.Helper()
	for _, indexedPath := range paths {
		if strings.HasPrefix(indexedPath, "invalid/bundles/") {
			return arrangeBundle(
				t,
				filepath.Join(archiveGoldenRoot(t), "invalid", "bundles", caseID),
				true,
			)
		}
	}

	root, dataVersion := arrangeValidCandidate(t, true)
	if strings.HasPrefix(caseID, "pointer-") {
		copyTestFile(
			t,
			filepath.Join(archiveGoldenRoot(t), "invalid", "json", caseID+".json"),
			filepath.Join(root, currentPointerFilename),
		)
		return root, dataVersion
	}
	copyTestFile(
		t,
		filepath.Join(archiveGoldenRoot(t), "invalid", "json", caseID+".json"),
		runtimeManifestPath(root, dataVersion),
	)
	return root, dataVersion
}

func testDataVersionVector(t *testing.T) {
	t.Helper()
	var vector struct {
		Algorithm           string `json:"algorithm"`
		ExpectedDataVersion string `json:"expectedDataVersion"`
		Input               struct {
			ArchiveRelease        string `json:"archiveRelease"`
			ArchiveDigest         string `json:"archiveDigest"`
			CommonCommit          string `json:"commonCommit"`
			CommonDigest          string `json:"commonDigest"`
			ManifestSchemaVersion int64  `json:"manifestSchemaVersion"`
			SQLiteSchemaVersion   int64  `json:"sqliteSchemaVersion"`
			SchemaSQLDigest       string `json:"schemaSqlDigest"`
			DomainRulesVersion    string `json:"domainRulesVersion"`
			CastRulesVersion      string `json:"castRulesVersion"`
			CatalogConfigDigest   string `json:"catalogConfigDigest"`
		} `json:"input"`
	}
	mustDecodeJSON(
		t,
		mustReadFile(t, filepath.Join(archiveGoldenRoot(t), "vectors", "data-version.json")),
		&vector,
	)
	if vector.Algorithm != dataVersionAlgorithm {
		t.Fatalf("vector algorithm = %q", vector.Algorithm)
	}
	value := manifest{
		ArchiveRelease:        vector.Input.ArchiveRelease,
		ArchiveDigest:         vector.Input.ArchiveDigest,
		CommonCommit:          vector.Input.CommonCommit,
		CommonDigest:          vector.Input.CommonDigest,
		ManifestSchemaVersion: vector.Input.ManifestSchemaVersion,
		SQLiteSchemaVersion:   vector.Input.SQLiteSchemaVersion,
		SchemaSQLDigest:       vector.Input.SchemaSQLDigest,
		DomainRulesVersion:    vector.Input.DomainRulesVersion,
		CastRulesVersion:      vector.Input.CastRulesVersion,
		CatalogConfigDigest:   vector.Input.CatalogConfigDigest,
	}
	if got := recomputeDataVersion(value); got != vector.ExpectedDataVersion {
		t.Fatalf("dataVersion = %q, want %q", got, vector.ExpectedDataVersion)
	}
}

func testManifestStringSemanticsVector(t *testing.T) {
	t.Helper()
	var vector struct {
		VectorSchemaVersion int               `json:"vectorSchemaVersion"`
		Formats             map[string]string `json:"formats"`
		StringCases         []struct {
			CaseID                string `json:"caseId"`
			Field                 string `json:"field"`
			JSONString            string `json:"jsonStringLiteral"`
			ExpectedScalarLength  *int   `json:"expectedScalarLength"`
			ExpectedUTF8ByteCount *int   `json:"expectedUtf8ByteLength"`
			Expected              Code   `json:"expected"`
		} `json:"stringCases"`
		RawByteRecipe struct {
			CaseID                     string `json:"caseId"`
			Field                      string `json:"field"`
			PayloadHex                 string `json:"payloadHex"`
			RetainJSONstringDelimiters bool   `json:"retainJsonStringDelimiters"`
			Expected                   Code   `json:"expected"`
		} `json:"rawByteRecipe"`
	}
	mustDecodeJSON(
		t,
		mustReadFile(t, filepath.Join(archiveGoldenRoot(t), "vectors", "manifest-string-semantics.json")),
		&vector,
	)
	if vector.VectorSchemaVersion != 1 ||
		len(vector.Formats) != 2 ||
		vector.Formats["generatedAt"] != "bgmss-utc-generated-at-v1" ||
		vector.Formats["url"] != "bgmss-unicode-scalar-url-v1" ||
		len(vector.StringCases) != 25 {
		t.Fatalf("manifest string vector shape drift: version=%d formats=%v cases=%d",
			vector.VectorSchemaVersion, vector.Formats, len(vector.StringCases))
	}

	seen := make(map[string]struct{}, len(vector.StringCases))
	for _, test := range vector.StringCases {
		t.Run(test.CaseID, func(t *testing.T) {
			if test.CaseID == "" {
				t.Fatal("manifest string vector has an empty caseId")
			}
			if _, duplicate := seen[test.CaseID]; duplicate {
				t.Fatalf("duplicate manifest string caseId %q", test.CaseID)
			}
			seen[test.CaseID] = struct{}{}
			if test.Expected != CodeValid && test.Expected != CodeManifestSchemaInvalid {
				t.Fatalf("unexpected vector outcome %q", test.Expected)
			}
			if test.Field != "generatedAt" &&
				test.Field != "archiveAssetUrl" &&
				test.Field != "commonSubjectStaffsUrl" {
				t.Fatalf("unexpected manifest string field %q", test.Field)
			}

			var scalarLength *int
			var utf8ByteCount *int
			literal := []byte(test.JSONString)
			if !utf8.Valid(literal) {
				t.Fatal("indexed JSON string literal is not valid UTF-8")
			}
			if hasNoIsolatedJSONSurrogates(literal) {
				var decoded string
				if err := decodeStrictJSON(literal, &decoded); err != nil {
					t.Fatalf("decode indexed JSON string literal: %v", err)
				}
				count := utf8.RuneCountInString(decoded)
				byteCount := len([]byte(decoded))
				scalarLength = &count
				utf8ByteCount = &byteCount
			}
			if !sameOptionalInteger(scalarLength, test.ExpectedScalarLength) ||
				!sameOptionalInteger(utf8ByteCount, test.ExpectedUTF8ByteCount) {
				t.Fatalf(
					"indexed string lengths = scalars %v bytes %v, want scalars %v bytes %v",
					scalarLength,
					utf8ByteCount,
					test.ExpectedScalarLength,
					test.ExpectedUTF8ByteCount,
				)
			}

			root, dataVersion := arrangeValidCandidate(t, false)
			manifestPath := runtimeManifestPath(root, dataVersion)
			mutated := replaceJSONStringField(
				t,
				mustReadFile(t, manifestPath),
				test.Field,
				[]byte(test.JSONString),
			)
			if err := os.WriteFile(manifestPath, mutated, 0o644); err != nil {
				t.Fatal(err)
			}

			store, err := LoadCandidate(context.Background(), root, dataVersion)
			requireCode(t, err, test.Expected)
			if store != nil {
				if test.Expected != CodeValid {
					store.Close()
					t.Fatal("invalid manifest string case returned a store")
				}
				if err := store.Close(); err != nil {
					t.Fatal(err)
				}
			}
		})
	}

	recipe := vector.RawByteRecipe
	if recipe.CaseID != "manifest-invalid-raw-utf8" ||
		recipe.Field != "archiveAssetUrl" ||
		recipe.PayloadHex != "C3 28" ||
		!recipe.RetainJSONstringDelimiters ||
		recipe.Expected != CodeManifestSchemaInvalid {
		t.Fatalf("raw-byte recipe drift: %+v", recipe)
	}
	payload, err := hex.DecodeString(strings.ReplaceAll(recipe.PayloadHex, " ", ""))
	if err != nil {
		t.Fatal(err)
	}
	rawLiteral := append([]byte{'"'}, payload...)
	rawLiteral = append(rawLiteral, '"')
	root, dataVersion := arrangeValidCandidate(t, false)
	manifestPath := runtimeManifestPath(root, dataVersion)
	mutated := replaceJSONStringField(t, mustReadFile(t, manifestPath), recipe.Field, rawLiteral)
	if utf8.Valid(mutated) {
		t.Fatal("exact C3 28 manifest recipe remained valid UTF-8")
	}
	if err := os.WriteFile(manifestPath, mutated, 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := LoadCandidate(context.Background(), root, dataVersion)
	if store != nil {
		store.Close()
		t.Fatal("malformed UTF-8 manifest returned a store")
	}
	requireCode(t, err, recipe.Expected)
}

func TestCandidateLoaderIsPointerFree(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	pointerPath := filepath.Join(root, currentPointerFilename)
	if _, err := os.Lstat(pointerPath); !os.IsNotExist(err) {
		t.Fatalf("unexpected current pointer before load: %v", err)
	}

	store, err := LoadCandidate(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatalf("load candidate: %v", err)
	}
	defer store.Close()
	if store.Identity().DataVersion != dataVersion {
		t.Fatalf("identity = %+v", store.Identity())
	}
	if _, err := os.Lstat(pointerPath); !os.IsNotExist(err) {
		t.Fatalf("candidate loader created or read current pointer: %v", err)
	}
	stats := store.db.Stats()
	if stats.MaxOpenConnections != 4 || stats.OpenConnections != 4 || stats.Idle != 4 {
		t.Fatalf("pool stats = %+v, want bounded idle 4/4", stats)
	}
}

func TestMinimalGoldenSentinelsUseMatrixValues(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	store, err := LoadCandidate(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatalf("load candidate: %v", err)
	}
	defer store.Close()

	var matrix struct {
		Sentinels []struct {
			ID              string `json:"id"`
			SQL             string `json:"sql"`
			ExpectedInteger int64  `json:"expectedInteger"`
		} `json:"sentinels"`
	}
	mustDecodeJSON(
		t,
		mustReadFile(t, filepath.Join(archiveSchemaRoot(t), "compatibility-matrix.json")),
		&matrix,
	)
	for _, sentinel := range matrix.Sentinels {
		var got int64
		queryOne(t, store, sentinel.SQL, &got)
		if got != sentinel.ExpectedInteger {
			t.Fatalf("sentinel %s = %d, want %d", sentinel.ID, got, sentinel.ExpectedInteger)
		}
	}
}

func TestCompiledContractConstantsMatchAuthority(t *testing.T) {
	var matrix struct {
		Supported []struct {
			PointerSchemaVersion  int64  `json:"pointerSchemaVersion"`
			ManifestSchemaVersion int64  `json:"manifestSchemaVersion"`
			SQLiteSchemaVersion   int64  `json:"sqliteSchemaVersion"`
			SQLiteApplicationID   int64  `json:"sqliteApplicationId"`
			DataVersionAlgorithm  string `json:"dataVersionAlgorithm"`
		} `json:"supported"`
		CanonicalSchema struct {
			SchemaSQLDigest string `json:"schemaSqlDigest"`
			Algorithm       string `json:"algorithm"`
			Digest          string `json:"digest"`
			ObjectCount     int    `json:"objectCount"`
		} `json:"canonicalSchema"`
		RequiredTables  []string `json:"requiredTables"`
		RequiredIndexes []string `json:"requiredIndexes"`
	}
	mustDecodeJSON(
		t,
		mustReadFile(t, filepath.Join(archiveSchemaRoot(t), "compatibility-matrix.json")),
		&matrix,
	)
	if len(matrix.Supported) != 1 {
		t.Fatalf("supported tuples = %d", len(matrix.Supported))
	}
	tuple := matrix.Supported[0]
	if tuple.PointerSchemaVersion != pointerSchemaVersion ||
		tuple.ManifestSchemaVersion != manifestSchemaVersion ||
		tuple.SQLiteSchemaVersion != sqliteSchemaVersion ||
		tuple.SQLiteApplicationID != sqliteApplicationID ||
		tuple.DataVersionAlgorithm != dataVersionAlgorithm {
		t.Fatalf("compiled tuple drift: %+v", tuple)
	}
	if strings.Join(matrix.RequiredTables, "\x00") != strings.Join(requiredTableNames, "\x00") {
		t.Fatal("required table constants drift")
	}
	if strings.Join(matrix.RequiredIndexes, "\x00") != strings.Join(requiredIndexNames, "\x00") {
		t.Fatal("required index constants drift")
	}
	if matrix.CanonicalSchema.SchemaSQLDigest != schemaSQLDigest ||
		matrix.CanonicalSchema.Algorithm != schemaObjectAlgorithm ||
		matrix.CanonicalSchema.Digest != schemaObjectDigest ||
		matrix.CanonicalSchema.ObjectCount != schemaObjectCount {
		t.Fatalf("compiled canonical schema seal drift: %+v", matrix.CanonicalSchema)
	}
	if got := digestBytes(mustReadFile(t, filepath.Join(archiveSchemaRoot(t), "schema.sql"))); got != schemaSQLDigest {
		t.Fatalf("schema digest = %q, want %q", got, schemaSQLDigest)
	}
}

func TestPointerRejectsMalformedUTF8BeforeJSONDecode(t *testing.T) {
	root, _ := arrangeValidCandidate(t, true)
	pointerPath := filepath.Join(root, currentPointerFilename)
	rawDigest := append([]byte(`"sha256:`), 0xC3, 0x28)
	rawDigest = append(rawDigest, []byte(strings.Repeat("0", 62)+`"`)...)
	mutated := replaceJSONStringField(
		t,
		mustReadFile(t, pointerPath),
		"manifestDigest",
		rawDigest,
	)
	if utf8.Valid(mutated) {
		t.Fatal("pointer invalid-byte mutation remained valid UTF-8")
	}
	if err := os.WriteFile(pointerPath, mutated, 0o644); err != nil {
		t.Fatal(err)
	}
	state := new(State)
	requireCode(t, state.LoadCurrent(context.Background(), root), CodePointerSchemaInvalid)
	if state.Ready() {
		t.Fatal("malformed UTF-8 pointer published readiness")
	}
}

func TestManifestRejectsMalformedUTF8BeforeCompatibilityAndIdentity(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, true)
	manifestPath := runtimeManifestPath(root, dataVersion)
	rawURL := append([]byte(`"https://valid.example/`), 0xC3, 0x28)
	rawURL = append(rawURL, []byte(`/archive.zip"`)...)
	mutated := replaceJSONStringField(
		t,
		mustReadFile(t, manifestPath),
		"archiveAssetUrl",
		rawURL,
	)
	if utf8.Valid(mutated) {
		t.Fatal("manifest invalid-byte mutation remained valid UTF-8")
	}
	if err := os.WriteFile(manifestPath, mutated, 0o644); err != nil {
		t.Fatal(err)
	}

	pointerPath := filepath.Join(root, currentPointerFilename)
	var pointerValue pointer
	mustDecodeJSON(t, mustReadFile(t, pointerPath), &pointerValue)
	pointerValue.ManifestDigest = digestBytes(mutated)
	pointerBytes, err := json.MarshalIndent(pointerValue, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(pointerPath, append(pointerBytes, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}

	state := new(State)
	requireCode(t, state.LoadCurrent(context.Background(), root), CodeManifestSchemaInvalid)
	if state.Ready() {
		t.Fatal("malformed UTF-8 manifest published readiness")
	}
}

func TestStrictDecodersRejectTrailingJSON(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, true)
	pointerPath := filepath.Join(root, currentPointerFilename)
	if err := os.WriteFile(pointerPath, append(mustReadFile(t, pointerPath), []byte(`{}`)...), 0o644); err != nil {
		t.Fatal(err)
	}
	state := new(State)
	requireCode(t, state.LoadCurrent(context.Background(), root), CodePointerSchemaInvalid)

	root, dataVersion = arrangeValidCandidate(t, false)
	manifestPath := runtimeManifestPath(root, dataVersion)
	data := append(mustReadFile(t, manifestPath), []byte(`{}`)...)
	if err := os.WriteFile(manifestPath, data, 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := LoadCandidate(context.Background(), root, dataVersion)
	requireCode(t, err, CodeManifestSchemaInvalid)
}

func TestManifestRejectsNullForEveryRequiredFieldBeforeTypedDecode(t *testing.T) {
	baseline := make(map[string]any)
	mustDecodeJSON(
		t,
		mustReadFile(t, filepath.Join(archiveGoldenRoot(t), "valid", "minimal", "archive-manifest.json")),
		&baseline,
	)
	topLevelFields := sortedAnyMapKeys(baseline)
	if len(topLevelFields) != 25 {
		t.Fatalf("required top-level manifest fields = %d, want 25", len(topLevelFields))
	}
	for _, field := range topLevelFields {
		t.Run("top-level/"+field, func(t *testing.T) {
			assertManifestNullRejected(t, func(document map[string]any) {
				document[field] = nil
			})
		})
	}

	sources := baseline["sourceFiles"].([]any)
	sourceFields := sortedAnyMapKeys(sources[0].(map[string]any))
	if len(sourceFields) != 8 {
		t.Fatalf("required source fields = %d, want 8", len(sourceFields))
	}
	for _, field := range sourceFields {
		t.Run("source-file/"+field, func(t *testing.T) {
			assertManifestNullRejected(t, func(document map[string]any) {
				document["sourceFiles"].([]any)[0].(map[string]any)[field] = nil
			})
		})
	}

	for _, objectName := range []string{"tableCounts", "qualitySummary"} {
		for _, field := range sortedAnyMapKeys(baseline[objectName].(map[string]any)) {
			t.Run(objectName+"/"+field, func(t *testing.T) {
				assertManifestNullRejected(t, func(document map[string]any) {
					document[objectName].(map[string]any)[field] = nil
				})
			})
		}
	}
}

func assertManifestNullRejected(t *testing.T, mutate func(map[string]any)) {
	t.Helper()
	root, dataVersion := arrangeValidCandidate(t, false)
	manifestPath := runtimeManifestPath(root, dataVersion)
	var document map[string]any
	mustDecodeJSON(t, mustReadFile(t, manifestPath), &document)
	mutate(document)
	mutated, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manifestPath, append(mutated, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}

	store, err := LoadCandidate(context.Background(), root, dataVersion)
	if store != nil {
		store.Close()
		t.Fatal("manifest containing null returned a store")
	}
	requireCode(t, err, CodeManifestSchemaInvalid)
}

func TestEveryContractIntegerPathAcceptsZeroFractionSpelling(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, true)
	manifestPath := runtimeManifestPath(root, dataVersion)
	originalBytes := mustReadFile(t, manifestPath)
	original, err := decodeManifest(originalBytes)
	if err != nil {
		t.Fatalf("decode baseline manifest: %v", err)
	}

	mutatedBytes, rewrittenPaths := rewriteEveryJSONNumber(t, originalBytes, func(number json.Number) json.Number {
		return json.Number(number.String() + ".0")
	})
	expectedPaths := expectedManifestIntegerPaths()
	sort.Strings(rewrittenPaths)
	sort.Strings(expectedPaths)
	if !reflect.DeepEqual(rewrittenPaths, expectedPaths) {
		t.Fatalf("rewritten integer paths = %v, want %v", rewrittenPaths, expectedPaths)
	}
	if len(rewrittenPaths) != maxContractJSONNumbers {
		t.Fatalf("rewritten integer count = %d, want %d", len(rewrittenPaths), maxContractJSONNumbers)
	}

	decoded, err := decodeManifest(mutatedBytes)
	if err != nil {
		t.Fatalf("decode zero-fraction manifest: %v", err)
	}
	if !reflect.DeepEqual(decoded, original) {
		t.Fatalf("zero-fraction manifest changed semantic value:\n got: %+v\nwant: %+v", decoded, original)
	}
	if got := recomputeDataVersion(decoded); got != dataVersion {
		t.Fatalf("zero-fraction dataVersion = %q, want %q", got, dataVersion)
	}
	if err := os.WriteFile(manifestPath, mutatedBytes, 0o644); err != nil {
		t.Fatal(err)
	}

	candidate, err := LoadCandidate(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatalf("load all-zero-fraction candidate: %v", err)
	}
	candidateIdentity := candidate.Identity()
	if candidateIdentity.DataVersion != dataVersion ||
		candidateIdentity.ManifestDigest != digestBytes(mutatedBytes) ||
		candidateIdentity.SQLiteDigest != original.SQLiteDigest {
		candidate.Close()
		t.Fatalf("candidate identity = %+v", candidateIdentity)
	}
	if err := candidate.Close(); err != nil {
		t.Fatal(err)
	}

	pointerPath := filepath.Join(root, currentPointerFilename)
	pointerBytes := replaceJSONNumberField(
		t,
		mustReadFile(t, pointerPath),
		"pointerSchemaVersion",
		"1.0",
	)
	manifestDigestLiteral, err := json.Marshal(digestBytes(mutatedBytes))
	if err != nil {
		t.Fatal(err)
	}
	pointerBytes = replaceJSONStringField(
		t,
		pointerBytes,
		"manifestDigest",
		manifestDigestLiteral,
	)
	pointerValue, err := decodePointer(pointerBytes)
	if err != nil {
		t.Fatalf("decode zero-fraction pointer: %v", err)
	}
	if pointerValue.PointerSchemaVersion != pointerSchemaVersion ||
		pointerValue.DataVersion != dataVersion ||
		pointerValue.ManifestDigest != digestBytes(mutatedBytes) {
		t.Fatalf("zero-fraction pointer = %+v", pointerValue)
	}
	if err := os.WriteFile(pointerPath, pointerBytes, 0o644); err != nil {
		t.Fatal(err)
	}

	state := new(State)
	if err := state.LoadCurrent(context.Background(), root); err != nil {
		t.Fatalf("load zero-fraction current: %v", err)
	}
	current, ready := state.Current()
	if !ready || current.Identity() != candidateIdentity {
		state.Close()
		t.Fatalf("current identity = %+v ready=%v, want %+v", current.Identity(), ready, candidateIdentity)
	}
	if err := state.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestPointerJSONSchemaIntegerSpellings(t *testing.T) {
	tests := []struct {
		name           string
		literal        string
		decodedVersion int64
		decodeCode     Code
		loadCode       Code
	}{
		{name: "zero fraction", literal: "1.0", decodedVersion: 1, decodeCode: CodeValid, loadCode: CodeValid},
		{name: "zero exponent", literal: "1e0", decodedVersion: 1, decodeCode: CodeValid, loadCode: CodeValid},
		{name: "positive zero exponent", literal: "1e+0", decodedVersion: 1, decodeCode: CodeValid, loadCode: CodeValid},
		{name: "decimal canceled by exponent", literal: "10e-1", decodedVersion: 1, decodeCode: CodeValid, loadCode: CodeValid},
		{name: "safe maximum decimal", literal: "9007199254740991.0", decodedVersion: maxJSONInteger, decodeCode: CodeValid, loadCode: CodeArchiveVersionUnsupported},
		{name: "safe maximum exponent", literal: "9007199254740991e0", decodedVersion: maxJSONInteger, decodeCode: CodeValid, loadCode: CodeArchiveVersionUnsupported},
		{name: "safe maximum scientific", literal: "9.007199254740991e15", decodedVersion: maxJSONInteger, decodeCode: CodeValid, loadCode: CodeArchiveVersionUnsupported},
		{name: "negative zero below minimum", literal: "-0", decodeCode: CodePointerSchemaInvalid, loadCode: CodePointerSchemaInvalid},
		{name: "fraction", literal: "1.5", decodeCode: CodePointerSchemaInvalid, loadCode: CodePointerSchemaInvalid},
		{name: "fractional exponent", literal: "10e-2", decodeCode: CodePointerSchemaInvalid, loadCode: CodePointerSchemaInvalid},
		{name: "safe maximum plus one", literal: "9007199254740992", decodeCode: CodePointerSchemaInvalid, loadCode: CodePointerSchemaInvalid},
		{name: "safe maximum plus one decimal", literal: "9007199254740992.0", decodeCode: CodePointerSchemaInvalid, loadCode: CodePointerSchemaInvalid},
		{name: "safe maximum plus one exponent", literal: "9007199254740992e0", decodeCode: CodePointerSchemaInvalid, loadCode: CodePointerSchemaInvalid},
		{name: "safe maximum plus one scientific", literal: "9.007199254740992e15", decodeCode: CodePointerSchemaInvalid, loadCode: CodePointerSchemaInvalid},
		{name: "huge positive exponent", literal: "1e999999999999999999999999999999999999", decodeCode: CodePointerSchemaInvalid, loadCode: CodePointerSchemaInvalid},
		{name: "huge negative exponent", literal: "1e-999999999999999999999999999999999999", decodeCode: CodePointerSchemaInvalid, loadCode: CodePointerSchemaInvalid},
		{name: "adversarial zero exponent", literal: "0e999999999999999999999999999999999999", decodeCode: CodePointerSchemaInvalid, loadCode: CodePointerSchemaInvalid},
		{name: "null", literal: "null", decodeCode: CodePointerSchemaInvalid, loadCode: CodePointerSchemaInvalid},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			root, _ := arrangeValidCandidate(t, true)
			pointerPath := filepath.Join(root, currentPointerFilename)
			mutated := replaceJSONNumberField(
				t,
				mustReadFile(t, pointerPath),
				"pointerSchemaVersion",
				test.literal,
			)
			value, err := decodePointer(mutated)
			requireCode(t, err, test.decodeCode)
			if test.decodeCode == CodeValid && value.PointerSchemaVersion != test.decodedVersion {
				t.Fatalf("decoded pointer version = %d, want %d", value.PointerSchemaVersion, test.decodedVersion)
			}
			if err := os.WriteFile(pointerPath, mutated, 0o644); err != nil {
				t.Fatal(err)
			}
			state := new(State)
			requireCode(t, state.LoadCurrent(context.Background(), root), test.loadCode)
			if test.loadCode == CodeValid && !state.Ready() {
				t.Fatal("schema-valid pointer did not publish readiness")
			}
			if test.loadCode != CodeValid && state.Ready() {
				t.Fatal("rejected pointer published readiness")
			}
			if err := state.Close(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestManifestJSONSchemaIntegerSpellings(t *testing.T) {
	tests := []struct {
		name          string
		field         string
		literal       string
		expectedValue int64
		expected      Code
	}{
		{name: "manifest version exponent", field: "manifestSchemaVersion", literal: "1e0", expectedValue: 1, expected: CodeValid},
		{name: "SQLite version canceled exponent", field: "sqliteSchemaVersion", literal: "10e-1", expectedValue: 1, expected: CodeValid},
		{name: "zero fraction", field: "archiveSize", literal: "1.0", expectedValue: 1, expected: CodeValid},
		{name: "positive zero exponent", field: "archiveSize", literal: "1e+0", expectedValue: 1, expected: CodeValid},
		{name: "negative zero", field: "archiveSize", literal: "-0", expectedValue: 0, expected: CodeValid},
		{name: "zero with exponent beyond nonzero bound", field: "archiveSize", literal: "0e22", expectedValue: 0, expected: CodeValid},
		{name: "safe maximum decimal", field: "archiveSize", literal: "9007199254740991.0", expectedValue: maxJSONInteger, expected: CodeValid},
		{name: "safe maximum exponent", field: "archiveSize", literal: "9007199254740991e0", expectedValue: maxJSONInteger, expected: CodeValid},
		{name: "safe maximum scientific", field: "archiveSize", literal: "9.007199254740991e15", expectedValue: maxJSONInteger, expected: CodeValid},
		{name: "fraction", field: "archiveSize", literal: "1.5", expected: CodeManifestSchemaInvalid},
		{name: "fractional exponent", field: "archiveSize", literal: "10e-2", expected: CodeManifestSchemaInvalid},
		{name: "hidden fraction", field: "archiveSize", literal: "1.0000000000000001", expected: CodeManifestSchemaInvalid},
		{name: "safe maximum plus one", field: "archiveSize", literal: "9007199254740992", expected: CodeManifestSchemaInvalid},
		{name: "safe maximum plus one decimal", field: "archiveSize", literal: "9007199254740992.0", expected: CodeManifestSchemaInvalid},
		{name: "safe maximum plus one exponent", field: "archiveSize", literal: "9007199254740992e0", expected: CodeManifestSchemaInvalid},
		{name: "safe maximum plus one scientific", field: "archiveSize", literal: "9.007199254740992e15", expected: CodeManifestSchemaInvalid},
		{name: "unsafe positive exponent", field: "archiveSize", literal: "1e16", expected: CodeManifestSchemaInvalid},
		{name: "huge positive exponent", field: "archiveSize", literal: "1e999999999999999999999999999999999999", expected: CodeManifestSchemaInvalid},
		{name: "huge negative exponent", field: "archiveSize", literal: "1e-999999999999999999999999999999999999", expected: CodeManifestSchemaInvalid},
		{name: "huge positive exponent on zero", field: "archiveSize", literal: "0e999999999999999999999999999999999999", expectedValue: 0, expected: CodeValid},
		{name: "huge negative exponent on negative zero", field: "archiveSize", literal: "-0.000e-999999999999999999999999999999999999", expectedValue: 0, expected: CodeValid},
		{name: "negative unsafe magnitude", field: "archiveSize", literal: "-9007199254740992", expected: CodeManifestSchemaInvalid},
		{name: "leading zero grammar", field: "archiveSize", literal: "01", expected: CodeManifestSchemaInvalid},
		{name: "missing fraction digits", field: "archiveSize", literal: "1.", expected: CodeManifestSchemaInvalid},
		{name: "missing exponent digits", field: "archiveSize", literal: "1e", expected: CodeManifestSchemaInvalid},
		{name: "null", field: "archiveSize", literal: "null", expected: CodeManifestSchemaInvalid},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			root, dataVersion := arrangeValidCandidate(t, false)
			manifestPath := runtimeManifestPath(root, dataVersion)
			mutated := replaceJSONNumberField(
				t,
				mustReadFile(t, manifestPath),
				test.field,
				test.literal,
			)
			value, err := decodeManifest(mutated)
			requireCode(t, err, test.expected)
			if test.expected == CodeValid {
				if got := manifestIntegerField(value, test.field); got != test.expectedValue {
					t.Fatalf("decoded %s = %d, want %d", test.field, got, test.expectedValue)
				}
				if got := recomputeDataVersion(value); got != dataVersion {
					t.Fatalf("dataVersion = %q, want %q", got, dataVersion)
				}
			}
			if err := os.WriteFile(manifestPath, mutated, 0o644); err != nil {
				t.Fatal(err)
			}
			store, err := LoadCandidate(context.Background(), root, dataVersion)
			requireCode(t, err, test.expected)
			if test.expected == CodeValid {
				if store == nil {
					t.Fatal("schema-valid manifest returned no store")
				}
				if store.Identity().DataVersion != dataVersion {
					store.Close()
					t.Fatalf("candidate identity = %+v", store.Identity())
				}
				if err := store.Close(); err != nil {
					t.Fatal(err)
				}
			} else if store != nil {
				store.Close()
				t.Fatal("schema-invalid manifest returned a store")
			}
		})
	}
}

func TestExactIntegerCanonicalizerSkipsJSONStringsAndEscapes(t *testing.T) {
	input := []byte(`{"text":"1.5 \"2e3\" \\ 4.0","values":[1.0,10e-1,-0,9007199254740991e0,0e999999999999999999999999999999999999,-0.000e-999999999999999999999999999999999999]}`)
	expected := []byte(`{"text":"1.5 \"2e3\" \\ 4.0","values":[1,1,0,9007199254740991,0,0]}`)
	canonical, err := canonicalizeJSONIntegers(input)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(canonical, expected) {
		t.Fatalf("canonical JSON = %s, want %s", canonical, expected)
	}
	var decoded any
	if err := json.Unmarshal(canonical, &decoded); err != nil {
		t.Fatalf("canonical JSON is invalid: %v", err)
	}
}

func TestExactIntegerDecoderEnforcesCompleteJSONNumberGrammar(t *testing.T) {
	valid := []struct {
		literal string
		value   int64
	}{
		{literal: "0", value: 0},
		{literal: "-0", value: 0},
		{literal: "0.0", value: 0},
		{literal: "1", value: 1},
		{literal: "1.0", value: 1},
		{literal: "1E+0", value: 1},
		{literal: "10e-1", value: 1},
		{literal: "100.00e-2", value: 1},
		{literal: "0e22", value: 0},
		{literal: "0e999999999999999999999999999999999999", value: 0},
		{literal: "-0.000e-999999999999999999999999999999999999", value: 0},
	}
	for _, test := range valid {
		t.Run("valid/"+test.literal, func(t *testing.T) {
			var document struct {
				Value int64 `json:"value"`
			}
			if err := decodeExactIntegerJSON(
				[]byte(`{"value":`+test.literal+`}`),
				&document,
			); err != nil {
				t.Fatalf("decode %q: %v", test.literal, err)
			}
			if document.Value != test.value {
				t.Fatalf("decoded %q = %d, want %d", test.literal, document.Value, test.value)
			}
		})
	}

	invalid := []string{
		"+1",
		"00",
		"01",
		"-01",
		".0",
		"-.0",
		"1.",
		"1e",
		"1e+",
		"1e-",
		"--1",
		"1e1.0",
		"NaN",
		"Infinity",
		"0.1",
	}
	for _, literal := range invalid {
		t.Run("invalid/"+literal, func(t *testing.T) {
			var document struct {
				Value int64 `json:"value"`
			}
			if err := decodeExactIntegerJSON(
				[]byte(`{"value":`+literal+`}`),
				&document,
			); err == nil {
				t.Fatalf("invalid JSON number %q decoded as %d", literal, document.Value)
			}
		})
	}
}

func sortedAnyMapKeys(object map[string]any) []string {
	keys := make([]string, 0, len(object))
	for key := range object {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func rewriteEveryJSONNumber(
	t *testing.T,
	data []byte,
	rewrite func(json.Number) json.Number,
) ([]byte, []string) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var document any
	if err := decoder.Decode(&document); err != nil {
		t.Fatalf("decode JSON with exact numbers: %v", err)
	}
	paths := make([]string, 0, maxContractJSONNumbers)
	document = rewriteJSONNumberTree(document, "", rewrite, &paths)
	encoded, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		t.Fatalf("encode rewritten JSON numbers: %v", err)
	}
	return append(encoded, '\n'), paths
}

func rewriteJSONNumberTree(
	value any,
	path string,
	rewrite func(json.Number) json.Number,
	paths *[]string,
) any {
	switch current := value.(type) {
	case json.Number:
		*paths = append(*paths, path)
		return rewrite(current)
	case map[string]any:
		for key, child := range current {
			childPath := key
			if path != "" {
				childPath = path + "." + key
			}
			current[key] = rewriteJSONNumberTree(child, childPath, rewrite, paths)
		}
	case []any:
		for index, child := range current {
			childPath := fmt.Sprintf("%s[%d]", path, index)
			current[index] = rewriteJSONNumberTree(child, childPath, rewrite, paths)
		}
	}
	return value
}

func expectedManifestIntegerPaths() []string {
	paths := []string{
		"manifestSchemaVersion",
		"sqliteSchemaVersion",
		"archiveSize",
		"commonSize",
		"sqliteSize",
	}
	sourceIntegerFields := []string{
		"size",
		"recordsTotal",
		"imported",
		"duplicate",
		"invalid",
		"unresolved",
	}
	for index := range requiredSourceNames {
		for _, field := range sourceIntegerFields {
			paths = append(paths, fmt.Sprintf("sourceFiles[%d].%s", index, field))
		}
	}
	for _, field := range requiredTableNames {
		paths = append(paths, "tableCounts."+field)
	}
	for _, field := range requiredQualityNames {
		paths = append(paths, "qualitySummary."+field)
	}
	return paths
}

func manifestIntegerField(value manifest, field string) int64 {
	switch field {
	case "manifestSchemaVersion":
		return value.ManifestSchemaVersion
	case "sqliteSchemaVersion":
		return value.SQLiteSchemaVersion
	case "archiveSize":
		return value.ArchiveSize
	case "commonSize":
		return value.CommonSize
	case "sqliteSize":
		return value.SQLiteSize
	default:
		panic("unknown manifest integer field: " + field)
	}
}

func replaceJSONNumberField(t *testing.T, document []byte, field, literal string) []byte {
	t.Helper()
	marker := []byte(`"` + field + `"`)
	markerIndex := bytes.Index(document, marker)
	if markerIndex < 0 || bytes.Index(document[markerIndex+len(marker):], marker) >= 0 {
		t.Fatalf("JSON number field %q is missing or repeated", field)
	}
	index := markerIndex + len(marker)
	for index < len(document) && (document[index] == ' ' || document[index] == '\t') {
		index++
	}
	if index >= len(document) || document[index] != ':' {
		t.Fatalf("JSON number field %q has no colon", field)
	}
	index++
	for index < len(document) && (document[index] == ' ' || document[index] == '\t') {
		index++
	}
	start := index
	for index < len(document) &&
		(isASCIIDigit(document[index]) ||
			document[index] == '-' ||
			document[index] == '+' ||
			document[index] == '.' ||
			document[index] == 'e' ||
			document[index] == 'E') {
		index++
	}
	if start == index {
		t.Fatalf("JSON number field %q has no numeric token", field)
	}
	result := make([]byte, 0, len(document)-(index-start)+len(literal))
	result = append(result, document[:start]...)
	result = append(result, literal...)
	result = append(result, document[index:]...)
	return result
}

func TestIndexedManifestDocumentsDecodeAsSingleJSONValues(t *testing.T) {
	for _, entry := range readGoldenIndex(t).Files {
		if !strings.HasSuffix(entry.Path, ".json") {
			continue
		}
		data := mustReadFile(t, filepath.Join(archiveGoldenRoot(t), filepath.FromSlash(entry.Path)))
		var value any
		if err := json.Unmarshal(data, &value); err != nil {
			t.Fatalf("%s: %v", entry.Path, err)
		}
	}
}

func replaceJSONStringField(t *testing.T, document []byte, field string, literal []byte) []byte {
	t.Helper()
	if len(literal) < 2 || literal[0] != '"' || literal[len(literal)-1] != '"' {
		t.Fatalf("replacement for %s is not a JSON string literal", field)
	}
	marker := []byte(`"` + field + `"`)
	markerIndex := bytes.Index(document, marker)
	if markerIndex < 0 || bytes.Index(document[markerIndex+len(marker):], marker) >= 0 {
		t.Fatalf("manifest field %q is missing or repeated", field)
	}
	index := markerIndex + len(marker)
	for index < len(document) && (document[index] == ' ' || document[index] == '\t') {
		index++
	}
	if index >= len(document) || document[index] != ':' {
		t.Fatalf("manifest field %q has no colon", field)
	}
	index++
	for index < len(document) && (document[index] == ' ' || document[index] == '\t') {
		index++
	}
	if index >= len(document) || document[index] != '"' {
		t.Fatalf("manifest field %q is not a JSON string", field)
	}
	start := index
	escaped := false
	for index++; index < len(document); index++ {
		switch {
		case escaped:
			escaped = false
		case document[index] == '\\':
			escaped = true
		case document[index] == '"':
			result := make([]byte, 0, len(document)-(index-start+1)+len(literal))
			result = append(result, document[:start]...)
			result = append(result, literal...)
			result = append(result, document[index+1:]...)
			return result
		}
	}
	t.Fatalf("manifest field %q has an unterminated JSON string", field)
	return nil
}

func sameOptionalInteger(left, right *int) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}
