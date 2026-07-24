# contracts-archive-manifest Specification

## Purpose
Define the immutable, language-neutral Archive handoff that lets a producer and
read-only consumers agree on manifest identity, schema and SQLite compatibility,
dataVersion evidence, pointers, and failure classification.
## Requirements
### Requirement: One authoritative Archive contract bundle
The repository SHALL define `contracts-archive-manifest` only through the root OpenSpec capability and the tracked artifacts under `contracts/schemas/archive/**` and `contracts/goldens/archive/**`. `schema.sql`, `archive-manifest.schema.json`, `current-pointer.schema.json`, `data-version-input.schema.json`, `fixture-index.schema.json`, and `compatibility-matrix.json` SHALL be the machine-readable authorities; the closed golden corpus SHALL be the language-neutral producer/consumer evidence. No Python, Go, frontend, nested OpenSpec, or generated model copy SHALL become a second authority.

#### Scenario: Both future runtimes need the Archive shape
- **WHEN** `bootstrap-updater-runtime` and `bootstrap-backend-runtime` begin their own approved changes
- **THEN** both consume the same tracked schemas, DDL, compatibility matrix, and indexed goldens
- **AND** neither runtime change redefines the Archive contract in a private fixture or schema

#### Scenario: A nested contract control plane is proposed
- **WHEN** an apply task proposes another `openspec/`, generated OpenSpec skill set, or authoritative Archive schema below `backend/`, `updater/`, or `frontend/`
- **THEN** review SHALL reject it before apply

### Requirement: Strict versioned manifest and inert pointer schemas
`archive-manifest.schema.json`, `current-pointer.schema.json`, `data-version-input.schema.json`, and `fixture-index.schema.json` SHALL use JSON Schema 2020-12 and SHALL compile in strict mode. Every object SHALL reject unknown properties; bounded strings and arrays SHALL be explicit; every JSON integer SHALL be within `[-9007199254740991,9007199254740991]`, with sizes/counts non-negative; every digest SHALL match `sha256:<64 lowercase hexadecimal characters>`.

The Archive manifest SHALL require manifest/SQLite schema versions, the named dataVersion algorithm and dataVersion, generator version, UTC generated time, Archive release/asset identity and digest, exact common commit and `subject_staffs.yml` digest, schema SQL digest, catalog-config digest, domain/cast rules versions, complete table counts, bounded quality counts including `NO_CHARACTERS`, `NO_CAST_RELATIONS`, `FILTERED_BY_VALID_CV`, and `UNKNOWN_STAFF_POSITION`, and fixed SQLite name/size/digest. `sourceFiles` SHALL contain exactly one entry for each and only these seven basenames: `subject.jsonlines`, `person.jsonlines`, `character.jsonlines`, `subject-persons.jsonlines`, `subject-characters.jsonlines`, `person-characters.jsonlines`, and `subject-relations.jsonlines`.

Each source entry SHALL contain exact size/digest plus JSON-safe non-negative integers `recordsTotal`, `imported`, `duplicate`, `invalid`, and `unresolved`. Those four outcome classes SHALL be mutually exclusive per source record and SHALL satisfy `recordsTotal = imported + duplicate + invalid + unresolved`; unresolved input may still preserve a raw fact but SHALL NOT fabricate a resolved/catalog entity. The minimal golden SHALL fix `commonCommit` to `6a8442c17143a870357a5ff812362e8b5cfe9f9d`. The pointer schema SHALL contain exactly `pointerSchemaVersion`, `dataVersion`, and `manifestDigest`.

#### Scenario: Minimal manifest and pointer are valid
- **WHEN** the indexed minimal manifest and inert `current-pointer.json` contain all required bounded fields and no unknown field
- **THEN** strict JSON Schema validation SHALL accept both
- **AND** all seven basenames appear exactly once, their accounting equations hold, and the common commit equals the fixed golden commit

#### Scenario: Source accounting is incomplete or inconsistent
- **WHEN** a required basename is missing/duplicated/unknown, an accounting field is absent/unsafe, the four outcomes do not sum to `recordsTotal`, or the minimal common commit drifts
- **THEN** strict validation SHALL return `MANIFEST_SCHEMA_INVALID` for shape/type/set failures or semantic validation SHALL return `MANIFEST_ACCOUNTING_INVALID` for an invalid equation
- **AND** rejection occurs before compatibility or SQLite inspection

