// Package observability provides bounded in-process metrics and structured
// events without accepting arbitrary labels or event fields.
package observability

import (
	"bytes"
	"errors"
	"fmt"
	"math"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Route is a closed HTTP route-template label.
type Route string

const (
	RouteLivez        Route = "livez"
	RouteReadyz       Route = "readyz"
	RouteMetrics      Route = "metrics"
	RouteImage        Route = "image"
	RouteCatalog      Route = "catalog"
	RouteRankings     Route = "rankings"
	RouteCandidates   Route = "candidates"
	RoutePersonDetail Route = "person_detail"
	RoutePartners     Route = "partners"
	RouteCoStar       Route = "co_star"
	RouteUnknown      Route = "unknown"
)

// Operation is a closed runtime operation label.
type Operation string

const (
	OperationHealth       Operation = "health"
	OperationMetrics      Operation = "metrics"
	OperationImage        Operation = "image"
	OperationCatalog      Operation = "catalog"
	OperationRankings     Operation = "rankings"
	OperationCandidates   Operation = "candidates"
	OperationPersonDetail Operation = "person_detail"
	OperationPartners     Operation = "partners"
	OperationCoStar       Operation = "co_star"
	OperationUnknown      Operation = "unknown"
)

// Method is a closed HTTP method label.
type Method string

const (
	MethodGET   Method = "GET"
	MethodPOST  Method = "POST"
	MethodOther Method = "other"
)

// StatusClass is a closed response status-class label.
type StatusClass string

const (
	StatusNone StatusClass = "none"
	Status2xx  StatusClass = "2xx"
	Status3xx  StatusClass = "3xx"
	Status4xx  StatusClass = "4xx"
	Status5xx  StatusClass = "5xx"
)

// Outcome is a closed request outcome label.
type Outcome string

const (
	OutcomeSuccess  Outcome = "success"
	OutcomeRejected Outcome = "rejected"
	OutcomeError    Outcome = "error"
	OutcomeTimeout  Outcome = "timeout"
	OutcomeCanceled Outcome = "canceled"
	OutcomePanic    Outcome = "panic"
)

// QueryPhase is one closed typed-business execution phase.
type QueryPhase string

const (
	QueryPhaseCollection QueryPhase = "collection"
	QueryPhaseCache      QueryPhase = "cache"
	QueryPhaseSQLite     QueryPhase = "sqlite"
	QueryPhaseCompute    QueryPhase = "compute"
	QueryPhaseProjection QueryPhase = "projection"
)

// QueryScope is the closed effective scope admitted to terminal facts.
type QueryScope string

const (
	QueryScopeNotApplicable QueryScope = "not_applicable"
	QueryScopeGlobal        QueryScope = "global"
	QueryScopePersonal      QueryScope = "personal"
)

// CacheOutcome is the closed request-level cache outcome set.
type CacheOutcome string

const (
	CacheOutcomeNotApplicable CacheOutcome = "not_applicable"
	CacheOutcomeHit           CacheOutcome = "hit"
	CacheOutcomeMiss          CacheOutcome = "miss"
	CacheOutcomeStale         CacheOutcome = "stale"
	CacheOutcomeNegativeHit   CacheOutcome = "negative_hit"
)

// DependencyOutcome is the closed SQLite/upstream metric outcome set.
type DependencyOutcome string

const (
	DependencyOutcomeNotApplicable DependencyOutcome = "not_applicable"
	DependencyOutcomeSuccess       DependencyOutcome = "success"
	DependencyOutcomeTimeout       DependencyOutcome = "timeout"
	DependencyOutcomeCanceled      DependencyOutcome = "canceled"
	DependencyOutcomeNetworkError  DependencyOutcome = "network_error"
	DependencyOutcomeRateLimited   DependencyOutcome = "rate_limited"
	DependencyOutcomeUpstreamError DependencyOutcome = "upstream_error"
	DependencyOutcomeNotFound      DependencyOutcome = "not_found"
	DependencyOutcomeForbidden     DependencyOutcome = "forbidden"
	DependencyOutcomeDecodeError   DependencyOutcome = "decode_error"
	DependencyOutcomeError         DependencyOutcome = "error"
)

// Upstream is a fixed remote dependency family.
type Upstream string

const (
	UpstreamCollection Upstream = "collection"
	UpstreamImage      Upstream = "image"
)

// Cache is one process-wide cache resource. The result cache is shared by all
// five typed services and therefore appears only once.
type Cache string

const (
	CacheCollectionPositive Cache = "collection_positive"
	CacheCollectionNegative Cache = "collection_negative"
	CacheResult             Cache = "result"
)

// QueryPhaseObservation contains one frozen finite phase duration.
type QueryPhaseObservation struct {
	Phase   QueryPhase
	Seconds float64
}

// DependencyObservation contains one frozen dependency attempt.
type DependencyObservation struct {
	Outcome DependencyOutcome
	Seconds float64
	Present bool
}

// QueryExecutionObservation is the only typed boundary for submitting one
// frozen request observation to the registry.
type QueryExecutionObservation struct {
	Operation          Operation
	Scope              QueryScope
	ResultCache        CacheOutcome
	CollectionCache    CacheOutcome
	Phases             []QueryPhaseObservation
	SQLiteOutcome      DependencyOutcome
	CollectionUpstream DependencyObservation
}

// UpstreamObservation records an independent image request experience.
type UpstreamObservation struct {
	Upstream Upstream
	Outcome  DependencyOutcome
	Duration time.Duration
}

// ExecutorStats is the observability-owned process executor snapshot.
type ExecutorStats struct {
	Running  int64
	Queued   int64
	Started  uint64
	Rejected uint64
}

// CacheStats is one observability-owned cache resource snapshot.
type CacheStats struct {
	Hits         uint64
	Misses       uint64
	Publications uint64
	Replacements uint64
	Evictions    uint64
	Oversize     uint64
	Deletes      uint64
	Items        int64
	Bytes        int64
}

// RuntimeStats is one non-additive process resource snapshot.
type RuntimeStats struct {
	Executor           ExecutorStats
	CollectionPositive CacheStats
	CollectionNegative CacheStats
	Result             CacheStats
}

// RuntimeStatsProvider samples the sole process-owned query runtime.
type RuntimeStatsProvider func() (RuntimeStats, error)

type updateStatusProvider func() (UpdateStatusSnapshot, error)

// BuildInfo contains process-controlled build facts. These values are never
// populated from a request.
type BuildInfo struct {
	Version string
	Commit  string
}

// RequestObservation is one bounded HTTP request measurement.
type RequestObservation struct {
	Route         Route
	Operation     Operation
	Method        Method
	StatusClass   StatusClass
	Outcome       Outcome
	Duration      time.Duration
	ResponseBytes int64
}

type requestKey struct {
	Route       Route
	Operation   Operation
	Method      Method
	StatusClass StatusClass
	Outcome     Outcome
}

type queryPhaseKey struct {
	Operation Operation
	Phase     QueryPhase
}

type dependencyKey struct {
	Upstream Upstream
	Outcome  DependencyOutcome
}

type histogram struct {
	count   uint64
	sum     float64
	buckets []uint64
}

// Registry owns the current bounded metric state.
type Registry struct {
	mu sync.RWMutex

	startedAt     time.Time
	build         BuildInfo
	live          bool
	ready         bool
	dataVersion   string
	requests      map[requestKey]uint64
	durations     map[requestKey]*histogram
	sizes         map[requestKey]*histogram
	queryPhases   map[queryPhaseKey]*histogram
	sqlite        map[DependencyOutcome]uint64
	sqliteTimes   map[DependencyOutcome]*histogram
	upstreams     map[dependencyKey]uint64
	upstreamTimes map[dependencyKey]*histogram

	runtimeStats RuntimeStatsProvider
	updateStatus updateStatusProvider
}

var (
	durationBuckets = []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30}
	sizeBuckets     = []float64{0, 128, 512, 1024, 4096, 16384, 65536, 262144, 1048576}
)

