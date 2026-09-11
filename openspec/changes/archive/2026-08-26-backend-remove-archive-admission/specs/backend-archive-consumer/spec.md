## Capability Boundary

- **Status:** intentional breaking delta, local-only until verified.
- **Owner:** Backend; primary agent owns review and acceptance.
- **Writable paths:** `backend/internal/archive/**`, named dependent Backend
  tests, Backend README, this change, and the synchronized root capability.
- **Read-only protected inputs:** contracts, updater, frontend, Archive bytes,
  original dirty worktree, remote refs, hosts, and production.
- **Deletion complement:** only admission code/tests/assertions; Store query
  safety, direct-open safety, publication, readiness, and shutdown remain.
- **Mutable refs:** local `codex/remove-archive-admission` only.
- **Consumes:** `current.json`, `versions/<dataVersion>/bangumi.sqlite`,
  `archive_meta`, and producer publication guarantees.
- **Produces:** one directly opened read-only Store and atomic readiness state.
- **Dependencies:** updater publication, SQLite driver/VFS, query services.
- **Deliverables:** direct-open implementation/tests/docs and verification.
- **Acceptance:** repository search finds no Backend Archive admission gates or
  candidate-admission API; complete Archive startup and queries pass.
- **Non-goals:** producer/schema/API/statistics/UI/dependency changes.
- **Operations deferred:** all push/release/deploy/live mutations.
- **Stop/rollback conditions:** stop on producer drift, behavior drift,
  overlapping edits, or failed gates; return locally to `411f54b`.

## ADDED Requirements

### Requirement: Backend SHALL perform no Archive admission

Backend startup and direct version open SHALL NOT read or validate
`manifest.json`, hash SQLite, compare manifest/pointer/SQLite digests,
recompute dataVersion, enforce compatibility tuples or schema-object seals,
execute `integrity_check` or `foreign_key_check`, enumerate required schema
objects, recount manifest tables, run sentinel/catalog/domain smoke, or expose
an alternate flag, command, background task, or helper that performs those
gates. Producer validation before inactive publication SHALL remain the sole
Archive validation authority.

#### Scenario: A complete producer version is opened

- **WHEN** `current.json` selects a producer-published SQLite version
- **THEN** Backend SHALL proceed directly through contained read-only open,
  identity read, publication, and readiness probe
- **AND** no Archive admission phase or validation scan SHALL run

#### Scenario: Admission is requested through an alternate path

- **WHEN** a caller searches for or attempts a candidate admission API,
  startup option, smoke tool, background validator, or deferred gate
- **THEN** no such Backend system surface SHALL exist

## MODIFIED Requirements

### Requirement: Snapshot selection SHALL be strict and contained

The consumer SHALL accept one absolute caller-approved root. Runtime selection
SHALL read `current.json` exactly once with a one-value
unknown-field-rejecting bounded decoder and use only its supported
`pointerSchemaVersion` and safe `dataVersion` to derive
`versions/<dataVersion>/bangumi.sqlite` beneath an `os.Root`.
`manifestDigest` SHALL remain accepted pointer syntax for cross-component
contract compatibility but SHALL NOT be dereferenced or validated by Backend.

An explicit direct version opener used by Backend tests SHALL accept the same
absolute root plus one safe dataVersion and derive the same SQLite path without
reading or writing `current.json`. Both paths SHALL require the approved root,
`versions`, selected version directory, and SQLite object to be contained,
expected type, non-symlink, and unchanged across their open boundary. They
SHALL NOT read `manifest.json` or select fallback/latest/previous data.

#### Scenario: A valid pointer selects one version

- **WHEN** the pointer has the supported shape and one safe dataVersion
- **THEN** exactly its fixed SQLite path SHALL be directly opened without a
  second pointer read, manifest read, hash, scan, fallback, or retry

#### Scenario: A path can escape or change type

- **WHEN** root/dataVersion/path input traverses, escapes, links, disappears,
  changes identity, or resolves to the wrong object type
- **THEN** direct open SHALL fail without opening an escaped/writable target
  and readiness SHALL remain false

### Requirement: SQLite SHALL be opened read-only and bounded

The sole driver SHALL remain `modernc.org/sqlite v1.54.0` with resolved
`modernc.org/libc v1.74.1`. The consumer SHALL register one per-Store
`modernc.org/sqlite/vfs` backed by a narrow `os.Root` for the selected version
directory, then construct with `net/url`, never concatenate, a URI for only
the relative constant `bangumi.sqlite` using the generated VFS,
`cache=private`, `immutable=1`, `mode=ro`, and exact pragmas
`busy_timeout(5000)`, `foreign_keys(1)`, and `query_only(1)`.

