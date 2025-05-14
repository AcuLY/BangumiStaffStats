package subject

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/AcuLY/BangumiStaffStats/config"
	"github.com/AcuLY/BangumiStaffStats/internal/cache"
	"github.com/AcuLY/BangumiStaffStats/pkg/model"
)

func subjectKey(s *model.Subject) string {
	return fmt.Sprintf("subject:%d", s.ID)
}

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

func SetSubject(ctx context.Context, dbSubject *model.Subject) error {
	key := subjectKey(dbSubject)
	ttl := config.Redis.TTL.Subject.ToHour()
	jsonData, err := json.Marshal(dbSubject)
	if err != nil {
		return err
	}

	return cache.RDB.Set(ctx, key, jsonData, ttl).Err()
}

func sequelOrderKey(subjectID int) string {
	return fmt.Sprintf("sequel:%d", subjectID)
}

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

func SetSequelOrder(ctx context.Context, so *model.SequelOrder) error {
	key := sequelOrderKey(so.SubjectID)
	ttl := config.Redis.TTL.Sequel.ToHour()
	jsonData, err := json.Marshal(so)
	if err != nil {
		return err
	}

	return cache.RDB.SetEx(ctx, key, jsonData, ttl).Err()
}