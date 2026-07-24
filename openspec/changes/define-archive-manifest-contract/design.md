## Context

This is the first Archive-specific change after the clean-room baseline. Python and Go do not yet exist in the new tree, so the contract must be complete enough to bootstrap both runtimes without making either runtime the source of truth.

The fixed oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717` is read-only evidence, not an architecture template. In that tree:

- `backend/scripts/fetch_latest_jsonlines.py` polls `Archive/master/aux/latest.json`, deletes old JSONLines before extraction, and then runs a mutable database update;
- `backend/scripts/update_database.py` treats equal row counts as “up to date” and performs MySQL upserts that do not remove deleted upstream facts;
- `backend/init-sql/schema.sql` is a MySQL dump without an Archive schema identity, dataVersion, input digests, or manifest;
- `backend/Dockerfile.loader` and `backend/docker-compose.yml` embed a resident loader, MySQL, and Redis lifecycle.

The accepted target is different: Python will later produce a new immutable SQLite snapshot in staging; Go will later consume one snapshot read-only; activation remains an operations concern. This change only establishes their language-neutral contract and minimum evidence.

### Change boundary

| Field | Boundary |
|---|---|
| Status | Proposed and planning-complete only after all artifacts pass strict validation; apply remains blocked until explicit main-agent approval |
| Owner | Contracts owner / `contracts-archive-manifest`; delegated subagents perform apply, commits, and archive; main agent amends OpenSpec only and performs read-only acceptance |
| Writable paths | Exactly `contracts/schemas/archive/**` and `contracts/goldens/archive/**` |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `openspec/config.yaml`, root capability specs, all `tmp-formal-development/**` guidance/decisions, Impeccable files, and all oracle paths at `644b7748674e553f863d0ffd61d029f86fdc0717` |
| Deletion complement | All paths outside the two writable subtrees, plus any unenumerated pre-existing file inside them; sibling query paths may be observed as exact tolerated dirty state but are never writable by this owner |
| Mutable refs | Before apply, one delegated checkpoint subagent may advance `refs/heads/codex/formal-rewrite` once from parent `e5d67d7d74614b7a95da4a7887caa8e1f25bc307` with subject `docs(openspec): approve wave 1 shared contracts` and only the two approved Wave 1A change directories. During parallel apply, only this change’s `tasks.md` checkbox transitions may change; index and Git refs remain immutable. After both accepted candidates stop, one finalization subagent alone may create the combined phase commit on that branch |
| Consumes | `contracts-rewrite-baseline`; master plan Wave 1; backend guide §3; data guide Phases 0–1; `DR-DATA-PIPELINE-001`; `DR-DATA-SCHEMA-001`; read-only oracle evidence |
| Produces | Archive JSON Schemas, SQLite v1 DDL/identity, compatibility matrix, dataVersion/digest contract, valid/invalid goldens, verification tooling, generation-feasibility evidence |
| Dependencies | Completed `establish-formal-rewrite-baseline`; no semantic dependency on the sibling query change or on Python/Go runtimes; operationally paired with `define-shared-query-wire` in Wave 1A |
| Deliverables | The exact file inventory below as an unstaged accepted candidate; after both Wave 1A candidates pass, one finalization subagent archives both and creates one exact combined phase commit |
| Acceptance | Strict schema compilation; closed fixture index; positive/negative JSON and SQLite cases; deterministic digest vectors; path-safety negatives; temporary Go/Python generation smoke; exact-path diff and clean checks |
| Non-goals | Runtime producer/consumer, full Archive, data download, real `current.json`, activation, query/domain/API/UI implementation |
| Operations deferred | Production paths/users/permissions, timers, `flock`, current switching, restart/readiness rollback, retention, secrets, releases, deployment, host mutation |
| Stop/rollback conditions | Stop on branch/HEAD/index drift, dirty state outside the exact sibling allowance, path overlap, sibling-snapshot ambiguity, tool lock drift, schema/vector disagreement, nondeterminism, or out-of-bound write; preserve state and never stage/commit/archive during parallel apply or reset/clean/history-rewrite |

Dependency direction is one-way:

```text
contracts-rewrite-baseline
  -> contracts-archive-manifest
      -> updater-runtime-foundation
      -> backend-runtime-foundation
      -> backend-archive-consumer
      -> updater-archive-producer
```

The contract does not import generated Python or Go code and does not depend on either consumer. Later runtimes consume the schemas and goldens through their own capability changes.

`define-shared-query-wire` is a Wave 1A execution sibling, not a semantic dependency. Its exact tolerated paths are:

```text
openspec/changes/define-shared-query-wire/tasks.md
contracts/openapi/**
contracts/schemas/query/**
contracts/goldens/query/**
```

This Archive owner records the sibling paths and hashes at the common clean planning checkpoint, never writes or stages them, and scopes every diff/test/inventory command to its own change. The sibling agent applies the inverse rule to this change’s `tasks.md`, `contracts/schemas/archive/**`, and `contracts/goldens/archive/**`.

## Goals / Non-Goals

**Goals:**

- Establish one strict, versioned, language-neutral Archive manifest and pointer shape.
- Make `dataVersion` deterministic from semantic inputs without a digest cycle or timestamp dependence.
- Make the exact SQLite bytes, manifest bytes, embedded metadata, directory identity, and compatibility pair independently checkable.
- Remove attacker-controlled local paths from the pointer/manifest contract and supply negative vectors for traversal and identity mismatches.
- Track one minimal valid Archive plus enough corrupt/incompatible fixtures to drive later producer and consumer contract tests.
- Prove today that the JSON Schemas are accepted as Python/Go model-generation inputs without committing generated runtime models.

**Non-Goals:**

- Downloading GitHub `bangumi/Archive` or `bangumi/common` content.
- Creating a complete Archive, a producer package, a Go store, or API readiness logic.
- Creating or switching an actual `current.json`; golden pointer documents are inert test data and are deliberately named `current-pointer.json`.
- Defining production activation, retention, rollback, scheduling, filesystem ownership, or host layout.
- Freezing every future query-domain column forever. Schema changes require an explicit compatibility change and version increment; they are never inferred as forward-compatible.

## Decisions

### 1. Exact contract inventory and ownership

Apply creates only this inventory:

```text
contracts/schemas/archive/
  README.md
  archive-manifest.schema.json
  current-pointer.schema.json
  data-version-input.schema.json
  fixture-index.schema.json
  compatibility-matrix.json
  schema.sql
  tooling/
    package.json
    package-lock.json
    verify.mjs
    build_sqlite_fixtures.py

contracts/goldens/archive/
  index.json
  vectors/data-version.json
  valid/minimal/
    archive-manifest.json
    current-pointer.json
    bangumi.sqlite
  invalid/json/
    manifest-unknown-field.json
    manifest-bad-digest.json
    manifest-unsafe-sqlite-file.json
    manifest-source-accounting-mismatch.json
    pointer-unknown-field.json
    pointer-unsafe-data-version.json
  invalid/bundles/
    manifest-data-version-mismatch/{archive-manifest.json,current-pointer.json,bangumi.sqlite}
    sqlite-digest-mismatch/{archive-manifest.json,current-pointer.json,bangumi.sqlite}
    sqlite-corrupt/{archive-manifest.json,current-pointer.json,bangumi.sqlite}
    sqlite-unsupported-schema/{archive-manifest.json,current-pointer.json,bangumi.sqlite}
    sqlite-data-version-mismatch/{archive-manifest.json,current-pointer.json,bangumi.sqlite}
    sqlite-required-index-missing/{archive-manifest.json,current-pointer.json,bangumi.sqlite}
    sqlite-table-count-mismatch/{archive-manifest.json,current-pointer.json,bangumi.sqlite}
```

`index.json` is a closed-world manifest: every file below `contracts/goldens/archive/` other than the index itself is listed exactly once with SHA-256, case membership, and expected outcome. The verifier rejects missing, extra, duplicate, symlink, non-regular, or hash-drifted entries.

Alternative considered: scatter fixtures beside future Python and Go tests. Rejected because that would create two authorities and make cross-language drift invisible.

### 2. Version identifiers and strict compatibility

The initial identifiers are:

- pointer schema version `1`;
- Archive manifest schema version `1`;
- SQLite `PRAGMA application_id = 1111969107` (`0x42474d53`, ASCII `BGMS`);
- SQLite `PRAGMA user_version = 1`;
- dataVersion algorithm id `bgmss-archive-data-version-v1`;
- dataVersion lexical form `dv1-` followed by exactly 64 lowercase hexadecimal characters.

`compatibility-matrix.json` lists the only supported initial tuple `(pointer=1, manifest=1, sqlite=1, algorithm=bgmss-archive-data-version-v1)`, the required SQLite objects/indexes, and the stable validation precedence. Unknown lower or higher versions are rejected; there is no optimistic forward compatibility.

Alternative considered: semantic-version ranges. Rejected because schema and validation behavior are discrete compatibility facts, and accepting an unknown minor version would defeat strict consumer startup gates.

### 3. SQLite v1 is an immutable, self-identifying read model

`schema.sql` is the authoritative SQLite DDL. It uses UTF-8/LF/single-final-LF bytes, enables foreign keys during construction, sets the fixed application/user versions, and defines:

- `archive_meta` with the exact dataVersion, schema/manifest versions, domain/cast rule versions, and catalog-config digest embedded in the database;
- normalized subject, score-bucket, public/meta tag, person/career, character, and same-source relation facts required by the development guide;
- exact common staff positions and categories;
- exact `staff_credit` and exact-only eligible `cast_credit` with source identity/provenance;
- dormant `staff_set` and membership tables;
- catalog/group/capability/selection-rule read-model tables required so later Go code does not need an unversioned side configuration;
- explicit primary/foreign/check constraints and the lookup indexes named by backend guide §3.2.

`staff_position` contains only exact entries from the pinned common catalog. `staff_credit` preserves every syntactically valid raw `(subject_type, subject_id, person_id, position_id)` fact even when `(subject_type, position_id)` is absent from `staff_position`; therefore its subject/person references are constrained but unknown position IDs do not require a fabricated catalog foreign-key row. Unknown-position credits are not selectable, are counted as unresolved, and are exposed only through quality/accounting evidence until a later common version defines them.

The minimal fixture contains a deliberately tiny internally consistent anime universe, not production or user data. It uses common commit `6a8442c17143a870357a5ff812362e8b5cfe9f9d`, includes one preserved unknown-position raw credit with no invented catalog label, and has enough rows to prove foreign keys, staff/cast facts, unresolved reporting, metadata, required tables/indexes, and fixed sentinel queries. `tableCounts` in the manifest covers every required data table and must equal the fixture.

Alternative considered: a metadata-only SQLite fixture with domain tables deferred. Rejected because the Wave 2 consumer must validate required objects before the full producer exists, and later catalog/domain changes must not silently redefine SQLite v1.

### 4. The manifest is strict and non-self-referential

`archive-manifest.schema.json` uses JSON Schema 2020-12, `additionalProperties: false` at every object, bounded strings/arrays, JSON-safe integers (non-negative for sizes/counts), exact digest patterns, and unique source identities. It requires:

- manifest and SQLite schema versions;
- dataVersion algorithm and dataVersion;
- generator version and UTC `generatedAt`;
- Archive release/asset URL/name/size/digest;
- exact `bangumi/common` commit plus `subject_staffs.yml` size/digest;
- schema SQL digest, catalog-config digest, domain-rules version, and cast-rules version;
- exactly one entry for each Archive basename `subject.jsonlines`, `person.jsonlines`, `character.jsonlines`, `subject-persons.jsonlines`, `subject-characters.jsonlines`, `person-characters.jsonlines`, and `subject-relations.jsonlines`, with size/digest and record accounting;
- complete table counts and bounded quality summary including `NO_CHARACTERS`, `NO_CAST_RELATIONS`, `FILTERED_BY_VALID_CV`, and `UNKNOWN_STAFF_POSITION`;
- fixed `sqliteFile: "bangumi.sqlite"`, SQLite byte size, and byte digest.

Each source entry has non-negative JSON-safe integers `recordsTotal`, `imported`, `duplicate`, `invalid`, and `unresolved`. The four outcome classes are mutually exclusive per source record and MUST satisfy `recordsTotal = imported + duplicate + invalid + unresolved`; an unresolved record may still materialize a preserved raw fact but cannot become a fabricated resolved/catalog entity. The array has exactly seven entries and each required basename appears exactly once. The minimal golden fixes `commonCommit` to `6a8442c17143a870357a5ff812362e8b5cfe9f9d`; production manifests still record the exact commit resolved for that build.

The digest graph is acyclic and normative:

```text
semantic canonical inputs -> dataVersion
final SQLite bytes (which embed dataVersion) -> sqliteDigest
manifest bytes (which include dataVersion + sqliteDigest, but no manifestDigest) -> manifestDigest
current-pointer / outer fixture index -> manifestDigest
```

The manifest never contains `manifestDigest`; the pointer/index never changes dataVersion or SQLite bytes; no digest hashes a document that contains itself. `generatedAt`, generator version, table counts, quality counts, SQLite bytes/digest, and manifest byte digest are provenance/packaging facts and do not enter dataVersion.

Alternative considered: include every manifest field in dataVersion. Rejected because generated time and SQLite/manifest hashes would make logically identical inputs drift and would create a construction cycle.

### 5. `dataVersion` uses a fixed LF-delimited preimage

The authoritative input is validated by `data-version-input.schema.json`. Every variable value is restricted to a bounded ASCII token or a fixed digest/commit form, so delimiters cannot be injected.

The canonical UTF-8 preimage is exactly these lines in this order, with one final LF:

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

The dataVersion is `dv1-` plus lowercase hexadecimal SHA-256 of those exact bytes. The vector file records input, exact preimage text, exact preimage byte length, and expected output. It includes stability, one-field mutation, input-order independence at the object boundary, and catalog-member reorder equivalence after that catalog’s own canonical digest.

Alternative considered: general JSON canonicalization/RFC 8785. Rejected for this small input because a fixed ordered line preimage is easier to implement identically with Python and Go and avoids adding a runtime canonicalization dependency.

### 6. Digest meanings are distinct

Every digest string uses `sha256:<64 lowercase hex>`.

- `archiveDigest` hashes exact downloaded release-asset bytes.
- `commonDigest` hashes exact `subject_staffs.yml` bytes at the recorded commit.
- each `sourceFiles[].digest` hashes exact extracted file bytes.
- `schemaSqlDigest` hashes the tracked canonical `schema.sql` bytes.
- `catalogConfigDigest` hashes the separately canonicalized catalog configuration.
- `sqliteDigest` hashes exact SQLite file bytes after finalization.
- `manifestDigest` in the pointer hashes exact manifest file bytes.
- `index.json` hashes every golden file except itself.

The verifier recomputes all locally available hashes. It does not contact any upstream service.

### 7. Pointer and path safety are structural, not cleanup rules

`current-pointer.schema.json` contains only `pointerSchemaVersion`, `dataVersion`, and `manifestDigest`; it contains no directory, filename, URL, or arbitrary path. A later consumer derives:

```text
<approved-root>/versions/<validated-dataVersion>/manifest.json
<approved-root>/versions/<validated-dataVersion>/bangumi.sqlite
```

The manifest’s only local filename is the constant `bangumi.sqlite`. Source identities are enumerated basenames used as provenance, not consumer-opened local paths. The contract forbids slash/backslash/NUL/percent-encoded path syntax, absolute paths, drive prefixes, URI schemes, `.`/`..`, and unknown path fields. Later consumers/producers must additionally prove resolved containment and regular non-symlink files; the vectors reserve stable failures for these checks.

Alternative considered: store relative manifest/SQLite paths in `current.json`. Rejected because no runtime flexibility is needed and attacker-controlled path parsing would add traversal and symlink risk.

### 8. Validation order and language-neutral errors are fixed

Each indexed case names one expected stable result. Validation precedence is:

1. JSON parse and strict schema;
2. source identity/accounting semantic invariants;
3. compatibility tuple;
4. dataVersion recomputation;
5. derived identity/path checks and pointer/manifest/directory agreement;
6. regular-file, non-symlink, containment, size, and existence checks;
7. SQLite byte digest;
8. SQLite format and read-only/no-create open;
9. application/user version and embedded metadata agreement;
10. required table/index/constraint and sentinel checks;
11. manifest table-count agreement.

The initial negative set covers `MANIFEST_SCHEMA_INVALID`, `MANIFEST_ACCOUNTING_INVALID`, `POINTER_SCHEMA_INVALID`, `ARCHIVE_VERSION_UNSUPPORTED`, `DATA_VERSION_MISMATCH`, `SQLITE_DIGEST_MISMATCH`, `SQLITE_FORMAT_INVALID`, `SQLITE_DATA_VERSION_MISMATCH`, `SQLITE_REQUIRED_OBJECT_MISSING`, and final-stage `SQLITE_TABLE_COUNT_MISMATCH`. The table-count bundle keeps schema, accounting, compatibility, dataVersion, pointer/manifest identity, file size/digest, SQLite format/metadata, required objects, and sentinel queries valid, then changes one manifest table count so it reaches only the last gate. Runtime-specific error wrapping belongs to later changes, but Python and Go contract tests must preserve these case identities.

### 9. Development-only tooling is pinned and contract-local

The only additional tooling files are individually authorized:

| File | Purpose |
|---|---|
| `contracts/schemas/archive/tooling/package.json` | Declares only exact dev dependencies and verification commands |
| `contracts/schemas/archive/tooling/package-lock.json` | Locks the complete transitive tool graph |
| `contracts/schemas/archive/tooling/verify.mjs` | Compiles schemas with Ajv, validates the closed fixture index, recomputes digests/dataVersion, and invokes generation smoke only below the Archive writable root |
| `contracts/schemas/archive/tooling/build_sqlite_fixtures.py` | Uses Python stdlib `sqlite3` to build deterministic tiny positive/negative SQLite fixtures and inspect logical equality |

Libraries:

| Library | Purpose | Alternatives considered | Owner/cost | Enforceable gate |
|---|---|---|---|---|
| `ajv@8.20.0` | Strict JSON Schema 2020-12 compilation/fixture validation | Handwritten field checks; `jsonschema` Python package | Contracts-only dev dependency; zero API/frontend/runtime bundle; lockfile/supply-chain cost | Exact version in package + lock; `npm ci --ignore-scripts`; strict compilation; all indexed fixtures checked |
| `quicktype@26.0.0` | Temporary Go/Python model-generation feasibility | Handwritten models; defer codegen proof | Contracts-only dev dependency requiring Node `>=20.19`; zero committed generated/runtime code; larger dev-only transitive tree | Exact version/lock; repository-local npm cache; `npm ci --ignore-scripts`; generate only below `contracts/schemas/archive/.tmp/**`; Python syntax and Go format/compile smoke; no generated file remains in repo |

Python fixture construction uses only the standard library. The tooling package and acceptance gate require `node >=20.19.0` and `npm >=10`, with npm engine mismatches treated as errors. All configurable npm cache, Go build/module/workspace cache, installed packages, Python bytecode, fixture-build scratch, process temporary files, and generated Go/Python smoke output MUST stay below `contracts/schemas/archive/.cache/**`, `contracts/schemas/archive/tooling/node_modules/**`, or `contracts/schemas/archive/.tmp/**`. Apply verifies the effective npm cache, `GOCACHE`, `GOMODCACHE`, `GOPATH`, and `TMPDIR`; sets `GOENV=off`, `GOWORK=off`, and `GOTOOLCHAIN=local`; disables Python bytecode writes; and sets npm engine-strict mode. Because even `go env` may initialize telemetry, the first Go process is the absolute executable's telemetry discovery command inside a bootstrap macOS `sandbox-exec` profile with `(allow default)`, `(deny network*)`, and `(deny file-write*)`, plus the same three Go environment controls. Upload-enabled/unknown mode fails closed before any unsandboxed Go process. Apply then canonicalizes and byte-seals the returned telemetry directory. With `local` mode, every later Go-starting command runs through a reviewed profile denying `file-write*` beneath that directory; with `off`, the later wrapper is unnecessary. Apply verifies the seal after all Go work without interpreting/deleting counters, changing global mode, or authorizing upload. The three owned ephemeral roots are verified as canonical, non-symlink descendants before use, removed with exact targets after verification, and forbidden by the final inventory/fixture index. No configurable tool cache/temp or inherited Go workspace may resolve to a global cache, system temp, home directory, another owner’s path, backend/updater directories, or the repository root, and the telemetry seal must remain unchanged.

Neither dependency enters backend, updater, frontend, production images, or runtime manifests. If the pinned versions cannot install from the lock or their generated outputs fail, apply stops; it does not switch versions opportunistically.

### 10. Wave 1A uses paired parallel apply and one serialized finalization

After the main agent approves both exact change directories, one delegated checkpoint subagent stages only those directories, validates the cached delta, and creates one clean planning checkpoint; the main agent verifies that commit read-only. The checkpoint contains:

```text
openspec/changes/define-archive-manifest-contract/**
openspec/changes/define-shared-query-wire/**
```

At that checkpoint, the branch is `codex/formal-rewrite`, `HEAD` is supplied exactly in the handoff, `git diff --cached --name-only` is empty, and there is no worktree/untracked/ignored state outside the two committed planning directories. Both apply agents start from this same checkpoint.

During parallel apply:

1. the Archive agent snapshots the sibling change directory and exact sibling task/apply path set before its first write;
2. it may tolerate ongoing sibling changes only under `openspec/changes/define-shared-query-wire/tasks.md`, `contracts/openapi/**`, `contracts/schemas/query/**`, and `contracts/goldens/query/**`;
3. it writes only its own task checkboxes and the two Archive contract roots, never reads sibling output as an input, never restores/rewrites sibling bytes, and uses path-scoped `git diff`, `git diff --check`, inventory, and verification commands;
4. the index must remain empty. Neither apply agent may stage, commit, archive, move an active change, or mutate a Git ref while the sibling runs;
5. after its full candidate is ready, each apply agent stops and reports its exact path inventory/hashes/tests. The main agent reviews each candidate read-only while both remain unstaged.

Only after both candidates have independently passed main-agent acceptance and both apply agents are stopped may one delegated finalization subagent:

1. re-prove the common planning `HEAD`, empty index, exact union of the two accepted candidate path sets, and both acceptance seals;
2. stage only that exact combined union;
3. run the OpenSpec archive workflow for `define-archive-manifest-contract` and `define-shared-query-wire`, with no other active change;
4. re-run strict validation, combined path/hash seals, and cached diff checks;
5. stop with the exact staged archive/root-spec/product candidate and wait for final main-agent read-only acceptance;
6. only after that acceptance, create the single Wave 1A phase commit with the exact reviewed subject recorded in the finalization handoff.

The finalization subagent must fail closed on any extra path, missing file, changed accepted byte, archive output drift, or non-empty unexpected index. No apply/finalization agent amends, squashes, pushes, tags, releases, or deploys.

## Risks / Trade-offs

- [The initial SQLite schema may be too narrow for later domain work] → v1 includes the raw facts and catalog read model already required by the approved backend/data guides; any later semantic schema change requires an explicit contract change and compatibility increment.
- [Binary SQLite bytes can vary if rebuilt by a different SQLite library] → the committed binary and its byte hash are authoritative goldens; the builder additionally compares logical schema/data and records the local SQLite library version, while dataVersion remains independent of SQLite bytes.
- [A manifest can be schema-valid but semantically inconsistent] → indexed semantic negatives and the fixed validation order cover cross-file/version/digest/count agreement after JSON Schema validation.
- [Tool downloads introduce supply-chain and availability cost] → exact versions and lockfile, `--ignore-scripts`, dev-only ownership, no runtime inclusion, and fail-closed behavior; no unreviewed fallback version.
- [One pointer schema could be mistaken for permission to activate] → no file named `current.json` is produced, all pointer documents live under goldens, and activation is explicitly deferred.
- [Concurrent agents share one worktree] → both start from one clean committed planning checkpoint; each snapshots the other’s exact non-overlapping allowance, all checks are path-scoped, the index stays empty, and only one finalization subagent stages/archives/commits after both agents stop and both candidates are accepted.

## Migration Plan

This change has no production migration. Repository development proceeds in reviewed checkpoints:

1. approve both Wave 1A OpenSpec changes; one delegated checkpoint subagent creates their common clean planning commit and the main agent verifies it read-only;
2. apply Archive and query candidates in parallel on disjoint paths with an empty index and no commits;
3. run independent candidate acceptance;
4. have one finalization subagent stage the exact union and archive both changes, stop for combined staged-candidate main-agent acceptance, and only then create the single Wave 1A phase commit;
5. hand the immutable Archive schemas/goldens to `bootstrap-updater-runtime` and `bootstrap-backend-runtime`.

Before the combined phase commit, rollback means removing only this subagent’s uncommitted files with an exact reviewed patch while preserving the sibling candidate. After the combined commit, fixes use a new reviewed commit. No reset, checkout rollback, clean, rebase, amend, activation, or external state change is authorized.

## Open Questions

None. Later changes may add supported compatibility tuples only through a new reviewed contract delta; they must not reinterpret v1.
