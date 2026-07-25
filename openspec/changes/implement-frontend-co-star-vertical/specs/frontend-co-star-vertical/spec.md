## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | Specified and main-agent approved; apply remains governed by the task-level dependency and ownership gates. |
| Owner | One Frontend implementation agent; main agent audits and accepts. |
| Writable paths | The exact frontend API, co-star feature, coordinator/share/App, named shared primitive/check/architecture/test paths and task markers declared in `proposal.md`. |
| Read-only protected inputs | PRODUCT/DESIGN/oracle/plans, backend/contracts/updater, contract-owned generated DTOs/generators, non-listed frontend files, other changes, refs/remotes, external repositories, and production state. |
| Deletion complement | Only new files in declared API/co-star/test paths may be deleted; existing shared files are hunk-reverted only. |
| Mutable refs | None during apply. |
| Consumes | Accepted query shell and shared primitives plus generated DTOs/endpoints from exact changes `expose-candidates`, `expose-partners`, and `expose-co-star`. |
| Produces | One fixture-free, server-authoritative `/co-star` candidate/partners/pair/group frontend vertical. |
| Dependencies | Exact change IDs `bootstrap-frontend-foundation`, `implement-frontend-query-shell`, `implement-frontend-ranking-results`, `implement-frontend-person-inspector`, `expose-candidates`, `expose-partners`, and `expose-co-star`; dependency direction is contracts/runtime → adapters/coordinator → feature → App. |
| Deliverables | Strict adapters/drivers, coordinated resources, picker/tray, all selection topologies, sharing, tests, and responsive browser evidence. |
| Acceptance | DTO drift and strict adapter tests, state/component/integration/full frontend gates, and oracle/responsive dual-theme accessibility verification. |
| Non-goals | Frontend statistics, backend/contracts, new dependency/state/request layer, fixtures, person detail, entry migration, cleanup, operations, release, or deployment. |
| Operations deferred | Hosting/process/monitoring configuration, production secrets, deployment, release, cutover, and activation. |
| Stop/rollback conditions | Stop on dependency drift, active shared-file ownership, authority conflict, frontend-statistics need, undeclared mutation, or failed gates; preserve last accepted work and revert only owned files/hunks. |

## ADDED Requirements

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
- **AND** no explicit collection refresh SHALL enter automatic retry

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

### Requirement: Candidate picker and tray SHALL provide one complete identity owner

At 780px and above, `/co-star` SHALL show the candidate picker as a desktop rail
with the DESIGN 348/320/300px responsive widths and approved collapsed state.
Below 780px, the Header selection entry and the 0-person action SHALL open one
bottom picker Drawer. The same panel SHALL show selected people and identity
counts, ordered removable identities, whole-person removal, ordered
server-provided position counts, current-position selection, search, legal
scope-specific sort/order, rank, work count, 5/10/20 pagination, pending,
empty, error, cancel, and retry states.

Candidate activation SHALL toggle exactly its current
`personId + positionKey`. The UI MAY overlay selected/current-other-identity
state locally, but SHALL NOT send selection to `/candidates` or change the
server rank/count. The tray SHALL be the only complete identity mutation
surface; analysis participant cards SHALL remain read-only. The UI SHALL
prevent more than 10 unique people or 20 total identities and expose a stable
accessible limit error.

#### Scenario: The same person has another selected identity
- **WHEN** a candidate row is not selected for the current position but the person has another selected position
- **THEN** the row SHALL retain its server rank and work count and expose the other selected identity as local presentation
- **AND** activating it SHALL add only the current identity

#### Scenario: Candidate search is pending
- **WHEN** debounced search has been sent for the current position
- **THEN** the selected tray, accepted position counts, toolbar, and focus SHALL remain visible
- **AND** only candidate rows and pagination SHALL enter an accessible pending state

#### Scenario: Mobile picker closes
- **WHEN** a keyboard user closes the candidate Drawer after adding or removing an identity
- **THEN** focus SHALL return to the opening control when it still exists
- **AND** the selected order and corresponding analysis request SHALL remain intact

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
retain accepted participants/summary/tags/ratings/preference/matrix. Partners,
co-star, and view-only requests SHALL never send `refreshCollection`.

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

### Requirement: Co-star sharing SHALL restore accepted query intent safely

The existing v1 `/co-star#q=` share payload SHALL encode the last successful
Applied Query, current candidates/partners/co-star operation view, and the
ordered finite selected identities needed to restore the visible topology. It
SHALL exclude Draft, responses, request/sequence/revision/data/digest values,
refresh flags, theme, Drawer, focus, scroll, and loading state.

Initial restore SHALL validate version, encoded/decoded size, query,
position membership, uniqueness, 10-person/20-identity limits, and view unions;
then it SHALL execute at most once through the ordinary query coordinator,
remove the fragment, and load the appropriate candidate and analysis resources.
Invalid payload SHALL start no business request, remove the fragment, preserve
the safe initial page, and expose a stable error.

#### Scenario: A valid pair share is opened
- **WHEN** a valid pair payload and an unrelated `?user=` are present on first load
- **THEN** the shared query and ordered identities SHALL restore through the ordinary coordinator at most once
- **AND** candidates and pair analysis SHALL load for one revision while `?user=` starts no extra request

#### Scenario: A share exceeds an identity limit
- **WHEN** a payload contains more than 10 people or 20 identities
- **THEN** no candidates, partners, or co-star request SHALL start
- **AND** the fragment SHALL be removed and an accessible stable share error SHALL be shown

### Requirement: Co-star presentation SHALL preserve oracle hierarchy and DESIGN access

The production page SHALL preserve the oracle's approved candidate
rail/mobile picker, tray, empty/single/multi hierarchy, participant overview,
summary, tag/rating/preference sections, relationship matrix, common-work
browser, density, copy, and Light/Dark visual character without copying its
architecture or fixture calculations. Images SHALL use the shared same-origin
SafeImage four-state 3:4 lifecycle and size policy.

Every operation state SHALL use the smallest stable pending/error boundary,
`aria-busy`, a neighboring polite status, non-focusable skeletons, keyboard
operation, visible focus, 44px hit targets, and safe focus restoration.
Animations SHALL honor reduced motion. The page SHALL have no horizontal
viewport overflow; only the relationship matrix and approved shared work table
MAY scroll horizontally.

#### Scenario: The 780 boundary is crossed
- **WHEN** the same ready selection is rendered at 779px and 780px
- **THEN** 779px SHALL use compact controls plus the bottom picker Drawer and 780px SHALL use standard controls plus the desktop rail
- **AND** the selected identities, request state, and result meaning SHALL not change

#### Scenario: Themes and representative viewports are checked
- **WHEN** Light and Dark are browser-checked at 360, 390, 768, 779, 780, 781, 917, 1024, 1185, and 1440px
- **THEN** the header/main content line, rail/drawer, charts, matrix, work browser, focus rings, image states, and copy SHALL remain readable and oracle-consistent
- **AND** there SHALL be no duplicate ID, console error, failed resource, direct upstream request, or page overflow
