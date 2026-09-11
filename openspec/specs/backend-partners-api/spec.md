# backend-partners-api Specification

## Purpose
Define bounded server-authoritative partner analysis that requires exact shared raw Subjects, derives summaries, leaders, and ranks from complete sets before view projection, uses immutable semantic caching, and exposes strict cancellable transport.
## Requirements
### Requirement: Partners SHALL require real raw-Subject cooperation

The backend SHALL union each source identity at raw Subject level, find
candidates through the selected query identities, and retain a partner only
when source and candidate share at least one raw Subject. Series aggregation
SHALL occur only after intersection; different works in one series SHALL not
create a partnership. Source identities SHALL actually match the source.

#### Scenario: Two people touch different series members
- **WHEN** two people have no common raw Subject but participate in different works of one series
- **THEN** they SHALL not be partners

#### Scenario: A staffset source matches an exact member
- **WHEN** a source selects a staffset identity backed by an exact member credit
- **THEN** the source identity SHALL remain the staffset key and the work SHALL be counted once

### Requirement: Partner summary, leaders, and ranks SHALL use complete sets

Candidate position filtering SHALL establish the complete partner set.
Summary and fixed ordered leaders SHALL derive from that complete unsearched
set and SHALL not change for ordinary search/page/sort. Each leader SHALL exist
even when its item is null. Rows SHALL expose only position keys that really
contributed common works. Sorting SHALL use missing-last strict total ordering;
rank SHALL be assigned before search and pagination.

#### Scenario: A leader is outside the current page
- **WHEN** the best overall partner is not on the requested page
- **THEN** the overall leader SHALL still contain that complete PartnerCore

#### Scenario: Search returns rank gaps
- **WHEN** search retains partners originally ranked 2 and 8
- **THEN** the response SHALL preserve ranks 2 and 8

### Requirement: Partners execution SHALL be bounded and ownership-safe

The service SHALL cache one immutable complete core by operation, dataVersion,
queryDigest, canonical input digest, and personal collectionDigest. View fields
SHALL not enter the core key. Published and projected values SHALL be deep
ownership-safe. The same-origin handler SHALL enforce strict JSON, cancellation,
request identity, no-store results, stable errors, and bounded 1–60 second
Retry-After for rate-limited or busy outcomes.

#### Scenario: Two callers mutate returned pages
- **WHEN** one caller changes its returned partner data
- **THEN** cached data and another caller's result SHALL remain unchanged

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
