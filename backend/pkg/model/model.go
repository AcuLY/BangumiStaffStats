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
	Order int `gorm:"column:order"`
}

// Request 封装应用的请求字段
type Request struct {
	// 用户 ID
	UserID string `json:"user_id" binding:"required"`
	// 职位名
	Position string `json:"position" binding:"required"`
	// 条目类型
	SubjectType int `json:"subject_type" binding:"required"`
	// 所有收藏类型
	CollectionTypes []int `json:"collection_types" binding:"required"`
	// 正向标签
	PositiveTags []string `json:"positive_tags"`
	// 反向标签
	NegativeTags []string `json:"negative_tags"`
	// 分数范围
	RateRange []float32 `json:"rate_range"`
	// 收藏人数范围
	FavoriteRange []int `json:"favorite_range"`
	// 时间范围
	DateRange []time.Time `json:"date_range"`
}

// Response 封装应用的响应字段
type Response struct {
	// 所有人物的记录
	PeopleSummary []*PersonSummary `json:"valid_subjects"`
	// 无效的条目，当前暂时不使用该字段
	InvalidSubjects []*Subject `json:"invalid_subjects"`
	// 查询到的条目数量
	SubjectCount int `json:"collection_number"`
	// 查询到的系列数量
	SeriesCount int `json:"series_number"`
}

// 一个人物的记录
type PersonSummary struct {
	PersonID     int    `json:"person_id"`
	PersonName   string `json:"person_name"`
	PersonNameCN string `json:"person_name_cn"`

	SubjectIDs     []int     `json:"subject_ids"`
	SubjectNames   []string  `json:"subject_names"`
	SubjectNamesCN []string  `json:"subject_names_cn"`
	SubjectImages  []string  `json:"subject_images"`
	Rates          []float32 `json:"rates"`
	AverageRate    float32   `json:"average_rate"`
	// 综合加权分
	OverallRate float32 `json:"overall_rate"`
	// 条目数量
	SubjectsNumber int `json:"subjects_number"`

	CharacterIDs     []int    `json:"character_ids"`
	CharacterNames   []string `json:"character_names"`
	CharacterNamesCN []string `json:"character_names_cn"`
	CharacterImages  []string `json:"character_images"`
	// 角色对应的条目
	CharacterSubjectNames   []string `json:"character_subject_names"`
	CharacterSubjectNamesCN []string `json:"character_subject_names_cn"`
	// 角色数量
	CharactersNumber int `json:"characters_number"`

	// 主条目 ID
	SeriesSubjectIDs []int `json:"series_subject_ids"`
	// 主条目名
	SeriesSubjectNames []string `json:"series_subject_names"`
	// 主条目中文名
	SeriesSubjectNamesCN []string `json:"series_subject_names_cn"`
	// 一个系列内的均分
	SeriesRates []float32 `json:"series_rates"`
	// 主条目图片
	SeriesSubjectImages []string `json:"series_subject_images"`
	// 全部系列的均分
	SeriesAverageRate float32 `json:"series_average_rate"`
	// 全部系列的加权分
	SeriesOverallRate float32 `json:"series_overall_rate"`
	// 系列数量
	SeriesSubjectsNumber int `json:"series_subjects_number"`
}
