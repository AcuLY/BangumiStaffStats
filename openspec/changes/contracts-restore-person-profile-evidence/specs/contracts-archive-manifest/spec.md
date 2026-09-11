## Capability Boundary

| Field | Boundary |
|---|---|
| Status | INTENTIONAL_DELTA; SQLite v2 profile evidence, apply blocked until primary review and strict-valid complete planning |
| Owner | Contracts owns canonical schemas, golden semantics and generated identities; Backend owns production writer/reader; primary owns integration and acceptance |
| Writable paths | `contracts/schemas/archive/{schema.sql,compatibility-matrix.json,README.md,tooling/build_sqlite_fixtures.py,tooling/verify.mjs}` and generated `backend/internal/archivebuild/assets/schema.sql`; derived fixture bindings are owned by the sibling contracts-archive-goldens delta; this delta spec; its root capability during primary-owned sync only |
| Read-only protected inputs | PRODUCT.md, accepted data decisions and guides, original official dump, all existing real Archive versions and pointers, query/statistics/API contracts, unrelated dirty work, live/production resources |
| Deletion complement | Replace only the reviewed v1-derived contract identities and obsolete v1-only assumptions; preserve exact source domains, table/index inventory, fixture paths/outcomes, and previous real snapshot bytes |
| Mutable refs | None; current master worktree, no staging, commit, push or merge |
| Consumes | Canonical Archive DDL/matrix, existing closed canonical and producer indexes, person.jsonlines summary, backend guide's optional Archive plain-text summary, existing artifact identity construction |
| Produces | SQLite schema 2 with bounded nullable person.summary; unchanged manifest/pointer schemas and dataVersion algorithm; one supported tuple and canonical SQL/object seal |
| Dependencies | Reviewed contracts-restore-person-profile-evidence proposal/design/tasks; Contracts v2 precedes Backend writer/reader verification; frontend consumes the existing optional person.summary wire field |
| Deliverables | Complete canonical v2 contract, reproducible evidence and exact verification results within this capability |
| Acceptance | Python canonical fixture --check and shared Node Archive verifier; Backend consumes the canonical DDL and proves its existing writer/read boundaries; git diff --check |
| Non-goals | New dependencies, HTML/BBCode interpretation, profile network enrichment, sidecars, dual-version production readers, new Backend admission/smoke pipelines, statistical changes or general infrastructure |
| Operations deferred | No live activation, scheduler run, release, deployment, production pointer or existing Archive mutation; a fresh local candidate belongs to the separately bounded Backend task |
| Stop/rollback conditions | Stop on concurrent overlap, unsupported source normalization, undeclared path or fixture drift, authority conflict or failed acceptance; preserve old binary/pointer/snapshot and revert only owned hunks |

This capability owns the later SQLite v2 delta after the completed v1 parity
scope of backend-embed-go-archive-builder. Earlier v1 draft-correction and fixed
byte-seal requirements describe their historical transitions; this change
supersedes only the explicitly modified version/evidence requirements below.
It does not reinstate a consumer admission layer removed by the accepted Go
writer/reader architecture.

## RENAMED Requirements

- FROM: `### Requirement: SQLite v1 is complete and self-identifying`
- TO: `### Requirement: SQLite schema is complete and self-identifying`

## MODIFIED Requirements

### Requirement: One authoritative Archive contract bundle
The repository SHALL define `contracts-archive-manifest` only through the root OpenSpec capability and the tracked artifacts under `contracts/schemas/archive/**` and `contracts/goldens/archive/**`. `schema.sql`, `archive-manifest.schema.json`, `current-pointer.schema.json`, `data-version-input.schema.json`, `fixture-index.schema.json`, and `compatibility-matrix.json` SHALL be the machine-readable authorities; the closed golden corpus SHALL be the language-neutral producer/consumer evidence. No Go package, Python/Node development tool, frontend, nested OpenSpec, generated model, or embedded resource copy SHALL become a second authority. The Backend is the sole production Archive writer and reader; the embedded DDL SHALL be a reproducible byte-for-byte derivative of the Contracts authority.

