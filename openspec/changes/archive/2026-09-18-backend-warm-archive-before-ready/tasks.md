## Task Boundary

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


No `reset --hard`, checkout-based rollback, `git clean`, `git add -A`, broad recursive deletion, external-repository writes, commits or remote/live mutations by apply owners.

## 1. Parent specification and preflight

- [x] 1.1 Confirm user approval for short maintenance and read-only real-data single-generation/overlap evidence; preserve current branch/master HEAD 7230fb4c544be1e54e4346fc6e0b1b7bc2b08004 and pre-existing HTTP ownership fix.
- [x] 1.2 Reconcile PRODUCT and backend/data/operations guides; complete proposal, design and six capability deltas with exact path ownership.
- [x] 1.3 Review the coherent artifacts and pass `openspec validate backend-warm-archive-before-ready --strict` before apply.

## 2. Backend owner — one coherent lifecycle slice

Writable code is only the backend paths enumerated in proposal.md; parent owns every documentation/operations/spec path. Existing four HTTP handler edits and detached_deadline_test.go are read-only. Do not modify statistical evaluation, SQL, contracts or public wire. New helper functions/types may be localized to warmup.go/drain.go; no new package/library.

- [x] 2.1 Record branch/HEAD/diff and protected-file hashes. Read controlling artifacts and actual package tests. Write barrier-driven RED tests before lifecycle production edits. Failure must expose missing behavior, not an accidental syntax or fixture error.
- [x] 2.2 Add exact-Store retirement to query/archive_loader.go and statistics/source.go with cache tests: all types, repeated retirement, other Store preservation, failed/partial load and normal reload/cache hit. Keep loader SQL and statistics unchanged.
- [x] 2.3 Add pre-scheduling-through-completion detached drain in runtimecache/detached.go/result.go and minimal drain.go support (collection.go only if necessary). Add deterministic tests for canceled last waiter before executor entry, coalesced waiters, eventual idle and unchanged timeout/admission semantics.
- [x] 2.4 Implement serial 120-second public preparation and common prepared view in app/warmup.go. Wire run.go for responsive infrastructure, fail-closed readiness/catalog/five services, startup cancellation/join and no startup/updater preparation overlap. Adapt existing run/archive_updater/scheduler tests without weakening assertions. Update only app -> query architecture import permission.
- [x] 2.5 Implement the design's single-generation activation/recovery in app/maintenance.go with tests for admission closure before drain, prompt health/metrics/not-ready responses, candidate preparation-before-commit, success cleanup, failed candidate/replace/commit, failed State/pointer restore, independent bounded recovery, cancellation before retirement and process shutdown. Never close a Store still owned by State after failed Restore.
- [x] 2.6 Run focused packages and focused race checks under pinned tools; self-review and produce an exact file/command/evidence handoff without commit/push. Preserve protected HTTP hashes.

Backend commands (run from backend; wrap all with the pinned-tool wrapper):

```sh
GOMAXPROCS=1 GOFLAGS=-p=1 bash /root/.hermes/workspace/bangumi-staff-stats/toolchains/with-pinned-tools.sh /root/.g/go/bin/go test ./internal/app ./internal/runtimecache ./internal/query ./internal/statistics ./internal/architecture -count=1 -timeout=180s
```

Race command replaces `go test` with `go test -race`, omits architecture if cost requires a separately recorded check, and uses `-timeout=240s`. Expected GREEN is exit 0 with every named package `ok`; record any timeout rather than claiming it passed.

## 3. Parent — startup readiness polling and documentation

Writable: operations/lib/common.sh, operations/test/warmup-readiness.sh, operations/README.md, backend/README.md and declared authority guides. Check current owned diffs before edit; do not touch live operations or Compose caps.

- [x] 3.1 Add a disposable stub-based shell regression proving default polling accepts ready attempt 31, preserves explicit shorter override and rejects mismatched dataVersion; run RED against default 30 without real sleeps/network.
- [x] 3.2 Change only default readiness attempts to 75; rerun the shell regression, existing operations tests and syntax/diff checks. Update docs describing startup/maintenance/recovery and unchanged query budgets.

```sh
bash operations/test/warmup-readiness.sh
bash operations/test/runtime.sh
bash -n operations/lib/common.sh operations/test/warmup-readiness.sh
git diff --check
```

## 4. Parent — independent review and component acceptance

- [x] 4.1 Audit actual diff and evidence, independently review SPEC compliance first; fix owned findings with RED/GREEN. Then independent QUALITY/security/concurrency review and re-review until no blockers.
  - Evidence (existing independent reviews, not rerun during spec sync): `qa/startup-warmup/APP-SPEC-REREVIEW.md` closes B1/B2 and approves APP SPEC; `APP-QUALITY-REVIEW.md` approves the final APP/fixture slice with no blockers. `FOUNDATION-SPEC-REVIEW.md`, `FOUNDATION-QUALITY-REVIEW.md`, and `FOUNDATION-PARENT-VERIFIED.md` approve the cache-retirement/drain slice; the non-blocking P3 test-strengthening suggestion remains a suggestion, not implemented work.
