package statistics

import (
	"context"
	"sort"
	"strconv"
	"strings"
)

// SortProfile is a closed production comparator.
type SortProfile string

const (
	SortPersonCount        SortProfile = "person-count"
	SortPersonAverage      SortProfile = "person-average"
	SortPersonOverall      SortProfile = "person-overall"
	SortPersonPreference   SortProfile = "person-preference"
	SortUnitSelectedMetric SortProfile = "work-or-series-selected-metric"
	SortPersonCombination  SortProfile = "person-combination"
)

// PersonSortEntry contains every fixed person secondary key.
type PersonSortEntry struct {
	PersonID          int64
	Count             int
	AverageHundredths *int64
	ValidRatingCount  int
	OverallHundredths *int64
	Preference        *Rational
	EffectiveEvidence int
}

// UnitSortEntry contains the work/series metric and global-score tie-break.
type UnitSortEntry struct {
	UnitID                   int64
	SelectedMetricHundredths *int64
	GlobalScoreHundredths    *int64
}

// CombinationSortEntry identifies one canonical sorted person tuple.
type CombinationSortEntry struct {
	PersonIDs         []int64
	CommonCount       int
	AverageHundredths *int64
}

// SortPeople returns a new complete stable-ID index.
func SortPeople(
	ctx context.Context,
	profile SortProfile,
	direction Direction,
	entries []PersonSortEntry,
) ([]int64, error) {
	if err := validateSortDirection(ctx, direction); err != nil {
		return nil, err
	}
	switch profile {
	case SortPersonCount, SortPersonAverage, SortPersonOverall, SortPersonPreference:
	default:
		return nil, outcome(CodeInputInvalid)
	}
	values := append([]PersonSortEntry(nil), entries...)
	seen := make(map[int64]struct{}, len(values))
	for _, value := range values {
		if value.PersonID <= 0 || value.Count < 0 || value.ValidRatingCount < 0 ||
			value.EffectiveEvidence < 0 {
			return nil, outcome(CodeInputInvalid)
		}
		if _, duplicate := seen[value.PersonID]; duplicate {
			return nil, outcome(CodeInputInvalid)
		}
		seen[value.PersonID] = struct{}{}
		if value.Preference != nil {
			if _, err := value.Preference.rat(); err != nil {
				return nil, err
			}
		}
	}
	var canceled bool
	sort.Slice(values, func(left, right int) bool {
		if context.Cause(ctx) != nil {
			canceled = true
			return values[left].PersonID < values[right].PersonID
		}
		return personLess(profile, direction, values[left], values[right])
	})
	if canceled {
		return nil, contextError(ctx)
	}
	result := make([]int64, len(values))
	for index, value := range values {
		result[index] = value.PersonID
	}
	return result, nil
}

// SortUnits returns a new complete work/series stable-ID index.
func SortUnits(
	ctx context.Context,
	direction Direction,
	entries []UnitSortEntry,
) ([]int64, error) {
	if err := validateSortDirection(ctx, direction); err != nil {
		return nil, err
	}
	values := append([]UnitSortEntry(nil), entries...)
	seen := make(map[int64]struct{}, len(values))
	for _, value := range values {
		if value.UnitID <= 0 {
			return nil, outcome(CodeInputInvalid)
		}
		if _, duplicate := seen[value.UnitID]; duplicate {
			return nil, outcome(CodeInputInvalid)
		}
		seen[value.UnitID] = struct{}{}
	}
	var canceled bool
	sort.Slice(values, func(left, right int) bool {
		if context.Cause(ctx) != nil {
			canceled = true
			return values[left].UnitID < values[right].UnitID
		}
		a, b := values[left], values[right]
		if compared := optionalIntCompare(a.SelectedMetricHundredths, b.SelectedMetricHundredths, direction); compared != 0 {
			return compared < 0
		}
		if compared := optionalIntCompare(a.GlobalScoreHundredths, b.GlobalScoreHundredths, Descending); compared != 0 {
			return compared < 0
		}
		return a.UnitID < b.UnitID
	})
	if canceled {
		return nil, contextError(ctx)
	}
	result := make([]int64, len(values))
	for index, value := range values {
		result[index] = value.UnitID
	}
	return result, nil
}

