## Capability Boundary

- **Status:** Intentional local-development delta; not committed, pushed,
  released, or deployed.
- **Owner:** Backend in-process observability.
- **Writable paths:** `backend/internal/observability/**`, exact app/httpapi
  observability wiring, and their focused tests.
- **Read-only protected inputs:** Product/query/public API semantics, Archive
  bytes and contract values, user/collection data, filesystem paths, unrelated
  worktrees, remotes, hosts, and production telemetry.
- **Deletion complement:** Only the obsolete Backend read-only
  `update-status.json` reader and its exact focused tests/config option may be
  removed here; contract and operations removal belong to their owner deltas.
- **Mutable refs:** Local `codex/embed-go-archive-builder` only.
- **Consumes:** In-process scheduler/builder snapshots, readiness/current Store
  identity, existing event sink, and existing Prometheus registry.
- **Produces:** Bounded Archive-update events and low-cardinality in-process
  current/last update metrics without a status-file handoff.
- **Dependencies:** `backend-archive-builder`, `backend-runtime-foundation`,
  existing event/metrics redaction contracts, and current snapshot metrics.
- **Deliverables:** Typed event constructors, one concurrency-safe update
  snapshot provider, metrics exposition, and focused race/redaction tests.
- **Acceptance:** One start and one terminal event per run; metrics expose only
  closed states/phases/times; no status-file read; query/image/health behavior
  remains independent of instrumentation failure.
- **Non-goals:** Status history, job dashboard, remote exporter, alerting,
  tracing, pprof, dataVersion/error/path labels, persistent queue, or product UI.
- **Operations deferred:** Scrape configuration, dashboards, alerts, retention,
  release, deployment, real scheduled runs, and production activation remain
  separately authorized.
- **Stop/rollback conditions:** Stop on attacker-controlled labels/events,
  unbounded history/cardinality, readiness dependence on observability, races,
  overlapping edits, or focused parse/redaction failure. Repository rollback
  is parent `411f54b`.

## MODIFIED Requirements

### Requirement: Events SHALL be structured, allowlisted, and non-duplicative

Events SHALL be one-line JSON with fixed event/channel names and typed
constructors. App lifecycle/readiness events MAY contain request ID, fixed
phase, stable error code, duration/count, build, and current snapshot facts.
Every startup Archive-open error SHALL emit exactly one
`archive_load_failed` event on channel `app` with phase `startup` and only the
stable consumer code or `INTERNAL_ERROR`.

Each embedded Archive run SHALL emit exactly one `archive_update_started` and
exactly one mutually exclusive terminal event from
`archive_update_no_change`, `archive_update_activated`, or
`archive_update_failed`. These events MAY contain only a generated bounded run
ID, fixed phase/status, stable error code when failed, duration, and bounded
source/build counts. They SHALL NOT contain dataVersion, Archive release/digest,
URL, path, filename, manifest/SQLite content, raw error, source record, query,
request, or user field. The current dataVersion remains available only through
readiness/current-snapshot observability.

`query_completed` and `query_rejected` SHALL remain mutually exclusive per
typed business request; health/metrics scrapes SHALL emit neither. Completed
query and image events SHALL retain their existing closed fields and redaction.
No event SHALL contain raw body/URL/query/IP/header/Cookie,
Authorization/token, UID, search/tag/entity/collection value, query/input
digest, SQL, upstream body, response entities, arbitrary field name/value, raw
error, cache key/value, or filesystem path.

Mandatory pre-serve startup event failure SHALL still fail startup. After
serving begins, update-event or other observability write failure SHALL remain
non-critical to serving and SHALL never be treated as a successfully emitted
partial event.

#### Scenario: A typed query or image request completes

- **WHEN** one existing typed request reaches a terminal outcome
- **THEN** its existing one-event, fixed-field, redaction, and non-duplication
  behavior SHALL remain unchanged

#### Scenario: An Archive refresh activates

- **WHEN** one run starts, builds a candidate, and atomically activates it
- **THEN** exactly one start and one activated terminal event SHALL be emitted
  with only bounded run/phase/status/duration/count facts and no dataVersion,
  path, URL, digest, raw error, or record content

#### Scenario: An Archive refresh fails or has no change

- **WHEN** one run ends before activation or finds the current source unchanged
- **THEN** exactly one failed or no-change terminal event SHALL follow its start
  event and SHALL reveal only the applicable stable closed facts

#### Scenario: Sensitive update inputs are offered

- **WHEN** constructors receive URLs, paths, source values, manifest/SQLite
  values, dataVersion, credentials, user data, control characters, or raw errors
- **THEN** they SHALL reject or omit them and emit only valid single-line JSON
  from the fixed allowlist

#### Scenario: An update event cannot be written after serving begins

- **WHEN** the sink fails or short-writes an embedded-update event
- **THEN** the run outcome and current Store SHALL remain governed by the
  builder/app result, partial output SHALL not be claimed, and API serving SHALL
  remain available

### Requirement: Metrics SHALL use fixed low-cardinality dimensions and units

The typed registry SHALL concurrently expose the existing HTTP,
liveness/readiness, Go/process/build/current-snapshot, fixed query phase,
executor, cache, SQLite, collection, and image families plus one in-process
Archive-update snapshot. It SHALL no longer read an updater status file.

