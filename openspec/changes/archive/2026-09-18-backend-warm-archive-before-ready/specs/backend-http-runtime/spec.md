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

### Requirement: Health routes SHALL reflect only process and published state

The infrastructure routes SHALL remain exact `GET /livez`, `GET /readyz`, and
`GET /metrics`; all reject other methods with 405 and exact `Allow: GET`.
Health responses SHALL be parameter-free `application/json` and `no-store`.
`/livez` SHALL return 200 from process state without Archive access as exactly
`{"data":{"status":"live"},"meta":{"requestId":"..."}}`. `/readyz` SHALL return
200 only after direct snapshot open, full same-process public-data preparation,
prepared admission and an injected one-second fixed read succeed, as exactly
`{"data":{"status":"ready"},"meta":{"requestId":"...","dataVersion":"..."}}`;
nil, unprepared, maintenance-blocked, closed, mismatched, canceled, failing,
or startup-open-failed state SHALL
return the generated 503 `NOT_READY` envelope without a dataVersion.
`/metrics` behavior belongs to `backend-observability`. The separately owned
image route SHALL remain independent of Archive publication. The catalog route
SHALL depend on the same prepared Store but SHALL not change readiness,
initiate loading, select another snapshot, or perform Archive admission.

#### Scenario: Direct-open publication changes

- **WHEN** prepared state is absent, successfully admitted, its fixed probe
  fails, or shutdown clears it
- **THEN** liveness SHALL stay 200 while readiness transitions
  `503 -> 200 -> 503` without reading manifest files, scanning Archive,
  choosing another snapshot, or running admission
- **AND** image/catalog requests SHALL not make readiness true

#### Scenario: Archive startup open fails

- **WHEN** the one direct Archive open attempt returns a non-cancellation
  failure
- **THEN** `/livez`, `/readyz`, `/metrics`, the Archive-independent image route,
  and catalog route SHALL begin serving; readiness and catalog SHALL remain 503
  until a separately admitted builder successfully prepares and activates a candidate
- **AND** no cold Archive-dependent business response or implicit fallback SHALL occur;
  the separately admitted builder recovery SHALL obey the same preparation and
  activation gate without restarting the listener

#### Scenario: Maintenance preparation is in progress
- **WHEN** activation is draining or preparing a generation
- **THEN** health and metrics SHALL not wait behind the full maintenance lock, and readiness/catalog/business SHALL use the same closed prepared admission without changing their public envelopes
