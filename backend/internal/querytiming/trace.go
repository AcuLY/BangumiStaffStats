// Package querytiming owns the closed, request-scoped execution observation
// used by HTTP timing headers, metrics, and terminal events.
package querytiming

import (
	"context"
	"errors"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Phase is one fixed query execution phase.
type Phase string

const (
	PhaseCollection Phase = "collection"
	PhaseCache      Phase = "cache"
	PhaseSQLite     Phase = "sqlite"
	PhaseCompute    Phase = "compute"
	PhaseProjection Phase = "projection"
)

var phases = [...]Phase{
	PhaseCollection,
	PhaseCache,
	PhaseSQLite,
	PhaseCompute,
	PhaseProjection,
}

// Scope is a closed query scope fact.
type Scope string

const (
	ScopeNotApplicable Scope = "not_applicable"
	ScopeGlobal        Scope = "global"
	ScopePersonal      Scope = "personal"
)

// CacheOutcome is a closed cache fact.
type CacheOutcome string

const (
	CacheNotApplicable CacheOutcome = "not_applicable"
	CacheHit           CacheOutcome = "hit"
	CacheMiss          CacheOutcome = "miss"
	CacheStale         CacheOutcome = "stale"
	CacheNegativeHit   CacheOutcome = "negative_hit"
)

// DependencyOutcome is a closed SQLite or upstream outcome.
type DependencyOutcome string

const (
	DependencyNotApplicable DependencyOutcome = "not_applicable"
	DependencySuccess       DependencyOutcome = "success"
	DependencyTimeout       DependencyOutcome = "timeout"
	DependencyCanceled      DependencyOutcome = "canceled"
	DependencyNetworkError  DependencyOutcome = "network_error"
	DependencyRateLimited   DependencyOutcome = "rate_limited"
	DependencyUpstreamError DependencyOutcome = "upstream_error"
	DependencyNotFound      DependencyOutcome = "not_found"
	DependencyForbidden     DependencyOutcome = "forbidden"
	DependencyDecodeError   DependencyOutcome = "decode_error"
	DependencyError         DependencyOutcome = "error"
)

var (
	// ErrFrozen indicates that the response observation is already immutable.
	ErrFrozen = errors.New("querytiming: trace frozen")
	// ErrInvalidObservation indicates a non-closed or non-finite observation.
	ErrInvalidObservation = errors.New("querytiming: invalid observation")
)

const maxObservationSeconds = float64((24 * time.Hour) / time.Second)

type phaseValue struct {
	seconds float64
	present bool
}

// Trace is concurrency-safe and mutable only until Freeze.
type Trace struct {
	mu sync.Mutex

	frozen             bool
	frozenSnapshot     Snapshot
	phaseValues        [len(phases)]phaseValue
	scope              Scope
	resultCache        CacheOutcome
	collectionCache    CacheOutcome
	sqliteOutcome      DependencyOutcome
	collectionUpstream DependencyObservation
}

// DependencyObservation is one bounded dependency outcome and duration.
type DependencyObservation struct {
	Outcome DependencyOutcome
	Seconds float64
	Present bool
}

// PhaseObservation is one present phase in deterministic order.
type PhaseObservation struct {
	Phase   Phase
	Seconds float64
}

// Snapshot is the immutable observation frozen before response commitment.
type Snapshot struct {
	phaseValues        [len(phases)]phaseValue
	scope              Scope
	resultCache        CacheOutcome
	collectionCache    CacheOutcome
	sqliteOutcome      DependencyOutcome
	collectionUpstream DependencyObservation
}

// ExecutionObservation is the immutable request-independent SQLite/compute
// observation produced by one physical result computation. Its fields are
// intentionally private so callers can only obtain a valid value from a
// frozen Snapshot.
type ExecutionObservation struct {
	sqlite        phaseValue
	compute       phaseValue
	sqliteOutcome DependencyOutcome
}

// New constructs an empty trace with explicit non-applicable closed facts.
func New() *Trace {
	return &Trace{
		scope:           ScopeNotApplicable,
		resultCache:     CacheNotApplicable,
		collectionCache: CacheNotApplicable,
		sqliteOutcome:   DependencyNotApplicable,
		collectionUpstream: DependencyObservation{
			Outcome: DependencyNotApplicable,
		},
	}
}

type contextKey struct{}

// WithContext attaches the sole request trace to ctx.
func WithContext(ctx context.Context, trace *Trace) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	if trace == nil {
		return ctx
	}
	return context.WithValue(ctx, contextKey{}, trace)
}

