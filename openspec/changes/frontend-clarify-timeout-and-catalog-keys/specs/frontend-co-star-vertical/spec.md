## Capability Boundary

- **Status:** local intentional copy correction.
- **Owner:** Frontend co-star vertical operation drivers.
- **Writable paths:** candidates/coStar/partners/personDetail API tests/source, this change, root spec at sync.
- **Read-only protected inputs:** generated DTOs, Backend/contracts, presentation/layout, external state.
- **Deletion complement:** preserve strict adapters, retries, all non-timeout copy, and operation behavior.
- **Mutable refs:** current local worktree only.
- **Consumes:** stable operation error codes.
- **Produces:** factual operation-specific timeout copy.
- **Dependencies:** accepted ApiClient/generated operation contracts.
- **Deliverables:** adapter tests and browser evidence.
- **Acceptance:** four timeout messages are operation-specific and distinct from collection failures.
- **Non-goals:** wire/status/retry/request-timeout/presentation changes.
- **Operations deferred:** all remote/live integration.
- **Stop/rollback conditions:** stop on contract/retry/state/copy regression or failed checks.

## MODIFIED Requirements

### Requirement: Co-star frontend SHALL consume strict generated operation contracts

The frontend SHALL use the deterministic generated DTOs owned by
`expose-candidates`, `expose-partners`, and `expose-co-star`, verify their drift
checks, and send only same-origin native-fetch requests through the accepted
client. One strict adapter per operation SHALL decode unknown success and error
envelopes, preserve closed scope-specific structural omission, and return
feature models. Components SHALL NOT import generated DTOs, call fetch, parse
backend messages into logic, invent wire fields, or access Bangumi directly.

The frontend SHALL display server ranks, summaries, leaders, matrix metrics,
tags, ratings, preference evidence, contributions, work items, and pagination
without recomputing or correcting them. Global responses SHALL omit personal
sections rather than render placeholders, and exact numeric zero SHALL remain
distinct from missing values. `UPSTREAM_TIMEOUT` SHALL name the current
operation as timed out and offer retry without asserting a collection outage:
候选人物、人物详情、合作人物、或共演分析. Actual
`UPSTREAM_UNAVAILABLE`/`UPSTREAM_PROTOCOL_ERROR` failures SHALL retain the
collection-unavailable recovery copy.

#### Scenario: A global response contains a personal member

- **WHEN** a global candidates, partners, or co-star response includes a field forbidden by its generated closed union
- **THEN** the strict adapter SHALL reject the response and the matching surface SHALL retain its last accepted content with a local error

#### Scenario: A retryable operation returns a bounded wait

- **WHEN** partners or co-star returns retryable 429 or `SERVER_BUSY` with a canonical integer `Retry-After` from 1 through 60 seconds
- **THEN** the driver MAY perform at most one abortable bounded-jitter retry through the same ApiClient and transaction
- **AND** missing, malformed, duplicated, or out-of-range delay metadata SHALL NOT be guessed or cause an unbounded retry
- **AND** no explicit collection refresh SHALL enter automatic retry

#### Scenario: A deferred production module fails once

- **WHEN** the first production-artifact request for a ranking, candidate,
  co-star, or person-detail module returns 503 and the module later becomes
  available
- **THEN** the surface SHALL show a local oracle-compatible failure state while
  Header navigation remains usable
- **AND** activating its retry SHALL issue a fresh recovery attempt and load
  the surface, rather than reusing the browser-cached rejected module import
- **AND** the recovery SHALL preserve the current route and restorable intent

#### Scenario: A page contains ranks and complete evidence

- **WHEN** a valid response page is rendered
- **THEN** its server rank, complete summary/evidence, nullable values, and searched pagination total SHALL be displayed unchanged
- **AND** no page-derived rank, leader, summary, tag, rating, preference, matrix, or work aggregate SHALL be created

#### Scenario: A co-star operation request times out

- **WHEN** candidates, person detail, partners, or co-star returns a valid 504
  `UPSTREAM_TIMEOUT`
- **THEN** the message SHALL name that operation's query timeout and offer retry
  without saying collection data is unavailable
