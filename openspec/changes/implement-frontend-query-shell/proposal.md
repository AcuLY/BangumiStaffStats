## Why

The formal SPA has a verified foundation but no production Query Workspace.
This change adds the smallest query shell that can preserve the approved
oracle interaction while later ranking and co-star verticals supply their own
result DTOs and endpoints.

## What Changes

- Add `/ranking` and `/co-star` shell modes with one shared draft, immutable
  applied query, ordered PositionKeys, monotonic query revision, and the
  approved generate/copy/replay share flow.
- Add the production Query Workspace, strict model validation, dynamic catalog
  selector, and operation-scoped view/resource coordination.
- Add the Header's single Light/Dark theme owner and action, backed only by the
  versioned `bgmss-theme-v1` localStorage key and public Naive theme APIs.
- Add abort/sequence protection and explicit personal collection-refresh
  fresh, stale, failure, and cancellation transitions behind a typed operation
  port. Dev/test implementations may be injected; no fixture enters the
  production entry or bundle.
- Preserve the oracle's final header/query disclosure, desktop overlay, mobile
  document-flow, focus, copy, responsive, and accessibility behavior. The
  prototype component/store structure is evidence only.

Behavior classification:

- `PRESERVE_ORACLE`: final Query Workspace appearance and interaction at
  `644b7748674e553f863d0ffd61d029f86fdc0717`, as constrained by `DESIGN.md`.
- `INTENTIONAL_DELTA`: strict personal/global wire state, opaque dynamic
  PositionKeys, structured field errors, fixture-free production, and
  feature-first ownership required by `PRODUCT.md`, `DESIGN.md`, and the
  frontend production guide.
- `NEW_CAPABILITY`: the production query state machine, catalog consumer, and
  typed operation coordinator.

## Capabilities

### New Capabilities

- `frontend-query-shell`: Production routes, Query Workspace behavior, shared
  query state, catalog-driven selection, and operation coordination.

### Modified Capabilities

None.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main product/design/dependency/path review and strict validation passed; committed/pushed/released/deployed: no |
| Owner | One Frontend apply owner; main agent reviews the complete OpenSpec and later accepts any implementation candidate. |
| Writable paths | Planning: exactly `openspec/changes/implement-frontend-query-shell/**`. Apply: exactly `frontend/package.json`, `frontend/src/app/App.vue`, `frontend/src/app/AppProviders.vue`, `frontend/src/app/routes.ts`, `frontend/src/app/theme.ts`, `frontend/src/assets/brand/bgmss.png`, `frontend/src/api/catalog.ts`, `frontend/src/api/adapters/catalog.ts`, `frontend/src/api/generated/catalog/**`, `frontend/src/features/catalog/**`, `frontend/src/features/query/**`, `frontend/src/shared/styles/base.css`, `frontend/scripts/generate-catalog-wire.mjs`, `frontend/scripts/check-catalog-wire-generated.mjs`, `frontend/scripts/check-architecture.mjs`, `frontend/scripts/check-production-artifact.mjs`, `frontend/tests/api/catalog.contract.test.ts`, `frontend/tests/app/app.mount.test.ts`, `frontend/tests/app/theme.test.ts`, `frontend/tests/features/query/**`, `frontend/ARCHITECTURE.md`, and this change's task markers. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `tmp-formal-development/**`, `openspec/specs/**`, every other change/task, `contracts/**`, oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717` including its exact `frontend/public/bgmss.png` brand asset, all frontend files outside the exact apply set, backend/updater code, Git refs/remotes, external services/hosts, and production. |
| Deletion complement | None; no accepted foundation, generated query wire, prototype evidence, test, or product behavior may be deleted or weakened. |
| Mutable refs | None; apply shall not stage, commit, sync/archive, switch/amend refs, push, tag, release, or deploy. |
| Consumes | Accepted `frontend-foundation`, `contracts-query-wire`, and the exited `contracts-catalog-api`; `PRODUCT.md`, `DESIGN.md`, and the frontend guide. |
| Produces | One production query shell, Header/share/theme owner, catalog adapter/store, shared query model/store, typed operation coordinator, and focused tests/docs. |
| Dependencies | Exactly `bootstrap-frontend-foundation`, `expose-dynamic-catalog`, and `define-shared-query-wire`; all must be main-agent accepted, synchronized, archived, and absent from active changes before apply. |
| Deliverables | Delta spec, design, tasks, query/catalog modules, routes and Query Workspace, catalog generation/adapter checks, state-machine tests, personal/global browser evidence, and architecture documentation. |
| Acceptance | Catalog generation and strict decode; model/state/service unit tests; cancellation/stale-response and refresh rollback tests; typecheck/unit/build/artifact/architecture gates; desktop/mobile Light/Dark browser checks with fresh console; strict OpenSpec and diff/residue checks. |
| Non-goals | Ranking rows or formulas, person detail, candidate browsing, selected identities, partners, co-star analysis, series/statistics/sort algorithms, backend/contracts/updater edits, fixture shipping, or operations. |
| Operations deferred | Production configuration, proxy/server fallback, release, deployment, migration, monitoring, and cutover. |
| Stop/rollback conditions | Stop on unmet dependency, contract/design/path drift, need for a new dependency or wire, nonempty index, protected-path write, production fixture, or failed gate. Remove only owned disposable output and preserve all accepted state. |

The change touches no other repository or external mutable state. Apply is
blocked until all artifacts pass strict validation and explicit main-agent
review and approval.
