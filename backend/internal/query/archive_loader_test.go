package query

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
)

func TestLoadFactSetAndEvaluatePublishedArchive(t *testing.T) {
	root := arrangeQueryArchive(t)
	before := treeInventory(t, root)

	var state archive.State
	if err := state.LoadCurrent(context.Background(), root); err != nil {
		t.Fatalf("LoadCurrent: %v", err)
	}
	t.Cleanup(func() {
		if err := state.Close(); err != nil {
			t.Errorf("close archive state: %v", err)
		}
	})
	store, ready := state.Current()
	if !ready {
		t.Fatal("archive is not ready")
	}

	facts, err := LoadFactSet(context.Background(), store, "anime")
	if err != nil {
		t.Fatalf("LoadFactSet: %v", err)
	}
	if len(facts.Subjects) != 4 ||
		len(facts.StaffCredits) != 2 ||
		len(facts.CastCredits) != 6 ||
		len(facts.Plans) != 5 {
		t.Fatalf("unexpected loaded fact counts: %+v", facts)
	}
	assertProducerSelectionPlans(t, facts.Plans)
	if len(facts.Subjects[0].RatingBuckets) != 1 || len(facts.Subjects[0].Tags) != 2 {
		t.Fatalf("subject joins not loaded: %+v", facts.Subjects[0])
	}

	rawQuery := []byte(`{
		"scope":"global",
		"subjectType":"anime",
		"positionKeys":["staff:anime:2"],
		"filters":{"subjectDate":{"min":"2024-01"}}
	}`)
	rawCatalog := []byte(`{"positions":[
		{"key":"staff:anime:2","subjectType":"anime","selectable":true},
		{"key":"cast:anime:main","subjectType":"anime","selectable":true}
	]}`)
	normalized, err := NormalizeJSON(rawQuery, rawCatalog)
	if err != nil {
		t.Fatalf("NormalizeJSON: %v", err)
	}
	collectionCalls := 0
	result, err := Evaluate(
		context.Background(),
		normalized,
		facts,
		CollectionSourceFunc(func(context.Context, string) (CollectionSnapshot, error) {
			collectionCalls++
			return CollectionSnapshot{}, errors.New("global evaluation accessed collection")
		}),
		nil,
	)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if collectionCalls != 0 || result.CollectionAccessCount != 0 {
		t.Fatalf("global collection access = %d/%d", collectionCalls, result.CollectionAccessCount)
	}
	if !slices.Equal(result.EligibleSubjectIDs, []int64{1}) ||
		len(result.PositionResults) != 1 ||
		!slices.Equal(result.PositionResults[0].CandidatePersonIDs, []int64{100}) ||
		!slices.Equal(result.ParticipatingSubjectIDs, []int64{1}) {
		t.Fatalf("unexpected Archive-backed result: %+v", result)
	}

	rows, err := store.QueryContext(context.Background(), "SELECT COUNT(*) FROM subject WHERE subject_type = ?", "anime")
	if err != nil {
		t.Fatalf("Store remains usable: %v", err)
	}
	defer rows.Close()
	if !rows.Next() {
		t.Fatal("Store verification query returned no row")
	}
	var count int
	if err := rows.Scan(&count); err != nil || count != 4 {
		t.Fatalf("Store verification count = %d, err = %v", count, err)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("Store verification rows: %v", err)
	}

	after := treeInventory(t, root)
	if !slices.Equal(before, after) {
		t.Fatalf("query created or removed Archive files\nbefore=%v\nafter=%v", before, after)
	}
}

