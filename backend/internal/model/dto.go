package model

// Request 封装应用的请求字段
type Request struct {
	// 用户 ID
	UserID string `json:"userID" binding:"required"`
	// 职位名
	Position string `json:"position" binding:"required"`
	// 条目类型
	SubjectType int `json:"subjectType" binding:"required"`
	// 所有收藏类型
	CollectionTypes []int `json:"collectionTypes" binding:"required"`
	// 正向标签
	PositiveTags []string `json:"positiveTags"`
	// 反向标签
	NegativeTags []string `json:"negativeTags"`
	// 分数范围
	RateRange []*float64 `json:"rateRange"`
	// 收藏人数范围
	FavoriteRange []*int `json:"favoriteRange"`
	// 时间范围
	DateRange []*int `json:"dateRange"`
	// 查询全站
	IsGlobal *bool `json:"isGlobal"`
	// NSFW
	ShowNSFW *bool `json:"showNSFW"`
	// 展示的数据（1 subject 条目 / 2 series 系列 / 3 character 角色）
	StatisticType int `json:"statisticType"`
	// 分页偏移量
	Page int `json:"page"`
	// 页大小
	PageSize int `json:"pageSize"`
	// 排序依据（1 count 数量 / 2 average 平均分 / 3 overall 加权综合分）
	SortBy int `json:"sortBy"`
	// 升序或降序
	Ascend *bool `json:"ascend"`
}

// Response 表示响应字段，其中 Summaries 从 Statistic.PeopleSummary 根据分页切分得到
type Response struct {
	Summaries   []*PersonSummaryByType `json:"summaries"`
	ObjectCount int                    `json:"total"` // 查询到的 条目 / 系列 / 角色 数量
}
