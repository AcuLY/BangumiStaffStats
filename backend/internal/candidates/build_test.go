package candidates

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

const testDataVersion = "dv1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func TestBuildUsesIndependentPositionMembership(t *testing.T) {
	request := independentBuildRequest()
	request.Query.RankingPeople = []query.PersonSubjects{{
		PersonID:   2,
		SubjectIDs: []int64{102},
	}}
	request.PositionKey = "staff:anime:74"

	core, err := Build(context.Background(), request)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if !slices.Equal(core.PositionCounts, []PositionCount{
		{PositionKey: "staff:anime:2", Count: 2},
		{PositionKey: "staff:anime:74", Count: 2},
	}) {
		t.Fatalf("position counts = %+v", core.PositionCounts)
	}
	if len(core.Rows) != 2 ||
		core.Rows[0].Person.ID != 2 ||
		core.Rows[1].Person.ID != 3 {
		t.Fatalf("independent rows = %+v", core.Rows)
	}
	if core.Rows[1].GlobalAverage != nil {
		t.Fatalf("missing global average = %v", *core.Rows[1].GlobalAverage)
	}
}

func TestBuildSeriesCountsParticipatingSeries(t *testing.T) {
	request := independentBuildRequest()
	request.Query.EffectiveQuery.PositionKeys = []string{"staff:anime:2"}
	request.Query.EffectiveQuery.MergeSeries = true
	request.Query.PositionResults = request.Query.PositionResults[:1]
	request.Query.PositionResults[0].CandidatePersonIDs = []int64{1}
	request.Query.PositionResults[0].Contributions = []query.Contribution{
		{
			PositionKey: "staff:anime:2",
			Kind:        "staff",
			SubjectID:   101,
			PersonID:    1,
			PositionID:  2,
		},
		{
			PositionKey: "staff:anime:2",
			Kind:        "staff",
			SubjectID:   102,
			PersonID:    1,
			PositionID:  2,
		},
	}
	request.PositionKey = "staff:anime:2"
	series, err := statistics.BuildSeriesIndex(
		context.Background(),
		testDataVersion,
		[]statistics.SeriesSubject{
			{SubjectID: 101, SubjectType: "anime"},
			{SubjectID: 102, SubjectType: "anime"},
			{SubjectID: 103, SubjectType: "anime"},
		},
		[]statistics.Relation{{
			SourceID:   101,
			SourceType: "anime",
			TargetID:   102,
			TargetType: "anime",
			RelationID: 2,
		}},
	)
	if err != nil {
		t.Fatalf("BuildSeriesIndex: %v", err)
	}
	request.Series = series

	core, err := Build(context.Background(), request)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if core.WorkUnit != statistics.UnitSeries ||
		len(core.Rows) != 1 ||
		core.Rows[0].WorkCount != 1 {
		t.Fatalf("series core = %+v", core)
	}
}

func TestBuildValidatesCurrentPositionAndReferences(t *testing.T) {
	request := independentBuildRequest()
	request.PositionKey = "staff:anime:999"
	_, err := Build(context.Background(), request)
	var candidateError *Error
	if !errors.As(err, &candidateError) ||
		candidateError.Code() != CodeFieldInvalid ||
		candidateError.Path() != "/input/positionKey" {
		t.Fatalf("unknown position error = %v", err)
	}

	request = independentBuildRequest()
	request.PositionKey = "staff:anime:74"
	request.People = request.People[:2]
	_, err = Build(context.Background(), request)
	if code, ok := ErrorCode(err); !ok || code != CodePersonReferenceMissing {
		t.Fatalf("missing reference error = %v, code=%q, ok=%v", err, code, ok)
	}
}

func TestBuildHonorsCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := Build(ctx, independentBuildRequest())
	if code, ok := ErrorCode(err); !ok || code != CodeCanceled ||
		!errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation = %v, code=%q, ok=%v", err, code, ok)
	}
}

func TestBuildGlobalIgnoresPersonalCollectionEvidence(t *testing.T) {
	request := independentBuildRequest()
	request.PositionKey = "staff:anime:2"
	request.PersonalEntries = []query.CollectionEntry{{
		SubjectID: -1,
		Status:    "invalid",
	}}
	if _, err := Build(context.Background(), request); err != nil {
		t.Fatalf("global build inspected personal evidence: %v", err)
	}
}

func independentBuildRequest() BuildRequest {
	scoreEight := 8.0
	scoreSix := 6.0
	return BuildRequest{
		DataVersion: testDataVersion,
		Query: query.Result{
			EffectiveQuery: query.EffectiveQuery{
				Scope:        "global",
				SubjectType:  "anime",
				PositionKeys: []string{"staff:anime:2", "staff:anime:74"},
			},
			QueryDigest:        "q1:test",
			EligibleSubjectIDs: []int64{101, 102, 103},
			PositionResults: []query.PositionResult{
				{
					PositionKey:         "staff:anime:2",
					CandidatePersonIDs:  []int64{1, 2},
					CandidateSubjectIDs: []int64{101, 102},
					Contributions: []query.Contribution{
						{
							PositionKey: "staff:anime:2",
							Kind:        "staff",
							SubjectID:   101,
							PersonID:    1,
							PositionID:  2,
						},
						{
							PositionKey: "staff:anime:2",
							Kind:        "staff",
							SubjectID:   102,
							PersonID:    2,
							PositionID:  2,
						},
					},
				},
				{
					PositionKey:         "staff:anime:74",
					CandidatePersonIDs:  []int64{2, 3},
					CandidateSubjectIDs: []int64{102, 103},
					Contributions: []query.Contribution{
						{
							PositionKey: "staff:anime:74",
							Kind:        "staff",
							SubjectID:   102,
							PersonID:    2,
							PositionID:  74,
						},
						{
							PositionKey: "staff:anime:74",
							Kind:        "staff",
							SubjectID:   103,
							PersonID:    3,
							PositionID:  74,
						},
					},
				},
			},
		},
		Facts: query.FactSet{
			Subjects: []query.Subject{
				testSubject(101, &scoreEight),
				testSubject(102, &scoreSix),
				testSubject(103, nil),
			},
			Plans: []query.SelectionPlan{
				{
					PositionKey: "staff:anime:2",
					RuleKind:    "exactStaff",
					PositionID:  2,
				},
				{
					PositionKey: "staff:anime:74",
					RuleKind:    "exactStaff",
					PositionID:  74,
				},
			},
		},
		PositionKey: "staff:anime:2",
		People: []PersonReference{
			{ID: 1, Name: "One"},
			{ID: 2, Name: "Two"},
			{ID: 3, Name: "Three"},
		},
	}
}

func testSubject(id int64, score *float64) query.Subject {
	buckets := make([]query.RatingBucket, 10)
	for index := range buckets {
		buckets[index] = query.RatingBucket{
			Rating: int64(index + 1),
			Count:  1,
		}
	}
	if score == nil {
		for index := range buckets {
			buckets[index].Count = 0
		}
	}
	return query.Subject{
		SubjectID:     id,
		SubjectType:   "anime",
		GlobalScore:   score,
		RatingBuckets: buckets,
	}
}