func TestLoadFactSetCancellationPublishesNothingAndStoreRemainsUsable(t *testing.T) {
	root := arrangeQueryArchive(t)
	var state archive.State
	if err := state.LoadCurrent(context.Background(), root); err != nil {
		t.Fatalf("LoadCurrent: %v", err)
	}
	t.Cleanup(func() { _ = state.Close() })
	store, ready := state.Current()
	if !ready {
		t.Fatal("archive is not ready")
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	facts, err := LoadFactSet(ctx, store, "anime")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("LoadFactSet cancellation error = %v", err)
	}
	if len(facts.Subjects) != 0 ||
		len(facts.StaffCredits) != 0 ||
		len(facts.CastCredits) != 0 ||
		len(facts.Plans) != 0 {
		t.Fatalf("canceled loader returned partial facts: %+v", facts)
	}

	rows, err := store.QueryContext(context.Background(), "SELECT subject_id FROM subject WHERE subject_type = ? ORDER BY subject_id", "anime")
	if err != nil {
		t.Fatalf("Store after cancellation: %v", err)
	}
	defer rows.Close()
	if !rows.Next() {
		t.Fatal("Store after cancellation returned no rows")
	}
}

func TestLoadFactSetStopsDuringArchiveSubjectScanWithContextCause(t *testing.T) {
	root := arrangeQueryArchive(t)
	var state archive.State
	if err := state.LoadCurrent(context.Background(), root); err != nil {
		t.Fatalf("LoadCurrent: %v", err)
	}
	t.Cleanup(func() { _ = state.Close() })
	store, ready := state.Current()
	if !ready {
		t.Fatal("archive is not ready")
	}

	cause := errors.New("test subject scan canceled")
	ctx, cancel := context.WithCancelCause(context.Background())
	facts, err := loadFactSet(ctx, store, "anime", loadFactSetHooks{
		afterSubject: func(scanned int) {
			if scanned == 2 {
				cancel(cause)
			}
		},
	})
	if !errors.Is(err, cause) {
		t.Fatalf("subject-scan cancellation error = %v, want %v", err, cause)
	}
	if len(facts.Subjects) != 0 ||
		len(facts.StaffCredits) != 0 ||
		len(facts.CastCredits) != 0 ||
		len(facts.Plans) != 0 {
		t.Fatalf("subject-scan cancellation returned partial facts: %+v", facts)
	}

	rows, err := store.QueryContext(context.Background(), "SELECT COUNT(*) FROM subject WHERE subject_type = ?", "anime")
	if err != nil {
		t.Fatalf("Store after subject-scan cancellation: %v", err)
	}
	defer rows.Close()
	if !rows.Next() {
		t.Fatal("Store after subject-scan cancellation returned no rows")
	}
}

func TestSelectionRuleParsingRejectsUntypedOrAmbiguousValues(t *testing.T) {
	tests := []struct {
		name    string
		ruleKey string
		key     string
		kind    string
		value   string
		valid   bool
	}{
		{name: "staff", ruleKey: "rule:staff:anime:2", key: "staff:anime:2", kind: "exactStaff", value: "2", valid: true},
		{name: "staff legacy prefix", ruleKey: "rule:staff:anime:2", key: "staff:anime:2", kind: "exactStaff", value: "positionId=2"},
		{name: "staff mismatched value", ruleKey: "rule:staff:anime:2", key: "staff:anime:2", kind: "exactStaff", value: "3"},
		{name: "staff mismatched rule key", ruleKey: "select:staff:anime:2", key: "staff:anime:2", kind: "exactStaff", value: "2"},
		{name: "staff leading zero", ruleKey: "rule:staff:anime:02", key: "staff:anime:02", kind: "exactStaff", value: "02"},
		{name: "cast main", ruleKey: "exclusive:cast:anime", key: "cast:anime:main", kind: "exactCast", value: "1", valid: true},
		{name: "cast all", ruleKey: "exclusive:cast:anime", key: "cast:anime:all", kind: "exactCast", value: "1..6", valid: true},
		{name: "cast legacy prefix", ruleKey: "exclusive:cast:anime", key: "cast:anime:main", kind: "exactCast", value: "roleType=1"},
		{name: "cast mismatched scope", ruleKey: "exclusive:cast:anime", key: "cast:anime:main", kind: "exactCast", value: "1..6"},
		{name: "cast mismatched rule key", ruleKey: "rule:cast:anime:main", key: "cast:anime:main", kind: "exactCast", value: "1"},
		{
			name:    "staff set",
			ruleKey: "rule:staffset:anime:director-family",
			key:     "staffset:anime:director-family",
			kind:    "staffSetUnion",
			value:   "staffset:anime:director-family",
			valid:   true,
		},
		{
			name:    "staff set legacy prefix",
			ruleKey: "rule:staffset:anime:director-family",
			key:     "staffset:anime:director-family",
			kind:    "staffSetUnion",
			value:   "staffSetUnion:staffset:anime:director-family",
		},
		{
			name:    "staff set mismatched identity",
			ruleKey: "rule:staffset:anime:director-family",
			key:     "staffset:anime:director-family",
			kind:    "staffSetUnion",
			value:   "staffset:anime:other",
		},
		{
			name:    "staff set mismatched rule key",
			ruleKey: "rule:staffset:anime:other",
			key:     "staffset:anime:director-family",
			kind:    "staffSetUnion",
			value:   "staffset:anime:director-family",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			_, err := parseSelectionPlan(test.ruleKey, test.key, test.kind, test.value)
			if test.valid && err != nil {
				t.Fatalf("parseSelectionPlan: %v", err)
			}
			if !test.valid && err == nil {
				t.Fatal("parseSelectionPlan accepted invalid rule")
			}
		})
	}
}

