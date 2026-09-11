## Why

The Backend currently blocks every process start on a second full Archive
admission pass, including whole-file SHA-256, `integrity_check`,
`foreign_key_check`, schema sealing, and table recounts that the one-shot
producer already completed before publication. On the current complete
919 MB Archive over the local WSL/NTFS boundary, that duplicate work prevents
the local V2 service from becoming usable for many minutes.

## What Changes

- **BREAKING** Remove Backend Archive admission as a system concept: delete the
  shared candidate-admission API, its ordered contract/manifest/digest/
  integrity/foreign-key/schema/count gates, its admission outcomes, and the
  admission-only golden/mutation tests.
- Replace startup admission with a bounded direct open of the one version named
  by `current.json`. The Backend retains only the access controls required to
  use the snapshot safely: absolute contained paths, non-symlink regular
  objects, immutable/query-only SQLite access, bounded connections, snapshot
  identity read from `archive_meta`, atomic store publication, and orderly
  close.
- Keep producer-side construction and finalization validation unchanged. The
  updater remains solely responsible for source, manifest, digest, schema,
  integrity, foreign-key, table-count, quality, and read-only-reopen checks
  before an inactive version is published.
- Keep `/livez`, `/readyz`, `/metrics`, catalog/query APIs, `current.json`
  activation, dataVersion reporting, and no-retry/no-fallback startup behavior;
  readiness now proves that the selected database opened and its fixed probe
  succeeds, not that Backend repeated producer admission.
- Reconcile the formal master plan, Backend implementation guide, Backend
  README, root OpenSpec capabilities, and tests so no runtime or operations
  path claims or invokes Backend Archive admission.

Externally visible product/UI behavior is `PRESERVE_ORACLE` against immutable
oracle `644b7748674e553f863d0ffd61d029f86fdc0717`: no route, response shape,
copy, interaction, or statistical semantic changes are intended. Removing the
startup gate is an `INTENTIONAL_DELTA` authorized by this user request and
governed by the modified Backend/operations capabilities below.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-archive-consumer`: replace strict candidate/runtime admission with
  a minimal contained, read-only current-snapshot open and atomic publication.
- `backend-http-runtime`: make readiness and degraded startup depend on direct
  snapshot open rather than an accepted admission result.
- `backend-observability`: retain one bounded startup open-failure event while
  removing Archive validation/admission claims from events and metrics.
- `operations-single-host-deployment`: treat producer validation as the sole
  Archive validation authority and stop using API restart/readiness as a
  second Archive admission pass.

## Impact

- **Status:** specified only until all artifacts are strict-valid, reviewed,
  and then implemented/verified; not pushed, merged, released, or deployed.
- **Owner:** Backend owns runtime open/publication and observability changes;
  Operations owns deployment wording; the primary agent owns cross-document
  reconciliation and acceptance.
- **Writable paths:**
  `openspec/changes/backend-remove-archive-admission/**`,
  `backend/internal/archive/**`, `backend/internal/app/run.go`,
  `backend/internal/app/run_test.go`,
  `backend/internal/app/catalog_archive_integration_test.go`,
  `backend/internal/{candidates,costar,partners,persondetail,ranking,statistics,query}/**/*_test.go`,
  `backend/internal/httpapi/{handler.go,handler_test.go}`,
  `backend/internal/observability/{events.go,events_test.go}`,
  `backend/README.md`,
  `tmp-formal-development/formal-development-master-plan.md`,
  `tmp-formal-development/backend-development-implementation-guide.md`, and
  after verification only the exact affected root specs during sync/archive.
- **Read-only protected inputs:** `PRODUCT.md`, `DESIGN.md`,
  `tmp-formal-development/decisions/prototype-data-logic-audit.md`, contracts,
  updater implementation/tests, frontend, the original dirty worktree, the
  complete local Archive bytes, and every remote/live system.
- **Deletion complement:** only admission-owned Backend source/tests and their
  exact obsolete assertions may be deleted; query/statistics behavior,
  producer checks, contract artifacts, Archive data, other smoke/tests, and
  unrelated changes are preserved.
- **Mutable refs:** local branch `codex/remove-archive-admission` and its local
  worktree only; no remote refs.
- **Consumes:** existing `current.json`, producer-validated immutable version,
  SQLite `archive_meta`, current contracts as producer authority, and the
  accepted query/store interfaces.
- **Produces:** a fast direct-open Backend startup path, updated tests/docs,
  strict-valid delta specs, and local verification evidence.
- **Dependencies:** completed `updater-remove-archive-smoke-gate` commit
  `411f54bbd631d01600baf56962ab2ae4a4d0f122`; existing updater publication,
  Backend query/store, HTTP readiness, and single-host operations capabilities.
- **Deliverables:** implementation diff, focused/full Backend checks, strict
  OpenSpec validation, `git diff --check`, and local complete-Archive API/UI
  verification.
- **Acceptance:** no Backend code or documentation performs or promises
  Archive manifest/digest/integrity/foreign-key/schema/table-count admission;
  a producer-valid complete Archive starts promptly, reports the selected
  dataVersion consistently, and all affected gates pass.
- **Non-goals:** weakening updater validation; changing Archive schemas,
  producer output, query formulas, API schemas, UI behavior, dependencies,
  activation atomicity, or implementing hot reload/fallback.
- **Operations deferred:** push, pull request, merge, tag, release, host write,
  production activation, public routing, and legacy retirement remain outside
  scope and require separate explicit authorization.
- **Stop/rollback conditions:** stop on higher-authority conflict not reconciled
  in this change, overlapping concurrent edits, any producer-validation drift,
  API/schema/statistical behavior drift, or failed affected gate. Local runtime
  rollback is to stop the candidate process and restart commit `411f54b` with
  the prior Archive behavior; repository rollback is the unmodified parent
  commit/branch.

Apply is blocked until proposal, specs, design, and tasks pass strict validation
and main-agent review with zero P0/P1 planning findings.
