package runtimecache

import (
	"context"
	"errors"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type testClock struct {
	mu  sync.Mutex
	now time.Time
}

func (clock *testClock) Now() time.Time {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	return clock.now
}

func (clock *testClock) Advance(duration time.Duration) {
	clock.mu.Lock()
	clock.now = clock.now.Add(duration)
	clock.mu.Unlock()
}

func TestCollectionKeyIsPrivateAndCanonical(t *testing.T) {
	key, err := NewCollectionKey(
		"  CaseSensitiveUser  ",
		"anime",
		[]string{"dropped", "completed", "dropped", "in_progress"},
	)
	if err != nil {
		t.Fatalf("NewCollectionKey: %v", err)
	}
	if strings.Contains(key.String(), "CaseSensitiveUser") {
		t.Fatalf("raw UID leaked in key: %s", key.String())
	}
	if !strings.HasPrefix(key.UIDDigest(), "u1:") ||
		len(key.UIDDigest()) != len("u1:")+64 {
		t.Fatalf("UID digest = %q", key.UIDDigest())
	}
	if !slices.Equal(
		key.Statuses(),
		[]string{"completed", "in_progress", "dropped"},
	) {
		t.Fatalf("statuses = %+v", key.Statuses())
	}
	trimmed, err := NewCollectionKey(
		"CaseSensitiveUser",
		"anime",
		[]string{"completed", "in_progress", "dropped"},
	)
	if err != nil {
		t.Fatalf("trimmed key: %v", err)
	}
	lower, err := NewCollectionKey(
		"casesensitiveuser",
		"anime",
		[]string{"completed", "in_progress", "dropped"},
	)
	if err != nil {
		t.Fatalf("lower key: %v", err)
	}
	if key != trimmed {
		t.Fatal("trim did not preserve the same identity")
	}
	if key == lower {
		t.Fatal("UID identity was lowercased")
	}
}

func TestCollectionDigestIsStableAndCoversEveryField(t *testing.T) {
	key := mustCollectionKey(t, "anime", []string{"completed", "dropped"})
	first := testCollectionSnapshot()
	second := cloneCollectionSnapshot(first)
	second.Items[0], second.Items[1] = second.Items[1], second.Items[0]
	slices.Reverse(second.Items[0].Tags)
	slices.Reverse(second.Items[1].Tags)

	_, firstDigest, _, err := normalizeCollectionSnapshot(key, first)
	if err != nil {
		t.Fatalf("first digest: %v", err)
	}
	_, secondDigest, _, err := normalizeCollectionSnapshot(key, second)
	if err != nil {
		t.Fatalf("second digest: %v", err)
	}
	if firstDigest != secondDigest {
		t.Fatalf("reordering changed digest: %s != %s", firstDigest, secondDigest)
	}

	mutations := map[string]func(*CollectionSnapshot){
		"subject ID": func(value *CollectionSnapshot) {
			value.Items[0].SubjectID++
		},
		"status": func(value *CollectionSnapshot) {
			value.Items[0].Status = "completed"
		},
		"rate": func(value *CollectionSnapshot) {
			value.Items[0].Rate++
		},
		"comment": func(value *CollectionSnapshot) {
			value.Items[0].Comment += " changed"
		},
		"tags": func(value *CollectionSnapshot) {
			value.Items[0].Tags = append(value.Items[0].Tags, "new")
		},
		"volume progress": func(value *CollectionSnapshot) {
			value.Items[0].VolumeProgress++
		},
		"episode progress": func(value *CollectionSnapshot) {
			value.Items[0].EpisodeProgress++
		},
		"private": func(value *CollectionSnapshot) {
			value.Items[0].Private = !value.Items[0].Private
		},
		"updatedAt": func(value *CollectionSnapshot) {
			value.Items[0].UpdatedAt = value.Items[0].UpdatedAt.Add(time.Second)
		},
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			changed := cloneCollectionSnapshot(first)
			mutate(&changed)
			_, digest, _, digestErr := normalizeCollectionSnapshot(key, changed)
			if digestErr != nil {
				t.Fatalf("digest mutation: %v", digestErr)
			}
			if digest == firstDigest {
				t.Fatalf("%s did not change digest", name)
			}
		})
	}

	bookKey := mustCollectionKey(t, "book", []string{"completed", "dropped"})
	book := cloneCollectionSnapshot(first)
	for index := range book.Items {
		book.Items[index].SubjectType = "book"
	}
	_, bookDigest, _, err := normalizeCollectionSnapshot(bookKey, book)
	if err != nil {
		t.Fatalf("book digest: %v", err)
	}
	if bookDigest == firstDigest {
		t.Fatal("subject type did not change digest")
	}
}

