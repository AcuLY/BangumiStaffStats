package constant

import "github.com/AcuLY/BangumiStaffStats/backend/internal/model"

const (
	MinFavoriteDefault = 50
	MaxFavoriteDefault = 100000

	StatsTypeSubject   = 1
	StatsTypeSeries    = 2
	StatsTypeCharacter = 3
	StatsTypeDefault   = StatsTypeSubject

	PageDefault     = 1
	PageSizeDefault = 10

	SortByCount       = 1
	SortByAverageRate = 2
	SortByOverallRate = 3
	SortByDefault     = SortByCount
)

func FillInDefaults(r *model.Request) {
	if r.IsGlobal == nil {
		r.IsGlobal = new(bool)
		*r.IsGlobal = false
	}
	if r.ShowNSFW == nil {
		r.ShowNSFW = new(bool)
		*r.ShowNSFW = false
	}
	if *r.IsGlobal && r.FavoriteRange[0] == nil && r.FavoriteRange[1] == nil {
		min, max := 50, 100000
		r.FavoriteRange = []*int{&min, &max}
	}
	if r.Page == 0 {
		r.Page = PageDefault
	}
	if r.PageSize == 0 {
		r.PageSize = PageSizeDefault
	}
	if r.SortBy == 0 {
		r.SortBy = SortByDefault
	}
	if r.StatisticType == 0 {
		r.StatisticType = StatsTypeDefault
	}
	if r.Ascend == nil {
		r.Ascend = new(bool)
		*r.Ascend = false
	}
}
