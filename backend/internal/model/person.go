package model

import (
	"fmt"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
)

type Person struct {
	ID     int    `gorm:"column:person_id"      json:"id"`
	Name   string `gorm:"column:person_name"    json:"name"`
	NameCN string `gorm:"column:person_name_cn" json:"nameCN"`
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

type Credit struct {
	PersonID   int `gorm:"column:person_id"`
	SubjectID  int `gorm:"column:subject_id"`
	PositionID int `gorm:"column:position_id"`
}

func (c Credit) GetID() int {
	return c.SubjectID
}

func (c Credit) Key() string {
	return fmt.Sprintf("credit:%d:%d", c.SubjectID, c.PositionID)
}

func (c Credit) TTL() time.Duration {
	return config.Redis.TTL.Credit.Duration()
}