// NewRegistry constructs a registry from process-controlled build facts.
func NewRegistry(build BuildInfo) (*Registry, error) {
	if build.Version == "" {
		build.Version = "dev"
	}
	if build.Commit == "" {
		build.Commit = "unknown"
	}
	if !validFact(build.Version) || !validFact(build.Commit) {
		return nil, errors.New("observability: invalid build fact")
	}
	return &Registry{
		startedAt:     time.Now(),
		build:         build,
		requests:      make(map[requestKey]uint64),
		durations:     make(map[requestKey]*histogram),
		sizes:         make(map[requestKey]*histogram),
		queryPhases:   make(map[queryPhaseKey]*histogram),
		sqlite:        make(map[DependencyOutcome]uint64),
		sqliteTimes:   make(map[DependencyOutcome]*histogram),
		upstreams:     make(map[dependencyKey]uint64),
		upstreamTimes: make(map[dependencyKey]*histogram),
	}, nil
}

// SetLive updates the process liveness gauge.
func (r *Registry) SetLive(live bool) {
	if r == nil {
		return
	}
	r.mu.Lock()
	r.live = live
	r.mu.Unlock()
}

// SetReadiness replaces the current readiness and snapshot identity. A false
// readiness always removes the previous identity.
func (r *Registry) SetReadiness(ready bool, dataVersion string) error {
	if r == nil {
		return errors.New("observability: nil registry")
	}
	if ready && !validDataVersion(dataVersion) {
		return errors.New("observability: invalid data version")
	}
	r.mu.Lock()
	r.ready = ready
	if ready {
		r.dataVersion = dataVersion
	} else {
		r.dataVersion = ""
	}
	r.mu.Unlock()
	return nil
}

// SetRuntimeStatsProvider replaces the optional process-resource sampler. The
// provider is invoked exactly once by each RenderPrometheus call.
func (r *Registry) SetRuntimeStatsProvider(provider RuntimeStatsProvider) error {
	if r == nil {
		return errors.New("observability: nil registry")
	}
	r.mu.Lock()
	r.runtimeStats = provider
	r.mu.Unlock()
	return nil
}

// SetUpdateStatusReader replaces the optional read-only updater-status source.
func (r *Registry) SetUpdateStatusReader(reader *UpdateStatusReader) error {
	if r == nil {
		return errors.New("observability: nil registry")
	}
	r.mu.Lock()
	if reader == nil {
		r.updateStatus = nil
	} else {
		r.updateStatus = reader.Read
	}
	r.mu.Unlock()
	return nil
}

