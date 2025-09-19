package collection

import (
	"context"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/bangumi"
	"golang.org/x/sync/errgroup"
)

type (
	Collection      = model.Collection
	CollectionEntry = model.CollectionEntry
)

// Fetch 获取用户指定类型的全部收藏
func Fetch(ctx context.Context, userID string, subjectType int, collTypes []int) ([]Collection, error) {
	entries := make([]*CollectionEntry, 0, len(collTypes))
	for _, collType := range collTypes {
		entries = append(entries, &CollectionEntry{
			Query: bangumi.CollectionQuery{UserID: userID, SubjectType: subjectType, CollectionType: collType},
		})
	}

	if err := store.ReadThrough(ctx, &entries, fetchByType); err != nil {
		return nil, err
	}

	// 一个 CollectionQuery 对应的是一个类型的收藏，需要合并
	collections := make([]Collection, 0)
	for _, e := range entries {
		collections = append(collections, e.Collections...)
	}

	return collections, nil
}

func fetchByType(ctx context.Context, entries *[]*CollectionEntry) error {
	g, gCtx := errgroup.WithContext(ctx)

	for _, q := range *entries {
		g.Go(func() error {
			fetched, err := bangumi.FetchCollections(gCtx, q.Query)
			if err != nil {
				return err
			}

			q.Collections = make([]Collection, 0, len(fetched))
			for _, coll := range fetched {
				q.Collections = append(q.Collections, Collection{
					ID:       coll.Subject.ID,
					UserRate: float64(coll.Rate),
				})
			}

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return err
	}

	return nil
}
