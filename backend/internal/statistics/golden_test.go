package statistics

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strings"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

type goldenFile struct {
	CaseKind string       `json:"caseKind"`
	Cases    []goldenCase `json:"cases"`
}

type goldenCase struct {
	ID       string          `json:"id"`
	Input    json.RawMessage `json:"input"`
	Expected json.RawMessage `json:"expected"`
}

func TestStatisticsGoldenCorpus(t *testing.T) {
	root := statisticsGoldenRoot(t)
	files := []string{
		"control.json",
		"preference-summary.json",
		"rating.json",
		"series.json",
		"sort.json",
	}
	seen := make(map[string]struct{})
	for _, name := range files {
		document := readGoldenFile(t, filepath.Join(root, "cases", name))
		for _, test := range document.Cases {
			test := test
			if _, duplicate := seen[test.ID]; duplicate {
				t.Fatalf("duplicate case ID %q", test.ID)
			}
			seen[test.ID] = struct{}{}
			t.Run(test.ID, func(t *testing.T) {
				switch document.CaseKind {
				case "contract-control":
					runControlGolden(t, test)
				case "rating":
					runRatingGolden(t, test)
				case "series":
					runSeriesGolden(t, test)
				case "preference-summary":
					runPreferenceSummaryGolden(t, test)
				case "sort":
					runSortGolden(t, test)
				default:
					t.Fatalf("unsupported golden kind %q", document.CaseKind)
				}
			})
		}
	}
	if len(seen) != 35 {
		t.Fatalf("consumed %d cases, want 35", len(seen))
	}
}

func runControlGolden(t *testing.T, test goldenCase) {
	var input struct {
		RationalExamples []Rational `json:"rationalExamples"`
	}
	decodeGolden(t, test.Input, &input)
	for _, rational := range input.RationalExamples {
		if _, err := rational.rat(); err != nil {
			t.Fatalf("invalid rational %+v: %v", rational, err)
		}
	}
}

func runRatingGolden(t *testing.T, test goldenCase) {
	if test.ID == "rating-invalid-sentinels" {
		var input struct {
			Variants []struct {
				Rating json.RawMessage `json:"rating"`
			} `json:"variants"`
		}
		decodeGolden(t, test.Input, &input)
		for _, variant := range input.Variants {
			score := scoreFromRaw(t, variant.Rating)
			result, err := EvaluateRatings(context.Background(), UnitSubject, []RatingInput{{UnitID: 1, Score: score}}, nil)
			if result != nil || errorCodeOrEmpty(err) != CodeScoreInvalid {
				t.Fatalf("invalid rating result = %+v, err %v", result, err)
			}
		}
		return
	}
	if test.ID == "rating-count-invalid" {
		var input struct {
			Variants []struct {
				Buckets []float64 `json:"ratingCountBuckets"`
			} `json:"variants"`
		}
		decodeGolden(t, test.Input, &input)
		for _, variant := range input.Variants {
			if _, err := ValidateRatingCountValues(variant.Buckets); errorCodeOrEmpty(err) != CodeRatingCountInvalid {
				t.Fatalf("rating count error = %v", err)
			}
		}
		return
	}
	var input struct {
		Mode  UnitKind `json:"mode"`
		Units []struct {
			UnitID int64           `json:"unitId"`
			Rating json.RawMessage `json:"rating"`
			Date   *string         `json:"date"`
		} `json:"units"`
		RatingCountBuckets []int64 `json:"ratingCountBuckets"`
	}
	var expected struct {
		UnitCount         int             `json:"unitCount"`
		RatedUnitCount    int             `json:"ratedUnitCount"`
		AverageHundredths *int64          `json:"averageHundredths"`
		OverallHundredths *int64          `json:"overallHundredths"`
		RatingCount       *int64          `json:"ratingCount"`
		Distribution      []int           `json:"distribution"`
		Timeline          []TimelinePoint `json:"timeline"`
	}
	decodeGolden(t, test.Input, &input)
	decodeGolden(t, test.Expected, &expected)
	units := make([]RatingInput, len(input.Units))
	for index, unit := range input.Units {
		units[index] = RatingInput{
			UnitID: unit.UnitID,
			Score:  scoreFromRaw(t, unit.Rating),
			Date:   unit.Date,
		}
	}
	result, err := EvaluateRatings(context.Background(), input.Mode, units, input.RatingCountBuckets)
	if err != nil {
		t.Fatal(err)
	}
	if result.UnitCount != expected.UnitCount ||
		result.RatedUnitCount != expected.RatedUnitCount ||
		!reflect.DeepEqual(result.AverageHundredths, expected.AverageHundredths) ||
		!reflect.DeepEqual(result.OverallHundredths, expected.OverallHundredths) ||
		!reflect.DeepEqual(result.Distribution[:], expected.Distribution) ||
		!reflect.DeepEqual(result.Timeline, expected.Timeline) {
		t.Fatalf("rating result = %+v, expected %+v", result, expected)
	}
	if expected.RatingCount != nil && result.RatingCount != *expected.RatingCount {
		t.Fatalf("rating count = %d, want %d", result.RatingCount, *expected.RatingCount)
	}
}

