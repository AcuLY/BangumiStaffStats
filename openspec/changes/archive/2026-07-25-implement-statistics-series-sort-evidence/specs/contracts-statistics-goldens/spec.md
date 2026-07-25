## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency review and strict validation passed |
| Owner | One Contracts owner creates and verifies this corpus before any Backend implementation; the Backend owner consumes but never rewrites its expectations; the main agent audits authority and accepts both blocks. |
| Writable paths | `contracts/goldens/statistics/**` and only the Contracts task markers in `openspec/changes/implement-statistics-series-sort-evidence/tasks.md`. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `tmp-formal-development/**`, oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`, all root specs and other changes, all existing contracts/goldens, every Backend/Frontend/Updater path, `.vscode/**`, refs/remotes, other repositories, hosts, and production. |
| Deletion complement | None; the owner SHALL add only the new corpus and SHALL NOT delete, rename, or replace another contract. |
| Mutable refs | None; no staging, commit, archive, branch/ref update, push, pull request, tag, release, deployment, or activation. |
| Consumes | Accepted query-result types and goldens; protected Archive/catalog/query authorities; `PRODUCT.md`; accepted data decisions; bounded oracle evidence. |
| Produces | Versioned JSON inputs and exact expected statistical, series, evidence, summary, and ordering outputs with a hash-closed index and verifier. |
| Dependencies | Exact direct apply dependency: `implement-query-result-set`; apply SHALL remain blocked until it is accepted and exited. |
| Deliverables | A JSON-only case corpus, provenance/classification metadata, hash index, zero-dependency verifier, and deterministic verification evidence. |
| Acceptance | Two identical verifier passes; exact inventory/hash and referential closure; complete required case matrix; no bulk/personal fixture; cross-language-safe numbers; strict OpenSpec and diff checks. |
| Non-goals | Go implementation, public wire/OpenAPI, HTTP, UI, cache, collection fetch, Archive/schema/catalog changes, or operations. |
| Operations deferred | Production data roots, activation, services, scheduling, monitoring rollout, secrets, migration, release, deployment, cutover, and legacy deletion. |
| Stop/rollback conditions | Stop on unmet dependency, authority ambiguity, unexpected protected-path drift, sensitive/bulk input, unrepresentable exact expectation, or verifier disagreement. Remove only new unstaged corpus bytes; preserve dependency and user state. |

## ADDED Requirements

### Requirement: Statistics goldens SHALL be closed, exact, and language-neutral

The corpus SHALL use JSON-only bounded synthetic facts, inputs, and expected
outputs; a versioned top-level index SHALL enumerate every file, SHA-256, case
identifier, behavior classification, and authority reference. Decimal
expectations SHALL use integers and reduced rational numerator/denominator
pairs where binary floating-point JSON numbers cannot express exact evidence.
This bounded corpus SHALL keep rational members within the interoperable JSON
safe-integer range; it does not limit the magnitude of exact rational evidence
that the production Backend may derive from otherwise valid score inputs.
The corpus SHALL contain no production UID, credential, bulk oracle fixture,
runtime import, generated OpenSpec root, or host-specific path.

Each externally observable case SHALL be classified as `PRESERVE_ORACLE`,
`INTENTIONAL_DELTA`, or `NEW_CAPABILITY`. Preserved cases SHALL cite immutable
oracle `644b7748674e553f863d0ffd61d029f86fdc0717`; delta cases SHALL cite the
governing `PRODUCT.md` rule and accepted data decision rather than blessing
implementation output after the fact.

#### Scenario: Closed inventory is verified twice
- **WHEN** the zero-dependency verifier runs twice from a clean corpus
- **THEN** it SHALL prove the same path inventory, hashes, unique case IDs, referential closure, reduced rational forms, stable ordering, and authority classifications on both runs

#### Scenario: An expectation lacks authority
- **WHEN** a case omits its behavior class, oracle commit for preservation, or governing decision for an intentional delta
- **THEN** verification SHALL fail before a Backend consumer can use that case

### Requirement: Rating cases SHALL fix valid scores and exact decimal results

Cases SHALL define a valid rating as a finite decimal in `[1,10]`. Exact `0`,
JSON `null`, and an omitted value SHALL be unrated: their work unit remains in
the result count but SHALL NOT enter average, rated-unit count, overall,
distribution, or timeline. Values below `1`, above `10`, or represented as
non-finite test sentinels SHALL produce a stable data error rather than a
partial statistic.

For valid values the expected average SHALL be the arithmetic mean truncated
toward negative infinity to two decimal places; all supported scores are
positive, so this is exact downward truncation. Overall SHALL use that
normalized average and exactly five neutral units at score `5`:
`(n * average + 25) / (n + 5)`, rounded to two decimal places with exact
positive half values rounded upward. `n` SHALL be the number of valid subject
units when series merging is off and the number of valid series units when it
is on. Source `ratingCount` SHALL equal only the explicit non-negative integer
1–10 vote buckets and SHALL never change overall weighting.

#### Scenario: Decimal and neutral-prior sentinels run
- **WHEN** the corpus evaluates empty, all-unrated, mixed rated/unrated, one-rated, mathematical `8.20`, and five-neutral-sample cases
- **THEN** work counts SHALL remain correct, missing metrics SHALL be null, `8.20` SHALL NOT become `8.19`, and average/rated count/overall evidence SHALL match exact expected integers or rationals

#### Scenario: Quarterly precision sentinel runs
- **WHEN** three valid subject values `[6,7,7]` occur in one eligible quarter
- **THEN** both the normalized metric and timeline average SHALL be exactly `6.66` and SHALL NOT use an independent round-to-nearest path

### Requirement: Distribution and series cases SHALL define statistical units

The corpus SHALL cover subject mode and anime series mode. A rating
distribution SHALL always contain buckets `1..10` for the current rating
source; each valid statistical unit average SHALL enter the nearest integer
bucket with exact `.5` values rounded upward, middle bucket `x` representing
`[x-0.5,x+0.5)` and edge buckets clipped to valid range `[1,10]`. It SHALL
model work/series averages, not user vote distributions.

Anime series components SHALL be the undirected transitive closure of
same-type existing positive Subject IDs connected by relation IDs
`2,3,4,5,6,9,10,11,12`. Relation IDs `1,7,8,14,99`, cross-type edges,
missing targets, invalid IDs, and unknown subjects SHALL NOT merge components.
Every singleton or component SHALL use its minimum positive Subject ID as
Series ID. The corpus SHALL contain complete members in versioned sequel order,
the representative, actual matched members per participant/identity, and exact
contribution evidence.

Series mode SHALL form any multi-person intersection on raw Subject IDs before
mapping the surviving Subjects to components. Ratings SHALL aggregate only
actual matched works inside each series, normalize each series mean, and then
weight series equally. It SHALL not infer participation from unmatched members,
inherit representative-only collection evidence, or emit a merged timeline.

#### Scenario: Relation and fallback matrix runs
- **WHEN** cases include every merged and non-merged relation ID, transitive edges, cross-type edges, missing/invalid references, and disconnected Subjects
- **THEN** component membership, minimum-ID Series ID, representative, complete-member order, and fallback singleton outputs SHALL match exactly

#### Scenario: Raw intersection precedes series merge
- **WHEN** two people participate only in different works from one series
- **THEN** their raw common-Subject set and common-series set SHALL both be empty

#### Scenario: Series values are equally weighted
- **WHEN** matched works form series of unequal member counts and contain rated and unrated values
- **THEN** only actual matched valid ratings SHALL form each series value, each valid series SHALL have equal outer weight, and rated-unit/average/overall/distribution evidence SHALL match the exact expected outputs

### Requirement: Preference and summary cases SHALL preserve full evidence

Personal preference cases SHALL use only Subjects whose personal and global
ratings are both valid; an exact difference of zero SHALL remain valid
evidence. The expected output SHALL include `comparableCount`,
`comparableSeriesCount`, `effectiveEvidence`, `mean`, `evidenceWeight`, and
`score`. Subject mode SHALL weight each comparable Subject equally. Series mode
SHALL average differences inside each naturally covered series and then weight
each series equally. `evidenceWeight` SHALL equal
`effectiveEvidence/(effectiveEvidence+5)` and `score` SHALL equal
`mean*evidenceWeight`; zero evidence SHALL yield counts of zero plus null
`mean` and null `score`, while exact neutral evidence SHALL yield exact zero.
Global cases SHALL have no preference input or output.

Summary cases SHALL derive person count, statistical-unit kind, globally
de-duplicated work/series count, and, when cast identities are present,
Character-ID-de-duplicated character count from the complete accepted result
set. Evidence SHALL retain stable source Subject/Series IDs, valid-rated IDs,
comparable IDs, identity/contribution attribution, and all intermediate counts
needed to reproduce a metric without exposing another algorithm.

#### Scenario: Preference evidence matrix runs
- **WHEN** cases cover missing one-side ratings, exact zero difference, sparse strong preference, dense mild preference, subject mode, series mode, and zero evidence
- **THEN** all six preference fields and ordered evidence IDs SHALL match exact reduced rational expectations, and global outputs SHALL contain no personal evidence

#### Scenario: Complete summary de-duplicates units
- **WHEN** multiple people and identities reference overlapping Subjects, series, contributions, and characters
- **THEN** summary counts SHALL use the complete de-duplicated sets while evidence SHALL remain attributable and deterministically ordered

### Requirement: Sort cases SHALL define one strict total order

The corpus SHALL cover both primary directions, missing values, exact ties,
shuffled inputs, and pagination-boundary-sized sets for every approved order:

- count: count primary, then valid average first and average descending, valid
  rating count descending, Person ID ascending;
- average: valid first, average primary, valid rating count descending, count
  descending, Person ID ascending;
- overall: valid first, overall primary, valid rating count descending, count
  descending, average descending, Person ID ascending;
- preference: valid first, preference primary, effective evidence descending,
  count descending, average descending, Person ID ascending;
- work/series selected metric: valid primary first, selected metric primary,
  global score descending, Subject/Series ID ascending;
- person combinations: common count primary, current-mode average
  descending with missing last, sorted Person-ID tuple ascending.

Only the selected primary metric SHALL change direction. Missing primary values
SHALL remain after all valid values in both directions. Sorting SHALL preserve
the exact input entity set, and the stable ID or stable sorted ID tuple SHALL be
the final tie-break so distinct entities never compare equal.

#### Scenario: Missing values remain last
- **WHEN** valid and missing primary metrics are sorted ascending and descending
- **THEN** all valid entities SHALL precede missing entities and the entity set SHALL remain unchanged

#### Scenario: Complete ties use stable identity
- **WHEN** every metric and evidence tie is equal and input order is repeatedly shuffled
- **THEN** the exact same ascending stable-ID order SHALL result on every run

### Requirement: Contracts expectations SHALL precede Backend apply

The Contracts owner SHALL complete and hand off a verifier-clean, unstaged
corpus before the Backend owner mutates any Backend path. An implementation
disagreement SHALL stop for authority review; expected output SHALL NOT be
changed merely to make a failing implementation pass.

#### Scenario: Backend requests a different expected result
- **WHEN** Backend output disagrees with an accepted corpus case
- **THEN** apply SHALL stop until the main agent resolves the cited authority, without changing the golden or Backend output opportunistically
