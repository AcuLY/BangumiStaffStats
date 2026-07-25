package querytiming

import (
	"context"
	"errors"
	"math"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestTraceFreezesOneFiniteFixedOrderSnapshot(t *testing.T) {
	trace := New()
	ctx := WithContext(context.Background(), trace)
	if FromContext(ctx) != trace {
		t.Fatal("context did not retain trace identity")
	}
	if err := trace.SetScope(ScopePersonal); err != nil {
		t.Fatal(err)
	}
	if err := trace.SetResultCache(CacheMiss); err != nil {
		t.Fatal(err)
	}
	if err := trace.SetCollectionCache(CacheHit); err != nil {
		t.Fatal(err)
	}

	var group sync.WaitGroup
	for index := 0; index < 32; index++ {
		for _, phase := range phases {
			group.Add(1)
			go func(phase Phase) {
				defer group.Done()
				if err := trace.Add(phase, time.Millisecond); err != nil {
					t.Errorf("Add(%s): %v", phase, err)
				}
			}(phase)
		}
	}
	group.Wait()

	snapshot := trace.Freeze()
	observations := snapshot.Phases()
	if len(observations) != len(phases) {
		t.Fatalf("phases = %+v", observations)
	}
	for index, observation := range observations {
		if observation.Phase != phases[index] ||
			math.Abs(observation.Seconds-0.032) > 1e-12 {
			t.Fatalf("phase %d = %+v", index, observation)
		}
	}
	if snapshot.Scope() != ScopePersonal ||
		snapshot.ResultCache() != CacheMiss ||
		snapshot.CollectionCache() != CacheHit {
		t.Fatalf("closed facts = %q %q %q", snapshot.Scope(), snapshot.ResultCache(), snapshot.CollectionCache())
	}
	wantHeader := "collection;dur=32.000, cache;dur=32.000, sqlite;dur=32.000, compute;dur=32.000, projection;dur=32.000"
	if got := snapshot.ServerTiming(); got != wantHeader {
		t.Fatalf("Server-Timing = %q", got)
	}
	if repeated := trace.Freeze(); repeated != snapshot {
		t.Fatal("repeated freeze changed snapshot")
	}
	if err := trace.Add(PhaseCache, time.Millisecond); !errors.Is(err, ErrFrozen) {
		t.Fatalf("late observation = %v", err)
	}
	if trace.Freeze() != snapshot {
		t.Fatal("late observation changed frozen snapshot")
	}
}

func TestTraceRejectsUnknownNonFiniteAndOpenFacts(t *testing.T) {
	tests := []struct {
		name string
		call func(*Trace) error
	}{
		{name: "unknown phase", call: func(trace *Trace) error {
			return trace.Add(Phase("uid"), time.Millisecond)
		}},
		{name: "negative", call: func(trace *Trace) error {
			return trace.Add(PhaseCache, -time.Millisecond)
		}},
		{name: "nan", call: func(trace *Trace) error {
			return trace.AddSeconds(PhaseCache, math.NaN())
		}},
		{name: "infinite", call: func(trace *Trace) error {
			return trace.AddSeconds(PhaseCache, math.Inf(1))
		}},
		{name: "scope", call: func(trace *Trace) error {
			return trace.SetScope(Scope("alice"))
		}},
		{name: "result outcome", call: func(trace *Trace) error {
			return trace.SetResultCache(CacheOutcome("secret"))
		}},
		{name: "collection outcome", call: func(trace *Trace) error {
			return trace.SetCollectionCache(CacheOutcome("secret"))
		}},
		{name: "sqlite outcome", call: func(trace *Trace) error {
			return trace.ObserveSQLite(DependencyNetworkError, time.Millisecond)
		}},
		{name: "upstream outcome", call: func(trace *Trace) error {
			return trace.ObserveCollectionUpstream(
				DependencyOutcome("https://private"),
				time.Millisecond,
			)
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := test.call(New()); !errors.Is(err, ErrInvalidObservation) {
				t.Fatalf("error = %v", err)
			}
		})
	}
	if header := New().Freeze().ServerTiming(); header != "" {
		t.Fatalf("empty header = %q", header)
	}
	if strings.Contains(New().Freeze().ServerTiming(), "uid") {
		t.Fatal("header admitted arbitrary text")
	}
}

func TestTraceMergesOneImmutableWorkerExecution(t *testing.T) {
	worker := New()
	if err := worker.ObserveSQLite(
		DependencySuccess,
		7*time.Millisecond,
	); err != nil {
		t.Fatal(err)
	}
	if err := worker.Add(PhaseCompute, 11*time.Millisecond); err != nil {
		t.Fatal(err)
	}
	execution := worker.Freeze().Execution()
	if sqlite, present := execution.Phase(PhaseSQLite); !present ||
		math.Abs(sqlite-0.007) > 1e-12 ||
		execution.SQLiteOutcome() != DependencySuccess {
		t.Fatalf("SQLite execution = %f, %t, %q", sqlite, present, execution.SQLiteOutcome())
	}
	if _, present := execution.Phase(PhaseCache); present {
		t.Fatal("execution exposed a request-scoped phase")
	}

	first := New()
	second := New()
	if err := first.MergeExecution(execution); err != nil {
		t.Fatal(err)
	}
	if err := second.MergeExecution(execution); err != nil {
		t.Fatal(err)
	}
	if first.Freeze() != second.Freeze() {
		t.Fatal("same worker execution produced different request snapshots")
	}
	if err := first.MergeExecution(execution); !errors.Is(err, ErrFrozen) {
		t.Fatalf("late merge = %v", err)
	}
}
