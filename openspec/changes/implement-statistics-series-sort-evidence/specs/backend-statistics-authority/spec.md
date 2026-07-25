## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency review and strict validation passed |
| Owner | One Backend owner implements after the accepted Contracts handoff; the main agent audits and accepts; no frontend, updater, transport, or cache owner may duplicate the algorithms. |
| Writable paths | `backend/internal/statistics/**`, `backend/internal/architecture/dependencies_test.go`, `backend/scripts/check.sh`, `backend/README.md`, and only the Backend task markers in `openspec/changes/implement-statistics-series-sort-evidence/tasks.md`. |
| Read-only protected inputs | All authorities and protected inputs in `proposal.md`, especially `contracts/goldens/statistics/**`, `backend/internal/query/**`, `backend/internal/archive/**`, and `backend/internal/httpapi/**`. |
| Deletion complement | None; no existing path outside the exact writable set may be deleted, renamed, or replaced. |
| Mutable refs | None; no staging, commit, archive, branch/ref update, push, pull request, tag, release, deployment, or activation. |
| Consumes | Accepted immutable query-result sets and contribution evidence, validated rating/date/relation facts passed through accepted Backend boundaries, and the reviewed statistics corpus. |
| Produces | Immutable Go subject/series units, rating and preference summaries, distributions/timelines, complete aggregate summaries/evidence, and deterministic sorted indexes. |
| Dependencies | Exact direct apply dependency: `implement-query-result-set`; apply SHALL remain blocked until it is accepted and exited, and Backend mutation SHALL additionally wait for accepted Contracts handoff in this change. |
| Deliverables | One dependency-clean Go domain package, corpus adapter tests, focused unit/property/fuzz/integration/race tests, architecture/check inventory updates, and exact gate evidence. |
| Acceptance | Every corpus case; subject/series/personal/global matrices; cancellation/no-partial-result; immutable output; shuffled/repeated determinism; comparator laws; full Backend test/race/vet/build/check and strict OpenSpec gates. |
| Non-goals | HTTP handlers/DTO/OpenAPI, search/page projections, cache, collection client, frontend, query filtering/set algebra changes, Archive/schema/catalog production, or operations. |
| Operations deferred | Production roots, activation/reload/rollback, scheduling, services/proxies, monitoring rollout, secrets, migration, release, deployment, cutover, and legacy deletion. |
| Stop/rollback conditions | Stop on unmet dependency/handoff, authority or protected-path drift, corpus mismatch, mutable/write-capable data access, decimal ambiguity, comparator-law failure, race, nondeterminism, or failed gate. Remove only the unstaged Backend-owned candidate and preserve all accepted state. |

## ADDED Requirements

### Requirement: Go SHALL be the sole rating and decimal authority

The Backend SHALL validate score facts exactly once and calculate statistics
without binary-floating truncation. Finite decimals in `[1,10]` are valid;
`0`, null, and missing are unrated; other values are stable data errors. The
implementation SHALL use exact decimal/rational or equivalently proven
fixed-point arithmetic for aggregation, truncation, half-up rounding, equality,
and ordering. It SHALL normalize negative zero to zero and SHALL NOT read
deprecated `globalScorePrior` or `votePriorCount`.

Average, valid-unit count, overall, explicit 1–10 `ratingCount`, rating
distribution, and quarterly timeline SHALL reproduce
`contracts-statistics-goldens`. No consumer SHALL need to correct `8.20`,
`[6,7,7]`, missing values, or the five-score/five-unit prior.

#### Scenario: Mixed and all-unrated ratings are evaluated
- **WHEN** accepted raw result units contain valid, zero, null, and missing ratings
- **THEN** unit counts SHALL include every eligible unit, rated evidence SHALL include only valid units, and absent average/overall SHALL remain null rather than zero

#### Scenario: Invalid score reaches the authority
- **WHEN** a score is non-finite, below `1`, or above `10`
- **THEN** evaluation SHALL return its stable data error and SHALL publish no partial metrics, buckets, timeline, or sort index

