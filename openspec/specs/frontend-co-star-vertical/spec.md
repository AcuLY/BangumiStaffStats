# frontend-co-star-vertical Specification

## Purpose
Define the production co-star vertical that consumes strict Candidates, Partners, and Co-star contracts, preserves revision-bound latest-only state and one identity-selection owner, renders the empty, partner, pair, and group topologies, restores shares safely, and preserves the approved presentation and accessibility.
## Requirements
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
- **THEN** its server rank, complete summary/evidence, and nullable values SHALL be displayed unchanged, and its searched pagination total SHALL drive pagination without a separate item-range/total hint
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
with the DESIGN 348/320/300px responsive widths. The desktop rail SHALL remain
visible and SHALL NOT expose a whole-rail collapse control.
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

The App SHALL construct all three co-star operation drivers and exactly one
selection owner. Stable `mode-panel-ranking` and `mode-panel-co-star` tabpanels
SHALL remain mounted and switch with `hidden` plus `inert` so mode navigation
does not destroy selection or accepted results. At compact widths the picker
entry SHALL appear in Header context, close an open query editor before opening
the bottom Drawer, and restore focus to that exact opener when it survives.

#### Scenario: The 780 boundary is crossed
- **WHEN** the same ready selection is rendered at 779px and 780px
- **THEN** 779px SHALL use compact controls plus the bottom picker Drawer and 780px SHALL use standard controls plus the desktop rail
- **AND** the selected identities, request state, and result meaning SHALL not change

#### Scenario: A mode switch returns to co-star
- **WHEN** a ready co-star selection switches to ranking and then back
- **THEN** the same mounted co-star panel, selection order, and accepted result SHALL remain
- **AND** Header tab `aria-controls` SHALL continue to resolve to the stable panel ID

#### Scenario: Themes and representative viewports are checked
- **WHEN** Light and Dark are browser-checked at 360, 390, 768, 779, 780, 781, 917, 1024, 1185, and 1440px
- **THEN** the header/main content line, rail/drawer, charts, matrix, work browser, focus rings, image states, and copy SHALL remain readable and oracle-consistent
- **AND** there SHALL be no duplicate ID, console error, failed resource, direct upstream request, or page overflow

### Requirement: Common series cards SHALL show the returned representative metadata
Detailed common-series cards SHALL render API metaTags through the current subject-card NTag metadata layout. The frontend SHALL NOT derive tags from members or statistical summaries. Empty tags SHALL omit the metadata row, and current role, date visibility, xicons, divider and selection behavior SHALL be preserved.

#### Scenario: Representative and member tags differ
- **WHEN** a series representative has tags different from another member
- **THEN** the series card metadata SHALL contain only the representative's tags

#### Scenario: Representative metadata is empty
- **WHEN** the representative has no meta tags
- **THEN** an empty array SHALL remain empty through projection and display

### Requirement: Cooperation rows SHALL render server-scaled sorting progress

Cooperation rows SHALL consume the accepted response metricScale and existing row values, reuse current ranking progress arithmetic, and follow DESIGN.md:416. Count/average/overall SHALL fill from the start; personal preference SHALL share ranking's zero-centered positive/right and negative/left display with visible sign and current semantic colors. Null or zero scale SHALL show no spurious fill, and a valid zero score SHALL remain 0.00. Progress SHALL be decorative and SHALL not replace actual metric text or accessible row descriptions.

The adapter SHALL retain immutable exact scale values and the driver SHALL reject a metric discriminator that mismatches the normalized requested sort. The frontend SHALL not compute a population maximum from current items or leaders, issue supplementary requests, or approximate a missing scale. Existing current typography, widths, padding, focus, selection, NTag/xicons/AppViewport and C1/C2 fixes SHALL remain unchanged.

#### Scenario: Positive and larger negative scores share a scale
- **WHEN** the server returns max 4/5 and the visible scores are +1/5 and -4/5
- **THEN** the positive progress SHALL occupy one quarter of its half-track and negative progress its complete half-track
- **AND** both SHALL retain their signed textual values using the current ranking formatter

#### Scenario: Search or pagination changes visible rows
- **WHEN** the same person appears after a search/page/order change with the same server scale
- **THEN** that person's progress length SHALL remain identical
- **AND** the existing pending rows SHALL retain the last accepted rows/scale together after failure or cancellation

#### Scenario: Strict response is missing or mismatched
- **WHEN** metricScale is absent, invalid or names another metric
- **THEN** the existing decode/error path SHALL handle the failed response
- **AND** no locally inferred progress SHALL be displayed as accepted evidence
