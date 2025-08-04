package constant

import "github.com/AcuLY/BangumiStaffStats/backend/internal/model"

const (
	StatsTypeSubject   = "subject"
	StatsTypeSeries    = "series"
	StatsTypeCharacter = "character"
	StatsTypeDefault   = StatsTypeSubject

	PageDefault     = 1
	PageSizeDefault = 10

	SortByCount       = "count"
	SortByAverageRate = "average"
	SortByOverallRate = "overall"
	SortByDefault     = SortByCount
)

func FillInDefaults(r *model.Request) {
	if r.Page == 0 {
		r.Page = PageDefault
	}
	if r.PageSize == 0 {
		r.PageSize = PageSizeDefault
	}
	if r.SortBy == "" {
		r.SortBy = SortByDefault
	}
	if r.StatisticType == "" {
		r.StatisticType = StatsTypeDefault
	}
	if r.Ascending == nil {
		r.Ascending = new(bool)
		*r.Ascending = false
	}
}
