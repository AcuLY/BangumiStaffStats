# backend-person-detail-api Specification

## Purpose
TBD - created by archiving change expose-person-detail. Update Purpose after archive.
## Requirements
### Requirement: Backend SHALL admit only a ranking-eligible person

The Backend SHALL normalize the query against the current Archive catalog,
verify every selected position supports `personDetail`, evaluate the complete
multi-position ranking set, and distinguish an absent person from an existing
person outside that result. Global scope SHALL never access a collection.

#### Scenario: Existing person does not satisfy every position
- **WHEN** input.personId exists in Archive but is absent from RankingPeople
- **THEN** the endpoint SHALL return 400 `PERSON_NOT_IN_QUERY_RESULT`

### Requirement: Backend SHALL build one immutable complete detail core

For the admitted person, the Backend SHALL derive exact subject/series works,
characters and appearances, summary, scope-correct metrics, bounded tag and
rating evidence, and personal preference from accepted authorities. It SHALL
deduplicate statistical units without discarding exact contribution
provenance and SHALL not expose arbitrary URLs, full tag sets, or relationship
graphs.

#### Scenario: Series mode is enabled
- **WHEN** matched anime works occupy one series
- **THEN** the core SHALL retain complete members but count only matched works and aggregate only after exact participation

### Requirement: Detail core SHALL use bounded semantic caching

The result key SHALL contain `person-detail/v1`, dataVersion, queryDigest,
canonical person input digest, and only for personal scope collectionDigest.
It SHALL exclude every view field. Cached cores and projected pages SHALL be
immutable and cache admission outcomes SHALL not alter successful results.

#### Scenario: Works and characters are opened
- **WHEN** both sections address the same query and person
- **THEN** they SHALL be eligible to share one core and receive independent projections

### Requirement: Person-detail transport SHALL be strict and cancellable

The runtime SHALL expose only same-origin `POST /api/v1/person-detail`, reject
query parameters and invalid bounded JSON, emit private no-store success/error
envelopes, propagate cancellation, and map capability, identity, readiness,
busy, collection, upstream, and internal failures to stable status/code pairs.

#### Scenario: Characters are requested without cast capability
- **WHEN** view.section is characters for a query without applicable cast evidence
- **THEN** the endpoint SHALL return 400 `CAPABILITY_NOT_AVAILABLE` without a partial detail
