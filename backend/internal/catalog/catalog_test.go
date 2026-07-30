package catalog

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi/wire"
)

type catalogSuccessFixture struct {
	Source struct {
		ArchiveCreditPositionKeys []string `json:"archiveCreditPositionKeys"`
	} `json:"source"`
	Expected struct {
		Body struct {
			Data wire.CatalogDataV1 `json:"data"`
		} `json:"body"`
	} `json:"expected"`
}

type catalogDerivedFixture struct {
	Patch []struct {
		Op    string          `json:"op"`
		Path  string          `json:"path"`
		Value json.RawMessage `json:"value"`
	} `json:"patch"`
}

func TestBuildDataMatchesAcceptedCatalogGoldens(t *testing.T) {
	for _, test := range []struct {
		name      string
		synthetic bool
	}{
		{name: "five types and dormant staff sets"},
		{name: "synthetic staff set", synthetic: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			fixture := loadCatalogGolden(t, test.synthetic)
			positions, groups, rules := catalogRecordsFromWire(t, fixture.Expected.Body.Data)

			got, err := buildData(context.Background(), positions, groups, rules)
			if err != nil {
				t.Fatalf("buildData: %v", err)
			}
			got.FilterCapabilities, got.SortCapabilities, err = capabilityMatrices(context.Background())
			if err != nil {
				t.Fatalf("capabilityMatrices: %v", err)
			}
			assertJSONEquivalent(t, got, fixture.Expected.Body.Data)

			if !test.synthetic {
				assertDormantGoldenCoverage(t, fixture)
			} else {
				assertSyntheticGoldenCoverage(t, got)
			}
		})
	}
}

