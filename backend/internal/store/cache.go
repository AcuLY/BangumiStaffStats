package store

import (
	"context"
	"encoding/json"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/conn/redis"
)

func buildKeys[T Object[U], U any](objs []T) []string {
	keys := make([]string, 0, len(objs))
	for _, obj := range objs {
		keys = append(keys, obj.Key())
	}
	return keys
}

// CacheSave 将给定的键值对和 ttl 写入缓存
func CacheSave[T Object[U], U any](ctx context.Context, obj T) error {
	raw, err := json.Marshal(obj)
	if err != nil {
		return err
	}

	return redis.RDB.SetEx(ctx, obj.Key(), raw, obj.TTL()).Err()
}

// CacheSaveMany 将给定的键值对和 ttl 批量写入缓存
func CacheSaveMany[T Object[U], U any](ctx context.Context, objs []T) error {
	pipe := redis.RDB.Pipeline()

	for _, obj := range objs {
		raw, err := json.Marshal(obj)
		if err != nil {
			return err
		}

		pipe.Set(ctx, obj.Key(), raw, obj.TTL())
	}

	_, err := pipe.Exec(ctx)

	return err
}

// CacheLoadMany 批量查询给定的键，返回缓存缺失的键和缓存命中的值
func CacheLoadMany[T Object[U], U any](ctx context.Context, objs []T) (missed []T, cached []T, err error) {
	if len(objs) == 0 {
		return objs, nil, nil
	}

	keys := buildKeys(objs)

	raws, err := redis.RDB.MGet(ctx, keys...).Result()
	if err != nil {
		return objs, nil, err
	}

	missed = make([]T, 0, len(objs))
	cached = make([]T, 0, len(objs))

	for i, raw := range raws {
		if raw == nil {
			missed = append(missed, objs[i])
			continue
		}

		var obj T
		if err := json.Unmarshal([]byte(raw.(string)), &obj); err != nil {
			return objs, nil, err
		}
		cached = append(cached, obj)
	}

	return missed, cached, nil
}
