## Capability Boundary

| Field | Declaration |
|---|---|
| Status | investigated: complete; specified: initial checkpoint and both observed corrections approved; implemented: partial candidates retained; verified: paused-state seals, generator-pruning diagnosis, strict validation, and independent spec review complete; committed: planning/correction control history only, product not committed; pushed: no; released: no; deployed: no |
| Owner | Contracts owner / `contracts-archive-manifest`; apply, finalization, commit, and archive are delegated subagent work; main agent only amends OpenSpec and performs read-only acceptance |
| Writable paths | Exactly `contracts/schemas/archive/**` and `contracts/goldens/archive/**` |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `openspec/config.yaml`, existing root specs, all formal-development guides/decisions, Impeccable files, and oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717` |
| Deletion complement | Every path outside the two writable roots and every unenumerated pre-existing path inside them; sibling query paths are tolerated read-only state, not writable state |
| Mutable refs | Accepted initial/first-correction checkpoints are `c7f868e2861e8fea250f033c27538ecf793bacad` and `ad5bf1a0fbca06aba1f7d2cff5be66e1d726701c`. One second sealed correction may advance the branch from `ad5bf1a0fbca06aba1f7d2cff5be66e1d726701c` with exact subject `docs(openspec): approve wave 1 query codegen correction` and exactly proposal/design/spec/tasks for both changes, no product/cache/temp bytes. After main-agent acceptance, parallel apply may change only task checkboxes and no Git ref/index until the accepted combined commit |
| Consumes | `contracts-rewrite-baseline`, master plan Wave 1, backend guide §3, data guide Phases 0–1, `DR-DATA-PIPELINE-001`, `DR-DATA-SCHEMA-001`, and read-only oracle evidence |
| Produces | Strict Archive/pointer/dataVersion/index schemas, SQLite v1 DDL and compatibility matrix, deterministic digest vectors, a minimal valid Archive, invalid bundles, and contract-local verification evidence |
| Dependencies | Completed `establish-formal-rewrite-baseline`; no Python/Go runtime dependency; operationally paired but not semantically coupled with `define-shared-query-wire` |
| Deliverables | Exact design inventory under the two writable roots; complete unstaged accepted candidate; synchronized root spec and archived change in the combined Wave 1A phase commit |
| Acceptance | Strict schema and OpenSpec validation; closed fixture inventory; deterministic vector/hash checks; positive/negative SQLite checks; Python/Go generation feasibility; exact path-scoped and combined finalization seals |
| Non-goals | Full Archive, producer/consumer runtime, query/statistics/API/UI, live data fetch, actual `current.json`, activation, scheduler, migration, deployment, or legacy cleanup |
| Operations deferred | Production paths/users/permissions, nginx/systemd/Compose/timer/`flock`, pointer switching, restart/readiness rollback, retention, secrets, release, deploy, and host mutation |
| Stop/rollback conditions | Stop on branch/HEAD/index/dirty-state drift, sibling-path ambiguity, overlap, tool drift, schema/vector disagreement, nondeterminism, or out-of-bound write; preserve state and forbid reset, checkout rollback, clean, broad recursive deletion, staging/commit/archive during parallel apply, and history rewriting |

### Lifecycle control (not synchronized): Both observed corrections preserve both paused candidates

The first observed toolchain correction advanced the initial checkpoint `c7f868e2861e8fea250f033c27538ecf793bacad` to accepted HEAD `ad5bf1a0fbca06aba1f7d2cff5be66e1d726701c` with exact subject `docs(openspec): approve wave 1 archive toolchain correction` and only the eight proposal/design/delta-spec/tasks paths for both Wave 1A changes. It committed no product/cache output and authorized the reviewed `stream-json@2.1.0` override.

After apply resumed, the sibling Query Go generator exposed a distinct endpoint-free default-pruning defect. Both owners SHALL be stopped at a second recovery boundary before the corrected Query generator runs. HEAD SHALL be exactly `ad5bf1a0fbca06aba1f7d2cff5be66e1d726701c`, the index SHALL be empty, Archive tasks 1.1–1.4 and 2.1–2.4 SHALL be its only checked tasks, and `contracts/goldens/archive` SHALL remain absent.

For the two Archive roots, a regular-file seal means SHA-256 over the textual `shasum -a 256` lines from `LC_ALL=C` NUL-path-sorted files. Excluding `node_modules/**`, `.cache/**`, and `.tmp/**`, exactly 11 regular files SHALL seal to `070e38ecc0a91750ffc0e98900f50f0987c26d775a85aa137d39c540c21df427`; including all retained cache/temp state, exactly 6,181 regular files SHALL seal to `5b8b8801d5b672d5ffc643483d04c3c3fa239ac45015820640843520bdd71629`. Exactly 13 symlinks SHALL produce a `LC_ALL=C` path-sorted `path<TAB>readlink-target<LF>` stream sealing to `8721691feb55259ac161846b32d87fce8e2fc9a4a21ffb551e8b3459f183f7ea`.

The Query sibling SHALL have tasks 1.1–1.3 alone checked; its 23 persistent/all-13,025 regular-file seals SHALL be `2a2483d6b91d5b764db1e6c722137fd707f5b79f8a3310b20285a291b9a5779f` and `84c216d846b03990ce5f7ba50fd006045df32d513fa6dcb3e15e6ba402720cf6`, and its seven-symlink seal SHALL be `4aa5af9e55948f608d1ef3d7f06ca5d76775946c2638deef2db7276d264fbfae` under the same formulas.

The second correction subagent SHALL stage exactly the same eight OpenSpec artifact paths, no `contracts/**`/cache/temp path, and SHALL create only a commit whose sole parent is `ad5bf1a0fbca06aba1f7d2cff5be66e1d726701c` and exact subject is `docs(openspec): approve wave 1 query codegen correction`. It SHALL run no product-writing command. Apply SHALL remain stopped until the main agent accepts the replacement HEAD and re-proves all counts, seals, and checked sets.

#### Scenario: Query correction does not absorb implementation output

- **WHEN** the second correction subagent creates the approved eight-path commit
- **THEN** no Archive or Query product/cache/temp byte SHALL be staged or committed and every second-boundary count, seal, and checkbox set SHALL remain exact

#### Scenario: Archive apply resumes after the sibling correction

- **WHEN** the main agent accepts the second correction commit and both unchanged candidates
- **THEN** the original Archive owner SHALL preserve and revalidate its existing files, re-snapshot the new checkpoint, and continue from task 2.5 without redoing or claiming already checked work

## ADDED Requirements

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

The DDL SHALL define stable primary/foreign/check constraints and named lookup indexes including the backend-guide §3.2 access paths equivalent to:

```text
staff_credit(subject_type, position_id, person_id, subject_id)
cast_credit(subject_type, role_type, person_id, subject_id)
cast_credit(subject_type, person_id, subject_id, character_id)
staff_set_member(set_key, position_id)
```

`staff_position` SHALL contain only positions actually defined by the pinned common catalog. `staff_credit` SHALL constrain its subject/person identities but SHALL preserve a syntactically valid raw position ID even when no matching `staff_position` exists; it MUST NOT require or create a fabricated placeholder catalog row. Unknown-position credits SHALL be non-selectable, counted in source `unresolved` and `UNKNOWN_STAFF_POSITION` quality evidence, and covered by the minimal valid sentinel.

The DDL SHALL also define the subject/relation/tag/catalog lookup indexes needed by the fixed minimal sentinel queries. It MUST NOT contain collection records, query results, sessions, cache state, activation state, fabricated catalog labels, or inferred cast provenance.

#### Scenario: Minimal valid SQLite is inspected
- **WHEN** the golden database is opened read-only/no-create
- **THEN** its application/user versions, embedded metadata, required tables, constraints, named indexes, foreign-key check, integrity check, table counts, and fixed sentinel queries SHALL all match the manifest and compatibility matrix
- **AND** its unknown-position raw credit remains queryable as raw evidence while no selectable/catalog placeholder exists

#### Scenario: Core raw object or index is absent
- **WHEN** a fixture omits one required raw/catalog table or one named §3.2 index
- **THEN** it SHALL fail as `SQLITE_REQUIRED_OBJECT_MISSING`
- **AND** a later producer/consumer change MUST NOT silently create a private replacement

#### Scenario: Later work needs a semantic schema change
- **WHEN** a later capability needs to remove/reinterpret a v1 column, constraint, table, or identity
- **THEN** it SHALL propose a new Archive contract version and compatibility tuple
- **AND** it MUST NOT reinterpret SQLite v1 in place

### Requirement: Compatibility is explicit and fail closed
`compatibility-matrix.json` SHALL declare the only initial supported tuple `(pointerSchemaVersion=1, manifestSchemaVersion=1, sqliteSchemaVersion=1, dataVersionAlgorithm=bgmss-archive-data-version-v1)`, the required SQLite objects/indexes, and stable validation precedence. Unknown higher/lower versions, unknown algorithms, and version disagreement among pointer, manifest, directory identity, SQLite pragmas, and embedded metadata SHALL be incompatible; no optimistic fallback is allowed.

Validation SHALL stop at the first applicable stage in this order: JSON parse/schema; source identity/accounting semantics; compatibility; dataVersion recomputation; derived identity/path agreement; file type/containment/size; SQLite byte digest; SQLite format/read-only open; pragma/embedded metadata; required objects/sentinel; table-count agreement.

#### Scenario: Supported tuple agrees everywhere
- **WHEN** pointer, directory identity, manifest, SQLite pragmas, embedded metadata, and compatibility matrix all identify the initial tuple and same dataVersion
- **THEN** compatibility validation SHALL pass to the next gate

#### Scenario: Unknown or disagreeing version is supplied
- **WHEN** any version/algorithm is unsupported or the identities disagree
- **THEN** validation SHALL stop as `ARCHIVE_VERSION_UNSUPPORTED` or `SQLITE_DATA_VERSION_MISMATCH` according to the fixed precedence
- **AND** it SHALL NOT treat a numerically newer version as compatible

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
The only persistent tooling files SHALL be the four individually approved design paths. `ajv@8.20.0` and `quicktype@26.0.0` SHALL be the only direct development dependencies, with a committed lockfile and install scripts disabled. Because quicktype 26 declares Node `>=20.19.0` while its exact `stream-json@3.5.0` edge requires Node `>=22`, `package.json` SHALL use the exact npm override `stream-json: 2.1.0`. That BSD-3-Clause transitive compatibility pin SHALL have no direct application import. `npm ls quicktype stream-json` SHALL resolve exactly quicktype `26.0.0` and stream-json `2.1.0`, with no installed `3.5.0`; the used `parser.asStream` export SHALL be callable. The package and acceptance gate SHALL enforce `node >=20.19.0` and `npm >=10`, and all remaining npm engine mismatches SHALL fail rather than warn. Ajv SHALL compile/validate the schemas and fixtures in strict JSON Schema 2020-12 mode. Quicktype SHALL generate temporary Python and Go models from the authoritative schemas without schema-level error; the Python output SHALL pass syntax compilation and the Go output SHALL pass formatting and an isolated compile smoke using the available development toolchain. Install success without both language smokes SHALL fail. This feasibility smoke SHALL NOT require a bootstrapped updater/backend application or make generated files authoritative.

All configurable npm cache, Go build/module/workspace cache, installed packages, Python bytecode, SQLite-build scratch, process temporary files, and generated models SHALL stay below canonical non-symlink descendants `contracts/schemas/archive/.cache/**`, `contracts/schemas/archive/tooling/node_modules/**`, or `contracts/schemas/archive/.tmp/**`. Apply SHALL verify the effective npm cache, `GOCACHE`, `GOMODCACHE`, `GOPATH`, and `TMPDIR` under those roots; use `GOENV=off`, `GOWORK=off`, `GOTOOLCHAIN=local`, and npm engine-strict mode; and disable Python bytecode writes. Before any ordinary Go process starts, apply SHALL invoke the absolute Go executable's `go env GOTELEMETRY GOTELEMETRYDIR` inside a bootstrap macOS `sandbox-exec` profile combining `(allow default)`, `(deny network*)`, and `(deny file-write*)`, with the same three Go controls. This discovery process cannot write telemetry or start an uploader. Apply SHALL stop on upload-enabled or unknown returned mode, then canonicalize and byte-seal the returned directory. With `local` mode, every later Go-starting command SHALL run through a reviewed profile denying `file-write*` beneath that directory; with `off`, that later wrapper is unnecessary. Apply SHALL verify the seal after all Go work without interpreting/deleting counters, changing global mode, or authorizing upload. The owned ephemeral roots SHALL be removed by exact validated targets after verification and SHALL be absent from the final physical/index inventory.

#### Scenario: Pinned tools verify the contract
- **WHEN** the exact lock installs with scripts disabled and local cache routing
- **THEN** the exact quicktype/stream-json resolution and parser export gate SHALL pass
- **AND** strict schema, vector, SQLite, Python-generation, and Go-generation checks SHALL pass without writing outside the Archive writable root

#### Scenario: Tool or temporary output drifts
- **WHEN** the lock cannot install exactly, a tool version differs, generated code fails syntax/compile smoke, a global/home/system-temp write is required, or an ephemeral root remains
- **THEN** apply SHALL stop
- **AND** it SHALL NOT switch versions, commit generated models, or accept the candidate

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
```

It SHALL write only its own `tasks.md`, `contracts/schemas/archive/**`, and `contracts/goldens/archive/**`; SHALL never stage, commit, archive, or mutate a Git ref while the sibling runs; and SHALL scope all status/diff/check/inventory commands to its own paths plus a read-only exact-union guard. The index MUST remain empty.

#### Scenario: Both agents start clean and remain disjoint
- **WHEN** both apply agents observe the same approved HEAD, empty index, clean initial worktree, non-overlapping path sets, and valid seals
- **THEN** each MAY create its own unstaged candidate in parallel
- **AND** sibling changes under the exact allowance SHALL not be mistaken for this owner’s output

#### Scenario: Unexpected dirty path or index entry appears
- **WHEN** any changed/untracked/ignored path falls outside the two exact owner sets, either set overlaps, the sibling baseline cannot be identified, or the index becomes non-empty
- **THEN** this apply SHALL stop without staging, restoring, deleting, or rewriting either candidate

#### Scenario: One apply candidate becomes ready first
- **WHEN** the Archive candidate passes its path-scoped tests while the query agent is still running
- **THEN** the Archive agent SHALL stop and report its exact inventory/hashes/results
- **AND** it SHALL NOT commit, archive, or wait by mutating the sibling’s state

### Requirement: One finalization subagent creates the Wave 1A commit
Only after both apply agents have stopped and the main agent has independently accepted both unstaged candidates may one delegated finalization subagent stage or archive. It SHALL re-prove the common planning HEAD, empty index, exact combined path union, no extra dirty/ignored path, both candidate hashes, and both strict validation results; archive `define-archive-manifest-contract` and `define-shared-query-wire`; verify the two synchronized root specs and exact archive path delta; stage no path outside the reviewed combined apply/archive union; stop for final main-agent read-only acceptance; and then create exactly one commit with subject `feat(contracts): establish wave 1 shared contracts`.

#### Scenario: Both accepted candidates finalize exactly
- **WHEN** both candidate seals still match and archive output contains only the two expected archived changes/root specs plus their accepted contract paths
- **THEN** the same finalization subagent MAY create the single exact-subject phase commit after final acceptance
- **AND** the resulting worktree/index SHALL be clean

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
