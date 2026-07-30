## MODIFIED Requirements

### Requirement: Events SHALL be structured, allowlisted, and non-duplicative

Events SHALL be one-line JSON with fixed event/channel names and typed
constructors. App lifecycle/readiness events MAY contain request ID, fixed
phase, stable error code, duration/count, build, and snapshot facts. Every
Archive startup-load error SHALL emit exactly one `archive_load_failed` event
on channel `app` with phase `startup` and only the stable consumer error code,
or `INTERNAL_ERROR` for an untyped failure. That event SHALL contain no Archive
root/path/content, manifest/SQLite value, dataVersion, raw error, request, or
user field.

`query_completed` and `query_rejected` SHALL be mutually exclusive per typed
business request; health/metrics scrapes SHALL emit neither. A completed query
MAY add only closed scope, result-cache outcome, collection-cache outcome, and
the fixed `collection/cache/sqlite/compute/projection` duration fields from the
same frozen observation used for metrics and `Server-Timing`. Non-applicable
facts SHALL use a fixed `not_applicable` value. No event SHALL contain raw
body/URL/query/IP/header/Cookie, Authorization/token, UID, search/tag/entity/
collection value, query or input digest, SQL, upstream body, response entities,
arbitrary field name/value, raw error, cache key/value, or filesystem path.

Each completed image request MAY emit exactly one `image_proxy_completed` app
event containing only request ID, fixed operation, closed outcome, status,
duration, and response-byte count. Degraded health serving SHALL begin only
after the event sink accepts one complete line. A failed or short event write
SHALL fail startup or remain non-critical after serving has begun; partial
output SHALL never be claimed as an emitted event.

#### Scenario: A typed query completes

- **WHEN** a business query reaches one terminal outcome with a frozen timing
  trace
- **THEN** exactly one completion or rejection event contains only fixed
  operation/status facts and the closed execution fields
- **AND** no submitted/effective query, identity, digest, SQL, URL, path, raw
  error, cache value, or request-controlled field is present

#### Scenario: Sensitive and attacker-controlled inputs are offered

- **WHEN** tests provide credentials, UID, raw errors, upstream content,
  unknown field paths, control characters, query values, digests, and cache
  keys
- **THEN** constructors reject or omit them, output remains valid single-line
  JSON, and only stable allowlisted fields remain

#### Scenario: Archive loading fails before serving

- **WHEN** the one startup Archive load returns a typed consumer failure, an
  untyped failure, or context cancellation
- **THEN** exactly one bounded `archive_load_failed` app/startup event SHALL be
  emitted with the stable code or `INTERNAL_ERROR`
- **AND** the event SHALL reveal no Archive identity, path, content, raw error,
  request, or user input

#### Scenario: Archive failure event cannot be written

- **WHEN** the startup event writer fails or accepts fewer than the complete
  one-line event bytes
- **THEN** startup SHALL propagate the operational error, close the owned
  Archive state, and never enter `Serve`

#### Scenario: An image request completes

- **WHEN** an accepted or rejected image request reaches a terminal outcome
- **THEN** at most one `image_proxy_completed` event SHALL contain only the
  closed bounded terminal facts and no image identity or upstream detail

### Requirement: Metrics SHALL use fixed low-cardinality dimensions and units

The typed registry SHALL concurrently expose HTTP count/duration/response
bytes; liveness/readiness; Go/process/build/current-snapshot facts; fixed query
phase histograms; one process executor snapshot; collection-positive,
collection-negative, and result-cache state/counters; fixed SQLite and
collection/image upstream outcomes; and optional updater terminal status.

Route, method, status class, operation, outcome, phase, cache, upstream, updater
status, and updater phase labels SHALL be closed enums. Request ID, raw path,
UID, entity/image identity or type, search/tag, data/query/input/archive/
collection digest, query, error code/text, SQL, cache key/value, upstream value,
and filesystem path SHALL never be labels. dataVersion SHALL appear only on the
one current-snapshot info series. Durations SHALL use seconds and capacities/
sizes bytes with matching names.

One scrape SHALL sample `QueryRuntime.Stats()` exactly once. It SHALL NOT sum
the five service/store aliases. Current occupancy, item count, and retained
bytes SHALL be gauges; cumulative admissions, rejections, hits, misses,
publications, replacements, evictions, oversize values, and deletes SHALL be
counters.

#### Scenario: Concurrent queries and scrapes run

- **WHEN** fixed routes, query phases, cache/upstream outcomes, readiness
  transitions, cancellations, updater-file replacement, and `/metrics` scrapes
  execute concurrently under the race detector
