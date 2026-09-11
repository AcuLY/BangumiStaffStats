## Why

A director ranking currently opens cooperation restricted to other directors. Users approved independent cooperation positions while preserving the source identity and ranking Query, plus selecting one default source and a small multi-person hint.

## What Changes

- NEW_CAPABILITY: candidates, partners, co-star and explicit identity detail accept optional input.positionScope = query|all, default query. All expands the operation's available positions without modifying public Query or ranking.
- INTENTIONAL_DELTA: initialize ordinary co-star queries with the first eligible person under original Query positions, then browse all available candidate positions; show a small hint while one person is selected.
- NEW_CAPABILITY (2026-09-10 user request): expose an explicit exclusive 全部 choice in the co-star query position control. Ranking detail handoff selects it and the exact target identities while preserving all other Applied Query and Draft fields. A first all-position query works without a synthetic position key; only all-scope co-star operations may omit concrete Query positions.
- PRESERVE_ORACLE: existing statistics, Query/Draft boundaries, limits, visual language and responsive structure from PRODUCT.md, DESIGN.md and oracle 644b7748674e553f863d0ffd61d029f86fdc0717.

## Capabilities

### New Capabilities
- `contracts-co-star-position-scope`: independent operation identity/partner position scope and cache isolation.
- `frontend-cross-position-co-star`: original-position default source, broad cooperation and multi-person hint.

### Modified Capabilities
- `contracts-person-workspace-links`: explicit detail identities use Query membership by default and live catalog membership under all scope.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Specified; apply blocked until strict validation and primary review |
| Owner | Primary: App/UI/docs; crossrole_backend_design: contracts/backend/generated; frontend scope owner: API/coordinator/recovery |
| Writable paths | Exact owner sets in design.md; this change and the two new accepted specs; existing source-default specs only for the approved default |
| Read-only protected inputs | All unrelated dirty hunks, other changes, archive data, operational definitions, AGENTS and controlling guides |
| Deletion complement | No existing files removed |
| Mutable refs | None; current master 3612f50, no commit/push/deploy |
| Consumes | Existing catalog, Shared Query, selected identity, operation and statistics contracts |
| Produces | Scoped operation inputs/evaluation and frontend selection workflow |
| Dependencies | Schemas -> generators -> backend/API/coordinator -> UI/tests |
| Deliverables | Working cross-position flow, tests, synchronized docs/specs and validation evidence |
| Acceptance | Focused and full affected gates, wire/golden verification, real-data browser desktop/mobile, diff and strict spec checks |
| Non-goals | Formula changes, new dependencies, enumerating all positions into ranking AND conditions, automatic ranking filter changes, origin/navigation-history state |
| Operations deferred | No production changes; local read-only acceptance helper/preview may be rebuilt |
| Stop/rollback conditions | Stop authority or concurrent-write conflicts; preserve preimages and undo only owned hunks; no reset/clean/broad deletion |
