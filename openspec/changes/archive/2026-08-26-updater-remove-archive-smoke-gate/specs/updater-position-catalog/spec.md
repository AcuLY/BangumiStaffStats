## Capability Boundary

| Field | Boundary |
|---|---|
| Status | Modified capability; strict validation and review required before apply |
| Owner | Updater |
| Writable paths | Smoke-specific acceptance text/tests within declared change scope and lifecycle root spec |
| Read-only protected inputs | Catalog configs, schemas, derivation code, goldens and existing Archives |
| Deletion complement | Remove only Go-smoke acceptance coupling |
| Mutable refs | Local topic branch only |
| Consumes | Existing catalog/cast derivation and producer validation |
| Produces | Producer-authoritative catalog/table/quality evidence |
| Dependencies | Contracts -> Updater producer |
| Deliverables | Updated integration tests/spec text with no Go smoke requirement |
| Acceptance | Full catalog/producer/Python/complete-source gates |
| Non-goals | Change catalog semantics, rules, dataVersion or tables |
| Operations deferred | Activation and deployment |
| Stop/rollback conditions | Stop on semantic/determinism/quality regression |

## MODIFIED Requirements

### Requirement: Catalog and cast SHALL enter identity before immutable finalization

The derivation stage SHALL run inside the accepted producer's fresh SQLite
staging transaction before indexes, integrity/read-only checks, dataVersion,
manifest bytes, and inactive atomic publication. It SHALL populate only the
accepted SQLite v1 staff/category/credit/staff-set/catalog tables and use the
accepted manifest fields. It SHALL not alter schema SQL, manifest shape/version,
the dataVersion algorithm, or an already finalized Archive.

The manifest's `commonCommit`/`commonDigest` SHALL identify the exact common
bytes; `catalogConfigDigest` SHALL identify the canonical governed
configuration; `castRulesVersion` SHALL identify the exited raw-domain role
plus exact/global-whitelist rules; and all SHALL enter the existing canonical
dataVersion preimage. Identical Archive/common/config/rule inputs SHALL produce
the same dataVersion and logical rows regardless of run path/time or input
staff-set member order. Any semantic change SHALL produce a different identity.
The accepted producer SHALL recompute table counts, quality counts, logical
rows, digest graph, and SQLite integrity before publication.

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
checks, accepted producer integration, and one explicit disposable
complete-source Archive/common derivation with bounded memory and reports.
OpenSpec change/all strict validation, doctor, Git diff/inventory/index checks,
and absence of owned `.cache/.tmp/.venv` residue SHALL gate handoff. Only an
unstaged local catalog/cast producer candidate may be claimed; API/UI/query,
activation, operations, commit, push, release, and deployment remain absent.

#### Scenario: Development candidate passes
- **WHEN** all synthetic, complete-source, producer, Python, OpenSpec, inventory, and residue gates pass
- **THEN** status MAY report catalog/cast implementation verified for main-agent review
- **AND** it SHALL NOT report API/UI/operations, commit, push, release, deployment, or production completion

#### Scenario: Any acceptance gate fails
- **WHEN** one contract, source, quality, determinism, protected-path, inventory, or residue gate fails
- **THEN** handoff SHALL stop with bounded evidence and no final candidate
- **AND** protected paths, prior versions, external state, and refs SHALL remain unchanged
