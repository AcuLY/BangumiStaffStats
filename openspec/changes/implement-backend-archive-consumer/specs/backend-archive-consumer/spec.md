## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: independent driver review, main semantic audit, targeted/all strict validation, and doctor passed; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | Backend implementation owner; main agent reviews and accepts. |
| Writable paths | `backend/internal/archive/**`, `backend/internal/app/run.go`, `backend/internal/app/run_test.go`, `backend/cmd/api/main.go`, `backend/cmd/archive-smoke/**`, `backend/go.mod`, `backend/go.sum`, `backend/internal/architecture/dependencies_test.go`, `backend/scripts/check.sh`, `backend/README.md`, and this change's task markers. |
| Read-only protected inputs | `contracts/**`, root specs, guides, all other code/changes, refs/remotes, hosts, and production. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | The accepted `correct-archive-subject-semantics` revision of `contracts-archive-manifest`, `backend-runtime-foundation`, corrected shared indexed goldens, and one caller-approved Archive root. |
| Produces | One internal immutable Archive store, atomic readiness state, and development-only pointer-free candidate-smoke CLI. |
| Dependencies | Completed contract/runtime foundations, accepted/exited `correct-archive-subject-semantics`, Go `1.26.5`, `modernc.org/sqlite v1.54.0`, `modernc.org/libc v1.74.1`. |
| Deliverables | Strict loader, bounded read pool, state/lifecycle assembly, guards, and tests. |
| Acceptance | Full corpus plus path/write/concurrency/lifecycle tests and full/race/vet/build/OpenSpec gates. |
| Non-goals | HTTP, observability, producer, activation/hot reload/rollback, catalog/query implementation, operations. |
| Operations deferred | Production roots, pointer switching, restart, scheduling, retention, release and deployment. |
| Stop/rollback conditions | Any drift or failed gate closes the candidate, publishes nothing, preserves protected state, and stops. |

Dependency direction SHALL be `cmd/api -> app -> archive`; later domain packages MAY depend on `archive`, while `archive` MUST NOT import app or transport.

## ADDED Requirements

### Requirement: Snapshot selection SHALL be strict and contained

The consumer SHALL accept one absolute caller-approved root. Runtime selection
SHALL read `current.json` exactly once with a one-value
unknown-field-rejecting decoder and interpret only `pointerSchemaVersion`,
`dataVersion`, and `manifestDigest`. Both pointer and manifest readers SHALL
reject malformed UTF-8 in their bounded raw bytes before JSON parsing; the Go
decoder's replacement-character recovery MUST NOT become an accepted path.

A shared candidate loader SHALL instead accept the root plus one validated
dataVersion and derive only
`versions/<validated-dataVersion>/manifest.json` and `bangumi.sqlite` beneath
an `os.Root`; it SHALL NOT require, read, create, or publish `current.json`.
Both paths SHALL require every component and final object to be contained,
expected type, regular, and non-symlink.

#### Scenario: A valid pointer selects one version

- **WHEN** the pointer has the supported shape and dataVersion
- **THEN** exactly its fixed manifest and SQLite paths are selected without a second pointer read

#### Scenario: A producer validates an inactive candidate

- **WHEN** a caller supplies an absolute staging root and validated dataVersion whose fixed version directory is complete
- **THEN** the same candidate gates SHALL run without a pointer read/write or readiness publication

#### Scenario: A path can escape or change type

- **WHEN** input contains an unknown path field, unsafe dataVersion, traversal, absolute/drive/URI segment, symlink, missing object, directory, or special file
- **THEN** validation SHALL stop before hashing or opening an escaped target and readiness SHALL remain false

#### Scenario: Contract JSON contains malformed UTF-8

- **WHEN** a pointer or manifest contains malformed UTF-8 bytes, including bytes whose decoded replacement text would otherwise satisfy the JSON shape and whose surrounding digest claims were updated
- **THEN** the consumer SHALL return the applicable pointer- or manifest-schema outcome before compatibility, identity, SQLite opening, or publication
- **AND** it SHALL NOT replace the bytes with U+FFFD

### Requirement: The complete shared contract SHALL gate publication