- **THEN** counters are monotonic, histograms internally agree, exposition is
  parseable and deterministic, resource totals are not multiplied, and label
  series stay within the fixed inventory

#### Scenario: Concurrent requests and a scrape run

- **WHEN** fixed routes including image, unknown paths, readiness transitions,
  cancellations, and `/metrics` scrapes execute concurrently under the race
  detector
- **THEN** counters are monotonic, histograms internally agree, exposition is
  parseable and deterministic, and label series stay within the fixed inventory

### Requirement: Metrics exposition SHALL be safe and non-critical

Exact `GET /metrics` SHALL return Prometheus text exposition with the correct
content type, HELP/TYPE declarations, finite numeric samples, final newline,
`no-store`, and generated request-ID header. Rendering SHALL use bounded
snapshots and SHALL NOT query Archive. Runtime-stat collection SHALL happen
once per scrape; an optional updater-status read SHALL be capped at 64 KiB and
confined to the metrics request. Any observability, stats-provider, or
updater-status failure SHALL leave ordinary API routes available.

#### Scenario: Metrics are scraped while dependencies are unavailable

- **WHEN** Archive readiness is false, the runtime stats provider fails, or the
  optional updater status is missing/malformed/unreadable
- **THEN** `/metrics` remains parseable, reports bounded validity/readiness
  state without sensitive detail, emits no query event, and ordinary routes do
  not depend on that observability failure

#### Scenario: Metrics are scraped while readiness is false

- **WHEN** no Archive store is published or its readiness probe fails
- **THEN** `/metrics` remains 200, reports readiness 0 without snapshot
  identity, and emits no query log or Archive validation

## ADDED Requirements

### Requirement: Query timing SHALL have one header and histogram authority

Typed business requests SHALL recognize only `collection`, `cache`, `sqlite`,
`compute`, and `projection`. Present durations SHALL be finite, non-negative,
expressed as milliseconds in a deterministic `Server-Timing` response header,
and expressed as seconds in same-phase histograms. The trace SHALL freeze before
the first response commitment; later observations SHALL not mutate the header
or submitted metric observation. Missing phases SHALL be omitted. Header
descriptions and values SHALL contain no identifier, key, digest, query, SQL,
URL, cache value, upstream value, or arbitrary text.

#### Scenario: A query response commits

- **WHEN** a typed query succeeds or commits a bounded error after recording
  one or more fixed phases
- **THEN** the response header and the one histogram observation use the exact
  same frozen phase durations in fixed order
- **AND** unknown, negative, non-finite, or late values are rejected or ignored
  without changing the response body

### Requirement: Updater status SHALL be consumed read-only and fail closed

An explicitly configured updater-status source SHALL be an absolute,
non-symlink regular file named `update-status.json`. The reader SHALL cap the
file at 64 KiB, reject duplicate or unknown JSON fields, and validate the exact
v1 last-attempt/last-success status, phase, UTC time, duration, dataVersion, and
error-code relationships. It SHALL expose only validity, closed status/phase,
attempt/success Unix time, and duration metrics. It SHALL never expose
dataVersion or error code as a label and SHALL never write, rename, delete,
repair, or activate updater state.

#### Scenario: Updater status changes or is invalid

- **WHEN** a valid file is atomically replaced, absent, malformed, oversized,
  symlinked, or otherwise unreadable
- **THEN** the next scrape reflects only bounded validity and valid closed
  terminal facts, never retains attacker-controlled fields, and never affects
  API readiness or serving

## MODIFIED Requirements

### Requirement: Observability SHALL remain development instrumentation

No event named `update_activated`, updater status writer, monitoring agent,
remote exporter, scrape configuration, dashboard, alert, retention rule, SLO,
pprof exposure, production endpoint exposure, release, deploy, cutover, or
activation SHALL be created by this change. A bounded read-only consumer of the
already authoritative `update-status.json` is permitted.

#### Scenario: Development observability is accepted

- **WHEN** allowlist/redaction/cardinality/unit/header/reader/concurrency/race/
  full and strict OpenSpec gates pass
- **THEN** only in-process instrumentation and local route behavior SHALL be
  claimed, with no deployment or external-state mutation

#### Scenario: Observability is accepted

- **WHEN** allowlist/redaction/cardinality/unit/parse/concurrency/race/full and
  strict OpenSpec gates pass
- **THEN** only in-process instrumentation and local route behavior SHALL be
  claimed, with no deployment or external-state mutation
