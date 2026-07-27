# backend-archive-consumer Specification

## Purpose
Define strict immutable Archive loading, validation, read-only query access,
atomic publication, and shutdown semantics for the Go backend.
## Requirements
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
For the caller-approved absolute root, the opened root identity and a post-open
`Lstat` of its final pathname component SHALL both match the pre-open `Lstat`;
ancestor symlinks MAY remain accepted when that final identity is unchanged.

#### Scenario: A valid pointer selects one version

- **WHEN** the pointer has the supported shape and dataVersion
- **THEN** exactly its fixed manifest and SQLite paths are selected without a second pointer read

#### Scenario: A producer validates an inactive candidate

- **WHEN** a caller supplies an absolute staging root and validated dataVersion whose fixed version directory is complete
- **THEN** the same candidate gates SHALL run without a pointer read/write or readiness publication

#### Scenario: A path can escape or change type

- **WHEN** input contains an unknown path field, unsafe dataVersion, traversal, absolute/drive/URI segment, symlink, missing object, directory, or special file
- **THEN** validation SHALL stop before hashing or opening an escaped target and readiness SHALL remain false

#### Scenario: The approved root final component is rebound

- **WHEN** the checked root directory is renamed and its final pathname component becomes a symlink or replacement before `os.OpenRoot` completes
- **THEN** the opened and post-open identities SHALL fail the pre-open comparison, every opened handle SHALL close, and no candidate SHALL be returned

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

Strict manifest validation SHALL apply the exited string hardening before
source accounting. `generatedAt` SHALL use the exact calendar-valid UTC
`YYYY-MM-DDTHH:mm:ss[.1..6]Z` subset with years `0001..9999`, real Gregorian
dates, hour `00..23`, and minute/second `00..59`. Both URL fields SHALL contain
only Unicode scalar values and be bounded inclusively at 12 through 2048
scalars, never UTF-8 bytes. The consumer SHALL inspect raw JSON string escapes
and reject an isolated high or low surrogate before `encoding/json` can replace
it with U+FFFD; a legal pair SHALL count as one scalar.
Before typed decoding, every required top-level manifest field and every
required field of every `sourceFiles` entry SHALL be present and non-null, and
every `tableCounts` and `qualitySummary` value SHALL be non-null. JSON `null`
MUST NOT be accepted as a Go integer zero, nil map, nil slice, or empty string.
Every schema `integer` SHALL follow JSON Schema 2020-12 mathematical-value
semantics: zero-fraction decimal and exponent spellings, including `1.0` and
`1e0`, SHALL decode to the same exact integer as `1`. Conversion SHALL NOT use
binary floating point, round a non-zero fraction, overflow, or accept a value
outside the JSON-safe schema range.

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

#### Scenario: Manifest string semantics are exercised by the runtime

- **WHEN** every case in the indexed `manifest-string-semantics.json`, including the exact `C3 28` raw-byte recipe, is passed through the real Go manifest decoder
- **THEN** valid calendar, fraction, scalar-length, and legal-pair cases SHALL be accepted
- **AND** impossible time, below/above-bound URL, isolated-surrogate, and malformed-byte cases SHALL return `MANIFEST_SCHEMA_INVALID` before later gates
- **AND** the isolated Contracts Go probe alone SHALL NOT satisfy this runtime acceptance

#### Scenario: A required manifest value is null

- **WHEN** any required top-level field, any required field of a source entry, or any existing table/quality count is replaced by JSON `null`
- **THEN** the real candidate loader SHALL return `MANIFEST_SCHEMA_INVALID` before source accounting, compatibility, SQLite opening, or publication

#### Scenario: An integer uses another schema-valid number spelling

- **WHEN** any pointer, manifest, source-accounting, table-count, or quality-count integer is encoded with a zero fractional part or an exponent whose mathematical value is unchanged
- **THEN** the real decoder and loader SHALL accept the same exact bounded integer without float rounding
- **AND** a non-integral, unsafe-range, or exponent-overflow value SHALL return the applicable pointer- or manifest-schema outcome before later gates

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
The VFS filesystem SHALL accept only `bangumi.sqlite`. Every VFS open SHALL
compare its pre-open path, opened handle, and post-open path with that validated
identity, size, and modification time; any mismatch SHALL fail that open and
the candidate before publication even if the approved pathname is restored.

The single `database/sql` pool SHALL use four open/four idle connections and zero age/idle expiry, ping, and verify configured pragmas on four acquired connections before publication.
`integrity_check(1)` SHALL return exactly one `ok` row and `foreign_key_check` zero rows. The store SHALL expose no mutation API.
Its only raw query entry SHALL accept one statement of at most 65,536 bytes
whose first ASCII keyword is `SELECT` or `WITH`, reject `--`, `/*`, `*/`, and
any semicolon before driver execution with one fixed safe exported
programming-error sentinel, and keep `query_only` as a second write gate.
Each accepted raw query SHALL have one Store-owned rows lifetime that releases
exactly once on exhaustion or close. Store close SHALL reject new queries,
wait for all active rows to finish, then close the database, VFS, version root,
and archive root in that order; it MUST NOT free VFS/root resources while an
active rows value still owns a database connection.

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

#### Scenario: A later pooled connection sees rebound SQLite bytes

- **WHEN** `bangumi.sqlite` is rebound between any two VFS opens and its approved pathname is restored before final validation
- **THEN** the per-open identity gate SHALL reject the replacement handle and no mixed-inode pool SHALL publish

#### Scenario: Digest and format both differ

- **WHEN** SQLite bytes have both an incorrect digest and invalid header after
  their file size/type gate succeeds
- **THEN** the fixed precedence SHALL return `SQLITE_DIGEST_MISMATCH`

