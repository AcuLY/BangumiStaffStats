package model

import (
	"fmt"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
)

type CharacterID int

func (id CharacterID) Key() string {
	return fmt.Sprintf("character:%d", id)
}

type Character struct {
	ID     CharacterID `gorm:"column:character_id"`
	Name   string      `gorm:"column:character_name"`
	NameCN string      `gorm:"column:character_name_cn"`
	Image  string      `gorm:"column:character_image"`
}

func (c *Character) TTL() time.Duration {
	return config.Redis.TTL.Character.Duration()
}

func (c *Character) KeyObject() CharacterID {
	return c.ID
}

type CastKey []any

func (k *CastKey) Key() string {
	return fmt.Sprintf("cast:%d:%d:%d", (*k)[0].(PersonID), (*k)[1].(SubjectID), (*k)[2].(int))
}

type Cast struct {
	Credit
	CharacterID CharacterID `gorm:"column:character_id"`
}

func (c Cast) TTL() time.Duration {
	return config.Redis.TTL.Credit.Duration()
}

func (c Cast) KeyObject() *CastKey {
	return &CastKey{c.PersonID, c.SubjectID, c.PositionID}
}
