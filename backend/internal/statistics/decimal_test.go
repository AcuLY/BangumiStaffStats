package statistics

import (
	"math"
	"testing"
)

func TestDecimalShortestRoundTripAndRounding(t *testing.T) {
	for _, test := range []struct {
		name   string
		values []float64
		want   int64
	}{
		{name: "eight point two", values: []float64{8.20}, want: 820},
		{name: "floor", values: []float64{1, 2, 2}, want: 166},
		{name: "quarter", values: []float64{6, 7, 7}, want: 666},
	} {
		t.Run(test.name, func(t *testing.T) {
			values := make([]decimal, 0, len(test.values))
			for _, input := range test.values {
				value, valid, err := decimalFromFloat(input)
				if err != nil || !valid {
					t.Fatalf("decimalFromFloat(%v) = valid %v, err %v", input, valid, err)
				}
				values = append(values, value)
			}
			got, err := averageHundredths(values)
			if err != nil {
				t.Fatal(err)
			}
			if got != test.want {
				t.Fatalf("average = %d, want %d", got, test.want)
			}
		})
	}
	if got, err := overallHundredths(101, 1); err != nil || got != 434 {
		t.Fatalf("overall half-up = %d, %v; want 434", got, err)
	}
}

func TestDecimalInvalidAndNegativeZero(t *testing.T) {
	for _, input := range []float64{0.99, 10.01, -1, math.NaN(), math.Inf(1), math.Inf(-1)} {
		if _, _, err := decimalFromFloat(input); errorCodeOrEmpty(err) != CodeScoreInvalid {
			t.Fatalf("decimalFromFloat(%v) error = %v", input, err)
		}
	}
	if _, valid, err := decimalFromFloat(math.Copysign(0, -1)); err != nil || valid {
		t.Fatalf("negative zero = valid %v, err %v; want unrated", valid, err)
	}
}

func errorCodeOrEmpty(err error) Code {
	code, _ := ErrorCode(err)
	return code
}

func FuzzDecimalBoundary(f *testing.F) {
	for _, seed := range []float64{0, -0.0, 0.99, 1, 6.66, 8.2, 10, 10.01} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, input float64) {
		value, valid, err := decimalFromFloat(input)
		if err != nil || !valid {
			return
		}
		if value.value.Cmp(decimalFromHundredths(100).value) < 0 ||
			value.value.Cmp(decimalFromHundredths(1000).value) > 0 {
			t.Fatalf("valid decimal outside accepted range: %v", input)
		}
	})
}
