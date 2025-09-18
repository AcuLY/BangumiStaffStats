package model

import (
	"fmt"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
)

type PersonID int

func (id PersonID) Key() string {
	return fmt.Sprintf("person:%d", id)
}

type Person struct {
	ID     PersonID `gorm:"column:person_id"`
	Name   string   `gorm:"column:person_name"`
	NameCN string   `gorm:"column:person_name_cn"`
}

func (p *Person) TTL() time.Duration {
	return config.Redis.TTL.Person.Duration()
}

func (p *Person) KeyObject() PersonID {
	return p.ID
}

type Credit struct {
	PersonID   PersonID  `gorm:"column:person_id"`
	SubjectID  SubjectID `gorm:"column:subject_id"`
	PositionID int       `gorm:"column:position_id"`
}

func (c Credit) Key() string {
	return fmt.Sprintf("credit:%d:%d", c.SubjectID, c.PositionID)
}

func (c Credit) TTL() time.Duration {
	return config.Redis.TTL.Credit.Duration()
}

func (c Credit) KeyObject() Credit {
	return c
}
