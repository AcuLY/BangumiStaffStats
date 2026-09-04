## Context

The accepted candidates schema and generated Go/TypeScript wire types already
define `data.summary.positionCounts[*].positionKey` and `.count`. The Backend
projection wraps the slice but serializes the internal domain `PositionCount`
directly; because that type intentionally has no JSON tags, `encoding/json`
emits `PositionKey` and `Count`. Existing Go tests decode back into the same
domain type, and Go's case-insensitive member matching hides the wire defect.

## Goals / Non-Goals

**Goals:** restore exact accepted JSON casing at the single candidate response
boundary, detect the regression from raw JSON, and prove the strict Frontend
consumer accepts a live local response.

**Non-Goals:** change internal candidate types, values, ordering, computation,
cache, service/handler behavior, schemas/goldens/generated code, Frontend
tolerance, or error copy.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Local focused correction; accumulated full gates deferred |
| Owner | Backend candidates projection |
| Writable paths | Exact proposal paths, projection.go, new projection_test.go, root backend-candidates-api spec later |
| Read-only protected inputs | Product/design, contracts/generated wire, Frontend, candidate computation/cache/service/handler, unrelated worktree/external state |
| Deletion complement | Preserve all fields/values/tests; remove only accidental upper-camel serialization |
| Mutable refs | Current worktree and local Backend process only |
| Consumes | Internal PositionCount and accepted candidates schema |
| Produces | Exact lower-camel position-count JSON |
| Dependencies | Standard encoding/json and existing contracts |
| Deliverables | Boundary DTO, raw JSON regression, focused tests/browser evidence |
| Acceptance | Exact keys, unchanged values, strict decoder/live co-star success |
| Non-goals | Algorithms, cache, handler/error/request/schema/frontend/dependency changes |
| Operations deferred | Complete gates/lifecycle/commit/push/release/deploy |
| Stop/rollback conditions | Contract conflict, value/order drift, protected edit need, focused/runtime failure |

Dependency direction remains `internal candidate Page -> private projection DTO
-> accepted candidates JSON -> strict Frontend decoder`. Internal computation
never imports or derives from Frontend.

## Decisions

### 1. Add a private response-only position-count DTO

`projection.go` maps each internal `PositionCount` to a private struct carrying
the exact `json:"positionKey"` and `json:"count"` tags. Other candidate DTOs
already follow this pattern. Adding tags to the domain type was rejected because
it couples cache/computation data to HTTP JSON and would silently authorize
future direct serialization elsewhere.

### 2. Assert raw JSON member identity

A focused projection test marshals an envelope, decodes its summary into
`map[string]json.RawMessage`, and requires the two accepted keys while rejecting
`PositionKey`/`Count`. Decoding only into a Go struct was rejected because it is
case-insensitive and reproduced the blind spot.

## Risks / Trade-offs

- **Mapping omits or reorders entries** -> preallocate and append in original
  slice order; assert exact raw member values.
- **Only one scope is corrected** -> both global and personal envelopes share
  the same `candidatesData` projection and focused tests cover the boundary.
- **Local process still serves the old binary** -> restart only the loopback
  Backend after tests, then inspect the live response before browser acceptance.

## Migration Plan

Implement the private DTO and raw JSON regression, run focused candidate Go and
Frontend decoder tests, restart the existing local Backend command with the same
Archive/configuration, and replay the browser query. Rollback restores only the
two Backend source/test paths and restarts the prior local process; production
remains untouched.

## Open Questions

None.
