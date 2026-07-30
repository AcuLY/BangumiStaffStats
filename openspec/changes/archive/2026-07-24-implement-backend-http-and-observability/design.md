## Context

The foundation currently serves an empty `net/http` mux; the in-progress Archive consumer owns validation and a single-assignment state. This change starts only after that consumer is accepted and turns those pieces into a bounded HTTP runtime without anticipating any business handler.

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved after lifecycle, cancellation, mandatory raw-validator, and startup-event write-failure closure; implemented: complete; owner, independent, and main-agent verification: complete; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | One Backend owner applies; main agent reviews and accepts. |
| Writable paths | Exactly the planning/apply paths declared in `proposal.md`; generated wire and Archive implementation remain read-only. |
| Read-only protected inputs | Accepted Archive state, shared contracts/generated wire, guides/root specs, other code/changes, refs/remotes, hosts, and production. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Accepted runtime/query-wire capabilities and accepted Archive state/store. |
| Produces | HTTP infrastructure, health/readiness/metrics routes, typed metrics, and allowlisted events. |
| Dependencies | Apply waits for accepted `implement-backend-archive-consumer`; Go stays pinned and no module is added. |
| Deliverables | Exact files, cumulative foundation delta, tests, guards, and documentation in the proposal. |
| Acceptance | Transport/fuzz/commit-aware cancel and deadline/health/startup failure/metrics/event/race plus full backend and strict OpenSpec gates. |
| Non-goals | Business endpoints, Archive logic, producer/updater events, pprof, auth/CORS, operations, or monitoring deployment. |
| Operations deferred | Exposure, scrape/alerts/retention/SLOs, production limits, service/proxy config, activation, release, and deployment. |
| Stop/rollback conditions | Stop on dependency/path/authority drift or failed gates; cancel owned serving and preserve accepted state/protected inputs. |

Dependency direction is `cmd/api -> app -> {archive,httpapi}`, `httpapi -> {observability,wire}`, and `observability -> standard library`. `httpapi` receives a narrow readiness probe assembled by `app`, so it neither loads nor validates Archive files; domain/archive code never imports transport.

## Goals / Non-Goals

**Goals:** establish one strict reusable transport, deterministic health semantics, low-cardinality in-process observability, and cancellation-safe tests before business routes are implemented.

**Non-Goals:** expose placeholder API routes, duplicate shared DTOs, add a middleware/Prometheus dependency, implement producer or operations behavior, or preserve any legacy backend wire.

## Decisions

### Keep the runtime standard-library-only

Use `http.Server`, `ServeMux`, `encoding/json`, `log/slog`, atomics, and a small typed metrics registry. Alternatives such as router, middleware, request-ID, and Prometheus client libraries add ownership and dependency surface before a need the standard library cannot satisfy. Acceptance asserts no new module and parses the exposition rather than trusting string snapshots.

### Bound the connection and request lifecycle

Configure 5s read-header, 10s read, 35s write, 60s idle, 64 KiB headers, the existing 5s graceful shutdown, and a 30s request-context deadline. Middleware creates the request ID before recovery/deadline/metrics; downstream receives the derived context, and cancellations/deadlines map to stable bounded errors only when a response has not already committed.

If the derived deadline wins before commit, middleware writes one 504
`UPSTREAM_TIMEOUT` envelope with `retryable=true`, initialized empty
`fieldErrors`, request ID, and no dataVersion. If client or process
cancellation wins before commit, it writes no synthetic status or body because
the peer or server is leaving; metrics use the closed `canceled` outcome and
`none` status class. Once any response commits, timeout, cancellation, or panic
can only stop downstream work and record its bounded outcome; middleware never
overwrites or appends a second envelope.

### Make strict JSON a reusable transport primitive

Business POST routes added later must call one decoder that rejects any media
type except parameter-free `application/json`, any content encoding, bodies
over 65,536 bytes before unbounded allocation, empty/trailing values, and
invalid JSON. Before typed assignment, the decoder must pass the exact bounded
raw value to one mandatory typed structural validator. That endpoint-owned
validator rejects unknown fields and enforces the applicable contract's
required-field and null-presence rules while the raw representation can still
distinguish omission from explicit `null`; only then may the same bytes enter a
plain or generated typed target.

The transport must not infer JSON Schema required/null semantics from Go zero
values, pointer shape, or `omitempty`, and `DisallowUnknownFields` alone is not
sufficient because generated union `UnmarshalJSON` methods may retain raw bytes
without traversing their members. A missing validator is an
`INVALID_REQUEST`; a validator failure is a bounded structural
`INVALID_REQUEST`. Later endpoint changes own their schema-specific validator
and field-path mapping. This change provides and tests only the transport
protocol with test validators, including generated-union/custom-unmarshal
bypass cases, without copying a shared DTO or registering a fake business
route.

### Adapt, do not reimplement, Archive readiness

`app` injects a probe that obtains only the currently published store, runs a one-second fixed `archive_meta` read, and confirms its dataVersion against the published identity. Nil/closed/query-failing state returns `NOT_READY`; no pointer, manifest, digest, integrity, fallback, reload, or activation logic is repeated. `/livez` never touches Archive. Health success uses a minimal closed `data`/`meta` envelope, while every error uses the generated shared envelope and exact status/code mapping.

The application attempts the accepted one-shot Archive load before entering
`Serve`. Success publishes the store. A non-cancellation load failure closes
its candidate, emits exactly one typed `archive_load_failed` app event, and
still starts only the three runtime routes with readiness false for the process
lifetime; it does not retry, reload, fall back, or expose a business route. If
the process context is canceled during load, the same bounded event is emitted
and startup returns without serving. Shutdown always stops serving before
clearing and closing any published store.

Degraded serving begins only after the event sink accepts one complete JSON
line. A writer error or short write cannot satisfy the mandatory startup
event: startup must close the owned Archive state, return the operational
failure immediately, and never call `Serve`. It must not run an unobservable
permanently-not-ready process or retry the event within the same process.

### Restrict observability at the API boundary

Typed metric methods admit only fixed route/operation/outcome/status enums;
request/user/entity/query/digest values cannot become labels, with dataVersion
allowed only on current-snapshot info. The request outcome enum includes
`canceled`, and its status-class enum includes `none` only for an uncommitted
client/process cancellation. Typed JSON events similarly construct an
allowlist rather than filtering arbitrary maps after the fact.
`archive_load_failed` is an app-channel/startup-phase event whose error code is
the stable consumer code or `INTERNAL_ERROR`; it contains no root, path,
document/SQLite value, raw error, dataVersion, request, or user input. Health
and metrics scrapes produce no query event, and no event named
`update_activated` exists.

## Risks / Trade-offs

- [Handwritten exposition drifts] → parse HELP/TYPE/sample output, fuzz labels, and keep a typed fixed inventory.
- [Timeout races with writes] → one response recorder owns commit state; cancellation/race tests cover late handlers.
- [Readiness accidentally becomes a second validator] → inject one fixed probe and forbid filesystem/manifest access.
- [Logs or labels leak attacker input] → constructors accept enums/counts/durations, never raw request/error maps.
- [The mandatory startup event cannot be written] → fail startup before
  serving, close owned Archive state, and propagate the writer/short-write
  failure instead of running an unobservable degraded process.

## Migration Plan

After Archive consumer acceptance and main review, apply the exact runtime files, replace the empty application assembly, and run all gates. Rollback is the owned code candidate only; no data, external state, activation, deployment, or monitoring configuration changes.

## Open Questions

None.
