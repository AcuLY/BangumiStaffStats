## Capability Boundary

| Field | Boundary |
|---|---|
| Status | Approved startup/maintenance policy; apply requires complete strict-valid artifacts and primary review; implementation/verification not yet claimed |
| Owner | Backend implements lifecycle/cache/drain; parent owns specifications, docs, operations readiness wait and final acceptance |
| Writable paths | `backend/internal/app/run.go`; `backend/internal/app/run_test.go`; `backend/internal/app/maintenance.go`; `backend/internal/app/maintenance_test.go`; `backend/internal/app/warmup.go`; `backend/internal/app/warmup_test.go`; `backend/internal/app/archive_updater_test.go`; `backend/internal/app/scheduler_test.go`; `backend/internal/query/archive_loader.go`; `backend/internal/query/archive_loader_cache_test.go`; `backend/internal/statistics/source.go`; `backend/internal/statistics/source_test.go`; `backend/internal/runtimecache/detached.go`; `backend/internal/runtimecache/result.go`; `backend/internal/runtimecache/collection.go`; `backend/internal/runtimecache/drain.go`; `backend/internal/runtimecache/drain_test.go`; `backend/internal/runtimecache/concurrency_test.go`; `backend/internal/runtimecache/result_test.go`; `backend/internal/architecture/dependencies_test.go`; `PRODUCT.md`; `backend/README.md`; `operations/README.md`; `tmp-formal-development/backend-development-implementation-guide.md`; `tmp-formal-development/backend-operations-implementation-guide.md`; `tmp-formal-development/data-logic-implementation-guide.md`; `operations/lib/common.sh`; `operations/test/warmup-readiness.sh`; `operations/test/runtime.sh`; `openspec/changes/backend-warm-archive-before-ready/**`; `openspec/specs/backend-archive-warmup/spec.md`; `openspec/specs/backend-http-runtime/spec.md`; `openspec/specs/backend-archive-consumer/spec.md`; `openspec/specs/backend-runtime-foundation/spec.md`; `openspec/specs/backend-bounded-query-cache/spec.md`; `openspec/specs/operations-single-host-deployment/spec.md`; `backend/internal/app/catalog_archive_integration_test.go`; `backend/scripts/check.sh`; `backend/internal/httpapi/handler.go`; `backend/internal/httpapi/handler_test.go`; `backend/internal/httpapi/middleware.go`; `backend/internal/httpapi/middleware_test.go` |
| Read-only protected inputs | Pre-existing four HTTP handler edits and detached_deadline_test.go; all statistics evaluators/series representation, loaders' SQL/semantics, Archive bytes, contracts/goldens/generated files, userscript/frontend, other active changes, live services/state, remote refs |
| Deletion complement | Preserve every unrelated path, request/worker/collection timeout, fixture, statistical rule and existing regression; no broad deletion |
| Mutable refs | Current master worktree files only; no branch/worktree/ref switch or commit/push by apply owner |
| Consumes | Existing Store, series/fact loaders, public query contracts, process/update cancellation, current release resource settings |
| Produces | Prepared Store admission; bounded single-generation maintenance/recovery; exact-Store cache retirement; safe detached drain; startup-aware deploy wait |
| Dependencies | Existing standard library and packages only; explicit app -> query orchestration edge; no reverse imports/new dependency |
| Deliverables | Source, focused RED/GREEN/race evidence, full backend gate, reviewed/synced specs, real-data evidence |
| Acceptance | Tests and evidence in tasks.md; unchanged public success/error envelopes and statistical output; cold first query and activation/recovery under original caps |
| Non-goals | Index compression, statistical optimization, synthetic UID warmup, result precomputation, query budget/resource increases, new routes, frontend/userscript changes |
| Operations deferred | All live changes, publication/merge/release remain under the separate deploy-unrestricted-person-entry gate after acceptance; no live restart here |
| Stop/rollback conditions | Stop on unexpected dirty drift, result/wire drift, unsafe admission/drain, leaked generation, OOM, failed recovery, broader required ownership; preserve evidence and old production; patch owned files only |


## MODIFIED Requirements

### Requirement: Backend SHALL perform no Archive admission

Backend startup and direct version open SHALL NOT read or validate
`manifest.json`, hash SQLite, compare manifest/pointer/SQLite digests,
recompute dataVersion, enforce compatibility tuples or schema-object seals,
execute `integrity_check` or `foreign_key_check`, enumerate required schema
objects, recount manifest tables, run sentinel/catalog/domain smoke, or expose
an alternate flag, command, background task, or helper that performs those
gates. Producer validation before inactive publication SHALL remain the sole
Archive validation authority.

#### Scenario: A complete producer version is opened

- **WHEN** `current.json` selects a producer-published SQLite version
- **THEN** Backend SHALL proceed directly through contained read-only open,
  identity read and raw Store publication; app SHALL separately perform ordinary
  public-data preparation before the readiness probe and business admission
- **AND** no Archive admission phase or validation scan SHALL run

#### Scenario: Admission is requested through an alternate path

- **WHEN** a caller searches for or attempts a candidate admission API,
  startup option, smoke tool, background validator, or deferred gate
- **THEN** no such Backend system surface SHALL exist

### Requirement: Publication and shutdown SHALL be atomic

Raw Store ownership SHALL be represented by one atomic pointer. App prepared
admission SHALL remain separate and false until direct open, identity read,
public-data preparation and the fixed readiness probe succeed.
Initial publication SHALL be single-assignment from nil; a failed, canceled,
or losing initial Store SHALL close exactly once and cannot replace a winner.
The separately admitted hot-replacement transaction SHALL retain rollback
ownership and SHALL not close a candidate still referenced by State after a
failed restore. Shutdown SHALL
first close prepared admission, cancel/join preparation and drain Store users,
retire exact-Store derived caches, and then close the published pool exactly once.

#### Scenario: Direct open fails before publication

- **WHEN** contained selection, SQLite open, connection setup, identity read,
  cancellation, or close-sensitive setup fails
- **THEN** owned resources SHALL close and observers SHALL never see a partial
  Store

#### Scenario: Publication or shutdown races

- **WHEN** opens, readiness reads, queries, cancellation, and repeated shutdown
  run concurrently
- **THEN** at most one complete Store SHALL publish, losers SHALL close, and
  shutdown SHALL be idempotent and race-free
