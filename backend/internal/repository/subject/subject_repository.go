package subject

import (
	"context"

	cache "github.com/AcuLY/BangumiStaffStats/backend/internal/cache/subject"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/repository"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/model"
	"github.com/redis/go-redis/v9"
)

// FindSubject 根据条目 ID 从缓存或数据库加载条目完整信息
func FindSubject(ctx context.Context, s *model.Subject) error {
	if err := cache.GetSubject(ctx, s); err == nil {
		return nil
	} else if err != redis.Nil {
		return err
	}

	repository.Semaphore <- struct{}{}
	defer func() { <-repository.Semaphore }()

	if err := repository.DB.WithContext(ctx).Table("subjects").Where("subject_id = ?", s.ID).First(s).Error; err != nil {
		return nil
	}

	go func() {
		if err := cache.SetSubject(context.Background(), s); err != nil {
			logger.Warn("Failed to set user collection cache: " + err.Error())
		}
	}()

	return nil
}

// FindSequelOrder 根据条目 ID 从缓存或数据库加载条目的系列信息
func FindSequelOrder(ctx context.Context, s *model.Subject) (*model.SequelOrder, error) {
	so, err := cache.GetSequelOrder(ctx, s)
	if err == nil {
		return so, nil
	} else if err != redis.Nil {
		return nil, err
	}

	repository.Semaphore <- struct{}{}
	defer func() { <-repository.Semaphore }()

	so = new(model.SequelOrder)
	if err := repository.DB.WithContext(ctx).Table("sequel_orders").Where("subject_id = ?", s.ID).First(so).Error; err != nil {
		logger.Warn("Sequel order not found.", logger.Field("subject_id", s.ID))
		return nil, nil
	}

	go func() {
		if err := cache.SetSequelOrder(context.Background(), so); err != nil {
			logger.Warn("Failed to set sequel order: "+err.Error(), logger.Field("sequel_order", so))
		}
	}()

	return so, nil
}

// FindGlobalSubjectsByType 从数据库获取所有指定类型的条目
//
// 仅返回收藏人数大于 50 的条目
func FindGlobalSubjectsByType(ctx context.Context, subjectType int) ([]*model.Subject, error) {
	repository.Semaphore <- struct{}{}
	defer func() { <-repository.Semaphore }()

	var subjects []*model.Subject
	err := repository.DB.WithContext(ctx).Where("subject_type = ? AND subject_favorite > 50", subjectType).Find(&subjects).Error
	if err != nil {
		return nil, err
	}

	return subjects, nil
}
