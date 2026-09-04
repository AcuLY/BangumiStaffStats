## Capability Boundary

- **Status:** Existing catalog/cast/quality contract is preserved; its production producer changes from Python Updater to Go Backend.
- **Owner:** Contracts owns schemas, canonical identity, goldens, derivation semantics, and quality definitions; Backend consumes them read-only.
- **Writable paths:** This delta spec and exact artifact ownership metadata/tests declared by the change; catalog schemas/config meaning/goldens remain protected.
- **Read-only protected inputs:** Current PositionKeys, labels, order, group membership, staff-set rules, cast/raw-role semantics, quality classifications, index seals, and real common/Archive bytes.
- **Deletion complement:** Only Updater-specific handoff wording or artifact bindings may be removed; no catalog schema, fixture, governed config meaning, or accepted row/outcome is deleted.
- **Mutable refs:** Local `codex/embed-go-archive-builder` only.
- **Consumes:** Existing catalog schemas/goldens, the fixed common input, governed display/staff-set documents, and the real Go builder.
- **Produces:** Unchanged catalog/cast/quality contract outputs with Go Backend as production compiler.
- **Dependencies:** `backend-archive-builder`, `contracts-archive-manifest`, and `contracts-archive-goldens`.
- **Deliverables:** Go parity requirement and updated Backend handoff language.
- **Acceptance:** Real Go compilation matches complete-derivation and quality evidence without changing any key, row, count, sample, or outcome.
- **Non-goals:** Catalog redesign, static position enums, cast inference, translated labels, new staff sets, query behavior changes, or relaxed validation.
- **Operations deferred:** Real common/Archive acquisition, activation, deployment, and host mutation.
- **Stop/rollback conditions:** Stop on any catalogConfigDigest, row, role, quality, index, or semantic drift; rollback is parent `411f54b`.

## ADDED Requirements

### Requirement: Catalog goldens SHALL gate the real Go production compiler

`backend-archive-builder` SHALL consume the existing catalog schemas,
configuration canonicalization, complete derivation case, quality sentinel,
and indexed mutation outcomes through its real common/catalog/cast/SQLite
boundary. Moving production ownership to Go SHALL NOT change any canonical
PositionKey, label, localized name, order, capability, group/member reference,
selection rule, staff-set projection, cast row, quality count/sample, stable
error, or `catalogConfigDigest`.

Focused fixture parity SHALL run during implementation. One complete current
common/Archive build SHALL be deferred to the accumulated acceptance batch and
SHALL not become a repeated gate after every small edit. A mismatch SHALL be
fixed in the Go implementation unless a separately approved Contracts change
proves the accepted semantic authority itself is wrong.

#### Scenario: Complete derivation crosses the Go builder
- **WHEN** the accepted complete-derivation case and governed configuration are compiled by the real Go builder
- **THEN** catalog rows, roles `1..6`, exact/filtered cast evidence, unknown positions, quality report, and deterministic identity SHALL match the indexed evidence exactly

#### Scenario: Go output differs from accepted evidence
- **WHEN** any key, order, row, count, sample, digest, or stable error differs solely because of the language port
- **THEN** Backend acceptance SHALL fail and Contracts fixtures SHALL remain unchanged

## MODIFIED Requirements

### Requirement: Catalog contracts SHALL be strict, closed, and language neutral

`contracts/schemas/catalog/**` SHALL define strict JSON Schema 2020-12
documents for versioned display configuration, dormant staff-set
configuration, derivation cases, quality evidence, and the golden index. Every
object SHALL reject unknown properties; strings, arrays, and JSON-safe
integers SHALL have explicit bounds; identifiers SHALL use the accepted
subject-type and PositionKey grammars.

`contracts/goldens/catalog/index.json` SHALL list every other regular,
non-symlink file below `contracts/goldens/catalog/**` exactly once by relative
path, SHA-256, unique case id, case kind, and expected stable outcome. The
Contracts verifier SHALL fatal-UTF-8 decode before strict JSON parsing,
schema-validate every artifact, recompute the complete path/digest inventory
and every semantic expectation, and reject missing, extra, duplicate,
hash-drifted, symlinked, non-regular, or internally contradictory evidence.
The corpus SHALL contain only compact synthetic or pinned-source sentinel
evidence, never a downloaded full Archive/common copy, user data, secret,
pointer, or production path.

