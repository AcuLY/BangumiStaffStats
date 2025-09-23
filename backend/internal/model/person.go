package model

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
)

type Person struct {
	ID     int    `gorm:"column:person_id"      json:"id"`
	Name   string `gorm:"column:person_name"    json:"name"`
	NameCN string `gorm:"column:person_name_cn" json:"nameCN,omitempty"`
}

func (p *Person) GetID() int {
	return p.ID
}

func (p *Person) Key() string {
	return fmt.Sprintf("person:%d", p.ID)
}

func (p *Person) TTL() time.Duration {
	return config.Redis.TTL.Person.Duration()
}

type Credits struct {
	SubjectID  int `gorm:"subject_id"`
	PositionID int
	PersonIDs  IntSlice `gorm:"person_ids"`
}

func (c *Credits) GetID() int {
	return c.SubjectID
}

func (c *Credits) Key() string {
	return fmt.Sprintf("credit:%d:%d", c.SubjectID, c.PositionID)
}

func (c *Credits) TTL() time.Duration {
	return config.Redis.TTL.Credit.Duration()
}

type IntSlice []int

func (s *IntSlice) Scan(value any) error {
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("expected []byte, got %T", value)
	}
	return json.Unmarshal(bytes, s)
}

func (s *IntSlice) Value() (driver.Value, error) {
	return json.Marshal(s)
}
