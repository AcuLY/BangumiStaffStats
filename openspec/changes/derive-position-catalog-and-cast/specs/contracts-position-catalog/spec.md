## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency review plus strict planning-artifact validation |
| Owner | Contracts owner writes and verifies this capability; Updater is its first read-only runtime consumer; later Go/TypeScript consumers require separate changes. |
| Writable paths | `contracts/schemas/catalog/**`, `contracts/goldens/catalog/**`, and Contracts task markers in this change only. |
| Read-only protected inputs | All Archive/query schemas and goldens, root specs, updater/backend/frontend code, PRODUCT/DESIGN/guides/oracle, other changes/tasks, refs/remotes, hosts, and production. |
| Deletion complement | None; no accepted schema, golden, source, configuration, or runtime file may be deleted or replaced. |
| Mutable refs | None; no stage, commit, sync/archive, ref mutation, push, tag, release, or deploy. |
| Consumes | After producer exit, accepted `contracts-archive-manifest`, archived `produce-immutable-archive`, and exited `correct-archive-raw-domain-semantics`; plus PRODUCT catalog semantics, accepted data decisions, and the pinned common source shape. |
| Produces | Strict catalog configuration, derivation-case, quality-report, and closed-index schemas; a closed language-neutral golden corpus; and a deterministic catalog-configuration digest contract. |
| Dependencies | `produce-immutable-archive` MUST be accepted, synchronized, archived, and absent from active changes before apply. `correct-archive-raw-domain-semantics` has already exited. This Contracts block then completes and is main-agent accepted before Updater begins. |
| Deliverables | Strict schemas, local verifier/lock/documentation, exact indexed cases, positive/negative derivation matrices, canonical bytes/digests, and owner-scoped verification evidence. |
| Acceptance | Fatal UTF-8, strict schema, closed inventory/digest, semantic recomputation, canonicalization, exact mapping/group/shortcut/cast/staff-set/quality cases, protected-path, OpenSpec, diff, and residue gates pass. |
| Non-goals | Archive authority changes, downloaded full dumps, runtime implementation, APIs, query/statistical results, UI/search behavior, active staff sets, cross-work inference, or operations. |
| Operations deferred | Live source scheduling, production roots/credentials, activation, retention, restart, monitoring, release, deployment, and cutover. |
| Stop/rollback conditions | Hard-stop on unmet producer dependency or drift from the exited raw numeric `1..6`/`main=1` authority. Also stop on authority/path drift or any Archive/root-spec need. Remove only new owned candidate bytes; never rewrite protected evidence to make a failure pass. |

## ADDED Requirements

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

#### Scenario: Closed catalog corpus passes
- **WHEN** the verifier walks the catalog schema and golden roots
- **THEN** every schema SHALL compile strictly and the physical golden path set SHALL equal the index path set exactly
- **AND** every indexed case SHALL recompute its declared outcome and digest

#### Scenario: Contract evidence drifts
- **WHEN** a schema/case/index byte changes unexplained, a golden is unindexed or multiply indexed, or a symlink/non-regular path appears
- **THEN** Contracts acceptance SHALL fail before Updater handoff
- **AND** tooling SHALL NOT regenerate expected bytes merely to bless the drift

### Requirement: Canonical catalog configuration SHALL have one deterministic identity

The contract SHALL define one versioned semantic configuration containing the
ordered shortcut/additional-display rules and the versioned staff-set
document. Its canonical representation SHALL use fixed field emission,
UTF-8/LF bytes, exact PositionKeys, and deterministic collection ordering.
Shortcut order and display-group order SHALL remain semantic and preserved.
Staff-set member order SHALL be non-semantic and sorted by exact ASCII
PositionKey before emission; duplicate members SHALL fail rather than be
silently removed. Staff sets SHALL be sorted by subject type, positive
`displayOrder`, and key for canonical emission.

`catalogConfigDigest` SHALL be lowercase `sha256:<64hex>` over those exact
canonical bytes. Reformatting or staff-set member reordering SHALL preserve
the digest; any label, member set, display order, shortcut order/key, added
display group, staff-set key, or schema-version change SHALL change it. Common
source bytes SHALL remain represented separately by the accepted
`commonCommit`/`commonDigest`, not copied into the configuration digest.

#### Scenario: Semantically equivalent staff-set configuration is reordered
- **WHEN** only object spelling/whitespace or the input order of the same unique staff-set members changes
- **THEN** canonical bytes and `catalogConfigDigest` SHALL remain identical

#### Scenario: Catalog configuration meaning changes
- **WHEN** a shortcut, group, staff-set key/label/member set, or display order changes
- **THEN** canonical bytes and `catalogConfigDigest` SHALL change
- **AND** an old digest SHALL NOT be reused

### Requirement: Common positions SHALL map dynamically and exactly

