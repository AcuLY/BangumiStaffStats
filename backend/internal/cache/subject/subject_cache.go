package subject

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/AcuLY/BangumiStaffStats/backend/config"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/cache"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/model"
)

// subjectKey 创建 Subject 对应的 Redis Key
func subjectKey(s *model.Subject) string {
	return fmt.Sprintf("subject:%d", s.ID)
}

// GetSubject 从缓存填入 Subject 的完整信息
func GetSubject(ctx context.Context, s *model.Subject) error {
	key := subjectKey(s)
	raw, err := cache.RDB.Get(ctx, key).Result()
	if err != nil {
		return err
	}

	if err = json.Unmarshal([]byte(raw), s); err != nil {
		return err
	}

	return nil
}

// SetSubject 将 Subject 的完整信息写入缓存
func SetSubject(ctx context.Context, dbSubject *model.Subject) error {
	key := subjectKey(dbSubject)
	ttl := config.Redis.TTL.Subject.ToHour()
	jsonData, err := json.Marshal(dbSubject)
	if err != nil {
		return err
	}

	return cache.RDB.Set(ctx, key, jsonData, ttl).Err()
}

// sequelOrderKey 创建 Sequel Order 的 Redis Key
func sequelOrderKey(subjectID int) string {
	return fmt.Sprintf("sequel:%d", subjectID)
}

// GetSequelOrder 从缓存获取 Subject 的 Sequel Order
func GetSequelOrder(ctx context.Context, s *model.Subject) (*model.SequelOrder, error) {
	key := sequelOrderKey(s.ID)
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

// SetSequelOrder 将 Subject 的 Sequel Order 写入缓存
func SetSequelOrder(ctx context.Context, so *model.SequelOrder) error {
	key := sequelOrderKey(so.SubjectID)
	ttl := config.Redis.TTL.Sequel.ToHour()
	jsonData, err := json.Marshal(so)
	if err != nil {
		return err
	}

	return cache.RDB.SetEx(ctx, key, jsonData, ttl).Err()
}
