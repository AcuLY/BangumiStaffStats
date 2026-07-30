## Why

The integrated development acceptance must run the authoritative Backend
quality gate against a caller-copied, content-sealed Go closure. The current
gate recursively makes `backend/.cache` writable and deletes it on entry and
exit, so it cannot both consume that closure under write denial and leave it
available for the required final reseal.

## What Changes

- Add one explicit acceptance-only `BGMSS_ACCEPTANCE_GOROOT` mode to
  `backend/scripts/check.sh`.
- In that mode, admit only the exact canonical darwin/arm64 Go 1.26.5 GOROOT
  `backend/.cache/go-mod/golang.org/toolchain@v0.0.1-go1.26.5.darwin-arm64`,
  bind the gate and its child generators to that GOROOT's `go`/`gofmt` with
  local toolchain selection, preserve the complete preseeded `go-mod` closure,
  and clean only the gate's other exact disposable roots.
- Reject missing, ambiguous, linked, out-of-root, conflicting, incomplete, or
  wrong-version acceptance toolchains before product checks run.
- Preserve the existing no-variable developer/CI behavior, including
  toolchain bootstrap and complete `.cache`/`.tmp` cleanup.
- Add no dependency, public API, schema, product behavior, visual change, or
  production-operation behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-runtime-foundation`: Extend the authoritative Backend quality gate
  with a narrowly admitted sealed-toolchain execution mode while preserving
  its ordinary clean-room behavior.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Proposed prerequisite to `complete-integrated-development-acceptance`; apply is blocked until proposal, spec, design, and tasks are complete, strict-valid, explicitly reviewed, and approved by the main agent. |
| Owner | One Backend apply subagent; main agent owns OpenSpec review, lifecycle, and acceptance. The integrated-acceptance owner remains paused until this prerequisite is archived and a new candidate is selected. |
| Writable paths | `backend/scripts/check.sh`, new `backend/scripts/check-toolchain-mode.sh`, new `backend/scripts/check-toolchain-mode-test.sh`, only the acceptance-mode `GOTOOLCHAIN` branch in the seven existing `backend/scripts/generate-{query,catalog,rankings,candidates,person-detail,partners,co-star}-wire.sh` files, and this change's task markers. No other product or contract path. |
| Read-only protected inputs | All tracked paths except the exact declared check/helper/test/generator-script set and task markers; paused `contracts/acceptance/**`; existing active acceptance OpenSpec; `backend/go.mod`, `backend/go.sum`, all nondeclared Backend files, contracts, artifacts, Archives, oracle, offline cache, and external repositories. |
| Deletion complement | No tracked deletion. The script may delete only its existing documented disposable roots. In acceptance mode it MUST preserve `backend/.cache/go-mod` and may delete only exact sibling cache roots plus `backend/.tmp`; it MUST NOT recursively enumerate/clean, chmod, mutate, or follow a symlink in the preserved closure. Exact declared witness reads and the admitted Go tool's read-only module/toolchain consumption remain allowed. |
| Mutable refs | Local `codex/formal-rewrite` only for main-agent commit/push after acceptance; apply does not mutate refs. |
| Consumes | Current `backend/scripts/check.sh`; Go 1.26.5 module/toolchain contract; reviewed acceptance lifecycle contract. |
| Produces | One backward-compatible quality-gate extension and executable positive/negative evidence. |
| Dependencies | Existing Bash/macOS utilities and pinned Go only; no new library or tool. |
| Deliverables | Script change, completed task markers, strict validation, default-mode and sealed-mode evidence, independent zero-P0/P1 review. |
| Acceptance | Focused committed shell contract tests for exact set/unset/path/link/file/version/architecture/failure cases; ordinary-mode regression; real sealed-mode Backend gate with pre/post/final tool-closure equality; repository inventory, `git diff --check`, and strict OpenSpec validation. |
| Non-goals | No change to Backend runtime/API/statistics, Frontend, Updater, Contracts, artifacts in this change, or the fixed prototype oracle. Product-visible behavior remains `PRESERVE_ORACLE` at commit `644b7748674e553f863d0ffd61d029f86fdc0717`; there is no intentional product delta or new product capability. |
| Operations deferred | Release, deployment, production configuration, activation, migration, monitoring operation, and legacy retirement remain deferred. |
| Stop/rollback conditions | Stop on any unexpected dirty path, inability to prove canonical containment, tool mutation, ordinary-mode regression, acceptance-spec conflict, or P0/P1 review finding. Roll back only the exact owned diff with a reviewed reverse patch; preserve evidence for diagnosis. |

This change does not touch another repository or external service/state. A
later main-agent push of the reviewed repository commit is authorized by the
user, but release, deployment, host mutation, and production activation are
not.