func TestBuildDataIsDeterministicAndNewlyOwned(t *testing.T) {
	fixture := loadCatalogGolden(t, false)
	positions, groups, rules := catalogRecordsFromWire(t, fixture.Expected.Body.Data)

	first, err := buildData(context.Background(), positions, groups, rules)
	if err != nil {
		t.Fatal(err)
	}
	second, err := buildData(context.Background(), positions, groups, rules)
	if err != nil {
		t.Fatal(err)
	}
	assertJSONEquivalent(t, first, second)

	first.SubjectTypes[0].Label = "mutated"
	first.Groups[0].PositionKeys[0] = "mutated"
	first.SelectionRules[0].Value = "mutated"
	positions[0].capabilities[0] = wire.CatalogPositionCapabilityNameV1CoStar
	groups[0].members[0] = "mutated"
	rules[0].value = "mutated"

	thirdPositions, thirdGroups, thirdRules := catalogRecordsFromWire(t, fixture.Expected.Body.Data)
	third, err := buildData(context.Background(), thirdPositions, thirdGroups, thirdRules)
	if err != nil {
		t.Fatal(err)
	}
	third.FilterCapabilities, third.SortCapabilities, err = capabilityMatrices(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	assertJSONEquivalent(t, third, fixture.Expected.Body.Data)
	if second.SubjectTypes[0].Label == "mutated" ||
		second.Groups[0].PositionKeys[0] == "mutated" ||
		second.SelectionRules[0].Value == "mutated" {
		t.Fatal("one projection mutated another")
	}
}

func TestBuildDataRejectsCorruptDomainAndReferences(t *testing.T) {
	tests := []struct {
		name      string
		synthetic bool
		mutate    func([]*positionRecord, []*groupRecord, []ruleRecord) ([]*positionRecord, []*groupRecord, []ruleRecord)
	}{
		{name: "unknown position kind", mutate: mutatePosition("staff:book:1", func(value *positionRecord) { value.kind = "crew" })},
		{name: "unknown subject type", mutate: mutatePosition("staff:book:1", func(value *positionRecord) { value.subjectType = "film" })},
		{name: "empty label", mutate: mutatePosition("staff:book:1", func(value *positionRecord) { value.label = "" })},
		{name: "empty Chinese name", mutate: mutatePosition("staff:book:1", func(value *positionRecord) { value.nameCN.String = "" })},
		{name: "invalid UTF-8 name", mutate: mutatePosition("staff:book:1", func(value *positionRecord) { value.nameCN.String = string([]byte{0xff}) })},
		{name: "negative position order", mutate: mutatePosition("staff:book:1", func(value *positionRecord) { value.displayOrder = -1 })},
		{name: "position order over JSON integer", mutate: mutatePosition("staff:real:6", func(value *positionRecord) { value.displayOrder = maxJSONInteger + 1 })},
		{name: "invalid selectable flag", mutate: mutatePosition("staff:book:1", func(value *positionRecord) { value.selectable = 2 })},
		{name: "hidden position keeps capability", mutate: mutatePosition("staff:anime:201", func(value *positionRecord) { value.selectable = 0; value.staffStatus.String = "hidden" })},
		{name: "capability order drift", mutate: mutatePosition("staff:book:1", func(value *positionRecord) {
			value.capabilities[0], value.capabilities[1] = value.capabilities[1], value.capabilities[0]
		})},
		{name: "unknown capability", mutate: mutatePosition("staff:book:1", func(value *positionRecord) {
			value.capabilities[0] = wire.CatalogPositionCapabilityNameV1("catalogAdmin")
		})},
		{name: "staff key leading zero", mutate: mutatePosition("staff:book:1", func(value *positionRecord) { value.key = "staff:book:01" })},
		{name: "staff position ID mismatch", mutate: mutatePosition("staff:book:1", func(value *positionRecord) { value.positionID.Int64 = 2 })},
		{name: "staff categories absent", mutate: mutatePosition("staff:book:1", func(value *positionRecord) { value.categoriesJSON.Valid = false })},
		{name: "staff categories invalid JSON", mutate: mutatePosition("staff:book:1", func(value *positionRecord) { value.categoriesJSON.String = "{" })},
		{name: "staff categories duplicate", mutate: mutatePosition("staff:book:1", func(value *positionRecord) { value.categoriesJSON.String = `["creation","creation"]` })},
		{name: "staff status mismatch", mutate: mutatePosition("staff:book:1", func(value *positionRecord) { value.staffStatus.String = "hidden" })},
		{name: "staff has members", mutate: mutatePosition("staff:book:1", func(value *positionRecord) { value.members = []string{"staff:anime:2"} })},
		{name: "staff wrong rule kind", mutate: mutateRule("staff:book:1", func(value *ruleRecord) { value.kind = "exactCast" })},
		{name: "staff wrong rule key", mutate: mutateRule("staff:book:1", func(value *ruleRecord) { value.key = "select:staff:book:1" })},
		{name: "staff wrong rule value", mutate: mutateRule("staff:book:1", func(value *ruleRecord) { value.value = "2" })},
		{name: "cast on book", mutate: mutatePosition("cast:anime:main", func(value *positionRecord) { value.key = "cast:book:main"; value.subjectType = "book" })},
		{name: "cast has staff identity", mutate: mutatePosition("cast:anime:main", func(value *positionRecord) { value.positionID = sql.NullInt64{Int64: 2, Valid: true} })},
		{name: "cast has member", mutate: mutatePosition("cast:anime:main", func(value *positionRecord) { value.members = []string{"staff:anime:2"} })},
		{name: "cast wrong exclusive rule", mutate: mutateRule("cast:anime:main", func(value *ruleRecord) { value.key = "rule:cast:anime:main" })},
		{name: "cast main uses all value", mutate: mutateRule("cast:anime:main", func(value *ruleRecord) { value.value = "1..6" })},
		{name: "group key kind unknown", mutate: mutateGroup("fallback:book", func(value *groupRecord) { value.key = "legacy:book" })},
		{name: "group subject mismatch", mutate: mutateGroup("fallback:book", func(value *groupRecord) { value.subjectType = "anime" })},
		{name: "group dangling member", mutate: mutateGroup("fallback:book", func(value *groupRecord) { value.members[0] = "staff:book:999" })},
		{name: "group cross type member", mutate: mutateGroup("fallback:book", func(value *groupRecord) { value.members[0] = "staff:anime:2" })},
		{name: "group references hidden position", mutate: func(positions []*positionRecord, groups []*groupRecord, rules []ruleRecord) ([]*positionRecord, []*groupRecord, []ruleRecord) {
			findPosition(positions, "staff:book:1").selectable = 0
			findPosition(positions, "staff:book:1").staffStatus.String = "hidden"
			findPosition(positions, "staff:book:1").capabilities = nil
			return positions, groups, rules
		}},
		{name: "group display over JSON integer", mutate: mutateGroup("fallback:real", func(value *groupRecord) { value.displayOrder = maxJSONInteger + 1 })},
		{name: "missing rule", mutate: func(positions []*positionRecord, groups []*groupRecord, rules []ruleRecord) ([]*positionRecord, []*groupRecord, []ruleRecord) {
			return positions, groups, rules[:len(rules)-1]
		}},
		{name: "extra dangling rule", mutate: func(positions []*positionRecord, groups []*groupRecord, rules []ruleRecord) ([]*positionRecord, []*groupRecord, []ruleRecord) {
			return positions, groups, append(rules, ruleRecord{key: "rule:staff:real:999", positionKey: "staff:real:999", kind: "exactStaff", value: "999"})
		}},
		{name: "multiple rules for position", mutate: func(positions []*positionRecord, groups []*groupRecord, rules []ruleRecord) ([]*positionRecord, []*groupRecord, []ruleRecord) {
			rules[1].positionKey = rules[0].positionKey
			return positions, groups, rules
		}},
		{name: "position order drift", mutate: func(positions []*positionRecord, groups []*groupRecord, rules []ruleRecord) ([]*positionRecord, []*groupRecord, []ruleRecord) {
			positions[1], positions[2] = positions[2], positions[1]
			return positions, groups, rules
		}},
		{name: "group order drift", mutate: func(positions []*positionRecord, groups []*groupRecord, rules []ruleRecord) ([]*positionRecord, []*groupRecord, []ruleRecord) {
			groups[1], groups[2] = groups[2], groups[1]
			return positions, groups, rules
		}},
		{name: "staff set needs two members", synthetic: true, mutate: mutatePosition("staffset:anime:direction", func(value *positionRecord) { value.members = value.members[:1] })},
		{name: "staff set members unsorted", synthetic: true, mutate: mutatePosition("staffset:anime:direction", func(value *positionRecord) { slices.Reverse(value.members) })},
		{name: "staff set dangling member", synthetic: true, mutate: mutatePosition("staffset:anime:direction", func(value *positionRecord) { value.members[0] = "staff:anime:999" })},
		{name: "staff set cast member", synthetic: true, mutate: mutatePosition("staffset:anime:direction", func(value *positionRecord) { value.members[0] = "cast:anime:main" })},
		{name: "staff set wrong rule key", synthetic: true, mutate: mutateRule("staffset:anime:direction", func(value *ruleRecord) { value.key = "rule:staffset:anime:other" })},
		{name: "staff set wrong raw value", synthetic: true, mutate: mutateRule("staffset:anime:direction", func(value *ruleRecord) { value.value = "staff:anime:101|staff:anime:2" })},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			fixture := loadCatalogGolden(t, test.synthetic)
			positions, groups, rules := catalogRecordsFromWire(t, fixture.Expected.Body.Data)
			positions, groups, rules = test.mutate(positions, groups, rules)
			data, err := buildData(context.Background(), positions, groups, rules)
			if !errors.Is(err, ErrInvalidCatalog) {
				t.Fatalf("buildData error = %v, data = %+v", err, data)
			}
			if !reflect.ValueOf(data).IsZero() {
				t.Fatalf("corrupt catalog returned partial data: %+v", data)
			}
		})
	}
}