The database SHALL use at most four open/four idle connections and zero
age/idle expiry. Direct open SHALL ping SQLite, establish query-only connection
behavior, and read exactly one non-empty `archive_meta.data_version` value for
Store identity. It SHALL NOT validate that identity against pointer,
directory, manifest, schema, or compatibility claims. It SHALL reject
non-`DELETE` journal mode or any `-wal`/`-shm`/`-journal` sidecar, expose no
mutation API, and close database, VFS, version root, and archive root once in
that order.

The only raw query entry SHALL accept one statement of at most 65,536 bytes
whose first ASCII keyword is `SELECT` or `WITH`, reject comments and semicolons
before driver execution, and keep `query_only` as the second write gate. Each
accepted query SHALL have one Store-owned rows lifetime. Store close SHALL
reject new queries, wait for active rows, then release owned resources.

#### Scenario: Direct open succeeds

- **WHEN** the selected regular SQLite file opens read-only and has one
  non-empty `archive_meta.data_version`
- **THEN** a bounded query-only Store SHALL be returned without digest,
  integrity, foreign-key, schema, count, or compatibility admission

#### Scenario: A write or path escape is attempted

- **WHEN** a caller attempts DDL/DML/writable pragma/attach/multi-statement
  input or the SQLite path is rebound outside the selected root
- **THEN** no Archive, sidecar, temporary, attached, or external file SHALL be
  created and the operation SHALL fail

#### Scenario: Shutdown overlaps active rows

- **WHEN** shutdown begins while a caller owns active rows
- **THEN** new queries SHALL fail, existing rows SHALL remain valid until
  exhaustion/close, and resources SHALL not be freed prematurely

### Requirement: Publication and shutdown SHALL be atomic

Readiness SHALL be represented by one atomic Store pointer and remain false
until direct open, identity read, and the fixed readiness probe succeed.
Publication SHALL be single-assignment from nil; a failed, canceled, or losing
Store SHALL close exactly once and cannot replace a winner. Shutdown SHALL
first clear readiness and then close the published pool exactly once.

#### Scenario: Direct open fails before publication

- **WHEN** contained selection, SQLite open, connection setup, identity read,
  cancellation, or close-sensitive setup fails
- **THEN** owned resources SHALL close and observers SHALL never see a partial
  Store

#### Scenario: Publication or shutdown races

- **WHEN** opens, readiness reads, queries, cancellation, and repeated shutdown
  run concurrently
- **THEN** at most one complete Store SHALL publish, losers SHALL close, and
  shutdown SHALL be idempotent and race-free

### Requirement: Acceptance SHALL reuse authority and stay in scope

Tests SHALL cover bounded pointer selection, unsafe/rebound paths, direct
version open, read-only/query-only behavior, sidecar rejection, dataVersion
identity read, atomic publication, concurrent reads, active-row shutdown,
startup failure serving, and complete-Archive startup. They SHALL NOT execute
Backend manifest/digest/compatibility/integrity/foreign-key/schema/count/
sentinel admission or retain admission-only contract/golden mutation suites.

Acceptance SHALL include focused/full tests, race where supported, vet,
ordinary `CGO_ENABLED=0` build/test, architecture/dependency/inventory guards,
strict change/all validation, repository search for removed admission surfaces,
`git diff --check`, and no residue.

#### Scenario: The direct-open consumer is accepted

- **WHEN** all affected gates and complete-Archive local verification pass
- **THEN** only contained read-only open, Store publication/query lifecycle,
  and preserved API behavior SHALL be claimed
- **AND** Backend Archive admission SHALL remain absent

## REMOVED Requirements

### Requirement: The complete shared contract SHALL gate publication

**Reason:** This requirement defines the duplicate Backend Archive admission
the user explicitly removed.

**Migration:** Updater remains the sole validation authority before atomic
inactive publication; Backend directly opens the selected SQLite snapshot.

### Requirement: Consumer SHALL bind only the corrected raw-domain Archive v1

**Reason:** Runtime schema/domain binding was enforced by Backend admission.

**Migration:** Producer construction remains bound to the corrected v1 rules;
Backend query integration verifies only the data it actually reads.

### Requirement: Candidate load validates every compatibility gate before publication

**Reason:** Candidate validation and its shared loader are deleted.

**Migration:** Tests use direct version open; producer tests own compatibility
and publication validation.

### Requirement: Backend SHALL admit only the matrix rule pair

**Reason:** Backend no longer admits Archive manifests or rule tuples.

**Migration:** Updater continues to construct and validate the single supported
rule pair before publishing an inactive version.
