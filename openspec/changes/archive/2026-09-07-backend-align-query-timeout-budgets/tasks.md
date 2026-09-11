## Task boundary

| Field | Decision |
| --- | --- |
| Status | Implemented and verified for the scoped budgets; whole-script baseline failures documented below. |
| Owner | Primary agent; backend and operations template scopes as listed in proposal.md. |
| Writable paths | Exact source/test/doc/spec paths in proposal.md; no additional files. |
| Read-only protected inputs | All unrelated dirty work, other changes, dependencies, contracts and higher authorities. |
| Deletion complement | Only archive this completed change. |
| Mutable refs | None. |
| Consumes | User-approved budget values and reviewed design/specs. |
| Produces | Implemented defaults, tests and honest acceptance evidence. |
| Dependencies | Planning → backend/operations definitions → validation → spec sync/archive → authorized local restart. |
| Deliverables | Scoped patch and evidence below. |
| Acceptance | Focused Go tests; backend full gate on clean LF export; operations runtime test; strict OpenSpec and diff hygiene; local smoke. |
| Non-goals | No protocol compatibility repair or unrelated frontend changes. |
| Operations deferred | All production actions and remote integration. |
| Stop/rollback conditions | Check branch/HEAD/dirty scope before each block; preserve prior rate edit, stop on concurrent overlap or wider necessary fix. No destructive git operations or broad cleanup. |

## 1. Specification

- [x] 1.1 Confirm no active change owns the budgets; finish artifacts, review boundary and strictly validate.

## 2. Backend

- [x] 2.1 Preflight master/3612f50 and known dirty state; apply approved defaults in the five existing runtime files and update backend README.
- [x] 2.2 Verify per-attempt deadline propagation, queue-inclusive compute deadline and HTTP/worker budget compatibility using existing test files; run focused tests.

## 3. Operations definitions

- [x] 3.1 Preflight the unchanged operations files; update only repository Nginx wait, regression assertion and README.
- [x] 3.2 Run backend full gate and operations runtime tests; record exact results and any baseline limitations.

## 4. Completion

- [x] 4.1 Sync the four delta specs, archive this change and run all-spec strict validation plus git diff --check.
- [x] 4.2 Rebuild/restart the local API, verify health/query/images and probe zhong_mo without claiming a protocol failure is fixed.

## Evidence

Planning review: the user's five values are explicit; the shared compute budget starts before queue admission; the 130-second template wait is the necessary outer compatibility update. No new dependency or runtime owner is introduced. Strict change validation passed before apply. Backend source.go's prior rate-only edit is preserved.

- Focused Windows Go 1.26.5 tests passed: `go test ./internal/publiccollection ./internal/runtimecache`, selected middleware/server tests, and the new per-attempt, queue-budget and outer-budget regression tests.
- Clean LF export: Git HEAD 3612f50 plus the exact owned backend/operations patch, excluding all unrelated work, at `/tmp/bgmss-timeout-validation-20260907/repo` in local Ubuntu WSL. Tools: Go 1.26.5 linux/amd64 extracted from its downloaded Go toolchain module into the check's required backend-local module cache; Node 24.18.0; npm 11.16.0; jq 1.8.1. No project dependency versions changed.
- `bash backend/scripts/check.sh` (from backend: `bash scripts/check.sh`) passed all generated-wire checks, the HTTP/app/observability/publiccollection suites, query/ranking/candidates/persondetail/partners/costar tests, runtimecache and statistics 20 repetitions, three bounded fuzz checks, benchmarks and HTTP wire tests, then failed because it still names the absent `internal/archive/contracttest` directory. `git ls-tree HEAD backend/internal/archive/contracttest` is empty; this is an unchanged baseline script reference.
- `bash operations/test/runtime.sh` passed the new proxy-timeout assertion but exited 1 at its pre-existing invalid-build-metadata test: `verify_build_metadata` calls `die`/`exit` in the current shell. The unmodified HEAD operations export reproduced exit 1. No full operations-pass claim is made; this independent harness repair is outside scope.
- Local API rebuilt and restarted using the existing launcher. Readiness, Catalog, real global rankings (4.88s client time), person image and subject image checks returned success. The frontend process was preserved. Production was not accessed or deployed.
- `zhong_mo`, anime/completed+in_progress/director/count: HTTP 502 after 17.31s, `UPSTREAM_PROTOCOL_ERROR`, request ID `3cf1987e67300224d1a9be3601440ec6`. Collection phase was 17.048s. This reproduces the separate upstream protocol issue, not a timeout; it is not repaired by this change.
- Main capability specs synchronized; scoped diff hygiene and strict change validation passed. No commit, push, merge, release or production deployment performed.
- Independent Linux affected-component checks passed after the baseline script failure: `go test ./...`, `go test -race ./...`, `go vet ./...`, and `go build ./...` (21 packages). These actual checks do not turn either failing umbrella script into a pass.
- `openspec validate --all --strict --json`: 80/80 items passed before archival (27 changes, 53 specs).
