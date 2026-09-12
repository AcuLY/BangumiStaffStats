package persondetail

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

const (
	testDataVersion = "dv1-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	testQueryDigest = "q1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
)

func TestBuildGlobalUsesAcceptedStatisticsAndExactArchiveEvidence(t *testing.T) {
	request := detailBuildRequest(t, false, false)
	result, err := Build(context.Background(), request)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if result.Scope != "global" ||
		result.Summary.WorkUnit != statistics.UnitSubject ||
		result.Summary.WorkCount != 2 ||
		result.Summary.CharacterCount == nil ||
		*result.Summary.CharacterCount != 2 {
		t.Fatalf("summary = %+v", result.Summary)
	}
	if result.Metrics.RatedWorkCount != 2 ||
		result.Metrics.Average == nil ||
		*result.Metrics.Average != 700 ||
		result.Metrics.Overall == nil ||
		*result.Metrics.Overall != 557 {
		t.Fatalf("global metrics = %+v", result.Metrics)
	}
	if result.Metrics.GlobalAverage != nil ||
		result.Preference != nil ||
		result.Tags.Personal != nil ||
		result.Ratings.Personal != nil {
		t.Fatalf("personal evidence leaked into global core: %+v", result)
	}
	if len(result.Works) != 2 ||
		result.Works[0].Subject == nil ||
		len(result.Works[0].Subject.Contributions) != 2 {
		t.Fatalf("subject works = %+v", result.Works)
	}
	first := result.Works[0].Subject.Contributions
	var staff *StaffContribution
	var cast *CastContribution
	for _, contribution := range first {
		if contribution.Staff != nil {
			staff = contribution.Staff
		}
		if contribution.Cast != nil {
			cast = contribution.Cast
		}
	}
	if staff == nil ||
		staff.PositionKey != "staffset:anime:directors" ||
		staff.ExactPositionKey != "staff:anime:2" ||
		staff.WorkCount != nil ||
		cast == nil ||
		cast.Character.Key != "character:501" ||
		cast.RoleLabel != "主役" ||
		cast.WorkCount != nil {
		t.Fatalf("exact subject contributions = %+v", first)
	}
	if len(result.Characters) != 2 ||
		result.Characters[0].Character.Key != "character:501" ||
		result.Characters[0].WorkCount != 1 ||
		result.Characters[0].Appearances[0].Subject.ID != 101 ||
		!slices.Equal(
			result.Characters[0].Appearances[0].PositionKeys,
			[]string{"cast:anime:all"},
		) {
		t.Fatalf("characters = %+v", result.Characters)
	}
	if !slices.Equal(result.Tags.Meta, []TagCount{{Name: "动画", Count: 2}}) ||
		!slices.Equal(result.Tags.Community, []TagCount{
			{Name: "共同", Count: 2},
			{Name: "乙", Count: 1},
			{Name: "甲", Count: 1},
		}) {
		t.Fatalf("tags = %+v", result.Tags)
	}
	if len(result.Ratings.Global.Buckets) != 10 ||
		result.Ratings.Global.Buckets[5].Count != 1 ||
		result.Ratings.Global.Buckets[7].Count != 1 {
		t.Fatalf("global ratings = %+v", result.Ratings.Global)
	}
}

func TestRoleLabelsCoverEveryValidCastType(t *testing.T) {
	for index, want := range []string{"主役", "配角", "客串", "闲角", "旁白", "声库"} {
		if got := roleLabel(int64(index + 1)); got != want {
			t.Fatalf("role %d: %q, want %q", index+1, got, want)
		}
	}
}

func TestBuildRejectsMissingRequiredSubjectReferenceAsInternal(t *testing.T) {
	request := detailBuildRequest(t, false, false)
	request.Evidence.Subjects = request.Evidence.Subjects[1:]

	_, err := Build(context.Background(), request)
	assertFailure(t, err, CodeInternal, "")
}

