package store

import (
	"context"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/store/cache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store/db"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store/entity"
)

func extractValues[T entity.KeyObject, U entity.CacheObject](mapping map[T]U) []U {
	values := make([]U, 0, len(mapping))
	for _, val := range mapping {
		values = append(values, val)
	}
	return values
}

func ReadThrough[T entity.KeyObject, U entity.CacheObject](
	ctx context.Context,
	keyObjs []T,
	fetch func(context.Context, []T) (map[T]U, error),
) ([]U, error) {
	missed, cached, err := cache.CacheLoadMany[T, U](ctx, keyObjs)
	if err != nil {
		return nil, err
	}

	fetched, err := fetch(ctx, missed)
	if err != nil {
		return nil, err
	}

	cache.CacheSaveMany(ctx, fetched)

	return append(cached, extractValues(fetched)...), nil
}

func DBReadThrough[T entity.KeyObject, U entity.DBCacheObject[T]](
	ctx context.Context,
	keyObjs []T,
	sql string,
	conditions []any,
) ([]U, error) {
	fetch := func(ctx context.Context, condObjs []T) (map[T]U, error) {
		result, err := db.DBRaw[U](ctx, sql, conditions...)
		if err != nil {
			return nil, err
		}

		mapping := make(map[T]U, len(condObjs))
		for _, cacheObj := range result {
			keyObj := cacheObj.KeyObject()
			mapping[keyObj] = cacheObj
		}

		return mapping, nil
	}

	return ReadThrough(ctx, keyObjs, fetch)
}
