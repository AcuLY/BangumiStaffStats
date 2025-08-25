package filter

import (
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

func timestampToTime(timestamp int) time.Time {
	return time.Unix(int64(timestamp / 1000), 0)
}

func FilterByDate(subjects *[]*model.Subject, dateRange []*int) error {
	subjectsSlice := *subjects
	count := 0

	for _, s := range subjectsSlice {
		if dateRange[0] != nil && s.Date.Before(timestampToTime(*dateRange[0])) {
			continue
		}
		if dateRange[1] != nil && s.Date.After(timestampToTime(*dateRange[1])) {
			continue
		}

		subjectsSlice[count] = s
		count++
	}

	*subjects = subjectsSlice[:count]
	return nil
}
