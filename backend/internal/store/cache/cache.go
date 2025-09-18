package cache

import (
	"context"
	"encoding/json"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/conn/redis"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store/entity"
)

func buildKeys[T entity.KeyObject](objs []T) []string {
	keys := make([]string, 0, len(objs))
	for _, obj := range objs {
		keys = append(keys, obj.Key())
	}
	return keys
}

// CacheSave 将给定的键值对和 ttl 写入缓存
func CacheSave[T entity.KeyObject, U entity.CacheObject](ctx context.Context, keyObj T, cacheObj U) error {
	raw, err := json.Marshal(cacheObj)
	if err != nil {
		return err
	}

	ttl := cacheObj.TTL()

	return redis.RDB.SetEx(ctx, keyObj.Key(), raw, ttl).Err()
}

// CacheSaveMany 将给定的键值对和 ttl 批量写入缓存
func CacheSaveMany[T entity.KeyObject, U entity.CacheObject](ctx context.Context, mapping map[T]U) error {
	pipe := redis.RDB.Pipeline()

	for keyObj, cacheObj := range mapping {
		raw, err := json.Marshal(cacheObj)
		if err != nil {
			return err
		}

		pipe.Set(ctx, keyObj.Key(), raw, cacheObj.TTL())
	}

	_, err := pipe.Exec(ctx)

	return err
}

// CacheLoadMany 批量查询给定的键，返回缓存缺失的键和缓存命中的值
func CacheLoadMany[T entity.KeyObject, U entity.CacheObject](ctx context.Context, keyObjs []T) (missed []T, cached []U, err error) {
	keys := buildKeys(keyObjs)

	raws, err := redis.RDB.MGet(ctx, keys...).Result()
	if err != nil {
		return keyObjs, nil, err
	}

	missed = make([]T, 0, len(keyObjs))
	cached = make([]U, 0, len(keyObjs))

	for i, raw := range raws {
		if raw == nil {
			missed = append(missed, keyObjs[i])
			continue
		}

		p := new(U)
		if err := json.Unmarshal([]byte(raw.(string)), p); err != nil {
			return keyObjs, nil, err
		}
		cached = append(cached, *p)
	}

	return missed, cached, nil
}
