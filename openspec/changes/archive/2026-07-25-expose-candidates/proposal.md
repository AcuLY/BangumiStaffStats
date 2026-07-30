## Why

The co-star workspace needs server-authoritative candidate lists for every
ordered query position. The prototype computes and paginates those lists in
the browser, which cannot ship in the formal SPA.

## What Changes

- Define a closed `POST /api/v1/candidates` request, success envelope, and
  deterministic global/personal/error goldens.
- Compute complete unsearched candidate counts per ordered position and one
  ranked, searched, paginated current-position list in Go.
- Reuse the accepted query/statistics/cache/transport authorities and wire the
  operation into the production API without fixtures or selected-person state.
- Generate isolated Go and TypeScript candidate DTOs from the capability-owned
  OpenAPI projection.

## Capabilities

- `contracts-candidates-api`: versioned wire contract and shared goldens.
- `backend-candidates-api`: Archive-backed candidate core, view projection,
  HTTP handler, cache integration, and runtime wiring.

## Scope and ownership

| Field | Value |
|---|---|
| Writable paths | `contracts/openapi/openapi.yaml`, `contracts/schemas/candidates/**`, `contracts/goldens/api/candidates/**`, exact candidate generation/check scripts and generated candidate DTOs, `backend/internal/candidates/**`, `backend/internal/httpapi/candidates_handler.go`, `backend/internal/httpapi/candidates_handler_test.go`, required existing backend app/http/check/architecture files, `frontend/src/api/generated/candidates/**`, `frontend/package.json`, and this change's task markers |
| Read-only inputs | Accepted query, statistics, runtime-cache, Archive, catalog, and rankings production packages; frontend feature/UI paths; updater; external repositories; refs/remotes |
| Concurrent boundary | Until `expose-rankings` is committed, the apply agent SHALL work only in new candidate-owned schema/golden/generator/core paths and SHALL not edit the shared OpenAPI, app/http registry, check inventory, or package metadata |
| Produces | One strict candidate contract, immutable candidate core, POST handler, generated models, tests, and production wiring |
| Dependencies | `expose-rankings` for final shared-authority/wiring acceptance; accepted query/statistics/cache/catalog/runtime capabilities |
| Non-goals | Person detail, partners, co-star analysis, frontend selected state, arbitrary image URLs, deployment, release, or operations |
