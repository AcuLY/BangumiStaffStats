package statistics

import (
	"context"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"strings"
	"testing"
)

func TestUnrestrictedWishWorksNotZeroRatings(t *testing.T) {
	for _, typ := range []string{"book", "anime", "music", "game", "real"} {
		ctx := context.Background()
		dv := "dv1-" + strings.Repeat("a", 64)
		n, err := query.Normalize([]byte(`{"scope":"personal","uid":"alice","subjectType":"`+typ+`","positionScope":"all","positionKeys":[],"collectionStatuses":["wish"]}`), query.CatalogContext{Positions: []query.CatalogPosition{{Key: "staff:anime:1", SubjectType: "anime", Selectable: true}}})
		if err != nil {
			t.Fatal(err)
		}
		facts := query.FactSet{Subjects: []query.Subject{{SubjectID: 1, SubjectType: typ}, {SubjectID: 2, SubjectType: typ}}, StaffCredits: []query.StaffCredit{{SubjectID: 1, PersonID: 1, PositionID: 999}, {SubjectID: 2, PersonID: 1, PositionID: 999}}}
		if typ == "anime" || typ == "game" {
			facts.CastCredits = []query.CastCredit{{SubjectID: 1, PersonID: 1, CharacterID: 1, RoleType: 6}}
		}
		entries := []query.CollectionEntry{{SubjectID: 1, Status: "wish"}, {SubjectID: 2, Status: "wish"}}
		q, err := query.Evaluate(ctx, n, facts, query.CollectionSourceFunc(func(context.Context, string) (query.CollectionSnapshot, error) {
			return query.CollectionSnapshot{UID: "alice", Entries: entries}, nil
		}), nil)
		if err != nil {
			t.Fatal(err)
		}
		index, err := BuildSeriesIndex(ctx, dv, []SeriesSubject{{SubjectID: 1, SubjectType: typ}, {SubjectID: 2, SubjectType: typ}}, nil)
		if err != nil {
			t.Fatal(err)
		}
		got, err := Evaluate(ctx, EvaluationRequest{DataVersion: dv, Result: *q, Facts: facts, PersonalEntries: entries, Series: index})
		if err != nil {
			t.Fatal(err)
		}
		if len(got.People) != 1 || len(got.People[0].Units) != 2 || got.People[0].Personal.RatedUnitCount != 0 || got.People[0].Personal.AverageHundredths != nil {
			t.Fatalf("%+v", got)
		}
		if got.CastApplicable != (typ == "anime" || typ == "game") {
			t.Fatalf("%s cast applicable=%v", typ, got.CastApplicable)
		}
	}
}