func TestBuildDataCancellationReturnsExactCauseAndNoPartialData(t *testing.T) {
	fixture := loadCatalogGolden(t, false)
	positions, groups, rules := catalogRecordsFromWire(t, fixture.Expected.Body.Data)
	cause := errors.New("catalog test mid-build cancellation")
	ctx := &catalogStepContext{remaining: 6, cause: cause}

	data, err := buildData(ctx, positions, groups, rules)
	if !errors.Is(err, cause) {
		t.Fatalf("buildData error = %v, want %v", err, cause)
	}
	if !reflect.ValueOf(data).IsZero() {
		t.Fatalf("canceled build returned partial data: %+v", data)
	}
}

func TestValidTextCountsUnicodeScalarsAndRejectsInvalidUTF8(t *testing.T) {
	if !validText(strings.Repeat("界", 86), 255) {
		t.Fatal("86 Chinese scalars were rejected by byte length")
	}
	if !validText(strings.Repeat("界", 255), 255) {
		t.Fatal("255 Unicode scalars were rejected")
	}
	if validText(strings.Repeat("界", 256), 255) {
		t.Fatal("256 Unicode scalars were accepted")
	}
	if validText(string([]byte{0xff}), 255) {
		t.Fatal("invalid UTF-8 was accepted")
	}
}