#### Scenario: Unknown or malformed fields are supplied
- **WHEN** a manifest/pointer has an unknown property, malformed digest, unsafe SQLite filename, invalid timestamp, negative count, missing source identity, or wrong value type
- **THEN** strict validation SHALL reject it as `MANIFEST_SCHEMA_INVALID` or `POINTER_SCHEMA_INVALID`
- **AND** no compatibility, path, digest, or SQLite check SHALL run for that document

### Requirement: Cycle-free canonical dataVersion
The authoritative algorithm SHALL be named `bgmss-archive-data-version-v1`. It SHALL validate the input object and then hash the UTF-8 bytes of these exact ordered lines with one final LF:

```text
bgmss-archive-data-version-v1
archiveRelease=<release>
archiveDigest=<sha256 digest>
commonCommit=<40 lowercase hex commit>
commonDigest=<sha256 digest>
manifestSchemaVersion=<base-10 integer>
sqliteSchemaVersion=<base-10 integer>
schemaSqlDigest=<sha256 digest>
domainRulesVersion=<token>
castRulesVersion=<token>
catalogConfigDigest=<sha256 digest>
```

The result SHALL be `dv1-` plus the 64-character lowercase hexadecimal SHA-256 of those canonical bytes. Input values SHALL be bounded to unambiguous ASCII token/digest/commit forms. `generatedAt`, generator version, source/table/quality counts, SQLite bytes/digest, manifest bytes/digest, filesystem path, and activation state MUST NOT enter dataVersion.

#### Scenario: Identical semantic inputs are regenerated
- **WHEN** two producers receive the same validated semantic inputs but run at different times or use different generator build identifiers
- **THEN** the canonical preimage bytes and dataVersion SHALL be identical

#### Scenario: One semantic input changes
- **WHEN** Archive/common content, manifest/SQLite schema, canonical SQL, domain/cast rule version, or canonical catalog configuration changes
- **THEN** the canonical preimage SHALL change
- **AND** the resulting dataVersion SHALL change

#### Scenario: Object key order changes
- **WHEN** a data-version input JSON object presents the same validated values in a different property order
- **THEN** the fixed-line canonical preimage and dataVersion SHALL remain identical

### Requirement: Digests form a non-self-referential graph
The contract SHALL distinguish named SHA-256 byte algorithms and SHALL keep their dependency graph acyclic:

```text
semantic canonical inputs -> dataVersion
final SQLite bytes embedding dataVersion -> sqliteDigest
manifest bytes containing dataVersion and sqliteDigest -> manifestDigest
current-pointer and outer fixture index -> manifestDigest
```

`archiveDigest`, `commonDigest`, each source-file digest, `schemaSqlDigest`, `sqliteDigest`, and `manifestDigest` SHALL hash exact bytes. The manifest SHALL contain `sqliteDigest` but MUST NOT contain `manifestDigest`; only the pointer/outer fixture index SHALL contain the manifest byte digest. No digest-bearing document may hash bytes that include its own digest.

#### Scenario: A complete valid bundle is checked
- **WHEN** dataVersion is computed first, the final database embeds it, the database digest is written into a manifest, and the pointer hashes the final manifest bytes
- **THEN** every edge can be recomputed once in dependency order
- **AND** no fixed-point or self-hash calculation is required

#### Scenario: A self-digest field is proposed
- **WHEN** an implementation adds `manifestDigest` to the bytes of the manifest it hashes, adds `sqliteDigest` to dataVersion inputs, or makes dataVersion depend on manifest/pointer bytes
- **THEN** schema/tool verification SHALL reject the bundle before acceptance

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

### Requirement: Pointer and fixture paths are fail-safe
The pointer contract SHALL carry no arbitrary path. A future consumer SHALL derive only `<approved-root>/versions/<validated-dataVersion>/manifest.json` and `<approved-root>/versions/<validated-dataVersion>/bangumi.sqlite`; the manifest’s local SQLite filename SHALL be the constant `bangumi.sqlite`. DataVersion and source identities SHALL reject slash, backslash, NUL, percent-encoded path syntax, `.`/`..`, absolute/drive paths, URI schemes, and unknown path fields.

All local contract/fixture/tool checks SHALL require canonical-root-contained regular non-symlink files. The contract SHALL include negative vectors for an unsafe dataVersion, an unknown pointer path field, and an unsafe SQLite filename. This change SHALL create no runtime file named `current.json`; `current-pointer.schema.json` and golden `current-pointer.json` files are inert contract evidence only.