func TestCollectionFreshRefreshAndImmutablePublication(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC)}
	cache := newTestCollectionCache(t, clock)
	key := mustCollectionKey(t, "anime", []string{"completed", "dropped"})
	snapshot := testCollectionSnapshot()
	var calls atomic.Int64
	fetch := func(context.Context) (CollectionSnapshot, error) {
		calls.Add(1)
		return cloneCollectionSnapshot(snapshot), nil
	}

	first, err := cache.Get(context.Background(), key, false, fetch)
	if err != nil {
		t.Fatalf("first Get: %v", err)
	}
	first.Snapshot.Items[0].Tags[0] = "mutated"
	clock.Advance(10 * time.Minute)
	second, err := cache.Get(context.Background(), key, false, fetch)
	if err != nil {
		t.Fatalf("fresh Get: %v", err)
	}
	if calls.Load() != 1 {
		t.Fatalf("fresh fetch calls = %d", calls.Load())
	}
	if slices.Contains(second.Snapshot.Items[0].Tags, "mutated") {
		t.Fatal("caller mutation changed cached snapshot")
	}

	oldDigest := second.Digest
	oldFetchedAt := second.FetchedAt
	clock.Advance(time.Minute)
	refreshed, err := cache.Get(context.Background(), key, true, fetch)
	if err != nil {
		t.Fatalf("refresh Get: %v", err)
	}
	if calls.Load() != 2 {
		t.Fatalf("refresh fetch calls = %d", calls.Load())
	}
	if refreshed.Digest != oldDigest {
		t.Fatalf("unchanged refresh digest = %s, want %s", refreshed.Digest, oldDigest)
	}
	if !refreshed.FetchedAt.After(oldFetchedAt) {
		t.Fatalf("refresh metadata did not advance: %v <= %v", refreshed.FetchedAt, oldFetchedAt)
	}
}

func TestCollectionTemporaryFailureUsesEligibleStale(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC)}
	cache := newTestCollectionCache(t, clock)
	key := mustCollectionKey(t, "anime", []string{"completed", "dropped"})
	if _, err := cache.Get(context.Background(), key, false, func(context.Context) (CollectionSnapshot, error) {
		return testCollectionSnapshot(), nil
	}); err != nil {
		t.Fatalf("seed Get: %v", err)
	}
	clock.Advance(61 * time.Minute)
	temporary := mustCollectionFailure(t, FailureRateLimited)
	stale, err := cache.Get(context.Background(), key, false, func(context.Context) (CollectionSnapshot, error) {
		return CollectionSnapshot{}, temporary
	})
	if err != nil {
		t.Fatalf("stale Get: %v", err)
	}
	if !stale.Stale ||
		!slices.Equal(stale.WarningCodes, []string{CollectionStaleWarning}) {
		t.Fatalf("stale metadata = %+v", stale)
	}

	clock.Advance(29 * time.Minute)
	_, err = cache.Get(context.Background(), key, false, func(context.Context) (CollectionSnapshot, error) {
		return CollectionSnapshot{}, temporary
	})
	if !errors.Is(err, temporary) {
		t.Fatalf("expired stale error = %v", err)
	}
}

func TestCollectionPublicEmptyIsFreshPositive(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC)}
	cache := newTestCollectionCache(t, clock)
	key := mustCollectionKey(t, "anime", []string{"completed"})
	var calls atomic.Int64
	fetch := func(context.Context) (CollectionSnapshot, error) {
		calls.Add(1)
		return CollectionSnapshot{Items: []CollectionItem{}}, nil
	}
	for index := 0; index < 2; index++ {
		access, err := cache.Get(context.Background(), key, false, fetch)
		if err != nil || len(access.Snapshot.Items) != 0 || access.Digest == "" {
			t.Fatalf("empty access = %+v, %v", access, err)
		}
	}
	if calls.Load() != 1 || cache.PositiveStats().Items != 1 {
		t.Fatalf("empty positive not cached: calls=%d stats=%+v", calls.Load(), cache.PositiveStats())
	}
}

func TestCollectionUnknownFailureDoesNotLeakFetcherText(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC)}
	cache := newTestCollectionCache(t, clock)
	key := mustCollectionKey(t, "anime", []string{"completed"})
	_, err := cache.Get(context.Background(), key, false, func(context.Context) (CollectionSnapshot, error) {
		return CollectionSnapshot{}, errors.New("example-user private upstream detail")
	})
	if err == nil {
		t.Fatal("unknown failure succeeded")
	}
	if strings.Contains(err.Error(), "example-user") ||
		err.Error() != "collection_other" {
		t.Fatalf("failure text leaked: %q", err.Error())
	}
}