// SortCombinations returns canonical tuple copies in strict total order.
func SortCombinations(
	ctx context.Context,
	direction Direction,
	entries []CombinationSortEntry,
) ([][]int64, error) {
	if err := validateSortDirection(ctx, direction); err != nil {
		return nil, err
	}
	values := make([]CombinationSortEntry, len(entries))
	seen := make(map[string]struct{}, len(values))
	for index, value := range entries {
		if value.CommonCount < 0 || len(value.PersonIDs) < 2 {
			return nil, outcome(CodeInputInvalid)
		}
		values[index] = value
		values[index].PersonIDs = append([]int64(nil), value.PersonIDs...)
		sort.Slice(values[index].PersonIDs, func(left, right int) bool {
			return values[index].PersonIDs[left] < values[index].PersonIDs[right]
		})
		for offset, personID := range values[index].PersonIDs {
			if personID <= 0 || (offset > 0 && values[index].PersonIDs[offset-1] == personID) {
				return nil, outcome(CodeInputInvalid)
			}
		}
		key := tupleKey(values[index].PersonIDs)
		if _, duplicate := seen[key]; duplicate {
			return nil, outcome(CodeInputInvalid)
		}
		seen[key] = struct{}{}
	}
	var canceled bool
	sort.Slice(values, func(left, right int) bool {
		if context.Cause(ctx) != nil {
			canceled = true
			return tupleCompare(values[left].PersonIDs, values[right].PersonIDs) < 0
		}
		a, b := values[left], values[right]
		if a.CommonCount != b.CommonCount {
			if direction == Descending {
				return a.CommonCount > b.CommonCount
			}
			return a.CommonCount < b.CommonCount
		}
		if compared := optionalIntCompare(a.AverageHundredths, b.AverageHundredths, Descending); compared != 0 {
			return compared < 0
		}
		return tupleCompare(a.PersonIDs, b.PersonIDs) < 0
	})
	if canceled {
		return nil, contextError(ctx)
	}
	result := make([][]int64, len(values))
	for index, value := range values {
		result[index] = append([]int64(nil), value.PersonIDs...)
	}
	return result, nil
}

func personLess(profile SortProfile, direction Direction, a, b PersonSortEntry) bool {
	switch profile {
	case SortPersonCount:
		if a.Count != b.Count {
			if direction == Descending {
				return a.Count > b.Count
			}
			return a.Count < b.Count
		}
		if compared := optionalIntCompare(a.AverageHundredths, b.AverageHundredths, Descending); compared != 0 {
			return compared < 0
		}
		if a.ValidRatingCount != b.ValidRatingCount {
			return a.ValidRatingCount > b.ValidRatingCount
		}
	case SortPersonAverage:
		if compared := optionalIntCompare(a.AverageHundredths, b.AverageHundredths, direction); compared != 0 {
			return compared < 0
		}
		if a.ValidRatingCount != b.ValidRatingCount {
			return a.ValidRatingCount > b.ValidRatingCount
		}
		if a.Count != b.Count {
			return a.Count > b.Count
		}
	case SortPersonOverall:
		if compared := optionalIntCompare(a.OverallHundredths, b.OverallHundredths, direction); compared != 0 {
			return compared < 0
		}
		if a.ValidRatingCount != b.ValidRatingCount {
			return a.ValidRatingCount > b.ValidRatingCount
		}
		if a.Count != b.Count {
			return a.Count > b.Count
		}
		if compared := optionalIntCompare(a.AverageHundredths, b.AverageHundredths, Descending); compared != 0 {
			return compared < 0
		}
	case SortPersonPreference:
		if compared := optionalRationalCompare(a.Preference, b.Preference, direction); compared != 0 {
			return compared < 0
		}
		if a.EffectiveEvidence != b.EffectiveEvidence {
			return a.EffectiveEvidence > b.EffectiveEvidence
		}
		if a.Count != b.Count {
			return a.Count > b.Count
		}
		if compared := optionalIntCompare(a.AverageHundredths, b.AverageHundredths, Descending); compared != 0 {
			return compared < 0
		}
	}
	return a.PersonID < b.PersonID
}

func optionalIntCompare(left, right *int64, direction Direction) int {
	if left == nil && right == nil {
		return 0
	}
	if left == nil {
		return 1
	}
	if right == nil {
		return -1
	}
	compared := 0
	if *left < *right {
		compared = -1
	} else if *left > *right {
		compared = 1
	}
	if direction == Descending {
		compared = -compared
	}
	return compared
}

func optionalRationalCompare(left, right *Rational, direction Direction) int {
	if left == nil && right == nil {
		return 0
	}
	if left == nil {
		return 1
	}
	if right == nil {
		return -1
	}
	compared, err := left.Compare(*right)
	if err != nil {
		// Entries are validated before sort.
		panic(err)
	}
	if direction == Descending {
		compared = -compared
	}
	return compared
}

func validateSortDirection(ctx context.Context, direction Direction) error {
	if err := contextError(ctx); err != nil {
		return err
	}
	if direction != Ascending && direction != Descending {
		return outcome(CodeInputInvalid)
	}
	return nil
}

func tupleCompare(left, right []int64) int {
	limit := len(left)
	if len(right) < limit {
		limit = len(right)
	}
	for index := 0; index < limit; index++ {
		if left[index] < right[index] {
			return -1
		}
		if left[index] > right[index] {
			return 1
		}
	}
	if len(left) < len(right) {
		return -1
	}
	if len(left) > len(right) {
		return 1
	}
	return 0
}

func tupleKey(values []int64) string {
	var builder strings.Builder
	for index, value := range values {
		if index != 0 {
			builder.WriteByte(',')
		}
		builder.WriteString(strconv.FormatInt(value, 10))
	}
	return builder.String()
}
