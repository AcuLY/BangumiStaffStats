package model

type Request struct {
	UserID          string     `json:"userID"          binding:"required_unless=isGlobal true"`
	Position        string     `json:"position"        binding:"required"`
	SubjectType     int        `json:"subjectType"     binding:"required,oneof=1 2 3 4 6"`
	CollectionTypes []int      `json:"collectionTypes" binding:"required_unless=isGlobal true"`
	PositiveTags    []string   `json:"positiveTags"    binding:"omitempty"`
	NegativeTags    []string   `json:"negativeTags"    binding:"omitempty"`
	RateRange       []*float64 `json:"rateRange"       binding:"omitempty,len=2,dive,omitempty,min=0,max=10"`
	FavoriteRange   []*int     `json:"favoriteRange"   binding:"omitempty,len=2,dive,omitempty,min=0"`
	DateRange       []*int     `json:"dateRange"       binding:"omitempty,len=2,dive,omitempty,min=0,max=10"`
	IsGlobal        *bool      `json:"isGlobal"        binding:"omitempty"`
	ShowNSFW        *bool      `json:"showNSFW"        binding:"omitempty"`
	StatisticType   *int       `json:"statisticType"   binding:"omitempty,oneof=1 2 3"`
	Page            *int       `json:"page"            binding:"omitempty,min=1"`
	PageSize        *int       `json:"pageSize"        binding:"omitempty,min=1"`
	SortBy          *int       `json:"sortBy"          binding:"omitempty,oneof=1 2 3"`
	Ascend          *bool      `json:"ascend"          binding:"omitempty"`
}

type Response struct {
	Summaries   []*PersonSummaryByType `json:"summaries"`
	PersonCount int                    `json:"total"`
	ObjectCount int                    `json:"itemCount"` // 查询到的 条目 / 系列 / 角色 数量
}