// ObserveRequest records one request using only closed dimensions.
func (r *Registry) ObserveRequest(observation RequestObservation) error {
	if r == nil {
		return errors.New("observability: nil registry")
	}
	if err := validateObservation(observation); err != nil {
		return err
	}

	key := requestKey{
		Route:       observation.Route,
		Operation:   observation.Operation,
		Method:      observation.Method,
		StatusClass: observation.StatusClass,
		Outcome:     observation.Outcome,
	}
	durationSeconds := observation.Duration.Seconds()
	responseBytes := float64(observation.ResponseBytes)

	r.mu.Lock()
	r.requests[key]++
	observeHistogram(r.durations, key, durationSeconds, durationBuckets)
	observeHistogram(r.sizes, key, responseBytes, sizeBuckets)
	r.mu.Unlock()
	return nil
}

// ObserveQueryExecution records the exact frozen observation once. It rejects
// unknown phases, non-finite values, duplicate phases, and non-business
// operations before mutating the registry.
func (r *Registry) ObserveQueryExecution(
	observation QueryExecutionObservation,
) error {
	if r == nil {
		return errors.New("observability: nil registry")
	}
	if err := validateQueryExecution(observation); err != nil {
		return err
	}
	phases := append([]QueryPhaseObservation(nil), observation.Phases...)
	slices.SortFunc(phases, func(left, right QueryPhaseObservation) int {
		return queryPhaseIndex(left.Phase) - queryPhaseIndex(right.Phase)
	})

	r.mu.Lock()
	defer r.mu.Unlock()
	for _, phase := range phases {
		observeHistogram(
			r.queryPhases,
			queryPhaseKey{Operation: observation.Operation, Phase: phase.Phase},
			phase.Seconds,
			durationBuckets,
		)
	}
	if observation.SQLiteOutcome != DependencyOutcomeNotApplicable {
		seconds, present := phaseSeconds(phases, QueryPhaseSQLite)
		if present {
			r.sqlite[observation.SQLiteOutcome]++
			observeHistogram(
				r.sqliteTimes,
				observation.SQLiteOutcome,
				seconds,
				durationBuckets,
			)
		}
	}
	if observation.CollectionUpstream.Present {
		key := dependencyKey{
			Upstream: UpstreamCollection,
			Outcome:  observation.CollectionUpstream.Outcome,
		}
		r.upstreams[key]++
		observeHistogram(
			r.upstreamTimes,
			key,
			observation.CollectionUpstream.Seconds,
			durationBuckets,
		)
	}
	return nil
}

// ObserveUpstream records a fixed independent upstream attempt.
func (r *Registry) ObserveUpstream(observation UpstreamObservation) error {
	if r == nil {
		return errors.New("observability: nil registry")
	}
	seconds := observation.Duration.Seconds()
	if !validUpstream(observation.Upstream) ||
		!validUpstreamOutcome(observation.Outcome) ||
		observation.Duration < 0 ||
		!finiteNonNegative(seconds) {
		return errors.New("observability: invalid upstream observation")
	}
	key := dependencyKey{
		Upstream: observation.Upstream,
		Outcome:  observation.Outcome,
	}
	r.mu.Lock()
	r.upstreams[key]++
	observeHistogram(r.upstreamTimes, key, seconds, durationBuckets)
	r.mu.Unlock()
	return nil
}

func observeHistogram[K comparable](
	target map[K]*histogram,
	key K,
	value float64,
	bounds []float64,
) {
	current := target[key]
	if current == nil {
		current = &histogram{buckets: make([]uint64, len(bounds))}
		target[key] = current
	}
	current.count++
	current.sum += value
	for index, bound := range bounds {
		if value <= bound {
			current.buckets[index]++
		}
	}
}

func validateQueryExecution(observation QueryExecutionObservation) error {
	if !validMetricQueryOperation(observation.Operation) ||
		!validQueryScope(observation.Scope) ||
		!validResultCacheOutcome(observation.ResultCache) ||
		!validCollectionCacheOutcome(observation.CollectionCache) ||
		!validSQLiteOutcome(observation.SQLiteOutcome) {
		return errors.New("observability: invalid query execution facts")
	}
	seen := make(map[QueryPhase]struct{}, len(observation.Phases))
	for _, phase := range observation.Phases {
		if !validQueryPhase(phase.Phase) ||
			!finiteNonNegative(phase.Seconds) {
			return errors.New("observability: invalid query phase")
		}
		if _, duplicate := seen[phase.Phase]; duplicate {
			return errors.New("observability: duplicate query phase")
		}
		seen[phase.Phase] = struct{}{}
	}
	_, sqlitePresent := seen[QueryPhaseSQLite]
	if (observation.SQLiteOutcome == DependencyOutcomeNotApplicable) !=
		(!sqlitePresent) {
		return errors.New("observability: inconsistent SQLite observation")
	}
	upstream := observation.CollectionUpstream
	if upstream.Present {
		if !validUpstreamOutcome(upstream.Outcome) ||
			!finiteNonNegative(upstream.Seconds) {
			return errors.New("observability: invalid collection upstream")
		}
	} else if upstream.Outcome != DependencyOutcomeNotApplicable ||
		upstream.Seconds != 0 {
		return errors.New("observability: inconsistent collection upstream")
	}
	return nil
}

