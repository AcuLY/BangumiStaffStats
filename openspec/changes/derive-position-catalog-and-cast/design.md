## Context

`produce-immutable-archive` owns acquisition, fresh SQLite construction,
manifest/dataVersion finalization, Go smoke, and inactive publication. The
accepted SQLite v1 shape already reserves staff, cast, staff-set, catalog,
group, capability, and selection-rule tables, while this Wave 2 change owns
their production semantics. PRODUCT requires a dynamic common-backed catalog,
fixed shortcuts, distinct staff/cast namespaces, and exact-only cast.

`correct-archive-raw-domain-semantics` has exited: the root schema, Contracts
goldens/verifier, and Go consumer now preserve cast roles as integers `1..6`,
positive relation codes in source direction, and all five subject types. The
Archive producer is still the direct execution dependency, so this change's
apply gate remains closed only until `produce-immutable-archive` is accepted,
synchronized, archived, and absent from active changes.

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency review plus strict change/all validation and doctor passed |
| Owner | Contracts owner first; after main acceptance, one Updater owner; main agent accepts each block. |
| Writable paths | Planning: `openspec/changes/derive-position-catalog-and-cast/**`. Contracts: `contracts/schemas/catalog/**`, `contracts/goldens/catalog/**`, own markers. Updater: `updater/config/catalog/**`, `updater/src/bangumi_staff_stats_updater/catalog/**`, `updater/src/bangumi_staff_stats_updater/producer/**`, `updater/tests/catalog/**`, `updater/tests/producer/**`, own markers. |
| Read-only protected inputs | Archive/query Contracts and root specs, archived dependency, all other updater paths, backend/frontend, authorities, other changes/tasks, refs/remotes, hosts, and production. |
| Deletion complement | None. |
| Mutable refs | None. |
| Consumes | Exited producer and exited `correct-archive-raw-domain-semantics`; Archive/updater foundations; exact Archive/common sources; PRODUCT, guides, audit/oracle; Contracts catalog handoff. |
| Produces | Strict catalog contracts/goldens; canonical configuration/digest; deterministic staff/group/shortcut/staff-set/cast/quality rows in a producer candidate. |
| Dependencies | `produce-immutable-archive` accepted/synchronized/archived; `correct-archive-raw-domain-semantics` already exited; then Contracts acceptance before Updater. |
| Deliverables | Schemas/index/cases/verifier; versioned configs; catalog/cast compiler and producer adapter; synthetic and complete-source evidence. |
| Acceptance | Closed Contracts corpus; exact dynamic/group/shortcut/staff-set/cast/quality semantics; deterministic manifest/dataVersion; producer/Go/Python/OpenSpec/inventory/residue gates. |
| Non-goals | Root-authority fix, inference, legacy mapping, active staff sets, API/query/domain/UI/collection/activation/operations. |
| Operations deferred | Production acquisition/roots/credentials, schedule/lock, activation/retention/rollback/restart, monitoring, release/deploy/cutover. |
| Stop/rollback conditions | Hard-stop on the unmet producer dependency or any raw-domain authority drift, then on path/config/source/quality/integration drift. Remove only owned staging/candidate; preserve protected inputs/prior versions. |

Dependency direction is strictly
`contracts-position-catalog -> updater-position-catalog -> accepted producer
pre-finalization hook -> accepted Go smoke`. No backend package imports Updater
and no later consumer treats Python runtime code as authority.

## Goals / Non-Goals

**Goals:**

- Compile all five current common catalogs without a static position enum.
- Preserve one entity per PositionKey while allowing many display references.
- Implement exact same-subject cast with the accepted global `valid_cv`.
- Keep staff sets dormant but fully validated and testable.
- Bind all catalog/cast semantics into the existing immutable identity.

**Non-Goals:**

- Reopen or reinterpret the exited raw-domain authority in this change.
- Infer cast across works/series or preserve legacy numeric voice aliases.
- Add catalog/query HTTP, Go statistics, frontend selection/search, activation,
  resident work, or production operations.

## Decisions

### Use two sequential owner blocks and an exited-dependency gate

Contracts first creates strict, language-neutral evidence. Updater consumes
exact accepted hashes and cannot edit them. Apply preflight requires the
producer to be archived and verifies the already exited raw-domain authority. This
prevents a catalog implementation from stabilizing an unaccepted producer or
privately changing shared data meaning.

Alternatives rejected: parallel schema/runtime work permits private contract
drift; implementing inside the producer change violates the master DAG and
owner boundary.

### Keep one small closed Contracts package

The Contracts block uses strict catalog/config/case/quality/index schemas,
`contracts/goldens/catalog/index.json`, compact cases for dynamic five-type
positions, groups/shortcuts, exact cast/quality, positions 101–106, empty and
synthetic staff sets, and an invalid matrix. A catalog-local verifier checks
fatal UTF-8, strict JSON Schema, closed regular-file inventory, hashes,
canonical bytes, and recomputed outcomes.

