## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | Existing accepted foundation amended to describe the implemented and accepted Archive consumer dependency, process lifecycle, and package graph. |
| Owner | Main agent owns this cumulative specification amendment; backend implementation remains owned by `implement-backend-archive-consumer`. |
| Writable paths | This delta file and the lifecycle-generated root `openspec/specs/backend-runtime-foundation/spec.md`; implementation paths remain those declared by the consumer change. |
| Read-only protected inputs | Existing root capability, contracts, guides, all implementation outside the consumer writable set, sibling changes, refs/remotes, hosts, and production. |
| Deletion complement | None. |
| Mutable refs | None before accepted local lifecycle finalization. |
| Consumes | Accepted `backend-runtime-foundation`, the reviewed `backend-archive-consumer` delta, Go `1.26.5`, `modernc.org/sqlite v1.54.0`, and resolved `modernc.org/libc v1.74.1`. |
| Produces | A cumulative foundation contract that admits the consumer's dependencies, Archive-gated serving lifecycle, and real package graph without adding HTTP routes or operations. |
| Dependencies | Accepted `bootstrap-backend-runtime`, `define-archive-manifest-contract`, `correct-archive-subject-semantics`, and `harden-archive-manifest-string-semantics`. |
| Deliverables | Full replacements for the pinned-module, API-lifecycle, and package-direction requirements plus one requirement rename. |
| Acceptance | Exact dependency/architecture tests, valid-Archive startup and invalid-Archive failure tests, full backend gates, strict OpenSpec validation, and synchronized-root review. |
| Non-goals | HTTP routes/observability, business query behavior, Archive production/activation, operations, release, or deployment. |
| Operations deferred | Production roots/listeners, service management, activation/restart, retention, release, and deployment. |
| Stop/rollback conditions | Stop if the existing root requirements drift, the consumer candidate fails, or synchronization would alter any undeclared requirement. |

## RENAMED Requirements

- FROM: `### Requirement: The empty API process SHALL have a bounded lifecycle`
- TO: `### Requirement: The API process SHALL have a bounded lifecycle`

## MODIFIED Requirements

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
