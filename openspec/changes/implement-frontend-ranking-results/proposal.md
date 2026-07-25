## Why

The production Query Shell currently stops at a generic “query applied” state.
The rankings contract is now frozen for implementation, so the first real
result surface can be built in parallel with its backend.

## What Changes

- Add the strict rankings API adapter/driver and connect it to the existing
  query coordinator.
- Add the production ranking summary, toolbar, ranked person list, progress
  scale, responsive pagination, image lifecycle, and resource states.
- Preserve the approved prototype's outward ranking-list behavior while using
  the formal feature-first architecture.

## Capabilities

### New Capabilities

- `frontend-ranking-results`: production rankings request and list/pagination
  presentation for the formal SPA.

### Modified Capabilities

None.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented/verified/committed/pushed/released/deployed: no |
| Owner | One Frontend implementation agent; main agent audits visual/contract behavior and accepts. |
| Writable paths | `frontend/src/api/rankings.ts`, `frontend/src/api/adapters/rankings.ts`, `frontend/src/features/ranking/**`, `frontend/src/shared/components/**`, `frontend/src/shared/media/**`, `frontend/src/app/App.vue`, `frontend/src/shared/styles/base.css`, matching tests under `frontend/tests/**`, and this change's task markers |
| Read-only protected inputs | Generated rankings/query/catalog types, package/tool scripts, DESIGN/PRODUCT/oracle, backend/contracts, co-star features, refs/remotes |
| Consumes | Accepted Query Shell and the reviewed `contracts-rankings-api` delta; generated rankings types become available from the contract owner |
| Produces | Real rankings network driver and responsive list result surface |
| Dependencies | Query Shell exited; `expose-rankings` contract bytes are frozen and may be implemented concurrently; final acceptance requires its generated types and backend endpoint |
| Non-goals | Person detail data/UI, candidates, partners, co-star, frontend statistics recomputation, fixtures, operations |
| Operations deferred | Deployment, public configuration, monitoring, cutover |
| Mutable refs | None during apply; main agent may later commit/archive the accepted candidate |
