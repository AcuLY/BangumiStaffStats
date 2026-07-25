## Why

Query and statistics evaluation are production-ready, but repeated collection
loads and result computation are still unbounded and uncached. The API needs a
deterministic, memory-bounded runtime layer before result endpoints are exposed.

## What Changes

- Add a reusable weighted LRU with immutable publication and exact byte/item
  limits.
- Add detached per-key singleflight loading and a bounded compute executor.
- Add collection freshness, stale fallback, negative caching, canonical digest,
  and result-cache key/value owners.

## Capabilities

### New Capabilities

- `backend-bounded-query-cache`: bounded collection/result caching and compute
  admission for read-only query operations.

### Modified Capabilities

None.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented/verified/committed/pushed/released/deployed: no |
| Owner | One Backend implementation agent; main agent audits and accepts. |
| Writable paths | `backend/internal/runtimecache/**`, `backend/internal/architecture/dependencies_test.go`, `backend/scripts/check.sh`, `backend/README.md`, `backend/go.mod`, `backend/go.sum`, and this change's task markers |
| Read-only protected inputs | Query/statistics/archive/httpapi production code, contracts, frontend, updater, other changes, refs/remotes, external repositories and services |
| Consumes | Accepted query/statistics authorities and `golang.org/x/sync/singleflight` |
| Produces | Tested cache primitives, collection cache policy, result key/store, and bounded executor |
| Dependencies | `implement-query-result-set` and `implement-statistics-series-sort-evidence`, both exited |
| Non-goals | Bangumi client admission, HTTP routes, endpoint DTO projection, Redis, persistence, background SWR, operations |
| Operations deferred | Configuration rollout, deployment, monitoring, migration, cutover |
| Mutable refs | None during apply; main agent may later commit/archive the accepted candidate |
