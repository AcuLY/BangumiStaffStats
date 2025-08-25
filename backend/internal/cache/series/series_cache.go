package series

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/AcuLY/BangumiStaffStats/backend/config"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/cache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

// key 创建 Sequel Order 的 Redis Key
func key(subjectID int) string {
	return fmt.Sprintf("sequel:%d", subjectID)
}

// Find 从缓存获取 Subject 的 Sequel Order
func Find(ctx context.Context, s *model.Subject) (*model.SequelOrder, error) {
	key := key(s.ID)
	raw, err := cache.RDB.Get(ctx, key).Result()
	if err != nil {
		return nil, err
	}

	so := new(model.SequelOrder)
	if err = json.Unmarshal([]byte(raw), so); err != nil {
		return nil, err
	}

	return so, nil
}

// Save 将 Subject 的 Sequel Order 写入缓存
func Save(ctx context.Context, so *model.SequelOrder) error {
	key := key(so.SubjectID)
	ttl := config.Redis.TTL.Sequel.Duration()

	raw, err := json.Marshal(so)
	if err != nil {
		return err
	}

	return cache.RDB.SetEx(ctx, key, raw, ttl).Err()
}
