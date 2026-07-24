## MODIFIED Requirements

### Requirement: Package dependencies SHALL follow the approved direction

The foundation SHALL enforce `cmd/api -> app -> {archive,httpapi}`,
`cmd/archive-smoke -> archive`,
`httpapi -> {imageproxy,observability,wire}`,
`imageproxy -> standard library`, `observability -> standard library`, and
`query -> {archive,cache,collection}` for later admitted query work.
`archive`, `imageproxy`, `query`, `cache`, `collection`, and `observability`
MUST NOT import transport or application layers. Production imports outside
the standard library SHALL remain limited to the generated wire runtime and
the approved SQLite driver/VFS. Cycles, unknown packages, nested modules, and
production `workbench` naming SHALL be rejected.

#### Scenario: Foundation graph is valid

- **WHEN** the architecture test inspects the real module
- **THEN** all current packages and external imports SHALL follow the approved direction

#### Scenario: A reverse edge or cycle is introduced

- **WHEN** a package violates the allowed graph or imports an unapproved production dependency
- **THEN** the architecture test SHALL fail with the offending edge/package

### Requirement: The API process SHALL have a bounded lifecycle

The standard-library server SHALL accept a supplied listener and an explicit
absolute Archive root. Before entering `Serve`, it SHALL attempt exactly one
accepted Archive load. Success SHALL atomically publish the complete store. A
non-cancellation load failure SHALL close the candidate, emit exactly one
bounded `archive_load_failed` app/startup event, and then serve only exact
`GET /livez`, `GET /readyz`, `GET /metrics`, and the separately specified
Archive-independent exact image route with readiness false for that process
lifetime; it SHALL NOT retry, reload, fall back, or expose an Archive-dependent
business route. If the process context is canceled during load, startup SHALL
emit the same bounded event and return without serving.

If the mandatory event writer fails or short-writes, startup SHALL close the
owned Archive state, propagate that operational failure, and return without
calling `Serve`; a partial or failed write SHALL NOT authorize an unobservable
degraded runtime.

The process SHALL propagate listener, non-normal serve, and Store-close
failures and SHALL complete context-driven graceful shutdown within five
seconds without leaking goroutines. Shutdown SHALL stop serving before it
clears readiness and closes any published Store.

#### Scenario: Process starts with a valid Archive and stops

- **WHEN** a loopback server loads a valid Archive, serves the three exact infrastructure routes plus the exact image route, and its context is canceled
- **THEN** liveness/readiness/metrics reflect the published store, the image route remains independently bounded, serving stops within the bound, readiness clears, and the Store closes

#### Scenario: Empty process starts and stops

- **WHEN** the superseded empty-mux lifecycle expectation is evaluated after the HTTP runtime and image route are admitted
- **THEN** acceptance SHALL reject empty-mux 404 behavior and require the three exact infrastructure routes plus the exact image route and bounded lifecycle above

#### Scenario: Listener or serve fails

- **WHEN** listener startup or serving returns a non-normal error
- **THEN** the application SHALL propagate failure, close any published Store, and the process SHALL exit nonzero

#### Scenario: Archive loading fails

- **WHEN** the explicit Archive root is missing, relative, invalid, incompatible, or otherwise fails with a non-cancellation outcome
- **THEN** exactly one sanitized startup event SHALL be emitted, `/livez`, `/metrics`, and the exact image route SHALL remain available, `/readyz` SHALL remain 503 without dataVersion, and no retry, fallback, Archive-dependent business route, or partial Store SHALL exist

#### Scenario: Startup is canceled while loading

- **WHEN** process context cancellation wins before Archive publication
- **THEN** the candidate SHALL close, one bounded startup event SHALL be emitted, and serving SHALL not begin

#### Scenario: Startup failure cannot be reported

- **WHEN** an Archive load failure occurs but its mandatory event writer fails
  or short-writes
- **THEN** startup SHALL close the owned Archive state, return the operational
  failure, and SHALL NOT begin serving
