package filter

import (
	"fmt"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

func FilterByRates(subjects *[]*model.Subject, rateRange []float32) error {
	if len(rateRange) != 2 {
		return fmt.Errorf("invalid rate range size: %d", len(rateRange))
	}

	subjectsSlice := *subjects
	count := 0

	for _, s := range subjectsSlice {
		if rateRange[0] <= s.Rate() && s.Rate() <= rateRange[1] {
			subjectsSlice[count] = s
			count++
		}
	}

	*subjects = subjectsSlice[:count]
	return nil
}

func FilterByPopularity(subjects *[]*model.Subject, favoriteRange []int) error {
	if len(favoriteRange) != 2 {
		return fmt.Errorf("invalid rate range size: %d", len(favoriteRange))
	}

	subjectsSlice := *subjects
	count := 0

	for _, s := range subjectsSlice {
		if favoriteRange[0] <= s.Favorite && s.Favorite <= favoriteRange[1] {
			subjectsSlice[count] = s
			count++
		}
	}

	*subjects = subjectsSlice[:count]
	return nil
}
