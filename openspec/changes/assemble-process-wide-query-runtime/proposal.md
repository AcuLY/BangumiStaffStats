## Why

The five production query services currently construct independent executors,
collection caches, and 190 MiB result stores, so the documented process limits
can expand to five times their intended size and cross-operation work bypasses
one admission boundary. The accepted cache primitives now need one explicit
process owner before the remaining production wiring is completed.

## What Changes

- Add one process-wide query-runtime owner containing exactly one collection
  cache (including its positive and negative stores), one two-running/eight-
  queued executor, and one heterogeneous typed-result pool.
- Assemble ranking, candidates, person detail, partners, and co-star from that
  same owner while retaining an explicit isolated construction path for
  package unit tests.
- Enforce the result limits once across every operation: 190 MiB total,
  512 total items, and 32 MiB per item. Do not statically divide either total
  among the five operations.
- Define one aggregate statistics snapshot for process resource state so
  callers cannot multiply totals by summing five aliases.
- Keep the collection provider injected and nullable at this boundary; the
  blocked public-client admission change can supply it later without changing
  cache ownership.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-bounded-query-cache`: make the accepted cache and executor defaults
  process-wide across all five production query operations and define their
  aggregate statistics boundary.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated/specified/main-agent reviewed: complete; apply is authorized. Implemented/verified/committed/pushed/released/deployed: no |
| Owner | One Backend implementation agent after main-agent specification approval. |
| Writable paths | `backend/internal/runtimecache/result.go`, `backend/internal/runtimecache/result_test.go`, new `backend/internal/runtimecache/runtime.go`, new `backend/internal/runtimecache/runtime_test.go`, `backend/internal/ranking/{service.go,service_test.go}`, `backend/internal/{candidates,persondetail,partners,costar}/{cache.go,service.go,service_test.go}`, `backend/internal/app/{run.go,run_test.go}`, `backend/internal/architecture/dependencies_test.go`, `backend/README.md`, and this change's task markers |
| Read-only protected inputs | Existing collection/LRU/executor/detached/error implementations and tests; all other Backend files; all Contracts, Updater, Frontend, guide/oracle, other OpenSpec change, Git ref/remote, external-repository, host, and service state |
| Deletion complement | Every repository path outside the writable list; no existing writable file may be deleted |
| Mutable refs | None |
| Consumes | Accepted `backend-bounded-query-cache` primitives; the five accepted query services; current `backend/internal/app/run.go` assembly; backend guide section 5.2 |
| Produces | One tested process query-runtime owner, pooled typed result cache, compatible isolated service constructors, and production assembly using one shared owner |
| Dependencies | Accepted cache and five query-service implementations. Public collection admission is deliberately not required: its provider remains an injected placeholder. |
| Deliverables | Cross-type global result LRU/budget, one shared collection/negative cache, one shared executor, service wiring, app assembly, aggregate statistics, focused concurrency/budget/identity tests, and updated Backend documentation |
| Acceptance | Cross-operation tests prove one 190 MiB/512/32 MiB result boundary without per-operation quotas, one 64 MiB/4096 positive and 2 MiB/4096 negative collection boundary, one two-running/eight-queued executor, compatibility of isolated unit construction, exact production sharing, race/focused/full Backend gates, strict OpenSpec, and diff hygiene |
| Behavior classification | `INTENTIONAL_DELTA`: cross-operation resource contention now follows the process limits in `tmp-formal-development/backend-development-implementation-guide.md` section 5.2 and the accepted bounded-cache capability. API payload semantics and all frontend visual/interaction behavior are unchanged; therefore oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717` remains `PRESERVE_ORACLE`. The shared internal runtime owner is a `NEW_CAPABILITY` only at the implementation boundary. |
| External state | No other repository or external state is read or changed. Push, pull request, tag, release, deployment, host mutation, and production activation remain later explicit authorization gates. |
| Non-goals | Publishing or admitting `bangumi-collection-go`, implementing its adapter, changing API wire/statistics, adding Redis/persistence/background SWR, adding operational configuration, or redesigning the frontend |
| Operations deferred | Deployment sizing, service/process configuration, monitoring rollout, production load testing, release, cutover, and activation |
| Stop/rollback conditions | Stop before mutation if strict validation/main-agent review is missing, writable paths overlap an active owner, the provider would require an unpublished external tag, pooled typing cannot fail closed, the exact global limits cannot be proven, or any protected path changes. Roll back only this change's unstaged writable-path edits; never reset, clean, or overwrite unrelated work. |

Proposal, specs, design, and tasks passed strict validation and main-agent
review. Apply may proceed within the declared boundary.
