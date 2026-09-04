## Why

The dedicated cross-language `archive-smoke` gate duplicates Archive validation already performed by the Python producer and by the Go Backend when it loads `current.json`, while adding a second distributable binary, platform-specific execution failures, release-tool topology, and substantial update latency. The user has explicitly requested that this dedicated gate be removed from the entire system now, before the next consolidated production rollout.

## What Changes

- **BREAKING:** Remove the `bgmss-updater produce --archive-smoke` argument and the producer's executable preflight, subprocess phase, `GO_SMOKE_*` outcomes, and smoke-specific integration fixtures.
- **BREAKING:** Remove `smoke` from the closed cross-language update-status phase enum and update its schemas, indexed goldens, Python writer, Go metrics consumer, and lifecycle events together.
- **BREAKING:** Remove `backend/cmd/archive-smoke`, its build-info identity, its Docker binary export, and its presence in Backend development artifacts.
- Preserve the producer's own contract, manifest, schema-object, table-count, quality-summary, digest, deterministic-build, and atomic inactive-publication gates.
- Preserve the Backend's strict read-only validation when the API loads the selected `current.json`; no weaker Archive is admitted to readiness.
- **BREAKING:** Remove the operations `tools` release payload, `current-tools`/`previous-tools` links, updater bind mount, and deploy/rollback/isolated-validation logic that exists only to deliver `archive-smoke`.
- Update affected tests, documentation, artifact identities, accepted specs, and bundle inventories so no production or development path refers to the removed command.
- Preserve unrelated uses of “smoke”: API container health/metrics smoke, Updater `doctor` and embedded `contract-check`, contract code-generation smoke, Frontend artifact smoke, and other artifact-only acceptance remain unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `updater-archive-producer`: Publish a fully Python-validated inactive Archive without accepting or invoking a Go smoke executable.
- `updater-position-catalog`: Make producer-owned catalog/table/quality validation authoritative without a duplicate Go-smoke integration requirement.
- `updater-development-status`: Remove the smoke lifecycle phase from events and terminal status while preserving the remaining ordered phases.
- `backend-archive-consumer`: Remove the pointer-free `cmd/archive-smoke` command while preserving strict API-startup Archive admission.
- `backend-runtime-foundation`: Remove the `cmd/archive-smoke -> archive` package boundary and command inventory.
- `backend-build-artifact`: Produce one distributable Backend API executable and remove the bundle-only smoke binary and metadata role.
- `contracts-application-release-identity`: Bind Backend release identity only to the distributable API executable.
- `contracts-update-status`: Remove `smoke` from the closed v1 phase enum and its indexed cross-language goldens.
- `operations-single-host-deployment`: Remove smoke-tool release assembly, mounts, links, transactions, and validation from deployment/update topology.

## Impact

- **Status:** Proposed; apply is blocked until proposal, specs, design, and tasks pass strict validation and main-agent zero-P0/P1 review.
- **Owner:** Updater owns removal of the producer gate; Backend owns command/artifact removal; Operations owns release/topology removal; Contracts owns cross-component release-identity requirements. The primary agent implements and audits the bounded cross-owner change.
- **Writable paths:** `backend/cmd/archive-smoke/**`; `backend/build/**`; `backend/Dockerfile`; `backend/README.md`; `backend/scripts/check.sh`; `backend/internal/architecture/dependencies_test.go`; `backend/internal/observability/{update_status.go,update_status_test.go}`; `updater/src/bangumi_staff_stats_updater/{cli.py,update_status.py,producer/service.py}`; `updater/tests/{test_cli.py,test_update_status.py,producer/test_service.py,catalog/test_producer_integration.py}`; `updater/README.md`; `contracts/schemas/update-status/**`; `contracts/goldens/update-status/**`; `operations/**`; `openspec/changes/updater-remove-archive-smoke-gate/**`; lifecycle sync only to the nine modified capability specs named above.
- **Read-only protected inputs:** `AGENTS.md`; `PRODUCT.md`; `DESIGN.md`; `.impeccable/**`; `tmp-formal-development/**`; all contracts, schemas, goldens, Backend domain/runtime code, Updater acquisition/builder/manifest code, Frontend code, unrelated tests and specs, other worktrees, the downloaded local Archive, remotes, and production state.
- **Deletion complement:** Delete only `backend/cmd/archive-smoke/main.go` and `backend/cmd/archive-smoke/main_test.go`; remove only smoke-specific code, test cases, metadata fields, bundle members, release-tool directories/links, mounts, and documentation statements inside the declared writable paths. No other file, capability, deployment command, runtime service, Archive, release, or host object may be deleted.
- **Mutable refs:** Local branch `codex/remove-archive-smoke` and its isolated worktree only. No remote ref, tag, release, deployment, or production state is mutable.
- **Consumes:** Current strict Archive producer/consumer contracts, existing Python validation phases, API startup admission, Backend/Updater artifact definitions, and single-host operations transactions.
- **Produces:** A smoke-free producer CLI and release topology, a single-executable Backend artifact, coherent tests/docs/specs, and migration-safe operations code for a later separately authorized rollout.
- **Dependencies:** Contracts remain upstream of Backend and Updater; Operations continues to consume accepted API/Updater/Frontend artifacts. No dependency is added or upgraded.
- **Deliverables:** Removed command/argument/process/error paths; reduced artifact and operations inventories; updated rollback/deploy behavior; complete regression coverage; strict-valid synchronized OpenSpec.
- **Acceptance:** Focused Backend command/artifact/architecture checks; full `backend/scripts/check.sh`; full frozen Updater pytest/mypy/ruff/format/lock gates; operations Bash syntax and `operations/test/runtime.sh`; affected artifact/contract checks; exact residual-reference allowlist; `git diff --check`; strict change/all OpenSpec validation.
- **Behavior classification:** `INTENTIONAL_DELTA` for the user-authorized removal of the dedicated Archive smoke gate and release tools. `PRESERVE_ORACLE` for all UI/product behavior against oracle `644b7748674e553f863d0ffd61d029f86fdc0717`. No `NEW_CAPABILITY` is introduced.
- **Non-goals:** Weakening Python Archive validation, weakening Backend startup readiness, removing generic artifact/API/Frontend smoke tests, changing Archive/schema/dataVersion semantics, changing the updater schedule, rebuilding data, modifying UI/API/statistics, upgrading dependencies, or cleaning unrelated files.
- **Operations deferred:** Live host migration, deletion of existing `current-tools`/`previous-tools`, release assembly, push, PR, merge, tag, deployment, production activation, and old release retention remain separately authorized actions.
- **Stop/rollback conditions:** Stop on an authority conflict, unrelated overlap, surviving functional `archive-smoke` dependency, removed non-smoke validation, failing component/operations gate, artifact identity inconsistency, or any required write outside the declared paths. Roll back only the exact owned diff with an inverse patch; never reset, clean, or overwrite unrelated work.
- **External state:** This change touches no other repository and performs no host, production, service, remote, or downloaded-Archive mutation.