func assertDormantGoldenCoverage(t *testing.T, fixture catalogSuccessFixture) {
	t.Helper()
	data := fixture.Expected.Body.Data
	gotTypes := make([]string, 0, len(data.SubjectTypes))
	for _, subjectType := range data.SubjectTypes {
		gotTypes = append(gotTypes, string(subjectType.Key))
	}
	if !slices.Equal(gotTypes, []string{"book", "anime", "music", "game", "real"}) {
		t.Fatalf("subject types = %v", gotTypes)
	}
	if slices.Contains(fixture.Source.ArchiveCreditPositionKeys, "staff:anime:201") {
		t.Fatal("no-credit fixture unexpectedly credits staff:anime:201")
	}
	seenNoCredit := false
	official := make(map[int]bool)
	castScopes := make(map[string]bool)
	for _, position := range data.Positions {
		discriminator, err := position.Discriminator()
		if err != nil {
			t.Fatal(err)
		}
		switch discriminator {
		case "staff":
			value, err := position.AsCatalogStaffPositionV1()
			if err != nil {
				t.Fatal(err)
			}
			if value.Key == "staff:anime:201" {
				seenNoCredit = true
			}
			if value.PositionId >= 101 && value.PositionId <= 106 {
				official[value.PositionId] = true
			}
		case "cast":
			value, err := position.AsCatalogCastPositionV1()
			if err != nil {
				t.Fatal(err)
			}
			castScopes[value.Key+":"+string(value.RoleScope)] = true
		case "staffSet":
			t.Fatal("dormant golden unexpectedly contains a staff set")
		}
	}
	if !seenNoCredit || len(official) != 6 {
		t.Fatalf("dynamic coverage: noCredit=%v official101to106=%v", seenNoCredit, official)
	}
	for _, identity := range []string{
		"cast:anime:main:main", "cast:anime:all:all",
		"cast:game:main:main", "cast:game:all:all",
	} {
		if !castScopes[identity] {
			t.Fatalf("missing cast identity %q", identity)
		}
	}
}

func assertSyntheticGoldenCoverage(t *testing.T, data wire.CatalogDataV1) {
	t.Helper()
	for _, position := range data.Positions {
		if discriminator, _ := position.Discriminator(); discriminator == "staffSet" {
			value, err := position.AsCatalogStaffSetPositionV1()
			if err != nil {
				t.Fatal(err)
			}
			if value.Key != "staffset:anime:direction" ||
				len(value.Categories) != 0 ||
				!slices.Equal(value.MemberKeys, []string{"staff:anime:101", "staff:anime:2"}) ||
				!slices.Equal(value.Capabilities, []wire.CatalogPositionCapabilityNameV1{
					wire.CatalogPositionCapabilityNameV1Rankings,
					wire.CatalogPositionCapabilityNameV1Candidates,
					wire.CatalogPositionCapabilityNameV1PersonDetail,
					wire.CatalogPositionCapabilityNameV1Partners,
					wire.CatalogPositionCapabilityNameV1CoStar,
				}) {
				t.Fatalf("synthetic staff set = %+v", value)
			}
			return
		}
	}
	t.Fatal("synthetic golden did not project a staff set")
}

func loadCatalogGolden(t *testing.T, synthetic bool) catalogSuccessFixture {
	t.Helper()
	var fixture catalogSuccessFixture
	readCatalogJSON(t, "cases/success-empty.json", &fixture)
	if !synthetic {
		return fixture
	}
	var derived catalogDerivedFixture
	readCatalogJSON(t, "cases/success-synthetic.json", &derived)
	applied := 0
	for _, operation := range derived.Patch {
		if operation.Op != "add" {
			continue
		}
		switch {
		case strings.HasPrefix(operation.Path, "/expected/body/data/positions/"):
			var value wire.CatalogPositionV1
			mustUnmarshalCatalogJSON(t, operation.Value, &value)
			index := catalogPatchIndex(t, operation.Path)
			fixture.Expected.Body.Data.Positions = insertCatalogValue(fixture.Expected.Body.Data.Positions, index, value)
			applied++
		case strings.HasPrefix(operation.Path, "/expected/body/data/groups/"):
			var value wire.CatalogGroupV1
			mustUnmarshalCatalogJSON(t, operation.Value, &value)
			index := catalogPatchIndex(t, operation.Path)
			fixture.Expected.Body.Data.Groups = insertCatalogValue(fixture.Expected.Body.Data.Groups, index, value)
			applied++
		case strings.HasPrefix(operation.Path, "/expected/body/data/selectionRules/"):
			var value wire.CatalogSelectionRuleV1
			mustUnmarshalCatalogJSON(t, operation.Value, &value)
			index := catalogPatchIndex(t, operation.Path)
			fixture.Expected.Body.Data.SelectionRules = insertCatalogValue(fixture.Expected.Body.Data.SelectionRules, index, value)
			applied++
		}
	}
	if applied != 3 {
		t.Fatalf("synthetic golden data patches = %d, want 3", applied)
	}
	return fixture
}