#### Scenario: Safe inert pointer is resolved
- **WHEN** the pointer has only a valid `dv1-<64hex>` identity and manifest digest
- **THEN** the derived manifest/SQLite names are fixed and contained beneath the separately approved root
- **AND** no user-provided path segment except the validated dataVersion is interpreted

#### Scenario: Traversal or symlink escape is attempted
- **WHEN** a vector supplies `../`, a slash/backslash, absolute/drive/URI syntax, an unknown `manifestPath`, a non-regular file, or a symlink leaving the approved root
- **THEN** validation SHALL fail before opening or hashing the escaped target

#### Scenario: Contract application completes
- **WHEN** this change reaches its accepted candidate
- **THEN** no file named `current.json` SHALL exist anywhere in its diff
- **AND** no version SHALL have been activated

### Requirement: Golden corpus is closed and language neutral
`contracts/goldens/archive/index.json` SHALL list every other golden file exactly once with relative path, SHA-256, case id, validation stage, and expected stable outcome. Verification SHALL reject an unindexed, missing, duplicate, hash-drifted, symlink, or non-regular golden.

The corpus SHALL contain one tiny internally consistent valid Archive and the exact invalid JSON/bundle inventory from the approved design. It SHALL cover strict unknown fields/digests/path forms, `MANIFEST_ACCOUNTING_INVALID`, `DATA_VERSION_MISMATCH`, `SQLITE_DIGEST_MISMATCH`, `SQLITE_FORMAT_INVALID`, `ARCHIVE_VERSION_UNSUPPORTED`, `SQLITE_DATA_VERSION_MISMATCH`, `SQLITE_REQUIRED_OBJECT_MISSING`, and `SQLITE_TABLE_COUNT_MISMATCH`. The count-mismatch bundle SHALL keep every earlier gate valid and change exactly one manifest count so its first failure is the final table-count gate. It SHALL contain no downloaded full Archive, real user collection, token, secret, or production pointer.

#### Scenario: Closed corpus is verified
- **WHEN** the verifier walks `contracts/goldens/archive/**`
- **THEN** the path set SHALL equal the index path set exactly
- **AND** every case SHALL produce its indexed outcome in the fixed precedence

#### Scenario: Corrupt bytes still match their manifest digest
- **WHEN** the corrupt-SQLite case has a manifest whose SQLite digest matches the deliberately corrupt bytes
- **THEN** validation SHALL pass the digest gate and fail specifically as `SQLITE_FORMAT_INVALID`

#### Scenario: Fixture bytes drift
- **WHEN** a golden is added, removed, replaced, symlinked, or changed without an exact index update and expected result
- **THEN** contract verification SHALL fail before candidate acceptance

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

### Requirement: Python producer and Go consumer handoffs remain separate
The future Python producer SHALL be the only Archive writer and SHALL generate artifacts conforming to `schema.sql`, the manifest schema, dataVersion algorithm, digest graph, and goldens. The future Go consumer SHALL open Archive bytes read-only/no-create and SHALL validate the same contract and indexed outcomes. This change SHALL prove only schema/model input feasibility; actual Python/Go producer/consumer contract tests belong respectively to `bootstrap-updater-runtime`, `bootstrap-backend-runtime`, `implement-backend-archive-consumer`, and `produce-immutable-archive`.

#### Scenario: Runtime foundation changes begin
- **WHEN** the updater and backend foundations implement their contract tests
- **THEN** each SHALL accept the indexed minimal valid bundle and reject the named negative cases
- **AND** neither SHALL require generated runtime code to be committed by this change

#### Scenario: A runtime attempts to weaken the contract
- **WHEN** a future producer/consumer ignores unknown fields, unsupported versions, digest mismatches, unsafe paths, missing objects, or embedded dataVersion disagreement
- **THEN** its own change SHALL fail acceptance against the shared golden case

### Requirement: Parallel apply starts from one clean paired checkpoint
Wave 1A SHALL start from one committed planning checkpoint on `codex/formal-rewrite` containing both fully approved change directories `define-archive-manifest-contract` and `define-shared-query-wire`. After main-agent approval, one separate delegated checkpoint subagent—not the main agent or either apply owner—SHALL stage only those two directories, validate the cached delta, create the checkpoint commit, and stop; the main agent SHALL verify it read-only. The handoff SHALL name the exact HEAD. Before either apply agent writes, the index and worktree SHALL be clean, both change seals SHALL pass, and both agents SHALL snapshot the exact sibling planning/task/apply path set.

