package partners

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

const testDataVersion = "dv1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const testQueryDigest = "q1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

func TestBuildIntersectsRawSubjectsBeforeSeriesAndPreservesSetIdentity(t *testing.T) {
	request := partnerBuildRequest(t, "global")
	core, err := Build(context.Background(), request)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if core.WorkUnit != statistics.UnitSeries {
		t.Fatalf("work unit = %q", core.WorkUnit)
	}
	if !slices.Equal(core.Source.PositionKeys, []string{"staffset:anime:creative"}) ||
		core.Source.Metrics.WorkCount != 1 {
		t.Fatalf("source = %+v", core.Source)
	}
	if len(core.Partners) != 1 || core.Partners[0].Person.ID != 2 {
		t.Fatalf("partners = %+v", core.Partners)
	}
	if !slices.Equal(
		core.Partners[0].PositionKeys,
		[]string{"staff:anime:2", "cast:anime:main"},
	) {
		t.Fatalf("actual positions = %v", core.Partners[0].PositionKeys)
	}
	if core.Partners[0].Metrics.WorkCount != 1 {
		t.Fatalf("partner metrics = %+v", core.Partners[0].Metrics)
	}
	for _, partner := range core.Partners {
		if partner.Person.ID == 3 {
			t.Fatal("different member of same series became a partner")
		}
	}
}

func TestBuildCandidateFilterChangesCompletePartnerIdentity(t *testing.T) {
	request := partnerBuildRequest(t, "global")
	key := "cast:anime:main"
	request.Input.CandidatePositionKey = &key
	core, err := Build(context.Background(), request)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if len(core.Partners) != 1 ||
		!slices.Equal(core.Partners[0].PositionKeys, []string{"cast:anime:main"}) {
		t.Fatalf("filtered partners = %+v", core.Partners)
	}
}

func TestBuildPersonalZeroEvidenceRetainsNullablePreferenceFields(t *testing.T) {
	request := partnerBuildRequest(t, "personal")
	core, err := Build(context.Background(), request)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if len(core.Partners) != 1 || core.Partners[0].Preference == nil {
		t.Fatalf("personal preference = %+v", core.Partners)
	}
	preference := core.Partners[0].Preference
	if preference.Mean != nil || preference.Score != nil ||
		preference.EvidenceWeight != (statistics.Rational{
			Numerator: "0", Denominator: "1",
		}) {
		t.Fatalf("zero evidence preference = %+v", preference)
	}
}

func TestBuildDistinguishesMissingSourceFromMissingComputedCandidate(t *testing.T) {
	request := partnerBuildRequest(t, "global")
	request.Input.Source.PersonID = 99
	_, err := Build(context.Background(), request)
	var failure *Error
	if !errors.As(err, &failure) ||
		failure.Code() != CodeEntityNotFound ||
		failure.Path() != "/input/source/personId" {
		t.Fatalf("missing source = %#v", err)
	}

	request = partnerBuildRequest(t, "global")
	request.People = slices.DeleteFunc(request.People, func(value PersonReference) bool {
		return value.ID == 2
	})
	_, err = Build(context.Background(), request)
	if code, ok := ErrorCode(err); !ok || code != CodePersonReferenceMissing {
		t.Fatalf("missing computed candidate = %v, code=%q", err, code)
	}
}

func TestComputeErrorPreservesOnlyPublicSourceInputFailures(t *testing.T) {
	mismatch := requestFailure(
		"source identity does not match the source person",
		"/input/source/positionKeys/0",
		string(CodePositionNotFound),
	)
	if mapped := mapComputeError(context.Background(), mismatch); mapped != mismatch {
		t.Fatalf("source mismatch was hidden: %v", mapped)
	}
	internalField := fieldError("/query/positionKeys")
	mapped := mapComputeError(context.Background(), internalField)
	if code, ok := ErrorCode(mapped); !ok || code != CodeInternal {
		t.Fatalf("internal field failure leaked: %v", mapped)
	}
}

