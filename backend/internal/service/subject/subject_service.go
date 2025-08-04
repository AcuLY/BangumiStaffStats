package subject

import (
	"context"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	repository "github.com/AcuLY/BangumiStaffStats/backend/internal/repository/subject"
	"golang.org/x/sync/errgroup"
)

// Global 获取指定类型的所有条目
func Global(ctx context.Context, subjectType int, favoriteRange []int) ([]*model.Subject, error) {
	if len(favoriteRange) < 2 {
		favoriteRange = []int{50, 100000} // 默认范围
	}
	return repository.FindAllByType(ctx, subjectType, favoriteRange)
}

// LoadInfos 加载给定条目的完整信息
//
// 由于某些条目已被删除，需要传入切片指针以过滤被删除的条目
func LoadInfos(ctx context.Context, subjects *[]*model.Subject) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	g := new(errgroup.Group)

	for _, subject := range *subjects {
		g.Go(func() error {
			if err := repository.Find(ctx, subject); err != nil {
				return nil
			}

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return err
	}

	// 过滤掉已被删除的条目
	validCount := 0
	for _, s := range *subjects {
		if s.Name != "" {
			(*subjects)[validCount] = s
			validCount++
		}
	}
	*subjects = (*subjects)[:validCount]

	return nil
}