The corpus SHALL remain implementation-language neutral. Contracts tooling MAY
use its existing pinned languages, but the production handoff SHALL now target
`backend-archive-builder`; no embedded Backend copy or former Updater fixture
SHALL become a second authority.

#### Scenario: Closed catalog corpus passes
- **WHEN** the verifier walks the catalog schema and golden roots
- **THEN** every schema SHALL compile strictly and the physical golden path set SHALL equal the index path set exactly
- **AND** every indexed case SHALL recompute its declared outcome and digest

#### Scenario: Contract evidence drifts
- **WHEN** a schema/case/index byte changes unexplained, a golden is unindexed or multiply indexed, or a symlink/non-regular path appears
- **THEN** Contracts acceptance SHALL fail before Backend builder handoff
- **AND** tooling SHALL NOT regenerate expected bytes merely to bless the drift

### Requirement: Exact cast evidence SHALL be complete and non-inferential

The contract SHALL derive `valid_cv` from every otherwise valid
`subject-persons` person in the full input, independent of position resolution
or the cast subject. For anime/game only, a cast candidate SHALL exist only
when `subject-characters` and `person-characters` share the exact same
`(subjectId, characterId)`, both referenced entities and the subject are valid,
and the person belongs to that global whitelist. The emitted row SHALL retain
the exited authority's raw numeric role value exactly, plus source order,
`eligible=1`, and `provenance=exact`. Subject relations, series identity, a
same Character ID in another work, and candidate works SHALL never create an
edge.

The contract SHALL produce exactly `cast:anime:main`,
`cast:anime:all`, `cast:game:main`, and `cast:game:all`. Main SHALL select only
raw role value `1`; all SHALL select every eligible exact raw role and
therefore be a superset of main. Each same-type pair SHALL share one canonical
exclusive rule identity; no cast key SHALL exist for book/music/real.

`correct-archive-raw-domain-semantics` reconciled the root schema, producer
goldens/verifier, and Go consumer on integer roles `1..6` with `main=1`. The
real Go production builder SHALL preserve that same domain. The corpus SHALL
enumerate every admitted raw numeric role and count from complete-source
evidence; unknown values SHALL block. This change SHALL NOT choose a mapping,
alter root authority, or collapse values.

The Archive producer admission contract remains authoritative for raw
relationship records. A syntactically valid relationship whose required
Archive identity is absent SHALL be counted exactly once as source `invalid`,
excluded from logical/SQLite rows, and SHALL NOT by itself fail an otherwise
valid candidate. Catalog/cast derivation SHALL consume only the admitted rows;
it SHALL neither reclassify those excluded raw records nor create placeholder
entities. A dangling reference found inside the admitted derivation projection
is an internal closure violation and SHALL remain blocking.

#### Scenario: Global whitelist and exact join succeed
- **WHEN** a person has any valid `subject-persons` record and an exact same-subject person/character relation on an anime or game subject
- **THEN** one eligible exact cast row SHALL be emitted
- **AND** it SHALL be selected by all and by main only when its preserved raw role is `1`

#### Scenario: Another work has the only cast relation
- **WHEN** the same Character ID has a person relation only on a related or series work
- **THEN** the target work SHALL receive no cast row
- **AND** no relation traversal, series merge, or candidate inference SHALL run

#### Scenario: A raw relationship references an absent Archive identity
- **WHEN** the Go Archive producer classifies that syntactically valid physical line as source `invalid`
- **THEN** the line SHALL remain excluded from the admitted derivation projection without failing the otherwise valid candidate
- **AND** its exact accounting SHALL remain visible in the Archive source evidence

#### Scenario: Role authority drifts
- **WHEN** schema, producer, or consumer no longer matches the exited raw-domain authority, or an observed numeric role is outside `1..6`
- **THEN** Contracts handoff and Backend builder apply SHALL stop
- **AND** no private mapping, value collapse, or root-authority edit SHALL be made by this change
