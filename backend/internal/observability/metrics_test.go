package observability

import (
	"math"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestMetricsRenderIsDeterministicParseableAndConsistent(t *testing.T) {
	registry, err := NewRegistry(BuildInfo{Version: "v1.2.3", Commit: "abcdef"})
	if err != nil {
		t.Fatal(err)
	}
	registry.SetLive(true)
	dataVersion := "dv1-" + strings.Repeat("a", 64)
	if err := registry.SetReadiness(true, dataVersion); err != nil {
		t.Fatal(err)
	}
	observation := RequestObservation{
		Route:         RouteReadyz,
		Operation:     OperationHealth,
		Method:        MethodGET,
		StatusClass:   Status2xx,
		Outcome:       OutcomeSuccess,
		Duration:      25 * time.Millisecond,
		ResponseBytes: 128,
	}
	if err := registry.ObserveRequest(observation); err != nil {
		t.Fatal(err)
	}
	if err := registry.ObserveRequest(observation); err != nil {
		t.Fatal(err)
	}

	first, err := registry.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	second, err := registry.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	if string(first) != string(second) {
		t.Fatal("unchanged metric snapshot is not deterministic")
	}
	if !strings.HasSuffix(string(first), "\n") {
		t.Fatal("exposition has no final newline")
	}
	assertPrometheusText(t, string(first))
	if !strings.Contains(string(first), `bgmss_http_requests_total{method="GET",operation="health",outcome="success",route="readyz",status_class="2xx"} 2`) {
		t.Fatalf("request counter missing:\n%s", first)
	}
	if !strings.Contains(string(first), `bgmss_http_request_duration_seconds_count{method="GET",operation="health",outcome="success",route="readyz",status_class="2xx"} 2`) {
		t.Fatal("duration histogram count mismatch")
	}
	if !strings.Contains(string(first), `bgmss_http_response_size_bytes_count{method="GET",operation="health",outcome="success",route="readyz",status_class="2xx"} 2`) {
		t.Fatal("size histogram count mismatch")
	}
	assertCumulativeBuckets(t, string(first), "bgmss_http_request_duration_seconds_bucket")
	assertCumulativeBuckets(t, string(first), "bgmss_http_response_size_bytes_bucket")
	if strings.Count(string(first), dataVersion) != 1 {
		t.Fatalf("dataVersion count = %d", strings.Count(string(first), dataVersion))
	}
	for _, forbidden := range []string{"request_id", "uid=", "raw_path", "query_digest", "entity="} {
		if strings.Contains(string(first), forbidden) {
			t.Fatalf("forbidden label %q found", forbidden)
		}
	}
}

func TestMetricsReplaceAndRemoveCurrentSnapshot(t *testing.T) {
	registry, err := NewRegistry(BuildInfo{})
	if err != nil {
		t.Fatal(err)
	}
	firstVersion := "dv1-" + strings.Repeat("1", 64)
	secondVersion := "dv1-" + strings.Repeat("2", 64)
	if err := registry.SetReadiness(true, firstVersion); err != nil {
		t.Fatal(err)
	}
	if err := registry.SetReadiness(true, secondVersion); err != nil {
		t.Fatal(err)
	}
	rendered, err := registry.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(rendered), firstVersion) || strings.Count(string(rendered), secondVersion) != 1 {
		t.Fatalf("snapshot history accumulated:\n%s", rendered)
	}
	if err := registry.SetReadiness(false, firstVersion); err != nil {
		t.Fatal(err)
	}
	rendered, err = registry.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(rendered), secondVersion) ||
		!strings.Contains(string(rendered), "bgmss_readiness 0") {
		t.Fatalf("cleared snapshot remains:\n%s", rendered)
	}
}

