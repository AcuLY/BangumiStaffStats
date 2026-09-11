## Why

Users need to follow a ranked person into collaboration analysis, inspect a participant without losing an analysis, and locate that person's authoritative ranking. The user approved local implementation with responsive detail presentation on 2026-09-09.

## What Changes

- NEW_CAPABILITY: ranking detail offers 查看共演; selected collaboration participants offer 查看详情 and an authoritative ranking lookup. Partner list rows show primary name, original name and positions, and activate the existing pair flow.
- INTENTIONAL_DELTA: co-star detail uses a drawer below 960px and replaces the right analysis content at 960px and above. Returning restores analysis; editing selection exits detail.
- NEW_CAPABILITY: optional person-detail input.positionKeys scopes evidence to selected identities; optional rankings view.locatePersonId returns exact rank/page without changing ordinary pagination.
- PRESERVE_ORACLE: all other layout, row activation, statistics, shared Applied Query, Header behavior and 780px controls remain governed by PRODUCT.md, DESIGN.md and oracle 644b7748674e553f863d0ffd61d029f86fdc0717.

## Capabilities

### New Capabilities
- `contracts-person-workspace-links`: identity-scoped detail and exact ranking location wire behavior.
- `frontend-person-workspace-links`: responsive cross-module person exploration and return state.

### Modified Capabilities
- `frontend-person-inspector`: isolate the transient co-star preview from the retained ranking resource while sharing the strict request drivers and Applied Query authority.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Implemented and committed locally in b675b8d; full acceptance/archival remain governed by unchecked tasks |
| Owner | Primary: frontend and specifications; backend_design: contracts, backend and generated consumers |
| Writable paths | The exact bounded file sets listed in design.md under Owned files; this change directory and its two accepted spec directories |
| Read-only protected inputs | AGENTS.md, other changes, archive data, operations, unrelated dirty files, reference oracle and development guides |
| Deletion complement | No existing files deleted; preserve all pre-existing hunks |
| Mutable refs | None; current master HEAD 3612f50; no commit, push, PR or deployment |
| Consumes | Applied Query, canonical selected identities, backend rank and existing person detail presentation |
| Produces | Optional wire fields, server-authoritative location and scoped evidence, local navigation controls |
| Dependencies | Contracts before generated consumers/backend/frontend; no new dependencies |
| Deliverables | Implementation, regression tests, updated PRODUCT/DESIGN/architecture, acceptance evidence |
| Acceptance | Focused backend/frontend tests, affected component gates, contract goldens, desktop/mobile browser QA, git diff --check, strict OpenSpec validation |
| Non-goals | New pages, third columns, share URLs, automatic Query changes, persisted response snapshots |
| Operations deferred | All production and external state mutations; no other repository touched |
| Stop/rollback conditions | Stop on conflicting concurrent edits or authority conflicts; revert only this task's individual hunks if needed; no destructive checkout/reset/clean |
