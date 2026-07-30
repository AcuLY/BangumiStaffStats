## Why

The co-star workspace needs the server-authoritative one-person cooperation
topology before it can move from one selected person to a multi-person analysis.

## What Changes

- Define the strict `POST /api/v1/partners` request, success, and error wire.
- Compute one source person's real Subject-level partners from Archive facts and
  the accepted query, with personal/global statistics and bounded caching.
- Return invariant leaders/summary plus a searched, sorted, paginated list.

## Capabilities

- `contracts-partners-api`: isolated versioned partners wire and goldens.
- `backend-partners-api`: Archive-backed partners service and HTTP operation.

## Scope

| Field | Value |
|---|---|
| Writable paths | Partners-only contracts/goldens/generators, `backend/internal/partners/**`, required shared OpenAPI/http/app/check inventories, generated partners DTOs, tests, and task markers |
| Dependencies | Accepted query/statistics/cache/person-detail authorities |
| Non-goals | Shared works in the response, multi-person matrix, frontend selected state, refresh, operations, release, or deployment |
