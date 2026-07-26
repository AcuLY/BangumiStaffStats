# backend-co-star-api Specification

## Purpose
Define bounded server-authoritative pair and group co-star analysis using exact raw-Subject set algebra, complete scope-correct evidence and contribution provenance, immutable semantic caching, and strict cancellable transport.
## Requirements
### Requirement: Co-star set algebra SHALL use real raw Subjects

For each participant the backend SHALL union selected identity contributions at
raw Subject level, intersect those unions across participants for common works,
and compute each group matrix pair from the corresponding two unions. Series
aggregation SHALL happen after all raw sets are established. Every submitted
identity SHALL really match its participant.

#### Scenario: Participants touch different members of one series
- **WHEN** all participants occur in the same series but share no raw Subject
- **THEN** commonWorkCount SHALL be zero and no common series item SHALL be created

#### Scenario: Group has pair-only overlaps
- **WHEN** three people have pairwise common works but no all-person common work
- **THEN** common items SHALL be empty while matrix pairs retain their independent counts

### Requirement: Co-star evidence SHALL be complete and scope-correct

Participants, summary, tags, ratings datasets, preference, and group matrix
SHALL derive from complete unsearched sets and remain invariant across ordinary
work view changes. Rating datasets SHALL contain common first and then
participant datasets in input order when common works exist; with no common
works datasets SHALL be empty. Global responses SHALL omit personal evidence.
Personal zero preference evidence SHALL remain present with null mean/score.

#### Scenario: Common work search returns no page items
- **WHEN** search matches no common work
- **THEN** complete summary, participants, evidence, and matrix SHALL remain unchanged

#### Scenario: No common works exist
- **WHEN** valid participants have no all-person intersection
- **THEN** the operation SHALL return 200 with zero/empty common projections and normal participant/matrix data

### Requirement: Common work contributions SHALL preserve exact provenance

Subject/series items SHALL reuse person-detail work identity semantics and
contain each participant's actual matching contributions. Staffsets SHALL
retain the requested set PositionKey plus exact member; cast shall retain exact
character/role provenance. Series contributions SHALL include matched
workCount; Subject contributions SHALL omit it.

#### Scenario: One staffset identity matches two members
- **WHEN** a participant's staffset is backed by exact credits on a common series
- **THEN** contributions SHALL preserve the set identity, exact members, stable order, and deduplicated work counts

### Requirement: Co-star execution SHALL be bounded and ownership-safe

The backend SHALL cache immutable complete cores by operation, dataVersion,
queryDigest, canonical ordered input digest, and personal collectionDigest.
View fields SHALL not enter the key. The same-origin handler SHALL enforce
strict JSON, request identity, cancellation, no-store results, stable errors,
and bounded 1–60 second Retry-After for rate-limited or busy outcomes.

#### Scenario: A caller mutates its projected page
- **WHEN** one caller changes returned participant, matrix, or work data
- **THEN** cached data and another caller's result SHALL remain unchanged
