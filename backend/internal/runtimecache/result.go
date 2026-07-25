package runtimecache

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"reflect"
	"regexp"
	"strings"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/querytiming"
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

// ResultBinding is an opaque canonical operation policy supplied before a
// QueryRuntime is exposed. It fixes the core type, clone, and retained-cost
// behavior used by every facade for that operation.
type ResultBinding struct {
	operation Operation
	valueType reflect.Type
	factory   func(*resultPool, time.Duration, *Executor) (any, error)
	store     any
}

// NewResultBinding constructs one canonical operation policy.
func NewResultBinding[V any](
	operation Operation,
	clone CloneFunc[V],
	cost CostFunc[V],
) (ResultBinding, error) {
	valueType := reflect.TypeFor[V]()
	if !versionedOperationPattern.MatchString(string(operation)) ||
		valueType == nil ||
		clone == nil ||
		cost == nil {
		return ResultBinding{}, outcome(CodeInvalidInput)
	}
	return ResultBinding{
		operation: operation,
		valueType: valueType,
		factory: func(
			pool *resultPool,
			loadTimeout time.Duration,
			executor *Executor,
		) (any, error) {
			return newResultStore(
				pool,
				loadTimeout,
				executor,
				operation,
				clone,
				cost,
			)
		},
	}, nil
}

type pooledResult struct {
	value     any
	valueType reflect.Type
	clone     func(any) (any, bool)
}

type resultPool struct {
	values *WeightedLRU[ResultKey, pooledResult]
}

func newResultPool(limits Limits) (*resultPool, error) {
	values, err := NewWeightedLRU[ResultKey, pooledResult](
		limits,
		func(entry pooledResult) pooledResult {
			if entry.clone == nil {
				return pooledResult{}
			}
			cloned, ok := entry.clone(entry.value)
			if !ok {
				return pooledResult{}
			}
			entry.value = cloned
			return entry
		},
	)
	if err != nil {
		return nil, err
	}
	return &resultPool{values: values}, nil
}

func resultPoolGet[V any](
	pool *resultPool,
	key ResultKey,
	valueType reflect.Type,
) (V, bool) {
	var zero V
	if pool == nil || valueType == nil {
		return zero, false
	}
	entry, found := pool.values.Get(key)
	if !found || entry.valueType != valueType {
		return zero, false
	}
	value, ok := entry.value.(V)
	if !ok {
		return zero, false
	}
	return value, true
}

func resultPoolPut[V any](
	pool *resultPool,
	key ResultKey,
	value V,
	valueType reflect.Type,
	clone CloneFunc[V],
	cost int64,
) bool {
	if pool == nil || valueType == nil || clone == nil {
		return false
	}
	return pool.values.Put(key, pooledResult{
		value:     value,
		valueType: valueType,
		clone: func(candidate any) (any, bool) {
			typed, ok := candidate.(V)
			if !ok {
				return nil, false
			}
			return clone(typed), true
		},
	}, cost)
}

func (pool *resultPool) stats() LRUStats {
	if pool == nil {
		return LRUStats{}
	}
	return pool.values.Stats()
}

// ResultStore owns one typed immutable pre-view core facade and one
// operation-scoped same-key singleflight group. A QueryRuntime creates the
// canonical store once; repeated facades reuse it while different operations
// share the process pool and Executor.
type ResultStore[V any] struct {
	pool      *resultPool
	loads     *DetachedGroup[ResultKey, resultExecution[V]]
	executor  *Executor
	clone     CloneFunc[V]
	cost      CostFunc[V]
	valueType reflect.Type
	operation Operation
}

type resultExecution[V any] struct {
	value       V
	observation querytiming.ExecutionObservation
	err         error
}

// NewResultStore constructs an isolated typed core store for focused tests and
// non-process use.
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
	pool, err := newResultPool(config.Limits)
	if err != nil {
		return nil, err
	}
	return newResultStore(pool, config.LoadTimeout, executor, "", clone, cost)
}

