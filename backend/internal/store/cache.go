package store

import (
	"context"
	"encoding/json"
	"sort"
	"sync"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
	m "github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

type cacheItem struct {
	raw        []byte
	expiresAt  time.Time
	lastAccess time.Time
}

type ttlCache struct {
	mu         sync.Mutex
	maxEntries int
	items      map[string]cacheItem
}

var memoryCache = &ttlCache{
	maxEntries: 1024,
	items:      make(map[string]cacheItem),
}

func InitCache() {
	maxEntries := 1024
	if config.Cache != nil && config.Cache.MaxEntries > 0 {
		maxEntries = config.Cache.MaxEntries
	}

	memoryCache.mu.Lock()
	defer memoryCache.mu.Unlock()

	memoryCache.maxEntries = maxEntries
	memoryCache.items = make(map[string]cacheItem)
}

func buildKeys[T m.Object[U], U any](objs []T) []string {
	keys := make([]string, 0, len(objs))
	for _, obj := range objs {
		keys = append(keys, obj.Key())
	}
	return keys
}

func CacheSave[T m.Object[U], U any](ctx context.Context, obj T) error {
	return CacheSaveMany(ctx, []T{obj})
}

func CacheSaveMany[T m.Object[U], U any](ctx context.Context, objs []T) error {
	if len(objs) == 0 {
		return nil
	}

	now := time.Now()
	items := make(map[string]cacheItem, len(objs))
	for _, obj := range objs {
		if err := ctx.Err(); err != nil {
			return err
		}

		raw, err := json.Marshal(obj)
		if err != nil {
			return err
		}
		items[obj.Key()] = cacheItem{
			raw:        raw,
			expiresAt:  now.Add(obj.TTL()),
			lastAccess: now,
		}
	}

	memoryCache.mu.Lock()
	defer memoryCache.mu.Unlock()

	for key, item := range items {
		memoryCache.items[key] = item
	}
	memoryCache.enforceLimit(now)

	return nil
}

func CacheLoadMany[T m.Object[U], U any](ctx context.Context, objs []T) (missed []T, cached []T, err error) {
	if len(objs) == 0 {
		return objs, nil, nil
	}

	now := time.Now()
	keys := buildKeys(objs)
	raws := make([][]byte, len(keys))
	hits := make([]bool, len(keys))

	memoryCache.mu.Lock()
	for i, key := range keys {
		if err := ctx.Err(); err != nil {
			memoryCache.mu.Unlock()
			return objs, nil, err
		}

		item, exists := memoryCache.items[key]
		if !exists {
			continue
		}
		if now.After(item.expiresAt) {
			delete(memoryCache.items, key)
			continue
		}

		item.lastAccess = now
		memoryCache.items[key] = item
		raws[i] = append([]byte(nil), item.raw...)
		hits[i] = true
	}
	memoryCache.mu.Unlock()

	missed = make([]T, 0, len(objs))
	cached = make([]T, 0, len(objs))
	for i, obj := range objs {
		if !hits[i] {
			missed = append(missed, obj)
			continue
		}

		var cachedObj T
		if err := json.Unmarshal(raws[i], &cachedObj); err != nil {
			return objs, nil, err
		}
		cached = append(cached, cachedObj)
	}

	return missed, cached, nil
}

func (c *ttlCache) enforceLimit(now time.Time) {
	for key, item := range c.items {
		if now.After(item.expiresAt) {
			delete(c.items, key)
		}
	}
	if c.maxEntries <= 0 || len(c.items) <= c.maxEntries {
		return
	}

	keys := make([]string, 0, len(c.items))
	for key := range c.items {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		return c.items[keys[i]].lastAccess.Before(c.items[keys[j]].lastAccess)
	})

	for _, key := range keys[:len(c.items)-c.maxEntries] {
		delete(c.items, key)
	}
}