The verifier may reuse exact `ajv@8.20.0` as a Contracts-only development
dependency with an exact local package/lock and scripts disabled. It adds no
product/runtime dependency; cache, `node_modules`, and `.tmp` remain disposable
below `contracts/schemas/catalog/**`. A handwritten loose validator and reuse
of another capability's private installed tree were rejected.

### Separate common identity from governed catalog configuration

Updater stores versioned `display-v1.yaml` and `staff-sets-v1.yaml` below
`updater/config/catalog/`. Display config owns the exact featured shortcuts,
cast-group anchors, and explicit capability matrix; staff sets are exactly
`schemaVersion: 1, sets: []`. PyYAML `6.0.3` is already admitted by the producer,
so this change adds no runtime dependency.

After strict parse, one fixed-field UTF-8/LF canonical document is hashed.
Shortcut/group order remains semantic; staff-set members are sorted for
identity but duplicates fail; sets sort by type/order/key. The digest covers
display/staff-set semantics only. Exact common bytes remain separately covered
by `commonCommit/commonDigest`, so either input changes dataVersion without
double-counting authority.

### Compile common entities and display references independently

Common parsing rejects invalid UTF-8, duplicate YAML keys, unsafe shapes, and
unknown type/category structure. Empty localized names become null and a
missing usable Chinese label blocks. Positive order sorts first; then
non-positive/missing values retain source order with stable ID tie-breaks.

Group keys are:

- `bangumi:{type}:{categoryKey}`;
- `fallback:{type}:other|all`;
- `shortcut:{type}:featured|cast`;
- `custom:{type}:staff-sets`.

Multi-category and shortcut occurrences insert references to one canonical
position. Voice groups anchor immediately after the common sound group.
Missing anchors or keys block. Exact staff/cast positions explicitly support
the five catalog capabilities `rankings`, `candidates`, `personDetail`,
`partners`, and `coStar`; staff-set capabilities are the conservative member
intersection. No absence-based or prefix-based capability guess is allowed.

Exact-staff and staff-set rules use their canonical key. Same-type cast main/all
share `exclusive:cast:{type}`; each row retains its exact selection value.
This represents exclusivity without changing the accepted SQLite schema.

### Derive cast with on-disk exact joins

The producer streams valid person/subject-character relations into owned
temporary SQLite staging tables, derives the global `valid_cv` set from all
valid `subject-persons`, and joins only on exact `(subjectId, characterId)`.
Temporary objects are dropped before the accepted 35-object seal. This bounds
memory and avoids relation/series traversal.

The exited raw-domain authority requires the stage to preserve numeric roles
`1..6`; `main` selects `1`, while `all` selects every admitted value.
Positions 101–106 flow only from common/`subject-persons` to staff rows.

Quality SQL recomputes `NO_CHARACTERS` per eligible subject,
`NO_CAST_RELATIONS` per eligible subject before whitelist filtering, and
`FILTERED_BY_VALID_CV` per removed exact edge. Non-zero accepted gaps are
diagnostic, not inference permission; malformed/conflicting/unmapped/count or
complete-source bound failures block.

### Integrate before every immutable identity gate

The catalog stage runs after source normalization but before final indexes,
integrity/read-only reopen, logical digests, dataVersion, manifest, Go smoke,
and atomic inactive publication. The Updater adds a catalog module subtree and
one adapter inside the accepted producer subtree; preflight records the exact
existing orchestration file before touching it. No other producer file may
drift unexplained.

Patching a finalized Archive, changing schema/manifest/dataVersion authority,
or adding another publication path is forbidden.

## Risks / Trade-offs

- [Common shape or shortcut anchor drifts] → strict parse, structured diff, and
  all-or-nothing complete-source gate.
- [Raw-domain authority is accidentally normalized locally] → exact
  cross-layer authority seals and a hard stop on any drift.
- [Display references duplicate entities] → separate entity/reference goldens
  and unique PositionKey counts.
- [Full cast relations exceed memory] → temporary on-disk exact joins and
  bounded deterministic samples.
- [Broad producer subtree hides unrelated edits] → dependency-exit inventory,
  exact integration-file record, owner-scoped diff/seal, and no deletions.
- [Missing real cast data is mistaken for an error to repair] → three explicit
  diagnostic classes and an absolute ban on inference.

## Migration Plan

1. Keep this turn planning-only; obtain strict validation and main review.
2. Preserve the already exited raw-domain correction without private mapping.
3. Accept, synchronize, and archive `produce-immutable-archive`.
4. Contracts owner applies, verifies, and stops for main acceptance.
5. Updater owner applies against the sealed handoff, runs synthetic plus
   disposable complete-source gates, and stops with an unstaged candidate.
6. Main agent reviews status separately; no archive/commit/deploy is implied.

Rollback during apply removes only the unique owned staging/candidate. It never
mutates an existing version, pointer, protected contract, or ref.

## Open Questions

No discretionary implementation question is delegated to apply. The only
remaining execution prerequisite is exit of `produce-immutable-archive`; the
raw-domain authority has already been reconciled and exited.