#### Scenario: The Backend writer and reader need the Archive shape
- **WHEN** the Backend builds and opens the accepted Archive format
- **THEN** both consume the same tracked schemas, DDL, compatibility matrix, and indexed goldens
- **AND** neither runtime change redefines the Archive contract in a private fixture or schema

#### Scenario: A nested contract control plane is proposed
- **WHEN** an apply task proposes another `openspec/`, generated OpenSpec skill set, or authoritative Archive schema below `backend/`, `updater/`, or `frontend/`
- **THEN** review SHALL reject it before apply

### Requirement: SQLite schema is complete and self-identifying
`schema.sql` SHALL be canonical UTF-8 with LF endings and one final LF, SHALL set `PRAGMA application_id = 1111969107` (`0x42474d53`, `BGMS`) and `PRAGMA user_version = 2`, and SHALL create a foreign-key/check-constrained immutable read model sufficient for all already-approved Archive producer/consumer/catalog/domain work.

SQLite v2 SHALL include:

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
`<field>=<UTF-8-byte-length>:<raw-UTF-8-bytes>` plus LF. SQLite v2 SHALL have
exactly 35 explicit objects. Invalid UTF-8, a missing or extra object, or any
definition-byte change SHALL fail the Contracts verifier or production builder required-object gate as
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

Every person SHALL additionally have nullable `summary TEXT`. A non-null
value SHALL contain 1 through 8192 Unicode scalar values and no NUL; the
producer SHALL apply the bounded normalization requirement below before
insertion. The 20 tables and 35 explicit schema objects SHALL otherwise retain
their accepted domains, constraints, indexes, and relationships. `archive_meta`
SHALL identify SQLite schema 2 while manifest schema remains 1.

The existing formal v1 snapshots SHALL remain immutable and unsupported by the
new single-tuple producer contract. The implementation SHALL build a fresh v2
candidate from original inputs, not ALTER an existing DB. The unchanged
`bgmss-archive-data-version-v1` algorithm SHALL bind SQLite version 2 and the
new canonical SQL digest, producing a distinct `dv1-` identity even when the
upstream input bytes are unchanged. Backend reading SHALL retain only its
existing minimal contained read-only open, identity read and lightweight
query boundary; this requirement SHALL NOT add checksum/schema admission.

#### Scenario: Biography completes the Archive read model
- **WHEN** the canonical v2 fixture stores a nonempty normalized biography
- **THEN** a person SELECT SHALL return the exact bounded text alongside the existing person facts
- **AND** canonical SQL and actual 35-object digests SHALL agree with the v2 matrix

#### Scenario: A previously built v1 exists
- **WHEN** v2 support is implemented for the same official inputs
- **THEN** construction SHALL use a new inactive path and a new dataVersion
- **AND** no old snapshot, manifest or pointer SHALL be rewritten or treated as v2

#### Scenario: A later schema evolution is requested
- **WHEN** a subsequent capability changes an accepted schema column, constraint, table or identity
- **THEN** it SHALL propose a new version and explicit compatibility tuple
- **AND** it MUST NOT reinterpret the accepted schema version in place

### Requirement: Compatibility is explicit and fail closed
`compatibility-matrix.json` SHALL declare the only supported tuple `(pointerSchemaVersion=1, manifestSchemaVersion=1, sqliteSchemaVersion=2, dataVersionAlgorithm=bgmss-archive-data-version-v1)`, the required SQLite objects/indexes, and stable validation precedence. Unknown higher/lower versions, unknown algorithms, and version disagreement among pointer, manifest, directory identity, SQLite pragmas, and embedded metadata SHALL be incompatible; no optimistic fallback is allowed.

The tuple SHALL describe only SQLite v2 with person summary support. The
previous v1 tuple is no longer supported by current contract verification or
production construction. Old real snapshots remain preserved for rollback
with their matching old binary; no dual-version reader or in-place migration
is introduced.

