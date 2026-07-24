## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: independent driver review, main semantic audit, targeted/all strict validation, and doctor passed; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | Backend implementation owner; main agent reviews and accepts. |
| Writable paths | `backend/internal/archive/**`, `backend/internal/app/run.go`, `backend/internal/app/run_test.go`, `backend/cmd/api/main.go`, `backend/go.mod`, `backend/go.sum`, `backend/internal/architecture/dependencies_test.go`, `backend/scripts/check.sh`, `backend/README.md`, and this change's task markers. |
| Read-only protected inputs | `contracts/**`, root specs, guides, all other code/changes, refs/remotes, hosts, and production. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | `contracts-archive-manifest`, `backend-runtime-foundation`, shared indexed goldens, and one caller-approved Archive root. |
| Produces | One internal immutable Archive store and atomic readiness state. |
| Dependencies | Completed contract/runtime foundations, Go `1.26.5`, `modernc.org/sqlite v1.54.0`, `modernc.org/libc v1.74.1`. |
| Deliverables | Strict loader, bounded read pool, state/lifecycle assembly, guards, and tests. |
| Acceptance | Full corpus plus path/write/concurrency/lifecycle tests and full/race/vet/build/OpenSpec gates. |
| Non-goals | HTTP, observability, producer, activation/hot reload/rollback, catalog/query implementation, operations. |
| Operations deferred | Production roots, pointer switching, restart, scheduling, retention, release and deployment. |
| Stop/rollback conditions | Any drift or failed gate closes the candidate, publishes nothing, preserves protected state, and stops. |

Dependency direction SHALL be `cmd/api -> app -> archive`; later domain packages MAY depend on `archive`, while `archive` MUST NOT import app or transport.

## ADDED Requirements

### Requirement: Snapshot selection SHALL be strict and contained

The consumer SHALL accept one absolute caller-approved root, read `current.json` exactly once with a one-value unknown-field-rejecting decoder, and interpret only `pointerSchemaVersion`, `dataVersion`, and `manifestDigest`.
It SHALL derive only `versions/<validated-dataVersion>/manifest.json` and `bangumi.sqlite` beneath an `os.Root`; every component and final object SHALL be contained, expected type, regular, and non-symlink.

#### Scenario: A valid pointer selects one version

- **WHEN** the pointer has the supported shape and dataVersion
- **THEN** exactly its fixed manifest and SQLite paths are selected without a second pointer read

#### Scenario: A path can escape or change type

- **WHEN** input contains an unknown path field, unsafe dataVersion, traversal, absolute/drive/URI segment, symlink, missing object, directory, or special file
- **THEN** validation SHALL stop before hashing or opening an escaped target and readiness SHALL remain false

### Requirement: The complete shared contract SHALL gate publication

Using the shared schemas, data-version vector, `schema.sql`, compatibility matrix, and stable outcomes as authority, the consumer SHALL validate in their fixed precedence: strict pointer/manifest and source accounting; supported tuple and schema SQL identity; recomputed dataVersion; pointer manifest digest and pointer/manifest/directory identity; SQLite type/containment/size/digest and format; application/user versions and `archive_meta`; integrity, foreign-key check, every required table/index and matrix sentinel; then every manifest table count.
Current, manifest, directory, SQLite metadata, and recomputed dataVersion SHALL agree. The first failure SHALL return the shared stable outcome and SHALL close the candidate.
Indexed failures SHALL retain their exact shared code. Consumer-only failures
SHALL use a bounded typed code from `ARCHIVE_ROOT_INVALID`,
`ARCHIVE_FILE_INVALID`, `ARCHIVE_IMMUTABLE_LAYOUT_INVALID`,
`ARCHIVE_CONTEXT_CANCELED`, or `ARCHIVE_ALREADY_PUBLISHED`; error text SHALL
not expose the absolute root, pointer/manifest content, or SQLite values.

#### Scenario: The minimal bundle passes every gate

- **WHEN** the indexed minimal valid bundle is arranged in the runtime path layout
- **THEN** all gates, including catalog/domain sentinels, pass and a candidate store is returned

#### Scenario: A contract gate differs

- **WHEN** any indexed invalid bundle or a derived missing-table, missing-index, metadata, integrity, foreign-key, sentinel, or count mutation is loaded
- **THEN** its first applicable stable outcome SHALL be returned and no store SHALL publish

### Requirement: SQLite SHALL be opened read-only and bounded

The sole driver SHALL be `modernc.org/sqlite v1.54.0` with resolved `modernc.org/libc v1.74.1`. The consumer SHALL construct with `net/url`, never concatenate, exactly `file:///abs...?cache=private&immutable=1&mode=ro&_pragma=busy_timeout%285000%29&_pragma=foreign_keys%281%29&_pragma=query_only%281%29`.
It SHALL reject non-`DELETE` journal mode or any `-wal`/`-shm`/`-journal` sidecar and require immutable version bytes until all handles close; shared cache, `nolock`, and consumer journal pragmas are forbidden.
The validated SQLite file identity, size, and modification time SHALL agree
before hashing and after all SQLite validation; any change SHALL fail before
publication.

The single `database/sql` pool SHALL use four open/four idle connections and zero age/idle expiry, ping, and verify configured pragmas on four acquired connections before publication.
`integrity_check(1)` SHALL return exactly one `ok` row and `foreign_key_check` zero rows. The store SHALL expose no mutation API.

#### Scenario: The database is missing or a write is attempted

- **WHEN** the SQLite path does not exist or a test issues DDL/DML through each opened connection
- **THEN** no file SHALL be created and every mutation SHALL fail read-only

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

### Requirement: Acceptance SHALL reuse authority and stay in scope

Tests SHALL consume every case group indexed by `contracts/goldens/archive/index.json` and SHALL add only temporary mutations for missing/path/write/sentinel/lifecycle behavior. No contract/schema/golden copy SHALL be committed.
Acceptance SHALL include targeted/full tests, a separate `go test -race ./...`
with the host race toolchain, vet, ordinary `CGO_ENABLED=0` build/test,
architecture/dependency and persistent-inventory guards, strict change/all
validation, and no residue.

#### Scenario: The consumer is accepted

- **WHEN** all acceptance gates pass from the approved inputs
- **THEN** only the internal consumer/startup capability SHALL be claimed
- **AND** HTTP, observability, producer, operations, activation, and hot reload SHALL remain absent
