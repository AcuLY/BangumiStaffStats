## ADDED Requirements

### Requirement: Backend SHALL build one immutable ranking core

For one normalized query, current Archive dataVersion, and usable personal
collection when required, the Backend SHALL load facts, evaluate query set
algebra, evaluate statistics, and join person names into one immutable
pre-view core. Global scope SHALL never access a collection provider. Personal
scope SHALL access exactly one admitted collection snapshot.

The expensive core MAY be cached only by operation, dataVersion, queryDigest,
fixed empty rankings input digest, and personal collectionDigest. Search, sort,
order, page, and pageSize SHALL never enter or mutate the core.

#### Scenario: Two pages use one semantic query
- **WHEN** otherwise identical requests ask for different pages
- **THEN** both SHALL project independent views from the same immutable semantic core

#### Scenario: Global ranking is evaluated
- **WHEN** scope is global
- **THEN** no collection source SHALL be called and no personal field SHALL be projected

### Requirement: Ranking projection SHALL preserve complete ranks and summaries

The Backend SHALL sort the complete eligible population with the accepted
statistics strict-total-order comparators, assign ranks, then apply normalized
person-name search and checked pagination. Missing primary metrics SHALL sort
last in both directions and stable person ID SHALL be the final tie-breaker.

Summary and metricScale SHALL be computed before search/page. Summary workCount
SHALL be the de-duplicated global matched unit set, not a sum of row counts.
The scale maximum SHALL be derived from the selected primary metric over the
complete population and SHALL represent absence explicitly when no valid value
exists.

#### Scenario: Equal primary metrics are sorted
- **WHEN** rows tie on the selected primary and all documented secondary keys
- **THEN** lower stable person ID SHALL order first deterministically

#### Scenario: Search and pagination repeat
- **WHEN** the same core and normalized view are projected repeatedly or concurrently
- **THEN** response bytes SHALL be deterministic and the core SHALL remain unchanged

### Requirement: Rankings HTTP transport SHALL be strict and cancellable

The handler SHALL register only `POST /api/v1/rankings`, require
`application/json`, cap the body at 64 KiB, reject unknown fields and trailing
JSON, reject query parameters, and emit private no-store success/error
responses with opaque request ID. It SHALL map validation, readiness, busy,
collection, timeout, and internal failures to stable status/code envelopes.

Cancellation before response commit SHALL return without publishing a partial
success. A legal empty result and an out-of-range page SHALL remain successful.
The production runtime SHALL use the current immutable Archive provider and
explicit injected collection/cache boundaries; no fixture or browser-side
Bangumi request SHALL act as fallback.

#### Scenario: A second JSON document follows the request
- **WHEN** a syntactically valid rankings body is followed by another JSON value
- **THEN** the handler SHALL reject it before query evaluation

#### Scenario: Archive is not ready
- **WHEN** the route is called without a published Archive Store
- **THEN** it SHALL return stable retryable `NOT_READY` without executing a query
