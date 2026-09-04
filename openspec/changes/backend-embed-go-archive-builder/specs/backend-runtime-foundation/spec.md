## Capability Boundary

- **Status:** Intentional local-development delta; not committed, pushed,
  released, or deployed.
- **Owner:** Backend process and application assembly.
- **Writable paths:** `backend/cmd/api/**`, `backend/internal/app/**`, exact
  architecture tests, and `backend/{go.mod,go.sum,README.md}`.
- **Read-only protected inputs:** Product/UI/query/statistics/public API
  semantics, Archive contracts and goldens, existing real Archive bytes,
  unrelated worktrees, remotes, hosts, and production.
- **Deletion complement:** None in this capability; updater/operations cleanup
  is owned by their separate capability deltas.
- **Mutable refs:** Local `codex/embed-go-archive-builder` only.
- **Consumes:** `backend-archive-builder.RunOnce`, `archive.State`, the existing
  HTTP runtime, readiness owner, bounded query runtime stats, and current
  dataVersion-keyed result-cache contract.
- **Produces:** One process-owned weekly scheduler, one short maintenance gate,
  live Store activation without listener restart, and bounded shutdown.
- **Dependencies:** `backend-archive-builder`, `backend-archive-consumer`,
  `backend-bounded-query-cache`, `backend-http-runtime`, and
  `backend-observability`.
- **Deliverables:** App lifecycle wiring, pure weekly-time calculation,
  scheduler cancellation, maintenance activation, and focused lifecycle/race
  tests.
- **Acceptance:** Startup freshness check and weekly run are serialized by one
  goroutine; download/build serves normally; activation drains ordinary work;
  new requests use the new dataVersion without process/listener restart.
- **Non-goals:** ORM, scheduler library, persistent queue, retry control plane,
  request leases, reference counting, distributed lock, leader election,
  multi-replica coordination, or product/API/UI changes.
- **Operations deferred:** Production schedule execution, real Archive build,
  host write, release, deployment, live deletion, and routing remain separately
  authorized.
- **Stop/rollback conditions:** Stop on mixed-version responses, failure to
  preserve the current Store after an update error, scheduler/goroutine leak,
  unsafe cleanup target, overlapping edits, or focused acceptance failure.
  Repository rollback is parent `411f54b`.

## MODIFIED Requirements

### Requirement: The backend SHALL be one pinned Go module

`backend/go.mod` SHALL declare module
`github.com/AcuLY/BangumiStaffStats/backend`, language `go 1.26.0`, toolchain
`go1.26.5`, and `oapi-codegen/v2@v2.8.0` as the sole direct development tool.
Its exact direct runtime requirements SHALL be
`github.com/AcuLY/bangumi-collection-go v0.1.1`,
`github.com/gowebpki/jcs v1.0.1`,
`github.com/oapi-codegen/runtime v1.1.2`, `golang.org/x/sync v0.22.0`,
`golang.org/x/text v0.40.0`, `modernc.org/sqlite v1.54.0`, and
`go.yaml.in/yaml/v3 v3.0.4`; `modernc.org/libc` SHALL remain an indirect
requirement at exactly `v1.74.1`. YAML SHALL be used only for the governed
catalog/config inputs consumed by `backend-archive-builder`. There SHALL be no
root or nested Go module/workspace/vendor tree and no scheduler or ORM library.

#### Scenario: Foundation uses the approved toolchain

- **WHEN** backend generation, build, test, race, vet, or Archive-builder tests
  run
- **THEN** they SHALL use Go `1.26.5`, the exact approved dependencies, and
  backend-local cache/temp state

#### Scenario: Another module or direct dependency appears

- **WHEN** a root/nested module, workspace, vendor tree, scheduler/ORM library,
  unapproved direct dependency, or wrong SQLite/libc/YAML version is present
- **THEN** acceptance SHALL fail

### Requirement: Package dependencies SHALL follow the approved direction

The foundation SHALL enforce
`cmd/api -> app -> {archive,archivebuild,httpapi,runtimecache}`,
`archivebuild -> {archive-independent contracts/config helpers, modernc SQLite,
YAML, standard library}`, `httpapi -> {imageproxy,observability,wire}`,
`imageproxy -> standard library`, `observability -> standard library`, and the
already accepted query-service dependency graph. `archivebuild` SHALL produce
inactive filesystem candidates and SHALL NOT import app, HTTP handlers, query
services, or observability. `archive`, query/statistics services, cache,
collection, imageproxy, and observability MUST NOT import application or
transport layers.

