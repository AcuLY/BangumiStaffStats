package query

import (
	"context"
	"encoding/json"
	"slices"
	"testing"
)

func TestOperationPositionsPreserveQueryAndExactCastEvidence(t *testing.T) {
	keys := []string{"staff:anime:2", "staff:anime:3", "cast:anime:main", "cast:anime:all"}
	catalog := CatalogContext{}
	supported := map[string]bool{}
	for _, key := range keys {
		catalog.Positions = append(catalog.Positions, CatalogPosition{Key: key, SubjectType: "anime", Selectable: true})
		supported[key] = true
	}
	catalog.Positions = append(catalog.Positions, CatalogPosition{Key: "staff:game:2", SubjectType: "game", Selectable: true}, CatalogPosition{Key: "staff:anime:9", SubjectType: "anime", Selectable: false})
	supported["staff:game:2"] = true
	supported["staff:anime:9"] = true
	raw := json.RawMessage(`{"scope":"global","subjectType":"anime","positionKeys":["cast:anime:main"]}`)
	normalized, err := Normalize(raw, catalog)
	if err != nil {
		t.Fatal(err)
	}
	browse := OperationPositions(normalized.Effective, catalog, supported, "all", true)
	if !slices.Equal(browse, []string{"cast:anime:all", "staff:anime:2", "staff:anime:3"}) {
		t.Fatalf("browse = %v", browse)
	}
	evaluated := OperationEvaluation(normalized, append(browse, "cast:anime:main"))
	if !slices.Equal(normalized.Effective.PositionKeys, []string{"cast:anime:main"}) || evaluated.Digest != normalized.Digest {
		t.Fatal("applied query mutated")
	}
	facts := FactSet{Subjects: []Subject{{SubjectID: 1, SubjectType: "anime"}, {SubjectID: 2, SubjectType: "anime"}}, Plans: []SelectionPlan{
		{PositionKey: "staff:anime:2", RuleKind: "exactStaff", PositionID: 2}, {PositionKey: "staff:anime:3", RuleKind: "exactStaff", PositionID: 3},
		{PositionKey: "cast:anime:main", RuleKind: "exactCast", RoleTypes: []int64{1}}, {PositionKey: "cast:anime:all", RuleKind: "exactCast", RoleTypes: []int64{1, 2}},
	}, CastCredits: []CastCredit{{SubjectID: 1, PersonID: 10, CharacterID: 100, RoleType: 1, SortOrder: 1}, {SubjectID: 2, PersonID: 10, CharacterID: 100, RoleType: 2, SortOrder: 1}, {SubjectID: 1, PersonID: 11, CharacterID: 101, RoleType: 2, SortOrder: 2}}, StaffCredits: []StaffCredit{{SubjectID: 1, PersonID: 20, PositionID: 2}, {SubjectID: 1, PersonID: 21, PositionID: 3}}}
	result, err := Evaluate(context.Background(), evaluated, facts, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range result.PositionResults {
		if p.PositionKey == "cast:anime:main" && (len(p.Contributions) != 1 || p.Contributions[0].SubjectID != 1) {
			t.Fatalf("source main widened: %+v", p)
		}
		if p.PositionKey == "cast:anime:all" && len(p.Contributions) != 3 {
			t.Fatalf("all cast omitted supporting evidence: %+v", p)
		}
	}
	// The public query exclusivity remains unchanged.
	_, err = Normalize(json.RawMessage(`{"scope":"global","subjectType":"anime","positionKeys":["cast:anime:main","cast:anime:all"]}`), catalog)
	if err == nil {
		t.Fatal("public query accepted conflicting selectors")
	}
}

func TestOperationScopeNormalizesAndRejectsUnknownValues(t *testing.T) {
	for _, raw := range []string{`{}`, `{"positionScope":"query"}`} {
		scope, err := OperationPositionScope(json.RawMessage(raw))
		if err != nil || scope != "" {
			t.Fatalf("%s: %q %v", raw, scope, err)
		}
	}
	for _, raw := range []string{`{"positionScope":null}`, `{"positionScope":"unknown"}`, `{"positionScope":true}`} {
		if _, err := OperationPositionScope(json.RawMessage(raw)); err == nil {
			t.Fatal(raw)
		}
	}
}

func TestAllPositionNormalizationAdmitsOnlyExplicitEmptyArray(t *testing.T) {
	catalog := CatalogContext{Positions: []CatalogPosition{{Key: "staff:anime:2", SubjectType: "anime", Selectable: true}}}
	raw := []byte(`{"scope":"personal","uid":" lucay126 ","collectionStatuses":["in_progress","completed"],"subjectType":"anime","positionKeys":[],"includeNSFW":true,"filters":{"globalScore":{"min":6.5}}}`)
	normalized, err := NormalizeOperation(raw, catalog, "all")
	if err != nil {
		t.Fatal(err)
	}
	if normalized.Effective.PositionKeys == nil || len(normalized.Effective.PositionKeys) != 0 || normalized.Effective.UID != "lucay126" || !normalized.Effective.IncludeNSFW || normalized.Effective.Filters.GlobalScore.Min.String() != "6.5" {
		t.Fatalf("all query changed filters or invented positions: %+v", normalized.Effective)
	}
	var projected map[string]json.RawMessage
	if err := json.Unmarshal(normalized.Canonical, &projected); err != nil || string(projected["positionKeys"]) != "[]" {
		t.Fatalf("empty positions must remain a JSON array: %s, %v", normalized.Canonical, err)
	}
	if _, err := Normalize(raw, catalog); err == nil {
		t.Fatal("ordinary shared query accepted empty positions")
	}
	for _, scope := range []string{"", "query", "unknown"} {
		if _, err := NormalizeOperation(raw, catalog, scope); err == nil {
			t.Fatalf("scope %q accepted empty positions", scope)
		}
	}
	for _, invalid := range []string{
		`{"scope":"global","subjectType":"anime"}`,
		`{"scope":"global","subjectType":"anime","positionKeys":null}`,
		`{"scope":"global","subjectType":"anime","positionKeys":[],"uid":"hidden"}`,
		`{"scope":"global","subjectType":"anime","positionKeys":[],"filters":{"globalScore":{"min":11}}}`,
		`{"scope":"global","subjectType":"anime","positionKeys":["staff:game:2"]}`,
	} {
		if _, err := NormalizeOperation([]byte(invalid), catalog, "all"); err == nil {
			t.Fatalf("all scope weakened validation: %s", invalid)
		}
	}
	nonempty := []byte(`{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}`)
	ordinary, err := Normalize(nonempty, catalog)
	if err != nil {
		t.Fatal(err)
	}
	all, err := NormalizeOperation(nonempty, catalog, "all")
	if err != nil || all.Digest != ordinary.Digest || string(all.Canonical) != string(ordinary.Canonical) {
		t.Fatalf("nonempty normalization drift: %+v %v", all, err)
	}
}
