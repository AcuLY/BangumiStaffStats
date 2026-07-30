## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: yes; verified: owner gates, independent read-only review, and main acceptance passed; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | Contracts implementation owner; main agent reviews, reconciles affected active changes, and accepts. |
| Writable paths | Only the exact planning/apply paths declared by this change. |
| Read-only protected inputs | Product/design/data authorities, root specs, archived/other active changes, runtime/product code, editor/cache state, refs/remotes, external repositories, hosts, and production. |
| Deletion complement | None; the same 31 indexed golden paths SHALL remain. |
| Mutable refs | None during apply. |
| Consumes | Existing Archive v1 contract/corpus/tooling, product NSFW semantics, shared query month ranges, and accepted `DR-DATA-DATE-001`. |
| Produces | Corrected pre-production SQLite v1 subject facts, deterministic evidence, and a corrected master dependency graph. |
| Dependencies | Completed Archive/query contract definitions and proof that no formal/public v1 exists; affected active consumer/producer/query specs reconciled before apply. |
| Deliverables | DDL, README, matrix, tooling, regenerated corpus/vector identities, and master-plan row/edges/count. |
| Acceptance | Calendar/precision/NSFW insertion matrix, nine sentinels, unchanged closed path set, deterministic regeneration, digest/vector consistency, pinned verification, strict validation, and no residue. |
| Non-goals | Runtime implementation, schema v2, dual compatibility, full Archive acquisition, operations, or another OpenSpec root. |
| Operations deferred | No activation, migration, scheduler, retention, restart, rollback, release, deploy, or production data mutation. |
| Stop/rollback conditions | Stop if a formal/public v1 exists, affected specs remain inconsistent, scope/authority drifts, or a gate fails; propose v2 where required and revert only owned unstaged bytes. |

## MODIFIED Requirements

### Requirement: SQLite v1 is complete and self-identifying
`schema.sql` SHALL be canonical UTF-8 with LF endings and one final LF, SHALL set `PRAGMA application_id = 1111969107` (`0x42474d53`, `BGMS`) and `PRAGMA user_version = 1`, and SHALL create a foreign-key/check-constrained immutable read model sufficient for all already-approved Archive producer/consumer/catalog/domain work.

SQLite v1 SHALL include:

- `archive_meta`, embedding exactly the dataVersion, manifest/SQLite versions, domain/cast rule versions, and catalog-config digest;
- normalized `subject`, `subject_rating_bucket`, `subject_tag`, `person`, `person_career`, `character`, and `subject_relation` facts;
- `staff_position` and `staff_position_category`;
- exact raw `staff_credit`, including syntactically valid unknown position IDs;
- exact-only eligible `cast_credit` with subject/person/character identity, role type/order, and provenance;
- dormant `staff_set` and `staff_set_member`;
- catalog read-model tables for position entities/members, groups/members, capabilities, and selection rules.

Every `subject` SHALL contain `nsfw INTEGER NOT NULL` constrained to 0/1.
Its nullable canonical `air_date TEXT` SHALL be paired with nullable
`air_date_precision INTEGER`, where 1 means year, 2 month, and 3 day. Both
columns SHALL be null together or non-null together; a non-null pair SHALL
match exactly one NUL-free legal Gregorian `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`
value with year `0001..9999`, real month/day bounds, and exact precision. The
DDL SHALL explicitly reject embedded NUL before applying SQLite length, pattern,
substring, or numeric checks. Precision MAY be derived only from that exact
registered raw string shape; no missing date component or safety value may be
inferred or defaulted.

The DDL SHALL define stable primary/foreign/check constraints and named lookup indexes including the backend-guide §3.2 access paths equivalent to:

```text
staff_credit(subject_type, position_id, person_id, subject_id)
cast_credit(subject_type, role_type, person_id, subject_id)
cast_credit(subject_type, person_id, subject_id, character_id)
staff_set_member(set_key, position_id)
```

It SHALL replace the initial subject date index with
`idx_subject_filter_date_id(subject_type, nsfw, air_date_precision, air_date,
subject_id)`.

