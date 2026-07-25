package statistics

import (
	"context"
	"reflect"
	"strings"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

func TestBuildSummaryDeduplicatesAttribution(t *testing.T) {
	order := int64(0)
	duplicate := query.Contribution{
		PositionKey: "staff:anime:2",
		Kind:        "staff", SubjectID: 10, PersonID: 1, PositionID: 2,
	}
	summary, err := BuildSummary(context.Background(), UnitSubject, []PersonEvidence{
		{
			PersonID: 1,
			Units: []Unit{
				{Kind: UnitSubject, UnitID: 10, CompleteMemberIDs: []int64{10}, MatchedMemberIDs: []int64{10}, Contributions: []query.Contribution{duplicate, duplicate}},
				{Kind: UnitSubject, UnitID: 20, CompleteMemberIDs: []int64{20}, MatchedMemberIDs: []int64{20}, Contributions: []query.Contribution{{
					PositionKey: "cast:anime:main", Kind: "cast", SubjectID: 20,
					PersonID: 1, CharacterID: 500, RoleType: 1, SortOrder: &order,
				}}},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if summary.PersonCount != 1 || summary.WorkCount != 2 ||
		summary.CharacterCount == nil || *summary.CharacterCount != 1 ||
		!reflect.DeepEqual(summary.UnitIDs, []int64{10, 20}) ||
		len(summary.Attributions) != 2 {
		t.Fatalf("summary = %+v", summary)
	}
}

func TestBuildSummaryApplicableCastWithNoAttributionReportsZero(t *testing.T) {
	summary, err := BuildSummary(context.Background(), UnitSubject, []PersonEvidence{{
		PersonID:        1,
		HasCastIdentity: true,
		Units: []Unit{{
			Kind: UnitSubject, UnitID: 10,
			CompleteMemberIDs: []int64{10}, MatchedMemberIDs: []int64{10},
		}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if summary.CharacterCount == nil || *summary.CharacterCount != 0 {
		t.Fatalf("applicable empty cast count = %v, want pointer to zero", summary.CharacterCount)
	}
}

func TestEvaluationUsesSelectedCastApplicabilityWithoutMatches(t *testing.T) {
	result, err := Evaluate(context.Background(), EvaluationRequest{
		DataVersion: "dv1-" + strings.Repeat("5", 64),
		Result: query.Result{
			QueryDigest: "q1:empty-cast",
			EffectiveQuery: query.EffectiveQuery{
				Scope:        "global",
				SubjectType:  "anime",
				PositionKeys: []string{"cast:anime:main"},
			},
		},
		Facts: query.FactSet{Plans: []query.SelectionPlan{{
			PositionKey: "cast:anime:main",
			RuleKind:    "exactCast",
			RoleTypes:   []int64{1},
		}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !result.CastApplicable ||
		result.Summary.CharacterCount == nil ||
		*result.Summary.CharacterCount != 0 {
		t.Fatalf("empty selected cast evaluation = %+v", result)
	}
}
