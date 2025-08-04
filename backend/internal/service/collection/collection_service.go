package collection

import (
	"context"
	"sync"

	cache "github.com/AcuLY/BangumiStaffStats/backend/internal/cache/collection"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/bangumi"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/errgroup"
)

// Fetch 获取用户指定类型的全部收藏
//
// 返回的 Subject 对象只填充 ID 和 UserRate 字段
func Fetch(ctx context.Context, userID string, subjectType int, collectionTypes []int) ([]*model.Subject, error) {
	subjects := make([]*model.Subject, 0)
	g := new(errgroup.Group)
	var mu sync.Mutex

	for _, collectionType := range collectionTypes {
		cq := bangumi.CollectionQuery{
			UserID:         userID,
			SubjectType:    subjectType,
			CollectionType: collectionType,
		}

		g.Go(func() error {
			subjectsByPage, err := fetchByType(ctx, cq)
			if err != nil {
				return err
			}

			mu.Lock()
			subjects = append(subjects, subjectsByPage...)
			mu.Unlock()

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	return subjects, nil
}

// fetchByType 获取用户一种类型的收藏，返回 Subject 列表
func fetchByType(ctx context.Context, cq bangumi.CollectionQuery) ([]*model.Subject, error) {
	// 检查缓存
	cached, err := cache.Find(ctx, cq)
	if err != nil && err != redis.Nil {
		return nil, err
	} else if err == nil {
		return cached, nil
	}

	// 调用 Bangumi API 获取收藏
	fetched, err := bangumi.FetchCollectionsByType(ctx, cq)
	if err != nil {
		return nil, err
	}

	// 将原始 JSON 解析为需要的 Subject
	subjects, err := parseBangumiResp(fetched)
	if err != nil {
		return nil, err
	}

	// 异步回写缓存
	go func() {
		err = cache.Save(context.Background(), cq, subjects)
		if err != nil {
			logger.Warn("Failed to set user collection cache: "+err.Error())
		}
	}()

	return subjects, err
}

// parseBangumiResp 将 Bangumi API 的响应体解析为 Subject 列表
func parseBangumiResp(collections []*bangumi.Collection) ([]*model.Subject, error) {
	subjects := make([]*model.Subject, 0, len(collections))

	for _, c := range collections {
		rate := float32(c.Rate)
		s := &model.Subject{ID: c.SubjectID, UserRate: &rate} // 这里填充的是 UserRate
		subjects = append(subjects, s)
	}

	return subjects, nil
}
