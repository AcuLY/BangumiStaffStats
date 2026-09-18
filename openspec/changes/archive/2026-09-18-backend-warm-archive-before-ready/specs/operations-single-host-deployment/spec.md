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


## ADDED Requirements

### Requirement: Deployment readiness polling SHALL accommodate bounded public preparation
Repository host commands SHALL default to 75 readiness attempts rather than 30, keeping each curl bounded to two seconds and the existing two-second interval. Existing explicit attempt overrides and expected-dataVersion checks SHALL remain. This polling budget SHALL NOT be described as an exact 150-second wall-clock deadline or change any request/worker timeout, resource cap, route or live host by itself.

#### Scenario: A prepared API becomes ready after the old attempt count
- **WHEN** the exact accepted candidate becomes correctly ready on an attempt after 30 and before 75
- **THEN** default polling SHALL accept its matching ready envelope rather than rolling back solely due to the old attempt count

#### Scenario: Readiness stays false or version mismatches
- **WHEN** bounded polling never observes the expected ready envelope and dataVersion
- **THEN** deployment SHALL fail with existing rollback semantics, not bypass readiness or declare success from liveness
