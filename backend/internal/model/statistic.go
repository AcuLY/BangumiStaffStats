package model

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
)

type StatsEntity struct {
	Request    *Request
	Statistics *Statistics
}

func (e *StatsEntity) Key() string {
	pureReq := &Request{ // 移除分页字段
		UserID:          e.Request.UserID,
		Position:        e.Request.Position,
		SubjectType:     e.Request.SubjectType,
		CollectionTypes: e.Request.CollectionTypes,
		PositiveTags:    e.Request.PositiveTags,
		NegativeTags:    e.Request.NegativeTags,
		RateRange:       e.Request.RateRange,
		FavoriteRange:   e.Request.FavoriteRange,
		DateRange:       e.Request.DateRange,
		IsGlobal:        e.Request.IsGlobal,
		ShowNSFW:        e.Request.ShowNSFW,
	}

	b, err := json.Marshal(pureReq)
	if err != nil {
		return ""
	}

	hash := sha256.Sum256(b)

	return fmt.Sprintf("statistic:%s", hex.EncodeToString(hash[:])[:16])
}

func (e *StatsEntity) TTL() time.Duration {
	return config.Redis.TTL.Statistic.Duration()
}

// Statistics 包含一次查询的完整结果，用于暂存在服务端
type Statistics struct {
	PeopleSummary  []*PersonSummary
	PersonCount    int
	SubjectCount   int
	SeriesCount    int
	CharacterCount int
}

// PersonSummary 一个人物的完整统计结果，用于暂存在服务端
type PersonSummary struct {
	Person    *Person
	Subject   *SubjectSummary
	Series    *SubjectSummary
	Character *CharacterSummary
}

// PersonSummaryByType 一个人物的一种统计结果
//  1. subject
//  2. series
//  3. character
//
// subject 和 series 都用 SubjectSummary 类型填充
type PersonSummaryByType struct {
	Person            `json:"person"`
	*SubjectSummary   `json:",omitempty"`
	*CharacterSummary `json:",omitempty"`
}

// SubjectSummary 包括一个人物的全部条目
type SubjectSummary struct {
	Subjects []*Subject `json:"subjects"`
	Count    int        `json:"count"`
	Average  float64    `json:"average"`
	Overall  float64    `json:"overall"`
}

// CharacterSummary 包含一个人物的全部角色
type CharacterSummary struct {
	Characters []*Character `json:"characters"`
	Count      int          `json:"count"`
}
