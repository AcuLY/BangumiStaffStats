package model

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// Item 为含有 ID、名字等共有属性的结构
type Item interface {
	GetID() int
	GetName() string
	GetNameCN() string
	GetImage() string
}

// StringSlice 是支持与 []byte 进行序列化和反序列化的 json 列表类型。
type StringSlice []string

func (s *StringSlice) Scan(value any) error {
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("expected []byte, got %T", value)
	}
	return json.Unmarshal(bytes, s)
}

func (s *StringSlice) Value() (driver.Value, error) {
	return json.Marshal(s)
}

// Subject 对应 Bangumi 的条目。
//
// 获取条目的评分应使用
//
//	subject.Rate()
//
// 而不是直接访问 GlobalRate 或 UserRate 字段。
type Subject struct {
	// 条目 ID
	ID int `gorm:"column:subject_id"`
	// 条目原文名
	Name string `gorm:"column:subject_name"`
	// 条目中文名
	NameCN string `gorm:"column:subject_name_cn"`
	// 条目的全站评分
	GlobalRate float32 `gorm:"column:subject_rate"` // 不应该直接访问
	// 用户对该条目的评分
	UserRate *float32 `gorm:"-" json:"-"`
	// 条目的收藏量
	Favorite int `gorm:"column:subject_favorite"`
	// 条目的标签
	Tags StringSlice `gorm:"column:subject_tags"`
	// 条目的播出或发售日期
	Date time.Time `gorm:"column:subject_date"`
	// 条目封面的 URL
	Image string `gorm:"column:subject_image"`
	// 该条目在系列中的顺位
	SeriesOrder int `gorm:"-"`
	// 该系列的主（第一部）作品
	SeriesMainSubject *Subject `gorm:"-"`
	// 该系列的均分
	SeriesRate float32 `gorm:"-"`
	// 是否为 nsfw 条目
	NSFW bool `gorm:"column:subject_nsfw"`
}

func (s *Subject) GetID() int {
	return s.ID
}

func (s *Subject) GetName() string {
	return s.Name
}

func (s *Subject) GetNameCN() string {
	return s.NameCN
}

func (s *Subject) GetImage() string {
	return s.Image
}

// Rate 返回条目在本次查询应该使用的分数。
//
// 如果查询用户收藏则返回 UserRate，如果查询全站数据则返回 GlobalRate。
func (s *Subject) Rate() float32 {
	if s.UserRate != nil {
		return *s.UserRate
	}
	return s.GlobalRate
}

// Person 对应 Bangumi 的人物。
type Person struct {
	// 人物 ID
	ID int `gorm:"column:person_id"`
	// 人物原文名
	Name string `gorm:"column:person_name"`
	// 人物中文名
	NameCN string `gorm:"column:person_name_cn"`
}

// Character 对应 Bangumi 的角色。
type Character struct {
	// 角色 ID
	ID int `gorm:"column:character_id"`
	// 角色原文名
	Name string `gorm:"column:character_name"`
	// 角色中文名
	NameCN string `gorm:"column:character_name_cn"`
	// 角色图片的 URL
	Image string `gorm:"column:character_image"`
	// 角色属于的条目
	BelongingSubject *Subject `gorm:"-" json:"-"` // 应该为系列的主条目
}

func (c *Character) GetID() int {
	return c.ID
}

func (c *Character) GetName() string {
	return c.Name
}

func (c *Character) GetNameCN() string {
	return c.NameCN
}

func (c *Character) GetImage() string {
	return c.Image
}

// SequelOrder 表示一个条目所在的系列和该条目在系列中的顺位
type SequelOrder struct {
	// 条目 ID
	SubjectID int `gorm:"column:subject_id"`
	// 系列 ID
	SeriesID int `gorm:"column:series_id"`
	// 系列内的顺位，越小越可能是第一季
	Order int `gorm:"column:sequel_order"`
}

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
	RateRange []*float32 `json:"rateRange"`
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

// SubjectSummary 包括一个人物的全部条目
type SubjectSummary struct {
	IDs     []int     `json:"subjectIDs"`
	Names   []string  `json:"subjectNames"`
	NamesCN []string  `json:"subjectNamesCN"`
	Images  []string  `json:"subjectImages"`
	Rates   []float32 `json:"rates"`
	// 条目数量
	Count int `json:"count"`
	// 条目平均分
	Average float32 `json:"averageRate"`
	// 综合加权分
	Overall float32 `json:"overallRate"`
}

// CharacterSummary 包含一个人物的全部角色
type CharacterSummary struct {
	IDs     []int    `json:"characterIDs"`
	Names   []string `json:"characterNames"`
	NamesCN []string `json:"characterNamesCN"`
	Images  []string `json:"characterImages"`
	// 角色对应的条目
	SubjectNames   []string `json:"characterSubjectNames"`
	SubjectNamesCN []string `json:"characterSubjectNamesCN"`
	// 角色数量
	Count int `json:"characterCount"`
}

// PersonalSummary 一个人物的完整统计结果，用于暂存在服务端
type PersonalSummary struct {
	PersonID     int
	PersonName   string
	PersonNameCN string

	Subject   *SubjectSummary
	Series    *SubjectSummary
	Character *CharacterSummary
}

// PersonalSummaryByType 一个人物的一种统计结果
//  1. subject
//  2. series
//  3. character
//// subject 和 series 都用 SubjectSummary 类型填充
type PersonalSummaryByType struct {
	PersonID     int    `json:"personID"`
	PersonName   string `json:"personName"`
	PersonNameCN string `json:"personNameCN"`

	*SubjectSummary   `json:",omitempty"`
	*CharacterSummary `json:",omitempty"`
}

// Statistics 包含一次查询的完整结果，用于暂存在服务端
type Statistics struct {
	// 所有人物的记录
	PeopleSummary []*PersonalSummary
	// 查询到的人物数量
	PersonCount int
	// 查询到的条目数量
	SubjectCount int
	// 查询到的系列数量
	SeriesCount int
	// 查询到的角色数量
	CharacterCount int
}

// Response 表示响应字段，其中 Summaries 从 Statistic.PeopleSummary 根据分页切分得到
type Response struct {
	// 所有人物的记录
	Summaries []*PersonalSummaryByType `json:"summaries"`
	// 查询到的人物数量
	PersonCount int `json:"personCount"`
	// 查询到的 条目 / 系列 / 角色 数量
	ItemCount int `json:"itemCount"`
}
