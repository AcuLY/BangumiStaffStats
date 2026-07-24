## MODIFIED Requirements

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
value SHALL never be labels. dataVersion SHALL appear only on one
current-snapshot info series; publishing or clearing state SHALL replace/remove
the prior labeled sample rather than accumulate historical versions. Durations
SHALL use seconds and capacities/sizes bytes with matching names.

#### Scenario: Concurrent requests and a scrape run
- **WHEN** fixed routes including image, unknown paths, readiness transitions, cancellations, and `/metrics` scrapes execute concurrently under the race detector
- **THEN** counters are monotonic, histograms internally agree, exposition is parseable and deterministic, and label series stay within the fixed inventory
