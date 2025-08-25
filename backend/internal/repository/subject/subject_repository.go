package subject

import (
	"context"

	cache "github.com/AcuLY/BangumiStaffStats/backend/internal/cache/subject"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/repository"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	"github.com/redis/go-redis/v9"
)

// Find 根据条目 ID 从缓存或数据库加载条目完整信息
func Find(ctx context.Context, s *model.Subject) error {
	if err := cache.Find(ctx, s); err == nil {
		return nil
	} else if err != redis.Nil {
		return err
	}

	err := repository.DB.
		WithContext(ctx).
		Table("subjects").
		Where("subject_id = ?", s.ID).
		First(s).
		Error
	if err != nil {
		logger.Warn(
			"Failed to find subject: "+err.Error(),
			logger.Field("subject_id", s.ID),
			repository.DBStats(),
		)
		return nil
	}

	go func() {
		if err := cache.Save(context.Background(), s); err != nil {
			logger.Warn("Failed to set user collection cache: " + err.Error())
		}
	}()

	return nil
}

// FindAllByType 从数据库获取所有指定类型的条目
func FindAllByType(ctx context.Context, subjectType int, favoriteRange []int) ([]*model.Subject, error) {
	var subjects []*model.Subject

	err := repository.DB.
		WithContext(ctx).
		Where(
			"subject_type = ? AND subject_favorite >= ? AND subject_favorite <= ?",
			subjectType,
			favoriteRange[0],
			favoriteRange[1],
		).
		Find(&subjects).
		Error
	if err != nil {
		logger.Warn("Failed to get all subjects: "+err.Error(), repository.DBStats())
		return nil, err
	}

	return subjects, nil
}