func validMetricQueryOperation(operation Operation) bool {
	switch operation {
	case OperationRankings,
		OperationCandidates,
		OperationPersonDetail,
		OperationPartners,
		OperationCoStar:
		return true
	default:
		return false
	}
}

func validQueryPhase(phase QueryPhase) bool {
	return queryPhaseIndex(phase) >= 0
}

func queryPhaseIndex(phase QueryPhase) int {
	switch phase {
	case QueryPhaseCollection:
		return 0
	case QueryPhaseCache:
		return 1
	case QueryPhaseSQLite:
		return 2
	case QueryPhaseCompute:
		return 3
	case QueryPhaseProjection:
		return 4
	default:
		return -1
	}
}

func validQueryScope(scope QueryScope) bool {
	switch scope {
	case QueryScopeNotApplicable, QueryScopeGlobal, QueryScopePersonal:
		return true
	default:
		return false
	}
}

func validResultCacheOutcome(outcome CacheOutcome) bool {
	switch outcome {
	case CacheOutcomeNotApplicable, CacheOutcomeHit, CacheOutcomeMiss:
		return true
	default:
		return false
	}
}

func validCollectionCacheOutcome(outcome CacheOutcome) bool {
	switch outcome {
	case CacheOutcomeNotApplicable,
		CacheOutcomeHit,
		CacheOutcomeMiss,
		CacheOutcomeStale,
		CacheOutcomeNegativeHit:
		return true
	default:
		return false
	}
}

func validSQLiteOutcome(outcome DependencyOutcome) bool {
	switch outcome {
	case DependencyOutcomeNotApplicable,
		DependencyOutcomeSuccess,
		DependencyOutcomeTimeout,
		DependencyOutcomeCanceled,
		DependencyOutcomeError:
		return true
	default:
		return false
	}
}

func validUpstreamOutcome(outcome DependencyOutcome) bool {
	switch outcome {
	case DependencyOutcomeSuccess,
		DependencyOutcomeTimeout,
		DependencyOutcomeCanceled,
		DependencyOutcomeNetworkError,
		DependencyOutcomeRateLimited,
		DependencyOutcomeUpstreamError,
		DependencyOutcomeNotFound,
		DependencyOutcomeForbidden,
		DependencyOutcomeDecodeError,
		DependencyOutcomeError:
		return true
	default:
		return false
	}
}

func validUpstream(upstream Upstream) bool {
	return upstream == UpstreamCollection || upstream == UpstreamImage
}

func finiteNonNegative(value float64) bool {
	return value >= 0 && !math.IsNaN(value) && !math.IsInf(value, 0)
}

func phaseSeconds(
	phases []QueryPhaseObservation,
	phase QueryPhase,
) (float64, bool) {
	for _, observation := range phases {
		if observation.Phase == phase {
			return observation.Seconds, true
		}
	}
	return 0, false
}

func validateObservation(observation RequestObservation) error {
	if !validRouteOperation(observation.Route, observation.Operation) {
		return errors.New("observability: invalid route or operation")
	}
	if observation.Method != MethodGET &&
		observation.Method != MethodPOST &&
		observation.Method != MethodOther {
		return errors.New("observability: invalid method")
	}
	switch observation.StatusClass {
	case StatusNone, Status2xx, Status3xx, Status4xx, Status5xx:
	default:
		return errors.New("observability: invalid status class")
	}
	switch observation.Outcome {
	case OutcomeSuccess, OutcomeRejected, OutcomeError, OutcomeTimeout, OutcomeCanceled, OutcomePanic:
	default:
		return errors.New("observability: invalid outcome")
	}
	if observation.StatusClass == StatusNone && observation.Outcome != OutcomeCanceled {
		return errors.New("observability: status none is reserved for cancellation")
	}
	if observation.Duration < 0 || math.IsNaN(observation.Duration.Seconds()) || math.IsInf(observation.Duration.Seconds(), 0) {
		return errors.New("observability: invalid duration")
	}
	if observation.ResponseBytes < 0 {
		return errors.New("observability: invalid response size")
	}
	return nil
}

func validRouteOperation(route Route, operation Operation) bool {
	switch route {
	case RouteLivez, RouteReadyz:
		return operation == OperationHealth
	case RouteMetrics:
		return operation == OperationMetrics
	case RouteImage:
		return operation == OperationImage
	case RouteCatalog:
		return operation == OperationCatalog
	case RouteRankings:
		return operation == OperationRankings
	case RouteCandidates:
		return operation == OperationCandidates
	case RoutePersonDetail:
		return operation == OperationPersonDetail
	case RoutePartners:
		return operation == OperationPartners
	case RouteCoStar:
		return operation == OperationCoStar
	case RouteUnknown:
		return operation == OperationUnknown
	default:
		return false
	}
}

func validFact(value string) bool {
	if len(value) == 0 || len(value) > 128 {
		return false
	}
	for _, character := range value {
		if character >= 'a' && character <= 'z' ||
			character >= 'A' && character <= 'Z' ||
			character >= '0' && character <= '9' {
			continue
		}
		switch character {
		case '.', '_', '+', '-':
			continue
		default:
			return false
		}
	}
	return true
}

