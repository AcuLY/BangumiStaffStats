package statistics

import (
	"context"
	"errors"
	"fmt"
	"math"
	"reflect"
	"strings"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

func candidateMetricsFixture(t *testing.T) EvaluationRequest {
	t.Helper()
	score := func(v float64) *float64 { return &v }
	version := "dv1-" + strings.Repeat("a", 64)
	subjects := []query.Subject{
		{SubjectID: 1, SubjectType: "anime", GlobalScore: score(8.239)},
		{SubjectID: 2, SubjectType: "anime", GlobalScore: score(7.999)},
		{SubjectID: 3, SubjectType: "anime", GlobalScore: score(1)},
		{SubjectID: 4, SubjectType: "anime", GlobalScore: score(3.337)},
		{SubjectID: 5, SubjectType: "anime", GlobalScore: score(0)},
		{SubjectID: 6, SubjectType: "anime"},
	}
	seriesSubjects := make([]SeriesSubject, len(subjects))
	for i, subject := range subjects {
		seriesSubjects[i] = SeriesSubject{SubjectID: subject.SubjectID, SubjectType: subject.SubjectType}
	}
	series, err := BuildSeriesIndex(context.Background(), version, seriesSubjects, []Relation{
		{SourceID: 1, SourceType: "anime", TargetID: 2, TargetType: "anime", RelationID: 2},
		{SourceID: 2, SourceType: "anime", TargetID: 3, TargetType: "anime", RelationID: 2},
	})
	if err != nil {
		t.Fatal(err)
	}
	return EvaluationRequest{
		DataVersion: version, Series: series,
		Facts: query.FactSet{Subjects: subjects},
		Result: query.Result{
			QueryDigest:    "q1:candidates",
			EffectiveQuery: query.EffectiveQuery{Scope: "global", SubjectType: "anime"},
			RankingPeople: []query.PersonSubjects{
				{PersonID: 2, SubjectIDs: []int64{5, 6}},
				{PersonID: 1, SubjectIDs: []int64{4, 2, 1, 2, 5, 6}},
				{PersonID: 3, SubjectIDs: []int64{1, 4}},
			},
			PositionResults: []query.PositionResult{
				{Contributions: []query.Contribution{{PositionKey: "staff:anime:2", Kind: "staff", SubjectID: 1, PersonID: 1}}},
				{Contributions: []query.Contribution{{PositionKey: "staff:anime:3", Kind: "staff", SubjectID: 1, PersonID: 1}}},
			},
		},
		PersonalEntries: []query.CollectionEntry{
			{SubjectID: 1, PersonalScore: score(9.997)},
			{SubjectID: 2, PersonalScore: score(4.666)},
			{SubjectID: 3, PersonalScore: score(1)},
			{SubjectID: 4, PersonalScore: score(7.777)},
			{SubjectID: 5, PersonalScore: score(0)},
		},
	}
}

func TestCandidateMetricsMatchesCompleteEvaluation(t *testing.T) {
	for _, scope := range []string{"global", "personal"} {
		for _, merge := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/series=%t", scope, merge), func(t *testing.T) {
				request := candidateMetricsFixture(t)
				request.Result.EffectiveQuery.Scope = scope
				request.Result.EffectiveQuery.MergeSeries = merge
				full, err := Evaluate(context.Background(), request)
				if err != nil {
					t.Fatal(err)
				}
				got, err := EvaluateCandidateMetrics(context.Background(), request)
				if err != nil {
					t.Fatal(err)
				}
				want := &CandidateEvaluation{UnitKind: full.UnitKind, People: make([]CandidateMetrics, 0, len(full.People))}
				for _, person := range full.People {
					metrics := CandidateMetrics{PersonID: person.PersonID, WorkCount: len(person.Units),
						GlobalAverage: person.Global.AverageHundredths, GlobalRatedCount: person.Global.RatedUnitCount}
					if person.Personal != nil {
						metrics.PersonalAverage = person.Personal.AverageHundredths
						metrics.PersonalRatedCount = person.Personal.RatedUnitCount
					}
					want.People = append(want.People, metrics)
				}
				if !reflect.DeepEqual(got, want) {
					t.Fatalf("compact = %+v; full = %+v", got, want)
				}
				if *got.People[0].GlobalAverage != map[bool]int64{false: 651, true: 572}[merge] {
					t.Fatalf("normalization/actual participation changed: %+v", got.People[0])
				}
			})
		}
	}
}

func TestCandidateMetricsRejectsInvalidInputWithoutPartialResult(t *testing.T) {
	for _, tc := range []struct {
		name string
		edit func(*EvaluationRequest)
		code Code
	}{
		{"version", func(r *EvaluationRequest) { r.DataVersion = "invalid" }, CodeInputInvalid},
		{"digest", func(r *EvaluationRequest) { r.Result.QueryDigest = "" }, CodeInputInvalid},
		{"scope", func(r *EvaluationRequest) { r.Result.EffectiveQuery.Scope = "invalid" }, CodeInputInvalid},
		{"series missing", func(r *EvaluationRequest) { r.Result.EffectiveQuery.MergeSeries = true; r.Series = nil }, CodeVersionMismatch},
		{"series version", func(r *EvaluationRequest) {
			r.Result.EffectiveQuery.MergeSeries = true
			r.DataVersion = "dv1-" + strings.Repeat("b", 64)
		}, CodeVersionMismatch},
		{"personal series missing", func(r *EvaluationRequest) { r.Result.EffectiveQuery.Scope = "personal"; r.Series = nil }, CodeVersionMismatch},
		{"duplicate fact", func(r *EvaluationRequest) { r.Facts.Subjects = append(r.Facts.Subjects, r.Facts.Subjects[0]) }, CodeInputInvalid},
		{"missing subject", func(r *EvaluationRequest) { r.Result.RankingPeople[1].SubjectIDs = []int64{99} }, CodeInputInvalid},
		{"wrong subject type", func(r *EvaluationRequest) { r.Facts.Subjects[0].SubjectType = "book" }, CodeInputInvalid},
		{"invalid score", func(r *EvaluationRequest) { v := math.NaN(); r.Facts.Subjects[0].GlobalScore = &v }, CodeScoreInvalid},
		{"duplicate personal", func(r *EvaluationRequest) {
			r.Result.EffectiveQuery.Scope = "personal"
			r.PersonalEntries = append(r.PersonalEntries, r.PersonalEntries[0])
		}, CodeInputInvalid},
	} {
		t.Run(tc.name, func(t *testing.T) {
			request := candidateMetricsFixture(t)
			tc.edit(&request)
			got, err := EvaluateCandidateMetrics(context.Background(), request)
			code, _ := ErrorCode(err)
			if got != nil || code != tc.code {
				t.Fatalf("result = %+v, error = %v; want %s", got, err, tc.code)
			}
		})
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	got, err := EvaluateCandidateMetrics(ctx, candidateMetricsFixture(t))
	if got != nil || !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled result = %+v, error = %v", got, err)
	}
}