The matrix's canonical schema record SHALL equal both the repository
`schema.sql` digest and the valid fixture's actual 35-object seal. Manifest
`schemaSqlDigest` SHALL equal that record before SQLite object validation; a
claim that is internally self-consistent but differs from the canonical record
is unsupported.

Contracts verification and existing production builder validation SHALL stop at the first applicable stage in this order: JSON parse/schema; source identity/accounting semantics; compatibility; dataVersion recomputation; derived identity/path agreement; file type/containment/size; SQLite byte digest; SQLite format/read-only open; pragma/embedded metadata; required objects/sentinel; table-count agreement.

#### Scenario: Supported tuple agrees everywhere
- **WHEN** pointer, directory identity, manifest, SQLite pragmas, embedded metadata, canonical schema digest, and compatibility matrix all identify the supported v2 tuple and same dataVersion
- **THEN** compatibility validation SHALL pass to the next gate

#### Scenario: Unknown or disagreeing version is supplied
- **WHEN** any version/algorithm/schema digest is unsupported, an identity disagrees, or v1 or unknown-version evidence is supplied
- **THEN** validation SHALL stop as `ARCHIVE_VERSION_UNSUPPORTED`, `DATA_VERSION_MISMATCH`, or `SQLITE_DATA_VERSION_MISMATCH` according to the fixed precedence
- **AND** it SHALL NOT treat v1 or a numerically newer version as compatible

#### Scenario: Manifest table count disagrees last
- **WHEN** every earlier gate succeeds but one manifest table count differs from the read-only SQLite count
- **THEN** validation SHALL fail at the final stage as `SQLITE_TABLE_COUNT_MISMATCH`

The ordered full validation gates above belong to Contracts tools and the
existing production builder. Backend opening/activation SHALL retain the
accepted minimal contained read-only/identity boundary and SHALL NOT recreate
the removed Archive admission pipeline.

#### Scenario: A consumer admission layer is proposed
- **WHEN** an implementation adds a second full checksum/schema/sentinel pass to Backend open or activation merely to support summary
- **THEN** scope review SHALL reject it
- **AND** existing builder validation and the narrow consumer identity/read boundary SHALL remain the production ownership split

### Requirement: Golden corpus is closed and language neutral

`contracts/goldens/archive/index.json` SHALL list every canonical consumer
golden outside `producer/**` exactly once with relative path, SHA-256, case id,
validation stage, and expected stable outcome. All 32 accepted paths SHALL remain unchanged. Schema-dependent bytes and their indexed identities SHALL be regenerated for the reviewed v2 contract; unchanged semantic vectors SHALL retain their exact bytes. Verification SHALL reject an
unindexed, missing, duplicate, hash-drifted, symlink, or non-regular canonical
golden.

The canonical corpus SHALL retain one tiny internally consistent valid Archive
and the exact accepted invalid JSON/bundle/vector inventory. It SHALL cover
strict unknown fields/digests/path forms, `MANIFEST_ACCOUNTING_INVALID`,
`DATA_VERSION_MISMATCH`, `SQLITE_DIGEST_MISMATCH`, `SQLITE_FORMAT_INVALID`,
`ARCHIVE_VERSION_UNSUPPORTED`, `SQLITE_DATA_VERSION_MISMATCH`,
`SQLITE_REQUIRED_OBJECT_MISSING`, and `SQLITE_TABLE_COUNT_MISMATCH`. The
count-mismatch bundle SHALL keep every earlier gate valid and change exactly
one manifest count so its first failure is the final table-count gate.

Producer-only language-neutral evidence MAY exist only below `producer/**`.
It SHALL use its own strict schemas and `producer/index.json`; that sub-index
SHALL list every other producer file exactly once with relative path, SHA-256
and unique case id. Shared Contracts tooling SHALL validate the canonical root
index and producer sub-index as two disjoint closed inventories, reject any
cross-index path, and report both counts separately. A producer vector SHALL
never be dispatched as a consumer manifest/pointer/bundle case or change the
accepted consumer corpus outcome.

Neither corpus SHALL contain downloaded full Archive data, a real user
collection, token, secret, or production pointer.