func validDataVersion(value string) bool {
	if len(value) != 68 || !strings.HasPrefix(value, "dv1-") {
		return false
	}
	for _, character := range value[4:] {
		if character < '0' || character > '9' && character < 'a' || character > 'f' {
			return false
		}
	}
	return true
}

type metricSnapshot struct {
	startedAt     time.Time
	build         BuildInfo
	live          bool
	ready         bool
	dataVersion   string
	requests      map[requestKey]uint64
	durations     map[requestKey]histogram
	sizes         map[requestKey]histogram
	queryPhases   map[queryPhaseKey]histogram
	sqlite        map[DependencyOutcome]uint64
	sqliteTimes   map[DependencyOutcome]histogram
	upstreams     map[dependencyKey]uint64
	upstreamTimes map[dependencyKey]histogram
	runtimeStats  RuntimeStatsProvider
	updateStatus  updateStatusProvider
}

func (r *Registry) snapshot() (metricSnapshot, error) {
	if r == nil {
		return metricSnapshot{}, errors.New("observability: nil registry")
	}
	r.mu.RLock()
	defer r.mu.RUnlock()

	snapshot := metricSnapshot{
		startedAt:     r.startedAt,
		build:         r.build,
		live:          r.live,
		ready:         r.ready,
		dataVersion:   r.dataVersion,
		requests:      make(map[requestKey]uint64, len(r.requests)),
		durations:     make(map[requestKey]histogram, len(r.durations)),
		sizes:         make(map[requestKey]histogram, len(r.sizes)),
		queryPhases:   make(map[queryPhaseKey]histogram, len(r.queryPhases)),
		sqlite:        make(map[DependencyOutcome]uint64, len(r.sqlite)),
		sqliteTimes:   make(map[DependencyOutcome]histogram, len(r.sqliteTimes)),
		upstreams:     make(map[dependencyKey]uint64, len(r.upstreams)),
		upstreamTimes: make(map[dependencyKey]histogram, len(r.upstreamTimes)),
		runtimeStats:  r.runtimeStats,
		updateStatus:  r.updateStatus,
	}
	for key, value := range r.requests {
		snapshot.requests[key] = value
	}
	for key, value := range r.durations {
		snapshot.durations[key] = histogram{
			count:   value.count,
			sum:     value.sum,
			buckets: slices.Clone(value.buckets),
		}
	}
	for key, value := range r.sizes {
		snapshot.sizes[key] = cloneHistogram(value)
	}
	for key, value := range r.queryPhases {
		snapshot.queryPhases[key] = cloneHistogram(value)
	}
	for key, value := range r.sqlite {
		snapshot.sqlite[key] = value
	}
	for key, value := range r.sqliteTimes {
		snapshot.sqliteTimes[key] = cloneHistogram(value)
	}
	for key, value := range r.upstreams {
		snapshot.upstreams[key] = value
	}
	for key, value := range r.upstreamTimes {
		snapshot.upstreamTimes[key] = cloneHistogram(value)
	}
	return snapshot, nil
}

func cloneHistogram(value *histogram) histogram {
	if value == nil {
		return histogram{}
	}
	return histogram{
		count:   value.count,
		sum:     value.sum,
		buckets: slices.Clone(value.buckets),
	}
}

