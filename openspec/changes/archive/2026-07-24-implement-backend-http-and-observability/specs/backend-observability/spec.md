## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved after startup-event write-failure and cancellation closure; implemented: complete; owner, independent, and main-agent verification: complete; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | Backend implementation owner; main agent reviews and accepts. |
| Writable paths | The exact `internal/observability`, HTTP/app/check/doc, and task-marker files enumerated in `proposal.md`. |
| Read-only protected inputs | Archive/contracts/generated wire, guides/root specs, other code/changes, refs/remotes, hosts, monitoring, and production. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Sanitized typed runtime facts and the current published snapshot identity only. |
| Produces | Typed JSON event sink and concurrency-safe standard Prometheus exposition. |
| Dependencies | Accepted Archive consumer and HTTP-runtime artifacts; standard library only. |
| Deliverables | Events including bounded Archive-load failure, metrics registry/handler, integration, tests, guards, and docs. |
| Acceptance | Event allowlist/redaction, startup failure, metric parse/cardinality/unit/cancellation/concurrency, health silence, race/full gates. |
| Non-goals | Business/updater instrumentation, arbitrary logging, tracing, pprof, Prometheus deployment, alerts, or SLOs. |
| Operations deferred | Scrape exposure, storage/retention, dashboards/alerts, production labels/limits, release/deploy. |
| Stop/rollback conditions | Stop on unbounded input, leakage, dependency, path, or test failure; preserve protected/external state. |

Dependency direction SHALL be `httpapi -> observability -> standard library`; observability SHALL NOT import app, archive, generated wire, or domain packages and SHALL accept no arbitrary label/event maps.

## ADDED Requirements

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
SHALL emit neither. No event SHALL contain raw body/URL/query/IP/header/Cookie,
Authorization/token, UID, search/tag/entity/collection values, upstream body,
response entities, arbitrary field name/value, raw error, or cache value.
Degraded health serving SHALL begin only after the event sink accepts one
complete line. If the writer returns an error or short write, the application
SHALL close its owned Archive state, propagate that operational failure, and
return without serving; it SHALL NOT silently continue, retry within the same
process, or claim that a partial/failed write was an emitted event.

#### Scenario: Sensitive and attacker-controlled inputs are offered
- **WHEN** event tests provide credentials, UID, raw errors, upstream content, unknown field paths, control characters, and query values
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

### Requirement: Metrics SHALL use fixed low-cardinality dimensions and units

The typed registry SHALL concurrently expose HTTP count/duration/response
bytes, liveness/readiness, Go/process/build, and current-snapshot info for
surfaces implemented now. Route, method, status class, operation, and outcome
labels SHALL be closed enums; `canceled` SHALL be the sole cancellation
outcome and `none` SHALL be the status class only when client/process
cancellation wins before commit. Request ID, raw path, UID, entity, search/tag,
digest, query, error text, and upstream value SHALL never be labels.
dataVersion SHALL appear only on one current-snapshot info series; publishing
or clearing state SHALL replace/remove the prior labeled sample rather than
accumulate historical versions. Durations SHALL use seconds and
capacities/sizes bytes with matching names.

#### Scenario: Concurrent requests and a scrape run
- **WHEN** fixed routes, unknown paths, readiness transitions, cancellations, and `/metrics` scrapes execute concurrently under the race detector
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