The compatibility matrix SHALL bind the canonical `schema.sql` SHA-256 and one
`bgmss-sqlite-schema-objects-v1` digest of the definitions actually stored in
SQLite. Its preimage SHALL be UTF-8 and consist of the algorithm plus LF,
`count=<decimal>` plus LF, then every explicit `table|index|view|trigger`
`sqlite_schema` row with non-null `sql` and non-reserved name, sorted with
SQLite `BINARY` order by `(type,name,tbl_name)`. For each row, the fixed fields
`type`, `name`, `table`, and `sql` SHALL append
`<field>=<UTF-8-byte-length>:<raw-UTF-8-bytes>` plus LF. Corrected v1 SHALL have
exactly 35 explicit objects. Invalid UTF-8, a missing or extra object, or any
definition-byte change SHALL fail the existing required-object gate as
`SQLITE_REQUIRED_OBJECT_MISSING`.

`staff_position` SHALL contain only positions actually defined by the pinned common catalog. `staff_credit` SHALL constrain its subject/person identities but SHALL preserve a syntactically valid raw position ID even when no matching `staff_position` exists; it MUST NOT require or create a fabricated placeholder catalog row. Unknown-position credits SHALL be non-selectable, counted in source `unresolved` and `UNKNOWN_STAFF_POSITION` quality evidence, and covered by the minimal valid sentinel.

The DDL SHALL also define the subject/relation/tag/catalog lookup indexes needed by the fixed minimal sentinel queries. It MUST NOT contain collection records, query results, sessions, cache state, activation state, fabricated catalog labels, or inferred cast provenance.

#### Scenario: Minimal valid SQLite is inspected
- **WHEN** the regenerated golden database is opened read-only/no-create
- **THEN** its application/user versions, embedded metadata, required tables, constraints, named indexes, foreign-key check, integrity check, table counts, and fixed sentinel queries SHALL all match the manifest and compatibility matrix
- **AND** its safe/day, NSFW/month, safe/year, and safe/null-date subjects SHALL retain their exact facts
- **AND** its unknown-position raw credit remains queryable as raw evidence while no selectable/catalog placeholder exists

#### Scenario: Core raw object or index is absent
- **WHEN** a fixture omits one required raw/catalog table or one named §3.2 or subject-filter index
- **THEN** it SHALL fail as `SQLITE_REQUIRED_OBJECT_MISSING`
- **AND** a later producer/consumer change MUST NOT silently create a private replacement

#### Scenario: A stored object definition is weakened
- **WHEN** the SQLite file retains all required object names and sentinels but changes a `STRICT`, `CHECK`, foreign-key, table, index, view, or trigger definition, or adds another explicit object
- **THEN** its actual `sqlite_schema` object seal SHALL differ from the compatibility matrix and fail as `SQLITE_REQUIRED_OBJECT_MISSING`
- **AND** matching manifest and SQLite byte digests SHALL NOT bypass this gate

#### Scenario: Initial v1 omission is corrected before production
- **WHEN** higher authority proves an initial subject fact is required and preflight proves no formal Archive v1 was produced, published, activated, released, or deployed
- **THEN** this one correction MAY replace the draft SQLite v1 bytes while retaining manifest and SQLite schema version 1
- **AND** the new schema digest, dataVersion, SQLite digest, manifest digest, pointer identity, vector, and golden index SHALL replace every old draft identity without dual-v1 compatibility

#### Scenario: Later work needs a semantic schema change
- **WHEN** a formal v1 exists, this correction has exited, or a later capability needs to remove/reinterpret a v1 column, constraint, table, or identity
- **THEN** it SHALL propose a new Archive contract version and compatibility tuple
- **AND** it MUST NOT reinterpret SQLite v1 in place

### Requirement: Compatibility is explicit and fail closed
`compatibility-matrix.json` SHALL declare the only initial supported tuple `(pointerSchemaVersion=1, manifestSchemaVersion=1, sqliteSchemaVersion=1, dataVersionAlgorithm=bgmss-archive-data-version-v1)`, the required SQLite objects/indexes, and stable validation precedence. Unknown higher/lower versions, unknown algorithms, and version disagreement among pointer, manifest, directory identity, SQLite pragmas, and embedded metadata SHALL be incompatible; no optimistic fallback is allowed.

