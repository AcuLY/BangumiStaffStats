## Why

The production ranking list must open an Archive-backed person inspector
without downloading a browser-side snapshot or recomputing statistics.

## What Changes

- Define the closed `POST /api/v1/person-detail` success contract and shared
  personal/global/error goldens.
- Build and cache one complete person core from the accepted query and
  statistics authorities, then project works or characters on demand.
- Wire strict transport and isolated generated models after the concurrent
  rankings authority has been committed.

## Capabilities

- `contracts-person-detail-api`: versioned person, metrics, evidence,
  subject/series/character, contribution, and pagination DTOs.
- `backend-person-detail-api`: Archive-backed person-detail service, cache,
  view projection, handler, and runtime wiring.

## Scope

| Field | Value |
|---|---|
| Early writable paths | New `contracts/schemas/person-detail/**`, `contracts/goldens/api/person-detail/**`, person-detail-only generators, and `backend/internal/persondetail/**` |
| Deferred shared paths | Shared OpenAPI, app/http registry, generated shared inventories, and frontend packages wait for rankings commit |
| Read-only inputs | Accepted query, statistics, cache, Archive, catalog, rankings, updater, frontend, refs/remotes |
| Non-goals | Partners, co-star aggregation, frontend inspector UI, collection refresh, deployment, release, or operations |
