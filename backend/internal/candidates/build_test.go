package candidates

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"reflect"
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

func TestBuildAllPositionsUnionsPeopleWorksAndIdentityOrder(t *testing.T) {
	request := independentBuildRequest()
	request.PositionKey = ""

	core, err := Build(context.Background(), request)
	if err != nil {
		t.Fatalf("Build all: %v", err)
	}
	if core.PositionKey != "" || len(core.Rows) != 3 {
		t.Fatalf("all core = %+v", core)
	}
	if !slices.Equal(core.Rows[1].PositionKeys, []string{
		"staff:anime:2",
		"staff:anime:74",
	}) || core.Rows[1].Person.ID != 2 || core.Rows[1].WorkCount != 1 {
		t.Fatalf("overlapping person = %+v", core.Rows[1])
	}
	if !slices.Equal(core.Rows[0].PositionKeys, []string{"staff:anime:2"}) ||
		!slices.Equal(core.Rows[2].PositionKeys, []string{"staff:anime:74"}) {
		t.Fatalf("identity order = %+v", core.Rows)
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

func TestAllPositionProjectionPreservesMoreThanSixteenPositions(t *testing.T) {
	fixture, err := os.ReadFile("../../../contracts/goldens/api/candidates/cases/many-positions.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Cases []struct {
			Request  struct{ Query json.RawMessage }
			Expected struct{ Body json.RawMessage }
		}
	}
	if err = json.Unmarshal(fixture, &corpus); err != nil {
		t.Fatal(err)
	}
	catalog := query.CatalogContext{}
	capabilities := map[string]bool{}
	facts := query.FactSet{Subjects: []query.Subject{{SubjectID: 1, SubjectType: "anime"}}}
	for id := int64(1); id <= 33; id++ {
		key := fmt.Sprintf("staff:anime:%d", id)
		catalog.Positions = append(catalog.Positions, query.CatalogPosition{Key: key, SubjectType: "anime", Selectable: true})
		capabilities[key] = true
		facts.Plans = append(facts.Plans, query.SelectionPlan{PositionKey: key, RuleKind: "exactStaff", PositionID: id})
		facts.StaffCredits = append(facts.StaffCredits, query.StaffCredit{SubjectID: 1, PersonID: 1, PositionID: id})
	}
	normalized, err := query.Normalize(corpus.Cases[0].Request.Query, catalog)
	if err != nil {
		t.Fatal(err)
	}
	keys := query.OperationPositions(normalized.Effective, catalog, capabilities, "all", true)
	evaluated := query.OperationEvaluation(normalized, keys)
	result, err := query.Evaluate(context.Background(), evaluated, facts, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	core, err := Build(context.Background(), BuildRequest{DataVersion: testDataVersion, Query: *result, Facts: facts, People: []PersonReference{{ID: 1, Name: "Many Roles"}}})
	if err != nil {
		t.Fatal(err)
	}
	view, err := NormalizeView("global", nil)
	if err != nil {
		t.Fatal(err)
	}
	page, err := Project(context.Background(), core, view)
	if err != nil {
		t.Fatal(err)
	}
	projection, err := NewProjection(page, testDataVersion, "global", nil)
	if err != nil {
		t.Fatal(err)
	}
	actual, err := projection.MarshalEnvelope("req-candidates-many-positions")
	if err != nil {
		t.Fatal(err)
	}
	var got, want any
	if err = json.Unmarshal(actual, &got); err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(corpus.Cases[0].Expected.Body, &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("all-position response differs from schema-validated golden: %s", actual)
	}
}

func TestCandidateGroupFilteringUsesExactWorksAndRetainsFullIdentityMetrics(t *testing.T) {
	ctx := context.Background()
	request := independentBuildRequest()
	request.PositionKey = ""
	// A: X,Y; B: X,Z; C: Y,Z. Only A and B share X with the entire AB group.
	request.Facts.StaffCredits = []query.StaffCredit{
		{SubjectID: 101, PersonID: 1, PositionID: 2}, {SubjectID: 102, PersonID: 1, PositionID: 2},
		{SubjectID: 101, PersonID: 2, PositionID: 2}, {SubjectID: 103, PersonID: 2, PositionID: 2},
		{SubjectID: 102, PersonID: 3, PositionID: 2}, {SubjectID: 103, PersonID: 3, PositionID: 2},
		// A's other identity does not touch X and must not be returned for AB.
		{SubjectID: 102, PersonID: 1, PositionID: 74},
	}
	normalized := query.NormalizedQuery{Effective: request.Query.EffectiveQuery, Digest: request.Query.QueryDigest}
	groups := []struct {
		name   string
		people []query.ParticipantPerson
		want   []int64
		keys   []string
	}{
		{"A", []query.ParticipantPerson{{PersonID: 1, PositionKeys: []string{"staff:anime:2"}}}, []int64{1, 2, 3}, []string{"staff:anime:2", "staff:anime:74"}},
		{"AB", []query.ParticipantPerson{{PersonID: 1, PositionKeys: []string{"staff:anime:2"}}, {PersonID: 2, PositionKeys: []string{"staff:anime:2"}}}, []int64{1, 2}, []string{"staff:anime:2"}},
		{"ABC", []query.ParticipantPerson{{PersonID: 1, PositionKeys: []string{"staff:anime:2"}}, {PersonID: 2, PositionKeys: []string{"staff:anime:2"}}, {PersonID: 3, PositionKeys: []string{"staff:anime:2"}}}, nil, nil},
		{"missing identity", []query.ParticipantPerson{{PersonID: 2, PositionKeys: []string{"staff:anime:74"}}}, nil, nil},
		{"union", []query.ParticipantPerson{{PersonID: 1, PositionKeys: []string{"staff:anime:74", "staff:anime:2"}}, {PersonID: 2, PositionKeys: []string{"staff:anime:2"}}}, []int64{1, 2}, []string{"staff:anime:2"}},
	}
	for _, tc := range groups {
		t.Run(tc.name, func(t *testing.T) {
			result, err := query.Evaluate(ctx, normalized, request.Facts, nil, []query.ParticipantRequest{{RequestID: "test", People: tc.people}})
			if err != nil {
				t.Fatal(err)
			}
			before, _ := json.Marshal(result)
			request.Query = *result
			request.CommonSubjects = append([]int64{}, result.ParticipantSets[0].SubjectIDs...)
			for _, merge := range []bool{false, true} {
				request.Query.EffectiveQuery.MergeSeries = merge
				if merge {
					request.Series, err = statistics.BuildSeriesIndex(ctx, testDataVersion, []statistics.SeriesSubject{{SubjectID: 101, SubjectType: "anime"}, {SubjectID: 102, SubjectType: "anime"}, {SubjectID: 103, SubjectType: "anime"}}, nil)
					if err != nil {
						t.Fatal(err)
					}
				}
				core, err := Build(ctx, request)
				if err != nil {
					t.Fatal(err)
				}
				ids := []int64{}
				for _, row := range core.Rows {
					ids = append(ids, row.Person.ID)
					if row.WorkCount != 2 {
						t.Fatalf("full metrics lost: %+v", row)
					}
				}
				if !slices.Equal(ids, tc.want) {
					t.Fatalf("rows %v want %v", ids, tc.want)
				}
				if len(core.Rows) > 0 && !slices.Equal(core.Rows[0].PositionKeys, tc.keys) {
					t.Fatalf("identities %+v", core.Rows[0])
				}
				if core.PositionCounts[0].Count != len(tc.want) {
					t.Fatalf("counts %+v", core.PositionCounts)
				}
			}
			after, _ := json.Marshal(result)
			if string(before) != string(after) {
				t.Fatal("query mutated")
			}
		})
	}
}

func TestCandidateExactIdentityFilteringBeforeSeriesAndWithoutMainBrowseLeak(t *testing.T) {
	ctx := context.Background()
	request := independentBuildRequest()
	request.PositionKey = ""
	request.Query.EffectiveQuery.PositionKeys = []string{"cast:anime:all"}
	request.Query.EffectiveQuery.MergeSeries = true
	request.Facts.Plans = []query.SelectionPlan{{PositionKey: "cast:anime:all", RuleKind: "exactCast", RoleTypes: []int64{1, 2, 3}}, {PositionKey: "cast:anime:main", RuleKind: "exactCast", RoleTypes: []int64{1}}}
	request.Facts.CastCredits = []query.CastCredit{{SubjectID: 101, PersonID: 1, CharacterID: 11, RoleType: 1}, {SubjectID: 102, PersonID: 1, CharacterID: 12, RoleType: 2}, {SubjectID: 102, PersonID: 2, CharacterID: 12, RoleType: 1}, {SubjectID: 101, PersonID: 3, CharacterID: 11, RoleType: 1}}
	var err error
	request.Series, err = statistics.BuildSeriesIndex(ctx, testDataVersion, []statistics.SeriesSubject{{SubjectID: 101, SubjectType: "anime"}, {SubjectID: 102, SubjectType: "anime"}, {SubjectID: 103, SubjectType: "anime"}}, []statistics.Relation{{SourceID: 101, SourceType: "anime", TargetID: 102, TargetType: "anime", RelationID: 2}})
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"cast:anime:main", "cast:anime:all"} {
		result, err := query.Evaluate(ctx, query.NormalizedQuery{Effective: request.Query.EffectiveQuery, Digest: "q1:test"}, request.Facts, nil, []query.ParticipantRequest{{RequestID: "selected", People: []query.ParticipantPerson{{PersonID: 1, PositionKeys: []string{key}}}}})
		if err != nil {
			t.Fatal(err)
		}
		request.Query = *result
		request.CommonSubjects = append([]int64{}, result.ParticipantSets[0].SubjectIDs...)
		core, err := Build(ctx, request)
		if err != nil {
			t.Fatal(err)
		}
		want := []int64{1, 3}
		if key == "cast:anime:all" {
			want = []int64{1, 2, 3}
		}
		ids := []int64{}
		for _, row := range core.Rows {
			ids = append(ids, row.Person.ID)
			if !slices.Equal(row.PositionKeys, []string{"cast:anime:all"}) {
				t.Fatalf("main leaked into browse %+v", row)
			}
		}
		if !slices.Equal(ids, want) {
			t.Fatalf("%s candidates %v want %v", key, ids, want)
		}
		if len(core.PositionCounts) != 1 || core.PositionCounts[0].Count != len(want) {
			t.Fatalf("browse counts %+v", core.PositionCounts)
		}
	}
}
