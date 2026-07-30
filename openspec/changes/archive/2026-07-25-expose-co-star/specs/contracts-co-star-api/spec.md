## ADDED Requirements

### Requirement: Co-star wire SHALL encode one closed pair or group analysis

`POST /api/v1/co-star` SHALL accept `query`, 2–10 ordered unique participants
with positive JSON-safe person IDs and ordered-unique non-empty opaque query
PositionKeys, and optional view. Total identities SHALL not exceed 20.
The endpoint SHALL reject zero/one participant, duplicates, excessive people,
excessive identities, unknown members, and `refreshCollection` with stable
field/error codes.

Success SHALL be a closed scope-specific pair/group union with workUnit,
ordered participants, summary, tags, rating datasets, optional personal
preference, group-only matrix, current work items, pagination, request metadata,
and personal-only collection metadata.

#### Scenario: One participant is submitted
- **WHEN** a request contains one participant
- **THEN** it SHALL be rejected because one-person analysis belongs to partners

#### Scenario: A global group succeeds
- **WHEN** a global request with three participants succeeds
- **THEN** it SHALL contain the group matrix and omit preference, personal rating members, and collection metadata

### Requirement: Co-star generation SHALL be isolated

Go and TypeScript generation SHALL project only `/co-star` plus transitive
schemas, use fixed capability-owned operation metadata, and emit a reproducible
projection hash. Unrelated paths and shared authority descriptions SHALL not
affect generated co-star bytes.

#### Scenario: An unrelated operation changes
- **WHEN** another OpenAPI path or the shared top-level description changes
- **THEN** co-star projection hash and generated files SHALL remain unchanged