The retained tuple SHALL describe only the regenerated corrected v1 evidence.
The prior draft schema digest and derived identities SHALL not remain accepted
alternatives. Retaining version 1 SHALL be invalid if any formal/public v1 is
discovered.

The matrix's canonical schema record SHALL equal both the repository
`schema.sql` digest and the valid fixture's actual 35-object seal. Manifest
`schemaSqlDigest` SHALL equal that record before SQLite object validation; a
claim that is internally self-consistent but differs from the canonical record
is unsupported.

Validation SHALL stop at the first applicable stage in this order: JSON parse/schema; source identity/accounting semantics; compatibility; dataVersion recomputation; derived identity/path agreement; file type/containment/size; SQLite byte digest; SQLite format/read-only open; pragma/embedded metadata; required objects/sentinel; table-count agreement.

#### Scenario: Supported tuple agrees everywhere
- **WHEN** pointer, directory identity, manifest, SQLite pragmas, embedded metadata, canonical schema digest, and compatibility matrix all identify the corrected initial tuple and same dataVersion
- **THEN** compatibility validation SHALL pass to the next gate

#### Scenario: Unknown or disagreeing version is supplied
- **WHEN** any version/algorithm/schema digest is unsupported, an identity disagrees, or old draft v1 evidence is supplied
- **THEN** validation SHALL stop as `ARCHIVE_VERSION_UNSUPPORTED`, `DATA_VERSION_MISMATCH`, or `SQLITE_DATA_VERSION_MISMATCH` according to the fixed precedence
- **AND** it SHALL NOT treat an old draft or numerically newer version as compatible

#### Scenario: Manifest table count disagrees last
- **WHEN** every earlier gate succeeds but one manifest table count differs from the read-only SQLite count
- **THEN** validation SHALL fail at the final stage as `SQLITE_TABLE_COUNT_MISMATCH`

### Requirement: Tooling is pinned, local, and disposable
The only persistent tooling files SHALL be the four individually approved
design paths. `ajv@8.20.0` and `quicktype@26.0.0` SHALL be the only direct
development dependencies, with a committed lockfile and install scripts
disabled. Because quicktype 26 declares Node `>=20.19.0` while its exact
`stream-json@3.5.0` edge requires Node `>=22`, `package.json` SHALL use the exact
npm override `stream-json: 2.1.0`. That BSD-3-Clause transitive compatibility
pin SHALL have no direct application import. `npm ls quicktype stream-json`
SHALL resolve exactly quicktype `26.0.0` and stream-json `2.1.0`, with no
installed `3.5.0`; the used `parser.asStream` export SHALL be callable. The
package and acceptance gate SHALL enforce `node >=20.19.0` and `npm >=10`, and
all remaining npm engine mismatches SHALL fail rather than warn. Ajv SHALL
compile/validate the schemas and fixtures in strict JSON Schema 2020-12 mode.
Quicktype SHALL generate temporary Python and Go models from the authoritative
schemas without schema-level error; the Python output SHALL pass syntax
compilation and the Go output SHALL pass formatting and an isolated compile
smoke using the available development toolchain. Install success without both
language smokes SHALL fail. This feasibility smoke SHALL NOT require a
bootstrapped updater/backend application or make generated files authoritative.

All configurable npm cache, Go build/module/workspace cache, installed
packages, Python bytecode, SQLite-build scratch, process temporary files, and
generated models SHALL stay below canonical non-symlink descendants
`contracts/schemas/archive/.cache/**`,
`contracts/schemas/archive/tooling/node_modules/**`, or
`contracts/schemas/archive/.tmp/**`. Apply SHALL verify the effective npm cache,
`GOCACHE`, `GOMODCACHE`, `GOPATH`, and `TMPDIR` under those roots; use
`GOENV=off`, `GOWORK=off`, `GOTOOLCHAIN=local`, and npm engine-strict mode; and
disable Python bytecode writes. Before any ordinary Go process starts, apply
SHALL invoke the absolute Go executable's `go env GOTELEMETRY GOTELEMETRYDIR`
inside a bootstrap macOS `sandbox-exec` profile combining `(allow default)`,
`(deny network*)`, and `(deny file-write*)`, with the same three Go controls.
This discovery process cannot write telemetry or start an uploader. Apply SHALL
stop on upload-enabled or unknown returned mode and canonicalize the returned
directory.

