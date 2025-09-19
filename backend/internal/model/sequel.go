package model

import (
	"fmt"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
)

type Sequel struct {
	SubjectID int `gorm:"column:subject_id"`
	SeriesID  int `gorm:"column:series_id"`
	Order     int `gorm:"column:sequel_order"`
}

func (s Sequel) GetID() int {
	return s.SubjectID
}

func (s Sequel) Key() string {
	return fmt.Sprintf("sequel:%d", s.SubjectID)
}

func (s Sequel) TTL() time.Duration {
	return config.Redis.TTL.Sequel.Duration()
}
