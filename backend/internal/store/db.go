package store

import (
	"context"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/conn/sqlite"
	"gorm.io/gorm"
)

func DBRaw[T any](ctx context.Context, sql string, conditions ...any) ([]T, error) {
	return gorm.G[T](sqlite.DB).Raw(sql, conditions...).Find(ctx)
}
