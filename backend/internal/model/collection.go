package model

import (
	"fmt"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/bangumi"
)

type Query bangumi.CollectionQuery 

func (q Query) Key() string {
	return fmt.Sprintf("collection:%s:%d:%d", q.UserID, q.SubjectType, q.CollectionType)
}

// Collection 为用户的一条收藏
type Collection struct {
	ID       SubjectID
	UserRate float64
}

type Collections []Collection

func (cs *Collections) TTL() time.Duration {
	return config.Redis.TTL.Collection.Duration()
}