#### Scenario: Closed corpus is verified
- **WHEN** the verifier walks canonical paths below `contracts/goldens/archive/**`
- **THEN** their path set SHALL equal the unchanged root-index path set exactly
- **AND** every canonical case SHALL produce its indexed outcome in the fixed precedence

#### Scenario: Closed producer corpus is verified
- **WHEN** the verifier walks `contracts/goldens/archive/producer/**`
- **THEN** every non-index file SHALL appear exactly once in the producer sub-index and pass its strict schema, digest, and semantic recomputation
- **AND** no producer path SHALL appear in the canonical root index or be executed as a consumer fixture

#### Scenario: Corrupt bytes still match their manifest digest
- **WHEN** the canonical corrupt-SQLite case has a manifest whose SQLite digest matches the deliberately corrupt bytes
- **THEN** validation SHALL pass the digest gate and fail specifically as `SQLITE_FORMAT_INVALID`

#### Scenario: Fixture bytes drift
- **WHEN** a canonical or producer golden is added, removed, replaced, symlinked, cross-indexed, or changed without its owning exact index and expected result
- **THEN** contract verification SHALL fail before candidate acceptance
- **AND** canonical fixture regeneration SHALL NOT rewrite or bless producer evidence; the separately bounded producer refresh SHALL update only its reviewed summary/schema derivatives

### Requirement: Corrected evidence SHALL remain closed and deterministic
The minimal fixture SHALL retain the accepted safe/day, NSFW/month,
safe/year, and safe/null-date semantic examples, all registered raw domains,
canonical catalog rows, and every existing matrix sentinel. It SHALL add
bounded nullable biography evidence without changing statistical facts.

The same 32 indexed canonical paths and 15 producer case paths SHALL remain.
Tooling SHALL regenerate schema-dependent SQLite, manifest, pointer, vector,
index and producer identities in dependency order. Existing invalid
NSFW/date/precision insertion cases, staff-set bounds, the canonical 35-object
seal and weakened-definition mutation SHALL remain enforced. New tests SHALL
exercise null, exact 8192-scalar, oversized and NUL summary storage boundaries.
No runtime-private schema or golden copy is authoritative.

#### Scenario: Versioned corpus is regenerated
- **WHEN** tooling builds the accepted semantic examples and biographies from v2 DDL
- **THEN** schema/dataVersion/SQLite/manifest/pointer, table counts, sentinels and all index entries SHALL agree
- **AND** the matrix SQL digest and 35-object seal SHALL match the actual database
- **AND** a second clean generation SHALL be byte-identical

#### Scenario: Corpus paths or derived bytes drift
- **WHEN** a golden path is added/deleted, an unsupported schema identity remains accepted, a sentinel/count changes, or regeneration is nondeterministic
- **THEN** Contracts acceptance SHALL fail before sync/archive

#### Scenario: A downstream artifact retains a v1 identity
- **WHEN** the embedded schema or generated artifact compatibility claims still identify the prior schema
- **THEN** acceptance SHALL fail until that exact derived binding is regenerated for v2
- **AND** no real v1 snapshot SHALL be modified to satisfy the check

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
a regular non-symlink vector with its exact digest. The accepted 32 indexed paths SHALL remain. This string vector itself SHALL retain its exact bytes and semantic outcomes while schema-dependent bundle and index identities are regenerated for SQLite v2.

The Contracts verifier SHALL consume the tracked vector through strict Node
manifest validation, one Python semantic probe, and one isolated Go semantic
probe. Every language SHALL parse the same `jsonStringLiteral`, reject isolated
surrogates before replacement, and recompute scalar/byte facts and expected
outcome from the same tracked bytes. The malformed-UTF-8 recipe SHALL be
materialized as an ephemeral byte mutation because malformed bytes cannot be
stored directly in valid JSON; all ephemeral output SHALL remain below the
declared disposable root and be absent at exit. No runtime-private persistent
copy SHALL become authority.

The production Go builder SHALL execute this exact indexed vector through its
real manifest finalization boundary. The isolated Contracts Go probe SHALL
NOT count as production builder adaptation. These full manifest checks SHALL
NOT create or reinstate a separate Backend consumer admission pipeline.

