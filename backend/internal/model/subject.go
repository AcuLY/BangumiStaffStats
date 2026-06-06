package model

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
)

type Subject struct {
	ID          int         `gorm:"column:subject_id"       json:"id,omitempty"`
	Name        string      `gorm:"column:subject_name"     json:"name,omitempty"`
	NameCN      string      `gorm:"column:subject_name_cn"  json:"nameCN,omitempty"`
	Rate        float64     `gorm:"column:subject_rate"     json:"rate,omitempty"`
	Image       string      `gorm:"column:subject_image"    json:"image,omitempty"`
	Favorite    int         `gorm:"column:subject_favorite" json:"favorite,omitempty"`
	Tags        StringSlice `gorm:"column:subject_tags"     json:"tags,omitempty"`
	Date        Date        `gorm:"column:subject_date"     json:"date,omitempty"`
	NSFW        bool        `gorm:"column:subject_nsfw"     json:"nsfw,omitempty"`
	SequelOrder int         `gorm:"-"                       json:"-"`
}

func (s *Subject) GetID() int {
	return s.ID
}

func (s *Subject) Key() string {
	return fmt.Sprintf("subject:%d", s.ID)
}

func (s *Subject) TTL() time.Duration {
	return config.Cache.TTL.Subject.Duration()
}

// StringSlice 是支持与 []byte 进行序列化和反序列化的 json 列表类型。
type StringSlice []string

func (s *StringSlice) Scan(value any) error {
	var bytes []byte
	switch v := value.(type) {
	case nil:
		*s = nil
		return nil
	case []byte:
		bytes = v
	case string:
		bytes = []byte(v)
	default:
		return fmt.Errorf("expected []byte, got %T", value)
	}
	return json.Unmarshal(bytes, s)
}

func (s *StringSlice) Value() (driver.Value, error) {
	return json.Marshal(s)
}

type Date time.Time

func (d *Date) Scan(value any) error {
	switch v := value.(type) {
	case nil:
		*d = Date(time.Time{})
		return nil
	case time.Time:
		*d = Date(v)
		return nil
	case []byte:
		return d.scanString(string(v))
	case string:
		return d.scanString(v)
	default:
		return fmt.Errorf("expected date string, got %T", value)
	}
}

func (d *Date) scanString(value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		*d = Date(time.Time{})
		return nil
	}

	for _, layout := range []string{"2006-01-02", time.RFC3339, "2006-01-02 15:04:05"} {
		parsed, err := time.ParseInLocation(layout, value, time.Local)
		if err == nil {
			*d = Date(parsed)
			return nil
		}
	}
	return fmt.Errorf("invalid date: %s", value)
}

func (d Date) Value() (driver.Value, error) {
	if d.IsZero() {
		return nil, nil
	}
	return d.Format("2006-01-02"), nil
}

func (d Date) MarshalJSON() ([]byte, error) {
	if d.IsZero() {
		return []byte("null"), nil
	}
	return json.Marshal(d.Format("2006-01-02"))
}

func (d *Date) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		*d = Date(time.Time{})
		return nil
	}

	var value string
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	return d.scanString(value)
}

func (d Date) Before(t time.Time) bool {
	return time.Time(d).Before(t)
}

func (d Date) After(t time.Time) bool {
	return time.Time(d).After(t)
}

func (d Date) Format(layout string) string {
	return time.Time(d).Format(layout)
}

func (d Date) IsZero() bool {
	return time.Time(d).IsZero()
}
