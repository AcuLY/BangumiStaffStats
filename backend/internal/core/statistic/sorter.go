package statistic

import (
	"sort"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

func extractComparable(sum *model.PersonSummary, isSeries bool) (int, float64, float64) {
	if isSeries {
		return sum.Series.Count, sum.Series.Average, sum.Series.Overall
	}
	return sum.Subject.Count, sum.Subject.Average, sum.Subject.Overall
}

func SortByCount(sums []*model.PersonSummary, isSeries bool) {
	sort.Slice(sums, func(i int, j int) bool {
		cntI, avgI, overallI := extractComparable(sums[i], isSeries)
		cntJ, avgJ, overallJ := extractComparable(sums[j], isSeries)

		if cntI != cntJ {
			return cntI > cntJ
		} else if avgI != avgJ {
			return avgI > avgJ
		}
		return overallI >= overallJ
	})
}

func SortByAverage(sums []*model.PersonSummary, isSeries bool) {
	sort.Slice(sums, func(i int, j int) bool {
		cntI, avgI, overallI := extractComparable(sums[i], isSeries)
		cntJ, avgJ, overallJ := extractComparable(sums[j], isSeries)

		if avgI != avgJ {
			return avgI > avgJ
		}
		if cntI != cntJ {
			return cntI > cntJ
		}
		return overallI >= overallJ
	})
}

func SortByOverall(sums []*model.PersonSummary, isSeries bool) {
	sort.Slice(sums, func(i int, j int) bool {
		cntI, avgI, overallI := extractComparable(sums[i], isSeries)
		cntJ, avgJ, overallJ := extractComparable(sums[j], isSeries)

		if overallI != overallJ {
			return overallI > overallJ
		}
		if cntI != cntJ {
			return cntI > cntJ
		}
		return avgI >= avgJ
	})
}

func SortByCharaCount(sums []*model.PersonSummary) {
	sort.Slice(sums, func(i int, j int) bool {
		return sums[i].Character.Count >= sums[j].Character.Count
	})
}