- [x] 4.2 Run full pinned `backend/scripts/check.sh`, detached HTTP error regression/race, contracts artifact tests, operations gates and strict OpenSpec validation. Record exact commands/exit statuses; no fixture/prototype equivalence claim.
  - Evidence: `qa/startup-warmup/full-backend-r3-invocation.json`, `full-backend-r3.log`, `full-backend-r3-result.json` and `parent-full-gate-r3-verification.json` record the full pinned gate exit 0, completion marker and unchanged source; the gate includes HTTP detached-deadline regressions and `go test -race ./...`. `companion-gates-r3.json` records operations runtime/routing, contracts artifact tests and strict warmup validation, all exit 0. `pre-closure-source-binding.json` preserves the 1663-file accepted source binding before documentation closure. Earlier aborted/r2 gates remain unsuccessful historical evidence; no fixture/prototype equivalence or new backend execution is claimed. Fresh documentation-only strict checks are recorded in `qa/startup-warmup/spec-sync-validation.log`.

## 5. Parent — real-data acceptance and lifecycle closure

- [x] 5.1 On the already approved QA scope only, verify collision preflight, run actual product source with readonly pinned real Archive and nil updater; test cold startup gating, all-five first queries and target person, under unchanged cgroup CPU/memory plus GOMEMLIMIT. Warmup overlay is not acceptance.
  - Evidence: `qa/startup-warmup/PARENT-COLD-RUNTIME-R2.md` and `source-cold-b0c14ba556bf4a46a165ac0d32a53621/cleanup.json` (`accepted: true`, no errors), with raw artifacts and parent verification, accept the actual-source nil-updater/read-only real-Archive run. Startup ready/catalog/business NOT_READY and empty pre-query user caches passed; anime/book/music/game/real and person 6447 first requests all returned 200 within the unchanged 20-second user budget. Peak cgroup memory was 1013.332 MiB under unchanged CPU 1.5/RAM 1536 MiB/GOMEMLIMIT 1024 MiB; zero OOM/restarts, exact-owned cleanup, production/source unchanged. Person detail may reuse the anime collection cache; this is not six independently cold processes. The failed pre-launch cold r1 evidence remains preserved.
- [x] 5.2 Exercise single-generation candidate success, failed preparation/commit recovery and populated user cache lifetime in disposable QA data; measure maintenance bounds/retained memory and first query after resume. Verify no OOM, cache-generation leak, worker use-after-close or data/response drift.
  - Evidence: `qa/startup-warmup/lifecycle-harness/PARENT-RUNTIME-R1.md` and `run-parent-r1/result.json` record `accepted: true`, verified cleanup, production/source unchanged and no verification errors. Real-data failed preparation recovery (51.285s), post-write commit failure recovery with exact pointer restoration (83.245s), and successful switch (28.286s) passed, with eight payload comparisons excluding only requestId/dataVersion and populated user-cache lifetime checks. First new-version queries passed; same-version recovery used preserved result-cache entries, not independent cold requests. Cgroup peak reached the 1536 MiB hard cap: no spare-memory claim. Zero OOM/restarts and clean intentional exit were verified; this is bounded lifecycle QA acceptance, not release/deployment acceptance.
- [x] 5.3 Clean up only proven owned processes/containers/QA state; verify production old release and data remained unchanged, then sync/archive accepted specs and validate all strictly. Keep old failing overlap evidence.
  - Evidence: both real runs verified exact-owned container removal, free loopback 18081, no other known QA container, and unchanged production container/configuration digest sets with protected files/links equal and /readyz 200 after each run. All six warmup delta specs verified present in main specs; change archived to `openspec/changes/archive/2026-09-18-backend-warm-archive-before-ready/`; fresh `openspec validate --all --strict` and `git diff --check` green. Old overlap OOM evidence, failed cold r1 and r2 gate records remain unmodified.
- [x] 5.4 Hand accepted source/evidence to the separate deploy-unrestricted-person-entry task. Commit/push/merge/artifact/deploy/live validation remain distinct and require that task's exact gates. This change alone never authorizes live restart or declares release complete.
  - Evidence: handoff is this tasks file plus the evidence paths above; the deploy change (`openspec/changes/deploy-unrestricted-person-entry/`) now owns commit/push/merge/artifact/rehearsal/deploy/readback. The user authorized "完成验收，并推送部署" and the installed-helper default-only 30→75 update; production is not restarted or replaced by this change.
