package costar

import (
	"context"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

func TestResultKeyPreservesOrderedInputAndExcludesView(t *testing.T) {
	input := Input{Participants: []ParticipantInput{
		{PersonID: 1, PositionKeys: []string{"staff:anime:1"}},
		{PersonID: 2, PositionKeys: []string{"staff:anime:2"}},
	}}
	first, err := ResultKey("global", testDataVersion, testQueryDigest, input, "")
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	reversed := Input{Participants: []ParticipantInput{
		input.Participants[1],
		input.Participants[0],
	}}
	second, err := ResultKey("global", testDataVersion, testQueryDigest, reversed, "")
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if first == second ||
		strings.Contains(first.String(), "page") ||
		strings.Contains(first.String(), "search") {
		t.Fatalf("keys first=%s second=%s", first.String(), second.String())
	}
}

func TestStoreDeepClonesCompleteCore(t *testing.T) {
	executor, err := runtimecache.NewExecutor(runtimecache.DefaultExecutorConfig())
	if err != nil {
		t.Fatalf("NewExecutor: %v", err)
	}
	store, err := NewStore(runtimecache.ResultConfig{
		Limits: runtimecache.Limits{
			MaxCost:     64 * 1024,
			MaxItems:    4,
			MaxItemCost: 32 * 1024,
		},
		LoadTimeout: time.Second,
	}, executor)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	input := Input{Participants: []ParticipantInput{
		{PersonID: 1, PositionKeys: []string{"staff:anime:1"}},
		{PersonID: 2, PositionKeys: []string{"staff:anime:2"}},
	}}
	key, err := ResultKey("global", testDataVersion, testQueryDigest, input, "")
	if err != nil {
		t.Fatalf("ResultKey: %v", err)
	}
	base, err := Build(context.Background(), pairBuildRequest(t, false))
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	var calls atomic.Int64
	build := func(context.Context) (Core, error) {
		calls.Add(1)
		return CloneCore(base), nil
	}
	first, err := store.GetOrBuild(context.Background(), key, build)
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	first.Participants[0].Person.Name = "mutated"
	first.Works[0].Subject.Participants[0].Credits[0].Staff.PositionKey = "mutated"
	second, err := store.GetOrBuild(context.Background(), key, build)
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if calls.Load() != 1 ||
		second.Participants[0].Person.Name == "mutated" ||
		second.Works[0].Subject.Participants[0].Credits[0].Staff.PositionKey == "mutated" {
		t.Fatalf("cache clone = %+v, calls=%d", second, calls.Load())
	}
}

func TestCoreCostChargesNestedRetainedDataAndSaturates(t *testing.T) {
	base := Core{
		DataVersion: testDataVersion,
		QueryDigest: testQueryDigest,
		Scope:       "global",
		Kind:        "group",
	}
	large := strings.Repeat("retained-", 32*1024)
	expanded := CloneCore(base)
	expanded.Tags.Meta = []TagCount{{Name: large, Count: 1}}
	expanded.Ratings = []RatingDataset{{
		Kind: "common",
		Global: RatingDistribution{
			Buckets: []RatingBucket{{
				Score: 1,
				Examples: []RatingExample{{
					Kind: statistics.UnitSubject,
					Key:  large,
					ID:   1,
					Name: large,
				}},
			}},
		},
	}}
	expanded.Works = []WorkItem{{
		Kind: "series",
		Series: &SeriesWork{
			Key:            large,
			Representative: SubjectReference{ID: 1, Name: large},
			Members: []SeriesMember{{
				SubjectReference: SubjectReference{
					ID:   1,
					Name: large,
				},
			}},
			Participants: []WorkParticipant{{
				PersonID: 1,
				Credits: []Contribution{{
					Kind: "cast",
					Cast: &CastContribution{
						PositionKey: large,
						Character: CharacterReference{
							Key:  large,
							Name: large,
						},
						RoleLabel:  large,
						Provenance: large,
					},
				}},
			}},
		},
	}}
	if got, minimum := coreCost(expanded)-coreCost(base), int64(len(large))*9; got < minimum {
		t.Fatalf("nested retained cost delta = %d, want at least %d", got, minimum)
	}
	if got := saturatingRetainedAdd(maxRetainedCost-5, 10); got != maxRetainedCost {
		t.Fatalf("saturating add = %d", got)
	}
	if got := saturatingRetainedMul(2, maxRetainedCost); got != maxRetainedCost {
		t.Fatalf("saturating multiply = %d", got)
	}
}

func TestStoreRejectsOversizeNestedDynamicPayload(t *testing.T) {
	executor, err := runtimecache.NewExecutor(runtimecache.DefaultExecutorConfig())
	if err != nil {
		t.Fatalf("NewExecutor: %v", err)
	}
	store, err := NewStore(runtimecache.ResultConfig{
		Limits: runtimecache.Limits{
			MaxCost:     2 * 1024,
			MaxItems:    4,
			MaxItemCost: 2 * 1024,
		},
		LoadTimeout: time.Second,
	}, executor)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	input := Input{Participants: []ParticipantInput{
		{PersonID: 1, PositionKeys: []string{"staff:anime:1"}},
		{PersonID: 2, PositionKeys: []string{"staff:anime:2"}},
	}}
	key, err := ResultKey("global", testDataVersion, testQueryDigest, input, "")
	if err != nil {
		t.Fatalf("ResultKey: %v", err)
	}
	large := strings.Repeat("nested-tag-", 1024)
	value := Core{
		DataVersion: testDataVersion,
		QueryDigest: testQueryDigest,
		Scope:       "global",
		Tags: Tags{
			Meta: []TagCount{{Name: large, Count: 1}},
		},
	}
	var calls atomic.Int64
	for attempt := 0; attempt < 2; attempt++ {
		if _, err := store.GetOrBuild(
			context.Background(),
			key,
			func(context.Context) (Core, error) {
				calls.Add(1)
				return CloneCore(value), nil
			},
		); err != nil {
			t.Fatalf("attempt %d: %v", attempt, err)
		}
	}
	stats := store.Stats()
	if calls.Load() != 2 || stats.Items != 0 || stats.Oversize != 2 {
		t.Fatalf("oversize calls=%d stats=%+v", calls.Load(), stats)
	}
}
