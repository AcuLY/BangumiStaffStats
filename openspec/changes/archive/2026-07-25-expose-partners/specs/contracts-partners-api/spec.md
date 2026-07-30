## ADDED Requirements

### Requirement: Partners wire SHALL be closed and scope-safe

`POST /api/v1/partners` SHALL accept a closed document containing `query`,
`input.source.personId`, a non-empty ordered-unique
`input.source.positionKeys`, optional `input.candidatePositionKey`, and optional
view. It SHALL reject `refreshCollection`. Source and candidate position keys
SHALL belong to the effective query and SHALL be treated as opaque catalog
identities.

Success SHALL return workUnit, source identity/metrics, complete summary with
fixed leaders, current items, pagination, request metadata, and personal-only
collection metadata. Global variants SHALL structurally omit all preference and
collection members.

#### Scenario: Candidate filter is omitted
- **WHEN** no candidatePositionKey is submitted
- **THEN** candidates from every query position SHALL be eligible without an `"all"` sentinel

#### Scenario: Global partner is returned
- **WHEN** a global request succeeds
- **THEN** preference and collection fields SHALL be absent rather than null

### Requirement: Partners generation SHALL be isolated

Go and TypeScript generation SHALL project only `/partners` plus transitive
schemas, use fixed capability-owned operation metadata, and emit a reproducible
projection hash. Unrelated paths and shared authority descriptions SHALL not
affect generated partners bytes.

#### Scenario: An unrelated operation changes
- **WHEN** another OpenAPI path or the shared top-level description changes
- **THEN** partners projection hash and generated files SHALL remain unchanged
