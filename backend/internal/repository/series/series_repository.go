package series

import (
	"context"

	cache "github.com/AcuLY/BangumiStaffStats/backend/internal/cache/series"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/repository"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	"github.com/redis/go-redis/v9"
)

// Find 根据条目 ID 从缓存或数据库加载条目的系列信息
func Find(ctx context.Context, s *model.Subject) (*model.SequelOrder, error) {
	so, err := cache.Find(ctx, s)
	if err == nil {
		return so, nil
	} else if err != redis.Nil {
		return nil, err
	}

	so = new(model.SequelOrder)
	err = repository.DB.
		WithContext(ctx).
		Table("sequel_orders").
		Where("subject_id = ?", s.ID).
		First(so).
		Error
	if err != nil {
		logger.Warn(
			"Failed to find sequel order: "+err.Error(),
			logger.Field("subject_id", s.ID),
			repository.DBStats(),
		)
		return nil, nil
	}

	go func() {
		if err := cache.Save(context.Background(), so); err != nil {
			logger.Warn("Failed to set sequel order: "+err.Error(), logger.Field("sequel_order", so))
		}
	}()

	return so, nil
}