func TestCollectionDefinitiveFailureCannotResurrectOldPositive(t *testing.T) {
	for _, kind := range []CollectionFailureKind{FailureForbidden, FailureNotFound} {
		t.Run(string(kind), func(t *testing.T) {
			clock := &testClock{now: time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC)}
			config := DefaultCollectionConfig()
			config.Now = clock.Now
			config.ForbiddenTTL = 10 * time.Second
			config.NotFoundTTL = 10 * time.Second
			cache, err := NewCollectionCache(config)
			if err != nil {
				t.Fatalf("NewCollectionCache: %v", err)
			}
			key := mustCollectionKey(t, "anime", []string{"completed", "dropped"})
			if _, err := cache.Get(context.Background(), key, false, func(context.Context) (CollectionSnapshot, error) {
				return testCollectionSnapshot(), nil
			}); err != nil {
				t.Fatalf("seed Get: %v", err)
			}
			clock.Advance(61 * time.Minute)
			definitive := mustCollectionFailure(t, kind)
			if _, err := cache.Get(context.Background(), key, false, func(context.Context) (CollectionSnapshot, error) {
				return CollectionSnapshot{}, definitive
			}); !errors.Is(err, definitive) {
				t.Fatalf("definitive error = %v", err)
			}
			if cache.PositiveStats().Items != 0 {
				t.Fatal("definitive failure retained positive snapshot")
			}

			var cachedFetches atomic.Int64
			if _, err := cache.Get(context.Background(), key, false, func(context.Context) (CollectionSnapshot, error) {
				cachedFetches.Add(1)
				return testCollectionSnapshot(), nil
			}); err == nil {
				t.Fatal("negative cache returned success")
			}
			if cachedFetches.Load() != 0 {
				t.Fatal("negative cache called fetcher")
			}

			clock.Advance(10 * time.Second)
			temporary := mustCollectionFailure(t, FailureNetwork)
			access, err := cache.Get(context.Background(), key, false, func(context.Context) (CollectionSnapshot, error) {
				return CollectionSnapshot{}, temporary
			})
			if !errors.Is(err, temporary) {
				t.Fatalf("post-negative temporary error = %v", err)
			}
			if access.Stale {
				t.Fatal("pre-definitive snapshot was resurrected")
			}
		})
	}
}

func TestCollectionNegativeTTLAndNonNegativeFailures(t *testing.T) {
	for _, testCase := range []struct {
		name string
		kind CollectionFailureKind
		ttl  time.Duration
	}{
		{name: "not found", kind: FailureNotFound, ttl: 2 * time.Minute},
		{name: "forbidden", kind: FailureForbidden, ttl: 30 * time.Second},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			clock := &testClock{now: time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC)}
			cache := newTestCollectionCache(t, clock)
			key := mustCollectionKey(t, "anime", []string{"completed"})
			failure := mustCollectionFailure(t, testCase.kind)
			var calls atomic.Int64
			fetch := func(context.Context) (CollectionSnapshot, error) {
				calls.Add(1)
				return CollectionSnapshot{}, failure
			}
			for index := 0; index < 2; index++ {
				if _, err := cache.Get(context.Background(), key, false, fetch); err == nil {
					t.Fatal("negative request succeeded")
				}
			}
			if calls.Load() != 1 {
				t.Fatalf("negative fetch calls = %d", calls.Load())
			}
			clock.Advance(testCase.ttl)
			if _, err := cache.Get(context.Background(), key, false, fetch); err == nil {
				t.Fatal("expired negative request succeeded")
			}
			if calls.Load() != 2 {
				t.Fatalf("post-expiry calls = %d", calls.Load())
			}
		})
	}

	clock := &testClock{now: time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC)}
	cache := newTestCollectionCache(t, clock)
	key := mustCollectionKey(t, "anime", []string{"completed"})
	decodeFailure := mustCollectionFailure(t, FailureDecode)
	var decodeCalls atomic.Int64
	for index := 0; index < 2; index++ {
		if _, err := cache.Get(context.Background(), key, false, func(context.Context) (CollectionSnapshot, error) {
			decodeCalls.Add(1)
			return CollectionSnapshot{}, decodeFailure
		}); !errors.Is(err, decodeFailure) {
			t.Fatalf("decode error = %v", err)
		}
	}
	if decodeCalls.Load() != 2 || cache.NegativeStats().Items != 0 {
		t.Fatalf("decode was negative cached: calls=%d stats=%+v", decodeCalls.Load(), cache.NegativeStats())
	}
}

