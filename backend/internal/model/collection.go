package model

import (
	"fmt"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/bangumi"
)

// Collection 为用户的一条收藏
type Collection struct {
	ID       int
	UserRate float64
}

func (c Collection) GetID() int {
	return c.ID
}

type CollectionEntry struct {
	Query       bangumi.CollectionQuery
	Collections []Collection
}

func (e *CollectionEntry) Key() string {
	return fmt.Sprintf("collection:%s:%d:%d", e.Query.UserID, e.Query.SubjectType, e.Query.CollectionType)
}

func (e *CollectionEntry) TTL() time.Duration {
	return config.Redis.TTL.Collection.Duration()
}
