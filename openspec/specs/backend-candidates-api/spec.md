# backend-candidates-api Specification

## Purpose
TBD - created by archiving change expose-candidates. Update Purpose after archive.
## Requirements
### Requirement: Backend SHALL compute candidate sets independently per ordered position

For one normalized query and immutable Archive/usable collection, the Backend
SHALL apply common filters once and evaluate candidate membership independently
for every ordered query position. Multi-position ranking AND semantics SHALL
not collapse candidate lists. Each person count and workCount SHALL use exact
eligible subject participation, or exact participating series when series mode
is enabled.

#### Scenario: A person matches only the second position
- **WHEN** a two-position query has a person eligible only for the second position
- **THEN** that person SHALL contribute only to the second position count/list and SHALL not be removed by ranking AND semantics

### Requirement: Backend SHALL project candidate views after complete ranking

The Backend SHALL validate scope-specific sort values, apply the accepted
strict total order with missing metrics last in both directions and stable
person ID final tie-breaking, assign ranks before search, and perform checked
pagination. View fields SHALL not alter cached core identity or recompute
ordered position counts.

#### Scenario: Missing average under ascending order
- **WHEN** a current-position candidate lacks the selected average metric
- **THEN** the candidate SHALL remain after every valid value and retain deterministic rank

### Requirement: Candidate core SHALL use bounded immutable cache semantics

The candidate core key SHALL include operation version, dataVersion,
queryDigest, current-position input digest, and only for personal scope the
collection digest. It SHALL exclude search, sort, order, page, and pageSize.
Published/read values SHALL remain immutable, and cache admission or oversize
failure SHALL not change a successful business result.

#### Scenario: Two pages use one candidate core
- **WHEN** two requests differ only by page
- **THEN** they SHALL be eligible to share one core and each SHALL receive its own projected page

### Requirement: Candidates endpoint SHALL reuse strict result transport

The API SHALL expose only same-origin `POST /api/v1/candidates`, reject query
parameters, enforce the bounded strict JSON body, propagate cancellation, and
emit result-operation request IDs, private no-store headers, stable status/code
errors, pagination metadata, and personal collection freshness. Global mode
SHALL never fetch collection data or emit personal collection members.

#### Scenario: Global refresh is requested
- **WHEN** a global request sets refreshCollection true
- **THEN** the handler SHALL return 400 `FIELD_INVALID` at `/refreshCollection` before evaluation

#### Scenario: Archive is not ready
- **WHEN** the route is registered but no Archive store is published
- **THEN** the endpoint SHALL return retryable 503 `NOT_READY` without evaluating candidates
