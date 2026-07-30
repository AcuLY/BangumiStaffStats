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
`cmd/archive-smoke -> archive`,
`httpapi -> {imageproxy,observability,wire}`,
`imageproxy -> standard library`, `observability -> standard library`, and
`query -> {archive,cache,collection}` for later admitted query work.
`archive`, `imageproxy`, `query`, `cache`, `collection`, and `observability`
MUST NOT import transport or application layers. Production imports outside
the standard library SHALL remain limited to the generated wire runtime and
the approved SQLite driver/VFS. Cycles, unknown packages, nested modules, and
production `workbench` naming SHALL be rejected.

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
ordinary candidate handoff.

With `BGMSS_ACCEPTANCE_GOROOT` absent, `backend/scripts/check.sh` SHALL retain
its existing behavior: reject a wrong Go version, use its ordinary
`GO_BOOTSTRAP`/automatic pinned-toolchain flow, and recursively clean all of
`backend/.cache` and `backend/.tmp` on entry and every exit.

With `BGMSS_ACCEPTANCE_GOROOT` set, including set-empty, the gate SHALL treat
its exact value as the sole acceptance toolchain authority. The only accepted
lexical and physical value SHALL be the canonical
`$backend_root/.cache/go-mod/golang.org/toolchain@v0.0.1-go1.26.5.darwin-arm64`
path with no trailing slash, `.`/`..`, alias, or normalization difference.
Before running any product check it SHALL prove that `.cache`, `go-mod`,
`golang.org`, the GOROOT, and its `bin` directory are existing real
directories and that none of those descendant components is a symlink. It
SHALL require the module-cache-root `.seed-complete` marker plus GOROOT
`VERSION`, `bin/go`, `bin/gofmt`, `pkg/tool/darwin_arm64/compile`, and
`src/runtime/runtime.go` to be existing regular non-symlink files. `bin/go`
and `bin/gofmt` SHALL be executable and each SHALL have exactly one hard link.
It SHALL reject caller presence of `GO_BOOTSTRAP`, including set-empty;
set-empty/partial/relative/noncanonical/out-of-root/trailing/linked acceptance
input; an incomplete toolchain; and a linked or hard-linked executable.

After structural admission, the gate SHALL set `GOENV=off`, `GOWORK=off`, and
`GOTOOLCHAIN=local`; choose only the admitted `bin/go` and `bin/gofmt`; require
that exact `go` to report `go1.26.5`, the exact admitted GOROOT, and
`go version go1.26.5 darwin/arm64`; and then export its exact `bin/go` as
`GO_BOOTSTRAP`. All seven child generator gates SHALL select that same
`GO_BOOTSTRAP` and SHALL retain `GOTOOLCHAIN=local` in acceptance mode while
their no-variable behavior remains unchanged. `GOMODCACHE` SHALL remain the
containing `backend/.cache/go-mod` closure. The gate and generators SHALL
neither chmod, delete, replace, rename, nor write that preseeded closure. The
gate SHALL preserve the complete closure on success, command failure,
trappable signal exit, and validation failure after admission so the caller
can perform an unconditional final content/inode/mode/link reseal.

Acceptance mode SHALL require the gate-owned writable roots
`backend/.cache/go-build`, `backend/.cache/go-path`,
`backend/.cache/npm`, and `backend/.tmp` to be absent at entry; it SHALL fail
closed rather than clean stale state, treating a dangling exact-root symlink as
present. During the run it may create only those exact disposable roots beside
the preseeded closure. On every admitted-mode exit it SHALL remove those exact
roots without following a symlink or touching the preserved `go-mod` closure.
Within that closure, the gate may read only the listed admission witnesses and
the admitted Go may perform its ordinary read-only module/toolchain
consumption; neither may recursively enumerate for cleanup, follow symlinks,
or mutate the closure. The caller remains responsible for preflight inventory,
outer file-write denial over the sealed closure, post-gate reseal, and final
unconditional reseal.

#### Scenario: Quality matrix passes in ordinary mode

- **WHEN** the documented check script runs without
  `BGMSS_ACCEPTANCE_GOROOT` from a clean backend-local environment
- **THEN** every required command SHALL run successfully, its existing
  bootstrap behavior SHALL remain available, and `.cache`/`.tmp` SHALL leave
  no persistent or ignored residue

#### Scenario: A sealed acceptance toolchain is admitted

- **WHEN** the caller supplies the one exact canonical seeded darwin/arm64 Go
  1.26.5 GOROOT at its fixed module-cache path, denies writes to the complete
  closure, and runs the documented check script
- **THEN** the complete quality matrix SHALL use that exact Go/gofmt identity,
  preserve byte/inode/mode/link equality of the closure through final reseal,
  and remove every other gate-owned disposable root

