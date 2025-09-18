package model

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
)

type SubjectID int

func (id SubjectID) Key() string {
	return fmt.Sprintf("subject:%d", id)
}

type Subject struct {
	ID                SubjectID   `gorm:"column:subject_id"`
	Name              string      `gorm:"column:subject_name"`
	NameCN            string      `gorm:"column:subject_name_cn"`
	Rate              float64     `gorm:"column:subject_rate"`
	Favorite          int         `gorm:"column:subject_favorite"`
	Tags              StringSlice `gorm:"column:subject_tags"`
	Date              time.Time   `gorm:"column:subject_date"`
	Image             string      `gorm:"column:subject_image"`
	NSFW              bool        `gorm:"column:subject_nsfw"`
}

func (s *Subject) TTL() time.Duration {
	return config.Redis.TTL.Subject.Duration()
}

func (s *Subject) KeyObject() SubjectID {
	return s.ID
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
