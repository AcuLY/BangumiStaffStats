## Capability Boundary

- **Status:** Intentional local-development delta; not committed, pushed,
  released, or deployed.
- **Owner:** Backend Archive consumer.
- **Writable paths:** `backend/internal/archive/**` and the exact consumer test
  fixtures owned by that package.
- **Read-only protected inputs:** `PRODUCT.md`, `DESIGN.md`, Archive schemas,
  compatibility matrix, producer goldens, query/statistics semantics, public
  API contracts, existing real Archive bytes, remotes, hosts, and production.
- **Deletion complement:** This capability deletes no Archive data or unrelated
  repository file. Removal of the standalone smoke command and Python producer
  belongs to their separately declared capabilities.
- **Mutable refs:** Local `codex/embed-go-archive-builder` only.
- **Consumes:** Strict `current.json`, immutable
  `versions/<dataVersion>/bangumi.sqlite`, and candidates completed by
  `backend-archive-builder`.
- **Produces:** One minimally opened read-only `Store`, atomic initial
  publication, and a narrow live replacement operation returning the old
  Store to the app owner.
- **Dependencies:** `contracts-archive-manifest`, `backend-archive-builder`,
  `modernc.org/sqlite`, and the existing query `StoreProvider` boundary.
- **Deliverables:** Minimal contained open, `State.Replace`, Store close/drain
  behavior, and focused race/lifecycle tests.
- **Acceptance:** Startup and inactive candidates open without whole-Archive
  admission; A-to-B replacement is atomic; old Store ownership is explicit;
  read-only/path/query bounds remain enforced.
- **Non-goals:** ORM adoption, producer-quality validation in the consumer,
  manifest/digest/schema-seal recomputation, request leases, reference-count
  framework, distributed coordination, or a retained rollback Store.
- **Operations deferred:** Real Archive writes/deletion, release, deployment,
  host mutation, and production activation remain separately authorized.
- **Stop/rollback conditions:** Stop on path escape, writable SQLite access,
  mixed Store identity, query/dataVersion drift, overlapping edits, or failure
  of focused replacement tests. Repository rollback is parent `411f54b`.

## MODIFIED Requirements

### Requirement: Snapshot selection SHALL be strict and contained

The consumer SHALL accept one absolute caller-approved root. Runtime selection
SHALL read `current.json` exactly once with a one-value,
unknown-field-rejecting decoder, validate the complete pointer contract, and
use only its validated `dataVersion` to derive
`versions/<dataVersion>/bangumi.sqlite`. It SHALL NOT read or recompute the
manifest, manifest digest, SQLite digest, source accounting, dataVersion
preimage, schema-object seal, table counts, or producer quality checks while
opening a runtime Store.

An inactive candidate opener SHALL accept the same root plus one validated
dataVersion and derive the same fixed SQLite path without reading, creating, or
publishing `current.json`. Both paths SHALL reject malformed UTF-8, unsafe
dataVersion syntax, traversal, absolute/drive/URI path segments, a non-absolute
root, missing objects, non-regular objects, and symlinked final components.
The opened root and version directory SHALL remain bound to their validated
filesystem identities until the Store closes.

#### Scenario: Startup selects the current version

- **WHEN** `current.json` has the exact supported pointer shape and names a
  complete immutable version
- **THEN** the consumer SHALL open only that version's fixed SQLite file after
  one pointer read and SHALL perform no manifest or whole-file admission work

#### Scenario: The builder presents an inactive candidate

- **WHEN** the Go builder supplies a validated dataVersion whose fixed version
  directory is complete
- **THEN** the consumer SHALL open the candidate without reading or changing
  the current pointer and without repeating producer validation

#### Scenario: Selection can escape or is malformed

- **WHEN** the root, pointer, dataVersion, version directory, or SQLite object
  is malformed, unsafe, missing, linked, special, or changes identity while it
  is opened
- **THEN** opening SHALL fail closed, every acquired handle SHALL close, and no
  Store SHALL publish or replace the current Store

### Requirement: SQLite SHALL be opened read-only and bounded

The sole driver SHALL remain `modernc.org/sqlite v1.54.0` with resolved
`modernc.org/libc v1.74.1`. Each Store SHALL register one narrow read-only VFS
bound to the validated version directory and construct, with `net/url`, a URI
for only `bangumi.sqlite` using `cache=private`, `immutable=1`, `mode=ro`, and
the exact pragmas `busy_timeout(5000)`, `foreign_keys(1)`, and `query_only(1)`.
It SHALL reject a `-wal`, `-shm`, or `-journal` sidecar and SHALL expose no
mutation API.

Runtime opening SHALL be limited to opening/pinging the database, verifying the
read-only/query-only connection settings, reading exactly one
`archive_meta.data_version` row, requiring it to equal the selected directory
and pointer identity, and executing the existing lightweight readiness query.
It SHALL NOT execute integrity/foreign-key scans, enumerate or hash schema
objects, compare manifest table counts, or hash the SQLite file. Those
producer-quality checks SHALL have completed before inactive publication under
`backend-archive-builder`.

The single `database/sql` pool SHALL retain four open/four idle connections and
zero age/idle expiry. Its raw query boundary SHALL still admit only one bounded
`SELECT` or read-only `WITH` statement and reject comments, semicolons, and
write-capable input before driver execution. Store close SHALL reject new
queries, wait for active rows to finish, and then close database, VFS, version
root, and Archive root exactly once.