#### Scenario: Exact decimal sentinels are evaluated
- **WHEN** mathematical `8.20`, `[6,7,7]`, and exact overall half-rounding boundaries are evaluated repeatedly
- **THEN** average, timeline, overall, equality, and sort values SHALL match the exact corpus on every run

### Requirement: Series aggregation SHALL use stable connected components and actual participation

When `mergeSeries=false`, each accepted raw Subject SHALL be one statistical
unit. When `mergeSeries=true`, only anime Subjects SHALL merge, using the
undirected same-type connected-component boundary and stable minimum-positive
Series ID fixed by the corpus. Invalid/missing/unknown/cross-type references
SHALL leave the affected Subject in its valid component or singleton and SHALL
never merge unrelated Subjects.

The Backend SHALL deterministically derive the complete member order and
representative using versioned sequel-order evidence. For a directed relation,
same-type IDs `1,3,4,6,11` add `+5` to the source and `-5` to the target;
same-type IDs `2,5,12` add `-5` to the source and `+5` to the target; and IDs
`7,8,9,10,14,99` add `+1` to both endpoints as in the approved oracle rule.
Members SHALL first order by accumulated score descending, canonical partial
date ascending (a shorter known precision precedes a longer value with the same
known prefix; wholly missing is last), then Subject ID ascending. If at least
two members exist, the leading score difference is below `15`, and the first
date is later than the second, the first two SHALL swap. The resulting first
member is the representative and the zero-based position is `sequelOrder`.

Only Subjects actually surviving query/participant set algebra SHALL form a
unit's matched members, ratings, latest collection update, and contribution
counts. Complete component members SHALL be retained separately as evidence.
Multi-person intersection SHALL already have happened on raw Subject IDs;
series mapping SHALL NOT turn different-work participation into cooperation.
Each valid series average SHALL receive one equal outer weight, regardless of
member or matched-work count. Series mode SHALL return no synthesized timeline.

#### Scenario: Components are built from shuffled relations
- **WHEN** identical Subject and relation facts are supplied in repeatedly shuffled order
- **THEN** component IDs, member order, representative, matched members, and evidence SHALL remain byte-equivalent after canonical serialization

#### Scenario: Participants match different works in one series
- **WHEN** the accepted raw intersection is empty although participants each match another member of the same component
- **THEN** the statistics result SHALL remain an empty common set and SHALL NOT infer a common series

#### Scenario: Series of unequal size are rated
- **WHEN** accepted matched Subjects form valid series units with unequal numbers of rated members
- **THEN** each series SHALL first produce its normalized matched-work value and each valid series SHALL contribute exactly one outer observation to average and overall

### Requirement: Preference SHALL expose reproducible personal evidence

Personal evaluation SHALL compare only raw Subjects with both valid personal
and global ratings. It SHALL retain exact zero differences. It SHALL publish
`comparableCount`, natural `comparableSeriesCount`, current-mode
`effectiveEvidence`, exact `mean`, `evidenceWeight`, `score`, and stable ordered
source/unit IDs. Subject mode SHALL weight Subjects equally; series mode SHALL
average comparable differences inside each series then weight series equally.
The fixed evidence prior SHALL be five units.

No evidence SHALL produce zero counts and null `mean`/`score`. Exact neutral
evidence SHALL produce numeric zero, not null. Global evaluation SHALL neither
accept nor access personal rating/collection input and SHALL produce no
preference value or evidence.

#### Scenario: Sparse and dense evidence produce the same displayed score
- **WHEN** one strong sparse case and one mild dense case have the same final preference score
- **THEN** their distinct counts, mean, evidence weight, ordered evidence IDs, and exact score SHALL all be retained so the equality remains explainable

#### Scenario: Global statistics are evaluated
- **WHEN** scope is global
- **THEN** the authority SHALL complete without calling a personal accessor and SHALL omit preference rather than returning a zero-valued personal structure

