## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: current Go/tool research, final baseline rebind, main semantic review, targeted/all strict validation, and OpenSpec doctor passed; committed: planning status is determined by the containing Git history; pushed/released/deployed: no |
| Owner | One backend subagent implements; main specifies, audits, accepts, and finalizes. |
| Writable paths | `backend/**`, own task markers, and exact accepted OpenSpec lifecycle paths. |
| Protected inputs | Shared contracts/specs, Node/Impeccable/design context, sibling paths, editor state, external/remote/production state. |
| Operations deferred | Push, PR, tag, release, deploy, production services/configuration/secrets, migration, and legacy deletion. |

## ADDED Requirements

### Requirement: The backend SHALL be one pinned Go module

`backend/go.mod` SHALL declare module
`github.com/AcuLY/BangumiStaffStats/backend`, language `go 1.26.0`, toolchain
`go1.26.5`, and `oapi-codegen/v2@v2.8.0` as the sole direct development tool.
There SHALL be no root or nested Go module/workspace/vendor tree.

#### Scenario: Foundation uses the approved toolchain

- **WHEN** backend generation, build, test, race, or vet commands run
- **THEN** they SHALL use Go `1.26.5` with backend-local cache/temp state

#### Scenario: Another module or direct dependency appears

- **WHEN** a root/nested module, workspace, vendor tree, or unapproved direct dependency is present
- **THEN** acceptance SHALL fail

### Requirement: The empty API process SHALL have a bounded lifecycle

The standard-library server SHALL accept a supplied listener, propagate
startup/serve failures, and complete context-driven graceful shutdown within
five seconds without leaking goroutines. The initial mux SHALL define no
product, health, metrics, readiness, or placeholder route.

#### Scenario: Empty process starts and stops

- **WHEN** a loopback server starts, receives a request, and its context is canceled
- **THEN** the request SHALL receive the empty-mux 404 and shutdown SHALL complete

#### Scenario: Listener or serve fails

- **WHEN** startup or serving returns a non-normal error
- **THEN** the application SHALL propagate failure and the process SHALL exit nonzero

### Requirement: Package dependencies SHALL follow the approved direction

The foundation SHALL enforce `cmd -> app -> httpapi -> wire` and reserve
lower-level query/archive/collection/cache packages from importing transport or
application layers. Cycles, external packages, nested modules, and production
`workbench` naming SHALL be rejected.

#### Scenario: Foundation graph is valid

- **WHEN** the architecture test inspects the real module
- **THEN** all current packages SHALL follow the approved direction

#### Scenario: A reverse edge or cycle is introduced

- **WHEN** a package violates the allowed graph
- **THEN** the architecture test SHALL fail with the offending edge/package

### Requirement: Query DTOs SHALL be generated only at the HTTP boundary

The pinned generator SHALL consume the shared OpenAPI authority using
`models,skip-prune` and produce only
`backend/internal/httpapi/wire/query_wire.gen.go`. Check mode SHALL regenerate
to disposable state and byte-compare the committed output.

#### Scenario: Generated query model is current

- **WHEN** generation check runs against the unchanged shared contract
- **THEN** the output SHALL be non-empty, contain the full named component set, and match the committed file

#### Scenario: Generation drifts or expands scope

- **WHEN** output differs, is header-only, or includes handlers/clients/private schemas
- **THEN** acceptance SHALL fail

### Requirement: Go SHALL consume selected query cases directly

Tests SHALL decode shared positive and structural-negative query cases through
generated DTOs and a strict one-value JSON decoder. They SHALL NOT implement
normalization, digest, catalog, result, statistics, or share replay behavior.

#### Scenario: Minimum positive cases are consumed

- **WHEN** the valid personal and global cases are decoded
- **THEN** both SHALL be accepted through the generated adapter

#### Scenario: Selected structural negatives are consumed

- **WHEN** the declared unknown-field, forbidden-field, unsupported-version, or trailing-data cases run
- **THEN** each SHALL be rejected with its contract-declared identity

### Requirement: Go SHALL consume selected Archive cases directly

Archive contract tests SHALL read the indexed contract tree in place, verify
its hashes/DDL identity/compatibility/manifest/pointer/SQLite header evidence,
accept the minimal valid case, and reject the selected indexed negatives. They
SHALL NOT create a private authority or runtime Archive store.

#### Scenario: Minimal Archive evidence is consumed

- **WHEN** the indexed minimal manifest, pointer, compatibility tuple, DDL, and SQLite header are checked
- **THEN** the case SHALL pass without modifying or copying shared contract bytes

#### Scenario: Selected Archive evidence is invalid

- **WHEN** an indexed unknown-field, accounting, unsafe-path, or unsupported-schema case runs
- **THEN** it SHALL produce the indexed stable outcome

### Requirement: Backend quality gates SHALL be reproducible and clean

The repository SHALL provide documented scripts for generated drift,
formatting, targeted/full tests, race, vet, and build. Disposable state SHALL
remain below `backend/.cache` or `backend/.tmp` and both SHALL be absent at
candidate handoff.

#### Scenario: Quality matrix passes

- **WHEN** the documented check script runs from a clean backend-local environment
- **THEN** every required command SHALL run successfully with no persistent or ignored residue

#### Scenario: Tool state escapes

- **WHEN** a cache, temp file, binary, coverage output, or generated scratch file appears elsewhere
- **THEN** acceptance SHALL fail without broadly cleaning unrelated paths

### Requirement: The foundation SHALL remain development-only and path-disjoint

Backend apply SHALL modify only `backend/**` and its own task markers while
frontend/updater owners may run in parallel on their disjoint paths. It SHALL
not perform external service mutations or operations.

#### Scenario: Three foundation owners run in parallel

- **WHEN** each owner writes only its declared runtime root
- **THEN** the candidates MAY be implemented concurrently and accepted independently

#### Scenario: Operations or another owner path is targeted

- **WHEN** backend work attempts push/deploy/production mutation or writes frontend/updater/editor/contracts state
- **THEN** apply SHALL stop before that mutation
