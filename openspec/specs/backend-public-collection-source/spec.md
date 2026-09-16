# backend-public-collection-source Specification

## Purpose
Define the production public-collection adapter pinned to `bangumi-collection-go` v0.1.2, with exact complete DTO mapping for admitted subject types and collection states and stable sanitized upstream-failure classification.
## Requirements
### Requirement: Production SHALL use the fixed public collection client

The backend SHALL consume package `collection` from module
`github.com/AcuLY/bangumi-collection-go` at immutable tag `v0.1.2` through one
internal anonymous adapter, with no module replacement.

#### Scenario: Production runtime starts

- **WHEN** the backend assembles query services
- **THEN** one concurrency-safe anonymous provider SHALL be supplied to
  rankings, candidates, person detail, partners, and co-star
- **AND** the provider SHALL send no Authorization or Cookie

#### Scenario: Module dependency is inspected

- **WHEN** the formal backend module graph is resolved
- **THEN** it SHALL contain exact public tag `v0.1.2`
- **AND** it SHALL contain no `replace`, local path, or pseudo-version for the
  collection client

### Requirement: The adapter SHALL map the complete public DTO exactly

The adapter SHALL support the five admitted subject types and five requested
collection states and SHALL retain every collection field required by the
internal snapshot. The fixed external client SHALL normalize an omitted or
JSON-null optional upstream comment to the same empty string before mapping;
every non-null string SHALL remain exact. A same-ID nested subject may have a
different supported type; this SHALL NOT invalidate the collection record,
whose top-level subject_type remains the returned SubjectType.

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

#### Scenario: Nested subject metadata has another supported type
- **WHEN** the real client receives a collection record with subject_type 2 and a complete same-ID nested subject with type 6
- **THEN** the adapter SHALL return the complete anime collection item with its original subject ID and collection fields
- **AND** downstream statistical inclusion SHALL remain governed by the existing Archive/query authority

The shared `wish` state SHALL map in both directions to the existing client intention state (numeric Bangumi collection type 1). It SHALL participate in snapshot selection, validation, normalization and cache keys just like the other states. No dependency upgrade or credential transmission is required.

#### Scenario: Intention state across media types
- **WHEN** a public collection request includes `wish` for book, anime, music, game or real
- **THEN** the corresponding intention records SHALL remain available and unscored records SHALL count as works, not zero-valued ratings
- **AND** duplicate-state requests SHALL normalize deterministically without changing private/upstream-error classifications

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

### Requirement: Public collection attempts SHALL have an explicit bounded policy

The production anonymous provider SHALL apply a process-shared rate of five
requests per second with burst ten and a 10-second timeout for each outbound
HTTP attempt. Pagination, limiter waiting and retry backoff SHALL stay within
the independent 90-second complete-collection budget. Existing concurrency,
retry count, Retry-After behavior and sanitized failure handling SHALL remain.

#### Scenario: An outbound page attempt begins
- **WHEN** the production provider sends a collection page request
- **THEN** the request SHALL carry an effective deadline no later than ten seconds after attempt start or its parent worker deadline, whichever is earlier
