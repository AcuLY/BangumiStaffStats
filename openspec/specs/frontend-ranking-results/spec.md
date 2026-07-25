# frontend-ranking-results Specification

## Purpose
Define the production rankings driver, server-authoritative result controls,
responsive list presentation, and isolated loading/error behavior.
## Requirements
### Requirement: Frontend SHALL consume rankings through one strict driver

The formal SPA SHALL issue same-origin `POST /api/v1/rankings` only through the
accepted native-fetch client and a rankings driver registered with the existing
Query Coordinator. The driver SHALL serialize the last-successful Applied
Query and current ranking view, propagate AbortSignal, strictly decode the
generated success/error contract, and require the response requestId.
The shared client MAY expose an operation-supplied strict error-envelope decoder
but SHALL preserve existing catalog behavior and SHALL not turn display messages
or arbitrary error bodies into typed application failures.

Stable status/error codes and collection warning codes SHALL drive behavior.
The frontend SHALL not parse display messages, contact Bangumi directly, ship a
fixture, create a second Applied Query owner, or compute ranking statistics.

#### Scenario: A stale personal response succeeds
- **WHEN** the endpoint returns a valid result with `COLLECTION_STALE`
- **THEN** the ranking resource SHALL become ready, retain the result, and expose the stable stale warning

#### Scenario: A superseded view request returns late
- **WHEN** an older ranking view response resolves after a newer request
- **THEN** the coordinator SHALL reject the stale response and preserve the newer resource

### Requirement: Ranking view controls SHALL preserve query semantics

Search, sort, order, page, and pageSize SHALL be server-side view state.
Changing them SHALL not edit Draft, advance queryRevision, alter Applied Query,
or reset the co-star resource. Sort/search/page changes SHALL request only the
current applied ranking query through the existing coordinator's ranking
transaction/sequence owner; the feature SHALL not create a second concurrency
or stale-response layer. Page SHALL reset to one when search, sort, order, or
pageSize changes.

The UI SHALL render backend-provided item rank, complete summary, metric scale,
and pagination total unchanged. It SHALL never renumber filtered rows or derive
complete statistics from the current page. Global mode SHALL not render a
preference column or empty personal placeholder.

#### Scenario: Search returns rank gaps
- **WHEN** the backend returns ranks 2 and 8 for a searched page
- **THEN** the list SHALL display 2 and 8 and SHALL not renumber them 1 and 2

#### Scenario: Page size changes
- **WHEN** the user changes pageSize from 10 to 20
- **THEN** page SHALL reset to one and Applied Query/queryRevision SHALL remain unchanged

### Requirement: Ranking surface SHALL preserve approved outward behavior

The result surface SHALL preserve the oracle's ranking summary, metric labels,
compact toolbar, table-like row hierarchy, selected-metric progress treatment,
search/result empty distinction, and adaptive pagination, subject to the formal
DESIGN tokens and real API states.

Each row SHALL be a keyboard-operable button with visible focus, real rank,
person identity, work/series count, nullable average/overall, and personal
preference. Missing values SHALL display `—`. Controls SHALL have at least 44px
targets. The layout SHALL not overflow horizontally at supported widths and
SHALL honor reduced motion.

Person images SHALL use only derived same-origin proxy candidates through a
shared SafeImage with loading, loaded, failed, and absent states, stable aspect
ratio, meaningful/decorative alt semantics, and fallback to the next candidate.

#### Scenario: Ranking is empty after search
- **WHEN** a non-empty search returns zero items
- **THEN** the surface SHALL show the approved search-empty copy without replacing the complete query summary

#### Scenario: Person image candidates fail
- **WHEN** every derived proxy candidate fails
- **THEN** the row SHALL retain its dimensions and show the accessible fallback without exposing or requesting an arbitrary URL

### Requirement: Ranking resource states SHALL remain isolated

A new ranking query MAY replace the ranking body with its skeleton while Header
and Query summary remain available. A ranking view request SHALL preserve
summary and controls while replacing only rows/pagination. Ranking failure SHALL
not erase an unrelated co-star resource. Route switching SHALL not auto-apply
Draft or refetch a present current-revision result.

#### Scenario: A ranking view request is pending
- **WHEN** search/sort/page changes for a ready ranking resource
- **THEN** the existing summary and toolbar SHALL remain visible while rows/pagination expose bounded pending state

#### Scenario: User returns from co-star
- **WHEN** a current-revision ranking resource already exists
- **THEN** the ranking surface SHALL restore it without advancing revision or automatically applying Draft
