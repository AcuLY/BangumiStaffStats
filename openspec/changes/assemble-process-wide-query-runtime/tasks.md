| Boundary | Declaration |
|---|---|
| Status | investigated/specified/main-agent reviewed: complete; apply authorized. Implemented/verified/committed/pushed/released/deployed: no |
| Owner | One Backend implementation agent; main agent owns spec edits, task-marker acceptance, staging/commit/archive |
| Writable paths | `backend/internal/runtimecache/result.go`, `backend/internal/runtimecache/result_test.go`, new `backend/internal/runtimecache/runtime.go`, new `backend/internal/runtimecache/runtime_test.go`, `backend/internal/ranking/{service.go,service_test.go}`, `backend/internal/{candidates,persondetail,partners,costar}/{cache.go,service.go,service_test.go}`, `backend/internal/app/{run.go,run_test.go}`, `backend/README.md`; implementation owner does not edit task markers |
| Read-only protected inputs | Existing runtimecache collection/LRU/executor/detached/error files/tests; every other Backend path; all Contracts, Updater, Frontend, guide/oracle, sibling-change, ref/remote, external state |
| Deletion complement | Every path outside the writable list; no existing writable file may be deleted |
| Mutable refs | None |
| Consumes | Reviewed proposal/design/delta spec, accepted cache primitives, five query services and app assembly |
| Produces | Unstaged Backend candidate with one process resource owner and production sharing |
| Dependencies | Main-agent approval after all artifacts are strict-valid; implementation order is runtimecache, services, then app |
| Deliverables | Pooled result LRU, shared runtime owner/stats, compatible constructors, app wiring, deterministic tests, README |
| Acceptance | Focused/repeated/race, full tests/vet/build/check, strict OpenSpec, path/residue/diff hygiene; cross-language and browser gates are not applicable because no contract/frontend path changes |
| Non-goals | Public-client/tag/adapter, API/statistics/contracts, new library, per-operation quotas, operations, frontend |
| Operations deferred | Production sizing/configuration/monitoring/load tests, release, deploy, cutover, activation |
| Stop/rollback conditions | Stop on branch/HEAD/review mismatch, unexpected dirty overlap, protected-path mutation, type-unsafe pooled read, unprovable global bound, external-client dependency, or failed gate. Remove only task-created new files and reverse only this owner's unstaged lines; no `reset --hard`, checkout rollback, `git clean`, `git add -A`, recursive deletion, staging, commit, or ref mutation. |

## 1. Process runtime owner

- [ ] 1.1 Preflight from repository root: record branch, HEAD, index, full dirty-path snapshot, active owners, writable/protected inventories, and strict-valid reviewed artifacts; stop without mutation on overlap or mismatch.
- [ ] 1.2 In `backend/internal/runtimecache/{result.go,runtime.go}`, implement one explicit runtime owner with exactly one executor, one collection/negative owner, and one heterogeneous result LRU; preserve typed clone/cost boundaries, fail closed on type mismatch, and expose one aggregate resource snapshot.
- [ ] 1.3 In `backend/internal/runtimecache/{result_test.go,runtime_test.go}`, prove global cross-type cost/count/LRU behavior, acceptance above a hypothetical one-fifth share while within the per-item/global limits, immutable typed reads, fail-closed mismatch, one collection load/negative state, one mixed-operation two-running/eight-queued executor, and exact aggregate statistics.

## 2. Service and process assembly

- [ ] 2.1 In the exact five service/cache writable sets, add explicit shared-runtime construction and make each existing `NewService(stores, provider, Config)` an isolated compatibility wrapper over the same initialization logic; preserve existing focused test construction and all provider/result semantics.
- [ ] 2.2 In `backend/internal/app/{run.go,run_test.go}`, construct the default runtime owner once, pass that exact owner to ranking, candidates, person detail, partners, and co-star, keep the nullable provider placeholder unchanged, and prove runtime identity/sharing with executable behavior rather than source-text matching.
- [ ] 2.3 Update only `backend/README.md` to document process-wide ownership and the non-additive aggregate statistics boundary; add/adjust exact service tests for isolated compatibility and no semantic drift.

## 3. Acceptance and handoff

- [ ] 3.1 Run `gofmt` only on writable Go files; run focused runtime/app/five-service tests, `go test ./internal/runtimecache -count=20`, and `go test -race ./internal/runtimecache ./internal/app ./internal/ranking ./internal/candidates ./internal/persondetail ./internal/partners ./internal/costar`.
- [ ] 3.2 From `backend/`, run `go test ./...`, `go vet ./...`, `go build ./...`, and `./scripts/check.sh`; from repository root run `openspec validate assemble-process-wide-query-runtime --strict` and `git diff --check`.
- [ ] 3.3 Compare the final dirty-path delta with the preflight snapshot, require only declared writable paths plus pre-existing unrelated owner changes, no generated/cache/temp residue, no staged paths, and no protected/external/ref mutation; report exact investigated/implemented/verified state and freeze the unstaged candidate for main-agent review.
