package archivebuild

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

func TestCareerListDeduplicatesKnownUpstreamValues(t *testing.T) {
	if err := validateCareers(json.RawMessage(`["writer","producer","writer"]`)); err != nil {
		t.Fatalf("duplicate known career rejected: %v", err)
	}
	if err := validateCareers(json.RawMessage(`["unknown"]`)); ErrorCode(err) != "SOURCE_RECORD_MALFORMED" {
		t.Fatalf("unknown career error = %v", err)
	}
}

func TestEntityNameCNParsesScalarAndExplicitValues(t *testing.T) {
	tests := []struct {
		name   string
		record map[string]any
		want   string
	}{
		{
			name:   "scalar",
			record: map[string]any{"infobox": "{{Infobox Crt\r\n|简体中文名= 石原立也\r\n|别名={\r\n}\r\n}}"},
			want:   "石原立也",
		},
		{
			name:   "empty scalar does not consume following block",
			record: map[string]any{"infobox": "{{Infobox Crt\n|简体中文名=\n|别名={\n[日文名|原文]\n}\n}}"},
		},
		{
			name:   "explicit value wins",
			record: map[string]any{"name_cn": "显式名称", "infobox": "{{Infobox Crt\n|简体中文名= infobox 名称\n}}"},
			want:   "显式名称",
		},
		{
			name:   "explicit empty value does not fall back",
			record: map[string]any{"name_cn": "", "infobox": "{{Infobox Crt\n|简体中文名= infobox 名称\n}}"},
		},
		{
			name:   "explicit null falls back",
			record: map[string]any{"name_cn": nil, "infobox": "{{Infobox Crt\n|简体中文名= infobox 名称\n}}"},
			want:   "infobox 名称",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := entityNameCN(rawNameRecord(t, test.record)); got != test.want {
				t.Fatalf("entityNameCN() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestEntityNameCNParsesStructuredBlock(t *testing.T) {
	tests := []struct {
		name    string
		infobox string
		want    string
	}{
		{name: "single value", infobox: "{{Infobox Crt\n|简体中文名={\n[唯一名称]\n}\n}}", want: "唯一名称"},
		{name: "label and value", infobox: "{{Infobox Crt\n|简体中文名={\n[第二中文名|唯一名称]\n}\n}}", want: "唯一名称"},
		{name: "identical values", infobox: "{{Infobox Crt\n|简体中文名={\n[唯一名称]\n[别名|唯一名称]\n}\n}}", want: "唯一名称"},
		{name: "ambiguous values", infobox: "{{Infobox Crt\n|简体中文名={\n[角色名1]\n[角色名2]\n}\n}}"},
		{name: "malformed entry", infobox: "{{Infobox Crt\n|简体中文名={\n唯一名称\n}\n}}"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			record := rawNameRecord(t, map[string]any{"infobox": test.infobox})
			if got := entityNameCN(record); got != test.want {
				t.Fatalf("entityNameCN() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestEntityNameCNReconcilesDuplicateFields(t *testing.T) {
	tests := []struct {
		name    string
		infobox string
		want    string
	}{
		{name: "same value", infobox: "{{Infobox Crt\n|简体中文名= 同名\n|简体中文名= 同名\n}}", want: "同名"},
		{name: "different values", infobox: "{{Infobox Crt\n|简体中文名= 名称一\n|简体中文名= 名称二\n}}"},
		{name: "one empty value", infobox: "{{Infobox Crt\n|简体中文名= 名称\n|简体中文名=\n}}"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			record := rawNameRecord(t, map[string]any{"infobox": test.infobox})
			if got := entityNameCN(record); got != test.want {
				t.Fatalf("entityNameCN() = %q, want %q", got, test.want)
			}
		})
	}
}

func rawNameRecord(t *testing.T, value map[string]any) map[string]json.RawMessage {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	record, err := decodeStrictObject(data)
	if err != nil {
		t.Fatal(err)
	}
	return record
}

type goldenSource struct {
	Name           string `json:"name"`
	BytesUTF8      string `json:"bytesUtf8"`
	Size           int64  `json:"size"`
	Digest         string `json:"digest"`
	DeclaredSize   int64  `json:"declaredSize"`
	DeclaredDigest string `json:"declaredDigest"`
}

type goldenAccounting struct {
	Name         string `json:"name"`
	RecordsTotal int64  `json:"recordsTotal"`
	Imported     int64  `json:"imported"`
	Duplicate    int64  `json:"duplicate"`
	Invalid      int64  `json:"invalid"`
	Unresolved   int64  `json:"unresolved"`
}

type producerCase struct {
	CaseID string `json:"caseId"`
	Inputs struct {
		Sources []goldenSource `json:"sources"`
		Common  struct {
			BytesUTF8 string `json:"bytesUtf8"`
		} `json:"commonSubjectStaffs"`
		Catalog struct {
			BytesUTF8 string `json:"bytesUtf8"`
		} `json:"catalogConfig"`
		Identity BuildIdentity `json:"identity"`
	} `json:"inputs"`
	DataVersion struct {
		Result string `json:"result"`
	} `json:"dataVersion"`
	Expected struct {
		Accounting     []goldenAccounting `json:"accounting"`
		TableCounts    map[string]int64   `json:"tableCounts"`
		QualitySummary map[string]int64   `json:"qualitySummary"`
		LogicalDigests map[string]string  `json:"logicalDigests"`
		Outcome        string             `json:"outcome"`
		FirstFailure   *struct {
			Code string `json:"code"`
		} `json:"firstFailure"`
		CandidateAllowed bool `json:"candidateAllowed"`
	} `json:"expected"`
}

func repositoryRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve caller")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", "..", ".."))
}

func readProducerCase(t *testing.T, name string) producerCase {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(repositoryRoot(t), "contracts", "goldens", "archive", "producer", "cases", name+".json"))
	if err != nil {
		t.Fatalf("read case: %v", err)
	}
	var value producerCase
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatalf("decode case: %v", err)
	}
	return value
}

func arrangeProducerCase(t *testing.T, value producerCase) ([]SourceInput, string) {
	t.Helper()
	root := filepath.Join(t.TempDir(), "sources")
	if err := os.Mkdir(root, 0o750); err != nil {
		t.Fatal(err)
	}
	result := make([]SourceInput, 0, len(value.Inputs.Sources))
	for _, source := range value.Inputs.Sources {
		location := filepath.Join(root, source.Name)
		if err := os.WriteFile(location, []byte(source.BytesUTF8), 0o640); err != nil {
			t.Fatal(err)
		}
		result = append(result, SourceInput{Name: source.Name, Path: location, Size: source.Size, Digest: source.Digest, DeclaredSize: source.DeclaredSize, DeclaredDigest: source.DeclaredDigest})
	}
	return result, filepath.Join(t.TempDir(), "candidate.sqlite")
}

func TestProducerGoldens(t *testing.T) {
	caseNames := []string{"conflicting-duplicate", "digest-mismatch", "extra-source", "identical-duplicate", "identical-regeneration", "invalid-cast-role", "invalid-relation-code", "invalid-subject-type", "malformed-record", "missing-reference", "missing-source", "permitted-unresolved-position", "size-mismatch", "unknown-field-record", "valid-seven-source"}
	for _, name := range caseNames {
		t.Run(name, func(t *testing.T) {
			value := readProducerCase(t, name)
			sources, destination := arrangeProducerCase(t, value)
			result, err := BuildDatabase(context.Background(), BuildRequest{Destination: destination, Sources: sources, CommonBytes: []byte(value.Inputs.Common.BytesUTF8), CatalogBytes: []byte(value.Inputs.Catalog.BytesUTF8), SchemaSQL: embeddedSchemaSQL, Identity: value.Inputs.Identity})
			if value.Expected.Outcome != "VALID" {
				if err == nil {
					t.Fatalf("expected %s", value.Expected.Outcome)
				}
				if value.Expected.FirstFailure == nil || ErrorCode(err) != value.Expected.FirstFailure.Code {
					t.Fatalf("error = %s, want %+v", ErrorCode(err), value.Expected.FirstFailure)
				}
				if _, statErr := os.Stat(destination); !os.IsNotExist(statErr) {
					t.Fatalf("failed candidate remains: %v", statErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("BuildDatabase: %s (%v)", ErrorCode(err), err)
			}
			if result.DataVersion != value.DataVersion.Result {
				t.Errorf("dataVersion = %q, want %q", result.DataVersion, value.DataVersion.Result)
			}
			actualAccounting := make([]goldenAccounting, len(result.Accounting))
			for index, entry := range result.Accounting {
				actualAccounting[index] = goldenAccounting{Name: entry.Name, RecordsTotal: entry.RecordsTotal, Imported: entry.Imported, Duplicate: entry.Duplicate, Invalid: entry.Invalid, Unresolved: entry.Unresolved}
			}
			if !reflect.DeepEqual(actualAccounting, value.Expected.Accounting) {
				t.Errorf("accounting = %#v, want %#v", actualAccounting, value.Expected.Accounting)
			}
			if !reflect.DeepEqual(result.TableCounts, value.Expected.TableCounts) {
				t.Errorf("tableCounts = %#v, want %#v", result.TableCounts, value.Expected.TableCounts)
			}
			if !reflect.DeepEqual(result.QualitySummary, value.Expected.QualitySummary) {
				t.Errorf("quality = %#v, want %#v", result.QualitySummary, value.Expected.QualitySummary)
			}
			if !reflect.DeepEqual(result.LogicalDigests, value.Expected.LogicalDigests) {
				t.Errorf("logicalDigests = %#v, want %#v", result.LogicalDigests, value.Expected.LogicalDigests)
			}
		})
	}
}

type derivationCase struct {
	Input struct {
		DisplayConfig  json.RawMessage `json:"displayConfig"`
		StaffSetConfig json.RawMessage `json:"staffSetConfig"`
		CommonCatalog  json.RawMessage `json:"commonCatalog"`
		Archive        struct {
			Subjects []struct {
				SubjectID   int64  `json:"subjectId"`
				SubjectType string `json:"subjectType"`
			} `json:"subjects"`
			Persons []struct {
				PersonID int64 `json:"personId"`
			} `json:"persons"`
			Characters []struct {
				CharacterID int64 `json:"characterId"`
			} `json:"characters"`
			StaffCredits []struct {
				SubjectID  int64 `json:"subjectId"`
				PersonID   int64 `json:"personId"`
				PositionID int64 `json:"positionId"`
			} `json:"staffCredits"`
			SubjectCharacters []struct {
				SubjectID   int64 `json:"subjectId"`
				CharacterID int64 `json:"characterId"`
				Type        int64 `json:"type"`
				Order       int64 `json:"order"`
			} `json:"subjectCharacters"`
			PersonCharacters []struct {
				SubjectID   int64 `json:"subjectId"`
				CharacterID int64 `json:"characterId"`
				PersonID    int64 `json:"personId"`
			} `json:"personCharacters"`
			SubjectRelations []struct {
				SubjectID        int64 `json:"subjectId"`
				RelatedSubjectID int64 `json:"relatedSubjectId"`
				RelationType     int64 `json:"relationType"`
			} `json:"subjectRelations"`
		} `json:"archive"`
	} `json:"input"`
}

func TestGovernedCatalogCastAndQuality(t *testing.T) {
	caseBytes, err := os.ReadFile(filepath.Join(repositoryRoot(t), "contracts", "goldens", "catalog", "cases", "complete-derivation.json"))
	if err != nil {
		t.Fatal(err)
	}
	var value derivationCase
	if err := json.Unmarshal(caseBytes, &value); err != nil {
		t.Fatal(err)
	}
	catalogBytes, catalogDigest, err := CanonicalCatalogConfiguration(value.Input.DisplayConfig, value.Input.StaffSetConfig)
	if err != nil {
		t.Fatalf("canonical catalog: %v", err)
	}
	commonBytes := append(append([]byte(nil), value.Input.CommonCatalog...), '\n')
	typeCodes := map[string]int64{"book": 1, "anime": 2, "music": 3, "game": 4, "real": 6}
	records := map[string][]any{}
	for _, item := range value.Input.Archive.Subjects {
		records["subject.jsonlines"] = append(records["subject.jsonlines"], map[string]any{"id": item.SubjectID, "type": typeCodes[item.SubjectType], "name": "subject", "name_cn": "", "nsfw": false, "date": ""})
	}
	for _, item := range value.Input.Archive.Persons {
		records["person.jsonlines"] = append(records["person.jsonlines"], map[string]any{"id": item.PersonID, "name": "person", "career": []string{"seiyu"}})
	}
	for _, item := range value.Input.Archive.Characters {
		records["character.jsonlines"] = append(records["character.jsonlines"], map[string]any{"id": item.CharacterID, "name": "character"})
	}
	for _, item := range value.Input.Archive.StaffCredits {
		records["subject-persons.jsonlines"] = append(records["subject-persons.jsonlines"], map[string]any{"subject_id": item.SubjectID, "person_id": item.PersonID, "position": item.PositionID})
	}
	for _, item := range value.Input.Archive.SubjectCharacters {
		records["subject-characters.jsonlines"] = append(records["subject-characters.jsonlines"], map[string]any{"subject_id": item.SubjectID, "character_id": item.CharacterID, "type": item.Type, "order": item.Order})
	}
	for _, item := range value.Input.Archive.PersonCharacters {
		records["person-characters.jsonlines"] = append(records["person-characters.jsonlines"], map[string]any{"subject_id": item.SubjectID, "character_id": item.CharacterID, "person_id": item.PersonID})
	}
	for _, item := range value.Input.Archive.SubjectRelations {
		records["subject-relations.jsonlines"] = append(records["subject-relations.jsonlines"], map[string]any{"subject_id": item.SubjectID, "related_subject_id": item.RelatedSubjectID, "relation_type": item.RelationType})
	}
	sourceRoot := filepath.Join(t.TempDir(), "sources")
	if err := os.Mkdir(sourceRoot, 0o750); err != nil {
		t.Fatal(err)
	}
	sources := make([]SourceInput, 0, len(SourceNames))
	for _, name := range SourceNames {
		data := []byte{}
		for _, record := range records[name] {
			encoded, err := json.Marshal(record)
			if err != nil {
				t.Fatal(err)
			}
			data = append(data, encoded...)
			data = append(data, '\n')
		}
		location := filepath.Join(sourceRoot, name)
		if err := os.WriteFile(location, data, 0o640); err != nil {
			t.Fatal(err)
		}
		digest := digestBytes(data)
		sources = append(sources, SourceInput{Name: name, Path: location, Size: int64(len(data)), Digest: digest, DeclaredSize: int64(len(data)), DeclaredDigest: digest})
	}
	identity := BuildIdentity{ArchiveRelease: "catalog-derivation-v1", ArchiveDigest: "sha256:" + string(make([]byte, 0)), CommonCommit: DefaultCommonCommit, CommonDigest: digestBytes(commonBytes), ManifestSchemaVersion: 1, SQLiteSchemaVersion: 1, SchemaSQLDigest: digestBytes(embeddedSchemaSQL), DomainRulesVersion: DomainRulesVersion, CastRulesVersion: CastRulesVersion, CatalogConfigDigest: catalogDigest}
	identity.ArchiveDigest = "sha256:" + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	destination := filepath.Join(t.TempDir(), "catalog.sqlite")
	result, err := BuildDatabase(context.Background(), BuildRequest{Destination: destination, Sources: sources, CommonBytes: commonBytes, CatalogBytes: catalogBytes, SchemaSQL: embeddedSchemaSQL, Identity: identity})
	if err != nil {
		t.Fatalf("BuildDatabase: %s", ErrorCode(err))
	}
	wantBytes, err := os.ReadFile(filepath.Join(repositoryRoot(t), "contracts", "goldens", "catalog", "quality", "complete-source-sentinel.json"))
	if err != nil {
		t.Fatal(err)
	}
	var want struct {
		Counts        map[string]int64            `json:"counts"`
		Samples       map[string][]map[string]any `json:"samples"`
		RoleInventory []map[string]any            `json:"roleInventory"`
		Unknown       []map[string]any            `json:"unknownStaffPositionIds"`
	}
	if err := json.Unmarshal(wantBytes, &want); err != nil {
		t.Fatal(err)
	}
	reportBytes, err := json.Marshal(result.QualityReport)
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Counts        map[string]int64            `json:"counts"`
		Samples       map[string][]map[string]any `json:"samples"`
		RoleInventory []map[string]any            `json:"roleInventory"`
		Unknown       []map[string]any            `json:"unknownStaffPositionIds"`
	}
	if err := json.Unmarshal(reportBytes, &got); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("quality report mismatch\n got=%#v\nwant=%#v", got, want)
	}
	if result.QualitySummary["UNKNOWN_STAFF_POSITION"] != 1 {
		t.Fatalf("unknown positions = %d", result.QualitySummary["UNKNOWN_STAFF_POSITION"])
	}
}
