package runtimecache

import (
	"slices"
	"testing"
)

type sliceValue struct {
	Values []int
}

func cloneSliceValue(value sliceValue) sliceValue {
	value.Values = append([]int(nil), value.Values...)
	return value
}

func TestWeightedLRUOwnershipReplacementAndEviction(t *testing.T) {
	cache, err := NewWeightedLRU[string, sliceValue](
		Limits{MaxCost: 5, MaxItems: 3, MaxItemCost: 4},
		cloneSliceValue,
	)
	if err != nil {
		t.Fatalf("NewWeightedLRU: %v", err)
	}

	original := sliceValue{Values: []int{1}}
	if !cache.Put("a", original, 2) {
		t.Fatal("publish a failed")
	}
	original.Values[0] = 99
	first, found := cache.Get("a")
	if !found || !slices.Equal(first.Values, []int{1}) {
		t.Fatalf("published value changed: %+v, found=%v", first, found)
	}
	first.Values[0] = 77
	second, found := cache.Get("a")
	if !found || !slices.Equal(second.Values, []int{1}) {
		t.Fatalf("read clone changed cache: %+v, found=%v", second, found)
	}

	cache.Put("b", sliceValue{Values: []int{2}}, 2)
	if _, found := cache.Get("a"); !found {
		t.Fatal("a missing before eviction")
	}
	cache.Put("c", sliceValue{Values: []int{3}}, 2)
	if _, found := cache.Get("a"); !found {
		t.Fatal("recent a was unexpectedly evicted")
	}
	if _, found := cache.Get("b"); found {
		t.Fatal("least-recent b was not evicted")
	}

	if !cache.Put("a", sliceValue{Values: []int{4}}, 4) {
		t.Fatal("replacement failed")
	}
	if _, found := cache.Get("c"); found {
		t.Fatal("replacement did not evict least-recent c")
	}
	replaced, found := cache.Get("a")
	if !found || !slices.Equal(replaced.Values, []int{4}) {
		t.Fatalf("replacement = %+v, found=%v", replaced, found)
	}

	stats := cache.Stats()
	if stats.Items != 1 || stats.Cost != 4 ||
		stats.Publications != 3 || stats.Replacements != 1 ||
		stats.Evictions != 2 {
		t.Fatalf("unexpected stats: %+v", stats)
	}
}

func TestWeightedLRUOversizeLeavesPriorValue(t *testing.T) {
	cache, err := NewWeightedLRU[string, sliceValue](
		Limits{MaxCost: 4, MaxItems: 2, MaxItemCost: 3},
		cloneSliceValue,
	)
	if err != nil {
		t.Fatalf("NewWeightedLRU: %v", err)
	}
	cache.Put("key", sliceValue{Values: []int{1}}, 2)
	if cache.Put("key", sliceValue{Values: []int{2}}, 4) {
		t.Fatal("oversize replacement was stored")
	}
	value, found := cache.Get("key")
	if !found || !slices.Equal(value.Values, []int{1}) {
		t.Fatalf("prior value lost: %+v, found=%v", value, found)
	}
	if stats := cache.Stats(); stats.Oversize != 1 || stats.Items != 1 || stats.Cost != 2 {
		t.Fatalf("unexpected stats: %+v", stats)
	}
}

func TestWeightedLRURejectsInvalidConfiguration(t *testing.T) {
	testCases := []Limits{
		{},
		{MaxCost: 1, MaxItems: 1, MaxItemCost: 2},
		{MaxCost: 1, MaxItems: 0, MaxItemCost: 1},
	}
	for _, limits := range testCases {
		if _, err := NewWeightedLRU[string, int](limits, func(value int) int {
			return value
		}); err == nil {
			t.Fatalf("accepted limits %+v", limits)
		}
	}
	if _, err := NewWeightedLRU[string, int](
		Limits{MaxCost: 1, MaxItems: 1, MaxItemCost: 1},
		nil,
	); err == nil {
		t.Fatal("accepted nil cloner")
	}
}
