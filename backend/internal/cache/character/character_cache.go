package character

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/AcuLY/BangumiStaffStats/backend/config"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/cache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

// characterKey 创建 Character 对应的 Redis Key
func characterKey(c *model.Character) string {
	return fmt.Sprintf("character:%d", c.ID)
}

// Find 填充传入的 Character 的完整信息
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

// Save 缓存 Character 信息
func Save(ctx context.Context, c *model.Character) error {
	key := characterKey(c)
	ttl := config.Redis.TTL.Character.Duration()

	raw, err := json.Marshal(c)
	if err != nil {
		return err
	}

	return cache.RDB.SetEx(ctx, key, raw, ttl).Err()
}

// personCharacterKey 创建 person-character 对应的 Redis Key
func personCharacterKey(p *model.Person, s *model.Subject) string {
	return fmt.Sprintf("character:person:%d:subject:%d", p.ID, s.ID)
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
