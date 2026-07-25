# backend-observability Specification

## Purpose
Define allowlisted structured runtime events and concurrency-safe,
low-cardinality Prometheus metrics for the development HTTP runtime.
## Requirements
### Requirement: Events SHALL be structured, allowlisted, and non-duplicative

Events SHALL be one-line JSON with fixed event/channel names and typed
constructors. App lifecycle/readiness events MAY contain request ID, fixed
phase, stable error code, duration/count, build, and snapshot facts. Every
Archive startup-load error SHALL emit exactly one `archive_load_failed` event
on channel `app` with phase `startup` and only the stable consumer error code,
or `INTERNAL_ERROR` for an untyped failure. That event SHALL contain no
Archive root/path/content, manifest/SQLite value, dataVersion, raw error,
request, or user field. `query_completed` and `query_rejected` infrastructure
SHALL be mutually exclusive per typed business request; health/metrics scrapes
SHALL emit neither. Each completed image request MAY emit exactly one
`image_proxy_completed` app event containing only request ID, fixed operation,
closed outcome, status, duration, and response-byte count; it SHALL contain no
resource, entity ID, image type, URL, query, request/upstream header, or
upstream value. No event SHALL contain raw body/URL/query/IP/header/Cookie,
Authorization/token, UID, search/tag/entity/collection values, upstream body,
response entities, arbitrary field name/value, raw error, or cache value.
Degraded health serving SHALL begin only after the event sink accepts one
complete line. If the writer returns an error or short write, the application
SHALL close its owned Archive state, propagate that operational failure, and
return without serving; it SHALL NOT silently continue, retry within the same
process, or claim that a partial/failed write was an emitted event.

#### Scenario: Sensitive and attacker-controlled inputs are offered
- **WHEN** event tests provide credentials, UID, raw errors, upstream content, image identity, unknown field paths, control characters, and query values
- **THEN** constructors reject or omit them, output remains valid single-line JSON, and only stable allowlisted fields remain

#### Scenario: Archive loading fails before serving

- **WHEN** the one startup Archive load returns a typed consumer failure, an untyped failure, or context cancellation
- **THEN** exactly one bounded `archive_load_failed` app/startup event SHALL be emitted with the stable code or `INTERNAL_ERROR`
- **AND** the event SHALL reveal no Archive identity, path, content, raw error, request, or user input

#### Scenario: Archive failure event cannot be written

- **WHEN** the startup event writer fails or accepts fewer than the complete
  one-line event bytes
- **THEN** startup SHALL propagate the operational error, close the owned
  Archive state, and never enter `Serve`

#### Scenario: An image request completes

- **WHEN** an accepted or rejected image request reaches a terminal outcome
- **THEN** at most one `image_proxy_completed` event SHALL contain only the closed bounded terminal facts and no image identity or upstream detail

### Requirement: Metrics SHALL use fixed low-cardinality dimensions and units

The typed registry SHALL concurrently expose HTTP count/duration/response
bytes, liveness/readiness, Go/process/build, and current-snapshot info for
surfaces implemented now. Route, method, status class, operation, and outcome
labels SHALL be closed enums; the image route and operation SHALL use only the
fixed `image` value and closed request outcomes. `canceled` SHALL be the sole
cancellation outcome and `none` SHALL be the status class only when
client/process cancellation wins before commit. Request ID, raw path, UID,
entity, image identity/type, search/tag, digest, query, error text, and upstream
value SHALL never be labels.
dataVersion SHALL appear only on one current-snapshot info series; publishing
or clearing state SHALL replace/remove the prior labeled sample rather than
accumulate historical versions. Durations SHALL use seconds and
capacities/sizes bytes with matching names.

#### Scenario: Concurrent requests and a scrape run
- **WHEN** fixed routes including image, unknown paths, readiness transitions, cancellations, and `/metrics` scrapes execute concurrently under the race detector
- **THEN** counters are monotonic, histograms internally agree, exposition is parseable and deterministic, and label series stay within the fixed inventory

### Requirement: Metrics exposition SHALL be safe and non-critical

Exact `GET /metrics` SHALL return Prometheus text exposition with correct content type, HELP/TYPE declarations, finite numeric samples, and final newline, plus `no-store` and the generated request-ID header. Rendering SHALL use an atomic snapshot, SHALL NOT query Archive or block ordinary handlers, and an observability-internal failure SHALL not make other API routes unavailable.

#### Scenario: Metrics are scraped while readiness is false
- **WHEN** no Archive store is published or its readiness probe fails
- **THEN** `/metrics` remains 200, reports readiness 0 without snapshot identity, and emits no query log or Archive validation

### Requirement: Observability SHALL remain development instrumentation

No event named `update_activated`, updater status writer, monitoring agent, remote exporter, scrape configuration, dashboard, alert, retention rule, SLO, or production endpoint exposure SHALL be created by this change.

#### Scenario: Observability is accepted
- **WHEN** allowlist/redaction/cardinality/unit/parse/concurrency/race/full and strict OpenSpec gates pass
- **THEN** only in-process instrumentation and local route behavior SHALL be claimed, with no deployment or external-state mutation

### Requirement: Catalog observations SHALL use only closed existing telemetry

The exact catalog route SHALL extend the existing closed route and operation
inventories with only `catalog`. It SHALL use the existing HTTP
count/duration/response-byte metric families and the existing typed
`query_completed`/`query_rejected` event constructors. A terminal JSON
response SHALL produce exactly one mutually exclusive terminal event for the
typed request; cancellation before commit SHALL emit neither. Metric outcome,
status class, and cancellation behavior SHALL remain those of the accepted
HTTP middleware.

A catalog event SHALL contain only request ID, fixed operation, terminal
status/error classification, duration, response bytes, bounded content
length, and closed safe field paths already admitted by the event contract.
No event or label SHALL contain dataVersion, PositionKey, subject type, group,
rule, capability, row/entity count, SQL, query string, body, Archive path or
digest, raw error, or arbitrary value. Catalog SHALL add no metric family,
label dimension, remote sink, dashboard, alert, or history.

#### Scenario: Catalog requests terminate
- **WHEN** success, invalid input, wrong method, not-ready, internal failure, deadline, and cancellation cases run
- **THEN** committed JSON outcomes produce exactly one closed terminal event and one fixed catalog metric observation
- **AND** cancellation before commit produces no terminal event and uses only the accepted canceled metric outcome

#### Scenario: Catalog values are offered to telemetry
- **WHEN** tests offer dataVersion, keys, labels, counts, SQL, paths, raw errors, or attacker-controlled values
- **THEN** constructors and closed labels SHALL make those values unrepresentable or reject them
- **AND** event/metric inventories and series cardinality SHALL remain bounded under race tests
