## Capability Boundary

- **Status/Owner:** Modified; Frontend owns co-star operation state and presentation.
- **Writable paths:** Co-star coordinator/app/API/component tests and accepted co-star frontend spec.
- **Read-only protected inputs:** Co-star contracts/statistics, selection topology, visual system, and archived changes.
- **Deletion complement:** Preserve generated adapters, bounded retry for eligible operations, latest-only state, view operations, topology, and stale warnings.
- **Mutable refs:** Local topic branch only.
- **Consumes/Produces:** Consumes strict generated operation contracts; produces frontend resources and rendered co-star surfaces.
- **Dependencies/Deliverables:** Existing client/coordinator only; remove refresh-only replay/restriction clauses.
- **Acceptance:** Co-star focused integration/component tests and full frontend gate/rendered QA.
- **Non-goals/Operations deferred:** No selection, partners, matrix, or deployment redesign.
- **Stop/rollback conditions:** Stop if ordinary latest-only behavior regresses; roll back the isolated branch.

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
distinct from missing values.

#### Scenario: A global response contains a personal member
- **WHEN** a global candidates, partners, or co-star response includes a field forbidden by its generated closed union
- **THEN** the strict adapter SHALL reject the response and the matching surface SHALL retain its last accepted content with a local error

#### Scenario: A retryable operation returns a bounded wait
- **WHEN** partners or co-star returns retryable 429 or `SERVER_BUSY` with a canonical integer `Retry-After` from 1 through 60 seconds
- **THEN** the driver MAY perform at most one abortable bounded-jitter retry through the same ApiClient and transaction
- **AND** missing, malformed, duplicated, or out-of-range delay metadata SHALL NOT be guessed or cause an unbounded retry

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

### Requirement: Co-star state SHALL be revision-bound, cancelable, and latest-only

The accepted query coordinator SHALL remain the sole Applied Query,
queryRevision, request-sequence, and cancellation authority. Candidates,
partners, and co-star SHALL use independent resources with canonical inputs,
sequences, AbortControllers, and `idle|pending|ready|error` state. Only a
response matching the current queryRevision, operation, sequence, and input
MAY commit.

Selected identities SHALL be ordered `personId + positionKey` pairs. Draft
edits, route changes, normalized no-ops, failed requests, and cancellation
SHALL preserve selection and accepted analysis. Only a successful semantically
different query SHALL clear selection and analysis. Candidate view changes and
partners/co-star view changes SHALL not advance queryRevision.

#### Scenario: Identity changes twice before the first response resolves
- **WHEN** analysis A is superseded by selection B and A resolves last
- **THEN** only B MAY update the visible analysis
- **AND** the candidate rail and B's selected tray SHALL remain current

#### Scenario: A new query attempt fails
- **WHEN** a semantically different Draft fails validation, transport, or is canceled
- **THEN** the previous Applied Query, queryRevision, selected identities, and accepted candidate/analysis content SHALL remain available

#### Scenario: A new query succeeds
- **WHEN** the latest semantically different `/co-star` candidates application succeeds
- **THEN** the candidate result, Applied Query, and new revision SHALL commit atomically
- **AND** prior selected identities and analysis SHALL clear exactly once

### Requirement: Selection topology SHALL map to empty, partners, pair, and group surfaces

Zero selected people SHALL render the approved “尚未选择人物” state with one
“选择人物” action and no analysis request. One selected person SHALL request
`/partners` and render the source identity, complete partner count, fixed
ordered leaders, candidate-position filter, searched/server-ranked partner
page, scope-correct metrics, and 5/10/20 pagination. Activating a partner SHALL
add that partner's returned actual contributing identities to the tray and
request the authoritative two-person co-star analysis.

Two selected people SHALL render `kind=pair` participants, complete summary,
tags, rating datasets, personal preference when present, and server-paginated
common subject/series items with exact contribution provenance. Three through
ten SHALL render the same hierarchy plus the returned pair matrix. The
upper-triangle response MAY be mirrored as a full accessible visual table only
by indexing unchanged cells; the frontend SHALL NOT infer a best pair or
calculate matrix metrics. Empty common works SHALL remain a valid ready state
with “没有共同作品” or “没有共同系列” and no action.

Partners candidate-position filtering SHALL replace its complete
summary/leaders/list pending boundary. Ordinary partners search/sort/page SHALL
retain accepted source/summary/leaders; co-star work search/sort/page SHALL
retain accepted participants/summary/tags/ratings/preference/matrix.

#### Scenario: No person is selected
- **WHEN** `/co-star` has an Applied Query and an empty tray
- **THEN** it SHALL show “尚未选择人物” and the picker action without calling partners or co-star

#### Scenario: One partner is activated
- **WHEN** a one-person partners row is activated
- **THEN** the target's actual returned identities SHALL be added after the source in the tray
- **AND** the analysis SHALL transition to a two-person pair request rather than computing common works from the partners page

#### Scenario: A group has no all-person common work
- **WHEN** a valid group response has zero common works but nonzero pair matrix cells
- **THEN** participants and matrix SHALL remain visible, the common-work empty state SHALL be ready, and no pairwise work SHALL be promoted into the all-person result

#### Scenario: A co-star work page is pending
- **WHEN** common-work search, sort, order, page, or pageSize changes
- **THEN** participants, summary, tags, ratings, personal preference, and group matrix SHALL remain visible
- **AND** only work rows and pagination SHALL enter pending