// FromContext returns the attached request trace.
func FromContext(ctx context.Context) *Trace {
	if ctx == nil {
		return nil
	}
	trace, _ := ctx.Value(contextKey{}).(*Trace)
	return trace
}

// Add records one finite non-negative duration.
func (trace *Trace) Add(phase Phase, duration time.Duration) error {
	if duration < 0 {
		return ErrInvalidObservation
	}
	return trace.AddSeconds(phase, duration.Seconds())
}

// AddSeconds is the finite-number boundary used by tests and adapters.
func (trace *Trace) AddSeconds(phase Phase, seconds float64) error {
	index, valid := phaseIndex(phase)
	if trace == nil ||
		!valid ||
		!validSeconds(seconds) {
		return ErrInvalidObservation
	}
	trace.mu.Lock()
	defer trace.mu.Unlock()
	if trace.frozen {
		return ErrFrozen
	}
	return trace.addSeconds(index, seconds)
}

func (trace *Trace) addSeconds(index int, seconds float64) error {
	next := trace.phaseValues[index].seconds + seconds
	if !validSeconds(next) {
		return ErrInvalidObservation
	}
	trace.phaseValues[index] = phaseValue{seconds: next, present: true}
	return nil
}

// AddFromContext records a duration when ctx carries a trace.
func AddFromContext(ctx context.Context, phase Phase, duration time.Duration) {
	if trace := FromContext(ctx); trace != nil {
		_ = trace.Add(phase, duration)
	}
}

// CurrentPhase returns the currently accepted duration for one fixed phase.
// It exists so an enclosing compute boundary can exclude nested SQLite time.
func (trace *Trace) CurrentPhase(phase Phase) (float64, bool) {
	index, valid := phaseIndex(phase)
	if trace == nil || !valid {
		return 0, false
	}
	trace.mu.Lock()
	defer trace.mu.Unlock()
	value := trace.phaseValues[index]
	return value.seconds, value.present
}

// ObserveSQLiteFromContext records one closed SQLite attempt when ctx carries
// a trace. Arbitrary storage errors collapse to the bounded error outcome.
func ObserveSQLiteFromContext(
	ctx context.Context,
	duration time.Duration,
	err error,
) {
	trace := FromContext(ctx)
	if trace == nil {
		return
	}
	outcome := DependencySuccess
	if err != nil {
		cause := context.Cause(ctx)
		switch {
		case errors.Is(err, context.Canceled),
			errors.Is(cause, context.Canceled):
			outcome = DependencyCanceled
		case errors.Is(err, context.DeadlineExceeded),
			errors.Is(cause, context.DeadlineExceeded):
			outcome = DependencyTimeout
		default:
			outcome = DependencyError
		}
	}
	_ = trace.ObserveSQLite(outcome, duration)
}

// SetScope records the closed effective query scope.
func (trace *Trace) SetScope(scope Scope) error {
	if trace == nil || !validScope(scope) {
		return ErrInvalidObservation
	}
	trace.mu.Lock()
	defer trace.mu.Unlock()
	if trace.frozen {
		return ErrFrozen
	}
	if trace.scope != ScopeNotApplicable && trace.scope != scope {
		return ErrInvalidObservation
	}
	trace.scope = scope
	return nil
}

// SetScopeFromContext records scope when ctx carries a trace.
func SetScopeFromContext(ctx context.Context, scope Scope) {
	if trace := FromContext(ctx); trace != nil {
		_ = trace.SetScope(scope)
	}
}

// SetResultCache records the one closed result-cache outcome.
func (trace *Trace) SetResultCache(outcome CacheOutcome) error {
	if trace == nil {
		return ErrInvalidObservation
	}
	return trace.setCache(&trace.resultCache, outcome, false)
}

