## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency review plus strict planning-artifact validation |
| Owner | Updater owner applies only after the Contracts block is main-agent accepted; main agent performs final acceptance. |
| Writable paths | `updater/config/catalog/**`, `updater/src/bangumi_staff_stats_updater/catalog/**`, `updater/src/bangumi_staff_stats_updater/producer/**`, `updater/tests/catalog/**`, `updater/tests/producer/**`, and Updater task markers in this change only. |
| Read-only protected inputs | All Contracts files, root specs, archived changes, updater foundation/contract adapter/CLI/package/lock/root README and other updater paths, all backend/frontend code, guides/oracle, refs/remotes, hosts, and production. |
| Deletion complement | None; existing producer behavior, inputs, tests, configurations, versions, and contract evidence may not be deleted or weakened. |
| Mutable refs | None; no stage, commit, sync/archive, ref mutation, push, tag, release, or deploy. |
| Consumes | Accepted Contracts catalog handoff, archived `produce-immutable-archive`, exited `correct-archive-raw-domain-semantics`, accepted Archive/common/config identities, its fresh-SQLite staging/finalization hooks, and the existing PyYAML/runtime foundation. |
| Produces | Canonical catalog configuration, deterministic staff/category/group/shortcut/staff-set/cast rows, bounded quality evidence, and an accepted producer candidate whose manifest/dataVersion cover those semantics. |
| Dependencies | Direct DAG dependency `produce-immutable-archive` MUST be accepted and archived before apply; `correct-archive-raw-domain-semantics` has already exited; Contracts owner then finishes and is accepted before Updater starts. |
| Deliverables | Versioned configuration, strict parser/compiler modules, producer integration, golden/unit/property/quality/complete-source tests, and owner-scoped evidence. |
| Acceptance | All catalog goldens, full updater/producer gates, exact dataVersion/manifest checks, disposable complete-source smoke, protected-path/inventory/residue checks, and strict OpenSpec gates pass. |
| Non-goals | Root contract changes, cross-work cast, legacy mapping compatibility, active staff sets, query/statistical/API/frontend work, collection data, activation/current pointer, scheduling, or operations. |
| Operations deferred | Production acquisition/root/credentials, recurring runs, locks, activation/retention/rollback, restart/readiness, monitoring, release, and deployment. |
| Stop/rollback conditions | Hard-stop on unmet producer dependency or drift from the exited raw-domain authority; also stop on Contracts/path drift, protected-path integration need, invalid source/config/quality, or producer gate failure. Remove only owned disposable staging/candidate; preserve all prior versions and protected inputs. |

Dependency direction SHALL be `contracts-position-catalog` to
`updater-position-catalog` to the already accepted Archive producer/Go smoke.
Updater SHALL NOT modify or import backend code, and no later consumer may make
Updater runtime code its authority.

## ADDED Requirements

### Requirement: Apply SHALL begin only from the exited producer and accepted Contracts handoff

Before any write, the Updater owner SHALL prove that
`produce-immutable-archive` is main-agent accepted, synchronized, archived,
and absent from active changes; its root capabilities and producer
implementation/gates are present; the Contracts catalog block is complete and
accepted with exact schema/index/case hashes; the index is empty; HEAD and
allowed dirty paths are recorded; and the exact Updater writable/protected
sets do not overlap another active owner. The implementation SHALL use only an
accepted pre-finalization producer hook inside the declared producer subtree.
If integration requires `cli.py`, `archive_contract.py`, package/lock/root
README, Archive Contracts, or another protected path, apply SHALL stop for
main review instead of broadening itself.

#### Scenario: Dependency and handoff are exact
- **WHEN** the archived producer, accepted Contracts seal, workspace state, and disjoint owner paths all match
- **THEN** the Updater owner MAY create one unstaged candidate inside its exact writable set

#### Scenario: Producer or owner boundary drifts
- **WHEN** the dependency remains active/unaccepted, a Contracts byte differs, the index is non-empty, another owner overlaps, or a protected integration edit is needed
- **THEN** Updater apply SHALL stop before mutation
- **AND** it SHALL NOT edit, stage, clean, reset, or reinterpret the dependency

### Requirement: Common catalog compilation SHALL be complete and deterministic

The Updater SHALL fatal-UTF-8 decode and strictly parse the exact acquired
`subject_staffs.yml` with duplicate-key rejection, safe YAML loading, and
post-parse shape/bounds validation. It SHALL verify the exact resolved common
commit/digest already used by the producer, map only the accepted five subject
types, and compile every common position/category according to the Contracts
goldens. New valid positions/categories SHALL require no code enum change;
renames/category changes/deletions SHALL produce a deterministic structured
diff and a new snapshot identity.

