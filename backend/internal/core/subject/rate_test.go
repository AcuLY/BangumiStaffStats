package subject

import (
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

func subjectsWithRates(rates ...float64) []*model.Subject {
	subjs := make([]*model.Subject, 0, len(rates))
	for _, rate := range rates {
		subjs = append(subjs, &model.Subject{Rate: rate})
	}
	return subjs
}

func TestCalcAverageIgnoresZeroRatesAndFloorsToTwoDecimals(t *testing.T) {
	got := CalcAverage(subjectsWithRates(6, 7, 7, 0))
	want := 6.66
	if got != want {
		t.Fatalf("CalcAverage() = %v, want %v", got, want)
	}
}

func TestCalcOverallUsesValidRateCount(t *testing.T) {
	tests := []struct {
		name  string
		rates []float64
		want  float64
	}{
		{name: "empty", want: 0},
		{name: "all unrated", rates: []float64{0, 0}, want: 0},
		{name: "one rated", rates: []float64{8}, want: 5.5},
		{name: "unrated entries do not add weight", rates: []float64{8, 0, 0}, want: 5.5},
		{name: "floored average is used before final rounding", rates: []float64{6, 7, 7}, want: 5.62},
		{name: "unrated merged series does not add weight", rates: []float64{6.5, 0}, want: 5.25},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcOverall(subjectsWithRates(tt.rates...))
			if got != tt.want {
				t.Fatalf("CalcOverall() = %v, want %v", got, tt.want)
			}
		})
	}
}