// SetCollectionCache records the one closed collection-cache outcome.
func (trace *Trace) SetCollectionCache(outcome CacheOutcome) error {
	if trace == nil {
		return ErrInvalidObservation
	}
	return trace.setCache(&trace.collectionCache, outcome, true)
}

func (trace *Trace) setCache(
	target *CacheOutcome,
	outcome CacheOutcome,
	collection bool,
) error {
	if trace == nil || !validCacheOutcome(outcome, collection) {
		return ErrInvalidObservation
	}
	trace.mu.Lock()
	defer trace.mu.Unlock()
	if trace.frozen {
		return ErrFrozen
	}
	if *target != CacheNotApplicable && *target != outcome {
		return ErrInvalidObservation
	}
	*target = outcome
	return nil
}

// ObserveResultCache atomically records the result-cache phase and outcome.
func (trace *Trace) ObserveResultCache(
	outcome CacheOutcome,
	duration time.Duration,
) error {
	seconds := duration.Seconds()
	index, _ := phaseIndex(PhaseCache)
	if trace == nil ||
		!validCacheOutcome(outcome, false) ||
		duration < 0 ||
		!validSeconds(seconds) {
		return ErrInvalidObservation
	}
	trace.mu.Lock()
	defer trace.mu.Unlock()
	if trace.frozen {
		return ErrFrozen
	}
	if trace.resultCache != CacheNotApplicable &&
		trace.resultCache != outcome {
		return ErrInvalidObservation
	}
	next := trace.phaseValues[index].seconds + seconds
	if !validSeconds(next) {
		return ErrInvalidObservation
	}
	trace.phaseValues[index] = phaseValue{seconds: next, present: true}
	trace.resultCache = outcome
	return nil
}

// ObserveCollection atomically records collection phase, cache outcome, and
// the optional closed upstream observation.
func (trace *Trace) ObserveCollection(
	cacheOutcome CacheOutcome,
	duration time.Duration,
	upstream DependencyObservation,
) error {
	seconds := duration.Seconds()
	index, _ := phaseIndex(PhaseCollection)
	if trace == nil ||
		!validCacheOutcome(cacheOutcome, true) ||
		duration < 0 ||
		!validSeconds(seconds) {
		return ErrInvalidObservation
	}
	if upstream.Present &&
		(!validCollectionUpstreamOutcome(upstream.Outcome) ||
			!validSeconds(upstream.Seconds)) {
		return ErrInvalidObservation
	}
	trace.mu.Lock()
	defer trace.mu.Unlock()
	if trace.frozen {
		return ErrFrozen
	}
	if trace.collectionCache != CacheNotApplicable &&
		trace.collectionCache != cacheOutcome {
		return ErrInvalidObservation
	}
	if trace.collectionUpstream.Present &&
		(!upstream.Present ||
			trace.collectionUpstream.Outcome != upstream.Outcome) {
		return ErrInvalidObservation
	}
	next := trace.phaseValues[index].seconds + seconds
	if !validSeconds(next) {
		return ErrInvalidObservation
	}
	trace.phaseValues[index] = phaseValue{seconds: next, present: true}
	trace.collectionCache = cacheOutcome
	if upstream.Present {
		trace.collectionUpstream = upstream
	}
	return nil
}

// ObserveSQLite records the fixed SQLite outcome and adds its phase duration.
func (trace *Trace) ObserveSQLite(
	outcome DependencyOutcome,
	duration time.Duration,
) error {
	seconds := duration.Seconds()
	index, _ := phaseIndex(PhaseSQLite)
	if trace == nil ||
		!validSQLiteOutcome(outcome) ||
		duration < 0 ||
		!validSeconds(seconds) {
		return ErrInvalidObservation
	}
	trace.mu.Lock()
	defer trace.mu.Unlock()
	if trace.frozen {
		return ErrFrozen
	}
	if err := trace.addSeconds(index, seconds); err != nil {
		return err
	}
	trace.sqliteOutcome = mergeDependencyOutcome(trace.sqliteOutcome, outcome)
	return nil
}

