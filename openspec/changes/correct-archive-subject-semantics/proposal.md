## Why

The initial Archive v1 `subject` table cannot enforce the approved product
semantics: it has no authoritative NSFW flag and accepts only a loosely shaped
day date, while `PRODUCT.md`, backend query rules, and accepted
`DR-DATA-DATE-001` require safe-by-default NSFW filtering and strict partial
date precision without inference. No formal Archive has been produced,
published, activated, or released, so this must be corrected before the first
production v1 rather than preserving a known-incomplete contract.

## What Changes

- **BREAKING (pre-production contract correction):** keep manifest and SQLite
  schema versions at 1, but amend the not-yet-produced v1 `subject` row to
  require an authoritative boolean NSFW fact and a canonical nullable partial
  date with explicit precision.
- Accept only legal Gregorian `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` values; reject
  malformed, impossible, inferred, or precision-inconsistent values.
- Define exact safe filtering: effective `includeNSFW=false` admits only
  `nsfw=0`; `includeNSFW=true` removes that predicate and admits both safe and
  NSFW rows. It never means “NSFW only.”
- Regenerate the closed Archive corpus, data-version vector, bundle identities,
  and compatibility sentinels deterministically so both semantics are
  executable contract evidence.
- Insert this correction into the master DAG and make Archive consumer,
  producer, and query-result work depend on it.

Behavior classification:

- `PRESERVE_ORACLE`: the safe default and “include both” NSFW behavior remain
  consistent with oracle `644b7748674e553f863d0ffd61d029f86fdc0717` and the
  higher-authority query contract in `PRODUCT.md`.
- `INTENTIONAL_DELTA`: invalid/trailing dates fail and year-only dates no longer
  fabricate January, a quarter, or a month-filter match, as required by
  accepted `DR-DATA-DATE-001`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contracts-archive-manifest`: correct the initial SQLite v1 subject facts,
  compatibility evidence, golden corpus, and pre-first-production versioning
  rule.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency review and strict validation passed; committed/pushed/released/deployed: no |
| Owner | Contracts owner applies deterministic contract and fixture changes; main agent reviews the spec, amends affected active changes, and performs final acceptance. |
| Writable paths | Planning: `openspec/changes/correct-archive-subject-semantics/**`. Apply: `contracts/schemas/archive/schema.sql`, `contracts/schemas/archive/README.md`, `contracts/schemas/archive/compatibility-matrix.json`, `contracts/schemas/archive/tooling/build_sqlite_fixtures.py`, `contracts/schemas/archive/tooling/verify.mjs`, `contracts/goldens/archive/index.json`, `contracts/goldens/archive/valid/minimal/**`, `contracts/goldens/archive/invalid/bundles/**`, `contracts/goldens/archive/vectors/data-version.json`, `tmp-formal-development/formal-development-master-plan.md`, and this change's task markers. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `tmp-formal-development/backend-development-implementation-guide.md`, `tmp-formal-development/data-logic-implementation-guide.md`, `tmp-formal-development/decisions/prototype-data-logic-audit.md`, all root specs, archived changes, backend/updater/frontend source and tests, other active changes, `.vscode/**`, `.impeccable/hook.cache.json`, Git refs/remotes, external repositories, hosts, and production. |
| Deletion complement | None. The existing closed corpus of 31 indexed files is regenerated in place; no golden path, fixture group, authority, or unrelated path may be added or deleted. |
| Mutable refs | None during planning or apply; no stage, commit, archive, branch/ref update, or push belongs to the implementation owner. |
| Consumes | `PRODUCT.md`, backend guide §§3/8/10, accepted `DR-DATA-DATE-001`, `contracts-archive-manifest`, `contracts-query-wire`, and the current closed Archive corpus/tooling. |
| Produces | Corrected pre-production Archive v1 DDL, explicit subject semantics, regenerated language-neutral evidence, and a corrected master dependency DAG. |
| Dependencies | Completed `define-archive-manifest-contract` and `define-shared-query-wire`; precondition that no formal/public/activated Archive v1 exists. Before apply, main must amend `implement-backend-archive-consumer`, `produce-immutable-archive`, and `implement-query-result-set` to consume this correction and block their apply until it exits. |
| Deliverables | Subject DDL constraints and index, documentation, compatibility sentinels, deterministic valid/invalid SQLite bundles and identities, updated vector/index, and master-plan change row/edges/count. |
| Acceptance | Contract fixture builder check plus clean regeneration equivalence; pinned Node verification; schema, calendar, precision, NSFW, digest/vector, matrix sentinel, closed-index and residue checks; targeted and all strict OpenSpec validation when no unrelated draft is incomplete. |
| Non-goals | No backend, updater, frontend, query, HTTP, producer, consumer, catalog, or statistics implementation; no new Archive version; no manifest/pointer/dataVersion algorithm redesign; no upstream download or full Archive build. |
| Operations deferred | No `current.json`, activation, migration, scheduling, retention, restart, rollback, release, deployment, or production data action. |
| Stop/rollback conditions | Stop before mutation if any formal/public v1 exists, authority or owned-path state drifts, another owner overlaps a writable path, an affected active change is not reconciled, or deterministic/strict verification fails. In that case propose SQLite schema version 2 or fix the spec; revert only this owned unstaged candidate and never rewrite protected or external state. |

This change touches no other repository or mutable external state. Any push,
pull request, tag, release, deployment, host mutation, or activation requires a
separate explicit authorization. The four planning artifacts passed strict
validation and main-agent review; apply remains bounded by the declared
preflight and writable paths.