#### Scenario: Concurrent reads use the bounded store

- **WHEN** callers query the published store concurrently under the race detector
- **THEN** reads SHALL return consistent snapshot data with at most four open connections and no race

#### Scenario: Shutdown overlaps active rows

- **WHEN** shutdown begins while a caller still owns active rows
- **THEN** new queries SHALL fail, existing rows SHALL remain valid until exhausted or closed, and Store close SHALL not return or release the VFS/roots until that rows lifetime ends

### Requirement: Publication and shutdown SHALL be atomic

Readiness SHALL be represented by one atomic store pointer and SHALL remain false until every gate succeeds. Publication SHALL be single-assignment: compare-and-swap from nil; a failed or losing candidate SHALL close exactly once and cannot replace a winner.
Context cancellation SHALL be checked after the final validation hook, after
the final SQLite identity check, and while holding the state lock immediately
before runtime publication; a candidate canceled before or while waiting for
that lock SHALL close outside the lock and SHALL NOT publish.
Shutdown SHALL first make readiness false and then close the published pool exactly once after serving stops.

#### Scenario: Loading fails before publication

- **WHEN** any parsing, filesystem, digest, SQLite, context, or close-sensitive gate fails
- **THEN** the candidate resources SHALL close and observers SHALL never see a partial store

#### Scenario: Publication or shutdown races

- **WHEN** loads, readiness reads, queries, cancellation, and repeated shutdown run concurrently
- **THEN** at most one complete store SHALL publish, losing resources SHALL close, and shutdown SHALL be idempotent and race-free

#### Scenario: Cancellation wins the final publication window

- **WHEN** the load context is canceled at the final file-check boundary or before the state publication gate
- **THEN** the candidate SHALL close, return `ARCHIVE_CONTEXT_CANCELED`, and readiness SHALL remain false

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
Every indexed manifest-string case SHALL execute through the real Go manifest
decoder, including exact timestamp arithmetic, scalar counting, raw surrogate
inspection, and the malformed-byte recipe.
Tests SHALL exhaustively mutate every required manifest/source field and every
existing nested count to `null`; rewrite every integer-bearing pointer,
manifest, source, table-count, and quality-count path to a schema-valid
zero-fraction spelling; cover exact exponent, negative-zero, safe-boundary,
fractional, and overflow outcomes; deterministically exercise final-root and
per-VFS-open rebound windows, final cancellation including a lock wait, and
shutdown with active rows; and prove no mixed-inode pool or premature VFS/root
release.
Acceptance SHALL include targeted/full tests, a separate `go test -race ./...`
with the host race toolchain, vet, ordinary `CGO_ENABLED=0` build/test,
architecture/dependency and persistent-inventory guards, strict change/all
validation, and no residue.

#### Scenario: The consumer is accepted

- **WHEN** all acceptance gates pass from the approved inputs
- **THEN** only the internal consumer/startup capability SHALL be claimed
- **AND** HTTP, observability, producer, operations, activation, and hot reload SHALL remain absent

### Requirement: Consumer SHALL bind only the corrected raw-domain Archive v1

The Go consumer SHALL bind its schema-object count/digest to the corrected
compatibility matrix and SHALL execute the unchanged-path-set canonical corpus.
Contract tests SHALL query the corrected minimal fixture and prove that raw
cast roles and relation codes are SQLite integers, all five normalized subject
types are readable, code `2` and code `3` retain their stored source direction,
and no discarded text-normalized draft value is accepted.

The consumer SHALL remain read-only and SHALL not derive series or cast-query
semantics while loading. It validates the corrected shared authority; later
backend domain work applies the accepted main/all and series predicates.

#### Scenario: Corrected canonical bundle is loaded

- **WHEN** the corrected manifest, SQLite bytes, schema digest, object seal,
  dataVersion, and table counts agree
- **THEN** the existing candidate loader SHALL accept the bundle
- **AND** contract queries SHALL return the exact numeric raw-domain sentinels

#### Scenario: Discarded draft identity is supplied

- **WHEN** a bundle carries the prior draft schema/object/dataVersion identity
  or text-normalized cast/relation data
- **THEN** the existing fixed validation precedence SHALL reject it
- **AND** no fallback tuple or content rewrite SHALL run

### Requirement: Candidate load validates every compatibility gate before publication

The consumer SHALL bind to the corrected canonical schema SQL and 35-object
definition seals. Its real-SQLite contract evidence SHALL accept a valid
15-character staff-set key under the corrected DDL and reject the superseded
schema identity. Loader behavior remains read-only and all existing gate
precedence remains unchanged.

#### Scenario: Corrected draft-v1 fixture is loaded
- **WHEN** the regenerated canonical fixture carries the corrected schema/object seals
- **THEN** candidate validation SHALL pass all existing startup gates
- **AND** the bound consumer SHALL expose no fallback to the superseded lower-bound definition

### Requirement: Backend SHALL admit only the matrix rule pair

Backend Archive admission SHALL compare manifest domain/cast rule versions with
the exact tracked compatibility tuple together with the existing version,
algorithm, application-id, and schema identities. This compatibility check
SHALL occur after strict JSON/accounting validation and before dataVersion,
path, digest, or SQLite work.

#### Scenario: Rule pair matches
- **WHEN** the manifest uses `domain-raw-v1` and `cast-exact-v1` with all other supported fields
- **THEN** Backend SHALL continue through normal immutable Archive admission

#### Scenario: Rule pair is unknown
- **WHEN** either rule token is valid syntax but not the supported tuple
- **THEN** Backend SHALL return `ARCHIVE_VERSION_UNSUPPORTED` without opening SQLite
