package runtimecache

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	collectionDigestDomain = "bgmss.collection.v1\x00"
	uidDigestDomain        = "bgmss.collection.uid.v1\x00"

	CollectionStaleWarning = "COLLECTION_STALE"

	megabyte = int64(1024 * 1024)
)

var collectionStatusOrder = []string{
	"completed",
	"in_progress",
	"on_hold",
	"dropped",
}

// CollectionKey is a comparable privacy-safe collection cache key. It never
// retains the raw UID.
type CollectionKey struct {
	uidDigest   [sha256.Size]byte
	subjectType string
	statuses    string
}

// NewCollectionKey trims but otherwise preserves UID identity before hashing,
// and canonicalizes the collection-status set.
func NewCollectionKey(
	uid string,
	subjectType string,
	statuses []string,
) (CollectionKey, error) {
	uid = strings.TrimSpace(uid)
	if uid == "" || len(uid) > 256 || !utf8.ValidString(uid) {
		return CollectionKey{}, outcome(CodeInvalidInput)
	}
	for _, value := range uid {
		if unicode.IsControl(value) {
			return CollectionKey{}, outcome(CodeInvalidInput)
		}
	}
	if !validSubjectType(subjectType) {
		return CollectionKey{}, outcome(CodeInvalidInput)
	}
	canonicalStatuses, err := canonicalCollectionStatuses(statuses)
	if err != nil {
		return CollectionKey{}, err
	}

	return CollectionKey{
		uidDigest:   sha256.Sum256(append([]byte(uidDigestDomain), []byte(uid)...)),
		subjectType: subjectType,
		statuses:    strings.Join(canonicalStatuses, ","),
	}, nil
}

// UIDDigest returns the one-way namespaced digest used by the cache key.
func (key CollectionKey) UIDDigest() string {
	return "u1:" + hex.EncodeToString(key.uidDigest[:])
}

// SubjectType returns the canonical subject type.
func (key CollectionKey) SubjectType() string { return key.subjectType }

// Statuses returns an ownership-safe canonical status list.
func (key CollectionKey) Statuses() []string {
	if key.statuses == "" {
		return nil
	}
	return strings.Split(key.statuses, ",")
}

// String returns a safe deterministic singleflight/cache identity.
func (key CollectionKey) String() string {
	return "collection/v1/" + key.UIDDigest() + "/" +
		key.subjectType + "/" + key.statuses
}

