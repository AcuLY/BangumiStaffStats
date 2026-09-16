package query

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"
)

func TestUnrestrictedNormalization(t *testing.T) {
	for _, typ := range []string{"book", "anime", "music", "game", "real"} {
		raw := []byte(`{"scope":"personal","uid":"alice","subjectType":"` + typ + `","positionScope":"all","positionKeys":[],"collectionStatuses":["dropped","wish","completed","wish","on_hold","in_progress"]}`)
		n, err := Normalize(raw, CatalogContext{Positions: []CatalogPosition{{Key: "staff:anime:1", SubjectType: "anime", Selectable: true}}})
		if err != nil {
			t.Fatal(err)
		}
		var fields map[string]any
		b, _ := json.Marshal(n.Effective)
		json.Unmarshal(b, &fields)
		if fields["positionScope"] != "all" || !reflect.DeepEqual(n.Effective.CollectionStatuses, []string{"wish", "completed", "in_progress", "on_hold", "dropped"}) {
			t.Fatalf("%s", b)
		}
		if _, err = Normalize(b, CatalogContext{Positions: []CatalogPosition{{Key: "staff:anime:1", SubjectType: "anime", Selectable: true}}}); err != nil {
			t.Fatal(err)
		}
	}
	for _, extra := range []string{`"positionScope":null,"positionKeys":[]`, `"positionScope":"query","positionKeys":[]`, `"positionScope":"all"`, `"positionScope":"all","positionKeys":null`, `"positionScope":"all","positionKeys":["staff:anime:1"]`, `"positionKeys":[]`} {
		if _, err := Normalize([]byte(`{"scope":"global","subjectType":"anime",`+extra+`}`), CatalogContext{Positions: []CatalogPosition{{Key: "staff:anime:1", SubjectType: "anime", Selectable: true}}}); err == nil {
			t.Fatalf("accepted %s", extra)
		}
	}
}
func TestUnrestrictedUnionAndExplicitNarrowing(t *testing.T) {
	n, err := Normalize([]byte(`{"scope":"global","subjectType":"anime","positionScope":"all","positionKeys":[]}`), CatalogContext{Positions: []CatalogPosition{{Key: "staff:anime:1", SubjectType: "anime", Selectable: true}}})
	if err != nil {
		t.Fatal(err)
	}
	facts := FactSet{Subjects: []Subject{{SubjectID: 1, SubjectType: "anime"}, {SubjectID: 2, SubjectType: "anime"}, {SubjectID: 3, SubjectType: "game"}, {SubjectID: 4, SubjectType: "anime", NSFW: true}}, StaffCredits: []StaffCredit{{1, 10, 1}, {1, 10, 1}, {1, 10, 999}, {2, 10, 999}, {1, 20, 1}, {3, 30, 1}, {4, 40, 1}}, CastCredits: []CastCredit{{1, 10, 100, 1, 0}, {1, 10, 100, 2, 0}, {1, 10, 100, 2, 0}, {2, 50, 101, 6, 0}, {2, 60, 102, 7, 0}}, Plans: []SelectionPlan{{PositionKey: "staff:anime:1", RuleKind: "exactStaff", PositionID: 1}, {PositionKey: "cast:anime:main", RuleKind: "exactCast", RoleTypes: []int64{1}}}}
	r, err := Evaluate(context.Background(), n, facts, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	want := []PersonSubjects{{10, []int64{1, 2}}, {20, []int64{1}}, {50, []int64{2}}}
	if !reflect.DeepEqual(r.RankingPeople, want) {
		t.Fatalf("people=%+v", r.RankingPeople)
	}
	count := 0
	for _, p := range r.PositionResults {
		count += len(p.Contributions)
	}
	if count != 7 {
		t.Fatalf("evidence=%d want 7", count)
	}
	narrowed := OperationEvaluation(n, []string{"cast:anime:main"})
	r, err = Evaluate(context.Background(), narrowed, facts, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(r.RankingPeople, []PersonSubjects{{10, []int64{1}}}) || r.QueryDigest != n.Digest {
		t.Fatalf("narrow=%+v", r)
	}
}