func TestMetricsRejectArbitraryDimensionsAndInvalidUnits(t *testing.T) {
	if _, err := NewRegistry(BuildInfo{Version: "bad\nvalue", Commit: "safe"}); err == nil {
		t.Fatal("registry accepted control character in build fact")
	}
	registry, err := NewRegistry(BuildInfo{})
	if err != nil {
		t.Fatal(err)
	}
	testCases := []RequestObservation{
		{Route: Route("raw-user-path"), Operation: OperationUnknown, Method: MethodGET, StatusClass: Status2xx, Outcome: OutcomeSuccess},
		{Route: RouteLivez, Operation: Operation("user-value"), Method: MethodGET, StatusClass: Status2xx, Outcome: OutcomeSuccess},
		{Route: RouteLivez, Operation: OperationHealth, Method: Method("POST /secret"), StatusClass: Status2xx, Outcome: OutcomeSuccess},
		{Route: RouteLivez, Operation: OperationHealth, Method: MethodGET, StatusClass: StatusNone, Outcome: OutcomeSuccess},
		{Route: RouteLivez, Operation: OperationHealth, Method: MethodGET, StatusClass: Status2xx, Outcome: Outcome("uid-1")},
		{Route: RouteLivez, Operation: OperationHealth, Method: MethodGET, StatusClass: Status2xx, Outcome: OutcomeSuccess, Duration: -1},
		{Route: RouteLivez, Operation: OperationHealth, Method: MethodGET, StatusClass: Status2xx, Outcome: OutcomeSuccess, ResponseBytes: -1},
	}
	for _, observation := range testCases {
		if err := registry.ObserveRequest(observation); err == nil {
			t.Fatalf("accepted invalid observation: %#v", observation)
		}
	}
	if err := registry.SetReadiness(true, "attacker-data-version"); err == nil {
		t.Fatal("accepted arbitrary snapshot label")
	}
	rendered, err := registry.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"raw-user-path", "user-value", "secret", "uid-1", "attacker-data-version"} {
		if strings.Contains(string(rendered), forbidden) {
			t.Fatalf("invalid value %q reached exposition", forbidden)
		}
	}
}

func TestMetricRequestSeriesCardinalityIsFixed(t *testing.T) {
	registry, err := NewRegistry(BuildInfo{})
	if err != nil {
		t.Fatal(err)
	}
	routes := []struct {
		route     Route
		operation Operation
	}{
		{route: RouteLivez, operation: OperationHealth},
		{route: RouteReadyz, operation: OperationHealth},
		{route: RouteMetrics, operation: OperationMetrics},
		{route: RouteUnknown, operation: OperationUnknown},
	}
	methods := []Method{MethodGET, MethodOther}
	statusClasses := []StatusClass{StatusNone, Status2xx, Status3xx, Status4xx, Status5xx}
	outcomes := []Outcome{
		OutcomeSuccess,
		OutcomeRejected,
		OutcomeError,
		OutcomeTimeout,
		OutcomeCanceled,
		OutcomePanic,
	}

	wantSeries := 0
	for _, route := range routes {
		for _, method := range methods {
			for _, statusClass := range statusClasses {
				for _, outcome := range outcomes {
					observation := RequestObservation{
						Route:       route.route,
						Operation:   route.operation,
						Method:      method,
						StatusClass: statusClass,
						Outcome:     outcome,
					}
					err := registry.ObserveRequest(observation)
					if statusClass == StatusNone && outcome != OutcomeCanceled {
						if err == nil {
							t.Fatalf("accepted reserved none status: %#v", observation)
						}
						continue
					}
					if err != nil {
						t.Fatalf("fixed observation %#v: %v", observation, err)
					}
					wantSeries++
				}
			}
		}
	}

	rendered, err := registry.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	gotSeries := 0
	for _, line := range strings.Split(string(rendered), "\n") {
		if strings.HasPrefix(line, "bgmss_http_requests_total{") {
			gotSeries++
		}
	}
	if gotSeries != wantSeries || gotSeries != 200 {
		t.Fatalf("request series = %d, want fixed %d", gotSeries, wantSeries)
	}
}

