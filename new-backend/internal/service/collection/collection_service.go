package collection

import (
	"context"
	"sync"

	cache "github.com/AcuLY/BangumiStaffStats/internal/cache/collection"
	"github.com/AcuLY/BangumiStaffStats/pkg/bangumi"
	"github.com/AcuLY/BangumiStaffStats/pkg/logger"
	"github.com/AcuLY/BangumiStaffStats/pkg/model"
	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/errgroup"
)

// GetUserCollections 获取用户指定类型的全部收藏
//
// 返回的 Subject 对象只填充 ID 和 UserRate 字段
func GetUserCollections(ctx context.Context, userID string, subjectType int, collectionTypes []int) ([]*model.Subject, error) {
	collections := make([]*model.Subject, 0)
	g := new(errgroup.Group)
	var mu sync.Mutex

	for _, collectionType := range collectionTypes {
		cq := bangumi.CollectionQuery{
			UserID:         userID,
			SubjectType:    subjectType,
			CollectionType: collectionType,
		}

		g.Go(func() error {
			// 检查缓存
			cached, err := cache.GetUserCollection(ctx, cq)
			if err != nil && err != redis.Nil {
				return err
			} else if err == nil {
				mu.Lock()
				collections = append(collections, cached...)
				mu.Unlock()
				return nil
			}

			// 调用 Bangumi API 获取收藏
			fetched, err := bangumi.GetCollectionsByType(ctx, cq)
			if err != nil {
				return err
			}

			mu.Lock()
			collections = append(collections, fetched...)
			mu.Unlock()

			// 异步回写缓存
			go func() {
				err = cache.SetUserCollection(context.Background(), cq, fetched)
				if err != nil {
					logger.Warn("Failed to set user collection cache: " + err.Error())
				}
			}()

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	return collections, nil
}