// RenderPrometheus renders one deterministic Prometheus text snapshot.
func (r *Registry) RenderPrometheus() ([]byte, error) {
	snapshot, err := r.snapshot()
	if err != nil {
		return nil, err
	}
	runtimeStats, runtimeConfigured, runtimeValid := sampleRuntimeStats(
		snapshot.runtimeStats,
	)
	updateStatus, updateConfigured, updateValid := sampleUpdateStatus(
		snapshot.updateStatus,
	)

	keys := make([]requestKey, 0, len(snapshot.requests))
	for key := range snapshot.requests {
		keys = append(keys, key)
	}
	slices.SortFunc(keys, func(left, right requestKey) int {
		return strings.Compare(requestKeyString(left), requestKeyString(right))
	})

	var output bytes.Buffer
	writeMetricHeader(&output, "bgmss_http_requests_total", "Completed HTTP requests.", "counter")
	for _, key := range keys {
		fmt.Fprintf(&output, "bgmss_http_requests_total{%s} %d\n", requestLabels(key), snapshot.requests[key])
	}

	writeMetricHeader(&output, "bgmss_http_request_duration_seconds", "HTTP request duration in seconds.", "histogram")
	for _, key := range keys {
		writeHistogram(&output, "bgmss_http_request_duration_seconds", requestLabels(key), snapshot.durations[key], durationBuckets)
	}

	writeMetricHeader(&output, "bgmss_http_response_size_bytes", "HTTP response size in bytes.", "histogram")
	for _, key := range keys {
		writeHistogram(&output, "bgmss_http_response_size_bytes", requestLabels(key), snapshot.sizes[key], sizeBuckets)
	}

	phaseKeys := make([]queryPhaseKey, 0, len(snapshot.queryPhases))
	for key := range snapshot.queryPhases {
		phaseKeys = append(phaseKeys, key)
	}
	slices.SortFunc(phaseKeys, func(left, right queryPhaseKey) int {
		if compared := strings.Compare(
			string(left.Operation),
			string(right.Operation),
		); compared != 0 {
			return compared
		}
		return queryPhaseIndex(left.Phase) - queryPhaseIndex(right.Phase)
	})
	writeMetricHeader(
		&output,
		"bgmss_query_phase_duration_seconds",
		"Typed query phase duration in seconds.",
		"histogram",
	)
	for _, key := range phaseKeys {
		labels := fmt.Sprintf(
			"operation=%s,phase=%s",
			strconv.Quote(string(key.Operation)),
			strconv.Quote(string(key.Phase)),
		)
		writeHistogram(
			&output,
			"bgmss_query_phase_duration_seconds",
			labels,
			snapshot.queryPhases[key],
			durationBuckets,
		)
	}

	sqliteOutcomes := make([]DependencyOutcome, 0, len(snapshot.sqlite))
	for outcome := range snapshot.sqlite {
		sqliteOutcomes = append(sqliteOutcomes, outcome)
	}
	slices.Sort(sqliteOutcomes)
	writeMetricHeader(
		&output,
		"bgmss_sqlite_queries_total",
		"Typed query SQLite observations.",
		"counter",
	)
	for _, outcome := range sqliteOutcomes {
		fmt.Fprintf(
			&output,
			"bgmss_sqlite_queries_total{outcome=%s} %d\n",
			strconv.Quote(string(outcome)),
			snapshot.sqlite[outcome],
		)
	}
	writeMetricHeader(
		&output,
		"bgmss_sqlite_query_duration_seconds",
		"Typed query SQLite duration in seconds.",
		"histogram",
	)
	for _, outcome := range sqliteOutcomes {
		writeHistogram(
			&output,
			"bgmss_sqlite_query_duration_seconds",
			"outcome="+strconv.Quote(string(outcome)),
			snapshot.sqliteTimes[outcome],
			durationBuckets,
		)
	}

	upstreamKeys := make([]dependencyKey, 0, len(snapshot.upstreams))
	for key := range snapshot.upstreams {
		upstreamKeys = append(upstreamKeys, key)
	}
	slices.SortFunc(upstreamKeys, func(left, right dependencyKey) int {
		if compared := strings.Compare(
			string(left.Upstream),
			string(right.Upstream),
		); compared != 0 {
			return compared
		}
		return strings.Compare(string(left.Outcome), string(right.Outcome))
	})
	writeMetricHeader(
		&output,
		"bgmss_upstream_request_experiences_total",
		"Typed request experiences at collection and image upstream boundaries; coalesced collection waiters are counted per request.",
		"counter",
	)
	for _, key := range upstreamKeys {
		fmt.Fprintf(
			&output,
			"bgmss_upstream_request_experiences_total{%s} %d\n",
			dependencyLabels(key),
			snapshot.upstreams[key],
		)
	}
	writeMetricHeader(
		&output,
		"bgmss_upstream_request_experience_duration_seconds",
		"Typed request experience duration at collection and image upstream boundaries in seconds.",
		"histogram",
	)
	for _, key := range upstreamKeys {
		writeHistogram(
			&output,
			"bgmss_upstream_request_experience_duration_seconds",
			dependencyLabels(key),
			snapshot.upstreamTimes[key],
			durationBuckets,
		)
	}

	writeRuntimeMetrics(
		&output,
		runtimeStats,
		runtimeConfigured,
		runtimeValid,
	)
	writeUpdateStatusMetrics(
		&output,
		updateStatus,
		updateConfigured,
		updateValid,
	)

	writeMetricHeader(&output, "bgmss_liveness", "Whether the HTTP process is serving.", "gauge")
	fmt.Fprintf(&output, "bgmss_liveness %d\n", boolMetric(snapshot.live))
	writeMetricHeader(&output, "bgmss_readiness", "Whether the current Archive probe is ready.", "gauge")
	fmt.Fprintf(&output, "bgmss_readiness %d\n", boolMetric(snapshot.ready))

	writeMetricHeader(&output, "bgmss_current_snapshot_info", "Current published Archive snapshot.", "gauge")
	if snapshot.ready && snapshot.dataVersion != "" {
		fmt.Fprintf(&output, "bgmss_current_snapshot_info{data_version=%s} 1\n", strconv.Quote(snapshot.dataVersion))
	}

	writeMetricHeader(&output, "bgmss_go_info", "Go runtime version.", "gauge")
	fmt.Fprintf(&output, "bgmss_go_info{version=%s} 1\n", strconv.Quote(runtime.Version()))
	writeMetricHeader(&output, "bgmss_process_start_time_seconds", "Process registry start time in Unix seconds.", "gauge")
	fmt.Fprintf(&output, "bgmss_process_start_time_seconds %s\n", formatFloat(float64(snapshot.startedAt.Unix())))
	writeMetricHeader(&output, "bgmss_build_info", "Backend build information.", "gauge")
	fmt.Fprintf(
		&output,
		"bgmss_build_info{commit=%s,version=%s} 1\n",
		strconv.Quote(snapshot.build.Commit),
		strconv.Quote(snapshot.build.Version),
	)
	return output.Bytes(), nil
}

