package statistics

import (
	"context"
	"math/big"
)

// MetricScale describes one selected metric over a complete population.
// Max is nil, an int64, or a Rational value; it never aliases input evidence.
type MetricScale struct {
	Metric string `json:"metric"`
	Kind   string `json:"kind"`
	Max    any    `json:"max"`
}

// PersonMetricScale preserves ranking scale semantics for all person lists.
// Callers supply their complete eligible population before search/pagination.
func PersonMetricScale(ctx context.Context, metric string, entries []PersonSortEntry) (MetricScale, error) {
	if err := contextError(ctx); err != nil {
		return MetricScale{}, err
	}
	result := MetricScale{Metric: metric, Kind: "linear"}
	switch metric {
	case "count":
		if len(entries) == 0 {
			return result, nil
		}
		var maximum int64
		for _, entry := range entries {
			if err := contextError(ctx); err != nil {
				return MetricScale{}, err
			}
			if int64(entry.Count) > maximum {
				maximum = int64(entry.Count)
			}
		}
		result.Max = maximum
	case "average", "overall":
		var maximum *int64
		for _, entry := range entries {
			if err := contextError(ctx); err != nil {
				return MetricScale{}, err
			}
			value := entry.AverageHundredths
			if metric == "overall" {
				value = entry.OverallHundredths
			}
			if value != nil && (maximum == nil || *value > *maximum) {
				copy := *value
				maximum = &copy
			}
		}
		if maximum != nil {
			result.Max = *maximum
		}
	case "preference":
		var maximum *Rational
		for _, entry := range entries {
			if err := contextError(ctx); err != nil {
				return MetricScale{}, err
			}
			if entry.Preference == nil {
				continue
			}
			absolute, err := absoluteMetricRational(*entry.Preference)
			if err != nil {
				return MetricScale{}, err
			}
			if maximum == nil {
				maximum = &absolute
				continue
			}
			compared, err := absolute.Compare(*maximum)
			if err != nil {
				return MetricScale{}, err
			}
			if compared > 0 {
				maximum = &absolute
			}
		}
		if maximum != nil {
			result.Max = *maximum
		}
	default:
		return MetricScale{}, outcome(CodeInputInvalid)
	}
	return result, nil
}

func absoluteMetricRational(value Rational) (Rational, error) {
	numerator, ok := new(big.Int).SetString(value.Numerator, 10)
	if !ok {
		return Rational{}, outcome(CodeInputInvalid)
	}
	numerator.Abs(numerator)
	result := Rational{Numerator: numerator.String(), Denominator: value.Denominator}
	if _, err := result.Compare(result); err != nil {
		return Rational{}, err
	}
	return result, nil
}
