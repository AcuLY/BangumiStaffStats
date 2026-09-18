## Why

The first real unrestricted-person query can spend its result-worker budget preparing public Archive data. A read-only real-data prototype confirms startup preparation makes first queries succeed; retaining two fully prepared Stores and issuing a query instead OOMs under existing production limits. The user approved preparing before readiness and, after that evidence, explicitly accepted a short query-maintenance interval for single-generation data switching.

## What Changes

- INTENTIONAL_DELTA: startup warms the shared series index and five immutable FactSets serially before readiness/catalog/business admission; liveness and metrics remain responsive.
- INTENTIONAL_DELTA: data activation drains old users, releases only old derived caches, prepares the candidate, and then commits. Failure restores and rewarms old data before resuming; no two fully cached generations are retained.
- Exact-Store cache cleanup and detached-result drain cover canceled HTTP waiters and pre-executor scheduling.
- Preparation/recovery use separate finite budgets; user query timeouts, statistics, wire and memory limits remain unchanged. Deployment readiness waiting accommodates initialization without changing business timeouts.
- PRESERVE_ORACLE: UI, statistical semantics and userscript behavior remain as accepted from oracle `644b7748674e553f863d0ffd61d029f86fdc0717` and current PRODUCT.md.

## Capabilities

### New Capabilities
- `backend-archive-warmup`: bounded same-process public-data preparation and single-generation activation/recovery.

### Modified Capabilities
- `backend-http-runtime`: prepared-state readiness and responsive not-ready behavior during maintenance.
- `backend-archive-consumer`: raw Store opening/publication is distinct from app prepared admission; replace/restore ownership remains safe.
- `backend-runtime-foundation`: startup lifecycle and explicit app -> query orchestration dependency.
- `backend-bounded-query-cache`: drain includes detached scheduling and completion without changing queue/budget/keys.
- `operations-single-host-deployment`: readiness wait defaults cover the new startup bound, with unchanged health validation and resource envelope.

## Impact

| Field | Boundary |
|---|---|
| Status | Approved startup/maintenance policy; apply requires complete strict-valid artifacts and primary review; implementation/verification not yet claimed |
| Owner | Backend implements lifecycle/cache/drain; parent owns specifications, docs, operations readiness wait and final acceptance |
| Writable paths | `backend/internal/app/run.go`; `backend/internal/app/run_test.go`; `backend/internal/app/catalog_archive_integration_test.go`; `backend/internal/app/maintenance.go`; `backend/internal/app/maintenance_test.go`; `backend/internal/app/warmup.go`; `backend/internal/app/warmup_test.go`; `backend/internal/app/archive_updater_test.go`; `backend/internal/app/scheduler_test.go`; `backend/internal/query/archive_loader.go`; `backend/internal/query/archive_loader_cache_test.go`; `backend/internal/statistics/source.go`; `backend/internal/statistics/source_test.go`; `backend/internal/runtimecache/detached.go`; `backend/internal/runtimecache/result.go`; `backend/internal/runtimecache/collection.go`; `backend/internal/runtimecache/drain.go`; `backend/internal/runtimecache/drain_test.go`; `backend/internal/runtimecache/concurrency_test.go`; `backend/internal/runtimecache/result_test.go`; `backend/internal/architecture/dependencies_test.go`; `backend/scripts/check.sh`; `PRODUCT.md`; `backend/README.md`; `operations/README.md`; `tmp-formal-development/backend-development-implementation-guide.md`; `tmp-formal-development/backend-operations-implementation-guide.md`; `tmp-formal-development/data-logic-implementation-guide.md`; `operations/lib/common.sh`; `operations/test/warmup-readiness.sh`; `operations/test/runtime.sh`; `openspec/changes/backend-warm-archive-before-ready/**`; `openspec/specs/backend-archive-warmup/spec.md`; `openspec/specs/backend-http-runtime/spec.md`; `openspec/specs/backend-archive-consumer/spec.md`; `openspec/specs/backend-runtime-foundation/spec.md`; `openspec/specs/backend-bounded-query-cache/spec.md`; `openspec/specs/operations-single-host-deployment/spec.md`; `backend/internal/httpapi/handler.go`; `backend/internal/httpapi/handler_test.go`; `backend/internal/httpapi/middleware.go`; `backend/internal/httpapi/middleware_test.go` |
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

No other repository or live external state is writable by this change. External read-only feasibility artifacts live in the parent's already-approved QA workspace, not product code. Integration and deployment are separate state transitions owned by the existing deployment task. Apply is blocked until proposal, specs, design and tasks pass strict validation and primary-agent review.
