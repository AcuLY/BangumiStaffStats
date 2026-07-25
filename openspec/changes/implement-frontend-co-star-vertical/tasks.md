## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | Investigated/specified/main-agent reviewed: complete; implemented/verified/committed/pushed/released/deployed: no. Group 1 may start after its explicit preflight; Group 2 remains dependency-gated. |
| Owner | One Frontend implementation agent for all three groups; main agent owns spec edits, shared-owner sequencing, acceptance, commits, and archive. |
| Writable paths | `frontend/src/api/{candidates,partners,coStar}.ts`, `frontend/src/api/adapters/{candidates,partners,coStar}.ts`, `frontend/src/features/co-star/**`, `frontend/src/features/query/{coordinator,share}.ts`, `frontend/src/app/App.vue`, `frontend/src/shared/charts/**`, `frontend/src/shared/components/{AppIcon,SafeImage}.vue`, `frontend/src/shared/media/bangumiImage.ts`, `frontend/src/shared/styles/base.css`, `frontend/scripts/{check-architecture,check-production-artifact}.mjs`, `frontend/tests/api/{candidates,partners,co-star}.test.ts`, `frontend/tests/features/co-star/**`, `frontend/tests/features/query/{coordinator,share-routes}.test.ts`, `frontend/tests/app/co-star.integration.test.ts`, `frontend/tests/shared/SafeImage.test.ts`, and this file's task markers. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, oracle `644b7748674e553f863d0ffd61d029f86fdc0717`, `tmp-formal-development/**`, `contracts/**`, `backend/**`, `updater/**`, contract-owned generated DTOs/generators/checkers, package/lock files, non-listed frontend paths, other OpenSpec changes/specs, external repositories, refs/remotes, and production state. |
| Deletion complement | Delete only new files created under declared API/co-star/test paths; hunk-revert existing files. Never use recursive broad deletion. |
| Mutable refs | None during apply. Main-agent lifecycle actions occur only after acceptance. |
| Consumes | Accepted shell/shared primitives and exact changes `bootstrap-frontend-foundation`, `implement-frontend-query-shell`, `implement-frontend-ranking-results`, `implement-frontend-person-inspector`, `expose-candidates`, `expose-partners`, and `expose-co-star`. |
| Produces | Complete fixture-free `/co-star` candidate, tray, partners, pair/group analysis and share workflow. |
| Dependencies | Contract-generated DTOs/endpoints → strict adapters/coordinator → feature surfaces → App integration. Shared files wait for explicit owner handoff. |
| Deliverables | Three drivers/adapters, coordinated state, complete UI topology, focused/full tests, and browser evidence. |
| Acceptance | Generated drift, adapter/state/component/integration/type/build/artifact gates; strict OpenSpec; dual-theme viewport/focus/overflow/console/network verification. |
| Non-goals | Frontend statistics, backend/contracts, new packages/state/request layers, person detail, fixtures, operations, deployment, or broad cleanup. |
| Operations deferred | Hosting/process/monitoring configuration, production secrets, release, deployment, cutover, and activation. |
| Stop/rollback conditions | Stop on branch/HEAD/dirty-state mismatch, missing review/dependency, overlapping shared owner, DTO drift, authority conflict, need for undeclared mutation/statistics/dependency, or failed gate; preserve unrelated work and revert only owned new files/hunks. |

Forbidden throughout: `git reset --hard`, checkout-based rollback, `git clean`,
`git add -A`, broad recursive deletion, writes outside declared paths, nested
OpenSpec roots, external-repository mutation, and remote/operations actions.
Use Node through
`PATH=/Users/luca/.nvm/versions/node/v24.18.0/bin:$PATH`.

## 1. Candidate, identity, and resource foundation

