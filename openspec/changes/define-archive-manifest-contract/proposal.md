## Why

Wave 1 needs one language-neutral Archive contract before the Python producer or Go consumer can be bootstrapped. The oracle’s mutable MySQL loader deletes source files before replacement, uses row counts as freshness, and upserts without a versioned manifest, so it cannot prove completeness, compatibility, digest identity, or fail-safe handoff.

## What Changes

- Add a versioned SQLite Archive identity and schema contract, including fixed schema/application versions, the seven exact source basenames/accounting equation, preserved unknown-position raw credits, and required metadata, tables, indexes, and invariants.
- Add strict JSON Schemas for the Archive manifest, the non-activating current-pointer shape, and the canonical data-version input.
- Define cycle-free `dataVersion`, file-digest, manifest-digest, compatibility, and path-safety rules.
- Add a closed, language-neutral golden bundle with one minimal valid Archive pinned to the approved common commit, schema-invalid and semantically invalid manifests/pointers, damaged/incompatible/count-drifted SQLite fixtures, and expected stable validation outcomes.
- Add contract-local, development-only verification tooling for JSON Schema validation, digest/vector checks, SQLite fixture inspection, and temporary Python/Go model-generation smoke tests.
- **BREAKING**: the old oracle loader’s row-count freshness check, mutable MySQL upsert model, unversioned files, and delete-before-validate behavior are evidence only and are not compatible Archive contracts.
- Define only contract artifacts. This change does not download Bangumi data, build a complete Archive, write a runtime `current.json`, activate a version, or implement either language runtime.

Behavior classification:

- `PRESERVE_ORACLE`: no user-visible UI, interaction, copy, state, or responsive behavior changes; the immutable comparison oracle remains `644b7748674e553f863d0ffd61d029f86fdc0717`.
- `INTENTIONAL_DELTA`: the oracle’s mutable loader/update behavior is rejected in favor of staged immutable, versioned, digest-checked artifacts under `DR-DATA-PIPELINE-001`, `DR-DATA-SCHEMA-001`, the backend development guide §3, and the formal master plan Wave 1.
- `NEW_CAPABILITY`: the SQLite/manifest/dataVersion contract and cross-language validation vectors did not exist in the oracle.

## Capabilities

### New Capabilities

- `contracts-archive-manifest`: Defines the language-neutral Archive SQLite identity, manifest/current-pointer schemas, deterministic dataVersion and digest rules, compatibility policy, path-safety boundary, fixtures, and validation vectors consumed later by Python and Go.

### Modified Capabilities

None.

## Impact

