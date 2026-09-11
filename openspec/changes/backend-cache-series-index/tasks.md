## Task Boundary

| Field | Boundary |
|---|---|
| Status | Local focused fix; full gate deferred |
| Owner | Backend statistics/app |
| Writable paths | Exact proposal paths and later root spec |
| Read-only protected inputs | Contracts/Archive/other components/worktrees/external state |
| Deletion complement | Preserve formulas/queries/gates/tests/admission removal |
| Mutable refs | Current local worktree only |
| Consumes | Immutable Store/context |
| Produces | Shared SeriesIndex and timing evidence |
| Dependencies | Existing stdlib/statistics/app |
| Deliverables | Code/focused tests/native timing/strict change validation |
| Acceptance | Reuse/retry/nonblocking readiness and reduced repeated SQLite time |
| Non-goals | Other caches/full gate/deployment |
| Operations deferred | Batched gate, sync/archive, commit/push/release/deploy |
| Stop/rollback conditions | Race/leak/result/readiness/timing failure |

## 1. Preflight and implementation

- [x] 1.1 Verify no overlap and strict-valid reviewed planning artifacts.
- [x] 1.2 Implement coalesced Store-keyed SeriesIndex cache and post-readiness warmup.
- [x] 1.3 Add focused sequential/concurrent/cancellation/retry tests.

## 2. Focused validation

- [x] 2.1 Run statistics/app focused tests, race for statistics, build, strict change validation, and diff check.
- [x] 2.2 Restart native Backend with image proxy and compare real ranking/person-detail SQLite timings.

## 3. Deferred lifecycle

- [x] 3.1 Leave full gate, root-spec sync/archive, commit/push/release/deploy for the requested later batch.
