## Context

`observability.Registry` already owns concurrency-safe HTTP metrics and
`QueryTerminal` enforces exactly one safe terminal event. The five services now
share one `runtimecache.QueryRuntime`, whose aggregate `Stats()` is the only
authoritative queue/cache snapshot. The updater writes a closed, bounded
`update-status.json` defined by the shared contract.

The accepted root observability specification is intentionally stricter than
the implementation guide's example query payload. This change therefore adds
only closed execution facts and never records submitted/effective queries,
identifiers, digests, SQL, paths, or arbitrary values.

## Decisions

### 1. One request-scoped typed timing trace

Add a leaf `internal/querytiming` package with closed phase and cache-outcome
types. Middleware attaches one trace only to typed business requests.
Runtime-cache and service boundaries add finite non-negative durations to that
trace; no package logs directly and no arbitrary phase name is accepted.

The response writer freezes the trace immediately before the first committed
header. The exact frozen phase values render a deterministic `Server-Timing`
header and are also submitted once to the registry after termination. Missing
phases are omitted; present phases follow the fixed order. This prevents a
header/metric split-brain and remains correct for errors, timeouts, and
short/failed writes.

### 2. Keep resource metrics pull-based and non-additive

The application owns the concrete `QueryRuntime`. It supplies
`RuntimeObservability` a typed closure that maps one `QueryRuntime.Stats()`
snapshot to observability-owned value types. A scrape invokes that closure once
and never asks the five services for alias statistics.

Queue occupancy and retained cache state are gauges; admissions, rejections,
hits, misses, publications, replacements, evictions, oversize values, and
deletes are cumulative counters. Cache labels are the closed values
`collection_positive`, `collection_negative`, and `result`.

### 3. Use closed request execution facts

Terminal query events may add only closed scope, result-cache outcome,
collection-cache outcome, and the five bounded phase durations. Catalog and
non-applicable facts use explicit `not_applicable`. No raw query/input,
identity, digest, count, SQL, URL, path, header, error text, or arbitrary map is
representable.

### 4. Read updater status defensively

The Go reader accepts only an explicitly configured absolute regular
`update-status.json`, rejects symlinks/non-regular files, caps reads at 64 KiB,
rejects duplicate/unknown fields, and validates the v1 closed status/phase/time/
duration/dataVersion/error-code relationships. Metrics expose only validity,
closed status/phase, attempt/success Unix time, and duration. The updater
dataVersion and error code are not labels.

Missing, malformed, replaced, or unreadable status affects only updater metric
validity and never API readiness or ordinary routes. The reader never writes,
renames, deletes, or repairs the file.

### 5. Preserve package direction

`querytiming` imports only the standard library. Query packages and
`runtimecache` may import it to observe work. `httpapi` maps its frozen snapshot
into `observability`; `observability` remains independent of domain/app/archive
packages. The app remains the sole composition owner.

## Non-Goals

- Distributed tracing, per-entity logs, dynamic labels, raw query logging, or
  collection contents.
- Prometheus server/client dependencies, remote exporters, pprof, dashboards,
  alerts, retention, or SLOs.
- Choosing the production status-file location or changing updater output.
- Changing API response bodies, query semantics, frontend visuals, or
  interactions.

## Migration

1. Add and test the leaf trace and registry/status primitives.
2. Instrument runtime cache, five services, and HTTP response commitment.
3. Wire exactly one runtime stats provider and the optional CLI status path.
4. Run focused, race, full Backend, strict-spec, and hygiene gates.

There is no deployed-state migration. Rollback before commit is limited to this
change's unstaged writable paths.
