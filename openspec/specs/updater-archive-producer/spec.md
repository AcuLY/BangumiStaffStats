# updater-archive-producer Specification

## Purpose
TBD - created by archiving change produce-immutable-archive. Update Purpose after archive.
## Requirements
### Requirement: Acquisition SHALL be exact, bounded, and staged

One terminating invocation SHALL resolve one official Archive asset and one
exact common commit, accept only approved HTTPS origins/redirects, and verify
status, declared and actual size, SHA-256, ZIP safety/inventory, commit, and
`subject_staffs.yml` bytes before parsing. Download, extraction, database, and
manifest work SHALL stay in a unique staging directory below the same absolute,
canonical, non-symlink output root and filesystem as `versions/`. One
development writer per output root SHALL be a caller precondition until the
deferred operations lock exists.

#### Scenario: Source identity or container is unsafe
- **WHEN** status/origin/redirect/size/digest/commit/member set differs, a ZIP entry escapes/links/duplicates/exceeds bounds, or cancellation occurs
- **THEN** the command SHALL return one sanitized stable failure, remove only its staging, and leave no final version

### Requirement: Every source record SHALL be streamed and accounted

The producer SHALL read all seven required JSONLines members incrementally,
strictly decode one bounded object per physical line, and assign each line
exactly once to imported, identical duplicate, invalid, or unresolved. It SHALL
build a new SQLite v1 with deterministic keys/order and bounded transactions;
it MUST NOT load all sources into memory, reuse/upsert an old DB, infer missing
facts, or silently drop deletion/conflict/reference evidence. Unknown staff
positions allowed by the contract SHALL remain raw/non-selectable/unresolved;
syntactically valid relationship lines with an absent required Archive identity
SHALL be excluded from logical/SQLite rows and counted once as `invalid`;
malformed/unknown-field/wrong-domain records and conflicting duplicates SHALL
remain fatal. The resulting SQLite SHALL pass foreign-key and reference
integrity with no fabricated placeholder.

Upstream empty strings in nullable `subject.name_cn` and `subject.date` SHALL
normalize to SQL `NULL`; an empty date SHALL also produce null date precision.
Every non-empty name/date byte sequence SHALL continue through the registered
strict validation without fallback or inference.

The source adapter SHALL accept only subject types `1/2/3/4/6` and map them to
`book/anime/music/game/real`. It SHALL preserve cast roles as integers `1..6`
and relation codes as positive JSON-safe integers in original
`subject -> related_subject` direction. It SHALL reject wrong JSON types or
out-of-domain values before finalization and SHALL never restore discarded
text role/relation mapping.

#### Scenario: Complete synthetic sources are built
- **WHEN** the accepted valid producer golden is streamed
- **THEN** every expected logical row, exclusive accounting equation, table count, quality code, and raw unknown-position fact SHALL match

#### Scenario: A line is malformed or conflicts
- **WHEN** a record is malformed/unknown-field/wrong-domain or an identity repeats with different content
- **THEN** the declared first failure SHALL occur before finalization with no partial catalog/database published

#### Scenario: A required Archive reference is absent
- **WHEN** a syntactically valid relationship line refers to an absent subject, person, character, or required exact pairing
- **THEN** that physical line SHALL count once as `invalid`, produce no dangling logical/SQLite row, and SHALL NOT fail the otherwise valid batch

#### Scenario: A nullable upstream field is empty
- **WHEN** a subject carries an empty `name_cn` or `date`
- **THEN** the producer SHALL store SQL `NULL` (and null date precision) without changing any non-empty fact

#### Scenario: Raw upstream domains cross the producer boundary
- **WHEN** source records exercise every accepted subject type, cast role, and numeric relation direction
- **THEN** the SQLite rows SHALL preserve those numeric domains exactly and reject text aliases or invalid values

### Requirement: Identity, quality, and manifest SHALL be deterministic