#### Scenario: Acceptance binding is ambiguous or unsafe

- **WHEN** the variable is set empty or to a partial, relative, noncanonical,
  dot-segment, trailing-slash, wrong-name, or outside path; a required
  directory/file is missing or linked; `go`/`gofmt` is non-executable or
  hard-linked; the tool reports a wrong GOROOT/version/architecture; caller
  `GO_BOOTSTRAP` is present including set-empty; or stale gate-owned writable
  state or dangling exact-root symlink exists
- **THEN** the gate SHALL fail before product checks and SHALL NOT modify,
  chmod, delete, replace, recursively enumerate/clean, or follow a symlink in
  the supplied closure; only the exact declared admission-witness reads are
  allowed

#### Scenario: Acceptance execution fails

- **WHEN** admission succeeds but a product check, child generator, or
  trappable SIGTERM/SIGINT execution fails
- **THEN** exact disposable siblings SHALL be cleaned, the complete
  `go-mod` closure SHALL remain available unchanged for final reseal, and the
  original nonzero or signal-derived outcome SHALL be retained

#### Scenario: Tool state escapes

- **WHEN** a cache, temp file, binary, coverage output, generated scratch file,
  acceptance tool mutation, or undeclared residue appears outside the exact
  mode-specific roots
- **THEN** acceptance SHALL fail without broadly cleaning unrelated paths

#### Scenario: Focused gate contract remains executable

- **WHEN** the committed toolchain-mode shell contract test runs in isolation
- **THEN** it SHALL cover unset/default cleanup, exact acceptance success,
  set-empty, wrong/outside/dot-segment/trailing input, symlink
  ancestor/root/bin/file, missing/non-executable/hard-linked executables,
  wrong version/architecture, caller `GO_BOOTSTRAP` set-empty, dangling stale
  writable-root symlinks, preservation on injected command failure, and
  SIGTERM/SIGINT signal-derived status plus cleanup/preservation

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
absolute Archive root. Before entering `Serve`, it SHALL attempt exactly one
accepted Archive load. Success SHALL atomically publish the complete store. A
non-cancellation load failure SHALL close the candidate, emit exactly one
bounded `archive_load_failed` app/startup event, and then serve only exact
`GET /livez`, `GET /readyz`, `GET /metrics`, and the separately specified
Archive-independent exact image route with readiness false for that process
lifetime; it SHALL NOT retry, reload, fall back, or expose an Archive-dependent
business route. If the process context is canceled during load, startup SHALL
emit the same bounded event and return without serving.

If the mandatory event writer fails or short-writes, startup SHALL close the
owned Archive state, propagate that operational failure, and return without
calling `Serve`; a partial or failed write SHALL NOT authorize an unobservable
degraded runtime.

The process SHALL propagate listener, non-normal serve, and Store-close
failures and SHALL complete context-driven graceful shutdown within five
seconds without leaking goroutines. Shutdown SHALL stop serving before it
clears readiness and closes any published Store.

#### Scenario: Process starts with a valid Archive and stops

- **WHEN** a loopback server loads a valid Archive, serves the three exact infrastructure routes plus the exact image route, and its context is canceled
- **THEN** liveness/readiness/metrics reflect the published store, the image route remains independently bounded, serving stops within the bound, readiness clears, and the Store closes

#### Scenario: Empty process starts and stops

- **WHEN** the superseded empty-mux lifecycle expectation is evaluated after the HTTP runtime and image route are admitted
- **THEN** acceptance SHALL reject empty-mux 404 behavior and require the three exact infrastructure routes plus the exact image route and bounded lifecycle above

#### Scenario: Listener or serve fails

- **WHEN** listener startup or serving returns a non-normal error
- **THEN** the application SHALL propagate failure, close any published Store, and the process SHALL exit nonzero

#### Scenario: Archive loading fails

- **WHEN** the explicit Archive root is missing, relative, invalid, incompatible, or otherwise fails with a non-cancellation outcome
- **THEN** exactly one sanitized startup event SHALL be emitted, `/livez`, `/metrics`, and the exact image route SHALL remain available, `/readyz` SHALL remain 503 without dataVersion, and no retry, fallback, Archive-dependent business route, or partial Store SHALL exist

#### Scenario: Startup is canceled while loading

- **WHEN** process context cancellation wins before Archive publication
- **THEN** the candidate SHALL close, one bounded startup event SHALL be emitted, and serving SHALL not begin

#### Scenario: Startup failure cannot be reported

- **WHEN** an Archive load failure occurs but its mandatory event writer fails
  or short-writes
- **THEN** startup SHALL close the owned Archive state, return the operational
  failure, and SHALL NOT begin serving