// MergeExecution copies one physical worker execution into a request trace.
// A detached worker can therefore publish the same immutable observation to
// every successful waiter without retaining or mutating any waiter's trace.
func (trace *Trace) MergeExecution(observation ExecutionObservation) error {
	if trace == nil || !validExecutionObservation(observation) {
		return ErrInvalidObservation
	}
	trace.mu.Lock()
	defer trace.mu.Unlock()
	if trace.frozen {
		return ErrFrozen
	}
	sqliteIndex, _ := phaseIndex(PhaseSQLite)
	computeIndex, _ := phaseIndex(PhaseCompute)
	nextPhases := trace.phaseValues
	for _, value := range []struct {
		index int
		phase phaseValue
	}{
		{index: sqliteIndex, phase: observation.sqlite},
		{index: computeIndex, phase: observation.compute},
	} {
		if !value.phase.present {
			continue
		}
		next := nextPhases[value.index].seconds + value.phase.seconds
		if !validSeconds(next) {
			return ErrInvalidObservation
		}
		nextPhases[value.index] = phaseValue{seconds: next, present: true}
	}
	trace.phaseValues = nextPhases
	if observation.sqlite.present {
		trace.sqliteOutcome = mergeDependencyOutcome(
			trace.sqliteOutcome,
			observation.sqliteOutcome,
		)
	}
	return nil
}

// ObserveCollectionUpstream records one closed request-level upstream result.
func (trace *Trace) ObserveCollectionUpstream(
	outcome DependencyOutcome,
	duration time.Duration,
) error {
	seconds := duration.Seconds()
	if trace == nil ||
		!validCollectionUpstreamOutcome(outcome) ||
		duration < 0 ||
		!validSeconds(seconds) {
		return ErrInvalidObservation
	}
	trace.mu.Lock()
	defer trace.mu.Unlock()
	if trace.frozen {
		return ErrFrozen
	}
	if trace.collectionUpstream.Present &&
		trace.collectionUpstream.Outcome != outcome {
		return ErrInvalidObservation
	}
	trace.collectionUpstream = DependencyObservation{
		Outcome: outcome,
		Seconds: seconds,
		Present: true,
	}
	return nil
}

// Freeze captures the sole immutable response observation. Repeated calls
// return exactly the first snapshot.
func (trace *Trace) Freeze() Snapshot {
	if trace == nil {
		return emptySnapshot()
	}
	trace.mu.Lock()
	defer trace.mu.Unlock()
	if trace.frozen {
		return trace.frozenSnapshot
	}
	trace.frozenSnapshot = Snapshot{
		phaseValues:        trace.phaseValues,
		scope:              trace.scope,
		resultCache:        trace.resultCache,
		collectionCache:    trace.collectionCache,
		sqliteOutcome:      trace.sqliteOutcome,
		collectionUpstream: trace.collectionUpstream,
	}
	trace.frozen = true
	return trace.frozenSnapshot
}

// Phases returns present durations in fixed order.
func (snapshot Snapshot) Phases() []PhaseObservation {
	result := make([]PhaseObservation, 0, len(phases))
	for index, phase := range phases {
		if snapshot.phaseValues[index].present {
			result = append(result, PhaseObservation{
				Phase:   phase,
				Seconds: snapshot.phaseValues[index].seconds,
			})
		}
	}
	return result
}

// Phase returns one present phase duration.
func (snapshot Snapshot) Phase(phase Phase) (float64, bool) {
	index, valid := phaseIndex(phase)
	if !valid || !snapshot.phaseValues[index].present {
		return 0, false
	}
	return snapshot.phaseValues[index].seconds, true
}

// Scope returns the closed query scope.
func (snapshot Snapshot) Scope() Scope { return snapshot.scope }

// ResultCache returns the closed result-cache outcome.
func (snapshot Snapshot) ResultCache() CacheOutcome { return snapshot.resultCache }

// CollectionCache returns the closed collection-cache outcome.
func (snapshot Snapshot) CollectionCache() CacheOutcome {
	return snapshot.collectionCache
}

// SQLiteOutcome returns the closed aggregate SQLite outcome.
func (snapshot Snapshot) SQLiteOutcome() DependencyOutcome {
	return snapshot.sqliteOutcome
}

// CollectionUpstream returns the closed collection upstream observation.
func (snapshot Snapshot) CollectionUpstream() DependencyObservation {
	return snapshot.collectionUpstream
}