Production imports outside the standard library SHALL remain limited to the
generated wire runtime, approved SQLite driver/VFS, and approved YAML parser.
Cycles, unknown packages, nested modules, production `workbench` naming, ORM,
and scheduler frameworks SHALL be rejected.

#### Scenario: Embedded-builder graph is valid

- **WHEN** the architecture test inspects the real module
- **THEN** the API process, builder, activation app, consumer, transport, and
  query packages SHALL follow the one-way dependency graph

#### Scenario: A reverse edge or unapproved framework appears

- **WHEN** archivebuild imports app/HTTP/query code, a consumer imports the
  builder, or any package adds an unapproved scheduler/ORM/dependency edge
- **THEN** the architecture test SHALL fail with the offending edge or package

### Requirement: The API process SHALL have a bounded lifecycle

The standard-library server SHALL accept a supplied listener and one explicit
absolute Archive root. Before entering `Serve`, it SHALL attempt one minimal
current-Store open. Success SHALL atomically publish that complete Store and
set readiness to its dataVersion. A non-cancellation open failure SHALL close
the candidate, emit exactly one bounded startup failure event, and begin
degraded serving with readiness false; infrastructure and Archive-independent
image routes SHALL remain available and Archive-dependent routes SHALL return
their existing not-ready outcome.

After the handler and query services exist, the process SHALL start exactly one
background scheduler. Its startup freshness check SHALL be asynchronous and
MAY recover a process that began without a usable Store by building and
activating a complete candidate. A scheduled update failure SHALL leave an
already-published Store and readiness unchanged. No process or listener restart
SHALL be required after successful activation.

If the mandatory startup event writer fails or short-writes before serving,
startup SHALL close owned Archive state and return the operational failure.
The process SHALL propagate listener and non-normal serve failures. On process
context cancellation it SHALL cancel and join the scheduler/active builder,
stop serving, clear readiness, and close the then-current Store exactly once,
without leaking a timer or goroutine.

#### Scenario: Process starts with a current Archive and updates live

- **WHEN** the server opens version A, begins serving, and the asynchronous or
  weekly run produces version B
- **THEN** readiness and new Archive-backed requests SHALL change to B after
  the short activation window without restarting the listener or process

#### Scenario: Process starts without a usable current Archive

- **WHEN** the initial minimal open fails but the asynchronous freshness check
  later produces a valid candidate
- **THEN** the process SHALL first serve only degraded routes and SHALL then
  become ready on the candidate without restart

#### Scenario: A background update fails

- **WHEN** acquisition, build, candidate open, activation preparation, or
  cleanup fails while version A is ready
- **THEN** version A SHALL continue serving and readiness SHALL not be cleared
  solely because the refresh failed

#### Scenario: Process cancellation overlaps the scheduler

- **WHEN** shutdown occurs while the scheduler waits or one build is active
- **THEN** its context and timer SHALL be canceled, no later activation SHALL
  occur, serving SHALL stop, and only the final current Store SHALL close

#### Scenario: Listener or serving fails

- **WHEN** listener startup or serving returns a non-normal error
- **THEN** the process SHALL cancel/join background work, close the current
  Store, propagate failure, and exit nonzero

## ADDED Requirements

### Requirement: One goroutine SHALL schedule weekly Archive refreshes

The application SHALL own exactly one scheduler goroutine. It SHALL invoke one
asynchronous freshness check after startup, then use a standard-library
`time.Timer` and a pure next-run calculation for Sunday 04:15 in a fixed UTC+8
zone. Each invocation SHALL derive a six-hour deadline from the process
context. The same goroutine SHALL complete one `RunOnce` before calculating and
waiting for the next run, making overlap impossible without a second lock,
queue, worker, or persisted scheduler state.

Restart catch-up SHALL consist only of the normal asynchronous freshness check;
there SHALL be no durable job history or replay queue. A no-change or failed
run SHALL record its bounded outcome and continue to the next weekly time. A
stopped process SHALL stop its timer and perform no scheduled work.

#### Scenario: Startup data is already current

