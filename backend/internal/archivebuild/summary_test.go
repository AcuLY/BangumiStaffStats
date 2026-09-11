package archivebuild

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestNormalizedPersonSummary(t *testing.T) {
	whiteSpace := "\t\n\v\f\r \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000"
	tests := []struct {
		name, source, want string
	}{
		{name: "empty"},
		{name: "Unicode whitespace", source: whiteSpace},
		{name: "trim before cap", source: whiteSpace + "中文简介" + whiteSpace, want: "中文简介"},
		{name: "line endings and controls", source: " \x00第一行\r\n\t第二\x01行\r第三\x1f行\n末行 ", want: "第一行\n\t第二行\n第三行\n末行"},
		{name: "preserve interior non-C0", source: "A\u0085B\u200bC\u007fD\ufeff", want: "A\u0085B\u200bC\u007fD\ufeff"},
		{name: "literal markup", source: "<script>alert(1)</script> [b]作品[/b] &amp; https://example.test", want: "<script>alert(1)</script> [b]作品[/b] &amp; https://example.test"},
		{name: "exact scalar limit", source: strings.Repeat("😀", 8192), want: strings.Repeat("😀", 8192)},
		{name: "truncate without splitting scalar", source: strings.Repeat("字", 8191) + "😀尾", want: strings.Repeat("字", 8191) + "😀"},
		{name: "trim after cap", source: strings.Repeat("a", 8191) + "\u3000尾", want: strings.Repeat("a", 8191)},
		{name: "trim leading space before cap", source: strings.Repeat(" ", 8192) + "有效", want: "有效"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			raw, err := json.Marshal(test.source)
			if err != nil {
				t.Fatal(err)
			}
			got, err := normalizedPersonSummary(raw)
			if err != nil || got != test.want {
				t.Fatalf("normalized summary: got %q, want %q, err %v", got, test.want, err)
			}
			if !utf8.ValidString(got) || utf8.RuneCountInString(got) > 8192 {
				t.Fatal("normalized summary violates scalar bound")
			}
		})
	}
}

func TestPersonSummaryJSONAndUnicode(t *testing.T) {
	tests := []struct {
		name string
		raw  json.RawMessage
		want string
		bad  bool
	}{
		{name: "missing"},
		{name: "null", raw: json.RawMessage(`null`)},
		{name: "valid surrogate pair", raw: json.RawMessage(`"\ud83d\ude00"`), want: "😀"},
		{name: "escaped slash is literal", raw: json.RawMessage(`"\\ud800"`), want: `\ud800`},
		{name: "replacement scalar is preserved", raw: json.RawMessage(`"\ufffd"`), want: "�"},
		{name: "invalid UTF8", raw: json.RawMessage{'"', 0xc3, 0x28, '"'}, bad: true},
		{name: "lone high surrogate", raw: json.RawMessage(`"\ud800"`), bad: true},
		{name: "lone low surrogate", raw: json.RawMessage(`"\udfff"`), bad: true},
		{name: "unpaired high surrogate", raw: json.RawMessage(`"\ud800\u0041"`), bad: true},
		{name: "reversed surrogate pair", raw: json.RawMessage(`"\udc00\ud800"`), bad: true},
		{name: "number", raw: json.RawMessage(`42`), bad: true},
		{name: "array", raw: json.RawMessage(`[]`), bad: true},
		{name: "object", raw: json.RawMessage(`{}`), bad: true},
		{name: "malformed string", raw: json.RawMessage(`"unterminated`), bad: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := normalizedPersonSummary(test.raw)
			if (err != nil) != test.bad || (!test.bad && got != test.want) {
				t.Fatalf("summary = %q, err = %v", got, err)
			}
		})
	}
	person := rawNameRecord(t, map[string]any{"id": 1, "name": "Person", "career": []string{}, "summary": "a\x00b"})
	if err := validateRecordShape("person.jsonlines", person, false); err != nil {
		t.Fatalf("person summary must permit normalization: %v", err)
	}
	character := rawNameRecord(t, map[string]any{"id": 1, "name": "Character", "summary": "a\x00b"})
	if err := validateRecordShape("character.jsonlines", character, false); ErrorCode(err) != "SOURCE_RECORD_MALFORMED" {
		t.Fatalf("character summary validation changed: %v", err)
	}
}

