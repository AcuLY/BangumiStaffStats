## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | Proposed prerequisite; implementation blocked until all artifacts are strict-valid and main-agent approved. |
| Owner | Backend apply subagent; main agent owns specification and acceptance. |
| Writable paths | `backend/scripts/check.sh`, new `backend/scripts/check-toolchain-mode.sh`, new `backend/scripts/check-toolchain-mode-test.sh`, only the acceptance-mode `GOTOOLCHAIN` branch in the seven existing wire-generator shell entrypoints, and this change's task markers. |
| Read-only protected inputs | Every other tracked path, paused `contracts/acceptance/**`, existing Archives/artifacts/oracle/caches, and external repositories. |
| Deletion complement | No tracked deletion. Ordinary cleanup remains unchanged. Acceptance cleanup preserves `backend/.cache/go-mod` without chmod/traversal and removes only exact disposable siblings and `backend/.tmp`. |
| Mutable refs | None during apply. |
| Consumes | Existing Backend gate, pinned Go 1.26.5 contract, caller-preseeded module/toolchain closure. |
| Produces | Backward-compatible sealed-toolchain gate mode and verification evidence. |
| Dependencies | Existing Bash/macOS utilities and pinned Go; no additions. |
| Deliverables | One script change plus positive, negative, regression, seal, cleanup, and strict-validation results. |
| Acceptance | All scenarios below, full ordinary and acceptance-mode gate runs, independent zero-P0/P1 review. |
| Non-goals | Runtime/API/statistics/contracts/frontend/updater/oracle changes, nested OpenSpec, release, or deployment. |
| Operations deferred | All production operations remain deferred. |
| Stop/rollback conditions | Stop on unexpected dirty scope, ambiguous containment, linked executable/path, mutation, residue, regression, or review finding; reverse only the owned patch. |

## MODIFIED Requirements

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