It SHALL insert one `staff_position` and one exact selectable
`catalog_position` for every common `(type,id)`, ordered category/reference and
selection/capability rows, and no placeholder for an unknown raw staff
position. Names, categories, ordering, keys, and selection rules SHALL match
the Contracts output byte-for-byte/logical-row-for-logical-row. Official
positions 101–106 SHALL remain exact staff only.

#### Scenario: Five-type common input is compiled
- **WHEN** a valid common source covers book, anime, music, game, and real with multi-category and uncategorized positions
- **THEN** every `(type,id)` SHALL appear exactly once as an exact staff entity
- **AND** all group references, names, orders, and fallback membership SHALL match the contract

#### Scenario: Common input drifts unsafely
- **WHEN** UTF-8/YAML/shape/duplicate-key/type/category/name/order/reference bounds fail or an unknown source shape appears
- **THEN** compilation SHALL stop before any finalized catalog or manifest
- **AND** no legacy/static mapping SHALL be used as fallback

### Requirement: Display groups, shortcuts, and staff sets SHALL compile from governed configuration

The repository SHALL contain versioned display configuration with the exact
anime/game featured shortcuts and cast-group anchors and a version-1
staff-set configuration whose active `sets` array is empty. Updater SHALL
validate both through the Contracts schemas, canonicalize them through the
shared algorithm, recompute `catalogConfigDigest`, and compile only resolved
same-type position references.

Bangumi categories, fallback groups, multi-parent references, voice groups,
featured groups, and empty/non-empty synthetic staff-set projections SHALL
match Contracts goldens. Position entities SHALL remain unique regardless of
the number of display references. Active configuration SHALL create zero staff
sets; the tested extension SHALL enforce exact same-type staff members,
conservative capabilities, deterministic order, and all-or-nothing failure.
No configuration shall create query credits, translated names, inferred
members, enabled dates, or hot reload.

#### Scenario: Current repository configuration compiles
- **WHEN** the exact display and empty staff-set files are processed with a valid common catalog
- **THEN** all fixed shortcut/cast/fallback/category groups SHALL resolve in exact order
- **AND** staff-set tables and entities SHALL remain empty

#### Scenario: One catalog reference or staff-set rule is invalid
- **WHEN** a shortcut/anchor/member is missing, duplicated, cross-type or non-selectable, or any staff-set invariant fails
- **THEN** the entire catalog configuration SHALL fail before Archive finalization
- **AND** Updater SHALL not skip, shorten, reorder, or partially compile it

### Requirement: Cast SHALL use only exact same-subject evidence and the accepted global whitelist

Updater SHALL build the global `valid_cv` person set from all valid
`subject-persons` rows before common-position resolution. For anime/game
subjects, it SHALL join `subject-characters` to `person-characters` only on
the exact `(subjectId, characterId)`, validate referenced subject/person/
character identities, apply the global whitelist, and emit only
`eligible=1`, `provenance=exact` rows preserving the separately accepted raw
numeric role and source order. It SHALL not read `subject_relation`, series components,
candidate works, or another subject's relation to fill a missing edge.

Raw role representation SHALL come only from the exited
`correct-archive-raw-domain-semantics` authority, not a mapping owned here.
Updater SHALL preserve every admitted numeric value, execute the complete
Contracts role inventory, and reject unknown values. It SHALL never derive
cast from `subject-persons.position`,
including official 101–106. `cast:*:main` SHALL select raw role `1` as a strict
subset of `cast:*:all`, and same-type main/all SHALL share the canonical
exclusive rule identity.

#### Scenario: Exact cast survives global whitelist
- **WHEN** a globally eligible person has a same-subject person/character edge on a valid anime/game subject
- **THEN** Updater SHALL emit one exact eligible cast row
- **AND** all SHALL contain it while main SHALL contain it only for preserved raw role `1`

#### Scenario: Relation exists only outside the subject
- **WHEN** a related work has the same Character ID and a valid person relation but the target work does not
- **THEN** the target SHALL receive no cast row
- **AND** actual participation may remain zero

#### Scenario: Staff/cast numeric collision is exercised
- **WHEN** `subject-persons` contains common anime position 104 and character sources also contain cast role values
- **THEN** the staff record SHALL produce only `staff:anime:104`
- **AND** cast SHALL derive only from the exact character join under `cast:*`

### Requirement: Quality evidence SHALL distinguish accepted gaps from blocking faults

