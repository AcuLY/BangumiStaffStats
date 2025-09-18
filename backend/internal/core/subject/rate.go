package subject

import (
	"math"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

// CalcAverage 计算给定条目的均分，保留两位小数，忽略 0 分的条目
func CalcAverage(subjects []*model.Subject) float64 {
	var sum float64
	var validRateCnt int

	for _, s := range subjects {
		if s.Rate == 0 {
			continue
		}

		sum += s.Rate
		validRateCnt += 1
	}

	if validRateCnt == 0 {
		return 0
	}

	avg := sum / float64(validRateCnt)
	floored := math.Floor(avg*100) / 100

	return floored
}
