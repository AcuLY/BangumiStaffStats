package statistics

import (
	"context"
	"math/big"
	"sort"
)

// PreferenceInput is one raw Subject comparison. SeriesID is the natural
// component identity even when subject mode is selected.
type PreferenceInput struct {
	SubjectID     int64
	SeriesID      int64
	PersonalScore *float64
	GlobalScore   *float64
}

// EvaluatePreference returns nil for global scope without inspecting inputs.
func EvaluatePreference(
	ctx context.Context,
	scope string,
	kind UnitKind,
	inputs []PreferenceInput,
) (*PreferenceSummary, error) {
	if err := contextError(ctx); err != nil {
		return nil, err
	}
	if scope == "global" {
		return nil, nil
	}
	if scope != "personal" || !validUnitKind(kind) {
		return nil, outcome(CodeInputInvalid)
	}
	type evidence struct {
		subjectID  int64
		seriesID   int64
		difference *big.Rat
	}
	seen := make(map[int64]struct{}, len(inputs))
	values := make([]evidence, 0, len(inputs))
	seriesSeen := make(map[int64]struct{})
	for _, input := range inputs {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		if input.SubjectID <= 0 {
			return nil, outcome(CodeInputInvalid)
		}
		if _, duplicate := seen[input.SubjectID]; duplicate {
			return nil, outcome(CodeInputInvalid)
		}
		seen[input.SubjectID] = struct{}{}
		if input.PersonalScore == nil || input.GlobalScore == nil {
			continue
		}
		personal, personalValid, err := decimalFromFloat(*input.PersonalScore)
		if err != nil {
			return nil, err
		}
		global, globalValid, err := decimalFromFloat(*input.GlobalScore)
		if err != nil {
			return nil, err
		}
		if !personalValid || !globalValid {
			continue
		}
		seriesID := input.SeriesID
		if seriesID <= 0 {
			seriesID = input.SubjectID
		}
		seriesSeen[seriesID] = struct{}{}
		values = append(values, evidence{
			subjectID:  input.SubjectID,
			seriesID:   seriesID,
			difference: new(big.Rat).Sub(personal.value, global.value),
		})
	}
	sort.Slice(values, func(left, right int) bool {
		return values[left].subjectID < values[right].subjectID
	})
	result := &PreferenceSummary{
		ComparableCount:       len(values),
		ComparableSeriesCount: len(seriesSeen),
		EvidenceWeight:        Rational{Numerator: "0", Denominator: "1"},
		SourceSubjectIDs:      make([]int64, 0, len(values)),
		UnitIDs:               make([]int64, 0, len(values)),
	}
	for _, value := range values {
		result.SourceSubjectIDs = append(result.SourceSubjectIDs, value.subjectID)
	}
	if len(values) == 0 {
		return result, nil
	}

	observations := make([]*big.Rat, 0, len(values))
	if kind == UnitSubject {
		result.EffectiveEvidence = len(values)
		for _, value := range values {
			observations = append(observations, new(big.Rat).Set(value.difference))
			result.UnitIDs = append(result.UnitIDs, value.subjectID)
		}
	} else {
		grouped := make(map[int64][]*big.Rat)
		for _, value := range values {
			grouped[value.seriesID] = append(grouped[value.seriesID], value.difference)
		}
		seriesIDs := make([]int64, 0, len(grouped))
		for seriesID := range grouped {
			seriesIDs = append(seriesIDs, seriesID)
		}
		sort.Slice(seriesIDs, func(left, right int) bool { return seriesIDs[left] < seriesIDs[right] })
		for _, seriesID := range seriesIDs {
			mean := rationalMean(grouped[seriesID])
			publicMean, err := rationalFromBig(mean)
			if err != nil {
				return nil, err
			}
			observations = append(observations, mean)
			result.UnitIDs = append(result.UnitIDs, seriesID)
			if result.UnitMeans == nil {
				result.UnitMeans = make([]PreferenceUnit, 0, len(seriesIDs))
			}
			result.UnitMeans = append(result.UnitMeans, PreferenceUnit{
				SeriesID: seriesID,
				Mean:     publicMean,
			})
		}
		result.EffectiveEvidence = len(seriesIDs)
	}

	mean := rationalMean(observations)
	weight := new(big.Rat).SetFrac(
		big.NewInt(int64(result.EffectiveEvidence)),
		big.NewInt(int64(result.EffectiveEvidence+5)),
	)
	score := new(big.Rat).Mul(mean, weight)
	publicMean, err := rationalFromBig(mean)
	if err != nil {
		return nil, err
	}
	publicWeight, err := rationalFromBig(weight)
	if err != nil {
		return nil, err
	}
	publicScore, err := rationalFromBig(score)
	if err != nil {
		return nil, err
	}
	result.Mean = &publicMean
	result.EvidenceWeight = publicWeight
	result.Score = &publicScore
	if err := contextError(ctx); err != nil {
		return nil, err
	}
	return result, nil
}

func rationalMean(values []*big.Rat) *big.Rat {
	sum := new(big.Rat)
	for _, value := range values {
		sum.Add(sum, value)
	}
	return sum.Quo(sum, new(big.Rat).SetInt64(int64(len(values))))
}

func rationalFromBig(value *big.Rat) (Rational, error) {
	return newRational(value.Num(), value.Denom())
}