The Archive agent may tolerate sibling dirty state only under:

```text
openspec/changes/define-shared-query-wire/tasks.md
contracts/openapi/**
contracts/schemas/query/**
contracts/goldens/query/**
.gitignore
```

It MAY additionally tolerate the exact untracked non-symlink `.vscode/settings.json` and SHA-256 recorded by the lifecycle control plus spec-only planning under:

```text
openspec/changes/bootstrap-backend-runtime/**
openspec/changes/bootstrap-updater-runtime/**
openspec/changes/bootstrap-frontend-foundation/**
```

Those paths are outside both Wave 1A owner envelopes and SHALL never be written, staged, cleaned, hidden, archived, committed, or included in implementation/dependency conclusions by a Wave 1A owner/finalizer. The three planning directories may contain only OpenSpec artifacts.

It SHALL write only its own `tasks.md`, `contracts/schemas/archive/**`, and `contracts/goldens/archive/**`; SHALL never stage, commit, archive, or mutate a Git ref while the sibling runs; and SHALL scope all status/diff/check/inventory commands to its own paths plus a read-only exact-union guard. The index MUST remain empty.

#### Scenario: Both agents start from the exact tolerated state and remain disjoint
- **WHEN** both apply agents observe the same approved HEAD, empty index, no dirty path outside the two owner sets except the three exact spec-only Wave 1B planning directories and exact sealed untracked `.vscode/settings.json`, non-overlapping path sets, and valid seals
- **THEN** each MAY create its own unstaged candidate in parallel
- **AND** sibling changes under the exact allowance SHALL not be mistaken for this owner’s output

#### Scenario: Unexpected dirty path or index entry appears
- **WHEN** any changed/untracked/ignored path falls outside the two exact owner sets, three exact spec-only Wave 1B planning directories, and exact sealed untracked `.vscode/settings.json`; a planning directory contains non-OpenSpec output; either set overlaps; the sibling baseline cannot be identified; or the index becomes non-empty
- **THEN** this apply SHALL stop without staging, restoring, deleting, or rewriting either candidate

#### Scenario: One apply candidate becomes ready first
- **WHEN** the Archive candidate passes its path-scoped tests while the query agent is still running
- **THEN** the Archive agent SHALL stop and report its exact inventory/hashes/results
- **AND** it SHALL NOT commit, archive, or wait by mutating the sibling’s state

### Requirement: One finalization subagent creates the Wave 1A commit
Only after both apply agents have stopped and the main agent has independently accepted both unstaged candidates may one delegated finalization subagent stage or archive. It SHALL re-prove the accepted workspace-state amendment HEAD, empty index, exact combined path union, no extra dirty/ignored path beyond the three exact spec-only Wave 1B planning directories and unchanged sealed `.vscode/settings.json`, both candidate hashes, and both strict validation results; archive only `define-archive-manifest-contract` and `define-shared-query-wire`; verify the two synchronized root specs and exact archive path delta; stage no path outside the reviewed combined apply/archive union and specifically no Wave 1B planning path or `.vscode/**`; stop for final main-agent read-only acceptance; and then create exactly one commit with subject `feat(contracts): establish wave 1 shared contracts`.

#### Scenario: Both accepted candidates finalize exactly
- **WHEN** both candidate seals still match and archive output contains only the two expected archived changes/root specs plus their accepted contract paths
- **THEN** the same finalization subagent MAY create the single exact-subject phase commit after final acceptance
- **AND** the resulting index SHALL be clean and the worktree SHALL contain no dirty path except the three exact spec-only Wave 1B planning directories plus exact sealed untracked `.vscode/settings.json`

#### Scenario: Candidate or archive output drifts
- **WHEN** any accepted byte changes, an expected path is missing, an extra path appears, archive synchronization differs, or strict/cached checks fail
- **THEN** finalization SHALL stop before commit
- **AND** it SHALL NOT amend, squash, reset, clean, push, tag, release, deploy, or bless the drift

### Requirement: No data acquisition, activation, or operations work
This change SHALL NOT download Archive/common data, construct a complete Archive, write an actual `current.json`, activate/switch a version, mutate a producer/consumer runtime, contact production, or implement scheduler/daemon/host/release/deploy behavior. Read-only acquisition of the exact locked development tooling is the only permitted external network use.

