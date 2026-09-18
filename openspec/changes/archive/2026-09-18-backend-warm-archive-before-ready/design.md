## Context

The approved delta is public-data preparation before admission, not user-result caching. Real-data probes prove a warmed single Store permits first queries while two warmed generations plus a query exceed the existing hard memory cap. The user explicitly accepted short maintenance for single-generation switching. Existing raw State publication and readiness metrics are not admission gates. Store-keyed global caches need explicit lifetime ownership, and an executor idle snapshot misses detached work before executor scheduling.

## Goals / Non-Goals

Prepare the actual serving Store, share one prepared-state view across readiness/catalog/five services, keep infrastructure responsive, retire cache generations safely, and recover failed activation without cold queries. Preserve every query budget, statistical rule, public envelope, image behavior, and memory limit. Do not add a general lifecycle framework, new user configuration, result precomputation, new telemetry schema, or cache/index optimization.

## Change Boundary

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


## Decisions

### Preparation belongs to app, not Archive admission

An app-owned helper calls `statistics.LoadSeriesIndex` once then `query.LoadFactSet` for `anime`, `book`, `music`, `game`, `real`, serially, against one exact Store. A 120-second context bounds an entire attempt, not each type. Existing fixed readiness probe follows. No UID, collection provider or result service is called. Only the app -> query import edge is added to the approved architecture matrix. Ordinary query loaders and SQL remain authoritative; no manifest/schema/digest/smoke admission is resurrected.

### A prepared view owns admission

Raw State remains the owner of open handles and replacement. App maintains a concurrency-safe prepared view that delegates raw open/close as needed but returns a Store to public providers only if the exact current Store is prepared and admission is open. A metric is not used as the gate. Bind all five services, catalog, and readiness to that same view. A later readiness GET cannot bless a raw/unprepared candidate. Initial preparation runs concurrently with serving liveness, metrics and fast not-ready responses; it is canceled and joined before closing its Store on server failure or process shutdown. Start the updater only after successful startup preparation, or immediately in the pre-existing initial-open-failure degraded path, so startup and activation never warm concurrently. Startup preparation failure returns a bounded startup error after shutting down serving, never cold ready. A fixed probe failure also remains fail-closed.

### Maintenance drains before cache retirement

Close new admission before waiting for all admitted HTTP handlers, then detached workers registered synchronously before singleflight scheduling. A canceled HTTP waiter does not remove the worker until actual work and publication finish. Coalesced callers must neither undercount nor leak registrations. Collection work may remain detached from its HTTP waiter; drain must account for any path that can still hold or later use an old Store. Preserve two-running/eight-queued, 20-second result and 90-second collection budgets. The gate must prevent starvation by new queries and must not hold liveness/metrics behind a long RWMutex wait. Fast not-ready responses use existing runtime/domain handlers and existing wire classification. Unknown routes/method validation and image independence remain intact. The HTTP middleware runs the actual route handler asynchronously and may finish its outer response waiter before that handler completes. Admission/drain synchronization SHALL therefore cover the actual inner handler lifetime, not an outer ServeHTTP wrapper; an internal httpapi assembly hook may place the app-owned gate at that boundary without changing timeout/error envelopes. Shutdown closes a terminal prepared-admission state before cancellation/join, and neither startup publication nor activation resume may reopen it. Ordinary update cancellation remains recoverable independently of process shutdown.

### Single-generation candidate transaction

1. Minimal-open/probe candidate before retiring old caches; preserve old pointer bytes and Store handle.
2. Close admission and drain old HTTP/detached work with cancellation honored. If canceled before retirement, old prepared data can resume without rewarming.
3. Remove only old Store's series and all five FactSet cache entries. Do not close/delete old data yet. Reclaimability, rather than merely removing map keys, must be checked in real-data acceptance.
4. Serially prepare candidate within 120 seconds. Only after full preparation replace raw State and commit current.json using existing builder callbacks.
5. Publish the prepared candidate, resume admission, close/retire old resources, and perform existing successful cleanup. Never call successful cleanup on failed activation.
6. On preparation/replace/commit failure: evict partial candidate caches; restore raw State and pointer when touched; rewarm previous Store with an independent at-most-120-second recovery context tied to process lifetime, not the expired attempt. Only reopen admission if restoration, preparation and fixed probe all succeed.
7. If restoration or recovery fails, remain not-ready. Do not close any candidate still referenced by State after failed Restore. On process shutdown, cancel active preparation and do not start new recovery work; join users before exact-store cache retirement and close.

The candidate and previous handles may coexist, but full cache generations must not. Exact-store retirement is idempotent, preserves another Store's entries, clears failed/partial attempts, and does not act as general eviction on active readers. No global reset or forced per-request GC is introduced. Existing version-bearing user result keys/LRU and collection cache policy remain unchanged.

### Deployment polling is not a query timeout

Change only the existing readiness polling default from 30 to 75 attempts. Each request retains its 2-second bound and polling its 2-second interval; expected-dataVersion checks and override behavior remain. This is not an exact 150-second wall-clock deadline because requests consume time too. Source definitions do not mutate current deployed operations. Rollout remains gated on exact accepted artifact and full real-data first-query/candidate/recovery verification.

## Risks / Trade-offs

- Maintenance is user-visible: use existing retryable not-ready response; no synthetic empty data. Duration includes drain and possibly a separate recovery warmup, not a promised fixed minute.
- Cache references may outlive map deletion: use exact ownership tests plus real-data activation with populated query caches under unchanged GOMEMLIMIT/cgroup limits.
- Initial empty/open-failed archive must retain builder recovery: test separately from post-open preparation failure.
- Prepared-state and gate races can re-open early: barrier tests must cover stale readiness probe, queued writer, pre-executor callback, canceled waiter and rollback failure; run race detector.
- Small fixtures do not prove production capacity: real read-only Archive cold process and single-generation activation are release gates.

## Migration Plan

No data/schema migration. Keep rolled-back production unchanged during implementation. Verify source with focused RED/GREEN, independent spec then quality review, full backend/contracts/operations gates, and real-data QA using the approved loopback ports only. Sync/archive specs only after implementation evidence. Resume the separately authorized exact commit/PR/artifact/rehearsal/deploy workflow only after acceptance; real public cold query failure requires rollback to the recorded old release without touching Archive data.

## Open Questions

No unresolved product decision: short maintenance is explicitly approved. Runtime resource viability and recovery duration are acceptance questions, not claimed by the prototype.