func TestBuildPersonalSeriesKeepsCompleteMembersAndRawAppearances(t *testing.T) {
	request := detailBuildRequest(t, true, true)
	result, err := Build(context.Background(), request)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if result.Summary.WorkUnit != statistics.UnitSeries ||
		result.Summary.WorkCount != 1 ||
		len(result.Works) != 1 ||
		result.Works[0].Series == nil {
		t.Fatalf("series core = %+v", result)
	}
	series := result.Works[0].Series
	if series.SeriesID != 101 ||
		series.Representative.ID != 102 ||
		series.MatchedWorkCount != 2 ||
		series.MemberCount != 3 ||
		len(series.Members) != 3 {
		t.Fatalf("series membership = %+v", series)
	}
	memberMatched := make(map[int64]bool)
	for _, member := range series.Members {
		memberMatched[member.ID] = member.Matched
	}
	if !memberMatched[101] || !memberMatched[102] || memberMatched[103] {
		t.Fatalf("series matched members = %+v", series.Members)
	}
	if len(series.Contributions) != 4 {
		t.Fatalf("series contributions = %+v", series.Contributions)
	}
	for _, contribution := range series.Contributions {
		var count *int
		if contribution.Staff != nil {
			count = contribution.Staff.WorkCount
		} else {
			count = contribution.Cast.WorkCount
		}
		if count == nil || *count != 1 {
			t.Fatalf("series contribution workCount = %+v", contribution)
		}
	}
	appearanceSubjects := make([]int64, 0)
	for _, character := range result.Characters {
		for _, appearance := range character.Appearances {
			appearanceSubjects = append(appearanceSubjects, appearance.Subject.ID)
		}
	}
	slices.Sort(appearanceSubjects)
	if !slices.Equal(appearanceSubjects, []int64{101, 102}) {
		t.Fatalf("character appearances must remain raw subjects: %+v", result.Characters)
	}
	if result.Metrics.Average == nil || *result.Metrics.Average != 700 ||
		result.Metrics.GlobalAverage == nil || *result.Metrics.GlobalAverage != 700 ||
		result.Metrics.Highest == nil || *result.Metrics.Highest != 700 ||
		result.Metrics.Lowest == nil || *result.Metrics.Lowest != 700 {
		t.Fatalf("personal metrics = %+v", result.Metrics)
	}
	if result.Preference == nil ||
		result.Preference.ComparableCount != 2 ||
		result.Preference.ComparableSeriesCount != 1 ||
		result.Preference.EffectiveEvidence != 1 ||
		result.Preference.Mean == nil ||
		result.Preference.Mean.Numerator != "0" ||
		result.Preference.Score == nil ||
		result.Preference.Score.Numerator != "0" {
		t.Fatalf("preference = %+v", result.Preference)
	}
	if result.Ratings.Global.Timeline == nil ||
		len(result.Ratings.Global.Timeline) != 0 ||
		result.Ratings.Personal == nil ||
		len(result.Ratings.Personal.Timeline) != 0 {
		t.Fatalf("series timeline must be empty: %+v", result.Ratings)
	}
	if !slices.Equal(result.Tags.Personal, []TagCount{
		{Name: "共同收藏", Count: 1},
		{Name: "我的乙", Count: 1},
		{Name: "我的甲", Count: 1},
	}) {
		t.Fatalf("series personal tags count each unit once = %+v", result.Tags.Personal)
	}
}

