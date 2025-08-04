package sorter

import (
	"sort"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

func extractComparableValues(summary *model.PersonSummary, isSeries bool) (int, float32, float32) {
	if isSeries {
		return summary.Series.Count, summary.Series.Average, summary.Series.Overall
	}
	return summary.Subject.Count, summary.Subject.Average, summary.Subject.Overall
}

func SortByCount(summaries []*model.PersonSummary, isSeries bool) {
	sort.Slice(summaries, func(i int, j int) bool {
		countI, averageRateI, overallRateI := extractComparableValues(summaries[i], isSeries)
		countJ, averageRateJ, overallRateJ := extractComparableValues(summaries[j], isSeries)

		if countI != countJ {
			return countI > countJ
		} else if averageRateI != averageRateJ {
			return averageRateI > averageRateJ
		}
		return overallRateI >= overallRateJ
	})
}

func SortByAverage(summaries []*model.PersonSummary, isSeries bool) {
	sort.Slice(summaries, func(i int, j int) bool {
		countI, averageRateI, overallRateI := extractComparableValues(summaries[i], isSeries)
		countJ, averageRateJ, overallRateJ := extractComparableValues(summaries[j], isSeries)

		if averageRateI != averageRateJ {
			return averageRateI > averageRateJ
		}
		if countI != countJ {
			return countI > countJ
		}
		return overallRateI >= overallRateJ
	})
}

func SortByOverall(summaries []*model.PersonSummary, isSeries bool) {
	sort.Slice(summaries, func(i int, j int) bool {
		countI, averageRateI, overallRateI := extractComparableValues(summaries[i], isSeries)
		countJ, averageRateJ, overallRateJ := extractComparableValues(summaries[j], isSeries)

		if overallRateI != overallRateJ {
			return overallRateI > overallRateJ
		}
		if countI != countJ {
			return countI > countJ
		}
		return averageRateI >= averageRateJ
	})
}

func SortByCharacterCount(summaries []*model.PersonSummary) {
	sort.Slice(summaries, func(i int, j int) bool {
		return summaries[i].Character.Count >= summaries[j].Character.Count
	})
}