#### Scenario: Contract candidate is accepted
- **WHEN** every schema, fixture, vector, and feasibility check passes
- **THEN** status MAY be reported as specified and contract candidate verified
- **AND** full Archive production, runtime consumption, current-pointer activation, operations, push, release, and deployment SHALL remain unimplemented and unclaimed

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

### Requirement: Manifest generated time SHALL be exact UTC and calendar-valid

`generatedAt` SHALL be ASCII
`YYYY-MM-DDTHH:mm:ssZ` or
`YYYY-MM-DDTHH:mm:ss.<fraction>Z`, where fraction contains exactly 1 through 6
digits. Year SHALL be `0001..9999`; month SHALL be `01..12`; day SHALL exist in
that Gregorian month under the standard divisible-by-4/100/400 leap rule, so
1900 is not leap and 2000 is leap; hour SHALL be `00..23`; minute and second
SHALL be `00..59`. Hour 24, minute 60, leap second 60,
normalization/rollover, an offset, lowercase `z`, whitespace, a missing
fraction, or more than six fractional digits SHALL NOT be accepted.

After fatal UTF-8 decode and strict JSON parsing, any lexical or semantic
timestamp failure SHALL produce `MANIFEST_SCHEMA_INVALID` at the manifest
schema/string stage. Source accounting, compatibility, dataVersion, path,
digest, and SQLite checks SHALL NOT run for that manifest.

#### Scenario: Canonical leap-day UTC time is supplied
- **WHEN** `generatedAt` uses year 2000 or 2024 on February 29 and has no fraction, `.1`, or `.123456` before `Z`
- **THEN** manifest-string validation SHALL accept the timestamp
- **AND** no timezone conversion, precision expansion, or normalization SHALL occur

#### Scenario: Shape matches but calendar and time are impossible
- **WHEN** `generatedAt` is `2024-13-99T25:61:61Z`, a February 29 in 1900, year `0000`, hour `24`, minute `60`, or second `60`
- **THEN** validation SHALL return `MANIFEST_SCHEMA_INVALID`
- **AND** no source-accounting or later validation stage SHALL run

#### Scenario: UTC spelling or fractional precision drifts
- **WHEN** a timestamp uses an offset, lowercase `z`, empty fractional part representing zero digits, seven fractional digits, trailing data, or surrounding whitespace
- **THEN** validation SHALL return `MANIFEST_SCHEMA_INVALID` without normalization

### Requirement: Manifest URL bounds SHALL validate and count Unicode scalar values

`archiveAssetUrl` and `commonSubjectStaffsUrl` SHALL first be decoded from fatal
UTF-8 and strict JSON strings containing only Unicode scalar values. A legal
JSON high/low surrogate pair SHALL decode to one scalar value; an isolated
high or low surrogate escape SHALL produce `MANIFEST_SCHEMA_INVALID` before
length evaluation. Go validation SHALL inspect raw JSON string escapes before
`encoding/json` can replace an isolated surrogate with U+FFFD.

Both schema properties SHALL retain their current pattern and length keywords
and SHALL declare the named format `bgmss-unicode-scalar-url-v1`. The strict
Contracts validator SHALL register and assert that format before schema
compilation; URL scalar validation MUST NOT exist only as an unbound
post-schema helper.

Validated URL text SHALL be bounded inclusively at 12 through 2048 Unicode
scalar values. UTF-8 byte count, UTF-16 code-unit count, and unvalidated
surrogate-unit count SHALL NOT decide these field bounds. The existing
exact `https://` prefix, NUL/CR/LF exclusions, and
`commonSubjectStaffsUrl` terminal `/subject_staffs.yml` rule SHALL remain in
force; this requirement SHALL NOT parse, normalize, resolve, or broaden URL
origin policy.

A raw encoding failure, fewer than 12 or more than 2048 scalar values, or another
retained shape failure SHALL return `MANIFEST_SCHEMA_INVALID` before source
accounting or any later stage.

#### Scenario: Multibyte URL is bytes-long but scalar-short
- **WHEN** `archiveAssetUrl` is `https://😀`, containing 9 scalar values and 12 UTF-8 bytes
- **THEN** validation SHALL return `MANIFEST_SCHEMA_INVALID` because the scalar length is below 12