func catalogRecordsFromWire(t *testing.T, data wire.CatalogDataV1) ([]*positionRecord, []*groupRecord, []ruleRecord) {
	t.Helper()
	ruleByPosition := make(map[string]wire.CatalogSelectionRuleV1, len(data.SelectionRules))
	for _, rule := range data.SelectionRules {
		ruleByPosition[rule.PositionKey] = rule
	}
	positions := make([]*positionRecord, 0, len(data.Positions))
	rules := make([]ruleRecord, 0, len(data.Positions))
	for _, union := range data.Positions {
		discriminator, err := union.Discriminator()
		if err != nil {
			t.Fatal(err)
		}
		record := new(positionRecord)
		switch discriminator {
		case "staff":
			value, err := union.AsCatalogStaffPositionV1()
			if err != nil {
				t.Fatal(err)
			}
			record.key, record.subjectType, record.kind, record.label =
				value.Key, string(value.SubjectType), "staff", value.Label
			record.nameCN = sql.NullString{String: value.Names.Cn, Valid: true}
			record.nameEN, record.nameJP = catalogNullString(value.Names.En), catalogNullString(value.Names.Jp)
			record.displayOrder = int64(value.DisplayOrder)
			record.selectable = catalogSelectable(string(value.Status))
			record.positionID = sql.NullInt64{Int64: int64(value.PositionId), Valid: true}
			record.categoriesJSON = sql.NullString{String: string(mustMarshalCatalogJSON(t, value.Categories)), Valid: true}
			record.staffStatus = sql.NullString{String: string(value.Status), Valid: true}
			record.capabilities = slices.Clone(value.Capabilities)
		case "cast":
			value, err := union.AsCatalogCastPositionV1()
			if err != nil {
				t.Fatal(err)
			}
			record.key, record.subjectType, record.kind, record.label =
				value.Key, string(value.SubjectType), "cast", value.Label
			record.nameCN = sql.NullString{String: value.Names.Cn, Valid: true}
			record.nameEN, record.nameJP = catalogNullString(value.Names.En), catalogNullString(value.Names.Jp)
			record.displayOrder = int64(value.DisplayOrder)
			record.selectable = catalogSelectable(string(value.Status))
			record.capabilities = slices.Clone(value.Capabilities)
		case "staffSet":
			value, err := union.AsCatalogStaffSetPositionV1()
			if err != nil {
				t.Fatal(err)
			}
			record.key, record.subjectType, record.kind, record.label =
				value.Key, string(value.SubjectType), "staffSet", value.Label
			record.nameCN = sql.NullString{String: value.Names.Cn, Valid: true}
			record.nameEN, record.nameJP = catalogNullString(value.Names.En), catalogNullString(value.Names.Jp)
			record.displayOrder = int64(value.DisplayOrder)
			record.selectable = catalogSelectable(string(value.Status))
			record.capabilities = slices.Clone(value.Capabilities)
			record.members = slices.Clone(value.MemberKeys)
		default:
			t.Fatalf("unknown golden position discriminator %q", discriminator)
		}
		expectedRule, ok := ruleByPosition[record.key]
		if !ok {
			t.Fatalf("golden position %q has no rule", record.key)
		}
		rawRule := ruleRecord{
			key: expectedRule.Key, positionKey: record.key,
			kind: string(expectedRule.Kind), value: expectedRule.Value,
		}
		if record.kind == "cast" {
			rawRule.key = "exclusive:cast:" + record.subjectType
		}
		if record.kind == "staffSet" {
			rawRule.value = record.key
		}
		positions = append(positions, record)
		rules = append(rules, rawRule)
	}
	groups := make([]*groupRecord, 0, len(data.Groups))
	for _, value := range data.Groups {
		groups = append(groups, &groupRecord{
			key: value.Key, subjectType: string(value.SubjectType), label: value.Label,
			displayOrder: int64(value.DisplayOrder), members: slices.Clone(value.PositionKeys),
		})
	}
	return positions, groups, rules
}