// Execution returns the immutable SQLite/compute subset that belongs to one
// physical worker execution rather than to an individual waiter.
func (snapshot Snapshot) Execution() ExecutionObservation {
	sqliteIndex, _ := phaseIndex(PhaseSQLite)
	computeIndex, _ := phaseIndex(PhaseCompute)
	return ExecutionObservation{
		sqlite:        snapshot.phaseValues[sqliteIndex],
		compute:       snapshot.phaseValues[computeIndex],
		sqliteOutcome: snapshot.sqliteOutcome,
	}
}

// Phase returns one worker execution duration.
func (observation ExecutionObservation) Phase(phase Phase) (float64, bool) {
	switch phase {
	case PhaseSQLite:
		return observation.sqlite.seconds, observation.sqlite.present
	case PhaseCompute:
		return observation.compute.seconds, observation.compute.present
	default:
		return 0, false
	}
}

// SQLiteOutcome returns the worker's closed aggregate SQLite outcome.
func (observation ExecutionObservation) SQLiteOutcome() DependencyOutcome {
	if !observation.sqlite.present {
		return DependencyNotApplicable
	}
	return observation.sqliteOutcome
}

// ServerTiming renders present phases in deterministic order as milliseconds.
func (snapshot Snapshot) ServerTiming() string {
	parts := make([]string, 0, len(phases))
	for _, observation := range snapshot.Phases() {
		parts = append(parts, string(observation.Phase)+";dur="+
			strconv.FormatFloat(observation.Seconds*1000, 'f', 3, 64))
	}
	return strings.Join(parts, ", ")
}

func emptySnapshot() Snapshot {
	return Snapshot{
		scope:           ScopeNotApplicable,
		resultCache:     CacheNotApplicable,
		collectionCache: CacheNotApplicable,
		sqliteOutcome:   DependencyNotApplicable,
		collectionUpstream: DependencyObservation{
			Outcome: DependencyNotApplicable,
		},
	}
}

func phaseIndex(phase Phase) (int, bool) {
	for index, candidate := range phases {
		if candidate == phase {
			return index, true
		}
	}
	return 0, false
}

func validSeconds(value float64) bool {
	return value >= 0 &&
		value <= maxObservationSeconds &&
		!math.IsNaN(value) &&
		!math.IsInf(value, 0)
}

func validScope(scope Scope) bool {
	return scope == ScopeNotApplicable ||
		scope == ScopeGlobal ||
		scope == ScopePersonal
}

func validCacheOutcome(outcome CacheOutcome, collection bool) bool {
	switch outcome {
	case CacheNotApplicable, CacheHit, CacheMiss:
		return true
	case CacheStale, CacheNegativeHit:
		return collection
	default:
		return false
	}
}

func validSQLiteOutcome(outcome DependencyOutcome) bool {
	switch outcome {
	case DependencySuccess,
		DependencyTimeout,
		DependencyCanceled,
		DependencyError:
		return true
	default:
		return false
	}
}

func validCollectionUpstreamOutcome(outcome DependencyOutcome) bool {
	switch outcome {
	case DependencySuccess,
		DependencyTimeout,
		DependencyCanceled,
		DependencyNetworkError,
		DependencyRateLimited,
		DependencyUpstreamError,
		DependencyNotFound,
		DependencyForbidden,
		DependencyDecodeError,
		DependencyError:
		return true
	default:
		return false
	}
}

func validExecutionObservation(observation ExecutionObservation) bool {
	if observation.sqlite.present {
		if !validSeconds(observation.sqlite.seconds) ||
			!validSQLiteOutcome(observation.sqliteOutcome) {
			return false
		}
	} else if observation.sqlite.seconds != 0 ||
		(observation.sqliteOutcome != "" &&
			observation.sqliteOutcome != DependencyNotApplicable) {
		return false
	}
	if observation.compute.present {
		return validSeconds(observation.compute.seconds)
	}
	return observation.compute.seconds == 0
}

func mergeDependencyOutcome(
	current DependencyOutcome,
	next DependencyOutcome,
) DependencyOutcome {
	if current == DependencyNotApplicable || current == DependencySuccess {
		return next
	}
	return current
}