// NewSharedResultStore constructs one typed facade over a QueryRuntime's
// process-wide result pool and executor.
func NewSharedResultStore[V any](
	runtime *QueryRuntime,
	operation Operation,
) (*ResultStore[V], error) {
	if runtime == nil ||
		runtime.results == nil ||
		runtime.executor == nil ||
		!versionedOperationPattern.MatchString(string(operation)) {
		return nil, outcome(CodeInvalidInput)
	}
	binding, found := runtime.resultBindings[operation]
	if !found || binding.valueType != reflect.TypeFor[V]() {
		return nil, outcome(CodeInvalidInput)
	}
	store, ok := binding.store.(*ResultStore[V])
	if !ok || store == nil {
		return nil, outcome(CodeInvalidInput)
	}
	return store, nil
}

func newResultStore[V any](
	pool *resultPool,
	loadTimeout time.Duration,
	executor *Executor,
	operation Operation,
	clone CloneFunc[V],
	cost CostFunc[V],
) (*ResultStore[V], error) {
	if pool == nil ||
		loadTimeout <= 0 ||
		executor == nil ||
		clone == nil ||
		cost == nil {
		return nil, outcome(CodeInvalidInput)
	}
	loads, err := NewDetachedGroup[ResultKey, resultExecution[V]](
		loadTimeout,
		ResultKey.String,
	)
	if err != nil {
		return nil, err
	}
	return &ResultStore[V]{
		pool:      pool,
		loads:     loads,
		executor:  executor,
		clone:     clone,
		cost:      cost,
		valueType: reflect.TypeFor[V](),
		operation: operation,
	}, nil
}

// Get returns an ownership-safe core.
func (store *ResultStore[V]) Get(key ResultKey) (V, bool) {
	var zero V
	if store == nil ||
		key.scope == 0 ||
		(store.operation != "" && key.operation != store.operation) {
		return zero, false
	}
	return resultPoolGet[V](store.pool, key, store.valueType)
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
	if store == nil ||
		ctx == nil ||
		key.scope == 0 ||
		(store.operation != "" && key.operation != store.operation) ||
		compute == nil {
		return zero, outcome(CodeInvalidInput)
	}
	cacheStarted := time.Now()
	if value, found := resultPoolGet[V](store.pool, key, store.valueType); found {
		if trace := querytiming.FromContext(ctx); trace != nil {
			_ = trace.ObserveResultCache(
				querytiming.CacheHit,
				time.Since(cacheStarted),
			)
		}
		return value, nil
	}
	if trace := querytiming.FromContext(ctx); trace != nil {
		_ = trace.ObserveResultCache(
			querytiming.CacheMiss,
			time.Since(cacheStarted),
		)
	}

	loaded, err := store.loads.Do(
		ctx,
		key,
		func(workerContext context.Context) (resultExecution[V], error) {
			if cached, found := resultPoolGet[V](store.pool, key, store.valueType); found {
				return resultExecution[V]{value: cached}, nil
			}
			workerTrace := querytiming.New()
			workerContext = querytiming.WithContext(workerContext, workerTrace)
			var computed V
			runErr := store.executor.Do(workerContext, func(runContext context.Context) error {
				computeStarted := time.Now()
				sqliteBefore, _ := workerTrace.CurrentPhase(querytiming.PhaseSQLite)
				defer func() {
					sqliteAfter, _ := workerTrace.CurrentPhase(querytiming.PhaseSQLite)
					computeSeconds := time.Since(computeStarted).Seconds() -
						(sqliteAfter - sqliteBefore)
					if computeSeconds < 0 {
						computeSeconds = 0
					}
					_ = workerTrace.AddSeconds(
						querytiming.PhaseCompute,
						computeSeconds,
					)
				}()
				var err error
				computed, err = compute(runContext)
				return err
			})
			if runErr != nil {
				return resultExecution[V]{
					observation: workerTrace.Freeze().Execution(),
					err:         runErr,
				}, nil
			}
			retainedCost := store.cost(computed)
			if retainedCost >= 0 {
				resultPoolPut(store.pool, key, computed, store.valueType, store.clone, retainedCost)
			}
			return resultExecution[V]{
				value:       computed,
				observation: workerTrace.Freeze().Execution(),
			}, nil
		},
	)
	if err != nil {
		return zero, err
	}
	if trace := querytiming.FromContext(ctx); trace != nil {
		_ = trace.MergeExecution(loaded.observation)
	}
	if loaded.err != nil {
		return zero, loaded.err
	}
	return store.clone(loaded.value), nil
}

