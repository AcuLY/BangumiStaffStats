package character

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/AcuLY/BangumiStaffStats/backend/config"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/cache"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/model"
)

// characterKey 创建 Character 对应的 Redis Key
func characterKey(c *model.Character) string {
	return fmt.Sprintf("character:%d", c.ID)
}

// GetCharacter 填充传入的 Character 的完整信息
func GetCharacter(ctx context.Context, c *model.Character) error {
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

// SetCharacter 缓存 Character 信息
func SetCharacter(ctx context.Context, c *model.Character) error {
	key := characterKey(c)
	ttl := config.Redis.TTL.Character.ToHour()
	jsonData, err := json.Marshal(c)
	if err != nil {
		return err
	}

	return cache.RDB.SetEx(ctx, key, jsonData, ttl).Err()
}

// personCharacterKey 创建 person-character 对应的 Redis Key
func personCharacterKey(p *model.Person, s *model.Subject) string {
	return fmt.Sprintf("character:person:%d:subject:%d", p.ID, s.ID)
}

// GetCharactersByPersonAndSubject 从缓存根据 Person 和 Subject 获得所有 Character
func GetCharactersByPersonAndSubject(ctx context.Context, p *model.Person, s *model.Subject) ([]model.Character, error) {
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

// SetCharactersByPersonAndSubject 将 Person 和 Subject 对应的所有 Character 写入缓存
func SetCharactersByPersonAndSubject(ctx context.Context, p *model.Person, s *model.Subject, characters []model.Character) error {
	key := personCharacterKey(p, s)
	ttl := config.Redis.TTL.PersonCharacter.ToHour()
	characterIDs := make([]int, 0, len(characters))
	for _, c := range characters {
		characterIDs = append(characterIDs, c.ID)
	}
	jsonData, err := json.Marshal(characterIDs)
	if err != nil {
		return err
	}

	return cache.RDB.SetEx(ctx, key, jsonData, ttl).Err()
}