func TestInsertPersonStoresNormalizedNullableSummary(t *testing.T) {
	database, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if _, err := database.Exec(string(embeddedSchemaSQL)); err != nil {
		t.Fatal(err)
	}
	tx, err := database.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	processor := sourceProcessor{ctx: context.Background(), tx: tx}
	for index, raw := range []json.RawMessage{nil, json.RawMessage(`null`), json.RawMessage(`" \u3000\t\u0000"`), json.RawMessage(`" 第一行\r\n第二行 "`)} {
		record := rawNameRecord(t, map[string]any{"id": index + 1, "name": "Person", "career": []string{"seiyu"}})
		if raw != nil {
			record["summary"] = raw
		}
		if err := validateRecordShape("person.jsonlines", record, false); err != nil {
			t.Fatal(err)
		}
		if err := processor.insertPerson(record); err != nil {
			t.Fatal(err)
		}
		var got sql.NullString
		if err := tx.QueryRow("SELECT summary FROM person WHERE person_id = ?", index+1).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if index < 3 && got.Valid || index == 3 && (!got.Valid || got.String != "第一行\n第二行") {
			t.Fatalf("stored summary %d = %+v", index, got)
		}
	}
}

type summaryFixtureProvider struct{ fixtureProvider }

func (provider summaryFixtureProvider) Acquire(ctx context.Context, stagingRoot, commonCommit string) (AcquiredInputs, error) {
	inputs, err := provider.fixtureProvider.Acquire(ctx, stagingRoot, commonCommit)
	// The fixture provider has no ZIP; bind its synthetic archive identity to the
	// changed person source just as a real changed Archive asset gets a new digest.
	inputs.ArchiveDigest = digestBytes(provider.sources["person.jsonlines"])
	return inputs, err
}

func TestRunOnceSummaryChangesArchiveIdentityAndLogicalEvidence(t *testing.T) {
	provider := loadFixtureProvider(t)
	lines := bytes.Split(bytes.TrimSuffix(provider.sources["person.jsonlines"], []byte("\n")), []byte("\n"))
	var firstPerson map[string]any
	if err := json.Unmarshal(lines[0], &firstPerson); err != nil {
		t.Fatal(err)
	}
	personID := int64(firstPerson["id"].(float64))
	var priorVersion, priorLogicalDigest string
	for _, summary := range []string{" \x00第一行\r\n第二行 ", "另一段简介 😀"} {
		firstPerson["summary"] = summary
		var err error
		lines[0], err = json.Marshal(firstPerson)
		if err != nil {
			t.Fatal(err)
		}
		provider.sources["person.jsonlines"] = append(bytes.Join(lines, []byte("\n")), '\n')
		result, err := RunOnce(context.Background(), RunConfig{OutputRoot: t.TempDir(), GeneratorVersion: "summary-test", Provider: summaryFixtureProvider{provider}})
		if err != nil {
			t.Fatalf("RunOnce: %v", err)
		}
		database, err := sql.Open("sqlite", filepath.Join(result.VersionRoot, SQLiteFilename))
		if err != nil {
			t.Fatal(err)
		}
		connection, err := database.Conn(context.Background())
		if err != nil {
			database.Close()
			t.Fatal(err)
		}
		var stored string
		if err := connection.QueryRowContext(context.Background(), "SELECT summary FROM person WHERE person_id = ?", personID).Scan(&stored); err != nil {
			t.Fatal(err)
		}
		want := "第一行\n第二行"
		if priorVersion != "" {
			want = "另一段简介 😀"
		}
		if stored != want {
			t.Fatalf("stored summary = %q, want %q", stored, want)
		}
		digests, err := logicalDigests(context.Background(), connection, compiledCatalog{})
		connection.Close()
		database.Close()
		if err != nil {
			t.Fatal(err)
		}
		if result.DataVersion == priorVersion || digests["person"] == priorLogicalDigest {
			t.Fatal("changed source biography did not change Archive identity and person logical evidence")
		}
		priorVersion, priorLogicalDigest = result.DataVersion, digests["person"]
	}
}
