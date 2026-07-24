## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | Existing accepted foundation approved for the three-route HTTP runtime, not-ready Archive-load failure and event-write-failure lifecycle, and observability package graph; implementation and owner, independent, and main-agent verification complete. |
| Owner | Main agent owns this cumulative specification amendment; Backend owner implements through this HTTP/observability change. |
| Writable paths | This delta file and the lifecycle-generated root `openspec/specs/backend-runtime-foundation/spec.md`; implementation paths remain those declared by this change. |
| Read-only protected inputs | Existing root capability, accepted Archive consumer, contracts/generated wire, guides, other code/changes, refs/remotes, hosts, monitoring, and production. |
| Deletion complement | None. |
| Mutable refs | None before accepted local lifecycle finalization. |
| Consumes | The accepted post-consumer `backend-runtime-foundation`, `backend-archive-consumer`, `contracts-query-wire`, and the two reviewed HTTP/observability capability deltas. |
| Produces | A cumulative foundation contract for the exact three-route health runtime, fail-observable not-ready startup, shutdown ordering, and admitted observability package. |
| Dependencies | Accepted `bootstrap-backend-runtime`, `define-shared-query-wire`, and `implement-backend-archive-consumer`. |
| Deliverables | Full replacements for the API-process lifecycle and package-direction requirements only. |
| Acceptance | Archive success/failure/cancellation lifecycle tests, exact route and architecture guards, full backend gates, strict OpenSpec validation, and synchronized-root review. |
| Non-goals | Business routes, Archive retry/reload/fallback, producer/updater behavior, operations, monitoring deployment, release, or deployment. |
| Operations deferred | Production listener/exposure, service management, activation/restart, scrape/alerts/retention, release, and deployment. |
| Stop/rollback conditions | Stop if the accepted post-consumer root requirements drift, implementation fails, or synchronization would alter an undeclared requirement. |

## MODIFIED Requirements

### Requirement: The API process SHALL have a bounded lifecycle

The standard-library server SHALL accept a supplied listener and an explicit
absolute Archive root. Before entering `Serve`, it SHALL attempt exactly one
accepted Archive load. Success SHALL atomically publish the complete store. A
non-cancellation load failure SHALL close the candidate, emit exactly one
bounded `archive_load_failed` app/startup event, and then serve only exact
`GET /livez`, `GET /readyz`, and `GET /metrics` with readiness false for that
process lifetime; it SHALL NOT retry, reload, fall back, or expose a business
route. If the process context is canceled during load, startup SHALL emit the
same bounded event and return without serving.

If the mandatory event writer fails or short-writes, startup SHALL close the
owned Archive state, propagate that operational failure, and return without
calling `Serve`; a partial or failed write SHALL NOT authorize an unobservable
degraded runtime.

The process SHALL propagate listener, non-normal serve, and Store-close
failures and SHALL complete context-driven graceful shutdown within five
seconds without leaking goroutines. Shutdown SHALL stop serving before it
clears readiness and closes any published Store.

#### Scenario: Process starts with a valid Archive and stops

- **WHEN** a loopback server loads a valid Archive, serves all three exact runtime routes, and its context is canceled
- **THEN** liveness/readiness/metrics reflect the published store, serving stops within the bound, readiness clears, and the Store closes

#### Scenario: Empty process starts and stops

- **WHEN** the superseded empty-mux lifecycle expectation is evaluated after the HTTP runtime is admitted
- **THEN** acceptance SHALL reject empty-mux 404 behavior and require only the three exact runtime routes plus the bounded lifecycle above

#### Scenario: Listener or serve fails

- **WHEN** listener startup or serving returns a non-normal error
- **THEN** the application SHALL propagate failure, close any published Store, and the process SHALL exit nonzero

#### Scenario: Archive loading fails

- **WHEN** the explicit Archive root is missing, relative, invalid, incompatible, or otherwise fails with a non-cancellation outcome
- **THEN** exactly one sanitized startup event SHALL be emitted, `/livez` and `/metrics` SHALL remain available, `/readyz` SHALL remain 503 without dataVersion, and no retry, fallback, business route, or partial Store SHALL exist

#### Scenario: Startup is canceled while loading

- **WHEN** process context cancellation wins before Archive publication
- **THEN** the candidate SHALL close, one bounded startup event SHALL be emitted, and serving SHALL not begin

#### Scenario: Startup failure cannot be reported

- **WHEN** an Archive load failure occurs but its mandatory event writer fails
  or short-writes
- **THEN** startup SHALL close the owned Archive state, return the operational
  failure, and SHALL NOT begin serving

### Requirement: Package dependencies SHALL follow the approved direction

The foundation SHALL enforce `cmd/api -> app -> {archive,httpapi}`,
`cmd/archive-smoke -> archive`, `httpapi -> {observability,wire}`,
`observability -> standard library`, and
`query -> {archive,cache,collection}` for later admitted query work.
`archive`, `query`, `cache`, `collection`, and `observability` MUST NOT import
transport or application layers. Production imports outside the standard
library SHALL remain limited to the generated wire runtime and the approved
SQLite driver/VFS. Cycles, unknown packages, nested modules, and production
`workbench` naming SHALL be rejected.

#### Scenario: Foundation graph is valid

- **WHEN** the architecture test inspects the real module
- **THEN** all current packages and external imports SHALL follow the approved direction

#### Scenario: A reverse edge or cycle is introduced

- **WHEN** a package violates the allowed graph or imports an unapproved production dependency
- **THEN** the architecture test SHALL fail with the offending edge/package
