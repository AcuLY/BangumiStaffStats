## Context

`statistics.LoadSeriesIndex` scans every subject and relation, then builds an
immutable index. Personal rankings and each person-detail core call it again;
real logs show 15–17 seconds of repeated SQLite work. Production has one Store
per process and no hot reload.

## Goals / Non-Goals

**Goals:** share one successful immutable index per Store, coalesce concurrent
callers, retry after failure/cancellation, and warm without delaying readiness.

**Non-Goals:** no FactSet/people cache, formula/wire/timeout/admission change,
dependency, or full-gate run in this quick fix.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Local focused implementation/verification |
| Owner | Backend statistics; app invokes warmup |
| Writable paths | Exact proposal paths and later root spec |
| Read-only protected inputs | Contracts, Archive bytes, other components/worktrees/external state |
| Deletion complement | Preserve all formulas, queries, gates, and tests |
| Mutable refs | Current local worktree only |
| Consumes | Immutable Store and process context |
| Produces | One immutable SeriesIndex cache entry per Store |
| Dependencies | Existing stdlib sync/context and statistics loader |
| Deliverables | Source/tests/timing/strict change validation |
| Acceptance | One build per Store; concurrent reuse; error retry; readiness nonblocking |
| Non-goals | Broad caching/tuning or deployment |
| Operations deferred | Full gate and integration lifecycle batch |
| Stop/rollback conditions | Stop on race/leak/readiness/result drift or failed timing |

Direction remains `app -> statistics -> archive.Store`; no reverse dependency.

## Decisions

Use a package-local `sync.Map` keyed by Store pointer. Each entry owns a closed
completion channel, immutable index, and terminal error. The winning caller
builds; waiters observe their own cancellation while shared work continues.
Failed entries are deleted after publishing the failure so the next call can
retry. The cache retains the Store for process lifetime, matching the existing
single-Store/no-hot-reload contract. App starts one context-bound goroutine
after readiness publication; it neither changes readiness nor logs failure.

Alternatives rejected: caching by dataVersion can alias mutated test Stores;
rebuilding concurrently wastes the exact scan being removed; synchronous warm
would recreate startup blocking.

## Risks / Trade-offs

- **Retained memory** -> one index per process Store only.
- **Canceled first builder** -> delete failed entry; next request retries.
- **Shutdown overlap** -> warm uses process context and Store query cancellation.
- **Hidden behavior drift** -> pointer identity and real latency tests; formulas unchanged.

## Migration Plan

Focused test, build temporary native binary, restart local Backend with image
proxy, compare real request phase timings. Full gate/sync/archive waits for the
session batch.

## Open Questions

None.
