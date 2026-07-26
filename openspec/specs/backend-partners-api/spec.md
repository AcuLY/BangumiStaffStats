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