// CollectionItem is the complete digest evidence retained from one admitted
// anonymous collection record.
type CollectionItem struct {
	SubjectID       int64     `json:"subjectId"`
	SubjectType     string    `json:"subjectType"`
	Status          string    `json:"status"`
	Rate            int       `json:"rate"`
	Comment         string    `json:"comment"`
	Tags            []string  `json:"tags"`
	VolumeProgress  int       `json:"volumeProgress"`
	EpisodeProgress int       `json:"episodeProgress"`
	Private         bool      `json:"private"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

// CollectionSnapshot is an immutable positive collection value. Empty public
// collections are represented by an empty Items slice, not a negative result.
type CollectionSnapshot struct {
	Items []CollectionItem `json:"items"`
}

type collectionValue struct {
	Snapshot   CollectionSnapshot
	Digest     string
	FetchedAt  time.Time
	FreshUntil time.Time
	StaleUntil time.Time
}

// CollectionAccess is one ownership-safe positive outcome.
type CollectionAccess struct {
	Snapshot     CollectionSnapshot
	Digest       string
	FetchedAt    time.Time
	FreshUntil   time.Time
	StaleUntil   time.Time
	Stale        bool
	WarningCodes []string
}

// CollectionFailureKind is a stable privacy-safe upstream classification.
type CollectionFailureKind string

const (
	FailureTimeout     CollectionFailureKind = "timeout"
	FailureNetwork     CollectionFailureKind = "network"
	FailureRateLimited CollectionFailureKind = "rate_limited"
	FailureUpstream5xx CollectionFailureKind = "upstream_5xx"
	FailureNotFound    CollectionFailureKind = "not_found"
	FailureForbidden   CollectionFailureKind = "forbidden"
	FailureDecode      CollectionFailureKind = "decode"
	FailureOther       CollectionFailureKind = "other"
)

// CollectionFailure is an upstream category without keys, UIDs, bodies, or
// other private values.
type CollectionFailure struct {
	kind  CollectionFailureKind
	cause error
}

// NewCollectionFailure constructs a classified collection failure.
func NewCollectionFailure(
	kind CollectionFailureKind,
	cause error,
) (*CollectionFailure, error) {
	if !validCollectionFailure(kind) {
		return nil, outcome(CodeInvalidInput)
	}
	return &CollectionFailure{kind: kind, cause: cause}, nil
}

func (failure *CollectionFailure) Error() string {
	if failure == nil {
		return string(FailureOther)
	}
	return "collection_" + string(failure.kind)
}

// Kind returns the stable failure category.
func (failure *CollectionFailure) Kind() CollectionFailureKind {
	if failure == nil {
		return FailureOther
	}
	return failure.kind
}

// Unwrap retains a safe cause for errors.Is.
func (failure *CollectionFailure) Unwrap() error {
	if failure == nil {
		return nil
	}
	return failure.cause
}

type negativeCollectionValue struct {
	Kind      CollectionFailureKind
	ExpiresAt time.Time
}

// CollectionFetcher supplies one complete admitted anonymous snapshot.
type CollectionFetcher func(context.Context) (CollectionSnapshot, error)

// CollectionConfig defines cache budgets and exact freshness windows.
type CollectionConfig struct {
	PositiveLimits Limits
	NegativeLimits Limits
	FreshTTL       time.Duration
	StaleTTL       time.Duration
	NotFoundTTL    time.Duration
	ForbiddenTTL   time.Duration
	LoadTimeout    time.Duration
	Now            func() time.Time
}

// DefaultCollectionConfig returns the approved production baseline.
func DefaultCollectionConfig() CollectionConfig {
	return CollectionConfig{
		PositiveLimits: Limits{
			MaxCost:     64 * megabyte,
			MaxItems:    4096,
			MaxItemCost: 8 * megabyte,
		},
		NegativeLimits: Limits{
			MaxCost:     2 * megabyte,
			MaxItems:    4096,
			MaxItemCost: 4096,
		},
		FreshTTL:     time.Hour,
		StaleTTL:     30 * time.Minute,
		NotFoundTTL:  2 * time.Minute,
		ForbiddenTTL: 30 * time.Second,
		LoadTimeout:  30 * time.Second,
		Now:          time.Now,
	}
}

// CollectionCache owns positive/negative cache policy and a collection-only
// detached singleflight group.
type CollectionCache struct {
	positive     *WeightedLRU[CollectionKey, collectionValue]
	negative     *WeightedLRU[CollectionKey, negativeCollectionValue]
	loads        *DetachedGroup[CollectionKey, CollectionAccess]
	freshTTL     time.Duration
	staleTTL     time.Duration
	notFoundTTL  time.Duration
	forbiddenTTL time.Duration
	now          func() time.Time
}

// NewCollectionCache constructs an empty policy owner.
func NewCollectionCache(config CollectionConfig) (*CollectionCache, error) {
	if !config.PositiveLimits.valid() ||
		!config.NegativeLimits.valid() ||
		config.FreshTTL <= 0 ||
		config.StaleTTL <= 0 ||
		config.NotFoundTTL <= 0 ||
		config.ForbiddenTTL <= 0 ||
		config.LoadTimeout <= 0 ||
		config.Now == nil {
		return nil, outcome(CodeInvalidInput)
	}
	positive, err := NewWeightedLRU[CollectionKey, collectionValue](
		config.PositiveLimits,
		cloneCollectionValue,
	)
	if err != nil {
		return nil, err
	}
	negative, err := NewWeightedLRU[CollectionKey, negativeCollectionValue](
		config.NegativeLimits,
		func(value negativeCollectionValue) negativeCollectionValue {
			return value
		},
	)
	if err != nil {
		return nil, err
	}
	loads, err := NewDetachedGroup[CollectionKey, CollectionAccess](
		config.LoadTimeout,
		CollectionKey.String,
	)
	if err != nil {
		return nil, err
	}
	return &CollectionCache{
		positive:     positive,
		negative:     negative,
		loads:        loads,
		freshTTL:     config.FreshTTL,
		staleTTL:     config.StaleTTL,
		notFoundTTL:  config.NotFoundTTL,
		forbiddenTTL: config.ForbiddenTTL,
		now:          config.Now,
	}, nil
}

// Get returns a fresh value, synchronously refreshes an expired value, or
// performs an explicit refresh. Refresh bypasses only a fresh positive hit.
func (cache *CollectionCache) Get(
	ctx context.Context,
	key CollectionKey,
	refresh bool,
	fetch CollectionFetcher,
) (CollectionAccess, error) {
	if cache == nil || ctx == nil || fetch == nil || key.subjectType == "" {
		return CollectionAccess{}, outcome(CodeInvalidInput)
	}
	if err := contextOutcome(ctx); err != nil {
		return CollectionAccess{}, err
	}

	now := cache.now().UTC()
	if failure, found := cache.negative.Get(key); found {
		if now.Before(failure.ExpiresAt) {
			return CollectionAccess{}, &CollectionFailure{kind: failure.Kind}
		}
		cache.negative.Delete(key)
	}

	var staleCandidate *collectionValue
	if value, found := cache.positive.Get(key); found {
		staleCandidate = &value
		if !refresh && now.Before(value.FreshUntil) {
			return accessFromValue(value, false), nil
		}
	}

	result, err := cache.loads.Do(ctx, key, func(workerContext context.Context) (CollectionAccess, error) {
		snapshot, fetchErr := fetch(workerContext)
		if fetchErr != nil {
			return cache.collectionFailure(key, staleCandidate, fetchErr)
		}
		return cache.publishCollection(key, snapshot)
	})
	if err != nil {
		return CollectionAccess{}, err
	}
	return cloneCollectionAccess(result), nil
}

// PositiveStats returns the positive-cache snapshot.
func (cache *CollectionCache) PositiveStats() LRUStats {
	if cache == nil {
		return LRUStats{}
	}
	return cache.positive.Stats()
}

// NegativeStats returns the negative-cache snapshot.
func (cache *CollectionCache) NegativeStats() LRUStats {
	if cache == nil {
		return LRUStats{}
	}
	return cache.negative.Stats()
}

func (cache *CollectionCache) publishCollection(
	key CollectionKey,
	snapshot CollectionSnapshot,
) (CollectionAccess, error) {
	normalized, digest, retainedCost, err := normalizeCollectionSnapshot(key, snapshot)
	if err != nil {
		return CollectionAccess{}, err
	}
	fetchedAt := cache.now().UTC()
	value := collectionValue{
		Snapshot:   normalized,
		Digest:     digest,
		FetchedAt:  fetchedAt,
		FreshUntil: fetchedAt.Add(cache.freshTTL),
		StaleUntil: fetchedAt.Add(cache.freshTTL + cache.staleTTL),
	}
	cache.positive.Put(key, value, retainedCost)
	cache.negative.Delete(key)
	return accessFromValue(value, false), nil
}

func (cache *CollectionCache) collectionFailure(
	key CollectionKey,
	stale *collectionValue,
	err error,
) (CollectionAccess, error) {
	now := cache.now().UTC()
	kind, safeError := classifyCollectionFailure(err)
	switch kind {
	case FailureNotFound:
		cache.positive.Delete(key)
		cache.negative.Put(key, negativeCollectionValue{
			Kind:      kind,
			ExpiresAt: now.Add(cache.notFoundTTL),
		}, negativeCollectionCost(key))
	case FailureForbidden:
		cache.positive.Delete(key)
		cache.negative.Put(key, negativeCollectionValue{
			Kind:      kind,
			ExpiresAt: now.Add(cache.forbiddenTTL),
		}, negativeCollectionCost(key))
	case FailureTimeout, FailureNetwork, FailureRateLimited, FailureUpstream5xx:
		if stale != nil && now.Before(stale.StaleUntil) {
			return accessFromValue(*stale, true), nil
		}
	}
	return CollectionAccess{}, safeError
}

func accessFromValue(value collectionValue, stale bool) CollectionAccess {
	warnings := []string{}
	if stale {
		warnings = []string{CollectionStaleWarning}
	}
	return CollectionAccess{
		Snapshot:     cloneCollectionSnapshot(value.Snapshot),
		Digest:       value.Digest,
		FetchedAt:    value.FetchedAt,
		FreshUntil:   value.FreshUntil,
		StaleUntil:   value.StaleUntil,
		Stale:        stale,
		WarningCodes: warnings,
	}
}

func normalizeCollectionSnapshot(
	key CollectionKey,
	snapshot CollectionSnapshot,
) (CollectionSnapshot, string, int64, error) {
	result := cloneCollectionSnapshot(snapshot)
	statuses := make(map[string]struct{}, len(key.Statuses()))
	for _, status := range key.Statuses() {
		statuses[status] = struct{}{}
	}
	seenSubjects := make(map[int64]struct{}, len(result.Items))
	for index := range result.Items {
		item := &result.Items[index]
		if item.SubjectID <= 0 ||
			item.SubjectType != key.subjectType ||
			!validCollectionStatus(item.Status) ||
			item.Rate < 0 || item.Rate > 10 ||
			item.VolumeProgress < 0 ||
			item.EpisodeProgress < 0 ||
			item.UpdatedAt.IsZero() ||
			!utf8.ValidString(item.Comment) {
			return CollectionSnapshot{}, "", 0, outcome(CodeInvalidInput)
		}
		if _, selected := statuses[item.Status]; !selected {
			return CollectionSnapshot{}, "", 0, outcome(CodeInvalidInput)
		}
		if _, duplicate := seenSubjects[item.SubjectID]; duplicate {
			return CollectionSnapshot{}, "", 0, outcome(CodeInvalidInput)
		}
		seenSubjects[item.SubjectID] = struct{}{}
		for _, tag := range item.Tags {
			if !utf8.ValidString(tag) {
				return CollectionSnapshot{}, "", 0, outcome(CodeInvalidInput)
			}
		}
		sort.Strings(item.Tags)
		item.UpdatedAt = item.UpdatedAt.UTC()
	}
	sort.Slice(result.Items, func(left, right int) bool {
		if result.Items[left].SubjectType != result.Items[right].SubjectType {
			return result.Items[left].SubjectType < result.Items[right].SubjectType
		}
		if result.Items[left].SubjectID != result.Items[right].SubjectID {
			return result.Items[left].SubjectID < result.Items[right].SubjectID
		}
		return result.Items[left].Status < result.Items[right].Status
	})

	type digestItem struct {
		SubjectID       int64    `json:"subjectId"`
		SubjectType     string   `json:"subjectType"`
		Status          string   `json:"status"`
		Rate            int      `json:"rate"`
		Comment         string   `json:"comment"`
		Tags            []string `json:"tags"`
		VolumeProgress  int      `json:"volumeProgress"`
		EpisodeProgress int      `json:"episodeProgress"`
		Private         bool     `json:"private"`
		UpdatedAt       string   `json:"updatedAt"`
	}
	payload := struct {
		Items []digestItem `json:"items"`
	}{Items: make([]digestItem, len(result.Items))}
	for index, item := range result.Items {
		payload.Items[index] = digestItem{
			SubjectID:       item.SubjectID,
			SubjectType:     item.SubjectType,
			Status:          item.Status,
			Rate:            item.Rate,
			Comment:         item.Comment,
			Tags:            append([]string(nil), item.Tags...),
			VolumeProgress:  item.VolumeProgress,
			EpisodeProgress: item.EpisodeProgress,
			Private:         item.Private,
			UpdatedAt:       item.UpdatedAt.Format(time.RFC3339Nano),
		}
	}
	canonical, err := json.Marshal(payload)
	if err != nil {
		return CollectionSnapshot{}, "", 0, outcome(CodeInvalidInput)
	}
	digestBytes := sha256.Sum256(append([]byte(collectionDigestDomain), canonical...))
	digest := "c1:" + hex.EncodeToString(digestBytes[:])
	retainedCost := int64(len(key.String()) + len(canonical) + len(digest) + 96)
	return result, digest, retainedCost, nil
}

func cloneCollectionSnapshot(snapshot CollectionSnapshot) CollectionSnapshot {
	result := CollectionSnapshot{
		Items: append([]CollectionItem(nil), snapshot.Items...),
	}
	for index := range result.Items {
		result.Items[index].Tags = append([]string(nil), result.Items[index].Tags...)
	}
	return result
}

func cloneCollectionValue(value collectionValue) collectionValue {
	value.Snapshot = cloneCollectionSnapshot(value.Snapshot)
	return value
}

func cloneCollectionAccess(value CollectionAccess) CollectionAccess {
	value.Snapshot = cloneCollectionSnapshot(value.Snapshot)
	value.WarningCodes = append([]string(nil), value.WarningCodes...)
	return value
}

func canonicalCollectionStatuses(statuses []string) ([]string, error) {
	if len(statuses) == 0 {
		return nil, outcome(CodeInvalidInput)
	}
	selected := make(map[string]struct{}, len(statuses))
	for _, status := range statuses {
		if !validCollectionStatus(status) {
			return nil, outcome(CodeInvalidInput)
		}
		selected[status] = struct{}{}
	}
	result := make([]string, 0, len(selected))
	for _, status := range collectionStatusOrder {
		if _, found := selected[status]; found {
			result = append(result, status)
		}
	}
	return result, nil
}

func validCollectionStatus(status string) bool {
	for _, candidate := range collectionStatusOrder {
		if status == candidate {
			return true
		}
	}
	return false
}

func validSubjectType(subjectType string) bool {
	switch subjectType {
	case "book", "anime", "music", "game", "real":
		return true
	default:
		return false
	}
}

func validCollectionFailure(kind CollectionFailureKind) bool {
	switch kind {
	case FailureTimeout,
		FailureNetwork,
		FailureRateLimited,
		FailureUpstream5xx,
		FailureNotFound,
		FailureForbidden,
		FailureDecode,
		FailureOther:
		return true
	default:
		return false
	}
}

func classifyCollectionFailure(err error) (CollectionFailureKind, error) {
	var failure *CollectionFailure
	if errors.As(err, &failure) {
		return failure.Kind(), failure
	}
	if code, ok := ErrorCode(err); ok && code == CodeTimeout {
		return FailureTimeout, err
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return FailureTimeout, outcomeCause(CodeTimeout, context.DeadlineExceeded)
	}
	return FailureOther, &CollectionFailure{kind: FailureOther, cause: err}
}

func negativeCollectionCost(key CollectionKey) int64 {
	return int64(len(key.String()) + 64)
}