#### Scenario: Multibyte URL is exactly the scalar maximum
- **WHEN** `archiveAssetUrl` is `https://` plus 2039 `a` characters plus `😀`, containing 2048 scalar values and 2051 UTF-8 bytes
- **THEN** manifest-string validation SHALL accept the URL
- **AND** no hidden 2048-byte or UTF-16-code-unit field cap SHALL reject it

#### Scenario: Either URL exceeds the scalar maximum
- **WHEN** an otherwise valid Archive or common URL contains 2049 scalar values
- **THEN** validation SHALL return `MANIFEST_SCHEMA_INVALID`

#### Scenario: JSON surrogate escapes are decoded strictly
- **WHEN** a URL contains one legal `\uD83D\uDE00` pair, an isolated `\uD800`, or an isolated `\uDC00`
- **THEN** the legal pair SHALL decode and count as one scalar value
- **AND** each isolated surrogate SHALL return `MANIFEST_SCHEMA_INVALID` without U+FFFD replacement

#### Scenario: Manifest bytes are not valid UTF-8
- **WHEN** malformed UTF-8 occurs in either URL's file-backed JSON bytes
- **THEN** fatal decoding SHALL fail before JSON parsing and string-length evaluation
- **AND** replacement with U+FFFD SHALL NOT create an accepted value

### Requirement: Manifest string evidence SHALL be closed and cross-language

`contracts/goldens/archive/vectors/manifest-string-semantics.json` SHALL be the
single language-neutral vector for the 25 string case ids plus one raw-byte
recipe fixed by the approved design. Each string case SHALL record its target
field, ASCII `jsonStringLiteral`, expected Unicode scalar length and UTF-8 byte
length or null for an invalid scalar sequence, and expected manifest-string
outcome. The raw-byte recipe SHALL start from the otherwise-valid minimal
manifest, retain the `archiveAssetUrl` JSON string delimiters, replace exactly
that string's payload with bytes `C3 28`, and expect
`MANIFEST_SCHEMA_INVALID` at fatal UTF-8 decode before JSON parsing.
`contracts/goldens/archive/index.json` SHALL index it exactly once as
a regular non-symlink vector with its exact digest. Starting from the accepted
31-file corrected corpus, this change SHALL produce exactly 32 indexed files;
all prior 31 golden paths and bytes SHALL remain unchanged.

The Contracts verifier SHALL consume the tracked vector through strict Node
manifest validation, one Python semantic probe, and one isolated Go semantic
probe. Every language SHALL parse the same `jsonStringLiteral`, reject isolated
surrogates before replacement, and recompute scalar/byte facts and expected
outcome from the same tracked bytes. The malformed-UTF-8 recipe SHALL be
materialized as an ephemeral byte mutation because malformed bytes cannot be
stored directly in valid JSON; all ephemeral output SHALL remain below the
declared disposable root and be absent at exit. No runtime-private persistent
copy SHALL become authority.

`implement-backend-archive-consumer` and `produce-immutable-archive` SHALL
remain blocked from final acceptance until their owning changes execute this
exact indexed vector through the real Go manifest decoder and Python manifest
finalizer respectively. The isolated Contracts Go probe SHALL NOT count as
backend runtime adaptation.

#### Scenario: Closed vector is verified in three languages
- **WHEN** Node, Python, and isolated Go read the indexed vector after fatal UTF-8 decoding
- **THEN** all 25 string case ids, the raw-byte recipe, JSON string literals, recomputed scalar/byte facts, and `VALID` or `MANIFEST_SCHEMA_INVALID` outcomes SHALL match exactly
- **AND** the two documented emoji counterexamples SHALL prove that byte count never decides acceptance

#### Scenario: Vector inventory or expected result drifts
- **WHEN** the vector is missing, unindexed, duplicated, hash-drifted, symlinked, non-regular, gains or loses a case, or any language reports a different length/outcome
- **THEN** Contracts acceptance SHALL fail before downstream handoff
- **AND** the index SHALL NOT be regenerated to bless unexplained drift

#### Scenario: Consumer or producer lacks runtime proof
- **WHEN** Contracts evidence passes but the Go consumer or Python producer has not executed the same indexed vector through its real contract boundary
- **THEN** that runtime change SHALL remain unaccepted
- **AND** this Contracts change SHALL NOT claim the missing runtime implementation

### Requirement: Pre-production hardening SHALL preserve version and dependency safety