Using the shared schemas, data-version vector, `schema.sql`, compatibility
matrix, and stable outcomes as authority, the shared candidate loader SHALL
validate in their fixed precedence: fatal UTF-8 decoding, strict manifest and
source accounting; supported tuple and schema SQL identity; recomputed dataVersion;
manifest/directory identity; SQLite type/containment/size/digest and format;
application/user versions and `archive_meta`; integrity, foreign-key check and
every required table/index; then every manifest table count. Runtime selection
SHALL additionally validate pointer shape, manifest digest, and
pointer/manifest identity before publication.

Manifest, directory, SQLite metadata, and recomputed dataVersion SHALL agree;
runtime current identity SHALL also agree. The first failure SHALL return the
shared stable outcome and SHALL close the candidate.
After type/containment/size pass, SQLite digest SHALL be compared before the
header/open format gate; a candidate failing both SHALL therefore return
`SQLITE_DIGEST_MISMATCH`.
Indexed failures SHALL retain their exact shared code. Consumer-only failures
SHALL use a bounded typed code from `ARCHIVE_ROOT_INVALID`,
`ARCHIVE_FILE_INVALID`, `ARCHIVE_IMMUTABLE_LAYOUT_INVALID`,
`ARCHIVE_CONTEXT_CANCELED`, or `ARCHIVE_ALREADY_PUBLISHED`; error text SHALL
not expose the absolute root, pointer/manifest content, or SQLite values.

At the required-object stage, the loader SHALL compute
`bgmss-sqlite-schema-objects-v1` from every actual explicit
`table|index|view|trigger` definition in `sqlite_schema` using the corrected
matrix algorithm and require the canonical schema SQL digest, 35-object count,
and object digest. Missing, altered, or extra explicit definitions SHALL return
`SQLITE_REQUIRED_OBJECT_MISSING`; matching names, sentinels, manifest claims,
or SQLite byte digests MUST NOT bypass this check.

The compatibility matrix's exact sentinel `expectedInteger` values SHALL be
executed against the indexed minimal golden and its derived contract-test
mutations only. They SHALL NOT be runtime content assertions for an arbitrary
full Archive candidate.

#### Scenario: The minimal bundle passes every gate

- **WHEN** the indexed minimal valid bundle is arranged in the fixed version layout
- **THEN** all loader gates pass, its fixture-scoped sentinels pass in contract tests, and a candidate store is returned

#### Scenario: A constraint is weakened without changing object names

- **WHEN** a candidate keeps every required name and sentinel but changes a stored `STRICT`, `CHECK`, foreign-key, table, index, view, or trigger definition, or adds another explicit object
- **THEN** the actual schema-object seal SHALL differ and loading SHALL fail as `SQLITE_REQUIRED_OBJECT_MISSING`

#### Scenario: A contract gate differs

- **WHEN** any indexed invalid bundle or a derived missing-table, missing-index, metadata, integrity, foreign-key, or count mutation is loaded
- **THEN** its first applicable stable outcome SHALL be returned and no store SHALL publish

### Requirement: SQLite SHALL be opened read-only and bounded

The sole driver SHALL be `modernc.org/sqlite v1.54.0` with resolved
`modernc.org/libc v1.74.1`. The consumer SHALL register one per-store read-only
`modernc.org/sqlite/vfs` backed by a narrow `os.Root` for the validated version
directory, then construct with `net/url`, never concatenate, a URI for only the
relative constant `bangumi.sqlite` using the generated VFS, `cache=private`,
`immutable=1`, `mode=ro`, and exact pragmas `busy_timeout(5000)`,
`foreign_keys(1)`, and `query_only(1)`.
It SHALL reject non-`DELETE` journal mode or any `-wal`/`-shm`/`-journal`
sidecar and require immutable version bytes until all handles close; shared
cache, `nolock`, and consumer journal pragmas are forbidden. The database, VFS,
and owned roots SHALL close once in that order.
The validated SQLite file identity, size, and modification time SHALL agree
before hashing and after all SQLite validation; any change SHALL fail before
publication.

