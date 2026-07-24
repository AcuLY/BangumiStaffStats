## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no |
| Owner | Backend implementation owner; main agent reviews and accepts. |
| Writable paths | The `httpapi`, app/cmd, architecture/check/README, and task-marker files enumerated in `proposal.md`. |
| Read-only protected inputs | Accepted `archive/**`, contracts/generated wire, guides/root specs, other code/changes, refs/remotes, hosts, and production. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Accepted backend foundation/query wire and one injected view of accepted Archive publication state. |
| Produces | Bounded HTTP lifecycle, strict transport primitives, and three exact runtime routes. |
| Dependencies | Apply waits for accepted `implement-backend-archive-consumer`; no new dependency. |
| Deliverables | Server, handler, middleware, transport, assembly, tests, guards, and docs. |
| Acceptance | Route/method/body/media/envelope/ID/deadline/cancel/panic/readiness/fuzz/race/full gates. |
| Non-goals | Business handlers, Archive validation/mutation, producer, auth/CORS, pprof, operations, or deployment. |
| Operations deferred | Production listeners/limits/exposure, service/proxy config, activation/restart, release/deploy. |
| Stop/rollback conditions | Stop on drift/failure; stop owned serving and preserve the accepted Archive and all protected inputs. |

Dependency direction SHALL be `cmd/api -> app -> {archive,httpapi}`, `httpapi -> {observability,wire}`; transport SHALL accept an injected readiness probe and SHALL NOT import filesystem/producer logic or create another store.

## ADDED Requirements

### Requirement: The HTTP lifecycle SHALL be bounded and cancellation-safe

The standard-library server SHALL enforce 5s read-header, 10s read, 35s write, 60s idle, 64 KiB header, 30s request, and existing 5s graceful-shutdown bounds. It SHALL propagate client cancellation and the derived deadline to downstream work, recover panics as a sanitized `INTERNAL_ERROR` before commit, and never continue serving or leak goroutines after shutdown.

#### Scenario: Work is canceled or exceeds its deadline
- **WHEN** a test handler waits on its request context and the client cancels, the deadline expires, or process shutdown begins
- **THEN** downstream observes cancellation, serving finishes within its bound, and race/leak checks pass without a late conflicting write

### Requirement: Request identity and errors SHALL use one strict envelope

Every request SHALL receive a server-generated opaque nonempty request ID; inbound `X-Request-ID` SHALL be ignored. The ID SHALL enter context and the response `X-Request-ID`, plus `meta.requestId` on JSON success/error envelopes. Unknown path, wrong method, readiness failure, and pre-commit panic SHALL map exactly to `404 ENTITY_NOT_FOUND retryable=false`, `405 INVALID_REQUEST retryable=false`, `503 NOT_READY retryable=true`, and `500 INTERNAL_ERROR retryable=true`. Errors SHALL use the generated `ErrorEnvelopeV1`, stable status/code/retryable mapping, an initialized empty or safe-known `fieldErrors` map, `application/json`, and `no-store`; messages SHALL expose no raw request, path fragment, credential, upstream body, or internal error.

#### Scenario: An invalid or attacker-supplied request is rejected
- **WHEN** a request supplies its own ID, an unknown path, a wrong method, malformed transport, or a panicking handler
- **THEN** the server replaces the ID and emits one bounded envelope using `ENTITY_NOT_FOUND`, `INVALID_REQUEST`, the applicable transport code, or `INTERNAL_ERROR`

### Requirement: JSON transport SHALL be strict and bounded

The shared decoder SHALL accept exactly one parameter-free `application/json` value of at most 65,536 bytes and SHALL reject any content encoding, missing/other media type, unknown field, empty body, malformed JSON, or trailing value. Overflow SHALL map to 413 `REQUEST_TOO_LARGE`; media failure to 415 `UNSUPPORTED_MEDIA_TYPE`; syntax/shape failures to 400 `INVALID_JSON`/`INVALID_REQUEST`. It SHALL allocate no body-sized buffer above the cap and SHALL preserve the request context.

#### Scenario: Decoder corpus is fuzzed
- **WHEN** boundary-sized, oversized, encoded, parameterized-media, unknown-field, truncated, non-finite, and multi-value bodies are exercised and fuzzed
- **THEN** only one valid strict value reaches the typed handler and every rejection has a stable bounded classification

### Requirement: Health routes SHALL reflect only process and published state

The only routes introduced SHALL be exact `GET /livez`, `GET /readyz`, and `GET /metrics`; all reject other methods with 405 and exact `Allow: GET`. Health responses SHALL be parameter-free `application/json` and `no-store`. `/livez` SHALL return 200 from process state without Archive access as exactly `{"data":{"status":"live"},"meta":{"requestId":"..."}}`. `/readyz` SHALL return 200 only after an injected one-second fixed read succeeds, as exactly `{"data":{"status":"ready"},"meta":{"requestId":"...","dataVersion":"..."}}`; nil, closed, mismatched, canceled, or failing published state SHALL return the generated 503 `NOT_READY` envelope without a dataVersion. `/metrics` behavior belongs to `backend-observability`.

#### Scenario: Archive publication changes
- **WHEN** the accepted state is absent, successfully published, its fixed probe fails, or shutdown clears it
- **THEN** liveness stays 200 while readiness transitions `503 -> 200 -> 503` without reading pointer/manifest files or choosing another snapshot

### Requirement: Runtime scope SHALL remain infrastructure-only

Acceptance SHALL prove no catalog, rankings, candidates, person-detail, partners, co-star, image, query session, updater, activation, or placeholder route exists, and no shared wire/schema is copied or changed.

#### Scenario: The HTTP substrate is accepted
- **WHEN** transport/fuzz/health/cancel/race/full/architecture/inventory and strict OpenSpec gates pass
- **THEN** only the three runtime routes and reusable infrastructure SHALL be claimed, with zero external or operations mutation