func TestMetricsConcurrentObservationReadinessAndScrape(t *testing.T) {
	registry, err := NewRegistry(BuildInfo{})
	if err != nil {
		t.Fatal(err)
	}
	versions := []string{
		"dv1-" + strings.Repeat("a", 64),
		"dv1-" + strings.Repeat("b", 64),
	}
	errs := make(chan error, 64)
	var workers sync.WaitGroup
	for worker := 0; worker < 8; worker++ {
		workers.Add(1)
		go func(worker int) {
			defer workers.Done()
			for index := 0; index < 200; index++ {
				if err := registry.ObserveRequest(RequestObservation{
					Route:         RouteMetrics,
					Operation:     OperationMetrics,
					Method:        MethodGET,
					StatusClass:   Status2xx,
					Outcome:       OutcomeSuccess,
					Duration:      time.Duration(index+1) * time.Microsecond,
					ResponseBytes: int64(index),
				}); err != nil {
					errs <- err
					return
				}
				if worker%2 == 0 {
					if err := registry.SetReadiness(true, versions[index%len(versions)]); err != nil {
						errs <- err
						return
					}
				} else {
					_ = registry.SetReadiness(false, "")
				}
				if _, err := registry.RenderPrometheus(); err != nil {
					errs <- err
					return
				}
			}
		}(worker)
	}
	workers.Wait()
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}
	rendered, err := registry.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	assertPrometheusText(t, string(rendered))
}

func assertPrometheusText(t *testing.T, rendered string) {
	t.Helper()
	help := make(map[string]struct{})
	types := make(map[string]struct{})
	for lineNumber, line := range strings.Split(strings.TrimSuffix(rendered, "\n"), "\n") {
		if strings.HasPrefix(line, "# HELP ") {
			fields := strings.Fields(line)
			if len(fields) < 4 {
				t.Fatalf("line %d invalid HELP: %q", lineNumber+1, line)
			}
			if _, exists := help[fields[2]]; exists {
				t.Fatalf("duplicate HELP for %s", fields[2])
			}
			help[fields[2]] = struct{}{}
			continue
		}
		if strings.HasPrefix(line, "# TYPE ") {
			fields := strings.Fields(line)
			if len(fields) != 4 {
				t.Fatalf("line %d invalid TYPE: %q", lineNumber+1, line)
			}
			if _, exists := types[fields[2]]; exists {
				t.Fatalf("duplicate TYPE for %s", fields[2])
			}
			types[fields[2]] = struct{}{}
			continue
		}
		separator := strings.LastIndexByte(line, ' ')
		if separator <= 0 || separator == len(line)-1 {
			t.Fatalf("line %d invalid sample: %q", lineNumber+1, line)
		}
		value, err := strconv.ParseFloat(line[separator+1:], 64)
		if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
			t.Fatalf("line %d invalid numeric sample: %q", lineNumber+1, line)
		}
	}
	for name := range help {
		if _, exists := types[name]; !exists {
			t.Fatalf("metric %s has HELP without TYPE", name)
		}
	}
	for name := range types {
		if _, exists := help[name]; !exists {
			t.Fatalf("metric %s has TYPE without HELP", name)
		}
	}
}

func assertCumulativeBuckets(t *testing.T, rendered, prefix string) {
	t.Helper()
	var previous float64 = -1
	var found int
	for _, line := range strings.Split(rendered, "\n") {
		if !strings.HasPrefix(line, prefix+"{") {
			continue
		}
		separator := strings.LastIndexByte(line, ' ')
		value, err := strconv.ParseFloat(line[separator+1:], 64)
		if err != nil {
			t.Fatal(err)
		}
		if value < previous {
			t.Fatalf("histogram bucket decreased from %v to %v", previous, value)
		}
		previous = value
		found++
	}
	if found < 2 {
		t.Fatalf("no histogram buckets for %s", prefix)
	}
}
