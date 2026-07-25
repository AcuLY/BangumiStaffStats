package candidates

import (
	"context"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

func TestResultKeyContainsPositionAndExcludesView(t *testing.T) {
	queryDigest := "q1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	first, err := ResultKey(
		"global",
		testDataVersion,
		queryDigest,
		"staff:anime:2",
		"",
	)
	if err != nil {
		t.Fatalf("first key: %v", err)
	}
	same, err := ResultKey(
		"global",
		testDataVersion,
		queryDigest,
		"staff:anime:2",
		"",
	)
	if err != nil {
		t.Fatalf("same key: %v", err)
	}
	other, err := ResultKey(
		"global",
		testDataVersion,
		queryDigest,
		"staff:anime:74",
		"",
	)
	if err != nil {
		t.Fatalf("other key: %v", err)
	}
	if first != same || first == other {
		t.Fatalf("position key identity: first=%s same=%s other=%s", first.String(), same.String(), other.String())
	}
	expectedInputDigest := runtimecache.DigestInput(
		[]byte(`{"positionKey":"staff:anime:2"}`),
	)
	if !strings.Contains(first.String(), expectedInputDigest) ||
		strings.Contains(first.String(), "page") ||
		strings.Contains(first.String(), "sort") ||
		strings.Contains(first.String(), "search") {
		t.Fatalf("semantic key = %s", first.String())
	}
}

func TestStoreReusesCoreAcrossViewsAndClonesValues(t *testing.T) {
	executor, err := runtimecache.NewExecutor(runtimecache.DefaultExecutorConfig())
	if err != nil {
		t.Fatalf("NewExecutor: %v", err)
	}
	store, err := NewStore(runtimecache.ResultConfig{
		Limits: runtimecache.Limits{
			MaxCost:     4096,
			MaxItems:    4,
			MaxItemCost: 2048,
		},
		LoadTimeout: time.Second,
	}, executor)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	key, err := ResultKey(
		"global",
		testDataVersion,
		"q1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		"staff:anime:2",
		"",
	)
	if err != nil {
		t.Fatalf("ResultKey: %v", err)
	}
	base := Core{
		DataVersion: testDataVersion,
		QueryDigest: "q1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		Scope:       "global",
		PositionKey: "staff:anime:2",
		WorkUnit:    statistics.UnitSubject,
		PositionCounts: []PositionCount{{
			PositionKey: "staff:anime:2",
			Count:       2,
		}},
		Rows: []Row{
			{Person: PersonReference{ID: 1, Name: "One"}, WorkCount: 2},
			{Person: PersonReference{ID: 2, Name: "Two"}, WorkCount: 1},
		},
	}
	var calls atomic.Int64
	build := func(context.Context) (Core, error) {
		calls.Add(1)
		return CloneCore(base), nil
	}
	first, err := store.GetOrBuild(context.Background(), key, build)
	if err != nil {
		t.Fatalf("first GetOrBuild: %v", err)
	}
	first.Rows[0].Person.Name = "mutated"
	first.PositionCounts[0].Count = 99
	second, err := store.GetOrBuild(context.Background(), key, build)
	if err != nil {
		t.Fatalf("second GetOrBuild: %v", err)
	}
	if calls.Load() != 1 ||
		second.Rows[0].Person.Name != "One" ||
		second.PositionCounts[0].Count != 2 {
		t.Fatalf("cached clone = %+v, calls=%d", second, calls.Load())
	}

	pageOne, err := NormalizeView("global", nil)
	if err != nil {
		t.Fatalf("page one: %v", err)
	}
	pageTwoNumber := int64(2)
	pageTwo, err := NormalizeView("global", &ViewInput{Page: &pageTwoNumber})
	if err != nil {
		t.Fatalf("page two: %v", err)
	}
	left, err := Project(context.Background(), second, pageOne)
	if err != nil {
		t.Fatalf("Project page one: %v", err)
	}
	right, err := Project(context.Background(), second, pageTwo)
	if err != nil {
		t.Fatalf("Project page two: %v", err)
	}
	if !slices.Equal(left.PositionCounts, right.PositionCounts) ||
		calls.Load() != 1 {
		t.Fatalf("view recomputed core: left=%+v right=%+v calls=%d", left, right, calls.Load())
	}
}

func TestPersonalResultKeyRequiresCollectionDigest(t *testing.T) {
	_, err := ResultKey(
		"personal",
		testDataVersion,
		"q1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		"staff:anime:2",
		"",
	)
	if err == nil {
		t.Fatal("personal key accepted empty collection digest")
	}
	if _, err := ResultKey(
		"personal",
		testDataVersion,
		"q1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		"staff:anime:2",
		"c1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
	); err != nil {
		t.Fatalf("personal key: %v", err)
	}
}
