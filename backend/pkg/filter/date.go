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
		if !s.Date.Before(dateRange[0]) && !s.Date.After(dateRange[1]) {	// Before 是严格小于，用反向逻辑可以包含 range 的边界值
			subjectsSlice[count] = s
			count++
		}
	}

	*subjects = subjectsSlice[:count]
	return nil
}