func mutatePosition(key string, mutation func(*positionRecord)) func([]*positionRecord, []*groupRecord, []ruleRecord) ([]*positionRecord, []*groupRecord, []ruleRecord) {
	return func(positions []*positionRecord, groups []*groupRecord, rules []ruleRecord) ([]*positionRecord, []*groupRecord, []ruleRecord) {
		mutation(findPosition(positions, key))
		return positions, groups, rules
	}
}

func mutateGroup(key string, mutation func(*groupRecord)) func([]*positionRecord, []*groupRecord, []ruleRecord) ([]*positionRecord, []*groupRecord, []ruleRecord) {
	return func(positions []*positionRecord, groups []*groupRecord, rules []ruleRecord) ([]*positionRecord, []*groupRecord, []ruleRecord) {
		for _, value := range groups {
			if value.key == key {
				mutation(value)
				return positions, groups, rules
			}
		}
		panic("missing test group " + key)
	}
}

func mutateRule(positionKey string, mutation func(*ruleRecord)) func([]*positionRecord, []*groupRecord, []ruleRecord) ([]*positionRecord, []*groupRecord, []ruleRecord) {
	return func(positions []*positionRecord, groups []*groupRecord, rules []ruleRecord) ([]*positionRecord, []*groupRecord, []ruleRecord) {
		for index := range rules {
			if rules[index].positionKey == positionKey {
				mutation(&rules[index])
				return positions, groups, rules
			}
		}
		panic("missing test rule " + positionKey)
	}
}

func findPosition(values []*positionRecord, key string) *positionRecord {
	for _, value := range values {
		if value.key == key {
			return value
		}
	}
	panic("missing test position " + key)
}

func readCatalogJSON(t *testing.T, relative string, destination any) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(catalogRepositoryRoot(t), "contracts", "goldens", "api", "catalog", filepath.FromSlash(relative)))
	if err != nil {
		t.Fatal(err)
	}
	mustUnmarshalCatalogJSON(t, data, destination)
}

func mustUnmarshalCatalogJSON(t *testing.T, data []byte, destination any) {
	t.Helper()
	if err := json.Unmarshal(data, destination); err != nil {
		t.Fatal(err)
	}
}

func mustMarshalCatalogJSON(t *testing.T, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func catalogRepositoryRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve catalog test source path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", "..", ".."))
}

func catalogPatchIndex(t *testing.T, path string) int {
	t.Helper()
	index, err := strconv.Atoi(path[strings.LastIndexByte(path, '/')+1:])
	if err != nil {
		t.Fatalf("patch path %q: %v", path, err)
	}
	return index
}

func insertCatalogValue[T any](values []T, index int, value T) []T {
	values = append(values, value)
	copy(values[index+1:], values[index:])
	values[index] = value
	return values
}

func catalogNullString(value *string) sql.NullString {
	if value == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: *value, Valid: true}
}

func catalogSelectable(status string) int64 {
	if status == "selectable" {
		return 1
	}
	return 0
}

func assertJSONEquivalent(t *testing.T, got, want any) {
	t.Helper()
	var gotValue, wantValue any
	mustUnmarshalCatalogJSON(t, mustMarshalCatalogJSON(t, got), &gotValue)
	mustUnmarshalCatalogJSON(t, mustMarshalCatalogJSON(t, want), &wantValue)
	if !reflect.DeepEqual(gotValue, wantValue) {
		t.Fatalf("JSON mismatch\n got: %s\nwant: %s", mustMarshalCatalogJSON(t, got), mustMarshalCatalogJSON(t, want))
	}
}

type catalogStepContext struct {
	remaining int
	cause     error
}

func (ctx *catalogStepContext) Deadline() (time.Time, bool) { return time.Time{}, false }
func (ctx *catalogStepContext) Done() <-chan struct{}       { return nil }
func (ctx *catalogStepContext) Value(any) any               { return nil }
func (ctx *catalogStepContext) Err() error {
	ctx.remaining--
	if ctx.remaining <= 0 {
		return ctx.cause
	}
	return nil
}
