# backend-runtime-foundation Specification

## Purpose
Define the pinned clean-room Go process, package boundaries, generated query
wire, direct shared-contract acceptance, and executable quality gates on which
later backend features depend.
## Requirements
### Requirement: The backend SHALL be one pinned Go module

`backend/go.mod` SHALL declare module
`github.com/AcuLY/BangumiStaffStats/backend`, language `go 1.26.0`, toolchain
`go1.26.5`, and `oapi-codegen/v2@v2.8.0` as the sole direct development tool.
Its exact direct runtime requirements SHALL be
`github.com/oapi-codegen/runtime v1.1.2` and
`modernc.org/sqlite v1.54.0`; `modernc.org/libc` SHALL remain an indirect
requirement at exactly `v1.74.1`. There SHALL be no root or nested Go
module/workspace/vendor tree.

#### Scenario: Foundation uses the approved toolchain

- **WHEN** backend generation, build, test, race, or vet commands run
- **THEN** they SHALL use Go `1.26.5` with backend-local cache/temp state

#### Scenario: Another module or direct dependency appears

- **WHEN** a root/nested module, workspace, vendor tree, unapproved direct dependency, or wrong SQLite/libc version is present
- **THEN** acceptance SHALL fail

### Requirement: Package dependencies SHALL follow the approved direction

The foundation SHALL enforce `cmd/api -> app -> {archive,httpapi}`,
`cmd/archive-smoke -> archive`, `httpapi -> wire`, and
`query -> {archive,cache,collection}` for later admitted query work.
`archive`, `query`, `cache`, and `collection` MUST NOT import transport or
application layers. Production imports outside the standard library SHALL be
limited to the generated wire runtime and the approved SQLite driver/VFS.
Cycles, unknown packages, nested modules, and production `workbench` naming
SHALL be rejected.

#### Scenario: Foundation graph is valid

- **WHEN** the architecture test inspects the real module
- **THEN** all current packages and external imports SHALL follow the approved direction

#### Scenario: A reverse edge or cycle is introduced

- **WHEN** a package violates the allowed graph or imports an unapproved production dependency
- **THEN** the architecture test SHALL fail with the offending edge/package

### Requirement: Query DTOs SHALL be generated only at the HTTP boundary

Exact `oapi-codegen/v2@v2.8.0` with `models,skip-prune` SHALL consume a
backend-local deterministic projection of the shared OpenAPI authority and
generate only `backend/internal/httpapi/wire/query_wire.gen.go`. The projector
SHALL copy the OpenAPI document and seven schemas, delete only schema-root
`$id`/`$schema`, prove all 17 components, and use locked Redocly `2.40.0` to
fully dereference them below `backend/.tmp/`. It SHALL copy the accepted
contract package metadata/lock into a backend-local temporary tool root and
SHALL never install, write, or leave generated state below `contracts/**`.
Check mode SHALL independently reproduce the bundle and Go output, prove byte
stability against shared manifest evidence, and compare the committed file.

#### Scenario: Generated query model is current

- **WHEN** generation check runs against the unchanged shared contract and accepted lock
- **THEN** the bundle SHALL match shared byte/hash evidence and the non-empty Go output SHALL contain all 17 components and match the committed file

#### Scenario: Generation drifts or expands scope

- **WHEN** output differs, is header-only, mutates contracts, leaves a projection/tool install, or includes handlers/clients/private schemas
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

### Requirement: The API process SHALL have a bounded lifecycle

The standard-library server SHALL accept a supplied listener and an explicit
absolute Archive root. It SHALL validate and atomically publish one complete
Archive store before serving; propagate Archive-load, startup, serve, and
close failures; and complete context-driven graceful shutdown within five
seconds without leaking goroutines. Shutdown SHALL stop serving before it
clears readiness and closes the Store. At this stage the mux SHALL define no
product, health, metrics, readiness, or placeholder route.

#### Scenario: Empty process starts and stops

- **WHEN** a loopback server starts with a valid Archive, receives a request, and its context is canceled
- **THEN** the request SHALL receive the empty-mux 404, serving SHALL stop, readiness SHALL clear, and the Store SHALL close

#### Scenario: Listener or serve fails

- **WHEN** startup or serving returns a non-normal error
- **THEN** the application SHALL propagate failure, close any published Store, and the process SHALL exit nonzero

#### Scenario: Archive loading fails

- **WHEN** the explicit Archive root is missing, relative, invalid, incompatible, or canceled before publication
- **THEN** serving SHALL not begin, readiness SHALL remain false, opened resources SHALL close, and the application SHALL propagate the sanitized failure