The producer SHALL use the authoritative schema, compatibility tuple,
`bgmss-archive-data-version-v1`, and acyclic digest graph. Before manifest
creation it SHALL finish indexes and pass schema/object/index, foreign-key,
`integrity_check`, exact table/accounting/quality invariants, logical-row
digests, and read-only reopen. Same validated semantic inputs SHALL yield the
same dataVersion and logical rows regardless of generated time/run directory;
generated time, physical SQLite bytes, paths, and activation state MUST NOT
enter dataVersion.

Schema validation SHALL require both the corrected canonical `schema.sql`
digest and the actual 35-object `bgmss-sqlite-schema-objects-v1` seal from the
fresh database. A matching name set or copied digest claim SHALL NOT permit a
weakened or extra explicit object to reach manifest creation or Go smoke.

The real Python manifest finalizer SHALL execute the exited string contract
before writing `manifest.json`: `generatedAt` SHALL be the exact
calendar-valid UTC `YYYY-MM-DDTHH:mm:ss[.1..6]Z` subset with year
`0001..9999`; each URL SHALL contain only Unicode scalar values and be bounded
inclusively at 12 through 2048 scalars, never encoded bytes; and surrogate code
points SHALL be rejected rather than normalized or replaced. Every indexed
`manifest-string-semantics.json` case, including the exact `C3 28` raw-byte
recipe, SHALL pass through this runtime finalizer boundary. The Contracts
isolated Python probe alone SHALL NOT satisfy producer acceptance.

#### Scenario: Identical semantics are regenerated
- **WHEN** the same source/common/schema/rules/catalog inputs are rebuilt in another staging root
- **THEN** dataVersion, accounting, counts, and canonical logical-row digests SHALL match

#### Scenario: Manifest strings cross the producer boundary
- **WHEN** the indexed valid and invalid timestamp, scalar-length, surrogate, and raw-byte cases are applied to the real finalizer
- **THEN** valid cases SHALL produce canonical manifest bytes
- **AND** every invalid case SHALL fail before inactive publication with no final candidate

### Requirement: Go validation SHALL precede inactive atomic publication

After every Python gate, the producer SHALL invoke accepted
`backend/cmd/archive-smoke` on the staging root containing fixed
`versions/<dataVersion>/{manifest.json,bangumi.sqlite}`. It SHALL load without
a pointer, apply full-data runtime invariants, return bounded JSON identity,
and close the store; minimal-golden exact sentinel counts MUST NOT become
universal dataset gates. Only success permits atomic rename of that version
directory to the previously absent inactive output path. An existing
independently valid same version SHALL return stable no-change; any collision
SHALL fail without overwrite. Producer and smoke SHALL never read or write
`current.json`.

Rename SHALL be the sole commit point after every fallible validation and
cancellation gate. No fallible gate SHALL run after it; cross-device copy,
replace, merge, or file-by-file fallback is forbidden. A pre-existing or raced
non-identical/invalid target SHALL be byte-preserved and rejected.

#### Scenario: Go accepts the staged candidate
- **WHEN** all Python and Go gates pass, cancellation is clear, the final path is absent, and same-filesystem rename succeeds
- **THEN** exactly the closed manifest/SQLite pair SHALL appear atomically as an inactive version with no pointer or activation claim

#### Scenario: Go rejects or publication collides
- **WHEN** Go returns any gate failure, the final path is non-identical/invalid, rename fails, or cancellation arrives before completion
- **THEN** no new final candidate SHALL remain and every prior version SHALL be byte-preserved

### Requirement: Dependency and acceptance scope SHALL remain minimal

PyYAML `6.0.3` SHALL be the sole added runtime dependency and only safe-load
strictly bounded common YAML; all other producer work SHALL use the Python
standard library and existing `jsonschema`. Frozen install, exact dependency
and MIT-license inventory, wheel/import, unit/property/fault tests, full
updater quality gates, disposable complete-source smoke, strict OpenSpec/Git
checks, and absence of `.cache/.tmp/.venv` SHALL gate acceptance.

#### Scenario: The development candidate is accepted
- **WHEN** all synthetic/offline gates and the explicitly invoked disposable complete-source Python-to-Go smoke pass
- **THEN** only inactive producer capability SHALL be claimed
- **AND** scheduler, lock, `current.json`, activation, restart, push, release, deploy, and production readiness SHALL remain absent