#### Scenario: Closed vector is verified in three languages
- **WHEN** Node, Python, and isolated Go read the indexed vector after fatal UTF-8 decoding
- **THEN** all 25 string case ids, the raw-byte recipe, JSON string literals, recomputed scalar/byte facts, and `VALID` or `MANIFEST_SCHEMA_INVALID` outcomes SHALL match exactly
- **AND** the two documented emoji counterexamples SHALL prove that byte count never decides acceptance

#### Scenario: Vector inventory or expected result drifts
- **WHEN** the vector is missing, unindexed, duplicated, hash-drifted, symlinked, non-regular, gains or loses a case, or any language reports a different length/outcome
- **THEN** Contracts acceptance SHALL fail before downstream handoff
- **AND** the index SHALL NOT be regenerated to bless unexplained drift

#### Scenario: Production builder lacks runtime proof
- **WHEN** Contracts evidence passes but the production Go builder has not executed the same indexed vector through its real finalization boundary
- **THEN** that runtime change SHALL remain unaccepted
- **AND** this Contracts change SHALL NOT claim the missing runtime implementation

### Requirement: Raw Archive domain codes SHALL remain lossless

The authoritative SQLite v2 SHALL store
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

### Requirement: Archive SQLite schema is strict and versioned

The `staff_set.set_key` check SHALL accept inclusive text length `15..96`.
Fifteen is the exact minimum for the accepted
`staffset:{book|anime|music|game|real}:{slug}` family with a one-character
slug. SQLite v2 SHALL preserve the one-character slug allowance, the 96-byte full-key maximum and the table/index inventory. Only the SQLite schema version advances to 2; manifest/pointer versions and the dataVersion algorithm remain unchanged.

The canonical schema SQL/object seals and every dependent canonical and
producer identity SHALL be regenerated deterministically while retaining the
exact existing 32-file canonical path set and 15-case producer path set.

#### Scenario: Inclusive staff-set key bounds are exercised
- **WHEN** real SQLite receives valid staff-set keys of exact lengths 15 and 96
- **THEN** both inserts SHALL succeed under the canonical DDL
- **AND** otherwise equivalent keys of lengths 14 and 97 SHALL fail the DDL check

#### Scenario: Corrected schema identities are rebuilt
- **WHEN** the corrected DDL is built twice from identical inputs
- **THEN** schema/object/dataVersion/SQLite/manifest/pointer/vector/index and producer-case identities SHALL match across runs
- **AND** no canonical or producer indexed path SHALL be added, removed, or reinterpreted

### Requirement: Archive compatibility SHALL close over the production rule pair

The sole supported Archive SQLite v2 compatibility tuple SHALL include
`domainRulesVersion=domain-raw-v1` and
`castRulesVersion=cast-exact-v1` in addition to its existing pointer,
manifest, SQLite, application-id, and dataVersion-algorithm identity.
Language-neutral minimal/vectors and all derived bytes SHALL use that same
pair. An arbitrary syntactically valid token SHALL remain schema-valid input
but SHALL be compatibility-unsupported.

#### Scenario: Exact production pair is verified
- **WHEN** pointer, manifest, SQLite, algorithm, schema digest, and the exact rule pair match the tuple
- **THEN** Contracts and producer compatibility verification SHALL continue to dataVersion validation

#### Scenario: One rule version differs
- **WHEN** either rule token differs while all other fields remain valid
- **THEN** Contracts and producer validation SHALL return `ARCHIVE_VERSION_UNSUPPORTED` before dataVersion or SQLite inspection

## ADDED Requirements

### Requirement: Person summaries SHALL be bounded normalized plain text

