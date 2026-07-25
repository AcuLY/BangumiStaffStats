# backend-query-result-set Specification

## Purpose
TBD - created by archiving change implement-query-result-set. Update Purpose after archive.
## Requirements
### Requirement: Normalization and queryDigest SHALL reproduce the shared authority

The Backend SHALL strictly normalize preserved raw `SharedQueryV1` JSON into
the accepted Effective Query and digest projection, including exact TrimV1,
Unicode 15.1 assigned-scalar/NFKC/default-fold behavior, defaults, catalog
semantics, stable error code/path, RFC 8785 bytes, and `q1:` digest. It SHALL
use JSON double semantics without routing contract numbers through generated
`float32` fields, and SHALL match every existing query/Unicode/RFC/digest
vector byte-for-byte.

#### Scenario: Equivalent submissions are normalized
- **WHEN** accepted inputs differ only by defaults, duplicates, order of unordered values, Unicode width/case, or excluded UID
- **THEN** Effective Query, canonical projection, and queryDigest SHALL match the declared shared vectors

#### Scenario: Invalid input is submitted
- **WHEN** scope fields, positions, ranges, tags, Unicode, surrogates, or JSON structure violate the shared authority
- **THEN** normalization SHALL return its declared stable code/path before Archive or collection access

### Requirement: Scope and filters SHALL select one authoritative subject universe

Global evaluation SHALL start from all corrected Archive subjects of the
requested type and SHALL never read collection data. Personal evaluation SHALL
intersect those subjects with the supplied UID-bound collection statuses and
overlay only that collection's rate, tags, and update time. Both SHALL apply
authoritative NSFW, strict date precision, global score, rating-count, and
public/meta tag facts; personal MAY additionally apply collection date/score,
score difference, and collection tags.

Scores are valid only in `[1,10]`; an active score/difference filter SHALL
exclude missing required scores, while inactive score filters retain unrated
subjects. Rating count SHALL be the checked sum of buckets 1–10. Tags SHALL
use normalized exact matching with include outer-AND/inner-OR and exclude
outer-OR/inner-AND. `includeNSFW=false` SHALL use the corrected boolean fact,
never a tag/name inference. A date filter SHALL exclude unknown or
year-only dates and compare any month-precise/full date by `YYYY-MM`.

#### Scenario: Global and personal use the same Archive
- **WHEN** identical filters run once globally and once with a personal overlay
- **THEN** global output SHALL contain no collection-derived access or field, while personal output SHALL reflect only the supplied collection

#### Scenario: Filter evidence is missing
- **WHEN** an active score, difference, month, or collection field lacks its required valid evidence
- **THEN** that subject SHALL be excluded without converting the missing value to zero or fabricating precision

### Requirement: Catalog identities SHALL produce exact deterministic set algebra

The Backend SHALL treat PositionKey as opaque and consume the accepted typed
selection plan. Exact staff SHALL use raw matching `staff_credit`; staff sets
SHALL union their exact members while retaining set and exact-member evidence;
cast `main` SHALL use exact eligible main roles and cast `all` all exact
eligible roles. It SHALL not infer cross-subject cast or reinterpret staff
positions 101–106 as cast.

Each position SHALL yield its complete candidate people and de-duplicated raw
Subjects. Ranking people SHALL satisfy every query position, and each person's
works SHALL be the Subject-ID union of those identities. Participant helpers
SHALL union one person's requested identities and intersect different people
only at raw Subject level. Defined positions with no credit are valid empty
sets. Output position order follows Effective Query; people, Subjects, and
contributions use stable total order independent of SQL/map order.

#### Scenario: Multiple identities and people are combined
- **WHEN** a person matches multiple exact identities and multiple people are compared
- **THEN** same-person works SHALL be unioned once, people SHALL intersect on actual raw Subjects, and exact contribution evidence SHALL remain attributable

#### Scenario: Candidate scope exceeds actual participation
- **WHEN** 449 eligible subjects contain matching requested-position credit for only 442 subjects
- **THEN** the participating Subject set SHALL contain 442, not the pre-credit candidate count

### Requirement: Evaluation SHALL be read-only, cancelable, and pre-projection

Production data access SHALL use only fixed argument-bound `SELECT`/`WITH`
statements through the accepted `archive.Store`; it SHALL create no file,
sidecar, table, pragma change, attached database, or mutation. Context
cancellation/deadline or any load/evaluation error SHALL return no partial
result. Returned values SHALL be immutable to callers.

The capability SHALL not calculate averages, overall, preference,
distribution, series, rank, search, sort, pagination, endpoint response, or
cache state. Repeated and shuffled runs over identical facts SHALL return
byte-equivalent golden projections.

#### Scenario: Evaluation is canceled
- **WHEN** cancellation occurs during Archive scan or set construction
- **THEN** work SHALL stop promptly, return the context cause, expose no partial result, and leave the Store usable

#### Scenario: View-only state changes
- **WHEN** search, sort, order, page, page size, or section differs outside the Effective Query
- **THEN** this capability's result set SHALL be unchanged because view state is not consumed
