package runtimecache

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strings"
	"time"
)

const inputDigestDomain = "bgmss.input.v1\x00"

var (
	versionedOperationPattern = regexp.MustCompile(`^[a-z][a-z0-9-]*/v[1-9][0-9]*$`)
	dataVersionPattern        = regexp.MustCompile(`^dv1-[0-9a-f]{64}$`)
	queryDigestPattern        = regexp.MustCompile(`^q1:[0-9a-f]{64}$`)
	inputDigestPattern        = regexp.MustCompile(`^i1:[0-9a-f]{64}$`)
	collectionDigestPattern   = regexp.MustCompile(`^c1:[0-9a-f]{64}$`)
)

// Operation identifies a versioned expensive-core computation.
type Operation string

const (
	OperationRankingsV1     Operation = "rankings/v1"
	OperationCandidatesV1   Operation = "candidates/v1"
	OperationPersonDetailV1 Operation = "person-detail/v1"
	OperationPartnersV1     Operation = "partners/v1"
	OperationCoStarV1       Operation = "co-star/v1"
)

type resultScope uint8

const (
	globalResult resultScope = iota + 1
	personalResult
)

// ResultKey contains only semantic expensive-core dimensions. View fields
// cannot be represented.
type ResultKey struct {
	scope            resultScope
	operation        Operation
	dataVersion      string
	queryDigest      string
	inputDigest      string
	collectionDigest string
}

// EmptyInputDigestV1 is the fixed rankings input digest.
var EmptyInputDigestV1 = DigestInput(nil)

// DigestInput creates a versioned digest from already canonical
// operation-input bytes. Nil represents the fixed empty input.
func DigestInput(canonical []byte) string {
	if canonical == nil {
		canonical = []byte("{}")
	}
	value := sha256.Sum256(append([]byte(inputDigestDomain), canonical...))
	return "i1:" + hex.EncodeToString(value[:])
}

// NewGlobalResultKey constructs a global core key.
func NewGlobalResultKey(
	operation Operation,
	dataVersion string,
	queryDigest string,
	inputDigest string,
) (ResultKey, error) {
	return newResultKey(
		globalResult,
		operation,
		dataVersion,
		queryDigest,
		inputDigest,
		"",
	)
}

// NewPersonalResultKey constructs a personal core key after collection
// acquisition has established the usable collection digest.
func NewPersonalResultKey(
	operation Operation,
	dataVersion string,
	queryDigest string,
	inputDigest string,
	collectionDigest string,
) (ResultKey, error) {
	return newResultKey(
		personalResult,
		operation,
		dataVersion,
		queryDigest,
		inputDigest,
		collectionDigest,
	)
}

func newResultKey(
	scope resultScope,
	operation Operation,
	dataVersion string,
	queryDigest string,
	inputDigest string,
	collectionDigest string,
) (ResultKey, error) {
	if !versionedOperationPattern.MatchString(string(operation)) ||
		!dataVersionPattern.MatchString(dataVersion) ||
		!queryDigestPattern.MatchString(queryDigest) ||
		!inputDigestPattern.MatchString(inputDigest) ||
		(scope == globalResult && collectionDigest != "") ||
		(scope == personalResult && !collectionDigestPattern.MatchString(collectionDigest)) {
		return ResultKey{}, outcome(CodeInvalidInput)
	}
	return ResultKey{
		scope:            scope,
		operation:        operation,
		dataVersion:      dataVersion,
		queryDigest:      queryDigest,
		inputDigest:      inputDigest,
		collectionDigest: collectionDigest,
	}, nil
}

// String returns the deterministic cache/singleflight identity.
func (key ResultKey) String() string {
	scope := "global"
	if key.scope == personalResult {
		scope = "personal"
	}
	parts := []string{
		"result/v1",
		scope,
		string(key.operation),
		key.dataVersion,
		key.queryDigest,
		key.inputDigest,
	}
	if key.scope == personalResult {
		parts = append(parts, key.collectionDigest)
	}
	return strings.Join(parts, "/")
}

// ResultConfig defines one typed result-core store.
type ResultConfig struct {
	Limits      Limits
	LoadTimeout time.Duration
}

// DefaultResultConfig returns the approved production baseline.
func DefaultResultConfig() ResultConfig {
	return ResultConfig{
		Limits: Limits{
			MaxCost:     190 * megabyte,
			MaxItems:    512,
			MaxItemCost: 32 * megabyte,
		},
		LoadTimeout: 2 * time.Minute,
	}
}

// CostFunc returns a complete retained-cost estimate for one typed core.
type CostFunc[V any] func(V) int64

// ResultStore owns one typed immutable pre-view core cache and an independent
// same-key singleflight group. Multiple stores share one Executor.
type ResultStore[V any] struct {
	cache    *WeightedLRU[ResultKey, V]
	loads    *DetachedGroup[ResultKey, V]
	executor *Executor
	clone    CloneFunc[V]
	cost     CostFunc[V]
}

// NewResultStore constructs an empty typed core store.
func NewResultStore[V any](
	config ResultConfig,
	executor *Executor,
	clone CloneFunc[V],
	cost CostFunc[V],
) (*ResultStore[V], error) {
	if !config.Limits.valid() ||
		config.LoadTimeout <= 0 ||
		executor == nil ||
		clone == nil ||
		cost == nil {
		return nil, outcome(CodeInvalidInput)
	}
	cache, err := NewWeightedLRU[ResultKey, V](config.Limits, clone)
	if err != nil {
		return nil, err
	}
	loads, err := NewDetachedGroup[ResultKey, V](
		config.LoadTimeout,
		ResultKey.String,
	)
	if err != nil {
		return nil, err
	}
	return &ResultStore[V]{
		cache:    cache,
		loads:    loads,
		executor: executor,
		clone:    clone,
		cost:     cost,
	}, nil
}

// Get returns an ownership-safe core.
func (store *ResultStore[V]) Get(key ResultKey) (V, bool) {
	var zero V
	if store == nil || key.scope == 0 {
		return zero, false
	}
	return store.cache.Get(key)
}

// GetOrCompute returns a cached core or performs one detached, admitted,
// same-key computation. Publication failure or oversize never replaces a
// successful business result.
func (store *ResultStore[V]) GetOrCompute(
	ctx context.Context,
	key ResultKey,
	compute func(context.Context) (V, error),
) (V, error) {
	var zero V
	if store == nil || ctx == nil || key.scope == 0 || compute == nil {
		return zero, outcome(CodeInvalidInput)
	}
	if value, found := store.cache.Get(key); found {
		return value, nil
	}

	value, err := store.loads.Do(ctx, key, func(workerContext context.Context) (V, error) {
		if cached, found := store.cache.Get(key); found {
			return cached, nil
		}
		var computed V
		runErr := store.executor.Do(workerContext, func(runContext context.Context) error {
			var err error
			computed, err = compute(runContext)
			return err
		})
		if runErr != nil {
			return zero, runErr
		}
		retainedCost := store.cost(computed)
		if retainedCost >= 0 {
			store.cache.Put(key, computed, retainedCost)
		}
		return computed, nil
	})
	if err != nil {
		return zero, err
	}
	return store.clone(value), nil
}

// Stats returns the underlying weighted-cache snapshot.
func (store *ResultStore[V]) Stats() LRUStats {
	if store == nil {
		return LRUStats{}
	}
	return store.cache.Stats()
}