func sampleRuntimeStats(
	provider RuntimeStatsProvider,
) (stats RuntimeStats, configured bool, valid bool) {
	if provider == nil {
		return RuntimeStats{}, false, false
	}
	configured = true
	defer func() {
		if recover() != nil {
			stats = RuntimeStats{}
			valid = false
		}
	}()
	sampled, err := provider()
	if err != nil || !validRuntimeStats(sampled) {
		return RuntimeStats{}, true, false
	}
	return sampled, true, true
}

func validRuntimeStats(stats RuntimeStats) bool {
	if stats.Executor.Running < 0 || stats.Executor.Queued < 0 {
		return false
	}
	for _, cache := range []CacheStats{
		stats.CollectionPositive,
		stats.CollectionNegative,
		stats.Result,
	} {
		if cache.Items < 0 || cache.Bytes < 0 {
			return false
		}
	}
	return true
}

func sampleUpdateStatus(
	provider updateStatusProvider,
) (status UpdateStatusSnapshot, configured bool, valid bool) {
	if provider == nil {
		return UpdateStatusSnapshot{}, false, false
	}
	configured = true
	defer func() {
		if recover() != nil {
			status = UpdateStatusSnapshot{}
			valid = false
		}
	}()
	sampled, err := provider()
	if err != nil {
		return UpdateStatusSnapshot{}, true, false
	}
	return sampled, true, true
}

func writeRuntimeMetrics(
	output *bytes.Buffer,
	stats RuntimeStats,
	configured bool,
	valid bool,
) {
	writeMetricHeader(
		output,
		"bgmss_query_runtime_stats_configured",
		"Whether a process query runtime sampler is configured.",
		"gauge",
	)
	fmt.Fprintf(
		output,
		"bgmss_query_runtime_stats_configured %d\n",
		boolMetric(configured),
	)
	writeMetricHeader(
		output,
		"bgmss_query_runtime_stats_valid",
		"Whether the process query runtime sample is valid.",
		"gauge",
	)
	fmt.Fprintf(
		output,
		"bgmss_query_runtime_stats_valid %d\n",
		boolMetric(valid),
	)
	if !valid {
		return
	}

	writeMetricHeader(
		output,
		"bgmss_query_executor_running",
		"Currently running admitted query computations.",
		"gauge",
	)
	fmt.Fprintf(
		output,
		"bgmss_query_executor_running %d\n",
		stats.Executor.Running,
	)
	writeMetricHeader(
		output,
		"bgmss_query_executor_queued",
		"Currently queued query computations.",
		"gauge",
	)
	fmt.Fprintf(
		output,
		"bgmss_query_executor_queued %d\n",
		stats.Executor.Queued,
	)
	writeMetricHeader(
		output,
		"bgmss_query_executor_started_total",
		"Admitted query computations started.",
		"counter",
	)
	fmt.Fprintf(
		output,
		"bgmss_query_executor_started_total %d\n",
		stats.Executor.Started,
	)
	writeMetricHeader(
		output,
		"bgmss_query_executor_rejected_total",
		"Query computations rejected by the bounded queue.",
		"counter",
	)
	fmt.Fprintf(
		output,
		"bgmss_query_executor_rejected_total %d\n",
		stats.Executor.Rejected,
	)

	cacheStats := []namedCacheStats{
		{cache: CacheCollectionPositive, stats: stats.CollectionPositive},
		{cache: CacheCollectionNegative, stats: stats.CollectionNegative},
		{cache: CacheResult, stats: stats.Result},
	}
	writeCacheGauge(
		output,
		"bgmss_query_cache_items",
		"Current retained cache item count.",
		cacheStats,
		func(stats CacheStats) int64 { return stats.Items },
	)
	writeCacheGauge(
		output,
		"bgmss_query_cache_retained_bytes",
		"Current retained cache cost in bytes.",
		cacheStats,
		func(stats CacheStats) int64 { return stats.Bytes },
	)
	writeCacheCounter(
		output,
		"bgmss_query_cache_hits_total",
		"Cache hits.",
		cacheStats,
		func(stats CacheStats) uint64 { return stats.Hits },
	)
	writeCacheCounter(
		output,
		"bgmss_query_cache_misses_total",
		"Cache misses.",
		cacheStats,
		func(stats CacheStats) uint64 { return stats.Misses },
	)
	writeCacheCounter(
		output,
		"bgmss_query_cache_publications_total",
		"Cache publications.",
		cacheStats,
		func(stats CacheStats) uint64 { return stats.Publications },
	)
	writeCacheCounter(
		output,
		"bgmss_query_cache_replacements_total",
		"Cache replacements.",
		cacheStats,
		func(stats CacheStats) uint64 { return stats.Replacements },
	)
	writeCacheCounter(
		output,
		"bgmss_query_cache_evictions_total",
		"Cache evictions.",
		cacheStats,
		func(stats CacheStats) uint64 { return stats.Evictions },
	)
	writeCacheCounter(
		output,
		"bgmss_query_cache_oversize_values_total",
		"Oversize cache values refused.",
		cacheStats,
		func(stats CacheStats) uint64 { return stats.Oversize },
	)
	writeCacheCounter(
		output,
		"bgmss_query_cache_deletes_total",
		"Explicit cache deletes.",
		cacheStats,
		func(stats CacheStats) uint64 { return stats.Deletes },
	)
}

