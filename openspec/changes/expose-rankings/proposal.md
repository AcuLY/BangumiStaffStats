## Why

The backend can normalize queries and compute authoritative statistics, but the
formal SPA still has no production result endpoint. Rankings are the first
complete read-only result vertical and the dependency for person detail and
the remaining relationship operations.

## What Changes

- Define the versioned rankings request/response contract and shared goldens.
- Project immutable query/statistics cores into stable ranked/searchable pages.
- Expose and wire strict `POST /api/v1/rankings`.

## Capabilities

### New Capabilities

- `contracts-rankings-api`: cross-language request, response, error, and golden
  contract for rankings.
- `backend-rankings-api`: Archive-backed rankings core, view projection, and
  production HTTP endpoint.

### Modified Capabilities

None.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented/verified/committed/pushed/released/deployed: no |
| Owner | One Rankings implementation agent; main agent audits the contract and accepts. |
| Writable paths | `contracts/openapi/openapi.yaml`, `contracts/schemas/rankings/**`, `contracts/goldens/api/rankings/**`, exact query/catalog contract generation evidence needed after the authority hash changes, `backend/internal/ranking/**`, `backend/internal/httpapi/rankings_handler.go`, `backend/internal/httpapi/rankings_handler_test.go`, `backend/internal/httpapi/handler.go`, `backend/internal/httpapi/handler_test.go`, `backend/internal/httpapi/wire/rankings.gen.go`, `backend/internal/app/run.go`, `backend/internal/app/run_test.go`, ranking generation/check scripts, `frontend/src/api/generated/rankings/**`, ranking-only frontend generation/check scripts, `frontend/package.json`, and this change's task markers |
| Read-only protected inputs | Existing query/statistics/archive/catalog algorithms and generated projections, frontend UI/features, updater, cache implementation paths, external repositories/services, refs/remotes |
| Consumes | Accepted shared query, dynamic catalog, query result, statistics authority, Archive Store, and the approved bounded-cache interface once available |
| Produces | One strict cross-language rankings contract, backend service/projection, HTTP route, generated models, and production wiring |
| Dependencies | Query/catalog/statistics changes exited; bounded cache may complete concurrently but final acceptance requires its interface integration |
| Non-goals | Candidates, person detail, partners, co-star, frontend ranking UI, collection package publication, operations |
| Operations deferred | Runtime configuration, release, deployment, migration, monitoring, cutover |
| Mutable refs | None during apply; main agent may later commit/archive the accepted candidate |
