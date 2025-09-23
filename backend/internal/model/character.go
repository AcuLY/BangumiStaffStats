package model

import (
	"fmt"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
)

type Character struct {
	ID               int      `gorm:"column:character_id"      json:"id"`
	Name             string   `gorm:"column:character_name"    json:"name"`
	NameCN           string   `gorm:"column:character_name_cn" json:"nameCN,omitempty"`
	Image            string   `gorm:"column:character_image"   json:"image,omitempty"`
	BelongingSubject *Subject `gorm:"-"                        json:"subject"`
}

func (c *Character) GetID() int {
	return c.ID
}

func (c *Character) Key() string {
	return fmt.Sprintf("character:%d", c.ID)
}

func (c *Character) TTL() time.Duration {
	return config.Redis.TTL.Character.Duration()
}

type Casts struct {
	SubjectID    int      `gorm:"subject_id"`
	PositionID   int      `gorm:"position_id"`
	PersonID     int      `gorm:"person_id"`
	CharacterIDs IntSlice `gorm:"character_ids"`
}

func (c *Casts) Key() string {
	return fmt.Sprintf("cast:%d:%d:%d", c.SubjectID, c.PersonID, c.PositionID)
}

func (c *Casts) TTL() time.Duration {
	return config.Redis.TTL.Credit.Duration()
}
