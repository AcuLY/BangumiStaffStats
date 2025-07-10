package filter

import (
	"fmt"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/pkg/model"
)

func FilterSubjectsByDate(subjects *[]*model.Subject, dateRange []time.Time) error {
	if len(dateRange) != 2 {
		return fmt.Errorf("invalid rate range size: %d", len(dateRange))
	}

	subjectsSlice := *subjects
	count := 0

	for _, s := range subjectsSlice {
		if s.Date.After(dateRange[0]) && s.Date.Before(dateRange[1]) {
			subjectsSlice[count] = s
			count++
		}
	}

	*subjects = subjectsSlice[:count]
	return nil
}