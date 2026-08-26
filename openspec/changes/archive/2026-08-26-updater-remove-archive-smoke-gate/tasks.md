## Task Boundary

| Field | Boundary |
|---|---|
| Status | Planned; implementation starts only after strict validation and zero-P0/P1 review |
| Owner | Primary agent integrates bounded Updater, Backend, Contracts and Operations blocks |
| Writable paths | Exact paths declared in `proposal.md`; lifecycle sync only to nine named root specs |
| Read-only protected inputs | Higher authorities, contracts/schemas/goldens, producer builder/acquisition/manifest, Backend loader/API, Frontend, other worktrees, local Archive, remotes/live host |
| Deletion complement | Only two `backend/cmd/archive-smoke` files and dedicated smoke-specific code/tests/artifact/topology references |
| Mutable refs | Local branch `codex/remove-archive-smoke` and isolated worktree |
| Consumes | Strict-valid reviewed planning plus existing component tests/build definitions |
| Produces | Smoke-free producer, Backend artifact and Operations topology plus synchronized specs |
| Dependencies | Updater/Backend product changes before Operations consumers; Contracts/spec lifecycle after verified implementation |
| Deliverables | All implementation blocks, regression coverage, residual-reference audit and lifecycle evidence |
| Acceptance | Component gates, Operations runtime test, artifact checks, strict OpenSpec and diff/status audit |
| Non-goals | Generic smoke removal, schema/data/API/UI changes, live mutation, dependency upgrade, unrelated cleanup |
| Operations deferred | Push/PR/merge/release/deploy and exact live migration/legacy-tool retirement |
| Stop/rollback conditions | Stop on preflight mismatch, validation loss, cross-boundary rollback inconsistency, failing gate or out-of-scope write; inverse patch only |

Forbidden: `git reset --hard`, checkout-based rollback, `git clean`, `git add -A`, broad recursive deletion, external-repository mutation, remote mutation, and every live-host operation.

## 1. Admission and planning review — owner: primary agent; writable: change artifacts only

- [x] 1.1 Preflight branch `codex/remove-archive-smoke` at `3b754ba43b8da205418b9a5fae9f775c4fd90a51`, clean index/worktree except this change, no active conflicting owner, and exact remote/master/deployed-hotfix ancestry; stop on mismatch.
- [x] 1.2 Review proposal, design, nine delta specs, and tasks against AGENTS/authority order; require explicit preservation of producer validation, API startup admission, unrelated smoke, and live-state deferral with zero P0/P1 findings.
- [x] 1.3 Run strict change validation and record apply-ready status before product edits.

## 2. Updater gate removal — owner: Updater; writable: declared Updater source/tests/docs

- [x] 2.1 Remove `--archive-smoke`, `ProduceRequest.archive_smoke`, executable preflight, subprocess supervision/parsing, smoke phase, `GO_SMOKE_*` outcomes, and the shared `smoke` status phase while preserving all remaining producer-owned phases and publication as the final commit point.
- [x] 2.2 Update the shared status schema/indexed goldens, Python writer, Go observability consumer, and CLI/service/catalog/status tests to assert the smoke-free phase sequence, failure/cancellation cleanup, deterministic no-change/collision behavior, and absence of any external executable requirement.
- [x] 2.3 Update Updater README and run focused pytest for CLI, service, catalog integration and update status, followed by frozen full pytest/mypy/ruff/format/lock gates with Python 3.14.6 and uv 0.11.32.
  - Evidence: Linux Python 3.14.6/uv 0.11.32 full pytest passed 255/256 with only the explicit complete-source environment case skipped; mypy, Ruff check/format, and offline lock check passed. The strengthened existing-version service suite passed 13/14 with the same explicit complete-source skip.

## 3. Backend command and artifact removal — owner: Backend/Contracts; writable: declared Backend paths

- [x] 3.1 Delete only `backend/cmd/archive-smoke/main.go` and `main_test.go`; remove the command from architecture/check inventories and remove the obsolete status phase from the Go metrics consumer while leaving `internal/archive` and API startup/readiness untouched.
- [x] 3.2 Reduce Docker binary export and Backend schema-v2 bundle/evidence/SBOM/component logic from two executables to exactly `bin/bgmss-api`; update builder/verifier/smoke-shell/unit tests and documentation.
- [x] 3.3 Run focused architecture/archive/API/build artifact tests and shell syntax/source tests, then the complete Backend check gate; prove the runtime image and bundle contain one Backend executable and release identity remains coherent.
  - Evidence: Linux Go 1.26.5 artifact tests passed, full `go test ./...`, `go test -race ./...`, `go vet ./...`, and `CGO_ENABLED=0 go build ./...` passed. The repository wrapper itself reached its pre-test source-policy gate but the installed WSL Git lacks required `git ls-tree --format`; no product/test failure is hidden by that environment limitation.

## 4. Operations topology removal — owner: Operations; writable: `operations/**`

- [x] 4.1 Remove the Backend tool input/archive, release `tools` directory, `current-tools`/`previous-tools`, updater argument/mount, install helper, deploy/rollback transactions, and isolated-validation expectations from clean repository topology.
- [x] 4.2 Update operations fixtures, bundle/build metadata, rollback/deploy/update/check behavior, README layout, and runtime assertions; preserve application/data rollback separation and make live cross-boundary migration explicitly unsupported by this development change.
- [x] 4.3 Run Bash syntax checks for every affected script, `operations/test/runtime.sh`, Compose config/source assertions, and isolated-validation static/runtime tests available locally; stop on any non-smoke topology drift or cleanup outside run-owned fixtures.
  - Evidence: affected Bash syntax passed; runtime tests passed with a checksum-verified jq 1.7.1 and Docker Compose v2.34.0 parser, including normalization failure recovery, candidate failure recovery, successful deployment, and application rollback.

## 5. Integrated acceptance and lifecycle — owner: primary agent; writable: evidence/task markers and approved spec lifecycle paths

- [x] 5.1 Run exact residual-reference audit: no active `archive-smoke`, `archive_smoke`, `GO_SMOKE`, release `tools`, or current/previous tool-link dependency may remain outside archived historical changes; inspect every remaining generic `smoke` reference as intentionally unrelated.
  - Evidence: production/current source and main specs contain none of the exact dedicated command/argument/tool-link tokens. The only literal `"smoke"` phase is the intentional negative update-status golden that proves the removed value is rejected; generic API/artifact/frontend smoke remains intact.
- [x] 5.2 Run affected Contracts/artifact tests, complete Updater/Backend/Operations gates, `git diff --check`, strict change/all OpenSpec validation, exact owned-path diff, and final zero-P0/P1 review. Record any environment-limited gate honestly rather than weakening it.
  - Evidence: update-status Contracts verifier passed 5 cases/13 invalid mutations; Linux Contracts artifact tests passed all path-compatible cells before three clean-checkout attestation failures and one NTFS-bound producer-runtime test was stopped after sustained I/O. Full Updater, full Go test/race/vet/build, Backend artifact, Operations runtime, diff, residual, and strict 54-item OpenSpec gates passed. Final review found no P0/P1 issue.
- [x] 5.3 Record states separately: investigated, specified, implemented and verified may become complete; committed, pushed, merged, released and deployed remain false unless separately performed.
- [x] 5.4 Sync all nine delta specs into main specs using the OpenSpec sync workflow, re-run strict validation, archive this completed change using the OpenSpec archive workflow, and verify no active smoke-removal change or lifecycle drift remains.
