## Capability Boundary

- **Status:** local latency-only delta.
- **Owner:** Backend statistics.
- **Writable paths:** statistics source/tests, app warmup, this change/root spec.
- **Read-only protected inputs:** formulas/contracts/Archive/other components/external state.
- **Deletion complement:** no formula/query/gate/test deletion or admission restoration.
- **Mutable refs:** current local worktree only.
- **Consumes:** immutable Store/dataVersion and caller context.
- **Produces:** shared immutable process-lifetime SeriesIndex.
- **Dependencies:** stdlib synchronization only.
- **Deliverables:** focused tests and real timing.
- **Acceptance:** coalesced success, retryable failure, nonblocking readiness, identical results.
- **Non-goals:** other caches/wire/timeouts/dependencies/deployment.
- **Operations deferred:** full gate and lifecycle batch.
- **Stop/rollback conditions:** race/leak/memory/result/readiness/timing regression.

## MODIFIED Requirements

### Requirement: Evaluation SHALL be bounded, cancelable, deterministic, and dependency-clean

The statistics package SHALL consume immutable typed inputs and SHALL import no
HTTP, generated wire, collection-client, frontend, or updater package. It SHALL
perform no write-capable SQL, network access, or filesystem mutation. Long
component, aggregation, distribution, evidence, and sorting loops SHALL observe
caller cancellation and return no partial result.

The process MAY publish one immutable SeriesIndex per exact Archive Store in a
concurrency-safe cache because the Store is single-assignment and process-bound.
Sequential and concurrent callers SHALL receive the same completed index;
failure or cancellation SHALL publish no cache value and a later caller SHALL
retry. A context-bound background warmup MAY start only after readiness
publication and SHALL not delay/change readiness, restore Archive admission,
or survive process cancellation. Work and memory SHALL be characterized without
claiming an unmeasured production SLO.

Identical canonical inputs SHALL produce identical canonical outputs under
repeated, shuffled, fuzz/property, concurrent, and race-enabled execution.

#### Scenario: Evaluation is canceled

- **WHEN** cancellation occurs during a first index load or another major phase
- **THEN** the call SHALL return stable cancellation, publish no partial cache
  value, leak no goroutine, and allow a later successful retry

#### Scenario: Concurrent operations need series data

- **WHEN** ranking, person detail, or another operation requests the same
  Store-bound SeriesIndex concurrently or sequentially
- **THEN** one successful immutable index SHALL be shared and later operations
  SHALL not repeat the complete subject/relation scan

#### Scenario: Full Backend gates run

- **WHEN** the later batched targeted, race, vet, build, architecture,
  dependency, and check-script gates run
- **THEN** all SHALL pass with deterministic output and no undeclared mutation