// Stats returns the underlying result-pool snapshot. For a shared QueryRuntime
// this is the same process-wide snapshot for every typed facade and must not be
// summed across services.
func (store *ResultStore[V]) Stats() LRUStats {
	if store == nil {
		return LRUStats{}
	}
	return store.pool.stats()
}

// QueryRuntimeConfig defines the process-wide query resource policy.
type QueryRuntimeConfig struct {
	Executor   ExecutorConfig
	Collection CollectionConfig
	Result     ResultConfig
}

// DefaultQueryRuntimeConfig returns the approved production process policy.
func DefaultQueryRuntimeConfig() QueryRuntimeConfig {
	return QueryRuntimeConfig{
		Executor:   DefaultExecutorConfig(),
		Collection: DefaultCollectionConfig(),
		Result:     DefaultResultConfig(),
	}
}

// QueryRuntime owns the resources shared by every production query operation.
// It deliberately contains neither an Archive store nor a collection provider.
type QueryRuntime struct {
	executor       *Executor
	collection     *CollectionCache
	results        *resultPool
	resultBindings map[Operation]ResultBinding
}

// QueryRuntimeStats is the one non-additive process resource snapshot.
type QueryRuntimeStats struct {
	Executor           ExecutorStats
	CollectionPositive LRUStats
	CollectionNegative LRUStats
	Result             LRUStats
}

// NewQueryRuntime constructs one empty process resource owner after validating
// every canonical result binding. Duplicate operations are always invalid,
// including otherwise identical policies.
func NewQueryRuntime(
	config QueryRuntimeConfig,
	bindings ...ResultBinding,
) (*QueryRuntime, error) {
	if !config.Result.Limits.valid() || config.Result.LoadTimeout <= 0 {
		return nil, outcome(CodeInvalidInput)
	}
	resultBindings := make(map[Operation]ResultBinding, len(bindings))
	for _, binding := range bindings {
		if !versionedOperationPattern.MatchString(string(binding.operation)) ||
			binding.valueType == nil ||
			binding.factory == nil {
			return nil, outcome(CodeInvalidInput)
		}
		if _, duplicate := resultBindings[binding.operation]; duplicate {
			return nil, outcome(CodeInvalidInput)
		}
		resultBindings[binding.operation] = binding
	}
	executor, err := NewExecutor(config.Executor)
	if err != nil {
		return nil, err
	}
	collection, err := NewCollectionCache(config.Collection)
	if err != nil {
		return nil, err
	}
	results, err := newResultPool(config.Result.Limits)
	if err != nil {
		return nil, err
	}
	for operation, binding := range resultBindings {
		store, buildErr := binding.factory(
			results,
			config.Result.LoadTimeout,
			executor,
		)
		if buildErr != nil {
			return nil, buildErr
		}
		binding.store = store
		resultBindings[operation] = binding
	}
	return &QueryRuntime{
		executor:       executor,
		collection:     collection,
		results:        results,
		resultBindings: resultBindings,
	}, nil
}

// CollectionCache returns the single collection/negative-cache owner.
func (runtime *QueryRuntime) CollectionCache() *CollectionCache {
	if runtime == nil {
		return nil
	}
	return runtime.collection
}

// Stats returns each shared resource exactly once. Typed store Stats methods
// alias Result and must not be added to this snapshot.
func (runtime *QueryRuntime) Stats() QueryRuntimeStats {
	if runtime == nil {
		return QueryRuntimeStats{}
	}
	return QueryRuntimeStats{
		Executor:           runtime.executor.Stats(),
		CollectionPositive: runtime.collection.PositiveStats(),
		CollectionNegative: runtime.collection.NegativeStats(),
		Result:             runtime.results.stats(),
	}
}
