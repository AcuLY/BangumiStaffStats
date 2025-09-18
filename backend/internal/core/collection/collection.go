package collection

import (
	"context"
	"sync"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/bangumi"
	"golang.org/x/sync/errgroup"
)

// Get 获取用户指定类型的全部收藏
func Get(ctx context.Context, userID string, subjectType int, collectionTypes []int) ([]model.Collection, error) {
	queries := make([]model.Query, 0, len(collectionTypes))
	for _, collType := range collectionTypes {
		queries = append(queries, model.Query{UserID: userID, SubjectType: subjectType, CollectionType: collType})
	}

	collectionsByTypes, err := store.ReadThrough(ctx, queries, fetch)
	if err != nil {
		return nil, err
	}

	// store.ReadThrough 返回的是 []Collection，需要合并
	collections := make([]model.Collection, 0)
	for _, collsByType := range collectionsByTypes {
		collections = append(collections, *collsByType...)
	}

	return collections, nil
}

func fetch(ctx context.Context, missed []model.Query) (map[model.Query]*model.Collections, error) {
	collectionMap := make(map[model.Query]*model.Collections)
	g, gCtx := errgroup.WithContext(ctx)
	var mu sync.Mutex

	for _, q := range missed {
		g.Go(func() error {
			fetchedColls, err := bangumi.FetchCollections(gCtx, (bangumi.CollectionQuery)(q))
			if err != nil {
				return err
			}

			// 一个 query 对应一个收藏类型的全部收藏
			collByType := make([]model.Collection, 0, len(fetchedColls))
			for _, r := range fetchedColls {
				collByType = append(collByType, model.Collection{ID: model.SubjectID(r.SubjectID), UserRate: float64(r.Rate)})
			}

			mu.Lock()
			collectionMap[q] = (*model.Collections)(&collByType)
			mu.Unlock()

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	return collectionMap, nil
}
