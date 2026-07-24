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
not change any health response or readiness transition.

#### Scenario: Archive publication changes
- **WHEN** the accepted state is absent, successfully published, its fixed probe fails, or shutdown clears it
- **THEN** liveness stays 200 while readiness transitions `503 -> 200 -> 503` without reading pointer/manifest files or choosing another snapshot
- **AND** image-route availability does not make readiness true

#### Scenario: Archive startup loading fails

- **WHEN** one accepted Archive load attempt returns a non-cancellation failure
- **THEN** `/livez`, `/readyz`, `/metrics`, and the exact Archive-independent image route SHALL begin serving, readiness SHALL remain 503 for that process lifetime, and no retry, fallback, reload, or Archive-dependent business route SHALL occur

### Requirement: Runtime scope SHALL remain infrastructure-only

The reusable HTTP substrate SHALL remain infrastructure-only. Runtime
composition SHALL add only the separately specified exact image route; it
SHALL add no catalog, rankings, candidates, person-detail, partners, co-star,
query-session, updater, activation, wildcard proxy, or placeholder route and
SHALL copy or change no shared wire/schema.

#### Scenario: The HTTP substrate is accepted
- **WHEN** transport/fuzz/health/cancel/race/full/architecture/inventory and strict OpenSpec gates pass
- **THEN** the three infrastructure routes, the one separately owned exact image route, and reusable infrastructure SHALL be claimed, with zero other business route, external mutation, or operations mutation
