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

// Load 从缓存填入 Subjects 的完整信息，缓存缺失则无影响
func Load(ctx context.Context, subjects []*model.Subject) error {
	keys := make([]string, len(subjects))
	for _, s := range subjects {
		keys = append(keys, key(s))
	}

	raws, err := cache.RDB.MGet(ctx, keys...).Result()
	if err != nil {
		return err
	}

	for i, raw := range raws {
		if raw == nil {
			continue
		}
		
		if err := json.Unmarshal([]byte(raw.(string)), subjects[i]); err != nil {
			return err
		}
	}

	return nil
}

// Save 将 Subjects 的完整信息写入缓存
func Save(ctx context.Context, subjects []*model.Subject) error {
	pipe := cache.RDB.Pipeline()

	for _, s := range subjects {
		key := key(s)
		ttl := config.Redis.TTL.Subject.Duration()

		raw, err := json.Marshal(s)
		if err != nil {
			return err
		}

		pipe.Set(ctx, key, raw, ttl)
	}

	_, err := pipe.Exec(ctx)

	return err
}
