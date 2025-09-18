package db

import (
	"context"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/conn/mysql"
)

func DBRaw[T any](ctx context.Context, sql string, conditions ...any) ([]T, error) {
	result := make([]T, 0)

	if err := mysql.DB.WithContext(ctx).Raw(sql, conditions...).Scan(&result).Error; err != nil {
		return nil, err
	}

	return result, nil
}
