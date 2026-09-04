## Capability Boundary

- **Status:** intentional Backend startup/readiness delta, local-only.
- **Owner:** Backend HTTP runtime.
- **Writable paths:** `backend/internal/app/{run.go,run_test.go}`,
  `backend/internal/httpapi/{handler.go,handler_test.go}`, this change, and the
  synchronized root capability.
- **Read-only protected inputs:** API/OpenAPI contracts, query services,
  frontend, updater, Archive bytes, remotes, and production.
- **Deletion complement:** admission coupling/assertions only; all routes,
  envelopes, deadlines, readiness probe, and degraded serving remain.
- **Mutable refs:** local topic branch only.
- **Consumes:** direct-open Archive State and existing HTTP/Store interfaces.
- **Produces:** unchanged routes backed by direct-open readiness.
- **Dependencies:** `backend-archive-consumer`, observability, query routes.
- **Deliverables:** runtime/test wording and behavior updates.
- **Acceptance:** preserved response shapes/statuses with no admission call.
- **Non-goals:** route/schema/query/UI/deployment changes.
- **Operations deferred:** all external integration and live mutation.
- **Stop/rollback conditions:** stop on HTTP behavior drift or failed gates;
  return to parent runtime.

## MODIFIED Requirements

### Requirement: Health routes SHALL reflect only process and published state

The infrastructure routes SHALL remain exact `GET /livez`, `GET /readyz`, and
`GET /metrics`; all reject other methods with 405 and exact `Allow: GET`.
Health responses SHALL be parameter-free `application/json` and `no-store`.
`/livez` SHALL return 200 from process state without Archive access as exactly
`{"data":{"status":"live"},"meta":{"requestId":"..."}}`. `/readyz` SHALL
return 200 only after direct snapshot open/publication and an injected
one-second fixed read succeed, as exactly
`{"data":{"status":"ready"},"meta":{"requestId":"...","dataVersion":"..."}}`;
nil, closed, mismatched, canceled, failing, or startup-open-failed state SHALL
return the generated 503 `NOT_READY` envelope without a dataVersion.

`/metrics` behavior belongs to `backend-observability`. The separately owned
image route SHALL remain independent of Archive publication. The catalog route
SHALL depend on the same published Store but SHALL not change readiness,
initiate loading, select another snapshot, or perform Archive admission.

#### Scenario: Direct-open publication changes

- **WHEN** direct-open state is absent, successfully published, its fixed probe
  fails, or shutdown clears it
- **THEN** liveness SHALL stay 200 while readiness transitions
  `503 -> 200 -> 503` without reading manifest files, scanning Archive,
  choosing another snapshot, or running admission
- **AND** image/catalog requests SHALL not make readiness true

#### Scenario: Archive startup open fails

- **WHEN** the one direct Archive open attempt returns a non-cancellation
  failure
- **THEN** `/livez`, `/readyz`, `/metrics`, the Archive-independent image route,
  and catalog route SHALL begin serving; readiness and catalog SHALL remain 503
  for that process lifetime
- **AND** no retry, fallback, reload, successful Archive-dependent business
  response, Store selection, or admission SHALL occur
