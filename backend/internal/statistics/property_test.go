package statistics

import (
	"context"
	"reflect"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

func TestPersonComparatorsAreStrictTotalOrders(t *testing.T) {
	value := func(input int64) *int64 { return &input }
	rational := func(numerator, denominator int64) *Rational {
		return &Rational{
			Numerator:   strconv.FormatInt(numerator, 10),
			Denominator: strconv.FormatInt(denominator, 10),
		}
	}
	entries := []PersonSortEntry{
		{PersonID: 1, Count: 0},
		{PersonID: 2, Count: 1, AverageHundredths: value(500), ValidRatingCount: 1, OverallHundredths: value(500), Preference: rational(0, 1), EffectiveEvidence: 1},
		{PersonID: 3, Count: 1, AverageHundredths: value(500), ValidRatingCount: 1, OverallHundredths: value(500), Preference: rational(0, 1), EffectiveEvidence: 1},
		{PersonID: 4, Count: 2, AverageHundredths: value(900), ValidRatingCount: 2, OverallHundredths: value(600), Preference: rational(1, 3), EffectiveEvidence: 2},
		{PersonID: 5, Count: 2, AverageHundredths: value(700), ValidRatingCount: 1, OverallHundredths: value(550), Preference: rational(-2, 3), EffectiveEvidence: 10},
	}
	profiles := []SortProfile{SortPersonCount, SortPersonAverage, SortPersonOverall, SortPersonPreference}
	for _, profile := range profiles {
		for _, direction := range []Direction{Ascending, Descending} {
			t.Run(string(profile)+"/"+string(direction), func(t *testing.T) {
				for left := range entries {
					if personLess(profile, direction, entries[left], entries[left]) {
						t.Fatalf("entry %d is less than itself", left)
					}
					for right := range entries {
						if personLess(profile, direction, entries[left], entries[right]) &&
							personLess(profile, direction, entries[right], entries[left]) {
							t.Fatalf("antisymmetry failed: %d/%d", left, right)
						}
						for third := range entries {
							if personLess(profile, direction, entries[left], entries[right]) &&
								personLess(profile, direction, entries[right], entries[third]) &&
								!personLess(profile, direction, entries[left], entries[third]) {
								t.Fatalf("transitivity failed: %d/%d/%d", left, right, third)
							}
						}
					}
				}
			})
		}
	}
}

func TestCancellationPublishesNoPartialResult(t *testing.T) {
	score := 7.0
	ratingInputs := make([]RatingInput, 100)
	for index := range ratingInputs {
		ratingInputs[index] = RatingInput{UnitID: int64(index + 1), Score: &score}
	}
	if result, err := EvaluateRatings(newCountdownContext(20), UnitSubject, ratingInputs, nil); result != nil || errorCodeOrEmpty(err) != CodeCanceled {
		t.Fatalf("rating cancellation result = %+v, err %v", result, err)
	}

	subjects := make([]SeriesSubject, 100)
	for index := range subjects {
		subjects[index] = SeriesSubject{SubjectID: int64(index + 1), SubjectType: "anime"}
	}
	if result, err := BuildSeriesIndex(newCountdownContext(20), "dv1-"+strings.Repeat("1", 64), subjects, nil); result != nil || errorCodeOrEmpty(err) != CodeCanceled {
		t.Fatalf("series cancellation result = %+v, err %v", result, err)
	}

	sortEntries := make([]UnitSortEntry, 100)
	for index := range sortEntries {
		value := int64(index)
		sortEntries[index] = UnitSortEntry{UnitID: int64(index + 1), SelectedMetricHundredths: &value}
	}
	if result, err := SortUnits(newCountdownContext(20), Descending, sortEntries); result != nil || errorCodeOrEmpty(err) != CodeCanceled {
		t.Fatalf("sort cancellation result = %+v, err %v", result, err)
	}

	people := make([]PersonEvidence, 20)
	for personIndex := range people {
		units := make([]Unit, 20)
		for unitIndex := range units {
			subjectID := int64(personIndex*20 + unitIndex + 1)
			units[unitIndex] = Unit{
				Kind: UnitSubject, UnitID: subjectID,
				CompleteMemberIDs: []int64{subjectID},
				MatchedMemberIDs:  []int64{subjectID},
			}
		}
		people[personIndex] = PersonEvidence{
			PersonID: int64(personIndex + 1),
			Units:    units,
		}
	}
	if result, err := BuildSummary(newCountdownContext(50), UnitSubject, people); result != nil || errorCodeOrEmpty(err) != CodeCanceled {
		t.Fatalf("summary cancellation result = %+v, err %v", result, err)
	}
}

func TestRepeatedConcurrentEvaluationIsDeterministicAndReusable(t *testing.T) {
	score := 8.2
	request := EvaluationRequest{
		DataVersion: "dv1-" + strings.Repeat("2", 64),
		Result: query.Result{
			QueryDigest:    "q1:deterministic",
			EffectiveQuery: query.EffectiveQuery{Scope: "global", SubjectType: "anime"},
			RankingPeople:  []query.PersonSubjects{{PersonID: 1, SubjectIDs: []int64{1}}},
		},
		Facts: query.FactSet{Subjects: []query.Subject{{SubjectID: 1, SubjectType: "anime", GlobalScore: &score}}},
	}
	const workers = 16
	results := make(chan *Evaluation, workers)
	errors := make(chan error, workers)
	for range workers {
		go func() {
			result, err := Evaluate(context.Background(), request)
			results <- result
			errors <- err
		}()
	}
	var reference *Evaluation
	for range workers {
		if err := <-errors; err != nil {
			t.Fatal(err)
		}
		result := <-results
		if reference == nil {
			reference = result
			continue
		}
		if !reflect.DeepEqual(reference, result) {
			t.Fatalf("concurrent result differs: %+v / %+v", reference, result)
		}
	}
	reference.People[0].Units[0].MatchedMemberIDs[0] = 999
	again, err := Evaluate(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if again.People[0].Units[0].MatchedMemberIDs[0] != 1 {
		t.Fatalf("later evaluation observed caller mutation: %+v", again)
	}
	if *request.Facts.Subjects[0].GlobalScore != 8.2 {
		t.Fatal("input was mutated")
	}
}

func TestSubjectEvaluationUsesNaturalSeriesForPreference(t *testing.T) {
	personalScore := 8.0
	globalScore := 7.0
	index, err := BuildSeriesIndex(
		context.Background(),
		"dv1-"+strings.Repeat("4", 64),
		[]SeriesSubject{
			{SubjectID: 10, SubjectType: "anime"},
			{SubjectID: 20, SubjectType: "anime"},
		},
		[]Relation{{
			SourceID: 10, SourceType: "anime",
			TargetID: 20, TargetType: "anime", RelationID: 2,
		}},
	)
	if err != nil {
		t.Fatal(err)
	}
	result, err := Evaluate(context.Background(), EvaluationRequest{
		DataVersion: "dv1-" + strings.Repeat("4", 64),
		Result: query.Result{
			QueryDigest: "q1:natural-series",
			EffectiveQuery: query.EffectiveQuery{
				Scope: "personal", SubjectType: "anime", MergeSeries: false,
			},
			RankingPeople: []query.PersonSubjects{{
				PersonID: 1, SubjectIDs: []int64{10, 20},
			}},
		},
		Facts: query.FactSet{Subjects: []query.Subject{
			{SubjectID: 10, SubjectType: "anime", GlobalScore: &globalScore},
			{SubjectID: 20, SubjectType: "anime", GlobalScore: &globalScore},
		}},
		PersonalEntries: []query.CollectionEntry{
			{SubjectID: 10, PersonalScore: &personalScore},
			{SubjectID: 20, PersonalScore: &personalScore},
		},
		Series: index,
	})
	if err != nil {
		t.Fatal(err)
	}
	preference := result.People[0].Preference
	if preference == nil || preference.ComparableCount != 2 ||
		preference.ComparableSeriesCount != 1 ||
		preference.EffectiveEvidence != 2 {
		t.Fatalf("subject preference natural series evidence = %+v", preference)
	}
}

func TestContributionSortDistinguishesNilAndZeroOrderAcrossShuffles(t *testing.T) {
	zero := int64(0)
	nilOrder := query.Contribution{
		PositionKey: "cast:anime:main", Kind: "cast", SubjectID: 1,
		PersonID: 1, CharacterID: 1, RoleType: 1,
	}
	zeroOrder := nilOrder
	zeroOrder.SortOrder = &zero
	build := func(values []query.Contribution) []query.Contribution {
		summary, err := BuildSummary(context.Background(), UnitSubject, []PersonEvidence{{
			PersonID: 1,
			Units: []Unit{{
				Kind: UnitSubject, UnitID: 1,
				CompleteMemberIDs: []int64{1}, MatchedMemberIDs: []int64{1},
				Contributions: values,
			}},
		}})
		if err != nil {
			t.Fatal(err)
		}
		return summary.Attributions
	}
	first := build([]query.Contribution{zeroOrder, nilOrder})
	second := build([]query.Contribution{nilOrder, zeroOrder})
	if !reflect.DeepEqual(first, second) || len(first) != 2 ||
		first[0].SortOrder != nil || first[1].SortOrder == nil {
		t.Fatalf("nil/zero order is not strict and deterministic: %+v / %+v", first, second)
	}
}

type countdownContext struct {
	remaining atomic.Int64
}

func newCountdownContext(remaining int64) *countdownContext {
	ctx := &countdownContext{}
	ctx.remaining.Store(remaining)
	return ctx
}

func (c *countdownContext) Deadline() (time.Time, bool) { return time.Time{}, false }
func (c *countdownContext) Done() <-chan struct{}       { return nil }
func (c *countdownContext) Value(any) any               { return nil }
func (c *countdownContext) Err() error {
	if c.remaining.Add(-1) <= 0 {
		return context.Canceled
	}
	return nil
}