func TestArchiveExternalErrorsPreferExactContextCause(t *testing.T) {
	cause := errors.New("test exact loader cause")
	ctx, cancel := context.WithCancelCause(context.Background())
	cancel(cause)
	if got := contextualExternalError(ctx, "query subjects", context.Canceled); !errors.Is(got, cause) {
		t.Fatalf("contextualExternalError = %v, want %v", got, cause)
	}
}

func arrangeQueryArchive(t *testing.T) string {
	t.Helper()
	bundle := filepath.Join(
		queryRepositoryRoot(t),
		"contracts",
		"goldens",
		"archive",
		"valid",
		"minimal",
	)
	pointerData, err := os.ReadFile(filepath.Join(bundle, "current-pointer.json"))
	if err != nil {
		t.Fatal(err)
	}
	var pointer struct {
		DataVersion string `json:"dataVersion"`
	}
	if err := json.Unmarshal(pointerData, &pointer); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	versionRoot := filepath.Join(root, "versions", pointer.DataVersion)
	if err := os.MkdirAll(versionRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "current.json"), pointerData, 0o644); err != nil {
		t.Fatal(err)
	}
	copyQueryTestFile(t, filepath.Join(bundle, "archive-manifest.json"), filepath.Join(versionRoot, "manifest.json"))
	copyQueryTestFile(t, filepath.Join(bundle, "bangumi.sqlite"), filepath.Join(versionRoot, "bangumi.sqlite"))
	rewriteQueryArchiveWithProducerCatalog(t, root, versionRoot)
	return root
}

