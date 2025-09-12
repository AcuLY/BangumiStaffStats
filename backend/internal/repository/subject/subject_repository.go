package subject

import (
	"context"

	cache "github.com/AcuLY/BangumiStaffStats/backend/internal/cache/subject"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/repository"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
)

// Find 根据条目 ID 从缓存或数据库加载条目完整信息
func Find(ctx context.Context, subjects *[]*model.Subject) error {
	if err := cache.Load(ctx, *subjects); err != nil {
		return err
	}

	hit := make([]*model.Subject, 0, len(*subjects))
	missedIDs := make([]int, 0, len(*subjects))
	for _, s := range *subjects {
		if s.Name == "" {
			missedIDs = append(missedIDs, s.ID)
		} else {
			hit = append(hit, s)
		}
	}

	missed := make([]*model.Subject, 0, len(missedIDs))
	err := repository.DB.
		WithContext(ctx).
		Table("subjects").
		Where("subject_id in ?", missedIDs).
		Scan(missed).
		Error
	if err != nil {
		logger.Warn(
			"Failed to find subjects: "+err.Error(),
			repository.DBStats(),
		)
		return nil
	}

	cache.Save(ctx, missed)

	*subjects = append(hit, missed...)

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