func TestBuildCharacterCountIsCurrentPersonNotGlobalQuerySummary(t *testing.T) {
	request := detailBuildRequest(t, false, false)
	other := request.Evaluation.People[0]
	other.PersonID = 11
	other.Units = append([]statistics.Unit(nil), other.Units...)
	for index := range other.Units {
		other.Units[index].Contributions = append(
			[]query.Contribution(nil),
			other.Units[index].Contributions...,
		)
		for contributionIndex := range other.Units[index].Contributions {
			contribution := &other.Units[index].Contributions[contributionIndex]
			contribution.PersonID = 11
			if contribution.Kind == "cast" {
				contribution.CharacterID += 1_000
			}
		}
	}
	request.Evaluation.People = append(request.Evaluation.People, other)
	request.Query.RankingPeople = append(
		request.Query.RankingPeople,
		query.PersonSubjects{PersonID: 11, SubjectIDs: []int64{101, 102}},
	)
	globalCharacterCount := 3
	request.Evaluation.Summary.CharacterCount = &globalCharacterCount
	request.Evaluation.Summary.CharacterIDs = []int64{501, 502, 1_501}

	result, err := Build(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if result.Summary.CharacterCount == nil ||
		*result.Summary.CharacterCount != 2 ||
		len(result.Characters) != 2 {
		t.Fatalf(
			"person character count = %+v, global summary=%d",
			result.Summary,
			globalCharacterCount,
		)
	}
}

func TestBuildDistinguishesMissingAndIneligiblePerson(t *testing.T) {
	request := detailBuildRequest(t, false, false)
	request.Evidence.Person = PersonProfile{}
	_, err := Build(context.Background(), request)
	failure, found := ErrorDetails(err)
	if !found || failure.Code() != CodeEntityNotFound {
		t.Fatalf("missing person error = %#v", err)
	}

	request = detailBuildRequest(t, false, false)
	request.Query.RankingPeople = nil
	_, err = Build(context.Background(), request)
	failure, found = ErrorDetails(err)
	if !found ||
		failure.Code() != CodePersonNotInQueryResult ||
		failure.Path() != "/input/personId" {
		t.Fatalf("ineligible person error = %#v", err)
	}
}

func TestBuildDoesNotInspectPersonalEvidenceInGlobalScope(t *testing.T) {
	request := detailBuildRequest(t, false, false)
	request.PersonalEntries = []query.CollectionEntry{{
		SubjectID: -1,
		Status:    "invalid",
	}}
	if _, err := Build(context.Background(), request); err != nil {
		t.Fatalf("global Build inspected personal entries: %v", err)
	}
}

func TestBuildHonorsCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := Build(ctx, detailBuildRequest(t, false, false))
	failure, found := ErrorDetails(err)
	if !found || failure.Code() != CodeCanceled ||
		!errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation = %#v", err)
	}
}