func runSeriesGolden(t *testing.T, test goldenCase) {
	switch test.ID {
	case "series-relation-boundary-matrix":
		var input struct {
			Variants []struct {
				VariantID    string `json:"variantId"`
				RelationID   int64  `json:"relationId"`
				SourceType   string `json:"sourceType"`
				TargetType   string `json:"targetType"`
				SourceID     int64  `json:"sourceId"`
				TargetID     int64  `json:"targetId"`
				SourceExists *bool  `json:"sourceExists"`
				TargetExists bool   `json:"targetExists"`
			} `json:"variants"`
		}
		var expected struct {
			Merged    []string `json:"mergedVariantIds"`
			Singleton []string `json:"singletonVariantIds"`
		}
		decodeGolden(t, test.Input, &input)
		decodeGolden(t, test.Expected, &expected)
		merged := make(map[string]struct{})
		for _, id := range expected.Merged {
			merged[id] = struct{}{}
		}
		for _, variant := range input.Variants {
			subjects := make([]SeriesSubject, 0, 2)
			sourceExists := variant.SourceExists == nil || *variant.SourceExists
			if sourceExists && variant.SourceID > 0 {
				subjects = append(subjects, SeriesSubject{SubjectID: variant.SourceID, SubjectType: variant.SourceType})
			}
			if variant.TargetExists && variant.TargetID > 0 {
				subjects = append(subjects, SeriesSubject{SubjectID: variant.TargetID, SubjectType: variant.TargetType})
			}
			index, err := BuildSeriesIndex(
				context.Background(),
				"dv1-"+strings.Repeat("d", 64),
				subjects,
				[]Relation{{
					SourceID: variant.SourceID, SourceType: variant.SourceType,
					TargetID: variant.TargetID, TargetType: variant.TargetType,
					RelationID: variant.RelationID,
				}},
			)
			if err != nil {
				t.Fatal(err)
			}
			actualMerged := false
			source, sourceOK := index.ComponentFor(variant.SourceType, variant.SourceID)
			target, targetOK := index.ComponentFor(variant.TargetType, variant.TargetID)
			if sourceOK && targetOK && variant.SourceType == variant.TargetType {
				actualMerged = source.SeriesID == target.SeriesID && len(source.MemberIDs) == 2
			}
			_, wantMerged := merged[variant.VariantID]
			if actualMerged != wantMerged {
				t.Fatalf("%s merged = %v, want %v", variant.VariantID, actualMerged, wantMerged)
			}
		}
	case "series-transitive-minimum-id":
		runSeriesComponentGolden(t, test)
	case "series-sequel-order-representative":
		runSeriesOrderGolden(t, test)
	case "series-sequel-weight-matrix":
		var input struct {
			RelationIDs []int64 `json:"relationIds"`
		}
		var expected struct {
			Weights []struct {
				RelationID int64 `json:"relationId"`
				Source     int64 `json:"source"`
				Target     int64 `json:"target"`
			} `json:"weights"`
		}
		decodeGolden(t, test.Input, &input)
		decodeGolden(t, test.Expected, &expected)
		for _, value := range expected.Weights {
			source, target := sequelWeights(value.RelationID, true)
			if source != value.Source || target != value.Target {
				t.Fatalf("weight %d = %d/%d", value.RelationID, source, target)
			}
		}
	case "series-merge-disabled-subject-units":
		var input struct {
			RawSubjectIDs []int64 `json:"rawSubjectIds"`
		}
		var expected struct {
			UnitIDs []int64 `json:"unitIds"`
		}
		decodeGolden(t, test.Input, &input)
		decodeGolden(t, test.Expected, &expected)
		subjects := make(map[int64]query.Subject)
		for _, id := range input.RawSubjectIDs {
			subjects[id] = query.Subject{SubjectID: id, SubjectType: "anime"}
		}
		units, err := materializeUnits(context.Background(), UnitSubject, "anime", input.RawSubjectIDs, subjects, nil, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(unitIDs(units), expected.UnitIDs) {
			t.Fatalf("unit IDs = %v, want %v", unitIDs(units), expected.UnitIDs)
		}
	case "series-raw-intersection-before-merge":
		var input struct {
			People []struct {
				PersonID   int64   `json:"personId"`
				SubjectIDs []int64 `json:"subjectIds"`
			} `json:"personSubjectIds"`
			Components []struct {
				SeriesID  int64   `json:"seriesId"`
				MemberIDs []int64 `json:"memberIds"`
			} `json:"components"`
		}
		var expected struct {
			RawCommon    []int64 `json:"rawCommonSubjectIds"`
			CommonSeries []int64 `json:"commonSeriesIds"`
			UnitCount    int     `json:"unitCount"`
		}
		decodeGolden(t, test.Input, &input)
		decodeGolden(t, test.Expected, &expected)
		rawCommon := intersectGoldenSubjects(input.People)
		if !reflect.DeepEqual(rawCommon, expected.RawCommon) {
			t.Fatalf("raw intersection = %v, want %v", rawCommon, expected.RawCommon)
		}
		version := "dv1-" + strings.Repeat("6", 64)
		seriesSubjects, relations, querySubjects := goldenComponents(input.Components)
		index, err := BuildSeriesIndex(context.Background(), version, seriesSubjects, relations)
		if err != nil {
			t.Fatal(err)
		}
		if len(input.People) >= 2 {
			left, leftOK := index.ComponentFor("anime", input.People[0].SubjectIDs[0])
			right, rightOK := index.ComponentFor("anime", input.People[1].SubjectIDs[0])
			if !leftOK || !rightOK || left.SeriesID != right.SeriesID {
				t.Fatalf("golden does not exercise same-series/different-work boundary")
			}
		}
		evaluation, err := Evaluate(context.Background(), EvaluationRequest{
			DataVersion: version,
			Result: query.Result{
				QueryDigest: "q1:raw-intersection-golden",
				EffectiveQuery: query.EffectiveQuery{
					Scope: "global", SubjectType: "anime", MergeSeries: true,
				},
				ParticipantSets: []query.ParticipantSet{{
					RequestID: "golden-common", SubjectIDs: rawCommon,
				}},
			},
			Facts:  query.FactSet{Subjects: querySubjects},
			Series: index,
		})
		if err != nil {
			t.Fatal(err)
		}
		if len(evaluation.Sets) != 1 ||
			len(evaluation.Sets[0].Units) != expected.UnitCount ||
			!reflect.DeepEqual(unitIDs(evaluation.Sets[0].Units), expected.CommonSeries) {
			t.Fatalf("statistics inferred cooperation after raw intersection: %+v", evaluation.Sets)
		}
	case "series-equal-weight-actual-participation":
		runSeriesRatingGolden(t, test)
	default:
		t.Fatalf("unhandled series case %q", test.ID)
	}
}

func runSeriesComponentGolden(t *testing.T, test goldenCase) {
	var input struct {
		Subjects  []SeriesSubject `json:"subjects"`
		Relations []struct {
			SourceID   int64 `json:"sourceId"`
			TargetID   int64 `json:"targetId"`
			RelationID int64 `json:"relationId"`
		} `json:"relations"`
	}
	var expected struct {
		Components []struct {
			SeriesID  int64   `json:"seriesId"`
			MemberIDs []int64 `json:"memberIds"`
		} `json:"components"`
	}
	decodeGolden(t, test.Input, &input)
	decodeGolden(t, test.Expected, &expected)
	relations := make([]Relation, len(input.Relations))
	for index, relation := range input.Relations {
		relations[index] = Relation{
			SourceID: relation.SourceID, SourceType: "anime",
			TargetID: relation.TargetID, TargetType: "anime",
			RelationID: relation.RelationID,
		}
	}
	index, err := BuildSeriesIndex(context.Background(), "dv1-"+strings.Repeat("e", 64), input.Subjects, relations)
	if err != nil {
		t.Fatal(err)
	}
	actual := index.Components("anime")
	if len(actual) != len(expected.Components) {
		t.Fatalf("components = %+v", actual)
	}
	for offset := range actual {
		actualMembers := append([]int64(nil), actual[offset].MemberIDs...)
		sort.Slice(actualMembers, func(left, right int) bool { return actualMembers[left] < actualMembers[right] })
		if actual[offset].SeriesID != expected.Components[offset].SeriesID ||
			!reflect.DeepEqual(actualMembers, expected.Components[offset].MemberIDs) {
			t.Fatalf("component %d = %+v, expected %+v", offset, actual[offset], expected.Components[offset])
		}
	}
}

func runSeriesOrderGolden(t *testing.T, test goldenCase) {
	var input struct {
		Components []struct {
			SeriesID int64 `json:"seriesId"`
			Subjects []struct {
				SubjectID int64   `json:"subjectId"`
				Date      *string `json:"date"`
			} `json:"subjects"`
			Relations []struct {
				SourceID   int64 `json:"sourceId"`
				TargetID   int64 `json:"targetId"`
				RelationID int64 `json:"relationId"`
			} `json:"relations"`
		} `json:"components"`
	}
	var expected struct {
		Components []struct {
			SeriesID         int64   `json:"seriesId"`
			MemberIDs        []int64 `json:"memberIds"`
			RepresentativeID int64   `json:"representativeId"`
		} `json:"components"`
	}
	decodeGolden(t, test.Input, &input)
	decodeGolden(t, test.Expected, &expected)
	for offset, component := range input.Components {
		subjects := make([]SeriesSubject, len(component.Subjects))
		for index, subject := range component.Subjects {
			subjects[index] = SeriesSubject{SubjectID: subject.SubjectID, SubjectType: "anime", AirDate: subject.Date}
		}
		relations := make([]Relation, len(component.Relations))
		for index, relation := range component.Relations {
			relations[index] = Relation{
				SourceID: relation.SourceID, SourceType: "anime",
				TargetID: relation.TargetID, TargetType: "anime", RelationID: relation.RelationID,
			}
		}
		index, err := BuildSeriesIndex(context.Background(), "dv1-"+strings.Repeat("f", 64), subjects, relations)
		if err != nil {
			t.Fatal(err)
		}
		actual, ok := index.ComponentFor("anime", component.SeriesID)
		if !ok || !reflect.DeepEqual(actual.MemberIDs, expected.Components[offset].MemberIDs) ||
			actual.RepresentativeID != expected.Components[offset].RepresentativeID {
			t.Fatalf("ordered component = %+v, expected %+v", actual, expected.Components[offset])
		}
	}
}

func runSeriesRatingGolden(t *testing.T, test goldenCase) {
	var input struct {
		Units []struct {
			SeriesID          int64   `json:"seriesId"`
			CompleteMemberIDs []int64 `json:"completeMemberIds"`
			MatchedMembers    []struct {
				SubjectID     int64                `json:"subjectId"`
				Rating        json.RawMessage      `json:"rating"`
				Contributions []query.Contribution `json:"contributions"`
			} `json:"matchedMembers"`
		} `json:"units"`
	}
	var expected struct {
		UnitKind       UnitKind `json:"unitKind"`
		UnitCount      int      `json:"unitCount"`
		RatedUnitCount int      `json:"ratedUnitCount"`
		Units          []struct {
			SeriesID                   int64   `json:"seriesId"`
			CompleteMemberIDs          []int64 `json:"completeMemberIds"`
			MatchedMemberIDs           []int64 `json:"matchedMemberIds"`
			NormalizedRatingHundredths *int64  `json:"normalizedRatingHundredths"`
			ContributionCount          int     `json:"contributionCount"`
		} `json:"units"`
		Average      *int64          `json:"averageHundredths"`
		Overall      *int64          `json:"overallHundredths"`
		Distribution []int           `json:"distribution"`
		Timeline     []TimelinePoint `json:"timeline"`
	}
	decodeGolden(t, test.Input, &input)
	decodeGolden(t, test.Expected, &expected)
	version := "dv1-" + strings.Repeat("7", 64)
	seriesSubjects := make([]SeriesSubject, 0)
	relations := make([]Relation, 0)
	querySubjects := make([]query.Subject, 0)
	matchedIDs := make([]int64, 0)
	contributions := make([]query.Contribution, 0)
	for _, unit := range input.Units {
		for _, subjectID := range unit.CompleteMemberIDs {
			seriesSubjects = append(seriesSubjects, SeriesSubject{
				SubjectID: subjectID, SubjectType: "anime",
			})
		}
		for left := range unit.CompleteMemberIDs {
			for right := left + 1; right < len(unit.CompleteMemberIDs); right++ {
				relations = append(relations, Relation{
					SourceID: unit.CompleteMemberIDs[left], SourceType: "anime",
					TargetID: unit.CompleteMemberIDs[right], TargetType: "anime", RelationID: 9,
				})
			}
		}
		matchedByID := make(map[int64]struct{}, len(unit.MatchedMembers))
		for _, member := range unit.MatchedMembers {
			matchedByID[member.SubjectID] = struct{}{}
			matchedIDs = append(matchedIDs, member.SubjectID)
			score := scoreFromRaw(t, member.Rating)
			querySubjects = append(querySubjects, query.Subject{
				SubjectID: member.SubjectID, SubjectType: "anime", GlobalScore: score,
			})
			contributions = append(contributions, member.Contributions...)
		}
		for _, subjectID := range unit.CompleteMemberIDs {
			if _, matched := matchedByID[subjectID]; !matched {
				querySubjects = append(querySubjects, query.Subject{
					SubjectID: subjectID, SubjectType: "anime",
				})
			}
		}
	}
	index, err := BuildSeriesIndex(context.Background(), version, seriesSubjects, relations)
	if err != nil {
		t.Fatal(err)
	}
	evaluation, err := Evaluate(context.Background(), EvaluationRequest{
		DataVersion: version,
		Result: query.Result{
			QueryDigest: "q1:series-rating-golden",
			EffectiveQuery: query.EffectiveQuery{
				Scope: "global", SubjectType: "anime", MergeSeries: true,
			},
			RankingPeople: []query.PersonSubjects{{
				PersonID: 1, SubjectIDs: matchedIDs,
			}},
			PositionResults: []query.PositionResult{{
				PositionKey: "golden", Contributions: contributions,
			}},
		},
		Facts:  query.FactSet{Subjects: querySubjects},
		Series: index,
	})
	if err != nil {
		t.Fatal(err)
	}
	if evaluation.UnitKind != expected.UnitKind || len(evaluation.People) != 1 {
		t.Fatalf("series evaluation boundary = %+v", evaluation)
	}
	person := evaluation.People[0]
	if len(person.Units) != expected.UnitCount ||
		person.Global.RatedUnitCount != expected.RatedUnitCount ||
		!reflect.DeepEqual(person.Global.AverageHundredths, expected.Average) ||
		!reflect.DeepEqual(person.Global.OverallHundredths, expected.Overall) ||
		!reflect.DeepEqual(person.Global.Distribution[:], expected.Distribution) ||
		!reflect.DeepEqual(person.Global.Timeline, expected.Timeline) {
		t.Fatalf("series evaluation = %+v, expected %+v", person, expected)
	}
	for offset, unit := range person.Units {
		want := expected.Units[offset]
		normalized := unit.GlobalScore
		var normalizedHundredths *int64
		if normalized != nil {
			value, valid, err := decimalFromFloat(*normalized)
			if err != nil || !valid {
				t.Fatalf("normalized unit score = %v, valid %v, err %v", normalized, valid, err)
			}
			hundredths, err := averageHundredths([]decimal{value})
			if err != nil {
				t.Fatal(err)
			}
			normalizedHundredths = &hundredths
		}
		if unit.UnitID != want.SeriesID ||
			!reflect.DeepEqual(unit.CompleteMemberIDs, want.CompleteMemberIDs) ||
			!reflect.DeepEqual(unit.MatchedMemberIDs, want.MatchedMemberIDs) ||
			!reflect.DeepEqual(normalizedHundredths, want.NormalizedRatingHundredths) ||
			len(unit.Contributions) != want.ContributionCount {
			t.Fatalf("series unit %d = %+v, expected %+v", offset, unit, want)
		}
	}
}

func intersectGoldenSubjects(people []struct {
	PersonID   int64   `json:"personId"`
	SubjectIDs []int64 `json:"subjectIds"`
}) []int64 {
	if len(people) == 0 {
		return []int64{}
	}
	current := make(map[int64]struct{}, len(people[0].SubjectIDs))
	for _, subjectID := range people[0].SubjectIDs {
		current[subjectID] = struct{}{}
	}
	for _, person := range people[1:] {
		next := make(map[int64]struct{}, len(person.SubjectIDs))
		for _, subjectID := range person.SubjectIDs {
			next[subjectID] = struct{}{}
		}
		for subjectID := range current {
			if _, exists := next[subjectID]; !exists {
				delete(current, subjectID)
			}
		}
	}
	result := make([]int64, 0, len(current))
	for subjectID := range current {
		result = append(result, subjectID)
	}
	sort.Slice(result, func(left, right int) bool { return result[left] < result[right] })
	return result
}

func goldenComponents(components []struct {
	SeriesID  int64   `json:"seriesId"`
	MemberIDs []int64 `json:"memberIds"`
}) ([]SeriesSubject, []Relation, []query.Subject) {
	subjects := make([]SeriesSubject, 0)
	relations := make([]Relation, 0)
	querySubjects := make([]query.Subject, 0)
	for _, component := range components {
		for _, subjectID := range component.MemberIDs {
			subjects = append(subjects, SeriesSubject{
				SubjectID: subjectID, SubjectType: "anime",
			})
			querySubjects = append(querySubjects, query.Subject{
				SubjectID: subjectID, SubjectType: "anime",
			})
		}
		for left := range component.MemberIDs {
			for right := left + 1; right < len(component.MemberIDs); right++ {
				relations = append(relations, Relation{
					SourceID: component.MemberIDs[left], SourceType: "anime",
					TargetID: component.MemberIDs[right], TargetType: "anime", RelationID: 9,
				})
			}
		}
	}
	return subjects, relations, querySubjects
}

func runPreferenceSummaryGolden(t *testing.T, test goldenCase) {
	if strings.HasPrefix(test.ID, "summary-") {
		runSummaryGolden(t, test)
		return
	}
	if test.ID == "preference-sparse-dense-equal-score" {
		var input struct {
			Variants []struct {
				Mode     UnitKind                  `json:"mode"`
				Subjects []preferenceGoldenSubject `json:"subjects"`
			} `json:"variants"`
		}
		var expected struct {
			Variants []PreferenceSummary `json:"variants"`
		}
		decodeGolden(t, test.Input, &input)
		decodeGolden(t, test.Expected, &expected)
		for index, variant := range input.Variants {
			actual, err := EvaluatePreference(context.Background(), "personal", variant.Mode, preferenceInputs(variant.Subjects))
			if err != nil {
				t.Fatal(err)
			}
			assertPreference(t, actual, &expected.Variants[index])
		}
		return
	}
	var input struct {
		Scope    string                    `json:"scope"`
		Mode     UnitKind                  `json:"mode"`
		Subjects []preferenceGoldenSubject `json:"subjects"`
		Series   []struct {
			SeriesID int64                     `json:"seriesId"`
			Subjects []preferenceGoldenSubject `json:"subjects"`
		} `json:"series"`
	}
	var expected struct {
		Preference *PreferenceSummary `json:"preference"`
	}
	decodeGolden(t, test.Input, &input)
	decodeGolden(t, test.Expected, &expected)
	values := preferenceInputs(input.Subjects)
	for _, series := range input.Series {
		for _, subject := range series.Subjects {
			subject.SeriesID = series.SeriesID
			values = append(values, preferenceInput(subject))
		}
	}
	actual, err := EvaluatePreference(context.Background(), input.Scope, input.Mode, values)
	if err != nil {
		t.Fatal(err)
	}
	assertPreference(t, actual, expected.Preference)
}

type preferenceGoldenSubject struct {
	SubjectID int64    `json:"subjectId"`
	SeriesID  int64    `json:"seriesId"`
	Personal  *float64 `json:"personalRating"`
	Global    *float64 `json:"globalRating"`
}

func preferenceInputs(values []preferenceGoldenSubject) []PreferenceInput {
	result := make([]PreferenceInput, len(values))
	for index, value := range values {
		result[index] = preferenceInput(value)
	}
	return result
}

func preferenceInput(value preferenceGoldenSubject) PreferenceInput {
	return PreferenceInput{
		SubjectID: value.SubjectID, SeriesID: value.SeriesID,
		PersonalScore: value.Personal, GlobalScore: value.Global,
	}
}

func assertPreference(t *testing.T, actual, expected *PreferenceSummary) {
	t.Helper()
	if !reflect.DeepEqual(actual, expected) {
		t.Fatalf("preference = %+v, expected %+v", actual, expected)
	}
}

func runSummaryGolden(t *testing.T, test goldenCase) {
	var input struct {
		UnitKind UnitKind `json:"unitKind"`
		People   []struct {
			PersonID      int64                `json:"personId"`
			UnitIDs       []int64              `json:"unitIds"`
			Contributions []query.Contribution `json:"contributions"`
			Series        []struct {
				SeriesID int64   `json:"seriesId"`
				Matched  []int64 `json:"matchedMemberIds"`
				Complete []int64 `json:"completeMemberIds"`
			} `json:"series"`
		} `json:"people"`
	}
	decodeGolden(t, test.Input, &input)
	people := make([]PersonEvidence, len(input.People))
	for index, person := range input.People {
		people[index].PersonID = person.PersonID
		for _, unitID := range person.UnitIDs {
			unitContributions := make([]query.Contribution, 0)
			for _, contribution := range person.Contributions {
				if contribution.SubjectID == unitID {
					unitContributions = append(unitContributions, contribution)
				}
			}
			people[index].Units = append(people[index].Units, Unit{
				Kind: UnitSubject, UnitID: unitID,
				CompleteMemberIDs: []int64{unitID}, MatchedMemberIDs: []int64{unitID},
				Contributions: unitContributions,
			})
		}
		for _, series := range person.Series {
			people[index].Units = append(people[index].Units, Unit{
				Kind: UnitSeries, UnitID: series.SeriesID,
				MatchedMemberIDs: series.Matched, CompleteMemberIDs: series.Complete,
			})
		}
	}
	actual, err := BuildSummary(context.Background(), input.UnitKind, people)
	if err != nil {
		t.Fatal(err)
	}
	var expected Summary
	decodeGolden(t, test.Expected, &expected)
	if !reflect.DeepEqual(actual, &expected) {
		t.Fatalf("summary = %+v, expected %+v", actual, expected)
	}
}

func runSortGolden(t *testing.T, test goldenCase) {
	var input struct {
		Profile SortProfile `json:"profile"`
		Entries []struct {
			PersonID          int64     `json:"personId"`
			Count             int       `json:"count"`
			Average           *int64    `json:"averageHundredths"`
			ValidRatingCount  int       `json:"validRatingCount"`
			Overall           *int64    `json:"overallHundredths"`
			Preference        *Rational `json:"preference"`
			EffectiveEvidence int       `json:"effectiveEvidence"`
			UnitID            int64     `json:"unitId"`
			Selected          *int64    `json:"selectedMetricHundredths"`
			Global            *int64    `json:"globalScoreHundredths"`
			PersonIDs         []int64   `json:"personIds"`
			CommonCount       int       `json:"commonCount"`
		} `json:"entries"`
	}
	decodeGolden(t, test.Input, &input)
	var expected struct {
		Descending json.RawMessage `json:"descendingIds"`
		Ascending  json.RawMessage `json:"ascendingIds"`
	}
	decodeGolden(t, test.Expected, &expected)
	switch input.Profile {
	case SortPersonCount, SortPersonAverage, SortPersonOverall, SortPersonPreference:
		entries := make([]PersonSortEntry, len(input.Entries))
		for index, value := range input.Entries {
			entries[index] = PersonSortEntry{
				PersonID: value.PersonID, Count: value.Count,
				AverageHundredths: value.Average, ValidRatingCount: value.ValidRatingCount,
				OverallHundredths: value.Overall, Preference: value.Preference,
				EffectiveEvidence: value.EffectiveEvidence,
			}
		}
		var wantDescending, wantAscending []int64
		decodeGolden(t, expected.Descending, &wantDescending)
		decodeGolden(t, expected.Ascending, &wantAscending)
		descending, err := SortPeople(context.Background(), input.Profile, Descending, entries)
		if err != nil {
			t.Fatal(err)
		}
		ascending, err := SortPeople(context.Background(), input.Profile, Ascending, entries)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(descending, wantDescending) || !reflect.DeepEqual(ascending, wantAscending) {
			t.Fatalf("orders = %v/%v, want %v/%v", descending, ascending, wantDescending, wantAscending)
		}
	case SortUnitSelectedMetric:
		entries := make([]UnitSortEntry, len(input.Entries))
		for index, value := range input.Entries {
			entries[index] = UnitSortEntry{
				UnitID: value.UnitID, SelectedMetricHundredths: value.Selected,
				GlobalScoreHundredths: value.Global,
			}
		}
		var wantDescending, wantAscending []int64
		decodeGolden(t, expected.Descending, &wantDescending)
		decodeGolden(t, expected.Ascending, &wantAscending)
		descending, err := SortUnits(context.Background(), Descending, entries)
		if err != nil {
			t.Fatal(err)
		}
		ascending, err := SortUnits(context.Background(), Ascending, entries)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(descending, wantDescending) || !reflect.DeepEqual(ascending, wantAscending) {
			t.Fatalf("orders = %v/%v, want %v/%v", descending, ascending, wantDescending, wantAscending)
		}
	case SortPersonCombination:
		entries := make([]CombinationSortEntry, len(input.Entries))
		for index, value := range input.Entries {
			entries[index] = CombinationSortEntry{
				PersonIDs: value.PersonIDs, CommonCount: value.CommonCount,
				AverageHundredths: value.Average,
			}
		}
		var wantDescending, wantAscending [][]int64
		decodeGolden(t, expected.Descending, &wantDescending)
		decodeGolden(t, expected.Ascending, &wantAscending)
		descending, err := SortCombinations(context.Background(), Descending, entries)
		if err != nil {
			t.Fatal(err)
		}
		ascending, err := SortCombinations(context.Background(), Ascending, entries)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(descending, wantDescending) || !reflect.DeepEqual(ascending, wantAscending) {
			t.Fatalf("orders = %v/%v, want %v/%v", descending, ascending, wantDescending, wantAscending)
		}
	default:
		t.Fatalf("unhandled sort profile %q", input.Profile)
	}
}

func scoreFromRaw(t *testing.T, raw json.RawMessage) *float64 {
	t.Helper()
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var value float64
	if err := json.Unmarshal(raw, &value); err == nil {
		return &value
	}
	var sentinel struct {
		Sentinel string `json:"sentinel"`
	}
	decodeGolden(t, raw, &sentinel)
	switch sentinel.Sentinel {
	case "NaN":
		value = math.NaN()
	case "PositiveInfinity":
		value = math.Inf(1)
	case "NegativeInfinity":
		value = math.Inf(-1)
	default:
		t.Fatalf("unknown score sentinel %q", sentinel.Sentinel)
	}
	return &value
}

func unitIDs(values []Unit) []int64 {
	result := make([]int64, len(values))
	for index, value := range values {
		result[index] = value.UnitID
	}
	return result
}

func statisticsGoldenRoot(t *testing.T) string {
	t.Helper()
	_, current, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve golden test path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(current), "..", "..", "..", "contracts", "goldens", "statistics"))
}

func readGoldenFile(t *testing.T, path string) goldenFile {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var document goldenFile
	decodeGolden(t, data, &document)
	return document
}

func decodeGolden(t *testing.T, data []byte, destination any) {
	t.Helper()
	if err := json.Unmarshal(data, destination); err != nil {
		t.Fatal(err)
	}
}