### Requirement: Distributions, timelines, summaries, and evidence SHALL derive from the complete core

The authority SHALL emit ten ordered distribution buckets for each requested
rating source, using statistical-unit averages and exact `.5`-up boundaries.
Bucket counts plus invalid/missing exclusions SHALL reconcile with rated-unit
evidence. Subject-mode timelines SHALL include only valid scores whose
canonical dates are precise to at least month, grouped by year/quarter with the
same normalized average rule; series-mode timelines SHALL be empty.

Complete summaries SHALL derive person count, unit kind, globally unique
work/series count, and applicable unique Character-ID count before any future
search or page projection. Per-person and group evidence SHALL retain stable
unit IDs, valid-rated IDs, comparable IDs, exact identity/contribution
attribution, matched versus complete series members, and every count used by
average, overall, preference, distribution, and summary. All returned slices
and maps SHALL be immutable to callers and canonically ordered.

#### Scenario: Overlapping people and identities are summarized
- **WHEN** accepted results contain duplicate references to the same Subject, series, character, and exact contribution
- **THEN** aggregate counts SHALL de-duplicate the correct entity while ordered evidence SHALL preserve each distinct attribution without double-counting a metric

#### Scenario: A caller mutates a returned projection
- **WHEN** a caller mutates its own copied sort/projection slice after evaluation
- **THEN** the published core, its summaries/evidence, and a later evaluation SHALL remain unchanged

### Requirement: Every sort profile SHALL implement a strict total order

The Backend SHALL implement the exact person, work/series, and person-combination
chains in `contracts-statistics-goldens`. Only the chosen primary metric SHALL
change direction; all secondary evidence directions remain fixed. Missing
primary values SHALL follow valid values in both directions. Final identity
comparison SHALL be Person ID, Subject/Series ID, or lexicographically sorted
Person-ID tuple ascending.

Comparators SHALL satisfy irreflexivity, antisymmetry, and transitivity; they
SHALL NOT use `>=`, reverse the complete descending list to implement ascending,
depend on map/input order, drop missing entities, or mutate the immutable core.
Rank-capable downstream consumers SHALL therefore receive one complete sorted
index from which search and pagination can later project without recalculating
metrics or changing the entity set.

#### Scenario: Comparator laws are checked
- **WHEN** generated entities including valid, missing, tied, and boundary values are checked pairwise and in triples
- **THEN** every sort profile and direction SHALL satisfy strict-order laws and preserve the exact entity multiset

#### Scenario: Stable ID breaks a complete tie
- **WHEN** all business and evidence keys tie for distinct entities
- **THEN** the stable entity ID or stable sorted ID tuple SHALL determine one identical order across shuffled, repeated, and race-enabled runs

### Requirement: Evaluation SHALL be bounded, cancelable, deterministic, and dependency-clean

The statistics package SHALL consume immutable typed inputs and SHALL import no
HTTP, generated wire, collection-client, cache, frontend, or updater package.
It SHALL perform no write-capable SQL, network access, filesystem mutation, or
global mutable publication. Long component, aggregation, distribution,
evidence, and sorting loops SHALL observe caller cancellation and return no
partial result. Work and memory SHALL be characterized on bounded synthetic and
complete accepted Archive/query inputs without claiming an unmeasured
production SLO.

Identical canonical inputs SHALL produce identical canonical outputs under
repeated, shuffled, fuzz/property, concurrent, and race-enabled execution.

#### Scenario: Evaluation is canceled
- **WHEN** cancellation occurs during each major long-running phase
- **THEN** the call SHALL return the stable cancellation classification, publish no partial result, leak no goroutine, and leave all inputs reusable

#### Scenario: Full Backend gates run
- **WHEN** targeted corpus tests and repository-wide test, race, vet, build, architecture, dependency, and check-script gates run
- **THEN** all SHALL pass with no nested OpenSpec root, undeclared dependency, protected-path mutation, or nondeterministic output
