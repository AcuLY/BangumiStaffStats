package statistics

import (
	"context"
	"reflect"
	"testing"
)

func TestEvaluateRatingsSentinels(t *testing.T) {
	score := func(value float64) *float64 { return &value }
	date := func(value string) *string { return &value }
	result, err := EvaluateRatings(context.Background(), UnitSubject, []RatingInput{
		{UnitID: 1, Score: score(6), Date: date("2024-01")},
		{UnitID: 2, Score: score(7), Date: date("2024-02-29")},
		{UnitID: 3, Score: score(7), Date: date("2024-03-31")},
		{UnitID: 4, Score: score(0)},
		{UnitID: 5},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.UnitCount != 5 || result.RatedUnitCount != 3 ||
		result.AverageHundredths == nil || *result.AverageHundredths != 666 ||
		result.OverallHundredths == nil || *result.OverallHundredths != 562 {
		t.Fatalf("unexpected summary: %+v", result)
	}
	wantDistribution := [10]int{0, 0, 0, 0, 0, 1, 2, 0, 0, 0}
	if result.Distribution != wantDistribution {
		t.Fatalf("distribution = %v, want %v", result.Distribution, wantDistribution)
	}
	wantTimeline := []TimelinePoint{{Year: 2024, Quarter: 1, RatedUnitCount: 3, AverageHundredths: 666}}
	if !reflect.DeepEqual(result.Timeline, wantTimeline) {
		t.Fatalf("timeline = %+v, want %+v", result.Timeline, wantTimeline)
	}
}

func TestRatingCountValidation(t *testing.T) {
	if got, err := RatingCount([]int64{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}); err != nil || got != 55 {
		t.Fatalf("RatingCount = %d, %v; want 55", got, err)
	}
	if _, err := ValidateRatingCountValues([]float64{0, 0, 0, 0, 1.5, 0, 0, 0, 0, 0}); errorCodeOrEmpty(err) != CodeRatingCountInvalid {
		t.Fatalf("fractional bucket error = %v", err)
	}
}

func TestRatingQuarterUsesCanonicalDateEligibility(t *testing.T) {
	for _, test := range []struct {
		date           string
		year, quarter  int
		dated, invalid bool
	}{
		{date: ""},
		{date: "2024"},
		{date: "2024-01", year: 2024, quarter: 1, dated: true},
		{date: "2024-04-10", year: 2024, quarter: 2, dated: true},
		{date: "2024-09", year: 2024, quarter: 3, dated: true},
		{date: "2024-12-31", year: 2024, quarter: 4, dated: true},
		{date: "2024-13", invalid: true},
		{date: "2024-1", invalid: true},
	} {
		t.Run(test.date, func(t *testing.T) {
			var value *string
			if test.date != "" {
				value = &test.date
			}
			year, quarter, dated, err := RatingQuarter(value)
			if (err != nil) != test.invalid || year != test.year || quarter != test.quarter || dated != test.dated {
				t.Fatalf("RatingQuarter(%q) = %d, %d, %v, %v", test.date, year, quarter, dated, err)
			}
		})
	}
}
