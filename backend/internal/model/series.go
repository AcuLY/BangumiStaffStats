package model

import (
	"fmt"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
)

type SeriesKey SubjectID

func (k SeriesKey) Key() string {
	return fmt.Sprintf("series:%d", k)
}

type SeriesID int

// Series 表示一个条目所在的系列和该条目在系列中的顺位
type Series struct {
	SubjectID SubjectID `gorm:"column:subject_id"`
	SeriesID  SeriesID  `gorm:"column:series_id"`
	Order     int       `gorm:"column:sequel_order"`
}

func (o Series) TTL() time.Duration {
	return config.Redis.TTL.Sequel.Duration()
}

func (o Series) KeyObject() SeriesKey {
	return SeriesKey(o.SubjectID)
}
