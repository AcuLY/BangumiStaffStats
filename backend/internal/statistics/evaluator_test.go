package statistics

import (
	"context"
	"strings"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

func TestEvaluateSeriesUsesActualParticipationAndEqualUnits(t *testing.T) {
	score := func(value float64) *float64 { return &value }
	index, err := BuildSeriesIndex(
		context.Background(),
		"dv1-"+strings.Repeat("c", 64),
		[]SeriesSubject{
			{SubjectID: 10, SubjectType: "anime"},
			{SubjectID: 11, SubjectType: "anime"},
			{SubjectID: 12, SubjectType: "anime"},
			{SubjectID: 20, SubjectType: "anime"},
			{SubjectID: 21, SubjectType: "anime"},
		},
		[]Relation{
			{SourceID: 10, SourceType: "anime", TargetID: 11, TargetType: "anime", RelationID: 2},
			{SourceID: 11, SourceType: "anime", TargetID: 12, TargetType: "anime", RelationID: 2},
			{SourceID: 20, SourceType: "anime", TargetID: 21, TargetType: "anime", RelationID: 2},
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	result, err := Evaluate(context.Background(), EvaluationRequest{
		DataVersion: "dv1-" + strings.Repeat("c", 64),
		Result: query.Result{
			QueryDigest: "q1:test",
			EffectiveQuery: query.EffectiveQuery{
				Scope: "global", SubjectType: "anime", MergeSeries: true,
			},
			RankingPeople: []query.PersonSubjects{{
				PersonID: 1, SubjectIDs: []int64{10, 11, 20, 21},
			}},
		},
		Facts: query.FactSet{Subjects: []query.Subject{
			{SubjectID: 10, SubjectType: "anime", GlobalScore: score(10)},
			{SubjectID: 11, SubjectType: "anime", GlobalScore: score(8)},
			{SubjectID: 12, SubjectType: "anime", GlobalScore: score(1)},
			{SubjectID: 20, SubjectType: "anime", GlobalScore: score(3)},
			{SubjectID: 21, SubjectType: "anime"},
		}},
		Series: index,
	})
	if err != nil {
		t.Fatal(err)
	}
	person := result.People[0]
	if len(person.Units) != 2 ||
		person.Global.AverageHundredths == nil || *person.Global.AverageHundredths != 600 ||
		person.Global.OverallHundredths == nil || *person.Global.OverallHundredths != 529 {
		t.Fatalf("evaluation = %+v", result)
	}
	if len(person.Units[0].CompleteMemberIDs) != 3 ||
		len(person.Units[0].MatchedMemberIDs) != 2 {
		t.Fatalf("member evidence = %+v", person.Units[0])
	}
}
