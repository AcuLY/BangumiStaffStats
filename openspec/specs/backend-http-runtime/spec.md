# backend-http-runtime Specification

## Purpose
Define the bounded standard-library HTTP lifecycle, request identity, strict
JSON/error transport, exact health/readiness/metrics routes, and the reusable
boundary on which separately owned exact business routes are composed.
## Requirements
### Requirement: The HTTP lifecycle SHALL be bounded and cancellation-safe

The standard-library server SHALL enforce 5s read-header, 10s read, 35s write,
60s idle, 64 KiB header, 30s request, and existing 5s graceful-shutdown
bounds. It SHALL propagate client/process cancellation and the derived
deadline to downstream work. If the deadline wins before response commit, it
SHALL emit 504 `UPSTREAM_TIMEOUT`, `retryable=true`, initialized empty
`fieldErrors`, request ID, and no dataVersion. If client or shutdown
cancellation wins before commit, it SHALL write no synthetic status or body.
After commit, timeout, cancellation, or panic SHALL NOT overwrite or append
another response. A pre-commit panic SHALL become one sanitized
`INTERNAL_ERROR`. Serving SHALL stop without leaked goroutines after shutdown.

#### Scenario: Work is canceled or exceeds its deadline
- **WHEN** a test handler waits on its request context and the client cancels, the deadline expires, or process shutdown begins before or after commit
- **THEN** downstream observes the exact context outcome, only an uncommitted deadline emits the bounded 504 envelope, cancellation emits no synthetic response, and no committed response is overwritten
- **AND** serving finishes within its bound while race/leak checks pass

### Requirement: Request identity and errors SHALL use one strict envelope

Every request SHALL receive a server-generated opaque nonempty request ID;
inbound `X-Request-ID` SHALL be ignored. The ID SHALL enter context and the
response `X-Request-ID` before downstream can commit, plus `meta.requestId` on
every JSON success/error envelope. Unknown path, wrong method, readiness
failure, request deadline, and pre-commit panic SHALL map exactly to
`404 ENTITY_NOT_FOUND retryable=false`, `405 INVALID_REQUEST retryable=false`,
`503 NOT_READY retryable=true`, `504 UPSTREAM_TIMEOUT retryable=true`, and
`500 INTERNAL_ERROR retryable=true`. Errors SHALL use the generated
`ErrorEnvelopeV1`, stable status/code/retryable mapping, an initialized empty
or safe-known `fieldErrors` map, `application/json`, and `no-store`; messages
SHALL expose no raw request, path fragment, credential, upstream body, or
internal error.

#### Scenario: An invalid or attacker-supplied request is rejected
- **WHEN** a request supplies its own ID, an unknown path, a wrong method, malformed transport, or a panicking handler
- **THEN** the server replaces the ID and emits one bounded envelope using `ENTITY_NOT_FOUND`, `INVALID_REQUEST`, the applicable transport code, or `INTERNAL_ERROR`

### Requirement: JSON transport SHALL be strict and bounded

The shared decoder SHALL accept exactly one parameter-free `application/json`
value of at most 65,536 bytes and SHALL reject any present content-encoding
header, missing/other media type, empty body, malformed JSON, or trailing
value. It SHALL preserve the exact bounded raw value through one mandatory
typed structural validator before assigning the same value to a plain or
generated typed destination. That validator SHALL reject every unknown field
and enforce the applicable endpoint contract's required-field and
null-presence rules before Go decoding can collapse omission and explicit
`null`. A missing validator, validator rejection, or typed shape failure SHALL
map to 400 `INVALID_REQUEST`; syntax failure SHALL map to 400 `INVALID_JSON`.
Overflow SHALL map to 413 `REQUEST_TOO_LARGE`; media failure SHALL map to 415
`UNSUPPORTED_MEDIA_TYPE`. The decoder SHALL allocate no body-sized buffer above
the cap and SHALL preserve the request context.

The transport SHALL NOT infer required/null semantics from Go zero values,
pointer types, or `omitempty`; SHALL NOT treat `DisallowUnknownFields` as
sufficient for a generated union or another custom `UnmarshalJSON` target; and
SHALL NOT copy shared DTOs to regain presence information. Schema-specific
validators and safe field paths belong to the later endpoint change that owns
the request contract. This infrastructure change SHALL provide only
test-scoped validators proving that raw omission versus `null`, nested unknown
fields, and generated-union/custom-unmarshal bypass remain observable and are
rejected before typed assignment.

#### Scenario: Decoder corpus is fuzzed
- **WHEN** boundary-sized, oversized, encoded, parameterized-media,
  unknown-field, missing-required, explicit-null, truncated, non-finite,
  multi-value, nested-unknown, and generated-union/custom-unmarshal bypass
  bodies are exercised and fuzzed through the mandatory validator
- **THEN** only one raw-and-structurally-valid value reaches typed assignment,
  omission remains distinguishable from explicit `null`, and every rejection
  has a stable bounded classification

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