The golden contract SHALL cover all five subject types
`book|anime|music|game|real` and the accepted Archive numeric-to-string type
adapter. Every valid common `(subjectType, positionId)` SHALL produce exactly
one selectable entity with key `staff:{subjectType}:{positionId}` and one
exact-staff selection rule; common additions under the same accepted shape
SHALL enter without a Go/TypeScript/static-enum edit. Empty localized strings
SHALL normalize to null, the non-empty common Chinese name SHALL be the
catalog label, and a position without any admissible label SHALL block the
snapshot.

Position order SHALL place positive common order values first in ascending
order, then non-positive or missing values in source order, with source
position and numeric ID providing a strict deterministic tie-break. Defined
positions with no credits SHALL remain selectable and legal. A raw
`subject-persons` position absent from common SHALL remain the accepted
non-selectable unresolved staff fact and SHALL NOT create a placeholder
position or catalog entity.

The contract SHALL include official anime positions 101–106 and the oracle
sample `(person=6756, subject=9717, position=104)` exclusively as exact
`staff:anime:*` evidence. No legacy `101/102/1101/1102` voice key, 168-item
mapping, name merge, or hidden exact-position union is admitted.

#### Scenario: Common adds one valid position
- **WHEN** a synthetic common source adds a new valid `(type,id)` without changing the accepted source shape
- **THEN** one new stable exact `staff:{type}:{id}` position and selection rule SHALL appear without any static enum update
- **AND** every pre-existing key SHALL remain unchanged

#### Scenario: Official positions collide with legacy voice numbers
- **WHEN** common and `subject-persons` contain anime positions 101 through 106, including the position-104 oracle sentinel
- **THEN** they SHALL produce only their six exact staff entities/credits
- **AND** no cast entity or cast credit SHALL be derived from those integers

### Requirement: Group references and fixed shortcuts SHALL preserve one canonical entity

Common categories SHALL become ordered groups with keys
`bangumi:{type}:{categoryKey}`. A position in multiple categories SHALL occur
once in the position entity set and once as a reference in every declared
parent; no primary category SHALL be invented. An uncategorized position in a
type that has categories SHALL enter `fallback:{type}:other`; a type with no
common categories SHALL use `fallback:{type}:all`. Category order SHALL use
positive common order ascending, followed by non-positive/missing values in
source order with deterministic tie-breaks.

The product-defined voice groups SHALL be
`shortcut:anime:cast` and `shortcut:game:cast`, placed immediately after the
corresponding common sound group and referencing exactly main then all.
Missing/ambiguous insertion anchors SHALL fail configuration validation rather
than move the group silently. Fixed featured groups SHALL use
`shortcut:{type}:featured`, SHALL not exist for unconfigured types, and SHALL
contain only these exact ordered references:

- anime: `staff:anime:2`, `staff:anime:67`, `cast:anime:main`,
  `cast:anime:all`, `staff:anime:3`, `staff:anime:10`,
  `staff:anime:74`, `staff:anime:1`, `staff:anime:5`,
  `staff:anime:4`;
- game: `staff:game:1004`, `staff:game:1001`, `cast:game:all`,
  `cast:game:main`, `staff:game:1013`.

Labels and localized names SHALL come from the canonical position entities;
shortcut configuration SHALL store only ordered keys. Every reference SHALL
resolve to one selectable same-type position or block the complete catalog.

#### Scenario: One position has multiple common categories and a shortcut
- **WHEN** a valid position belongs to two Bangumi categories and is referenced by one featured group
- **THEN** the output SHALL contain one position entity and three group-member references to the same key
- **AND** entity counts SHALL not be inflated by display occurrences

#### Scenario: A fixed shortcut reference is missing
- **WHEN** a configured featured or cast key is unknown, wrong-type, duplicated, or non-selectable
- **THEN** the catalog configuration SHALL fail as a whole
- **AND** no shortened or reordered shortcut group SHALL be emitted

### Requirement: Staff-set extension SHALL be strict and dormant

The active versioned staff-set configuration SHALL be exactly
`schemaVersion: 1` with an empty `sets` array, producing zero `staff_set`,
`staff_set_member`, and `staffSet` catalog entities. The contract SHALL also
include non-active synthetic positive and negative cases for the extension.

A future entry SHALL use
`staffset:{book|anime|music|game|real}:{slug}`, where slug is an explicitly
assigned 1–64 character lowercase ASCII kebab token and the full key is at
most 96 bytes. Its embedded type SHALL equal `subjectType`; `label` SHALL be
non-empty; `displayOrder` SHALL be positive; and it SHALL contain at least two
unique, selectable, same-type exact `staff:*` members from the current common
catalog. Cast, nested staff sets, cross-type members, cycles, exclusions,
weights, unknown keys, and configured capability overrides SHALL be rejected.

