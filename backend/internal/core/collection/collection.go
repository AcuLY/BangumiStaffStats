package collection

import (
	"context"

	m "github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/bangumi"
	"golang.org/x/sync/errgroup"
)

// Fetch 获取用户指定类型的全部收藏
func Fetch(ctx context.Context, userID string, subjectType int, collTypes []int) ([]m.Collection, error) {
	groups := make([]*m.CollectionGroup, 0, len(collTypes))
	for _, collType := range collTypes {
		groups = append(groups, &m.CollectionGroup{
			Query: bangumi.CollectionQuery{UserID: userID, SubjectType: subjectType, CollectionType: collType},
		})
	}

	if err := store.ReadThrough(ctx, &groups, fetchByType); err != nil {
		return nil, err
	}

	// 一个 CollectionQuery 对应的是一个类型的收藏，需要合并
	collections := make([]m.Collection, 0)
	for _, e := range groups {
		collections = append(collections, e.Collections...)
	}

	return collections, nil
}

func fetchByType(ctx context.Context, groups *[]*m.CollectionGroup) error {
	g, gCtx := errgroup.WithContext(ctx)

	for _, group := range *groups {
		g.Go(func() error {
			fetched, err := bangumi.FetchCollections(gCtx, group.Query)
			if err != nil {
				return err
			}

			group.Collections = make([]m.Collection, 0, len(fetched))
			for _, coll := range fetched {
				group.Collections = append(group.Collections, m.Collection{
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