Updater SHALL recompute `NO_CHARACTERS`, `NO_CAST_RELATIONS`, and
`FILTERED_BY_VALID_CV` with the Contracts-defined units and ordering, carry
their exact counts into the accepted manifest, and emit bounded deterministic
samples outside the closed version pair. Non-zero accepted missing-source
classes SHALL remain explicit diagnostics and SHALL never trigger cross-work
inference.

Malformed/conflicting relations, invalid references, unknown role mapping,
missing quality classes, count/sample mismatch, non-determinism, or a declared
complete-source bound/sentinel failure SHALL be blocking. The complete-source
gate SHALL report structured common additions/renames/category changes/
deletions, unknown used staff IDs, role-value inventory, class totals, bounded
samples, and every blocking decision. A failed gate SHALL leave no consumable
candidate.

#### Scenario: Accepted missing data is present
- **WHEN** a complete source contains subjects without characters, without exact cast relations, or filtered only by `valid_cv` within reviewed bounds
- **THEN** exact counts and bounded samples SHALL be published as diagnostic evidence
- **AND** no inferred row SHALL be added

#### Scenario: Blocking quality invariant fails
- **WHEN** a relation/mapping/reference/configuration invariant or a declared complete-source bound fails
- **THEN** the producer SHALL fail before manifest finalization/publication
- **AND** every prior immutable version SHALL remain unchanged

### Requirement: Catalog and cast SHALL enter identity before immutable finalization

The derivation stage SHALL run inside the accepted producer's fresh SQLite
staging transaction before indexes, integrity/read-only checks, dataVersion,
manifest bytes, Go consumer smoke, and inactive atomic publication. It SHALL
populate only the accepted SQLite v1 staff/category/credit/staff-set/catalog
tables and use the accepted manifest fields. It SHALL not alter schema SQL,
manifest shape/version, the dataVersion algorithm, or an already finalized
Archive.

The manifest's `commonCommit`/`commonDigest` SHALL identify the exact common
bytes; `catalogConfigDigest` SHALL identify the canonical governed
configuration; `castRulesVersion` SHALL identify the exited raw-domain
role plus exact/global-whitelist rules; and all SHALL enter the existing canonical
dataVersion preimage. Identical Archive/common/config/rule inputs SHALL produce
the same dataVersion and logical rows regardless of run path/time or input
staff-set member order. Any semantic change SHALL produce a different identity.
The accepted producer and Go smoke SHALL recompute table counts, quality
counts, logical rows, digest graph, and SQLite integrity before publication.

#### Scenario: Identical semantics are rebuilt
- **WHEN** the same Archive/common/config/rule inputs are processed in different staging roots with reordered equivalent staff-set members
- **THEN** catalog/cast logical rows, configuration digest, quality evidence, and dataVersion SHALL be identical

#### Scenario: Derivation is attempted after finalization
- **WHEN** catalog/cast compilation would modify manifest bytes, SQLite, or identity after the accepted producer's finalization boundary
- **THEN** the operation SHALL fail
- **AND** no copy/patch/overwrite of an immutable version SHALL occur

### Requirement: Acceptance SHALL cover synthetic and complete sources without broadening scope

Updater tests SHALL execute every indexed catalog case, the accepted Archive
producer cases, empty and synthetic staff sets, common additions/deletions,
multi-category/fallback/order rules, fixed shortcuts, official 101–106, the
position-104 oracle sample, exact/cross-work cast, global `valid_cv`, all
accepted role values, main-subset-all, every quality class, invalid
configuration, deterministic canonicalization, and failure cleanup.

The owner SHALL also run full Python format/lint/type/unit/property/build
checks, accepted producer/Go-smoke integration, and one explicit disposable
complete-source Archive/common derivation with bounded memory and reports.
OpenSpec change/all strict validation, doctor, Git diff/inventory/index checks,
and absence of owned `.cache/.tmp/.venv` residue SHALL gate handoff. Only an
unstaged local catalog/cast producer candidate may be claimed; API/UI/query,
activation, operations, commit, push, release, and deployment remain absent.

#### Scenario: Development candidate passes
- **WHEN** all synthetic, complete-source, producer, Go-smoke, Python, OpenSpec, inventory, and residue gates pass
- **THEN** status MAY report catalog/cast implementation verified for main-agent review
- **AND** it SHALL NOT report API/UI/operations, commit, push, release, deployment, or production completion

#### Scenario: Any acceptance gate fails
- **WHEN** one contract, source, quality, determinism, consumer, protected-path, inventory, or residue gate fails
- **THEN** handoff SHALL stop with bounded evidence and no final candidate
- **AND** protected paths, prior versions, external state, and refs SHALL remain unchanged
