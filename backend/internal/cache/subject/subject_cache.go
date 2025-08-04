package subject

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/AcuLY/BangumiStaffStats/backend/config"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/cache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

// key 创建 Subject 对应的 Redis Key
func key(s *model.Subject) string {
	return fmt.Sprintf("subject:%d", s.ID)
}

// Find 从缓存填入 Subject 的完整信息
func Find(ctx context.Context, s *model.Subject) error {
	key := key(s)
	raw, err := cache.RDB.Get(ctx, key).Result()
	if err != nil {
		return err
	}

	if err = json.Unmarshal([]byte(raw), s); err != nil {
		return err
	}

	return nil
}

// Save 将 Subject 的完整信息写入缓存
func Save(ctx context.Context, dbSubject *model.Subject) error {
	key := key(dbSubject)
	ttl := config.Redis.TTL.Subject.Duration()

	raw, err := json.Marshal(dbSubject)
	if err != nil {
		return err
	}

	return cache.RDB.Set(ctx, key, raw, ttl).Err()
}