This hardening SHALL apply only after `correct-archive-subject-semantics` is
accepted/exited and only while no formal Archive manifest v1 has been produced,
published, activated, released, or deployed. Under that precondition it SHALL
retain manifest/SQLite schema version 1, the dataVersion algorithm, existing
valid bundle bytes, and all product behavior while inserting this change
directly before consumer and producer final acceptance. Query-result work
SHALL receive the rule transitively through the consumer.

#### Scenario: Accepted pre-production baseline is present
- **WHEN** the completed correction has exited, the exact corrected 31-file baseline is sealed, and no formal/public v1 exists
- **THEN** this hardening MAY add only the declared string contract evidence without a version bump
- **AND** consumer and producer final acceptance SHALL wait for this change to exit

#### Scenario: Formal v1 or baseline drift is discovered
- **WHEN** preflight finds a formal/public/activated/released/deployed v1, correction state mismatch, protected-byte drift, or an overlapping runtime owner
- **THEN** apply SHALL stop before mutation
- **AND** a versioned or separately reconciled proposal SHALL be required rather than rewriting accepted evidence

### Requirement: Raw Archive domain codes SHALL remain lossless

The authoritative SQLite v1 SHALL store
`cast_credit.role_type` as an `INTEGER` in the exact upstream range `1..6`.
It SHALL store `subject_relation.relation_type` as the exact positive
JSON-safe upstream integer and SHALL preserve the source direction
`subject_id -> related_subject_id`. Neither producer nor contract tooling
SHALL translate either value to a text label, collapse two values, invert an
edge, or discard a valid code.

The source adapter SHALL map subject types only and totally as `1=book`,
`2=anime`, `3=music`, `4=game`, and `6=real`. Any other subject type, cast role
outside `1..6`, non-positive/unsafe relation code, or wrong JSON value type
SHALL fail the source semantic gate before a candidate is admitted.

Series membership remains a downstream predicate over raw relation facts:
under `DR-DATA-SERIES-002`, codes `2/3/4/5/6/9/10/11/12` are eligible for the
same-type undirected closure while other valid relation rows remain stored
without becoming series edges. `cast:{type}:main` selects raw role `1`; the
same type's `all` predicate includes every eligible exact role `1..6`.

#### Scenario: Complete raw domains round-trip

- **WHEN** contract evidence contains all five subject codes, all six cast
  roles, both directed codes `2` and `3`, and every distinct positive relation
  code in the locked local evidence
- **THEN** SQLite SHALL return the same integer values and source/related
  identities exactly
- **AND** no stored cast or relation value SHALL be a derived text label

#### Scenario: Main and all remain query predicates

- **WHEN** eligible exact cast rows contain role `1` and any roles `2..6`
- **THEN** main SHALL select only role `1`
- **AND** all SHALL contain every eligible exact row including role `1`

#### Scenario: A raw code is malformed or unsupported

- **WHEN** a subject type is outside `1/2/3/4/6`, a cast role is outside
  `1..6`, or a relation code is non-integral, non-positive, or outside the
  JSON-safe range
- **THEN** producer validation SHALL fail before SQLite finalization
- **AND** it SHALL NOT guess, stringify, clamp, invert, or silently omit it

### Requirement: Pre-first-snapshot correction SHALL replace every draft identity

This correction SHALL retain manifest schema version 1, SQLite schema version
1, and `bgmss-archive-data-version-v1` only after proving that no formal
Archive v1 was produced, published, activated, released, or deployed. The
changed canonical SQL SHALL propagate through the schema SQL digest,
35-object seal, dataVersion, every schema-dependent SQLite digest, manifest
digest, inert pointer identity, vector, and canonical index digest.

The canonical corpus SHALL retain exactly its existing 32-path set. Only the
regenerated corrected identities are accepted; prior draft-v1 bytes or
digests SHALL not remain as a second compatibility tuple.

#### Scenario: The unpublished draft is corrected

- **WHEN** the no-formal-v1 preflight passes and all corrected artifacts are
  regenerated in dependency order
- **THEN** every schema, object, dataVersion, SQLite, manifest, pointer, and
  index identity SHALL agree on the corrected v1
- **AND** two clean generations SHALL be byte-identical over the fixed path set

#### Scenario: A formal v1 or stale identity exists

- **WHEN** a formal/public v1 is found or any old draft schema/dataVersion
  identity remains accepted
- **THEN** in-place correction SHALL stop
- **AND** a new versioned compatibility change SHALL be required
