package statistics

import (
	"context"
	"encoding/json"
	"math/big"
	"reflect"
	"strings"
	"testing"
)

func TestEvaluatePreferenceSubjectAndSeries(t *testing.T) {
	score := func(value float64) *float64 { return &value }
	subject, err := EvaluatePreference(context.Background(), "personal", UnitSubject, []PreferenceInput{
		{SubjectID: 51, SeriesID: 50, PersonalScore: score(8), GlobalScore: score(7)},
		{SubjectID: 52, SeriesID: 50, PersonalScore: score(7), GlobalScore: score(6)},
	})
	if err != nil {
		t.Fatal(err)
	}
	if subject.ComparableCount != 2 || subject.ComparableSeriesCount != 1 ||
		subject.EffectiveEvidence != 2 || *subject.Score != (Rational{Numerator: "2", Denominator: "7"}) {
		t.Fatalf("subject preference = %+v", subject)
	}
	series, err := EvaluatePreference(context.Background(), "personal", UnitSeries, []PreferenceInput{
		{SubjectID: 10, SeriesID: 10, PersonalScore: score(8), GlobalScore: score(6)},
		{SubjectID: 11, SeriesID: 10, PersonalScore: score(9), GlobalScore: score(5)},
		{SubjectID: 20, SeriesID: 20, PersonalScore: score(7), GlobalScore: score(7)},
	})
	if err != nil {
		t.Fatal(err)
	}
	if series.ComparableCount != 3 || series.EffectiveEvidence != 2 ||
		*series.Mean != (Rational{Numerator: "3", Denominator: "2"}) ||
		*series.Score != (Rational{Numerator: "3", Denominator: "7"}) ||
		!reflect.DeepEqual(series.UnitIDs, []int64{10, 20}) {
		t.Fatalf("series preference = %+v", series)
	}
}

func TestEvaluatePreferenceGlobalDoesNotInspectInput(t *testing.T) {
	invalid := -1.0
	result, err := EvaluatePreference(context.Background(), "global", UnitSubject, []PreferenceInput{
		{SubjectID: -1, PersonalScore: &invalid},
	})
	if err != nil || result != nil {
		t.Fatalf("global preference = %+v, %v; want nil, nil", result, err)
	}
}

func TestPreferenceRationalExceedsInt64WithoutPrecisionLoss(t *testing.T) {
	one := 1.0
	next := 1.0000000000000002
	inputs := make([]PreferenceInput, 2048)
	inputs[0] = PreferenceInput{
		SubjectID: 1, PersonalScore: &next, GlobalScore: &one,
	}
	for index := 1; index < len(inputs); index++ {
		inputs[index] = PreferenceInput{
			SubjectID:     int64(index + 1),
			PersonalScore: &one,
			GlobalScore:   &one,
		}
	}
	result, err := EvaluatePreference(context.Background(), "personal", UnitSubject, inputs)
	if err != nil {
		t.Fatal(err)
	}
	denominator, ok := new(big.Int).SetString(result.Mean.Denominator, 10)
	if !ok || denominator.IsInt64() {
		t.Fatalf("mean denominator = %q, want valid value beyond int64", result.Mean.Denominator)
	}
	encoded, err := json.Marshal(result.Mean)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(encoded), `"numerator":"`) ||
		!strings.Contains(string(encoded), `"denominator":"`) {
		t.Fatalf("rational JSON is not string-exact: %s", encoded)
	}
}

func TestRationalGoldenNumberInputNormalizesToStringJSON(t *testing.T) {
	var value Rational
	if err := json.Unmarshal(
		[]byte(`{"numerator":-2,"denominator":3}`),
		&value,
	); err != nil {
		t.Fatal(err)
	}
	if value != (Rational{Numerator: "-2", Denominator: "3"}) {
		t.Fatalf("decoded rational = %+v", value)
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != `{"numerator":"-2","denominator":"3"}` {
		t.Fatalf("encoded rational = %s", encoded)
	}
}