Route, method, status class, operation, outcome, phase, cache, upstream, update
status, and update phase labels SHALL be closed enums. Request ID, run ID, raw
path, UID, entity/image identity or type, search/tag, data/query/input/archive/
collection digest, query, error code/text, SQL, cache key/value, upstream value,
URL, and filesystem path SHALL never be labels. dataVersion SHALL appear only
on the one current-snapshot info series. Durations SHALL use seconds and
capacities/sizes bytes with matching names.

One scrape SHALL sample `QueryRuntime.Stats()` exactly once and the embedded
update snapshot exactly once. It SHALL NOT sum service/store aliases. Current
occupancy, item count, retained bytes, and update-running state SHALL be gauges;
cumulative admissions/rejections/cache counters SHALL remain counters. Update
last-attempt/last-success time and duration SHALL be bounded gauges with fixed
terminal status/phase information, not an event history.

#### Scenario: Queries, update transitions, and scrapes run concurrently

- **WHEN** fixed requests, readiness transitions, one embedded update, cache
  activity, cancellations, and `/metrics` scrapes execute under the race
  detector
- **THEN** exposition SHALL remain parseable/deterministic, counters monotonic,
  resource totals single-sampled, update state internally coherent, and label
  series within the fixed inventory

#### Scenario: Update metadata is offered as labels

- **WHEN** metrics code receives run ID, dataVersion, release/digest, path, URL,
  record count categories outside the fixed families, or error details
- **THEN** those values SHALL be unrepresentable as labels and cardinality SHALL
  remain bounded

### Requirement: Metrics exposition SHALL be safe and non-critical

Exact `GET /metrics` SHALL return Prometheus text exposition with the correct
content type, HELP/TYPE declarations, finite numeric samples, final newline,
`no-store`, and generated request-ID header. Rendering SHALL use bounded
in-memory snapshots and SHALL NOT query Archive, read `update-status.json`, or
touch the filesystem. Runtime stats and embedded update state SHALL each be
sampled once per scrape. Any observability or stats-provider failure SHALL
leave ordinary API routes and Archive refresh behavior available.

#### Scenario: Metrics are scraped during build or degraded readiness

- **WHEN** no Store is ready, an update is running/fails, or a stats provider is
  temporarily invalid
- **THEN** `/metrics` SHALL remain parseable, report only bounded validity,
  readiness, and closed update state, emit no query event, and not affect API or
  builder execution

#### Scenario: No status file exists

- **WHEN** the Backend runs after the cross-process updater-status handoff is
  removed
- **THEN** metrics SHALL expose in-process update state without opening,
  requiring, or reporting validity for any `update-status.json` path

### Requirement: Observability SHALL remain development instrumentation

This change MAY add the bounded in-process Archive-update events and metrics
defined above. It SHALL NOT create a status-file writer/reader, event history,
monitoring agent, remote exporter, scrape configuration, dashboard, alert,
retention rule, SLO, pprof exposure, public metrics route, release, deploy,
cutover, host scheduler, or production activation. Instrumentation SHALL not
authorize a run, decide activation, or change readiness independently of the
Backend scheduler/app state.

#### Scenario: Embedded update observability is accepted

- **WHEN** allowlist, redaction, cardinality, unit, parse, concurrency, race,
  focused, and strict OpenSpec checks pass
- **THEN** only local in-process events/metrics SHALL be claimed, with no
  filesystem handoff, remote sink, deployment, or external-state mutation

## ADDED Requirements

### Requirement: Embedded update state SHALL be bounded and in-process

The Backend SHALL own one concurrency-safe snapshot containing only whether a
run is active, its closed current phase, and at most one last-attempt and one
last-success terminal record. A terminal record SHALL contain only UTC time,
closed status, closed phase, and finite non-negative duration. Publication of a
new attempt SHALL atomically replace the previous attempt; no list, per-run map,
raw error, dataVersion, path, URL, digest, source value, or persisted history
SHALL be retained.

The scheduler/builder SHALL update this snapshot directly in process. Failure
to sample or expose it SHALL not change the Archive run, current Store, API
readiness, or request availability.

#### Scenario: One run advances through phases

- **WHEN** the embedded builder moves from freshness through acquisition,
  build, candidate-open, activation, cleanup, and one terminal status
- **THEN** concurrent readers SHALL observe only complete allowed snapshots and
  the final attempt SHALL replace the prior attempt without appending history

#### Scenario: A successful run follows a failure

- **WHEN** a failed last attempt is followed by an activated or no-change run
- **THEN** last-attempt SHALL identify the newer terminal outcome and
  last-success SHALL identify the newer successful outcome using only bounded
  time/status/phase/duration facts

#### Scenario: Snapshot publication fails internally

- **WHEN** an observability provider rejects an invalid phase/status/time or
  panics while sampled
- **THEN** the current scrape SHALL report invalid bounded state while serving,
  scheduling, activation, and readiness continue independently

## REMOVED Requirements

### Requirement: Updater status SHALL be consumed read-only and fail closed

**Reason:** The Python updater and cross-process `update-status.json` handoff
are removed; the scheduler and builder now execute inside the Backend process.

**Migration:** Replace the file reader, path option, file-validity metrics, and
status-file tests with the bounded in-process snapshot and tests specified
above. No compatibility reader or dual status source SHALL remain.
