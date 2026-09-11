## Capability Boundary

- **Status:** local accepted-contract correction.
- **Owner:** Backend candidates projection.
- **Writable paths:** projection source/test, this change, root spec later.
- **Read-only protected inputs:** candidates contracts/goldens/generated wire,
  Frontend consumer, candidate computation/cache/service, external state.
- **Deletion complement:** preserve all response members and values; remove only
  accidental upper-camel JSON keys.
- **Mutable refs:** current worktree and local Backend process only.
- **Consumes:** internal candidate page and accepted candidates success schema.
- **Produces:** exact schema-conformant candidate success JSON.
- **Dependencies:** accepted contracts-candidates-api; no dependency change.
- **Deliverables:** boundary mapping, raw JSON regression, runtime evidence.
- **Acceptance:** lower-camel keys, strict consumer acceptance, co-star success.
- **Non-goals:** computation/cache/request/error/schema/Frontend/deploy changes.
- **Operations deferred:** complete gates, lifecycle, integration and production.
- **Stop/rollback conditions:** value/order drift, contract conflict, failed test
  or runtime replay, or protected path requirement.

## MODIFIED Requirements

### Requirement: Candidates endpoint SHALL reuse strict result transport

The API SHALL expose only same-origin `POST /api/v1/candidates`, reject query
parameters, enforce the bounded strict JSON body, propagate cancellation, and
emit result-operation request IDs, private no-store headers, stable status/code
errors, pagination metadata, and personal collection freshness. Global mode
SHALL never fetch collection data or emit personal collection members.

Every success envelope SHALL conform exactly to the accepted candidates schema.
In particular, each `data.summary.positionCounts` entry SHALL expose only the
lower-camel members `positionKey` and `count`; Backend internal Go field names or
case aliases SHALL NOT appear on the wire.

#### Scenario: Global refresh is requested
- **WHEN** a global request sets refreshCollection true
- **THEN** the handler SHALL return 400 `FIELD_INVALID` at `/refreshCollection` before evaluation

#### Scenario: Archive is not ready
- **WHEN** the route is registered but no Archive store is published
- **THEN** the endpoint SHALL return retryable 503 `NOT_READY` without evaluating candidates

#### Scenario: Candidate position counts are serialized
- **WHEN** either a personal or global candidate projection emits a successful envelope
- **THEN** every position-count entry SHALL contain `positionKey` and `count` with its computed values in original order
- **AND** `PositionKey`, `Count`, or any additional case alias SHALL be absent
