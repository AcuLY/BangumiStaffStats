package persondetail

import (
	"context"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

func TestSeriesMetaTagsOwnTheirSliceAndRetainedCost(t *testing.T) {
	core := Core{Works: []WorkItem{{Kind: "series", Series: &SeriesWork{MetaTags: []string{}}}}}
	baseCost := coreCost(core)
	core.Works[0].Series.MetaTags = []string{strings.Repeat("tag", 255)}
	if delta := coreCost(core) - baseCost; delta < int64(len(core.Works[0].Series.MetaTags[0])) {
		t.Fatalf("series metadata not charged: delta=%d", delta)
	}
	copy := CloneCore(core)
	copy.Works[0].Series.MetaTags[0] = "mutated"
	if core.Works[0].Series.MetaTags[0] == "mutated" {
		t.Fatal("series metadata aliases cached core")
	}
}

func TestResultKeyUsesSemanticPersonInputAndScope(t *testing.T) {
	global, err := ResultKey("global", testDataVersion, testQueryDigest, 10, "")
	if err != nil {
		t.Fatal(err)
	}
	again, err := ResultKey("global", testDataVersion, testQueryDigest, 10, "")
	if err != nil {
		t.Fatal(err)
	}
	other, err := ResultKey("global", testDataVersion, testQueryDigest, 11, "")
	if err != nil {
		t.Fatal(err)
	}
	if global.String() != again.String() ||
		global.String() == other.String() ||
		strings.Contains(global.String(), "/10") {
		t.Fatalf("semantic keys: %q %q %q", global.String(), again.String(), other.String())
	}
	if _, err := ResultKey("global", testDataVersion, testQueryDigest, 10, "c1:"+strings.Repeat("a", 64)); err == nil {
		t.Fatal("global key accepted collection digest")
	}
	if _, err := ResultKey("personal", testDataVersion, testQueryDigest, 10, ""); err == nil {
		t.Fatal("personal key accepted missing collection digest")
	}
}

func TestIdentityScopeCacheKeyIsCanonicalAndIsolated(t *testing.T) {
	key := func(keys ...string) string {
		value, err := ResultKey("global", testDataVersion, testQueryDigest, 100, "", keys...)
		if err != nil {
			t.Fatal(err)
		}
		return value.String()
	}
	if key("staff:anime:2", "cast:anime:main") != key("cast:anime:main", "staff:anime:2") {
		t.Fatal("identity order fragmented cache")
	}
	if key() == key("staff:anime:2") || key("staff:anime:2") == key("cast:anime:main") {
		t.Fatal("identity scopes collided")
	}
}

func TestStoreCachesCompleteCoreAcrossViewsAndClonesOwnership(t *testing.T) {
	executor, err := runtimecache.NewExecutor(runtimecache.ExecutorConfig{
		RunningLimit: 1,
		QueueLimit:   1,
		RetryAfter:   time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewStore(runtimecache.ResultConfig{
		Limits: runtimecache.Limits{
			MaxCost:     1 << 20,
			MaxItems:    8,
			MaxItemCost: 1 << 19,
		},
		LoadTimeout: time.Second,
	}, executor)
	if err != nil {
		t.Fatal(err)
	}
	key, err := ResultKey("global", testDataVersion, testQueryDigest, 10, "")
	if err != nil {
		t.Fatal(err)
	}
	var builds atomic.Int64
	build := func(context.Context) (Core, error) {
		builds.Add(1)
		return Core{
			DataVersion: testDataVersion,
			QueryDigest: testQueryDigest,
			Scope:       "global",
			Person:      PersonProfile{PersonReference: PersonReference{ID: 10, Name: "Original"}},
			Summary:     Summary{WorkUnit: statistics.UnitSubject},
			Tags: Tags{
				Meta:      []TagCount{},
				Community: []TagCount{},
			},
			Ratings: Ratings{
				Global: RatingDistribution{
					Buckets: make([]RatingBucket, 10),
					Timeline: []RatingTimelinePoint{{
						Year: 2024, Quarter: 1, Average: 800, Count: 1,
						Works: []RatingTimelineWork{{
							Subject: SubjectReference{ID: 1, Name: "Work", NameCN: stringPointer("作品"), Date: stringPointer("2024-01")}, Score: 800,
						}},
					}},
				},
			},
			Works:      []WorkItem{},
			Characters: []CharacterItem{},
		}, nil
	}
	first, err := store.GetOrBuild(context.Background(), key, build)
	if err != nil {
		t.Fatal(err)
	}
	first.Person.Name = "Mutated"
	first.Ratings.Global.Timeline[0].Works[0].Score = 100
	*first.Ratings.Global.Timeline[0].Works[0].Subject.NameCN = "Mutated"
	*first.Ratings.Global.Timeline[0].Works[0].Subject.Date = "2025-04"
	second, err := store.GetOrBuild(context.Background(), key, build)
	if err != nil {
		t.Fatal(err)
	}
	if builds.Load() != 1 || second.Person.Name != "Original" {
		t.Fatalf("cache ownership/builds: builds=%d second=%+v", builds.Load(), second)
	}
	if work := second.Ratings.Global.Timeline[0].Works[0]; work.Score != 800 || *work.Subject.NameCN != "作品" || *work.Subject.Date != "2024-01" {
		t.Fatalf("cache leaked nested timeline ownership: %+v", work)
	}
}

func TestCoreCostIncreasesWithRetainedEvidence(t *testing.T) {
	base := Core{
		DataVersion: testDataVersion,
		QueryDigest: testQueryDigest,
		Scope:       "personal",
		Person: PersonProfile{
			PersonReference: PersonReference{ID: 10, Name: "Person"},
			Careers:         []string{},
		},
		Summary: Summary{WorkUnit: statistics.UnitSubject},
		Tags: Tags{
			Meta:      []TagCount{},
			Community: []TagCount{},
			Personal:  []TagCount{},
		},
		Ratings: Ratings{
			Global: RatingDistribution{
				Buckets:  []RatingBucket{},
				Timeline: []RatingTimelinePoint{},
			},
		},
		Works:      []WorkItem{},
		Characters: []CharacterItem{},
	}
	last := coreCost(base)

	withRatings := CloneCore(base)
	withRatings.Ratings.Global.Buckets = []RatingBucket{{
		Score: 8,
		Count: 1,
		Examples: []RatingExample{{
			Kind: statistics.UnitSubject,
			Key:  "subject:1",
			ID:   1,
			Name: "Example",
		}},
	}}
	withRatings.Ratings.Global.Timeline = []RatingTimelinePoint{{
		Year: 2026, Quarter: 1, Average: 800, Count: 1,
	}}
	if current := coreCost(withRatings); current <= last {
		t.Fatalf("ratings cost did not increase: base=%d current=%d", last, current)
	} else {
		last = current
	}

	withPreference := CloneCore(withRatings)
	withPreference.Preference = &Preference{
		ComparableCount:       1,
		ComparableSeriesCount: 1,
		EffectiveEvidence:     1,
		Mean: &statistics.Rational{
			Numerator:   "123456789",
			Denominator: "100000000",
		},
		EvidenceWeight: statistics.Rational{
			Numerator:   "1",
			Denominator: "6",
		},
		Score: &statistics.Rational{
			Numerator:   "123456789",
			Denominator: "600000000",
		},
		Preferred: []PreferenceItem{{
			Unit: RatingExample{
				Kind: statistics.UnitSubject,
				Key:  "subject:1",
				ID:   1,
				Name: "Example",
			},
			PersonalScore:        900,
			GlobalScore:          800,
			DifferenceHundredths: 100,
		}},
		Conservative: []PreferenceItem{},
	}
	if current := coreCost(withPreference); current <= last {
		t.Fatalf("preference cost did not increase: previous=%d current=%d", last, current)
	} else {
		last = current
	}

	withOptionalMetrics := CloneCore(withPreference)
	average, overall, global, highest, lowest := int64(800), int64(500), int64(790), int64(900), int64(700)
	withOptionalMetrics.Metrics.Average = &average
	withOptionalMetrics.Metrics.Overall = &overall
	withOptionalMetrics.Metrics.GlobalAverage = &global
	withOptionalMetrics.Metrics.Highest = &highest
	withOptionalMetrics.Metrics.Lowest = &lowest
	if current := coreCost(withOptionalMetrics); current <= last {
		t.Fatalf("optional metric cost did not increase: previous=%d current=%d", last, current)
	}
}

func TestStoreDoesNotAdmitCoreWhoseEvidenceExceedsItemLimit(t *testing.T) {
	executor, err := runtimecache.NewExecutor(runtimecache.ExecutorConfig{
		RunningLimit: 1,
		QueueLimit:   1,
		RetryAfter:   time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	largeName := strings.Repeat("evidence", 128)
	core := Core{
		DataVersion: testDataVersion,
		QueryDigest: testQueryDigest,
		Scope:       "global",
		Person: PersonProfile{
			PersonReference: PersonReference{ID: 10, Name: largeName},
			Careers:         []string{},
		},
		Summary: Summary{WorkUnit: statistics.UnitSubject},
		Tags: Tags{
			Meta:      []TagCount{},
			Community: []TagCount{},
		},
		Ratings: Ratings{
			Global: RatingDistribution{
				Buckets: []RatingBucket{{
					Score: 1,
					Examples: []RatingExample{{
						Kind: statistics.UnitSubject,
						Key:  "subject:1",
						ID:   1,
						Name: largeName,
					}},
				}},
				Timeline: []RatingTimelinePoint{},
			},
		},
		Works:      []WorkItem{},
		Characters: []CharacterItem{},
	}
	limit := coreCost(core) - 1
	store, err := NewStore(runtimecache.ResultConfig{
		Limits: runtimecache.Limits{
			MaxCost:     limit,
			MaxItems:    2,
			MaxItemCost: limit,
		},
		LoadTimeout: time.Second,
	}, executor)
	if err != nil {
		t.Fatal(err)
	}
	key, err := ResultKey("global", testDataVersion, testQueryDigest, 10, "")
	if err != nil {
		t.Fatal(err)
	}
	var builds atomic.Int64
	build := func(context.Context) (Core, error) {
		builds.Add(1)
		return core, nil
	}
	if _, err := store.GetOrBuild(context.Background(), key, build); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetOrBuild(context.Background(), key, build); err != nil {
		t.Fatal(err)
	}
	stats := store.Stats()
	if builds.Load() != 2 || stats.Items != 0 || stats.Oversize != 2 {
		t.Fatalf("oversize admission: builds=%d stats=%+v", builds.Load(), stats)
	}
}

func TestAllPositionScopeSeparatesIdenticalInputCacheKeys(t *testing.T) {
	input := Input{PersonID: 1, PositionKeys: []string{"staff:anime:2"}}
	legacy, err := resultKeyForInput("global", testDataVersion, testQueryDigest, input, "")
	if err != nil {
		t.Fatal(err)
	}
	input.PositionScope = "all"
	broad, err := resultKeyForInput("global", testDataVersion, testQueryDigest, input, "")
	if err != nil {
		t.Fatal(err)
	}
	if legacy == broad {
		t.Fatal("operation scopes share a result key")
	}
}
