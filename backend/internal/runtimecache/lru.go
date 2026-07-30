package runtimecache

import (
	"container/list"
	"sync"
)

// Limits defines exact retained-cost, entry-count, and per-entry bounds.
type Limits struct {
	MaxCost     int64
	MaxItems    int
	MaxItemCost int64
}

func (limits Limits) valid() bool {
	return limits.MaxCost > 0 &&
		limits.MaxItems > 0 &&
		limits.MaxItemCost > 0 &&
		limits.MaxItemCost <= limits.MaxCost
}

// CloneFunc transfers value ownership across a cache boundary.
type CloneFunc[V any] func(V) V

type lruEntry[K comparable, V any] struct {
	key   K
	value V
	cost  int64
}

// LRUStats is an atomic snapshot of cache behavior and retained state.
type LRUStats struct {
	Hits         uint64
	Misses       uint64
	Publications uint64
	Replacements uint64
	Evictions    uint64
	Oversize     uint64
	Deletes      uint64
	Items        int
	Cost         int64
}

// WeightedLRU is a deterministic, mutex-protected weighted LRU. Callers retain
// no ownership of values passed to Put or returned by Get.
type WeightedLRU[K comparable, V any] struct {
	mu      sync.Mutex
	limits  Limits
	clone   CloneFunc[V]
	entries map[K]*list.Element
	order   *list.List
	cost    int64
	stats   LRUStats
}

// NewWeightedLRU constructs an empty cache.
func NewWeightedLRU[K comparable, V any](
	limits Limits,
	clone CloneFunc[V],
) (*WeightedLRU[K, V], error) {
	if !limits.valid() || clone == nil {
		return nil, outcome(CodeInvalidInput)
	}
	return &WeightedLRU[K, V]{
		limits:  limits,
		clone:   clone,
		entries: make(map[K]*list.Element),
		order:   list.New(),
	}, nil
}

// Get returns an ownership-safe clone and promotes the key to most-recently
// used. The clone runs outside the cache lock.
func (cache *WeightedLRU[K, V]) Get(key K) (V, bool) {
	var zero V
	if cache == nil {
		return zero, false
	}

	cache.mu.Lock()
	element, found := cache.entries[key]
	if !found {
		cache.stats.Misses++
		cache.mu.Unlock()
		return zero, false
	}
	cache.order.MoveToFront(element)
	cache.stats.Hits++
	value := element.Value.(*lruEntry[K, V]).value
	cache.mu.Unlock()
	return cache.clone(value), true
}

// Put publishes a clone. Oversize values leave any prior value untouched and
// return false without changing the caller's successful result.
func (cache *WeightedLRU[K, V]) Put(key K, value V, cost int64) bool {
	if cache == nil || cost < 0 {
		return false
	}
	if cost > cache.limits.MaxItemCost || cost > cache.limits.MaxCost {
		cache.mu.Lock()
		cache.stats.Oversize++
		cache.mu.Unlock()
		return false
	}

	published := cache.clone(value)

	cache.mu.Lock()
	defer cache.mu.Unlock()

	if element, found := cache.entries[key]; found {
		entry := element.Value.(*lruEntry[K, V])
		cache.cost -= entry.cost
		entry.value = published
		entry.cost = cost
		cache.cost += cost
		cache.order.MoveToFront(element)
		cache.stats.Replacements++
	} else {
		element := cache.order.PushFront(&lruEntry[K, V]{
			key:   key,
			value: published,
			cost:  cost,
		})
		cache.entries[key] = element
		cache.cost += cost
		cache.stats.Publications++
	}

	for cache.cost > cache.limits.MaxCost ||
		len(cache.entries) > cache.limits.MaxItems {
		cache.evictOldest()
	}
	return true
}

// Delete removes one key if present.
func (cache *WeightedLRU[K, V]) Delete(key K) bool {
	if cache == nil {
		return false
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	element, found := cache.entries[key]
	if !found {
		return false
	}
	cache.remove(element)
	cache.stats.Deletes++
	return true
}

// Stats returns one consistent snapshot.
func (cache *WeightedLRU[K, V]) Stats() LRUStats {
	if cache == nil {
		return LRUStats{}
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	result := cache.stats
	result.Items = len(cache.entries)
	result.Cost = cache.cost
	return result
}

func (cache *WeightedLRU[K, V]) evictOldest() {
	element := cache.order.Back()
	if element == nil {
		return
	}
	cache.remove(element)
	cache.stats.Evictions++
}

func (cache *WeightedLRU[K, V]) remove(element *list.Element) {
	entry := element.Value.(*lruEntry[K, V])
	delete(cache.entries, entry.key)
	cache.order.Remove(element)
	cache.cost -= entry.cost
}