The compiled position SHALL use `kind=staffSet`, `names.cn=label`, null
English/Japanese names, sorted member references, a `staffSetUnion` rule, and
the conservative intersection of member and subject-type capabilities. Every
active set SHALL appear in the unique
`custom:{type}:staff-sets` group; configuration presence alone activates it,
with no enabled flag, date, admin API, or hot reload.

#### Scenario: Current active configuration is compiled
- **WHEN** the repository's version-1 staff-set document is validated
- **THEN** its set list and every staff-set/catalog-member table projection SHALL be empty

#### Scenario: Synthetic valid staff set is compiled
- **WHEN** a synthetic same-type set has a valid key, label, order, and two unique exact staff members
- **THEN** one set/entity, two sorted members, one union rule, conservative capabilities, and one custom-group reference SHALL be produced

#### Scenario: Invalid staff-set rule is supplied
- **WHEN** a set has an invalid/duplicate/unknown/cast/cross-type/nested member, bad key/type/label/order, or a capability override
- **THEN** the complete configuration SHALL fail
- **AND** no partial set or snapshot SHALL be admitted

### Requirement: Exact cast evidence SHALL be complete and non-inferential

The contract SHALL derive `valid_cv` from every otherwise valid
`subject-persons` person in the full input, independent of position resolution
or the cast subject. For anime/game only, a cast candidate SHALL exist only
when `subject-characters` and `person-characters` share the exact same
`(subjectId, characterId)`, both referenced entities and the subject are valid,
and the person belongs to that global whitelist. The emitted row SHALL retain
the exited authority's raw numeric role value exactly, plus source order,
`eligible=1`, and
`provenance=exact`. Subject relations, series identity, a same Character ID in
another work, and candidate works SHALL never create an edge.

The contract SHALL produce exactly `cast:anime:main`,
`cast:anime:all`, `cast:game:main`, and `cast:game:all`. Main SHALL select only
raw role value `1`; all SHALL select every eligible exact raw role and
therefore be a superset of main. Each same-type pair SHALL share one canonical
exclusive rule identity; no cast key SHALL exist for book/music/real.

`correct-archive-raw-domain-semantics` reconciled the root schema, producer
goldens/verifier, and Go consumer on integer roles `1..6` with `main=1`. This
corpus SHALL enumerate every admitted raw numeric role and count from
complete-source evidence; unknown values SHALL block. This change SHALL NOT
choose a mapping, alter root authority, or collapse values.

#### Scenario: Global whitelist and exact join succeed
- **WHEN** a person has any valid `subject-persons` record and an exact same-subject person/character relation on an anime or game subject
- **THEN** one eligible exact cast row SHALL be emitted
- **AND** it SHALL be selected by all and by main only when its preserved raw role is `1`

#### Scenario: Another work has the only cast relation
- **WHEN** the same Character ID has a person relation only on a related or series work
- **THEN** the target work SHALL receive no cast row
- **AND** no relation traversal, series merge, or candidate inference SHALL run

#### Scenario: Role authority drifts
- **WHEN** schema, producer, or consumer no longer matches the exited raw-domain authority, or an observed numeric role is outside `1..6`
- **THEN** Contracts handoff and all Updater apply SHALL stop
- **AND** no private mapping, value collapse, or root-authority edit SHALL be made by this change

### Requirement: Cast quality classifications SHALL be exact and bounded

For every valid anime/game subject, `NO_CHARACTERS` SHALL count subjects with
no valid same-subject `subject-characters` rows.
`NO_CAST_RELATIONS` SHALL count subjects with no exact same-subject
person-character join before `valid_cv` filtering, including subjects with no
characters. `FILTERED_BY_VALID_CV` SHALL count exact joined cast edges removed
because the person is absent from the global whitelist. These classes are
diagnostic and MAY overlap as defined; non-zero accepted upstream gaps SHALL
not authorize inference.

The manifest counts SHALL exactly equal recomputation. Bounded detailed
evidence SHALL include deterministic totals and sorted samples sufficient to
distinguish the three classes without publishing an unbounded report.
Malformed/conflicting relations, bad references, unmapped roles, missing
required classifications, count mismatch, configured complete-source bound
failure, or nondeterministic samples SHALL block the snapshot. A declared
non-zero source gap inside accepted bounds SHALL remain visible but SHALL not
be rewritten as a cast edge.

#### Scenario: Missing-data classes are distinguished
- **WHEN** synthetic subjects respectively have no characters, characters but no exact person relation, and an exact relation rejected only by `valid_cv`
- **THEN** the three declared counts and sorted samples SHALL match their exact definitions
- **AND** no missing case SHALL produce inferred cast

#### Scenario: Quality evidence is inconsistent
- **WHEN** a recomputed count/sample differs, a required class is omitted, or a blocking relation/mapping/configuration invariant fails
- **THEN** the candidate SHALL fail before manifest finalization
- **AND** no partial catalog/cast data SHALL be published