#### Scenario: A valid immutable SQLite is opened

- **WHEN** the selected file is a producer-completed SQLite with matching
  embedded dataVersion and no sidecar
- **THEN** one bounded read-only Store SHALL become available after only the
  minimal identity and readiness queries

#### Scenario: A write or alternate file is attempted

- **WHEN** a caller attempts DDL/DML, a writable pragma, `ATTACH`, multiple
  statements, a write-capable `WITH`, or a VFS open outside the fixed SQLite
  filename
- **THEN** the operation SHALL fail without creating or changing an Archive,
  sidecar, temp, attached, or external file

#### Scenario: Embedded identity does not match selection

- **WHEN** the SQLite cannot be opened read-only, lacks exactly one metadata
  row, or embeds a dataVersion different from the selected version
- **THEN** the candidate SHALL close and SHALL NOT publish or replace the
  current Store

#### Scenario: Store close overlaps rows

- **WHEN** Store close begins while a caller owns active rows
- **THEN** new queries SHALL fail and close SHALL wait only until those rows
  finish before releasing database and filesystem resources

### Requirement: Publication and shutdown SHALL be atomic

Readiness SHALL remain represented by one atomic Store pointer. Initial
publication SHALL install one complete Store only after minimal open succeeds.
`State.Replace` SHALL, while holding the existing state mutex, reject nil or a
closed State, atomically exchange the complete current Store for one already
opened candidate, and return the old Store without closing it. The application
maintenance owner SHALL be solely responsible for closing that returned Store
after pre-swap work has drained.

If activation of the prepared current pointer fails while requests are gated,
the application SHALL use the same narrow replacement operation to restore the
old Store before requests resume. A rejected candidate SHALL close exactly
once. State shutdown SHALL atomically clear readiness and close only the Store
that remains current after the scheduler has stopped.

#### Scenario: A complete candidate replaces the current Store

- **WHEN** activation supplies an already-open candidate while State is live
- **THEN** observers SHALL see either the complete old Store or the complete
  new Store, `Replace` SHALL return the old Store, and State SHALL NOT close it
  implicitly

#### Scenario: Pointer activation fails inside maintenance

- **WHEN** State has exchanged to the candidate but the prepared
  `current.json` cannot be atomically installed
- **THEN** the old Store SHALL be restored before the maintenance gate opens,
  the candidate SHALL close, and readiness SHALL identify the old dataVersion

#### Scenario: Replace races with shutdown

- **WHEN** replacement, current reads, and shutdown contend
- **THEN** the state mutex SHALL establish one winner, no partial Store SHALL be
  visible, and each owned Store SHALL close at most once

### Requirement: Acceptance SHALL reuse authority and stay in scope

Consumer acceptance SHALL use small producer-completed fixtures to prove
strict pointer/path handling, minimal read-only opening, metadata identity,
raw-query bounds, initial publication, A-to-B replacement, restoration after a
pointer failure, active-row close, cancellation, and idempotent shutdown. It
SHALL NOT repeat the producer's manifest-string matrix, source accounting,
dataVersion recomputation, SQLite digest/integrity/schema-object/table-count
matrix, or standalone smoke program.

Acceptance SHALL include focused tests, replacement tests under the race
detector, ordinary `CGO_ENABLED=0` build/test, vet, strict OpenSpec validation,
and `git diff --check`, without touching a real Archive root.

#### Scenario: The replacement consumer is accepted

- **WHEN** the focused minimal-open, read-only, path, replacement, restore,
  close, race, and strict-spec checks pass
- **THEN** only the Backend consumer and Store replacement capability SHALL be
  claimed, with no producer revalidation, ORM, deployment, or production data
  mutation

## REMOVED Requirements

### Requirement: The complete shared contract SHALL gate publication

**Reason:** The embedded Go builder is now the single authority that performs
the complete contract, dataVersion, manifest, digest, schema, integrity,
foreign-key, table-count, and quality gates before publishing an inactive
candidate. Repeating them on every runtime open creates the redundant startup
work the change removes.

**Migration:** Preserve all complete validation and indexed golden coverage in
`backend-archive-builder`; runtime consumer publication uses the minimal
contained open specified above.

### Requirement: Consumer SHALL bind only the corrected raw-domain Archive v1

**Reason:** Raw-domain schema and semantic parity are producer responsibilities
and no longer require a second runtime admission scan.

**Migration:** The Go builder SHALL bind and test the corrected canonical
schema and goldens; the consumer reads the embedded dataVersion and remains a
read-only query surface.

### Requirement: Candidate load validates every compatibility gate before publication

**Reason:** Inactive candidate compatibility is established before publication
by the same-version embedded builder, so enumerating every compatibility gate
again in the Store opener is redundant.

**Migration:** Builder parity tests and artifact compatibility own the full
gate; candidate direct-open owns only path, read-only open, embedded
dataVersion, and readiness.

### Requirement: Backend SHALL admit only the matrix rule pair

**Reason:** Domain/cast rule admission moves to the Go builder's deterministic
manifest and SQLite construction path.

**Migration:** `backend-archive-builder` SHALL reject any unapproved rule pair
before inactive publication; the consumer SHALL not parse the manifest again.