- **Status**: proposed; apply is blocked until proposal, specs, design, and tasks all pass strict validation and main-agent review, and the main agent explicitly approves the exact planning artifacts.
- **Owner**: Contracts owner for `contracts-archive-manifest`; all apply, commit, and archive mutations are performed by delegated subagents. The main agent may amend OpenSpec artifacts and performs read-only review/acceptance.
- **Writable paths**: exactly `contracts/schemas/archive/**` and `contracts/goldens/archive/**`.
- **Read-only protected inputs**: `PRODUCT.md`; `DESIGN.md`; `openspec/config.yaml`; `openspec/specs/contracts-rewrite-baseline/spec.md`; `tmp-formal-development/formal-development-master-plan.md`; `tmp-formal-development/backend-development-implementation-guide.md`; `tmp-formal-development/backend-operations-implementation-guide.md`; `tmp-formal-development/data-logic-implementation-guide.md`; `tmp-formal-development/decisions/prototype-data-logic-audit.md`; `.agents/skills/impeccable/**`; `.impeccable/design.json`; and all paths at oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`, especially `backend/scripts/fetch_latest_jsonlines.py`, `backend/scripts/update_database.py`, `backend/init-sql/schema.sql`, `backend/Dockerfile.loader`, and `backend/docker-compose.yml`.
- **Deletion complement**: every repository path outside the two writable subtrees; within them, any pre-existing path not explicitly enumerated by the approved design/tasks remains protected. The concurrently applied sibling `define-shared-query-wire` paths are tolerated read-only dirty state, never writable by this owner. Apply creates contract files and MUST NOT delete or rename unrelated files.
- **Mutable refs**: before apply, one delegated checkpoint subagent may update `refs/heads/codex/formal-rewrite` exactly once from parent `e5d67d7d74614b7a95da4a7887caa8e1f25bc307` using subject `docs(openspec): approve wave 1 shared contracts` and a delta containing only the two main-agent-approved Wave 1A change directories. During parallel apply, only `openspec/changes/define-archive-manifest-contract/tasks.md` checkbox transitions may change; the index and every Git ref remain immutable. After both candidates pass main-agent acceptance and both apply agents have stopped, one delegated finalization subagent alone may update that branch through the single approved combined phase commit. No other ref is mutable.
- **Consumes**: the archived `contracts-rewrite-baseline` capability, formal master plan Wave 1, backend development guide §3, data guide Phases 0–1, accepted `DR-DATA-PIPELINE-001` and `DR-DATA-SCHEMA-001`, and read-only oracle evidence.
- **Produces**: versioned Archive JSON Schemas and SQLite DDL; a compatibility matrix; canonical dataVersion/digest vectors; closed valid/invalid fixtures; contract-local verification and generation-feasibility evidence.
- **Dependencies**: `establish-formal-rewrite-baseline` is complete and archived; this change has no semantic dependency on `define-shared-query-wire` or on the not-yet-created Python/Go runtimes, but it shares the reviewed Wave 1A parallel-apply/finalization checkpoint with `define-shared-query-wire`.
- **Deliverables**: an apply-ready and strictly validated `contracts-archive-manifest` spec plus, after apply, the complete contract/golden candidate under the two writable paths; the accepted Archive and query candidates are archived and committed together by one finalization subagent in the Wave 1A phase commit.
- **Acceptance**: schemas compile strictly; every fixture is indexed exactly once and yields its named outcome; the valid SQLite fixture’s byte digest, embedded metadata, required objects, manifest, pointer vector, directory identity, and dataVersion agree; corrupt/unsupported/path-unsafe cases fail closed; repeated dataVersion calculation is byte-stable; temporary Python and Go models generate without schema-level error and pass syntax/compile smoke where the local toolchain supports it; all checks are path-scoped; the common index stays empty during parallel apply; the diff is confined to this owner’s paths/task checkboxes plus the snapshotted sibling’s exact declared paths; no apply agent stages, commits, or archives.
- **Non-goals**: Python/Go application packages; runtime consumer/producer tests; full Archive download/build; live Bangumi/common fetch; collection persistence; query/statistical logic; API/UI work; an actual `current.json`; version activation; scheduler, daemon, migration, deployment, or cleanup.
- **Operations deferred**: production directories, permissions, nginx, systemd, Compose, timers, `flock`, current-pointer switching, restart/readiness rollback, retention, secrets, release, deploy, host changes, and legacy deletion require later user-approved operations changes.
- **External repositories/state**: no other repository or production state is written. Apply may read the pinned npm registry packages needed for contract-local development tooling, but MUST NOT download Archive/common datasets or mutate remote repositories, refs, releases, hosts, or services. Push, PR, tag, release, deployment, and production activation remain separate authorization gates.
- **Stop/rollback conditions**: stop before mutation on branch/HEAD mismatch, a non-empty index, dirty/untracked/ignored state outside this change plus the sibling’s exact snapshotted task/apply paths, path overlap, sibling-baseline ambiguity, unavailable or drifted pinned tooling, schema/vector ambiguity, digest mismatch, nondeterministic output, or any required write outside the declared boundary. Preserve the workspace; do not reset, checkout, clean, recursively delete, auto-expand scope, stage, commit, or archive during parallel apply. Candidate rollback is limited to an exact subagent-owned patch of this change’s newly created files; after the combined reviewed phase commit, corrections require a new reviewed commit rather than history rewriting.
