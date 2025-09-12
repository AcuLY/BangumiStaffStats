package character

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/AcuLY/BangumiStaffStats/backend/config"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/cache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

type CharacterID int

func (id CharacterID) Key() string {
	return fmt.Sprintf("character:%d", id)
}

func Find(ctx context.Context, c *model.Character) error {
	key := characterKey(c)
	raw, err := cache.RDB.Get(ctx, key).Result()
	if err != nil {
		return err
	}

	if err = json.Unmarshal([]byte(raw), c); err != nil {
		return err
	}

	return nil
}

func Save(ctx context.Context, c *model.Character) error {
	key := characterKey(c)
	ttl := config.Redis.TTL.Character.Duration()

	raw, err := json.Marshal(c)
	if err != nil {
		return err
	}

	return cache.RDB.SetEx(ctx, key, raw, ttl).Err()
}

type PersonSubjectID struct {
	Person  int
	Subject int
}

func (id PersonSubjectID) Key() string {
	return fmt.Sprintf("person:subject:%d:%d", id.Person, id.Subject)
}

// FindByPersonAndSubject 从缓存根据 Person 和 Subject 获得所有 Character
func FindByPersonAndSubject(ctx context.Context, p *model.Person, s *model.Subject) ([]model.Character, error) {
	key := personCharacterKey(p, s)
	raw, err := cache.RDB.Get(ctx, key).Result()
	if err != nil {
		return nil, err
	}

	var ids []int
	if err := json.Unmarshal([]byte(raw), &ids); err != nil {
		return nil, err
	}

	characters := make([]model.Character, 0, len(ids))
	for _, id := range ids {
		character := model.Character{ID: id}
		characters = append(characters, character)
	}

	return characters, nil
}

// SaveByPersonAndSubject 将 Person 和 Subject 对应的所有 Character 写入缓存
func SaveByPersonAndSubject(ctx context.Context, p *model.Person, s *model.Subject, characters []model.Character) error {
	key := personCharacterKey(p, s)
	ttl := config.Redis.TTL.PersonCharacter.Duration()

	ids := make([]int, 0, len(characters))
	for _, c := range characters {
		ids = append(ids, c.ID)
	}

	raw, err := json.Marshal(ids)
	if err != nil {
		return err
	}

	return cache.RDB.SetEx(ctx, key, raw, ttl).Err()
}
