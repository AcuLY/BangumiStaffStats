package costar

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

const testDataVersion = "dv1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const testQueryDigest = "q1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

func TestBuildGroupKeepsPairwiseMatrixWhenAllPersonIntersectionIsEmpty(t *testing.T) {
	request := groupBuildRequest(t, "personal")
	core, err := Build(context.Background(), request)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if core.Kind != "group" ||
		core.Summary.CommonWorkCount != 0 ||
		core.Summary.UnionWorkCount != 3 ||
		len(core.Works) != 0 ||
		len(core.Ratings) != 0 ||
		len(core.Matrix) != 3 {
		t.Fatalf("group core = %+v", core)
	}
	for _, pair := range core.Matrix {
		if pair.Metrics.WorkCount != 1 {
			t.Fatalf("matrix pair = %+v", pair)
		}
	}
	if core.Preference == nil ||
		core.Preference.Mean != nil ||
		core.Preference.Score != nil ||
		core.Preference.EvidenceWeight != (statistics.Rational{
			Numerator: "0", Denominator: "1",
		}) {
		t.Fatalf("zero preference = %+v", core.Preference)
	}
	if core.Tags.Personal == nil ||
		len(core.Tags.Meta) != 0 ||
		len(core.Tags.Community) != 0 ||
		len(core.Tags.Personal) != 0 {
		t.Fatalf("empty tags = %+v", core.Tags)
	}
}

