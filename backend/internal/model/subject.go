package model

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
)

type Subject struct {
	ID          int         `gorm:"column:subject_id"       json:"id"`
	Name        string      `gorm:"column:subject_name"     json:"name"`
	NameCN      string      `gorm:"column:subject_name_cn"  json:"nameCN"`
	Rate        float64     `gorm:"column:subject_rate"     json:"rate"`
	Image       string      `gorm:"column:subject_image"    json:"image"`
	Favorite    int         `gorm:"column:subject_favorite" json:"-"`
	Tags        StringSlice `gorm:"column:subject_tags"     json:"-"`
	Date        time.Time   `gorm:"column:subject_date"     json:"-"`
	NSFW        bool        `gorm:"column:subject_nsfw"     json:"-"`
	SequelOrder int         `gorm:"-"                       json:"-"`
}

func (s *Subject) GetID() int {
	return s.ID
}

func (s *Subject) Key() string {
	return fmt.Sprintf("subject:%d", s.ID)
}

func (s *Subject) TTL() time.Duration {
	return config.Redis.TTL.Subject.Duration()
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
