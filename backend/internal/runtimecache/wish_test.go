package runtimecache

import (
	"reflect"
	"testing"
)

func TestWishCacheCanonicalOrder(t *testing.T) {
	for _, typ := range []string{"book", "anime", "music", "game", "real"} {
		a, err := NewCollectionKey("alice", typ, []string{"dropped", "wish", "completed", "wish", "on_hold", "in_progress"})
		if err != nil {
			t.Fatal(err)
		}
		order := []string{"wish", "completed", "in_progress", "on_hold", "dropped"}
		b, err := NewCollectionKey("alice", typ, order)
		if err != nil || a != b || !reflect.DeepEqual(a.Statuses(), order) {
			t.Fatalf("%+v %v", a, err)
		}
	}
}