- **WHEN** the asynchronous freshness check resolves to no-change
- **THEN** the current Store SHALL remain untouched and the one scheduler SHALL
  wait until the next Sunday 04:15 UTC+8

#### Scenario: A weekly run exceeds its bound

- **WHEN** `RunOnce` has not completed within six hours or the process context
  is canceled
- **THEN** its context SHALL be canceled, no candidate SHALL activate, and no
  overlapping replacement run SHALL start

#### Scenario: The weekly boundary is calculated

- **WHEN** current time is before, exactly at, or after Sunday 04:15 UTC+8
- **THEN** the pure calculation SHALL return the next strictly-future Sunday
  04:15 instant without seven-day drift from prior run duration

### Requirement: Activation SHALL use one short maintenance gate

The application SHALL wrap the complete HTTP handler once with one
`sync.RWMutex`. Ordinary requests SHALL hold the read side for their handler
lifetime. Acquisition, extraction, SQLite construction, inactive publication,
candidate minimal-open, and the candidate readiness query SHALL occur outside
the gate while the current Store continues serving.

Activation SHALL take the write side, thereby waiting for ordinary handlers to
finish and briefly preventing new handlers from entering. While holding it,
the app SHALL use the existing bounded `QueryRuntime.Stats()` snapshot to wait
until detached executor running and queued counts are both zero, then mark
readiness false, atomically replace State with the already-open candidate,
atomically install the prepared `current.json`, and set readiness to the new
dataVersion. No per-request lease, Store reference count, generalized drain
framework, or second maintenance coordinator SHALL be added.

If pointer installation fails, the app SHALL replace State back to the old
Store and restore old readiness before opening the gate. After success it SHALL
close the old Store while the gate is held, release the gate, and only then ask
the builder owner to delete non-current version directories. Cancellation
while waiting SHALL leave State, pointer, readiness, and current files
unchanged.

#### Scenario: Activation meets no active query

- **WHEN** candidate B is ready and the handler/executor are idle
- **THEN** the write gate SHALL perform the A-to-B replacement immediately and
  new requests SHALL capture only B

#### Scenario: An ordinary request overlaps activation

- **WHEN** a version-A handler or detached admitted computation is still active
  when candidate B is ready
- **THEN** activation SHALL wait for that bounded work to finish before closing
  A, and no request SHALL combine A and B

#### Scenario: Pointer installation fails

- **WHEN** State was exchanged but the prepared current pointer cannot be
  atomically installed
- **THEN** State/readiness SHALL return to A before any request resumes and B
  SHALL close without deleting A

#### Scenario: Old-version cleanup fails

- **WHEN** B is active and closing or deleting an old version cannot complete
  safely
- **THEN** B SHALL remain current, the undeleted directory SHALL remain for the
  next bounded cleanup attempt, and no broad or unvalidated deletion SHALL run

### Requirement: Store replacement SHALL preserve dataVersion cache isolation

Every Archive-backed operation SHALL call its existing StoreProvider once at
operation start and retain that Store/dataVersion for the whole operation.
Result cache and singleflight identity SHALL continue to include dataVersion,
so an entry or detached computation produced from Store A SHALL never satisfy a
Store-B request. Old result entries MAY remain only inside the existing bounded
LRU and SHALL leave through its existing eviction behavior; replacement SHALL
not add a generation cache or unbounded historical partition.

The public collection cache is Archive-independent and SHALL remain available
across Store replacement. Replacement SHALL neither flush it nor add
dataVersion to its key. Any Store-keyed derived Archive cache present at apply
time SHALL drop only entries owned by the returned old Store after activation.

#### Scenario: The same query runs before and after replacement

- **WHEN** all query and collection inputs are identical but current
  dataVersion changes from A to B
- **THEN** the B request SHALL miss any A result identity, compute or read only
  from Store B, and return B in its response metadata

#### Scenario: Collection data remains fresh across replacement

- **WHEN** a still-fresh public collection cache entry exists while the Archive
  changes from A to B
- **THEN** the collection entry MAY be reused while all Archive-derived result
  work uses B and a B-keyed result identity

#### Scenario: Old cache entries remain bounded

- **WHEN** one or more Archive replacements leave unreachable A-version result
  entries
- **THEN** they SHALL count against the unchanged bounded LRU and be evicted by
  existing policy without an unbounded per-version store