func TestCollectionPublicEmptyAndOversizeAreSuccessful(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC)}
	config := DefaultCollectionConfig()
	config.Now = clock.Now
	config.PositiveLimits = Limits{MaxCost: 128, MaxItems: 4, MaxItemCost: 128}
	cache, err := NewCollectionCache(config)
	if err != nil {
		t.Fatalf("NewCollectionCache: %v", err)
	}
	key := mustCollectionKey(t, "anime", []string{"completed"})
	var calls atomic.Int64
	for index := 0; index < 2; index++ {
		access, err := cache.Get(context.Background(), key, false, func(context.Context) (CollectionSnapshot, error) {
			calls.Add(1)
			return CollectionSnapshot{Items: []CollectionItem{}}, nil
		})
		if err != nil || len(access.Snapshot.Items) != 0 || access.Digest == "" {
			t.Fatalf("empty access = %+v, %v", access, err)
		}
	}
	if calls.Load() != 2 {
		t.Fatalf("oversize empty fetch calls = %d", calls.Load())
	}
	if stats := cache.PositiveStats(); stats.Items != 0 || stats.Oversize != 2 {
		t.Fatalf("oversize stats = %+v", stats)
	}
}

func TestCollectionSameKeyLoadIsDetachedAndPublishedOnce(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC)}
	cache := newTestCollectionCache(t, clock)
	key := mustCollectionKey(t, "anime", []string{"completed", "dropped"})
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int64
	fetch := func(ctx context.Context) (CollectionSnapshot, error) {
		if calls.Add(1) == 1 {
			close(started)
		}
		select {
		case <-release:
			return testCollectionSnapshot(), nil
		case <-ctx.Done():
			return CollectionSnapshot{}, ctx.Err()
		}
	}

	cancelContext, cancel := context.WithCancel(context.Background())
	first := make(chan error, 1)
	second := make(chan error, 1)
	go func() {
		_, err := cache.Get(cancelContext, key, false, fetch)
		first <- err
	}()
	<-started
	go func() {
		_, err := cache.Get(context.Background(), key, false, fetch)
		second <- err
	}()
	time.Sleep(10 * time.Millisecond)
	cancel()
	if err := <-first; !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled waiter = %v", err)
	}
	close(release)
	if err := <-second; err != nil {
		t.Fatalf("remaining waiter = %v", err)
	}
	if _, err := cache.Get(context.Background(), key, false, fetch); err != nil {
		t.Fatalf("cached read = %v", err)
	}
	if calls.Load() != 1 {
		t.Fatalf("fetch calls = %d", calls.Load())
	}
}

func newTestCollectionCache(t *testing.T, clock *testClock) *CollectionCache {
	t.Helper()
	config := DefaultCollectionConfig()
	config.Now = clock.Now
	cache, err := NewCollectionCache(config)
	if err != nil {
		t.Fatalf("NewCollectionCache: %v", err)
	}
	return cache
}

func mustCollectionKey(t *testing.T, subjectType string, statuses []string) CollectionKey {
	t.Helper()
	key, err := NewCollectionKey("example-user", subjectType, statuses)
	if err != nil {
		t.Fatalf("NewCollectionKey: %v", err)
	}
	return key
}

func mustCollectionFailure(t *testing.T, kind CollectionFailureKind) *CollectionFailure {
	t.Helper()
	failure, err := NewCollectionFailure(kind, nil)
	if err != nil {
		t.Fatalf("NewCollectionFailure: %v", err)
	}
	return failure
}

func testCollectionSnapshot() CollectionSnapshot {
	return CollectionSnapshot{Items: []CollectionItem{
		{
			SubjectID:       20,
			SubjectType:     "anime",
			Status:          "dropped",
			Rate:            3,
			Comment:         "later",
			Tags:            []string{"zeta", "alpha"},
			VolumeProgress:  4,
			EpisodeProgress: 5,
			Private:         true,
			UpdatedAt:       time.Date(2026, 7, 24, 12, 30, 0, 0, time.FixedZone("east", 8*60*60)),
		},
		{
			SubjectID:       10,
			SubjectType:     "anime",
			Status:          "completed",
			Rate:            9,
			Comment:         "first",
			Tags:            []string{"staff", "favorite"},
			VolumeProgress:  6,
			EpisodeProgress: 12,
			Private:         false,
			UpdatedAt:       time.Date(2026, 7, 23, 1, 2, 3, 4, time.UTC),
		},
	}}
}
