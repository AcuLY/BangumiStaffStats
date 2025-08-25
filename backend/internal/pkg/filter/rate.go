package filter

import (
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

func FilterByRates(subjects *[]*model.Subject, rateRange []*float32) error {
	subjectsSlice := *subjects
	count := 0

	for _, s := range subjectsSlice {
		if rateRange[0] != nil && *rateRange[0] > s.Rate() {
			continue
		}
		if rateRange[1] != nil && *rateRange[1] < s.Rate() {
			continue
		}

		subjectsSlice[count] = s
		count++

	}

	*subjects = subjectsSlice[:count]
	return nil
}
