## Capability Boundary

| Field | Boundary |
|---|---|
| Status | Planned; apply requires strict validation and primary review |
| Owner | Backend |
| Writable paths | Exact Backend inventory in this change's design.md; this delta and root capability at primary-owned sync |
| Read-only protected inputs | Contracts authority, ranking wire/goldens, query/evaluation formulas, other statistics files, cache inputs, Archive and unrelated work |
| Deletion complement | Replace only private ranking maximum implementation with equivalent shared statistics implementation |
| Mutable refs | None |
| Consumes | Complete partners/rankings PersonSortEntry values, exact Rational, selected metric |
| Produces | Stable partners scale and unchanged ranking scale through one bounded helper |
| Dependencies | Accepted Contracts shape first; B2/gate script owner handoff before exact inventory update |
| Deliverables | Shared helper, partners projection/clone wiring and regression evidence |
| Acceptance | statistics/ranking/partners tests, HTTP/wire tests, coordinated full Backend gate |
| Non-goals | New cache/network/store access, leaders/rank changes, duplicate statistical formula, Archive migration or runtime activation |
| Operations deferred | All service/host/pointer/production mutations |
| Stop/rollback conditions | Scope or ownership conflict, ranking drift or failed checks; retain all pre-existing changes |

## ADDED Requirements

### Requirement: Partner metric scale SHALL use the complete filtered core

For the normalized selected sort, partners projection SHALL derive metricScale from every partner in the complete candidate-position-filtered core before search, page and pageSize. Count SHALL use the maximum workCount; average/overall SHALL use the maximum non-null integer hundredths; preference SHALL use the maximum absolute non-null Rational score with exact comparison. An empty or all-unavailable metric population SHALL yield null, while a valid zero SHALL remain zero.

Changing search, page, pageSize or order SHALL not change the selected metric scale. Changing sort SHALL select the other metric's scale on the same core. Changing candidatePositionKey, source or semantic query/data/collection identity SHALL use the resulting new population. Leaders SHALL remain signed descending maxima and SHALL not be repurposed as absolute maxima. Existing source statistics, complete partner count, row rank and identity semantics SHALL be preserved.

#### Scenario: Search hides the negative maximum
- **WHEN** the full population includes preference +1/5 and -4/5 but search/page exposes only +1/5
- **THEN** the response scale SHALL remain 4/5
- **AND** order reversal and pageSize changes SHALL keep that scale

#### Scenario: Candidate position changes the population
- **WHEN** the selected candidate position excludes the partner carrying the prior maximum
- **THEN** the scale SHALL be computed from the newly filtered complete set together with its existing summary/leaders
- **AND** a missing metric SHALL not be replaced with an estimate from another field

### Requirement: Rankings and partners SHALL share equivalent bounded maximum evaluation

The existing statistics owner SHALL provide one context-aware maximum scan over existing PersonSortEntry values. Rankings and partners SHALL reuse it without importing each other's operation package. It SHALL preserve existing ranking integer/Rational/null representations, use exact absolute rational comparison, and honor cancellation without partial publication. The scale SHALL remain a view projection, not a new cached core member or cache-key input. Published scale values SHALL not expose mutable ownership of core evidence.

#### Scenario: Existing rankings are projected after extraction
- **WHEN** existing ranking cases and empty/missing/zero/fractional edge cases execute
- **THEN** their scale values, summary, ordering and serialized contract SHALL remain unchanged

#### Scenario: Projection is canceled or its result is modified
- **WHEN** a scan is canceled, or a caller modifies returned scale data
- **THEN** cancellation SHALL publish no partial response
- **AND** cached rows and another caller's scale SHALL remain unchanged
