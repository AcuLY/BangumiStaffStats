# backend-public-collection-source Specification

## Purpose
Define the production public-collection adapter pinned to `bangumi-collection-go` v0.1.0, with exact complete DTO mapping for admitted subject types and collection states and stable sanitized upstream-failure classification.
## Requirements
### Requirement: Production SHALL use the fixed public collection client

The backend SHALL consume package `collection` from module
`github.com/AcuLY/bangumi-collection-go` at immutable tag `v0.1.0` through one
internal anonymous adapter, with no module replacement.

#### Scenario: Production runtime starts

- **WHEN** the backend assembles query services
- **THEN** one concurrency-safe anonymous provider SHALL be supplied to
  rankings, candidates, person detail, partners, and co-star
- **AND** the provider SHALL send no Authorization or Cookie

#### Scenario: Module dependency is inspected

- **WHEN** the formal backend module graph is resolved
- **THEN** it SHALL contain exact public tag `v0.1.0`
- **AND** it SHALL contain no `replace`, local path, or pseudo-version for the
  collection client

### Requirement: The adapter SHALL map the complete public DTO exactly

The adapter SHALL support the five admitted subject types and four requested
collection states and SHALL retain every collection field required by the
internal snapshot.

#### Scenario: Public collection is returned

- **WHEN** the external client returns valid records
- **THEN** subject ID/type, status, rate, comment, tags, update time,
  volume/episode progress, and private flag SHALL be preserved exactly
- **AND** an empty public collection SHALL be a successful empty snapshot

#### Scenario: Returned data violates the admitted contract

- **WHEN** a record is nil, inconsistent, duplicated across states, or invalid
- **THEN** the adapter SHALL return a sanitized protocol/decode failure
- **AND** it SHALL NOT choose a winner, drop a record, or publish partial data

### Requirement: Upstream failures SHALL retain stable classifications

Every external failure SHALL map to the internal closed collection-failure
taxonomy without leaking sensitive values or external DTOs.

#### Scenario: Public visibility cannot be established

- **WHEN** upstream explicitly reports a missing user
- **THEN** the adapter SHALL return `FailureNotFound`
- **WHEN** upstream reports unauthorized or forbidden anonymous access
- **THEN** it SHALL return `FailureForbidden`

#### Scenario: Upstream is temporarily or structurally unavailable

- **WHEN** upstream rate limits, returns 5xx, times out, has a transport
  failure, or violates the response contract
- **THEN** the adapter SHALL preserve the corresponding stable internal
  classification
- **AND** parent cancellation SHALL remain cancellation
