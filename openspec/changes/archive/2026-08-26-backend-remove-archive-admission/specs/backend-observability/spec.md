## Capability Boundary

- **Status:** terminology/error-code delta required by admission removal.
- **Owner:** Backend observability.
- **Writable paths:** `backend/internal/httpapi/{handler.go,handler_test.go}`,
  `backend/internal/observability/{events.go,events_test.go}`, app tests, this
  change, and synchronized root capability.
- **Read-only protected inputs:** metrics route/schema, updater status,
  contracts, frontend, Archive bytes, remotes, and production.
- **Deletion complement:** Archive-admission-only codes/assertions; all other
  event/metric behavior and sensitive-data exclusions remain.
- **Mutable refs:** local topic branch only.
- **Consumes:** direct-open failures and published Store readiness.
- **Produces:** bounded startup load-failure event and existing metrics.
- **Dependencies:** direct-open Archive consumer and HTTP runtime.
- **Deliverables:** reduced error-code allowlist/tests/spec wording.
- **Acceptance:** no metric/event claims Archive validation or admission.
- **Non-goals:** new event names, labels, exporters, dashboards, or routes.
- **Operations deferred:** all remote monitoring and deployment.
- **Stop/rollback conditions:** stop on redaction/cardinality/route drift or
  failed gates; return to parent behavior.

## MODIFIED Requirements

### Requirement: Events SHALL be structured, allowlisted, and non-duplicative

Events SHALL be one-line JSON with fixed event/channel names and typed
constructors. App lifecycle/readiness events MAY contain request ID, fixed
phase, stable error code, duration/count, build, and snapshot facts. Every
Archive startup direct-open error SHALL emit exactly one
`archive_load_failed` event on channel `app` with phase `startup` and only a
stable root/file/open/layout/context code, or `INTERNAL_ERROR` for an untyped
failure. Contract/manifest/digest/compatibility/integrity/foreign-key/schema/
table-count admission codes SHALL not exist in the runtime allowlist. The
event SHALL contain no Archive root/path/content/identity, raw error, request,
or user field.

`query_completed` and `query_rejected` SHALL be mutually exclusive per typed
business request; health/metrics scrapes SHALL emit neither. A completed query
MAY add only closed scope, result-cache outcome, collection-cache outcome, and
the fixed `collection/cache/sqlite/compute/projection` duration fields from the
same frozen observation used for metrics and `Server-Timing`. Non-applicable
facts SHALL use `not_applicable`. No event SHALL contain raw body/URL/query/IP/
header/Cookie, Authorization/token, UID, search/tag/entity/collection value,
query or input digest, SQL, upstream body, response entities, arbitrary field
name/value, raw error, cache key/value, or filesystem path.

Each completed image request MAY emit exactly one `image_proxy_completed` app
event containing only request ID, fixed operation, closed outcome, status,
duration, and response-byte count. Degraded health serving SHALL begin only
after the event sink accepts one complete line. A failed or short event write
SHALL fail startup or remain non-critical after serving begins; partial output
SHALL never be claimed as emitted.

#### Scenario: Archive direct open fails before serving

- **WHEN** the one startup direct open returns a typed root/file/open/layout/
  context failure, an untyped failure, or cancellation
- **THEN** exactly one bounded `archive_load_failed` app/startup event SHALL be
  emitted with the stable code or `INTERNAL_ERROR`
- **AND** no admission code, Archive identity/path/content, raw error, request,
  or user input SHALL appear

#### Scenario: Archive failure event cannot be written

- **WHEN** the startup event writer fails or accepts fewer than the complete
  one-line event bytes
- **THEN** startup SHALL propagate the operational error, close owned Archive
  state, and never enter `Serve`

#### Scenario: A typed query or image request completes

- **WHEN** a business or image request reaches one terminal outcome
- **THEN** its existing event SHALL contain only its closed bounded terminal
  facts and no sensitive, attacker-controlled, Archive-admission, or raw-error
  detail

### Requirement: Metrics exposition SHALL be safe and non-critical

Exact `GET /metrics` SHALL return Prometheus text exposition with the correct
content type, HELP/TYPE declarations, finite numeric samples, final newline,
`no-store`, and generated request-ID header. Rendering SHALL use bounded
snapshots and SHALL NOT query Archive or perform Archive admission.
Runtime-stat collection SHALL happen once per scrape; optional updater status
reads SHALL be capped at 64 KiB and confined to the metrics request. Any
observability, stats-provider, or updater-status failure SHALL leave ordinary
API routes available.

#### Scenario: Metrics are scraped while dependencies are unavailable

- **WHEN** direct-open readiness is false, the runtime stats provider fails, or
  updater status is missing/malformed/unreadable
- **THEN** `/metrics` SHALL remain parseable, report bounded validity/readiness
  state without sensitive detail, emit no query event, and leave ordinary
  routes independent

#### Scenario: Metrics are scraped while readiness is false

- **WHEN** no direct-open Store is published or its readiness probe fails
- **THEN** `/metrics` SHALL remain 200, report readiness 0 without snapshot
  identity, and emit no query log, Archive validation, or admission