func TestBuildIntersectsRawSubjectsBeforeSeriesAggregation(t *testing.T) {
	request := pairBuildRequest(t, true)
	request.Query.PositionResults[0].Contributions[0].SubjectID = 101
	request.Query.PositionResults[1].Contributions[0].SubjectID = 102
	request.Facts.Subjects = []query.Subject{
		testSubject(101, 8),
		testSubject(102, 7),
	}
	request.Evidence.Subjects = []SubjectReference{
		{ID: 101, Name: "First"},
		{ID: 102, Name: "Sequel"},
	}
	series, err := statistics.BuildSeriesIndex(
		context.Background(),
		testDataVersion,
		[]statistics.SeriesSubject{
			{SubjectID: 101, SubjectType: "anime"},
			{SubjectID: 102, SubjectType: "anime"},
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
		core.Summary.UnionWorkCount != 1 ||
		core.Summary.CommonWorkCount != 0 ||
		len(core.Works) != 0 {
		t.Fatalf("series raw intersection = %+v", core.Summary)
	}
}

func TestBuildPairPreservesExactStaffsetAndCastProvenance(t *testing.T) {
	request := pairBuildRequest(t, false)
	core, err := Build(context.Background(), request)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if core.Kind != "pair" ||
		len(core.Matrix) != 0 ||
		len(core.Works) != 1 ||
		len(core.Ratings) != 3 {
		t.Fatalf("pair core = %+v", core)
	}
	work := core.Works[0]
	if work.Subject == nil || len(work.Subject.Participants) != 2 {
		t.Fatalf("subject work = %+v", work)
	}
	first := work.Subject.Participants[0]
	if first.WorkCount != nil ||
		len(first.Credits) != 1 ||
		first.Credits[0].Staff == nil ||
		first.Credits[0].Staff.PositionKey != "staffset:anime:creative" ||
		first.Credits[0].Staff.ExactPositionKey != "staff:anime:3" {
		t.Fatalf("staffset credit = %+v", first)
	}
	second := work.Subject.Participants[1]
	if len(second.Credits) != 1 ||
		second.Credits[0].Cast == nil ||
		second.Credits[0].Cast.Character.ID == nil ||
		*second.Credits[0].Cast.Character.ID != 201 {
		t.Fatalf("cast credit = %+v", second)
	}
}

func TestBuildRejectsIdentityThatDoesNotReallyMatchParticipant(t *testing.T) {
	request := pairBuildRequest(t, false)
	request.Input.Participants[1].PersonID = 99
	_, err := Build(context.Background(), request)
	var failure *Error
	if !errors.As(err, &failure) ||
		failure.Path() != "/input/participants/1/positionKeys/0" ||
		failure.FieldCode() != string(CodePositionNotFound) {
		t.Fatalf("identity mismatch = %#v", err)
	}
}

func TestRequiredArchiveReferencesAreBoundedToParticipantsAndNeededEntities(t *testing.T) {
	request := pairBuildRequest(t, false)
	request.Query.PositionResults[0].Contributions = append(
		request.Query.PositionResults[0].Contributions,
		query.Contribution{
			PositionKey: "staffset:anime:creative",
			Kind:        "staff",
			SubjectID:   999,
			PersonID:    88,
			PositionID:  3,
		},
	)
	people, subjects, characters, err := RequiredArchiveReferenceIDs(
		request.Query,
		request.Input,
		request.Series,
	)
	if err != nil {
		t.Fatalf("RequiredArchiveReferenceIDs: %v", err)
	}
	if !slices.Equal(people, []int64{1, 2}) ||
		!slices.Equal(subjects, []int64{101}) ||
		!slices.Equal(characters, []int64{201}) {
		t.Fatalf(
			"references people=%v subjects=%v characters=%v",
			people,
			subjects,
			characters,
		)
	}
}

func TestBuildRejectsMissingArchiveSubjectReference(t *testing.T) {
	request := pairBuildRequest(t, false)
	request.Evidence.Subjects = nil
	_, err := Build(context.Background(), request)
	failure, found := ErrorDetails(err)
	if !found ||
		failure.Code() != CodeReferenceMissing ||
		!failure.Retryable() {
		t.Fatalf("missing Archive reference = %#v", err)
	}
}

func pairBuildRequest(t *testing.T, mergeSeries bool) BuildRequest {
	t.Helper()
	result := query.Result{
		EffectiveQuery: query.EffectiveQuery{
			Scope:        "global",
			SubjectType:  "anime",
			PositionKeys: []string{"staffset:anime:creative", "cast:anime:main"},
			MergeSeries:  mergeSeries,
		},
		QueryDigest: testQueryDigest,
		PositionResults: []query.PositionResult{
			{
				PositionKey: "staffset:anime:creative",
				Contributions: []query.Contribution{{
					PositionKey:       "staffset:anime:creative",
					MemberPositionKey: "staff:anime:3",
					Kind:              "staff",
					SubjectID:         101,
					PersonID:          1,
					PositionID:        3,
				}},
			},
			{
				PositionKey: "cast:anime:main",
				Contributions: []query.Contribution{{
					PositionKey: "cast:anime:main",
					Kind:        "cast",
					SubjectID:   101,
					PersonID:    2,
					CharacterID: 201,
					RoleType:    1,
				}},
			},
		},
	}
	request := BuildRequest{
		DataVersion: testDataVersion,
		Query:       result,
		Facts: query.FactSet{
			Subjects: []query.Subject{testSubject(101, 8)},
			Plans: []query.SelectionPlan{
				{
					PositionKey:        "staffset:anime:creative",
					RuleKind:           "staffSetUnion",
					MemberPositionKeys: []string{"staff:anime:3"},
				},
				{
					PositionKey: "cast:anime:main",
					RuleKind:    "exactCast",
					RoleTypes:   []int64{1},
				},
			},
		},
		Input: Input{Participants: []ParticipantInput{
			{PersonID: 1, PositionKeys: []string{"staffset:anime:creative"}},
			{PersonID: 2, PositionKeys: []string{"cast:anime:main"}},
		}},
		Evidence: ArchiveEvidence{
			People: []PersonReference{
				{ID: 1, Name: "First"},
				{ID: 2, Name: "Second"},
			},
			Subjects: []SubjectReference{{ID: 101, Name: "Shared"}},
			Characters: []CharacterReference{{
				Key:  "character:201",
				ID:   int64Pointer(201),
				Name: "Role",
			}},
		},
	}
	if mergeSeries {
		series, err := statistics.BuildSeriesIndex(
			context.Background(),
			testDataVersion,
			[]statistics.SeriesSubject{{SubjectID: 101, SubjectType: "anime"}},
			nil,
		)
		if err != nil {
			t.Fatalf("BuildSeriesIndex: %v", err)
		}
		request.Series = series
	}
	return request
}

func groupBuildRequest(t *testing.T, scope string) BuildRequest {
	t.Helper()
	keys := []string{"staff:anime:1", "staff:anime:2", "staff:anime:3"}
	result := query.Result{
		EffectiveQuery: query.EffectiveQuery{
			Scope:        scope,
			SubjectType:  "anime",
			PositionKeys: keys,
		},
		QueryDigest: testQueryDigest,
		PositionResults: []query.PositionResult{
			{
				PositionKey: keys[0],
				Contributions: []query.Contribution{
					testContribution(keys[0], 1, 101, 1),
					testContribution(keys[0], 1, 102, 1),
				},
			},
			{
				PositionKey: keys[1],
				Contributions: []query.Contribution{
					testContribution(keys[1], 2, 101, 2),
					testContribution(keys[1], 2, 103, 2),
				},
			},
			{
				PositionKey: keys[2],
				Contributions: []query.Contribution{
					testContribution(keys[2], 3, 102, 3),
					testContribution(keys[2], 3, 103, 3),
				},
			},
		},
	}
	if scope == "personal" {
		result.EffectiveQuery.UID = "alice"
		result.EffectiveQuery.CollectionStatuses = []string{"completed"}
	}
	facts := query.FactSet{
		Subjects: []query.Subject{
			testSubject(101, 8),
			testSubject(102, 7),
			testSubject(103, 6),
		},
	}
	for index, key := range keys {
		facts.Plans = append(facts.Plans, query.SelectionPlan{
			PositionKey: key,
			RuleKind:    "exactStaff",
			PositionID:  int64(index + 1),
		})
	}
	request := BuildRequest{
		DataVersion: testDataVersion,
		Query:       result,
		Facts:       facts,
		Input: Input{Participants: []ParticipantInput{
			{PersonID: 1, PositionKeys: []string{keys[0]}},
			{PersonID: 2, PositionKeys: []string{keys[1]}},
			{PersonID: 3, PositionKeys: []string{keys[2]}},
		}},
		Evidence: ArchiveEvidence{
			People: []PersonReference{
				{ID: 1, Name: "First"},
				{ID: 2, Name: "Second"},
				{ID: 3, Name: "Third"},
			},
			Subjects: []SubjectReference{
				{ID: 101, Name: "One"},
				{ID: 102, Name: "Two"},
				{ID: 103, Name: "Three"},
			},
		},
	}
	if scope == "personal" {
		for _, subjectID := range []int64{101, 102, 103} {
			score := float64(subjectID%10 + 1)
			request.PersonalEntries = append(
				request.PersonalEntries,
				query.CollectionEntry{
					SubjectID:     subjectID,
					Status:        "completed",
					PersonalScore: &score,
					UpdatedAt:     "2026-01-01T00:00:00Z",
				},
			)
		}
		series, err := statistics.BuildSeriesIndex(
			context.Background(),
			testDataVersion,
			[]statistics.SeriesSubject{
				{SubjectID: 101, SubjectType: "anime"},
				{SubjectID: 102, SubjectType: "anime"},
				{SubjectID: 103, SubjectType: "anime"},
			},
			nil,
		)
		if err != nil {
			t.Fatalf("BuildSeriesIndex: %v", err)
		}
		request.Series = series
	}
	return request
}

func testContribution(
	positionKey string,
	personID int64,
	subjectID int64,
	positionID int64,
) query.Contribution {
	return query.Contribution{
		PositionKey: positionKey,
		Kind:        "staff",
		SubjectID:   subjectID,
		PersonID:    personID,
		PositionID:  positionID,
	}
}

func testSubject(id int64, score float64) query.Subject {
	buckets := make([]query.RatingBucket, 10)
	for index := range buckets {
		buckets[index] = query.RatingBucket{
			Rating: int64(index + 1),
			Count:  1,
		}
	}
	return query.Subject{
		SubjectID:     id,
		SubjectType:   "anime",
		GlobalScore:   &score,
		RatingBuckets: buckets,
	}
}

func int64Pointer(value int64) *int64 { return &value }
