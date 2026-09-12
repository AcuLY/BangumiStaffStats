## Why

Users can select main or all voice credits, but cannot isolate supporting, guest, minor, narrator or voice-library roles. Roles 4–6 are misleadingly displayed as 其他. The user approved all six individual scopes and removing 仅 from every cast label on 2026-09-12.

## What Changes

- NEW_CAPABILITY: animation/game cast selectors main, supporting, guest, minor, narrator, voice-library and all, mapping respectively to raw roles 1, 2, 3, 4, 5, 6 and 1..6.
- INTENTIONAL_DELTA: labels 声优（主役）, 声优（配角）, 声优（客串）, 声优（闲角）, 声优（旁白）, 声优（声库） and 声优; detail/co-star roles display 主役, 配角, 客串, 闲角, 旁白, 声库 without 其他.
- PRESERVE_ORACLE: existing selector layout, all/main keys, common shortcut order, exact eligible credit joins, one cast scope per subject type in SharedQuery, all-position browse deduplication, metrics and workspace recovery. Oracle: 644b7748674e553f863d0ffd61d029f86fdc0717 and current PRODUCT.md/DESIGN.md.

## Capabilities

### New Capabilities
- `contracts-cast-role-scopes`: closed seven-scope identity contract and six truthful role labels, with producer/consumer acceptance.
- `backend-cast-role-scopes`: exact role evaluation and canonical all-position browsing.
- `frontend-cast-role-scopes`: catalog-driven scope selection, recovery and actual role presentation.

### Modified Capabilities

Existing main/all-only wording in accepted specs and guides is synchronized with the new closed scope set, without changing unrelated behavior or active change ownership.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Implemented; strict review gate passed before apply; focused/full backend, frontend tests/build and browser verified; complete frontend gate passed during release acceptance; ready for archival |
| Owner | Primary owns planning, frontend and final acceptance; contract owner handles contracts and generated consumers; backend owner handles Go behavior/tests |
| Writable paths | contracts/{schemas,goldens,openapi}/ cast key/role label authorities, validators and affected fixtures/indexes; backend/internal/{archivebuild,catalog,query,persondetail,costar,app,httpapi/wire}/ cast logic/tests/generated consumers; frontend/src/{api,features/catalog,features/query,features/co-star,features/person-detail}/ affected validators/models and generated consumers; frontend/tests/ corresponding tests; PRODUCT.md; DESIGN.md cast wording only; tmp-formal-development/ accepted cast wording only; this change and cast-scope sections of openspec/specs/; .tmp/cast-role-scopes/ local verification evidence |
| Read-only protected inputs | Pre-existing dirty hunks, other active changes, original archive/dump data, operational definitions, unrelated files, AGENTS.md, dependency versions |
| Deletion complement | No existing source files removed |
| Mutable refs | None; master at 3f7de5c, no commits/push/merge |
| Consumes | Numeric role 1..6 exact subject-character and person-character relations, current catalog/config and shared schemas |
| Produces | Seven selectable scopes, six truthful labels, regenerated wires/fixtures and regression evidence |
| Dependencies | Contracts first; generated consumers and backend/frontend follow; no new runtime dependency |
| Deliverables | Production implementation, focused/full component checks, desktop/mobile browser evidence, synchronized/archived OpenSpec when acceptance passes |
| Acceptance | Contract validators; generator checks; backend scripts/check.sh; frontend npm ci and npm run check with pinned tools; browser scope selection/detail checks; git diff --check; strict OpenSpec |
| Non-goals | Formula/eligibility changes, selecting multiple cast scopes simultaneously in SharedQuery, new roles, restyling, unrelated fixes |
| Operations deferred | No live host, service, route, release, deploy or external repository mutation; isolated local verification may create temporary archive copies and previews |
| Stop/rollback conditions | Stop on authority/ownership conflict or failing acceptance; preserve dirty preimages; undo only owned hunks; never reset --hard, checkout rollback, git clean, git add -A or broad deletion |
