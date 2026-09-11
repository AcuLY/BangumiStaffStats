package statistics

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestPersonMetricScalePreservesExactCompletePopulationMaxima(t *testing.T) {
	low, high := int64(501), int64(899)
	positive := Rational{Numerator: "1", Denominator: "5"}
	negative := Rational{Numerator: "-4", Denominator: "5"}
	zero := Rational{Numerator: "0", Denominator: "1"}
	entries := []PersonSortEntry{
		{Count: 7, AverageHundredths: &low, OverallHundredths: &high, Preference: &positive},
		{Count: 2, AverageHundredths: &high, OverallHundredths: &low, Preference: &negative},
		{Count: 1},
	}
	for _, test := range []struct {
		name, metric string
		entries      []PersonSortEntry
		maximum      any
	}{
		{"count", "count", entries, int64(7)},
		{"average", "average", entries, high},
		{"overall", "overall", entries, high},
		{"absolute preference", "preference", entries, Rational{Numerator: "4", Denominator: "5"}},
		{"empty count", "count", nil, nil},
		{"empty average", "average", nil, nil},
		{"missing overall", "overall", []PersonSortEntry{{Count: 1}}, nil},
		{"missing preference", "preference", []PersonSortEntry{{Count: 1}}, nil},
		{"zero count", "count", []PersonSortEntry{{}}, int64(0)},
		{"zero preference", "preference", []PersonSortEntry{{Preference: &zero}}, zero},
	} {
		t.Run(test.name, func(t *testing.T) {
			got, err := PersonMetricScale(context.Background(), test.metric, test.entries)
			want := MetricScale{Metric: test.metric, Kind: "linear", Max: test.maximum}
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("scale = %#v, error %v; want %#v", got, err, want)
			}
		})
	}
	if negative.Numerator != "-4" || positive.Numerator != "1" {
		t.Fatal("absolute maximum changed original signed evidence")
	}
}

func TestPersonMetricScaleComparesBeyondFloatPrecisionAndDoesNotAlias(t *testing.T) {
	first := Rational{Numerator: "9007199254740993", Denominator: "9007199254740994"}
	second := Rational{Numerator: "-9007199254740994", Denominator: "9007199254740995"}
	got, err := PersonMetricScale(context.Background(), "preference", []PersonSortEntry{{Preference: &first}, {Preference: &second}})
	if err != nil {
		t.Fatal(err)
	}
	second.Numerator = "0"
	want := Rational{Numerator: "9007199254740994", Denominator: "9007199254740995"}
	if got.Max != want {
		t.Fatalf("exact maximum = %#v, want %#v", got.Max, want)
	}
	average := int64(850)
	numeric, err := PersonMetricScale(context.Background(), "average", []PersonSortEntry{{AverageHundredths: &average}})
	if err != nil {
		t.Fatal(err)
	}
	average = 1
	if numeric.Max != int64(850) {
		t.Fatalf("integer maximum aliases input: %#v", numeric.Max)
	}
}

func TestPersonMetricScaleRejectsInvalidInputAndCancellation(t *testing.T) {
	for _, invalid := range []Rational{
		{Numerator: "bad", Denominator: "1"},
		{Numerator: "1", Denominator: "0"},
	} {
		if _, err := PersonMetricScale(context.Background(), "preference", []PersonSortEntry{{Preference: &invalid}}); err == nil {
			t.Fatalf("invalid rational accepted: %+v", invalid)
		}
	}
	if _, err := PersonMetricScale(context.Background(), "unsupported", nil); err == nil {
		t.Fatal("unsupported metric accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	got, err := PersonMetricScale(ctx, "count", []PersonSortEntry{{Count: 3}})
	if !errors.Is(err, context.Canceled) || got != (MetricScale{}) {
		t.Fatalf("canceled scale = %+v, error %v", got, err)
	}
}