type namedCacheStats struct {
	cache Cache
	stats CacheStats
}

func writeCacheGauge(
	output *bytes.Buffer,
	name string,
	help string,
	values []namedCacheStats,
	selectValue func(CacheStats) int64,
) {
	writeMetricHeader(output, name, help, "gauge")
	for _, value := range values {
		fmt.Fprintf(
			output,
			"%s{cache=%s} %d\n",
			name,
			strconv.Quote(string(value.cache)),
			selectValue(value.stats),
		)
	}
}

func writeCacheCounter(
	output *bytes.Buffer,
	name string,
	help string,
	values []namedCacheStats,
	selectValue func(CacheStats) uint64,
) {
	writeMetricHeader(output, name, help, "counter")
	for _, value := range values {
		fmt.Fprintf(
			output,
			"%s{cache=%s} %d\n",
			name,
			strconv.Quote(string(value.cache)),
			selectValue(value.stats),
		)
	}
}

func writeUpdateStatusMetrics(
	output *bytes.Buffer,
	status UpdateStatusSnapshot,
	configured bool,
	valid bool,
) {
	writeMetricHeader(
		output,
		"bgmss_updater_status_configured",
		"Whether a read-only updater status source is configured.",
		"gauge",
	)
	fmt.Fprintf(
		output,
		"bgmss_updater_status_configured %d\n",
		boolMetric(configured),
	)
	writeMetricHeader(
		output,
		"bgmss_updater_status_valid",
		"Whether the current updater status source is valid.",
		"gauge",
	)
	fmt.Fprintf(
		output,
		"bgmss_updater_status_valid %d\n",
		boolMetric(valid),
	)
	if !valid {
		return
	}
	writeUpdateTerminalMetrics(output, "last_attempt", status.LastAttempt)
	if status.LastSuccess != nil {
		writeUpdateTerminalMetrics(output, "last_success", *status.LastSuccess)
	}
}

func writeUpdateTerminalMetrics(
	output *bytes.Buffer,
	prefix string,
	terminal UpdateTerminalSnapshot,
) {
	infoName := "bgmss_updater_" + prefix + "_info"
	writeMetricHeader(
		output,
		infoName,
		"Closed updater terminal status and phase.",
		"gauge",
	)
	fmt.Fprintf(
		output,
		"%s{phase=%s,status=%s} 1\n",
		infoName,
		strconv.Quote(string(terminal.Phase)),
		strconv.Quote(string(terminal.Status)),
	)
	timeName := "bgmss_updater_" + prefix + "_time_seconds"
	writeMetricHeader(
		output,
		timeName,
		"Updater terminal time in Unix seconds.",
		"gauge",
	)
	fmt.Fprintf(
		output,
		"%s %s\n",
		timeName,
		formatFloat(
			float64(terminal.Time.Unix())+
				float64(terminal.Time.Nanosecond())/float64(time.Second),
		),
	)
	durationName := "bgmss_updater_" + prefix + "_duration_seconds"
	writeMetricHeader(
		output,
		durationName,
		"Updater terminal duration in seconds.",
		"gauge",
	)
	fmt.Fprintf(
		output,
		"%s %s\n",
		durationName,
		formatFloat(terminal.DurationSeconds),
	)
}

func writeMetricHeader(output *bytes.Buffer, name, help, metricType string) {
	fmt.Fprintf(output, "# HELP %s %s\n", name, help)
	fmt.Fprintf(output, "# TYPE %s %s\n", name, metricType)
}

func dependencyLabels(key dependencyKey) string {
	return fmt.Sprintf(
		"outcome=%s,upstream=%s",
		strconv.Quote(string(key.Outcome)),
		strconv.Quote(string(key.Upstream)),
	)
}

func writeHistogram(output *bytes.Buffer, name, labels string, value histogram, bounds []float64) {
	for index, bound := range bounds {
		fmt.Fprintf(
			output,
			"%s_bucket{%s,le=%s} %d\n",
			name,
			labels,
			strconv.Quote(formatFloat(bound)),
			value.buckets[index],
		)
	}
	fmt.Fprintf(output, "%s_bucket{%s,le=\"+Inf\"} %d\n", name, labels, value.count)
	fmt.Fprintf(output, "%s_sum{%s} %s\n", name, labels, formatFloat(value.sum))
	fmt.Fprintf(output, "%s_count{%s} %d\n", name, labels, value.count)
}

func requestLabels(key requestKey) string {
	return fmt.Sprintf(
		"method=%s,operation=%s,outcome=%s,route=%s,status_class=%s",
		strconv.Quote(string(key.Method)),
		strconv.Quote(string(key.Operation)),
		strconv.Quote(string(key.Outcome)),
		strconv.Quote(string(key.Route)),
		strconv.Quote(string(key.StatusClass)),
	)
}

func requestKeyString(key requestKey) string {
	return strings.Join([]string{
		string(key.Method),
		string(key.Operation),
		string(key.Outcome),
		string(key.Route),
		string(key.StatusClass),
	}, "\x00")
}

func formatFloat(value float64) string {
	return strconv.FormatFloat(value, 'g', -1, 64)
}

func boolMetric(value bool) int {
	if value {
		return 1
	}
	return 0
}
