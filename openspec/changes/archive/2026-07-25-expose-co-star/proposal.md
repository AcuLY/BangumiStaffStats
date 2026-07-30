## Why

The production co-star workspace needs its final server-authoritative
multi-person operation after candidates and one-person partners.

## What Changes

- Define strict `POST /api/v1/co-star` contracts for pair and group analysis.
- Compute participant identity unions, real common works, pairwise group matrix,
  statistics/evidence, and paginated subject/series items from Archive facts.
- Expose the operation through the bounded runtime and isolated generators.

## Capabilities

- `contracts-co-star-api`: versioned pair/group wire and goldens.
- `backend-co-star-api`: Archive-backed co-star core, projection, cache, and HTTP operation.

## Scope

| Field | Value |
|---|---|
| Writable paths | Co-star-only contracts/goldens/generators, `backend/internal/costar/**`, required shared OpenAPI/http/app/check inventories, generated co-star DTOs, tests, and task markers |
| Dependencies | Accepted candidates, partners, person-detail work/contribution primitives, query/statistics/cache authorities |
| Non-goals | Frontend selected state, server sessions/query IDs, tokens, refresh, operations, release, or deployment |
