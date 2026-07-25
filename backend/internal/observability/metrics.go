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

type histogram struct {
	count   uint64
	sum     float64
	buckets []uint64
}

// Registry owns the current bounded metric state.
type Registry struct {
	mu sync.RWMutex

	startedAt   time.Time
	build       BuildInfo
	live        bool
	ready       bool
	dataVersion string
	requests    map[requestKey]uint64
	durations   map[requestKey]*histogram
	sizes       map[requestKey]*histogram
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
		startedAt: time.Now(),
		build:     build,
		requests:  make(map[requestKey]uint64),
		durations: make(map[requestKey]*histogram),
		sizes:     make(map[requestKey]*histogram),
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

func observeHistogram(target map[requestKey]*histogram, key requestKey, value float64, bounds []float64) {
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
	startedAt   time.Time
	build       BuildInfo
	live        bool
	ready       bool
	dataVersion string
	requests    map[requestKey]uint64
	durations   map[requestKey]histogram
	sizes       map[requestKey]histogram
}

func (r *Registry) snapshot() (metricSnapshot, error) {
	if r == nil {
		return metricSnapshot{}, errors.New("observability: nil registry")
	}
	r.mu.RLock()
	defer r.mu.RUnlock()

	snapshot := metricSnapshot{
		startedAt:   r.startedAt,
		build:       r.build,
		live:        r.live,
		ready:       r.ready,
		dataVersion: r.dataVersion,
		requests:    make(map[requestKey]uint64, len(r.requests)),
		durations:   make(map[requestKey]histogram, len(r.durations)),
		sizes:       make(map[requestKey]histogram, len(r.sizes)),
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
		snapshot.sizes[key] = histogram{
			count:   value.count,
			sum:     value.sum,
			buckets: slices.Clone(value.buckets),
		}
	}
	return snapshot, nil
}

// RenderPrometheus renders one deterministic Prometheus text snapshot.
func (r *Registry) RenderPrometheus() ([]byte, error) {
	snapshot, err := r.snapshot()
	if err != nil {
		return nil, err
	}

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

func writeMetricHeader(output *bytes.Buffer, name, help, metricType string) {
	fmt.Fprintf(output, "# HELP %s %s\n", name, help)
	fmt.Fprintf(output, "# TYPE %s %s\n", name, metricType)
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