- [ ] 1.1 Preflight: record `git branch --show-current`, `git rev-parse HEAD`, and `git status --short`; confirm branch `codex/formal-rewrite`, reviewed strict-valid artifacts, accepted `expose-candidates`, available deterministic candidates DTOs, and no active owner on the exact Group 1 paths; stop without cleanup on any mismatch.
- [ ] 1.2 Implement and test the strict candidates adapter/driver plus coordinator resource sequence, cancellation, revision, stale-response, metadata, scope omission, and view-only request behavior using only contract-owned generated DTOs.
- [ ] 1.3 Implement `features/co-star` models/state and the oracle-preserving desktop rail/mobile Drawer, selected-identity tray, 10-person/20-identity limits, candidate position/count/search/sort/rank/pagination states, and the 0-person analysis state without frontend statistics.
- [ ] 1.4 Verify Group 1 with `npm run check:candidates-wire`, focused candidates/co-star/coordinator Vitest files, `npm run typecheck`, `git diff --check`, and `openspec validate implement-frontend-co-star-vertical --type change --strict --no-interactive`; record investigated/implemented/verified separately and hand off only declared unstaged paths.

## 2. Partners, pair/group, share, and App integration

- [ ] 2.1 Preflight: re-record branch, HEAD, and dirty state; confirm exact changes `expose-partners` and `expose-co-star` are strict-valid and handed off with their generated DTOs/endpoints/drift checks, `implement-frontend-person-inspector` has released every overlapping shared file, and Group 1 is accepted; stop on mismatch.
- [ ] 2.2 Implement and test strict partners/co-star adapters/drivers and independent latest-only coordinator resources, including canonical identity inputs, local recovery, surface-specific pending, scope omission, Retry-After/errors, and the prohibition on `refreshCollection`.
- [ ] 2.3 Implement the 1-person partners source/summary/fixed-leaders/filter/server-ranked list/pagination surface; partner activation SHALL add returned contributing identities and enter a two-person pair request.
- [ ] 2.4 Implement 2-person pair and 3–10-person group participants, complete summary/tags/ratings/personal preference, display-only matrix projection, exact-contribution subject/series browser, server view pagination, ready empty state, and local pending/error/retry boundaries.
- [ ] 2.5 Integrate selection-preserving query revision behavior, one-shot versioned share restore, App route, responsive rail/Drawer/focus restoration, dual-theme feature CSS, shared chart/media primitives, architecture/artifact inventories, and oracle copy/hierarchy without adding a dependency or state/request layer.
- [ ] 2.6 Verify Group 2 with `npm run check:partners-wire`, `npm run check:co-star-wire`, focused API/co-star/query-share/App Vitest files, `npm run typecheck`, `npm run build`, `git diff --check`, and strict change validation; stop and retain the last accepted surfaces on any failure.

## 3. Integrated development acceptance

- [ ] 3.1 Preflight: record branch, HEAD, and dirty state; confirm only declared paths remain in the candidate, every operation projection is drift-clean, all task behavior is implemented, and no disposable generated/build state or overlapping owner remains.
- [ ] 3.2 Run the Node 24 full frontend `npm run check`, repeat focused latest-only/cancel/limit/share tests, and verify architecture, artifact denylist, one production SPA, fixture/upstream/statistics bans, `git diff --check`, and `openspec validate --all --strict --no-interactive`.
- [ ] 3.3 Build and serve the production artifact locally, then browser-check Light/Dark at 360, 390, 768, 779, 780, 781, 917, 1024, 1185, and 1440px for 0/1/2/group, personal/global, subject/series, pending/error/empty, search/sort/page, limit, share replay, keyboard/focus/Escape/Drawer, reduced motion, 44px targets, image four-state sizing, matrix/table scroll ownership, page overflow, duplicate IDs, fresh console, failed resources, and direct-upstream requests against the oracle and intentional-delta record.
- [ ] 3.4 Recheck exact-path ownership and absence of external/ref/operations mutation; report investigated, implemented, verified, committed, pushed, released, and deployed states separately, leave commits/archive to the main agent, and stop with an unstaged accepted candidate.
