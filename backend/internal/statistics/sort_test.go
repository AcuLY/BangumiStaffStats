package statistics

import (
	"context"
	"reflect"
	"strconv"
	"testing"
)

func TestSortPeopleGoldenChains(t *testing.T) {
	value := func(input int64) *int64 { return &input }
	rational := func(numerator, denominator int64) *Rational {
		return &Rational{
			Numerator:   strconv.FormatInt(numerator, 10),
			Denominator: strconv.FormatInt(denominator, 10),
		}
	}
	tests := []struct {
		name    string
		profile SortProfile
		entries []PersonSortEntry
		desc    []int64
		asc     []int64
	}{
		{
			name: "count", profile: SortPersonCount,
			entries: []PersonSortEntry{
				{PersonID: 1, Count: 5, AverageHundredths: value(800), ValidRatingCount: 3},
				{PersonID: 2, Count: 2},
				{PersonID: 3, Count: 5, AverageHundredths: value(800), ValidRatingCount: 3},
				{PersonID: 4, Count: 5, AverageHundredths: value(900), ValidRatingCount: 1},
				{PersonID: 5, Count: 2, AverageHundredths: value(700), ValidRatingCount: 2},
			},
			desc: []int64{4, 1, 3, 5, 2}, asc: []int64{5, 2, 4, 1, 3},
		},
		{
			name: "average", profile: SortPersonAverage,
			entries: []PersonSortEntry{
				{PersonID: 1, Count: 5, AverageHundredths: value(800), ValidRatingCount: 3},
				{PersonID: 2, Count: 9},
				{PersonID: 3, Count: 5, AverageHundredths: value(800), ValidRatingCount: 3},
				{PersonID: 4, Count: 2, AverageHundredths: value(800), ValidRatingCount: 4},
				{PersonID: 5, Count: 10, AverageHundredths: value(700), ValidRatingCount: 2},
				{PersonID: 6, Count: 1, AverageHundredths: value(900), ValidRatingCount: 1},
			},
			desc: []int64{6, 4, 1, 3, 5, 2}, asc: []int64{5, 4, 1, 3, 6, 2},
		},
		{
			name: "preference", profile: SortPersonPreference,
			entries: []PersonSortEntry{
				{PersonID: 1, Count: 5, AverageHundredths: value(800), Preference: rational(1, 2), EffectiveEvidence: 1},
				{PersonID: 2, Count: 9},
				{PersonID: 3, Count: 2, AverageHundredths: value(700), Preference: rational(1, 2), EffectiveEvidence: 5},
				{PersonID: 4, Count: 9, AverageHundredths: value(900), Preference: rational(-1, 2), EffectiveEvidence: 10},
				{PersonID: 5, Count: 2, AverageHundredths: value(700), Preference: rational(1, 2), EffectiveEvidence: 5},
				{PersonID: 6, Count: 1, AverageHundredths: value(500), Preference: rational(1, 1), EffectiveEvidence: 1},
			},
			desc: []int64{6, 3, 5, 1, 4, 2}, asc: []int64{4, 3, 5, 1, 6, 2},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			descending, err := SortPeople(context.Background(), test.profile, Descending, test.entries)
			if err != nil {
				t.Fatal(err)
			}
			ascending, err := SortPeople(context.Background(), test.profile, Ascending, test.entries)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(descending, test.desc) || !reflect.DeepEqual(ascending, test.asc) {
				t.Fatalf("orders = %v / %v, want %v / %v", descending, ascending, test.desc, test.asc)
			}
		})
	}
}

func TestSortUnitsSecondaryGlobalScoreMissingLast(t *testing.T) {
	value := func(input int64) *int64 { return &input }
	entries := []UnitSortEntry{
		{UnitID: 1, SelectedMetricHundredths: value(800), GlobalScoreHundredths: value(900)},
		{UnitID: 2, SelectedMetricHundredths: value(800)},
		{UnitID: 3, SelectedMetricHundredths: value(800), GlobalScoreHundredths: value(950)},
		{UnitID: 4},
	}
	for _, direction := range []Direction{Ascending, Descending} {
		got, err := SortUnits(context.Background(), direction, entries)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got, []int64{3, 1, 2, 4}) {
			t.Fatalf("%s order = %v, want valid secondary then missing", direction, got)
		}
	}
}

func TestSortSeriesAllUnratedRemainsStable(t *testing.T) {
	got, err := SortUnits(context.Background(), Descending, []UnitSortEntry{
		{UnitID: 30}, {UnitID: 10}, {UnitID: 20},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, []int64{10, 20, 30}) {
		t.Fatalf("all-unrated order = %v", got)
	}
}

func TestSortCombinationsDoesNotMutateInput(t *testing.T) {
	value := int64(800)
	input := []CombinationSortEntry{
		{PersonIDs: []int64{2, 1}, CommonCount: 3, AverageHundredths: &value},
		{PersonIDs: []int64{3, 2}, CommonCount: 4, AverageHundredths: &value},
	}
	got, err := SortCombinations(context.Background(), Descending, input)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, [][]int64{{2, 3}, {1, 2}}) {
		t.Fatalf("order = %v", got)
	}
	if !reflect.DeepEqual(input[0].PersonIDs, []int64{2, 1}) {
		t.Fatalf("input mutated: %+v", input)
	}
}

func FuzzSortPersonAverage(f *testing.F) {
	f.Add(int64(1), int64(2), int64(800), int64(700))
	f.Fuzz(func(t *testing.T, firstID, secondID, firstAverage, secondAverage int64) {
		if firstID <= 0 || secondID <= 0 || firstID == secondID {
			return
		}
		entries := []PersonSortEntry{
			{PersonID: firstID, AverageHundredths: &firstAverage},
			{PersonID: secondID, AverageHundredths: &secondAverage},
		}
		result, err := SortPeople(context.Background(), SortPersonAverage, Descending, entries)
		if err != nil {
			t.Fatal(err)
		}
		if len(result) != 2 || result[0] == result[1] {
			t.Fatalf("entity set lost: %v", result)
		}
	})
}
