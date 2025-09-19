package subject

import (
	"math"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

// CalcAverage 计算给定条目的均分，保留两位小数，忽略 0 分的条目
func CalcAverage(subjs []*model.Subject) float64 {
	var sum float64
	var validRateCnt int

	for _, s := range subjs {
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

func CalcOverall(subjs []*model.Subject) float64 {
	avg := CalcAverage(subjs)
	if avg == 0 {
		return 0
	}

	n := float64(len(subjs))
	constant := 5.0
	middle := 5.0

	overall := (n/(n+constant))*avg + (constant/(n+constant))*middle
	return math.Round(overall*100) / 100
}