func rewriteQueryArchiveWithProducerCatalog(t *testing.T, root, versionRoot string) {
	t.Helper()
	sqlitePath := filepath.Join(versionRoot, "bangumi.sqlite")
	database, err := sql.Open("sqlite", sqlitePath)
	if err != nil {
		t.Fatal(err)
	}
	database.SetMaxOpenConns(1)
	if _, err := database.Exec("PRAGMA foreign_keys = ON"); err != nil {
		_ = database.Close()
		t.Fatal(err)
	}
	transaction, err := database.Begin()
	if err != nil {
		_ = database.Close()
		t.Fatal(err)
	}
	statements := []string{
		`UPDATE catalog_selection_rule
		    SET rule_key = 'rule:staff:anime:2', rule_value = '2'
		  WHERE position_key = 'staff:anime:2'`,
		`UPDATE catalog_selection_rule
		    SET rule_key = 'exclusive:cast:anime', rule_value = '1'
		  WHERE position_key = 'cast:anime:main'`,
		`INSERT INTO catalog_selection_rule(rule_key, position_key, rule_kind, rule_value)
		 VALUES ('exclusive:cast:anime', 'cast:anime:all', 'exactCast', '1..6')`,
		`DELETE FROM catalog_position_member
		  WHERE position_key = 'cast:anime:all'`,
		`INSERT INTO staff_position(
		     subject_type, position_id, name_cn, name_en, name_jp,
		     categories, sort_order, status, common_commit
		 )
		 VALUES (
		     'anime', 74, '总导演', 'Chief Director', NULL,
		     '["production"]', 20, 'selectable',
		     '6a8442c17143a870357a5ff812362e8b5cfe9f9d'
		 )`,
		`INSERT INTO catalog_position(
		     position_key, subject_type, position_kind, label,
		     name_cn, name_en, name_jp, display_order, selectable
		 )
		 VALUES (
		     'staff:anime:74', 'anime', 'staff', '总导演',
		     '总导演', 'Chief Director', NULL, 15, 1
		 )`,
		`INSERT INTO catalog_selection_rule(rule_key, position_key, rule_kind, rule_value)
		 VALUES ('rule:staff:anime:74', 'staff:anime:74', 'exactStaff', '74')`,
		`INSERT INTO staff_set(set_key, subject_type, label, sort_order)
		 VALUES ('staffset:anime:director-family', 'anime', '导演类', 30)`,
		`INSERT INTO staff_set_member(set_key, subject_type, position_id)
		 VALUES
		     ('staffset:anime:director-family', 'anime', 2),
		     ('staffset:anime:director-family', 'anime', 74)`,
		`INSERT INTO catalog_position(
		     position_key, subject_type, position_kind, label,
		     name_cn, name_en, name_jp, display_order, selectable
		 )
		 VALUES (
		     'staffset:anime:director-family', 'anime', 'staffSet', '导演类',
		     '导演类', NULL, NULL, 30, 1
		 )`,
		`INSERT INTO catalog_position_member(position_key, member_key)
		 VALUES
		     ('staffset:anime:director-family', 'staff:anime:2'),
		     ('staffset:anime:director-family', 'staff:anime:74')`,
		`INSERT INTO catalog_selection_rule(rule_key, position_key, rule_kind, rule_value)
		 VALUES (
		     'rule:staffset:anime:director-family',
		     'staffset:anime:director-family',
		     'staffSetUnion',
		     'staffset:anime:director-family'
		 )`,
		`INSERT INTO catalog_capability(position_key, capability, supported)
		 VALUES
		     ('staff:anime:74', 'rankings', 1),
		     ('staff:anime:74', 'candidates', 1),
		     ('staffset:anime:director-family', 'rankings', 1),
		     ('staffset:anime:director-family', 'candidates', 1)`,
		`INSERT INTO catalog_group(group_key, subject_type, label, display_order)
		 VALUES ('shortcut:anime:featured', 'anime', '常用职位', 10)`,
		`UPDATE catalog_group_member
		    SET group_key = 'shortcut:anime:featured'
		  WHERE group_key = 'featured:anime'`,
		`DELETE FROM catalog_group WHERE group_key = 'featured:anime'`,
		`INSERT INTO catalog_group(group_key, subject_type, label, display_order)
		 VALUES ('custom:anime:staff-sets', 'anime', '人工职位集合', 20)`,
		`INSERT INTO catalog_group_member(group_key, position_key, display_order)
		 VALUES (
		     'custom:anime:staff-sets',
		     'staffset:anime:director-family',
		     10
		 )`,
	}
	for _, statement := range statements {
		if _, err := transaction.Exec(statement); err != nil {
			_ = transaction.Rollback()
			_ = database.Close()
			t.Fatalf("prepare producer catalog Archive: %v", err)
		}
	}
	if err := transaction.Commit(); err != nil {
		_ = database.Close()
		t.Fatal(err)
	}

	manifestPath := filepath.Join(versionRoot, "manifest.json")
	manifestData, err := os.ReadFile(manifestPath)
	if err != nil {
		_ = database.Close()
		t.Fatal(err)
	}
	var manifest map[string]json.RawMessage
	if err := json.Unmarshal(manifestData, &manifest); err != nil {
		_ = database.Close()
		t.Fatal(err)
	}
	var tableCounts map[string]int64
	if err := json.Unmarshal(manifest["tableCounts"], &tableCounts); err != nil {
		_ = database.Close()
		t.Fatal(err)
	}
	for table := range tableCounts {
		var count int64
		if err := database.QueryRow(fmt.Sprintf(`SELECT COUNT(*) FROM "%s"`, table)).
			Scan(&count); err != nil {
			_ = database.Close()
			t.Fatalf("count %s: %v", table, err)
		}
		tableCounts[table] = count
	}
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}

	sqliteData, err := os.ReadFile(sqlitePath)
	if err != nil {
		t.Fatal(err)
	}
	sqliteSize, err := json.Marshal(int64(len(sqliteData)))
	if err != nil {
		t.Fatal(err)
	}
	sqliteDigest, err := json.Marshal(queryTestDigest(sqliteData))
	if err != nil {
		t.Fatal(err)
	}
	countData, err := json.Marshal(tableCounts)
	if err != nil {
		t.Fatal(err)
	}
	manifest["sqliteSize"] = sqliteSize
	manifest["sqliteDigest"] = sqliteDigest
	manifest["tableCounts"] = countData
	manifestData, err = json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	manifestData = append(manifestData, '\n')
	if err := os.WriteFile(manifestPath, manifestData, 0o644); err != nil {
		t.Fatal(err)
	}

	pointerPath := filepath.Join(root, "current.json")
	pointerData, err := os.ReadFile(pointerPath)
	if err != nil {
		t.Fatal(err)
	}
	var pointer map[string]json.RawMessage
	if err := json.Unmarshal(pointerData, &pointer); err != nil {
		t.Fatal(err)
	}
	manifestDigest, err := json.Marshal(queryTestDigest(manifestData))
	if err != nil {
		t.Fatal(err)
	}
	pointer["manifestDigest"] = manifestDigest
	pointerData, err = json.MarshalIndent(pointer, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	pointerData = append(pointerData, '\n')
	if err := os.WriteFile(pointerPath, pointerData, 0o644); err != nil {
		t.Fatal(err)
	}
}

