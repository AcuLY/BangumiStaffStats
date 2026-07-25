package query

import (
	"bytes"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

type queryGoldenDocument struct {
	Cases         []queryGoldenCase   `json:"cases"`
	NegativeCases []negativeQueryCase `json:"negativeCases"`
}

type queryGoldenCase struct {
	ID          string          `json:"id"`
	Submitted   json.RawMessage `json:"submitted"`
	Catalog     json.RawMessage `json:"catalog"`
	CatalogCase string          `json:"catalogCase"`
	Expected    struct {
		Effective      json.RawMessage `json:"effective"`
		Projection     json.RawMessage `json:"projection"`
		Canonical      string          `json:"canonical"`
		PreimageHex    string          `json:"preimageHex"`
		PreimageBase64 string          `json:"preimageBase64url"`
		QueryDigest    string          `json:"queryDigest"`
	} `json:"expected"`
}

type negativeQueryCase struct {
	ID                      string          `json:"id"`
	Submitted               json.RawMessage `json:"submitted"`
	SubmittedTemplate       json.RawMessage `json:"submittedTemplate"`
	Catalog                 json.RawMessage `json:"catalog"`
	CatalogCase             string          `json:"catalogCase"`
	ExpectedCode            string          `json:"expectedCode"`
	ExpectedPath            string          `json:"expectedPath"`
	GeneratedTagGroups      int             `json:"generatedTagGroups"`
	GeneratedTagTokens      int             `json:"generatedTagTokens"`
	GeneratedTotalTagTokens *struct {
		Groups         int `json:"groups"`
		TokensPerGroup int `json:"tokensPerGroup"`
	} `json:"generatedTotalTagTokens"`
	GeneratedToken *struct {
		Value  string `json:"value"`
		Repeat int    `json:"repeat"`
	} `json:"generatedToken"`
	GeneratedUID *struct {
		Value  string `json:"value"`
		Repeat int    `json:"repeat"`
	} `json:"generatedUid"`
}

func TestNormalizeConsumesEveryPositiveQueryGolden(t *testing.T) {
	document := loadQueryGoldenDocument(t)
	for _, testCase := range document.Cases {
		testCase := testCase
		t.Run(testCase.ID, func(t *testing.T) {
			normalized, err := NormalizeJSON(testCase.Submitted, testCase.Catalog)
			if err != nil {
				t.Fatalf("NormalizeJSON() error = %v", err)
			}

			assertJSONEqual(t, normalized.Effective, testCase.Expected.Effective)
			assertJSONEqual(t, normalized.Projection, testCase.Expected.Projection)
			if string(normalized.Canonical) != testCase.Expected.Canonical {
				t.Fatalf("canonical mismatch\n got: %s\nwant: %s", normalized.Canonical, testCase.Expected.Canonical)
			}
			if got := hex.EncodeToString(normalized.Preimage); got != testCase.Expected.PreimageHex {
				t.Fatalf("preimage hex = %s, want %s", got, testCase.Expected.PreimageHex)
			}
			if got := base64.RawURLEncoding.EncodeToString(normalized.Preimage); got != testCase.Expected.PreimageBase64 {
				t.Fatalf("preimage base64url = %s, want %s", got, testCase.Expected.PreimageBase64)
			}
			if normalized.Digest != testCase.Expected.QueryDigest {
				t.Fatalf("Digest = %s, want %s", normalized.Digest, testCase.Expected.QueryDigest)
			}

			normalizedJSON, err := json.Marshal(normalized.Effective)
			if err != nil {
				t.Fatal(err)
			}
			second, err := NormalizeJSON(normalizedJSON, testCase.Catalog)
			if err != nil {
				t.Fatalf("idempotent NormalizeJSON() error = %v", err)
			}
			if !bytes.Equal(second.Canonical, normalized.Canonical) || second.Digest != normalized.Digest {
				t.Fatalf("normalization is not idempotent")
			}
		})
	}
}

func TestNormalizeConsumesEveryNegativeQueryGolden(t *testing.T) {
	document := loadQueryGoldenDocument(t)
	positiveByID := make(map[string]queryGoldenCase, len(document.Cases))
	for _, testCase := range document.Cases {
		positiveByID[testCase.ID] = testCase
	}
	for _, testCase := range document.NegativeCases {
		testCase := testCase
		t.Run(testCase.ID, func(t *testing.T) {
			submitted := materializeNegativeQuery(t, testCase)
			catalog := testCase.Catalog
			if len(catalog) == 0 || bytes.Equal(catalog, []byte("null")) {
				base, ok := positiveByID[testCase.CatalogCase]
				if !ok {
					t.Fatalf("unknown catalogCase %q", testCase.CatalogCase)
				}
				catalog = base.Catalog
			}
			_, err := NormalizeJSON(submitted, catalog)
			assertContractError(t, err, testCase.ExpectedCode, testCase.ExpectedPath)
		})
	}
}

func TestNormalizeConsumesTextualInvalidGoldens(t *testing.T) {
	var document struct {
		Cases []struct {
			ID           string `json:"id"`
			Text         string `json:"text"`
			ExpectedCode string `json:"expectedCode"`
		} `json:"cases"`
	}
	readGoldenJSON(t, "cases/textual-invalid.json", &document)
	catalog := []byte(`{"positions":[{"key":"staff:anime:2","subjectType":"anime","selectable":true}]}`)
	for _, testCase := range document.Cases {
		testCase := testCase
		t.Run(testCase.ID, func(t *testing.T) {
			_, err := NormalizeJSON([]byte(testCase.Text), catalog)
			var contractError *ContractError
			if !errors.As(err, &contractError) {
				t.Fatalf("error = %v, want ContractError", err)
			}
			if contractError.Code != testCase.ExpectedCode {
				t.Fatalf("code = %s, want %s", contractError.Code, testCase.ExpectedCode)
			}
		})
	}
}

func TestRFC8785AuthorityVectors(t *testing.T) {
	var document struct {
		Cases []struct {
			ID       string          `json:"id"`
			Input    json.RawMessage `json:"input"`
			Expected string          `json:"expected"`
		} `json:"cases"`
	}
	readGoldenJSON(t, "cases/rfc8785.json", &document)
	for _, testCase := range document.Cases {
		testCase := testCase
		t.Run(testCase.ID, func(t *testing.T) {
			canonical, err := CanonicalizeJSON(testCase.Input)
			if err != nil {
				t.Fatalf("CanonicalizeJSON() error = %v", err)
			}
			if string(canonical) != testCase.Expected {
				t.Fatalf("canonical = %s, want %s", canonical, testCase.Expected)
			}
		})
	}
}

func TestUnicodeAuthorityVectors(t *testing.T) {
	var document struct {
		TrimCases []struct {
			ID       string `json:"id"`
			Input    string `json:"input"`
			Expected string `json:"expected"`
		} `json:"trimCases"`
		FoldCases []struct {
			ID       string `json:"id"`
			Input    string `json:"input"`
			Expected string `json:"expected"`
		} `json:"foldCases"`
		RejectionCases []struct {
			ID           string          `json:"id"`
			Input        json.RawMessage `json:"input"`
			Object       json.RawMessage `json:"object"`
			ExpectedCode string          `json:"expectedCode"`
		} `json:"rejectionCases"`
	}
	readGoldenJSON(t, "cases/unicode.json", &document)

	for _, testCase := range document.TrimCases {
		if got := TrimV1(testCase.Input); got != testCase.Expected {
			t.Errorf("%s: TrimV1() = %q, want %q", testCase.ID, got, testCase.Expected)
		}
	}
	for _, testCase := range document.FoldCases {
		testCase := testCase
		t.Run(testCase.ID, func(t *testing.T) {
			got, err := NormalizeTag(testCase.Input)
			if err != nil {
				t.Fatalf("NormalizeTag() error = %v", err)
			}
			if got != testCase.Expected {
				t.Fatalf("NormalizeTag() = %q, want %q", got, testCase.Expected)
			}
		})
	}

	catalog := []byte(`{"positions":[{"key":"staff:anime:2","subjectType":"anime","selectable":true}]}`)
	for _, testCase := range document.RejectionCases {
		testCase := testCase
		t.Run(testCase.ID, func(t *testing.T) {
			var err error
			if len(testCase.Input) != 0 {
				query := append([]byte(`{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"],"filters":{"tags":{"include":[{"anyOf":[`), testCase.Input...)
				query = append(query, []byte(`]}]}}}`)...)
				_, err = NormalizeJSON(query, catalog)
			} else {
				_, err = CanonicalizeJSON(testCase.Object)
			}
			var contractError *ContractError
			if !errors.As(err, &contractError) {
				t.Fatalf("error = %v, want ContractError", err)
			}
			if contractError.Code != testCase.ExpectedCode {
				t.Fatalf("code = %s, want %s", contractError.Code, testCase.ExpectedCode)
			}
		})
	}
}

func TestUnknownQueryAndCatalogFieldsAreRejected(t *testing.T) {
	document := loadQueryGoldenDocument(t)
	positiveByID := make(map[string]queryGoldenCase, len(document.Cases))
	for _, testCase := range document.Cases {
		positiveByID[testCase.ID] = testCase
	}
	var unknowns struct {
		Cases []struct {
			ID       string `json:"id"`
			Target   string `json:"target"`
			BaseCase string `json:"baseCase"`
			Pointer  string `json:"pointer"`
		} `json:"cases"`
		InjectedProperty string `json:"injectedProperty"`
		InjectedValue    any    `json:"injectedValue"`
		ExpectedCode     string `json:"expectedCode"`
	}
	readGoldenJSON(t, "cases/unknown-fields.json", &unknowns)
	for _, testCase := range unknowns.Cases {
		if testCase.Target != "query" && testCase.Target != "catalog" {
			continue
		}
		testCase := testCase
		t.Run(testCase.ID, func(t *testing.T) {
			base := positiveByID[testCase.BaseCase]
			query := append(json.RawMessage(nil), base.Submitted...)
			catalog := append(json.RawMessage(nil), base.Catalog...)
			var target any
			if testCase.Target == "query" {
				target = decodeAny(t, query)
			} else {
				target = decodeAny(t, catalog)
			}
			object, ok := resolveTestPointer(target, testCase.Pointer).(map[string]any)
			if !ok {
				t.Fatalf("pointer %q does not resolve to object", testCase.Pointer)
			}
			object[unknowns.InjectedProperty] = unknowns.InjectedValue
			mutated, err := json.Marshal(target)
			if err != nil {
				t.Fatal(err)
			}
			if testCase.Target == "query" {
				query = mutated
			} else {
				catalog = mutated
			}
			_, err = NormalizeJSON(query, catalog)
			var contractError *ContractError
			if !errors.As(err, &contractError) || contractError.Code != unknowns.ExpectedCode {
				t.Fatalf("error = %v, want code %s", err, unknowns.ExpectedCode)
			}
		})
	}
}

func TestNormalizationDependencyPins(t *testing.T) {
	goMod, err := os.ReadFile(filepath.Join("..", "..", "go.mod"))
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{
		"github.com/gowebpki/jcs v1.0.1",
		"golang.org/x/text v0.40.0",
	} {
		if !bytes.Contains(goMod, []byte(required)) {
			t.Errorf("go.mod does not contain exact pin %q", required)
		}
	}
}

func loadQueryGoldenDocument(t *testing.T) queryGoldenDocument {
	t.Helper()
	var document queryGoldenDocument
	readGoldenJSON(t, "cases/queries.json", &document)
	return document
}

func readGoldenJSON(t *testing.T, relative string, target any) {
	t.Helper()
	path := filepath.Join("..", "..", "..", "contracts", "goldens", "query", relative)
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if err := json.Unmarshal(raw, target); err != nil {
		t.Fatalf("decode %s: %v", path, err)
	}
}

func materializeNegativeQuery(t *testing.T, testCase negativeQueryCase) json.RawMessage {
	t.Helper()
	if len(testCase.Submitted) != 0 && !bytes.Equal(testCase.Submitted, []byte("null")) {
		return append(json.RawMessage(nil), testCase.Submitted...)
	}
	value := decodeAny(t, testCase.SubmittedTemplate)
	root := value.(map[string]any)

	if testCase.GeneratedToken != nil {
		filters := root["filters"].(map[string]any)
		tags := filters["tags"].(map[string]any)
		include := tags["include"].([]any)
		group := include[0].(map[string]any)
		tokens := group["anyOf"].([]any)
		tokens[0] = strings.Repeat(testCase.GeneratedToken.Value, testCase.GeneratedToken.Repeat)
	}
	if testCase.GeneratedUID != nil {
		root["uid"] = strings.Repeat(testCase.GeneratedUID.Value, testCase.GeneratedUID.Repeat)
	}
	if testCase.GeneratedTagGroups > 0 {
		filters := root["filters"].(map[string]any)
		tags := filters["tags"].(map[string]any)
		groups := make([]any, testCase.GeneratedTagGroups)
		for index := range groups {
			groups[index] = map[string]any{"anyOf": []any{fmt.Sprintf("group-%d", index)}}
		}
		tags["include"] = groups
	}
	if testCase.GeneratedTagTokens > 0 {
		filters := root["filters"].(map[string]any)
		tags := filters["tags"].(map[string]any)
		include := tags["include"].([]any)
		tokens := make([]any, testCase.GeneratedTagTokens)
		for index := range tokens {
			tokens[index] = fmt.Sprintf("token-%d", index)
		}
		include[0].(map[string]any)["anyOf"] = tokens
	}
	if testCase.GeneratedTotalTagTokens != nil {
		filters := root["filters"].(map[string]any)
		tags := filters["tags"].(map[string]any)
		groups := make([]any, testCase.GeneratedTotalTagTokens.Groups)
		for groupIndex := range groups {
			tokens := make([]any, testCase.GeneratedTotalTagTokens.TokensPerGroup)
			for tokenIndex := range tokens {
				tokens[tokenIndex] = fmt.Sprintf("group-%d-token-%d", groupIndex, tokenIndex)
			}
			groups[groupIndex] = map[string]any{"anyOf": tokens}
		}
		tags["include"] = groups
	}
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func decodeAny(t *testing.T, raw []byte) any {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		t.Fatal(err)
	}
	return value
}

func assertJSONEqual(t *testing.T, got any, wantRaw []byte) {
	t.Helper()
	gotRaw, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	gotCanonical, err := CanonicalizeJSON(gotRaw)
	if err != nil {
		t.Fatal(err)
	}
	wantCanonical, err := CanonicalizeJSON(wantRaw)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(gotCanonical, wantCanonical) {
		t.Fatalf("JSON mismatch\n got: %s\nwant: %s", gotCanonical, wantCanonical)
	}
}

func assertContractError(t *testing.T, err error, code, path string) {
	t.Helper()
	var contractError *ContractError
	if !errors.As(err, &contractError) {
		t.Fatalf("error = %v, want ContractError", err)
	}
	if contractError.Code != code || contractError.Path != path {
		t.Fatalf("error = (%s, %s), want (%s, %s): %v", contractError.Code, contractError.Path, code, path, err)
	}
}

func resolveTestPointer(root any, pointer string) any {
	if pointer == "" {
		return root
	}
	current := root
	for _, part := range strings.Split(strings.TrimPrefix(pointer, "/"), "/") {
		part = strings.ReplaceAll(strings.ReplaceAll(part, "~1", "/"), "~0", "~")
		switch typed := current.(type) {
		case map[string]any:
			current = typed[part]
		case []any:
			index, _ := strconv.Atoi(part)
			current = typed[index]
		default:
			return nil
		}
	}
	return current
}