func TestProjectContributionsPreservesOpaquePositionKeys(t *testing.T) {
	contributions, err := projectContributions(statistics.Unit{
		Kind: statistics.UnitSubject,
		Contributions: []query.Contribution{{
			PositionKey:       "opaque-requested-position",
			MemberPositionKey: "opaque-exact-member",
			Kind:              "staff",
			SubjectID:         101,
			PersonID:          10,
		}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(contributions) != 1 ||
		contributions[0].Kind != "staff" ||
		contributions[0].Staff == nil ||
		contributions[0].Staff.PositionKey != "opaque-requested-position" ||
		contributions[0].Staff.ExactPositionKey != "opaque-exact-member" {
		t.Fatalf("opaque contribution = %+v", contributions)
	}
}

func TestRatingDistributionCountsEveryHiddenExampleExactlyOnce(t *testing.T) {
	score := 8.0
	units := make([]statistics.Unit, 10)
	references := make(map[int64]RatingExample, len(units))
	for index := range units {
		id := int64(index + 1)
		units[index] = statistics.Unit{
			Kind:        statistics.UnitSubject,
			UnitID:      id,
			GlobalScore: &score,
		}
		references[id] = RatingExample{
			Kind: statistics.UnitSubject,
			Key:  subjectKey(id),
			ID:   id,
			Name: "Example",
		}
	}
	distribution, err := ratingDistribution(
		units,
		statistics.RatingSummary{RatedUnitCount: len(units)},
		references,
		nil,
		func(unit statistics.Unit) *float64 { return unit.GlobalScore },
	)
	if err != nil {
		t.Fatal(err)
	}
	bucket := distribution.Buckets[7]
	if bucket.Count != 10 || len(bucket.Examples) != 8 || bucket.HiddenCount != 2 {
		t.Fatalf("rating bucket = %+v", bucket)
	}
}

func TestSeriesMetaTagsUseOnlyRepresentativeAcrossScopeProjection(t *testing.T) {
	for _, personal := range []bool{false, true} {
		for _, empty := range []bool{false, true} {
			request := detailBuildRequest(t, personal, true)
			for index := range request.Facts.Subjects {
				fact := &request.Facts.Subjects[index]
				fact.Tags = []query.SubjectTag{{Scope: "meta", Name: "member-only"}}
				if fact.SubjectID == 102 {
					fact.Tags = []query.SubjectTag{{Scope: "community", Name: "community-only"}}
					if !empty {
						fact.Tags = append(fact.Tags,
							query.SubjectTag{Scope: "meta", Name: "Z"},
							query.SubjectTag{Scope: "meta", Name: "A"},
							query.SubjectTag{Scope: "meta", Name: "A"},
						)
					}
				}
			}
			core, err := Build(context.Background(), request)
			if err != nil {
				t.Fatalf("Build personal=%t empty=%t: %v", personal, empty, err)
			}
			want := []string{}
			if !empty {
				want = []string{"A", "Z"}
			}
			series := core.Works[0].Series
			if series.Representative.ID != 102 || series.MetaTags == nil || !slices.Equal(series.MetaTags, want) {
				t.Fatalf("representative metadata personal=%t empty=%t: %+v", personal, empty, series)
			}
			projected, err := projectWorkEnvelopes(CloneCore(core).Works, core.Scope)
			if err != nil {
				t.Fatal(err)
			}
			body, err := json.Marshal(projected)
			if err != nil {
				t.Fatal(err)
			}
			var works []struct {
				MetaTags []string `json:"metaTags"`
			}
			if err := json.Unmarshal(body, &works); err != nil {
				t.Fatal(err)
			}
			if len(works) != 1 || works[0].MetaTags == nil || !slices.Equal(works[0].MetaTags, want) {
				t.Fatalf("wire metadata personal=%t empty=%t: %s", personal, empty, body)
			}
		}
	}
}

func detailBuildRequest(t *testing.T, personal, merge bool) BuildRequest {
	t.Helper()
	scoreEight := 8.0
	scoreSix := 6.0
	facts := query.FactSet{
		Subjects: []query.Subject{
			detailSubject(101, "2024-01-10", &scoreEight, "甲"),
			detailSubject(102, "2024-04-10", &scoreSix, "乙"),
			detailSubject(103, "2025-01-10", nil, "未匹配"),
		},
		Plans: []query.SelectionPlan{
			{
				PositionKey:        "staffset:anime:directors",
				RuleKind:           "staffSetUnion",
				MemberPositionKeys: []string{"staff:anime:2", "staff:anime:74"},
			},
			{
				PositionKey: "cast:anime:all",
				RuleKind:    "exactCast",
				RoleTypes:   []int64{1, 2, 3, 4, 5, 6},
			},
		},
	}
	scope := "global"
	var entries []query.CollectionEntry
	if personal {
		scope = "personal"
		scoreNine := 9.0
		scoreFive := 5.0
		entries = []query.CollectionEntry{
			{
				SubjectID:     101,
				Status:        "completed",
				PersonalScore: &scoreNine,
				UpdatedAt:     "2026-01-01T00:00:00Z",
				Tags:          []string{"共同收藏", "我的甲"},
			},
			{
				SubjectID:     102,
				Status:        "completed",
				PersonalScore: &scoreFive,
				UpdatedAt:     "2026-02-01T00:00:00Z",
				Tags:          []string{"共同收藏", "我的乙"},
			},
		}
	}
	result := query.Result{
		EffectiveQuery: query.EffectiveQuery{
			Scope:              scope,
			UID:                conditionalString(personal, "Alice"),
			CollectionStatuses: conditionalStrings(personal, []string{"completed"}),
			SubjectType:        "anime",
			PositionKeys: []string{
				"staffset:anime:directors",
				"cast:anime:all",
			},
			MergeSeries: merge,
		},
		QueryDigest:             testQueryDigest,
		CollectionAccessCount:   conditionalInt(personal, 1),
		EligibleSubjectIDs:      []int64{101, 102, 103},
		ParticipatingSubjectIDs: []int64{101, 102},
		PositionResults: []query.PositionResult{
			{
				PositionKey:         "staffset:anime:directors",
				CandidatePersonIDs:  []int64{10},
				CandidateSubjectIDs: []int64{101, 102},
				Contributions: []query.Contribution{
					{
						PositionKey:       "staffset:anime:directors",
						MemberPositionKey: "staff:anime:2",
						Kind:              "staff",
						SubjectID:         101,
						PersonID:          10,
						PositionID:        2,
					},
					{
						PositionKey:       "staffset:anime:directors",
						MemberPositionKey: "staff:anime:74",
						Kind:              "staff",
						SubjectID:         102,
						PersonID:          10,
						PositionID:        74,
					},
				},
			},
			{
				PositionKey:         "cast:anime:all",
				CandidatePersonIDs:  []int64{10},
				CandidateSubjectIDs: []int64{101, 102},
				Contributions: []query.Contribution{
					{
						PositionKey: "cast:anime:all",
						Kind:        "cast",
						SubjectID:   101,
						PersonID:    10,
						CharacterID: 501,
						RoleType:    1,
					},
					{
						PositionKey: "cast:anime:all",
						Kind:        "cast",
						SubjectID:   102,
						PersonID:    10,
						CharacterID: 502,
						RoleType:    2,
					},
				},
			},
		},
		RankingPeople: []query.PersonSubjects{{
			PersonID:   10,
			SubjectIDs: []int64{101, 102},
		}},
	}
	var series *statistics.SeriesIndex
	if personal || merge {
		var err error
		series, err = statistics.BuildSeriesIndex(
			context.Background(),
			testDataVersion,
			[]statistics.SeriesSubject{
				{SubjectID: 101, SubjectType: "anime", AirDate: stringPointer("2024-01-10")},
				{SubjectID: 102, SubjectType: "anime", AirDate: stringPointer("2024-04-10")},
				{SubjectID: 103, SubjectType: "anime", AirDate: stringPointer("2025-01-10")},
			},
			[]statistics.Relation{
				{
					SourceID:   101,
					SourceType: "anime",
					TargetID:   102,
					TargetType: "anime",
					RelationID: 2,
				},
				{
					SourceID:   102,
					SourceType: "anime",
					TargetID:   103,
					TargetType: "anime",
					RelationID: 2,
				},
			},
		)
		if err != nil {
			t.Fatalf("BuildSeriesIndex: %v", err)
		}
	}
	evaluation, err := statistics.Evaluate(
		context.Background(),
		statistics.EvaluationRequest{
			DataVersion:     testDataVersion,
			Result:          result,
			Facts:           facts,
			PersonalEntries: entries,
			Series:          series,
		},
	)
	if err != nil {
		t.Fatalf("statistics.Evaluate: %v", err)
	}
	return BuildRequest{
		DataVersion:     testDataVersion,
		PersonID:        10,
		Query:           result,
		Facts:           facts,
		Evaluation:      *evaluation,
		PersonalEntries: entries,
		Series:          series,
		Evidence: ArchiveEvidence{
			Person: PersonProfile{
				PersonReference: PersonReference{
					ID:     10,
					Name:   "Example Person",
					NameCN: stringPointer("示例人物"),
				},
				Careers: []string{"seiyu"},
			},
			Subjects: []SubjectReference{
				{ID: 101, Name: "Alpha", NameCN: stringPointer("甲作"), Date: stringPointer("2024-01-10")},
				{ID: 102, Name: "Beta", NameCN: stringPointer("乙作"), Date: stringPointer("2024-04-10")},
				{ID: 103, Name: "Gamma", NameCN: stringPointer("丙作"), Date: stringPointer("2025-01-10")},
			},
			Characters: []CharacterReference{
				{Key: "character:501", ID: int64Pointer(501), Name: "Main", NameCN: stringPointer("主角")},
				{Key: "character:502", ID: int64Pointer(502), Name: "Support", NameCN: stringPointer("配角")},
			},
		},
	}
}

func detailSubject(id int64, date string, score *float64, uniqueTag string) query.Subject {
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
		SubjectID:        id,
		SubjectType:      "anime",
		AirDate:          stringPointer(date),
		AirDatePrecision: int64Pointer(3),
		GlobalScore:      score,
		RatingBuckets:    buckets,
		Tags: []query.SubjectTag{
			{Scope: "meta", Name: "动画"},
			{Scope: "public", Name: "共同"},
			{Scope: "public", Name: uniqueTag},
		},
	}
}

func conditionalString(condition bool, value string) string {
	if condition {
		return value
	}
	return ""
}

func conditionalStrings(condition bool, value []string) []string {
	if condition {
		return value
	}
	return nil
}

func conditionalInt(condition bool, value int) int {
	if condition {
		return value
	}
	return 0
}

func stringPointer(value string) *string { return &value }

func int64Pointer(value int64) *int64 { return &value }

func TestInputDigestDoesNotContainRawPersonID(t *testing.T) {
	digest, err := InputDigest(10)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(digest, "i1:") || strings.Contains(digest, "10") {
		t.Fatalf("digest = %q", digest)
	}
}

func TestRatingTimelineRetainsEveryWorkAndCanonicalQuarterMean(t *testing.T) {
	score := func(value float64) *float64 { return &value }
	units := []statistics.Unit{
		{UnitID: 3, AirDate: stringPointer("2024-03-01"), GlobalScore: score(7), PersonalScore: score(0)},
		{UnitID: 2, AirDate: stringPointer("2024-01"), GlobalScore: score(7), PersonalScore: score(8)},
		{UnitID: 1, AirDate: stringPointer("2024-01"), GlobalScore: score(6), PersonalScore: score(9)},
		{UnitID: 4, AirDate: stringPointer("2024"), GlobalScore: score(8.2), PersonalScore: score(6)},
		{UnitID: 5, GlobalScore: score(9)},
		{UnitID: 6, AirDate: stringPointer("2024-02"), GlobalScore: score(0)},
		{UnitID: 7, AirDate: stringPointer("2024-04-01"), GlobalScore: score(8.2), PersonalScore: score(6)},
	}
	works := make([]WorkItem, len(units))
	globalInputs := make([]statistics.RatingInput, len(units))
	personalInputs := make([]statistics.RatingInput, len(units))
	for index := range units {
		unit := &units[index]
		unit.Kind = statistics.UnitSubject
		works[index] = WorkItem{Kind: "subject", Subject: &SubjectWork{
			Key:     subjectKey(unit.UnitID),
			Subject: SubjectReference{ID: unit.UnitID, Name: "Work", NameCN: stringPointer("作品"), Date: cloneString(unit.AirDate)},
		}}
		globalInputs[index] = statistics.RatingInput{UnitID: unit.UnitID, Date: unit.AirDate, Score: unit.GlobalScore}
		personalInputs[index] = statistics.RatingInput{UnitID: unit.UnitID, Date: unit.AirDate, Score: unit.PersonalScore}
	}
	global, err := statistics.EvaluateRatings(context.Background(), statistics.UnitSubject, globalInputs, nil)
	if err != nil {
		t.Fatal(err)
	}
	personal, err := statistics.EvaluateRatings(context.Background(), statistics.UnitSubject, personalInputs, nil)
	if err != nil {
		t.Fatal(err)
	}
	evaluated := statistics.PersonEvaluation{Units: units, Global: *global, Personal: personal}
	ratings, err := buildRatings(evaluated, works)
	if err != nil {
		t.Fatal(err)
	}
	first := ratings.Global.Timeline[0]
	if len(ratings.Global.Timeline) != 2 || first.Count != 3 || first.Average != 666 || len(first.Works) != 3 {
		t.Fatalf("global timeline = %+v", ratings.Global.Timeline)
	}
	for index, id := range []int64{1, 2, 3} {
		if first.Works[index].Subject.ID != id || *first.Works[index].Subject.NameCN != "作品" {
			t.Fatalf("stable work order/reference = %+v", first.Works)
		}
	}
	if *first.Works[0].Subject.Date != "2024-01" || first.Works[1].Score != 700 || first.Works[2].Score != 700 || ratings.Global.Timeline[1].Works[0].Score != 820 {
		t.Fatalf("date precision or independent score lost: %+v", ratings.Global.Timeline)
	}
	if got := ratings.Personal.Timeline[0]; got.Count != 2 || got.Average != 850 || got.Works[0].Score != 900 || got.Works[1].Score != 800 {
		t.Fatalf("personal points = %+v", got)
	}
	for left, right := 0, len(units)-1; left < right; left, right = left+1, right-1 {
		units[left], units[right] = units[right], units[left]
	}
	again, err := buildRatings(evaluated, works)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(ratings.Global.Timeline, again.Global.Timeline) || !reflect.DeepEqual(ratings.Personal.Timeline, again.Personal.Timeline) {
		t.Fatal("timeline changed with incoming work order")
	}
}

func TestRatingTimelineSurvivesViewProjectionAndDeepClone(t *testing.T) {
	core, err := Build(context.Background(), detailBuildRequest(t, true, false))
	if err != nil {
		t.Fatal(err)
	}
	for _, view := range []View{
		{Section: SectionWorks, Sort: SortGlobalScore, Order: OrderDescending, Page: 1, PageSize: 5},
		{Section: SectionWorks, Sort: SortGlobalScore, Order: OrderAscending, Page: 2, PageSize: 5},
	} {
		projected, err := Project(context.Background(), core, view)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(projected.Core.Ratings, core.Ratings) {
			t.Fatal("view changed complete rating evidence")
		}
	}
	cloned := CloneCore(core)
	cloned.Ratings.Global.Timeline[0].Works[0].Subject.Name = "Changed"
	*cloned.Ratings.Global.Timeline[0].Works[0].Subject.NameCN = "Changed"
	*cloned.Ratings.Global.Timeline[0].Works[0].Subject.Date = "Changed"
	cloned.Ratings.Personal.Timeline[0].Works[0].Score = 1
	if original := core.Ratings.Global.Timeline[0].Works[0]; original.Subject.Name != "Alpha" || *original.Subject.NameCN != "甲作" || *original.Subject.Date != "2024-01-10" || core.Ratings.Personal.Timeline[0].Works[0].Score != 900 {
		t.Fatal("nested timeline references leaked across clone boundary")
	}
	before := coreCost(core)
	core.Ratings.Global.Timeline[0].Works = append(core.Ratings.Global.Timeline[0].Works, RatingTimelineWork{
		Subject: SubjectReference{ID: 999, Name: "Retained evidence", NameCN: stringPointer("中文"), Date: stringPointer("2024-01")}, Score: 800,
	})
	if coreCost(core) <= before {
		t.Fatal("cache cost omitted retained timeline work")
	}
	before = coreCost(core)
	*core.Ratings.Global.Timeline[0].Works[1].Subject.NameCN += " more retained text"
	if coreCost(core) <= before {
		t.Fatal("cache cost omitted nested timeline reference text")
	}
}