The shared telemetry directory's whole-directory snapshots SHALL be diagnostic
only because persistent unrelated Go processes MAY change the same bytes.
After discovery accepts either `off` or `local`, every actual Go or `gofmt`
executable invocation—including those launched by nested verifier logic—SHALL
execute directly through a reviewed `sandbox-exec` profile denying
`file-write*` beneath the canonical telemetry directory. This wrapper SHALL
remain unconditional after discovery because an unrelated process MAY change
the shared telemetry mode before a later command starts. An inherited-sandbox
flag, environment value, or caller self-attestation MUST NOT bypass that
wrapper. A direct Go invocation, profile/path mismatch, unavailable wrapper, or
wrapper failure SHALL stop apply without fallback. Apply SHALL record
before/after diagnostic seals but SHALL NOT require their equality, infer writer
attribution, stop/configure unrelated processes, change telemetry mode,
interpret/delete counters, authorize upload, or redirect a user home or config
directory. The owned ephemeral roots SHALL be removed by exact validated
targets after verification and SHALL be absent from the final physical/index
inventory.

Every file-backed JSON schema, matrix, manifest, pointer, index, vector, package
record, and fixture SHALL be read as bytes and decoded with fatal UTF-8 before
`JSON.parse` or schema validation. Invalid UTF-8 MUST NOT be replaced with
U+FFFD, normalized, or accepted merely because its raw-byte digest matches.
The verifier SHALL execute an invalid-byte negative self-test through the same
shared decoder without adding a persistent golden path.

#### Scenario: Pinned tools verify the contract
- **WHEN** the exact lock installs with scripts disabled, local cache routing, and every actual Go or `gofmt` invocation directly inside the required process-level write-denial boundary
- **THEN** the exact quicktype/stream-json resolution and parser export gate SHALL pass
- **AND** strict schema, vector, SQLite, Python-generation, and Go-generation checks SHALL pass without writing outside the Archive writable root or the shared telemetry directory

#### Scenario: Unrelated Go telemetry changes concurrently
- **WHEN** the diagnostic directory seal changes while every verifier-owned Go-starting process is proven inside the required write-denial sandbox
- **THEN** the diagnostic drift SHALL NOT fail contract acceptance or be attributed to this verifier
- **AND** no process, counter, global mode, user home, or config directory SHALL be mutated to force snapshot equality

#### Scenario: Contract JSON contains invalid UTF-8
- **WHEN** any file-backed JSON input contains a malformed UTF-8 byte sequence, including one whose replacement text would satisfy its JSON Schema
- **THEN** decoding SHALL fail before JSON parsing, schema validation, compatibility, or digest-based acceptance
- **AND** the verifier SHALL NOT substitute U+FFFD or reinterpret the raw bytes

#### Scenario: Tool or temporary output drifts
- **WHEN** the lock cannot install exactly, a tool version differs, fatal JSON decoding is bypassed, generated code fails syntax/compile smoke, an actual Go or `gofmt` invocation lacks the exact direct sandbox wrapper, a caller attempts an environment-only bypass, a global/home/system-temp write is required, or an ephemeral root remains
- **THEN** apply SHALL stop
- **AND** it SHALL NOT switch versions, bypass the wrapper, commit generated models, or accept the candidate

## ADDED Requirements

### Requirement: Subject safety and partial-date semantics SHALL be authoritative
The Archive producer SHALL map one authoritative boolean NSFW value for every
imported subject. Missing, null, non-boolean, or coerced input SHALL fail the
subject semantic quality gate and MUST NOT default to safe or unsafe.

