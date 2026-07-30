## MODIFIED Requirements

### Requirement: Production SHALL use the fixed public collection client

The backend SHALL consume package `collection` from module
`github.com/AcuLY/bangumi-collection-go` at immutable tag `v0.1.1` through one
internal anonymous adapter, with no module replacement.

#### Scenario: Production runtime starts

- **WHEN** the backend assembles query services
- **THEN** one concurrency-safe anonymous provider SHALL be supplied to
  rankings, candidates, person detail, partners, and co-star
- **AND** the provider SHALL send no Authorization or Cookie

#### Scenario: Module dependency is inspected

- **WHEN** the formal backend module graph is resolved
- **THEN** it SHALL contain exact public tag `v0.1.1`
- **AND** it SHALL contain no `replace`, local path, or pseudo-version for the
  collection client

### Requirement: The adapter SHALL map the complete public DTO exactly

The adapter SHALL support the five admitted subject types and four requested
collection states and SHALL retain every collection field required by the
internal snapshot. The fixed external client SHALL normalize an omitted or
JSON-null optional upstream comment to the same empty string before mapping;
every non-null string SHALL remain exact.

#### Scenario: Public collection is returned

- **WHEN** the external client returns valid records
- **THEN** subject ID/type, status, rate, normalized comment, tags, update
  time, volume/episode progress, and private flag SHALL be preserved exactly
- **AND** an empty public collection SHALL be a successful empty snapshot

#### Scenario: Optional upstream comment is null

- **WHEN** the real anonymous client receives an otherwise complete valid
  record whose optional `comment` is JSON null
- **THEN** the adapter SHALL return a complete snapshot item with empty comment
- **AND** the record SHALL remain available to personal query operations

#### Scenario: Returned data violates the admitted contract

- **WHEN** a record is nil, inconsistent, duplicated across states, or invalid
- **THEN** the adapter SHALL return a sanitized protocol/decode failure
- **AND** it SHALL NOT choose a winner, drop a record, or publish partial data