The single `database/sql` pool SHALL use four open/four idle connections and zero age/idle expiry, ping, and verify configured pragmas on four acquired connections before publication.
`integrity_check(1)` SHALL return exactly one `ok` row and `foreign_key_check` zero rows. The store SHALL expose no mutation API.
Its only raw query entry SHALL accept one statement of at most 65,536 bytes
whose first ASCII keyword is `SELECT` or `WITH`, reject `--`, `/*`, `*/`, and
any semicolon before driver execution with one fixed safe exported
programming-error sentinel, and keep `query_only` as a second write gate.

#### Scenario: The database is missing or a write is attempted

- **WHEN** the SQLite path is absent, or a caller attempts DDL/DML, a writable
  pragma, `ATTACH`, a multi-statement escape, or a write-capable `WITH`
- **THEN** no Archive, sidecar, temp, attached, or external file SHALL be
  created and every mutation SHALL fail

#### Scenario: The approved pathname is rebound

- **WHEN** the caller-approved directory is renamed and its former path is
  replaced after validation begins
- **THEN** SQLite SHALL either keep opening/querying the validated root-bound
  inode or fail before publication
- **AND** it SHALL never open the replacement bytes by path

#### Scenario: Digest and format both differ

- **WHEN** SQLite bytes have both an incorrect digest and invalid header after
  their file size/type gate succeeds
- **THEN** the fixed precedence SHALL return `SQLITE_DIGEST_MISMATCH`

#### Scenario: Concurrent reads use the bounded store

- **WHEN** callers query the published store concurrently under the race detector
- **THEN** reads SHALL return consistent snapshot data with at most four open connections and no race

### Requirement: Publication and shutdown SHALL be atomic

Readiness SHALL be represented by one atomic store pointer and SHALL remain false until every gate succeeds. Publication SHALL be single-assignment: compare-and-swap from nil; a failed or losing candidate SHALL close exactly once and cannot replace a winner.
Shutdown SHALL first make readiness false and then close the published pool exactly once after serving stops.

#### Scenario: Loading fails before publication

- **WHEN** any parsing, filesystem, digest, SQLite, context, or close-sensitive gate fails
- **THEN** the candidate resources SHALL close and observers SHALL never see a partial store

#### Scenario: Publication or shutdown races

- **WHEN** loads, readiness reads, queries, cancellation, and repeated shutdown run concurrently
- **THEN** at most one complete store SHALL publish, losing resources SHALL close, and shutdown SHALL be idempotent and race-free

### Requirement: Candidate smoke SHALL be bounded and pointer-free

`cmd/archive-smoke` SHALL require an absolute `-archive-root` and one
`-data-version`, call the shared candidate loader, and close its returned store.
Success SHALL emit exactly one bounded JSON object containing `ok`,
`dataVersion`, `manifestDigest`, and `sqliteDigest`. Failure SHALL emit a
sanitized stable code and exit non-zero without exposing paths, document
content, or SQLite values. It SHALL never read or write `current.json`, mutate
the candidate, or publish readiness. Failure to write the bounded result SHALL
return non-zero and SHALL never be treated as a successful smoke.

#### Scenario: A closed producer candidate is smoked

- **WHEN** the fixed candidate layout passes the real Go loader
- **THEN** the command SHALL return its computed identities, close all handles, and leave every candidate byte and path unchanged

#### Scenario: Smoke output cannot be written

- **WHEN** a deterministic rejecting writer fails the bounded result write
- **THEN** the command SHALL return non-zero without reporting a false success

### Requirement: Acceptance SHALL reuse authority and stay in scope

Tests SHALL consume every case group indexed by
`contracts/goldens/archive/index.json`, execute the matrix's exact sentinels
only against the minimal fixture, and add only temporary mutations for
malformed pointer/manifest UTF-8 and missing/path/write/lifecycle behavior. No
contract/schema/golden copy SHALL be committed.
Acceptance SHALL include targeted/full tests, a separate `go test -race ./...`
with the host race toolchain, vet, ordinary `CGO_ENABLED=0` build/test,
architecture/dependency and persistent-inventory guards, strict change/all
validation, and no residue.

#### Scenario: The consumer is accepted

- **WHEN** all acceptance gates pass from the approved inputs
- **THEN** only the internal consumer/startup capability SHALL be claimed
- **AND** HTTP, observability, producer, operations, activation, and hot reload SHALL remain absent
