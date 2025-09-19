package store

import (
	"context"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/conn/mysql"
	"gorm.io/gorm"
)

func DBRaw[T any](ctx context.Context, sql string, conditions ...any) ([]T, error) {
	return gorm.G[T](mysql.DB).Raw(sql, conditions...).Find(ctx)
}