func TestBuildPreservesMoreThanSixteenDynamicIdentities(t *testing.T) {
	const identityCount = 17
	request := BuildRequest{
		DataVersion: testDataVersion,
		Query: query.Result{
			EffectiveQuery: query.EffectiveQuery{
				Scope:       "global",
				SubjectType: "anime",
			},
			QueryDigest: testQueryDigest,
		},
		Input: Input{Source: SourceInput{PersonID: 1}},
		People: []PersonReference{
			{ID: 1, Name: "Source"},
			{ID: 2, Name: "Partner"},
		},
	}
	for index := 1; index <= identityCount; index++ {
		key := fmt.Sprintf("staff:anime:%d", index)
		subjectID := int64(100 + index)
		request.Query.EffectiveQuery.PositionKeys = append(
			request.Query.EffectiveQuery.PositionKeys,
			key,
		)
		request.Query.PositionResults = append(
			request.Query.PositionResults,
			query.PositionResult{
				PositionKey:         key,
				CandidatePersonIDs:  []int64{1, 2},
				CandidateSubjectIDs: []int64{subjectID},
				Contributions: []query.Contribution{
					{
						PositionKey: key,
						Kind:        "staff",
						SubjectID:   subjectID,
						PersonID:    1,
						PositionID:  int64(index),
					},
					{
						PositionKey: key,
						Kind:        "staff",
						SubjectID:   subjectID,
						PersonID:    2,
						PositionID:  int64(index),
					},
				},
			},
		)
		request.Facts.Subjects = append(
			request.Facts.Subjects,
			partnerSubject(subjectID, nil),
		)
		request.Facts.Plans = append(request.Facts.Plans, query.SelectionPlan{
			PositionKey: key,
			RuleKind:    "exactStaff",
			PositionID:  int64(index),
		})
	}
	for index := len(request.Query.EffectiveQuery.PositionKeys) - 1; index >= 0; index-- {
		request.Input.Source.PositionKeys = append(
			request.Input.Source.PositionKeys,
			request.Query.EffectiveQuery.PositionKeys[index],
		)
	}
	core, err := Build(context.Background(), request)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if !slices.Equal(core.Source.PositionKeys, request.Input.Source.PositionKeys) {
		t.Fatalf("source request order changed: %v", core.Source.PositionKeys)
	}
	if len(core.Partners) != 1 ||
		!slices.Equal(
			core.Partners[0].PositionKeys,
			request.Query.EffectiveQuery.PositionKeys,
		) {
		t.Fatalf("partner actual identities truncated/reordered: %+v", core.Partners)
	}
}

func partnerBuildRequest(t *testing.T, scope string) BuildRequest {
	t.Helper()
	scoreEight := 8.0
	scoreSeven := 7.0
	scoreSix := 6.0
	facts := query.FactSet{
		Subjects: []query.Subject{
			partnerSubject(101, &scoreEight),
			partnerSubject(102, &scoreSeven),
			partnerSubject(103, &scoreSix),
		},
		Plans: []query.SelectionPlan{
			{
				PositionKey:        "staffset:anime:creative",
				RuleKind:           "staffSetUnion",
				MemberPositionKeys: []string{"staff:anime:3"},
			},
			{
				PositionKey: "staff:anime:2",
				RuleKind:    "exactStaff",
				PositionID:  2,
			},
			{
				PositionKey: "cast:anime:main",
				RuleKind:    "exactCast",
				RoleTypes:   []int64{1},
			},
		},
	}
	effective := query.EffectiveQuery{
		Scope:        scope,
		SubjectType:  "anime",
		PositionKeys: []string{"staffset:anime:creative", "staff:anime:2", "cast:anime:main"},
		MergeSeries:  true,
	}
	if scope == "personal" {
		effective.UID = "alice"
		effective.CollectionStatuses = []string{"completed"}
	}
	result := query.Result{
		EffectiveQuery:     effective,
		QueryDigest:        testQueryDigest,
		EligibleSubjectIDs: []int64{101, 102, 103},
		PositionResults: []query.PositionResult{
			{
				PositionKey:         "staffset:anime:creative",
				CandidatePersonIDs:  []int64{1},
				CandidateSubjectIDs: []int64{101},
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
				PositionKey:         "staff:anime:2",
				CandidatePersonIDs:  []int64{2, 3},
				CandidateSubjectIDs: []int64{101, 102},
				Contributions: []query.Contribution{
					{
						PositionKey: "staff:anime:2",
						Kind:        "staff",
						SubjectID:   101,
						PersonID:    2,
						PositionID:  2,
					},
					{
						PositionKey: "staff:anime:2",
						Kind:        "staff",
						SubjectID:   102,
						PersonID:    3,
						PositionID:  2,
					},
				},
			},
			{
				PositionKey:         "cast:anime:main",
				CandidatePersonIDs:  []int64{2, 4},
				CandidateSubjectIDs: []int64{101, 103},
				Contributions: []query.Contribution{
					{
						PositionKey: "cast:anime:main",
						Kind:        "cast",
						SubjectID:   101,
						PersonID:    2,
						CharacterID: 2001,
						RoleType:    1,
					},
					{
						PositionKey: "cast:anime:main",
						Kind:        "cast",
						SubjectID:   103,
						PersonID:    4,
						CharacterID: 2002,
						RoleType:    1,
					},
				},
			},
		},
	}
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
	return BuildRequest{
		DataVersion: testDataVersion,
		Query:       result,
		Facts:       facts,
		Series:      series,
		Input: Input{
			Source: SourceInput{
				PersonID:     1,
				PositionKeys: []string{"staffset:anime:creative"},
			},
		},
		People: []PersonReference{
			{ID: 1, Name: "Source"},
			{ID: 2, Name: "Shared"},
			{ID: 3, Name: "Series only"},
			{ID: 4, Name: "Other"},
		},
	}
}

func partnerSubject(id int64, score *float64) query.Subject {
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
		GlobalScore:   score,
		RatingBuckets: buckets,
	}
}
