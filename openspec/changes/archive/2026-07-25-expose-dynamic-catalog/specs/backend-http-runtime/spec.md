## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/authority/path review and strict OpenSpec gates passed |
| Owner | Backend owner modifies only the exact approved runtime files after Contracts acceptance; main agent performs final review. |
| Writable paths | The exact `backend/internal/httpapi/**`, `backend/internal/app/**`, architecture/check/documentation files enumerated in `proposal.md`, plus Backend task markers. |
| Read-only protected inputs | All Contracts, Archive consumer files, undeclared backend paths, updater/frontend, root specs, authorities, refs/remotes, external state, and production. |
| Deletion complement | None; all accepted HTTP, health, image, timeout, request-ID, error, and shutdown behavior remains present. |
| Mutable refs | None. |
| Consumes | Accepted `backend-http-runtime`, accepted catalog API handoff, read-only Store integration, and the three exact exited dependencies. |
| Produces | The accepted runtime with one additional exact catalog route and no other route or lifecycle change. |
| Dependencies | Exactly `derive-position-catalog-and-cast`, `implement-backend-archive-consumer`, and `implement-backend-http-and-observability`, then Contracts acceptance. |
| Deliverables | Exact route/runtime composition changes and regression tests inside the declared Backend block. |
| Acceptance | Existing HTTP gates plus catalog method/input/not-ready/deadline/cancel/route-inventory tests and full race/build/OpenSpec checks. |
| Non-goals | Other business routes, transport redesign, Archive reload, query/statistics/cache/UI/operations. |
| Operations deferred | Production exposure, proxying, monitoring, deployment, migration, and cutover. |
| Stop/rollback conditions | Stop on any existing behavior regression, protected-path need, route broadening, dependency drift, or Contracts mismatch. |

## MODIFIED Requirements

### Requirement: Health routes SHALL reflect only process and published state

The infrastructure routes SHALL remain exact `GET /livez`, `GET /readyz`, and
`GET /metrics`; all reject other methods with 405 and exact `Allow: GET`.
Health responses SHALL be parameter-free `application/json` and `no-store`.
`/livez` SHALL return 200 from process state without Archive access as exactly
`{"data":{"status":"live"},"meta":{"requestId":"..."}}`. `/readyz` SHALL return
200 only after an injected one-second fixed read succeeds, as exactly
`{"data":{"status":"ready"},"meta":{"requestId":"...","dataVersion":"..."}}`;
nil, closed, mismatched, canceled, failing, or startup-load-failed state SHALL
return the generated 503 `NOT_READY` envelope without a dataVersion.
`/metrics` behavior belongs to `backend-observability`. The separately owned
exact image route SHALL remain independent of Archive publication and SHALL
not change any health response or readiness transition. The separately owned
exact catalog route SHALL depend on the same published Store but SHALL not
change readiness semantics, initiate loading, or select another snapshot.

#### Scenario: Archive publication changes
- **WHEN** the accepted state is absent, successfully published, its fixed probe fails, or shutdown clears it
- **THEN** liveness stays 200 while readiness transitions `503 -> 200 -> 503` without reading pointer/manifest files or choosing another snapshot
- **AND** image-route availability and catalog requests do not make readiness true

#### Scenario: Archive startup loading fails

- **WHEN** one accepted Archive load attempt returns a non-cancellation failure
- **THEN** `/livez`, `/readyz`, `/metrics`, the exact Archive-independent image route, and the exact catalog route SHALL begin serving; readiness and catalog SHALL remain 503 for that process lifetime
- **AND** no retry, fallback, reload, successful Archive-dependent business response, or Store selection SHALL occur

### Requirement: Runtime scope SHALL remain infrastructure-only

The reusable HTTP substrate SHALL remain infrastructure-only. Runtime
composition SHALL add only the separately specified exact image route and
exact `GET /api/v1/catalog` route. The catalog route SHALL consume only the
published read-only Store through `backend-dynamic-catalog`; it SHALL not
modify health semantics or the reusable decoder. Runtime SHALL add no
rankings, candidates, person-detail, partners, co-star, query-session,
updater, activation, wildcard proxy, or placeholder route and SHALL copy or
change no shared wire/schema.

#### Scenario: The HTTP substrate is accepted
- **WHEN** transport/fuzz/health/catalog/cancel/race/full/architecture/inventory and strict OpenSpec gates pass
- **THEN** the three infrastructure routes, separately owned image route, separately owned catalog route, and reusable infrastructure SHALL be claimed
- **AND** zero other business route, external mutation, or operations mutation SHALL exist