func queryTestDigest(value []byte) string {
	sum := sha256.Sum256(value)
	return fmt.Sprintf("sha256:%x", sum)
}

func assertProducerSelectionPlans(t *testing.T, plans []SelectionPlan) {
	t.Helper()
	byKey := make(map[string]SelectionPlan, len(plans))
	for _, plan := range plans {
		byKey[plan.PositionKey] = plan
	}
	if plan := byKey["staff:anime:2"]; plan.RuleKind != "exactStaff" || plan.PositionID != 2 {
		t.Fatalf("exactStaff producer plan = %+v", plan)
	}
	if plan := byKey["staff:anime:74"]; plan.RuleKind != "exactStaff" || plan.PositionID != 74 {
		t.Fatalf("second exactStaff producer plan = %+v", plan)
	}
	if plan := byKey["cast:anime:main"]; plan.RuleKind != "exactCast" ||
		!slices.Equal(plan.RoleTypes, []int64{1}) {
		t.Fatalf("main exactCast producer plan = %+v", plan)
	}
	if plan := byKey["cast:anime:all"]; plan.RuleKind != "exactCast" ||
		!slices.Equal(plan.RoleTypes, []int64{1, 2, 3, 4, 5, 6}) {
		t.Fatalf("all exactCast producer plan = %+v", plan)
	}
	if plan := byKey["staffset:anime:director-family"]; plan.RuleKind != "staffSetUnion" ||
		!slices.Equal(plan.MemberPositionKeys, []string{"staff:anime:2", "staff:anime:74"}) {
		t.Fatalf("staffSetUnion producer plan = %+v", plan)
	}
}

func copyQueryTestFile(t *testing.T, source, destination string) {
	t.Helper()
	input, err := os.Open(source)
	if err != nil {
		t.Fatal(err)
	}
	defer input.Close()
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.Copy(output, input); err != nil {
		_ = output.Close()
		t.Fatal(err)
	}
	if err := output.Close(); err != nil {
		t.Fatal(err)
	}
}

func treeInventory(t *testing.T, root string) []string {
	t.Helper()
	result := make([]string, 0)
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		result = append(result, relative)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	slices.Sort(result)
	return result
}