Only `YYYY`, `YYYY-MM`, and `YYYY-MM-DD` are accepted. Embedded NUL, trailing
bytes, wrong length or separators, non-ASCII digits, year outside
`0001..9999`, invalid month/day bounds, and invalid Gregorian leap dates SHALL
be rejected. The producer SHALL derive precision only from the accepted raw
string's exact shape. Missing dates SHALL store both date columns as null.

Effective `includeNSFW=false` SHALL admit only `nsfw=0`.
Effective `includeNSFW=true` SHALL admit both `nsfw=0` and `nsfw=1`; it SHALL
NOT mean NSFW-only. An active closed `YYYY-MM` subject-date range and all
quarter/timeline derivation SHALL admit only precision 2/3. Null and
year-precision dates SHALL be excluded, never expanded to an inferred month,
day, January, or Q1.

#### Scenario: Every registered date precision is preserved
- **WHEN** authoritative inputs provide a missing date, `2024`, `2024-02`, or `2024-02-29`
- **THEN** SQLite SHALL store respectively `(null,null)`, `("2024",1)`, `("2024-02",2)`, or `("2024-02-29",3)` without adding a component

#### Scenario: A malformed or impossible date is supplied
- **WHEN** input has embedded NUL or trailing data, wrong separators/digit widths, year `0000`, month 00/13, an impossible day, or `2023-02-29`
- **THEN** the DDL/tooling semantic gate SHALL reject it
- **AND** no normalized or rolled-over value SHALL be stored

#### Scenario: Date and precision disagree
- **WHEN** exactly one column is null or precision does not equal the canonical text shape
- **THEN** insertion/integrity verification SHALL fail

#### Scenario: Safe and inclusive NSFW modes are applied
- **WHEN** the same candidate set contains safe and NSFW subjects
- **THEN** `includeNSFW=false` SHALL return only safe subjects
- **AND** `includeNSFW=true` SHALL return both classes

#### Scenario: Year-only date meets a month filter or timeline
- **WHEN** a subject has precision 1 and a month range or quarterly timeline is active
- **THEN** that subject SHALL be excluded from that date-filter/timeline contribution
- **AND** it SHALL NOT be assigned January or Q1

### Requirement: Corrected evidence SHALL remain closed and deterministic
The minimal fixture SHALL contain exactly four subject semantic examples:
safe/day, NSFW/month, safe/year, and safe/null-date. The matrix SHALL retain the
four existing invariants and add five fixed sentinels for safe count, NSFW
count, month-filter eligibility, year-only preservation, and zero
null/precision mismatches.

The same 31 indexed paths SHALL remain. Tooling SHALL regenerate every
schema-dependent SQLite, manifest, pointer, vector, and index identity from
final bytes; verify a table-driven invalid NSFW/date/precision insertion matrix;
verify the canonical 35-object seal plus a weakened-definition mutation; and
produce the same directory byte seal across a check and second clean generation.
No runtime-private schema or golden copy is authoritative.

The master DAG SHALL contain 28 main-repository changes, add this correction
after the Archive and query contracts, and make it a direct prerequisite of
the active Archive consumer, Archive producer, and query-result changes. Main
SHALL reconcile those active specs before this change applies; this change
MUST NOT edit their artifacts or runtime code.

#### Scenario: Corrected corpus is regenerated
- **WHEN** tooling builds the approved subject examples from the corrected DDL
- **THEN** the vector, schema/dataVersion/SQLite/manifest/pointer digests, table counts, nine sentinel results, and all 31 index entries SHALL agree
- **AND** the matrix schema SQL digest and 35-object seal SHALL match the repository DDL and actual database definitions
- **AND** a second clean generation SHALL be byte-identical

#### Scenario: Corpus paths or derived bytes drift
- **WHEN** a golden path is added/deleted, an old identity remains, a sentinel or count differs, or regeneration is non-deterministic
- **THEN** contract acceptance SHALL fail before sync/archive

#### Scenario: An affected downstream change is not reconciled
- **WHEN** consumer, producer, or query-result planning still assumes the old subject shape or lacks this dependency
- **THEN** apply SHALL stop without changing Contracts, runtime code, the master plan, or refs