Official `person.jsonlines.summary` SHALL be the only biography source. A
missing or null field SHALL become SQL NULL. A present non-null value SHALL
be a valid Unicode string, with existing strict record decoding retained.
The producer SHALL normalize CRLF to LF, then remaining CR to LF; remove
U+0000 through U+001F except LF and TAB; trim Unicode White_Space at both ends;
take the first 8192 Unicode scalar values; and trim Unicode White_Space at
both ends again, in that order. An empty result SHALL become SQL NULL.
Unicode White_Space means U+0009..U+000D, U+0020, U+0085, U+00A0, U+1680,
U+2000..U+200A, U+2028, U+2029, U+202F, U+205F and U+3000.

The normalized result SHALL be preserved as literal plain text through Archive
and the existing optional PersonV1.summary response. HTML, BBCode, links and
entities SHALL not be interpreted or stripped by guessed regular expressions.
Frontend SHALL display the value through text interpolation; no rich-text
execution, live profile request or fabricated biography is authorized. Source
line limits and malformed non-string rejection SHALL remain unchanged.

#### Scenario: Mixed line endings and C0 controls occur
- **WHEN** a biography contains CRLF, isolated CR, LF, TAB and other C0 controls including NUL
- **THEN** CRLF and CR SHALL become LF, LF/TAB SHALL be preserved internally and the remaining C0 controls SHALL be removed
- **AND** leading/trailing Unicode White_Space SHALL be trimmed before and after scalar truncation

#### Scenario: Summary is absent or blank
- **WHEN** the field is absent, null or empty after normalization
- **THEN** Archive SHALL store NULL and the API SHALL omit person.summary
- **AND** it SHALL not substitute a hardcoded or statistical paragraph as source biography

#### Scenario: Multibyte summary reaches its bound
- **WHEN** a valid biography contains more than 8192 Unicode scalar values including astral characters
- **THEN** only the first 8192 scalars SHALL remain before the final whitespace trim
- **AND** no UTF-8 sequence or surrogate pair SHALL be split and the persisted value SHALL satisfy the wire bound

#### Scenario: Markup-like text occurs
- **WHEN** source text contains `<script>`, `[b]`, entity spellings or URL text
- **THEN** the normalized literal text SHALL remain evidence and SHALL never execute as markup
- **AND** no profile network fetch or undocumented content rewrite SHALL be performed

### Requirement: Existing snapshots SHALL remain immutable during version evolution

A reviewed schema change after formal v1 SHALL use an explicit new SQLite
version and compatibility tuple. SQLite v2 SHALL be rebuilt from original
sources into a fresh inactive candidate; existing snapshots and their
manifests/pointers SHALL not be migrated, patched or overwritten. Rollback
SHALL use the preserved old binary with its matching old snapshot/pointer.
Contract fixture regeneration is separate from real Archive mutation and
SHALL not authorize live activation or release.

#### Scenario: Local v2 preparation follows an existing v1 run
- **WHEN** original inputs are available and v2 construction is authorized
- **THEN** the builder SHALL write only a new inactive candidate and validate it before publication
- **AND** the old binary and v1 snapshot/pointer SHALL remain available for the separately reviewed rollback

#### Scenario: Concurrent dirty work overlaps the contract block
- **WHEN** preflight finds a new concurrent edit outside the recorded permitted overlap
- **THEN** the owner SHALL stop before overwriting it and report the exact paths
- **AND** no reset, hidden stash or alternate worktree SHALL discard the overlap

## REMOVED Requirements

### Requirement: Python producer and Go consumer handoffs remain separate
**Reason:** The accepted Backend architecture owns both production writing and reading; the retired Python producer is historical evidence only.
**Migration:** Use the single Backend writer/reader boundary and independent Contracts development tools; do not add a consumer admission layer.

### Requirement: Pre-production hardening SHALL preserve version and dependency safety
**Reason:** Its no-formal-v1 prerequisite no longer holds; applying that historical exception would incorrectly reuse SQLite version 1.
**Migration:** Keep the accepted manifest string semantics and vectors, and follow the explicit immutable v2 evolution requirement.

### Requirement: Pre-first-snapshot correction SHALL replace every draft identity
**Reason:** Formal v1 snapshots now exist and the one-time draft correction has ended.
**Migration:** Rebuild fresh v2 snapshots and generator-owned v2 fixture identities while preserving all real v1 bytes for rollback.
