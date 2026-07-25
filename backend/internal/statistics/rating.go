package statistics

import (
	"context"
	"math"
	"sort"
)

// EvaluateRatings evaluates one immutable unit list and returns no partial
// result on invalid input or cancellation.
func EvaluateRatings(
	ctx context.Context,
	kind UnitKind,
	units []RatingInput,
	ratingBuckets []int64,
) (*RatingSummary, error) {
	if err := contextError(ctx); err != nil {
		return nil, err
	}
	if !validUnitKind(kind) {
		return nil, outcome(CodeInputInvalid)
	}
	ratingCount, err := RatingCount(ratingBuckets)
	if err != nil {
		return nil, err
	}

	seen := make(map[int64]struct{}, len(units))
	values := make([]decimal, 0, len(units))
	validIDs := make([]int64, 0, len(units))
	timeline := make(map[[2]int][]decimal)
	var distribution [10]int
	for _, unit := range units {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		if unit.UnitID <= 0 {
			return nil, outcome(CodeInputInvalid)
		}
		if _, duplicate := seen[unit.UnitID]; duplicate {
			return nil, outcome(CodeInputInvalid)
		}
		seen[unit.UnitID] = struct{}{}
		if unit.Score == nil {
			continue
		}
		value, valid, err := decimalFromFloat(*unit.Score)
		if err != nil {
			return nil, err
		}
		if !valid {
			continue
		}
		bucket, err := distributionBucket(value)
		if err != nil {
			return nil, err
		}
		values = append(values, value)
		validIDs = append(validIDs, unit.UnitID)
		distribution[bucket-1]++

		if kind == UnitSubject && unit.Date != nil {
			date, precision, err := canonicalDate(unit.Date)
			if err != nil {
				return nil, err
			}
			if precision >= 2 {
				year := 0
				month := 0
				for index := 0; index < 4; index++ {
					year = year*10 + int(date[index]-'0')
				}
				month = int(date[5]-'0')*10 + int(date[6]-'0')
				quarter := (month-1)/3 + 1
				timeline[[2]int{year, quarter}] = append(
					timeline[[2]int{year, quarter}],
					value,
				)
			}
		}
	}
	sort.Slice(validIDs, func(left, right int) bool { return validIDs[left] < validIDs[right] })

	result := &RatingSummary{
		UnitCount:         len(units),
		RatedUnitCount:    len(values),
		RatingCount:       ratingCount,
		Distribution:      distribution,
		Timeline:          make([]TimelinePoint, 0, len(timeline)),
		ValidRatedUnitIDs: validIDs,
	}
	if len(values) != 0 {
		average, err := averageHundredths(values)
		if err != nil {
			return nil, err
		}
		overall, err := overallHundredths(average, len(values))
		if err != nil {
			return nil, err
		}
		result.AverageHundredths = &average
		result.OverallHundredths = &overall
	}
	if kind == UnitSubject {
		keys := make([][2]int, 0, len(timeline))
		for key := range timeline {
			keys = append(keys, key)
		}
		sort.Slice(keys, func(left, right int) bool {
			if keys[left][0] != keys[right][0] {
				return keys[left][0] < keys[right][0]
			}
			return keys[left][1] < keys[right][1]
		})
		for _, key := range keys {
			average, err := averageHundredths(timeline[key])
			if err != nil {
				return nil, err
			}
			result.Timeline = append(result.Timeline, TimelinePoint{
				Year:              key[0],
				Quarter:           key[1],
				RatedUnitCount:    len(timeline[key]),
				AverageHundredths: average,
			})
		}
	}
	if err := contextError(ctx); err != nil {
		return nil, err
	}
	return result, nil
}

// RatingCount validates and totals explicit 1..10 vote buckets.
func RatingCount(buckets []int64) (int64, error) {
	if len(buckets) == 0 {
		return 0, nil
	}
	if len(buckets) != 10 {
		return 0, outcome(CodeRatingCountInvalid)
	}
	var total int64
	for _, count := range buckets {
		if count < 0 || count > math.MaxInt64-total {
			return 0, outcome(CodeRatingCountInvalid)
		}
		total += count
	}
	return total, nil
}

// ValidateRatingCountValues is used at untyped corpus/import boundaries before
// conversion to the integer production representation.
func ValidateRatingCountValues(buckets []float64) (int64, error) {
	if len(buckets) != 10 {
		return 0, outcome(CodeRatingCountInvalid)
	}
	values := make([]int64, len(buckets))
	for index, value := range buckets {
		if math.IsNaN(value) || math.IsInf(value, 0) ||
			value < 0 || value != math.Trunc(value) || value > math.MaxInt64 {
			return 0, outcome(CodeRatingCountInvalid)
		}
		values[index] = int64(value)
	}
	return RatingCount(values)
}
