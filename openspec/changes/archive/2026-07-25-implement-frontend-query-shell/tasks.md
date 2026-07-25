## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: complete; verified: focused/full frontend, responsive browser, accessibility, clean-console, strict OpenSpec, and repository hygiene gates passed; committed/pushed/released/deployed: no |
| Owner | One Frontend apply owner; main agent reviews and accepts. |
| Writable paths | Exactly the planning and Frontend apply paths in `proposal.md`; tasks below narrow each group further. |
| Read-only protected inputs | Exactly the authorities, contracts, other changes/tasks, undeclared files, other owners, refs/remotes, external state, and production in `proposal.md`. |
| Deletion complement | None. |
| Mutable refs | None. |
| Consumes | Accepted frontend foundation/query wire and exited catalog API. |
| Produces | Query shell, catalog consumer, state/application service, tests, and docs. |
| Dependencies | Exactly `bootstrap-frontend-foundation`, `expose-dynamic-catalog`, and `define-shared-query-wire`; all exit before apply. |
| Deliverables | Exact proposal deliverables. |
| Acceptance | Exact proposal acceptance gates. |
| Non-goals | Exact proposal non-goals. |
| Operations deferred | Production configuration, release, deployment, migration, monitoring, cutover. |
| Stop/rollback conditions | Stop on dependency/review/branch/HEAD/index/dirty/path/contract drift or any failed gate; never reset, checkout-restore, clean, broadly delete, or touch another owner. |

## 1. Apply Preflight — Frontend owner, read-only

- [x] 1.1 Verify branch/HEAD, empty index, exact allowed dirty state, all three exited dependencies, and explicit main-agent approval of these artifact bytes; stop without mutation on mismatch.
- [x] 1.2 Record preimages and physical/index inventories for every exact apply path, and confirm no overlapping owner or undeclared generated/tool state.

## 2. Catalog and Query Core — exact API/generated/feature paths

- [x] 2.1 Reconfirm the preflight, then generate/check catalog-only types and implement the strict catalog adapter/store under the declared `api/**` and `features/catalog/**` paths.
- [x] 2.2 Implement query model/store, normalized operation views/resources, route/share owner, successful personal/global `?user=` updates, and typed operation coordinator under `features/query/**` and `app/routes.ts`.
- [x] 2.3 Add focused adapter/model/state tests proving personal/global validation, ordered PositionKeys, no-op, atomic commit, cancellation, stale-response rejection, refresh fresh/stale/rollback, one-time share replay, last-successful share generation, Clipboard success/fallback, URL updates without duplicate requests, and fixture-free production failure.
- [x] 2.4 Run the focused catalog/query tests and typecheck; stop on contract drift or any write outside this group's exact paths.

## 3. Query Workspace — exact app/query/style/doc/check paths

- [x] 3.1 Reconfirm HEAD/index/allowed dirty state and unchanged approved artifacts; recover the exact hash-pinned oracle brand mark into `src/assets/brand/bgmss.png`; then replace only the foundation surface in `App.vue` with the formal route/query shell.
- [x] 3.2 Implement the DESIGN-owned Header share/theme actions, single `bgmss-theme-v1` owner/provider mapping, summary, editor, scope, advanced, position, and action components plus desktop overlay/mobile-flow, focus, status, and reduced-motion behavior.
- [x] 3.3 Update only the declared generation/architecture/artifact checks and `ARCHITECTURE.md`; keep the query-only and catalog-only generated projections disjoint after the catalog operation entered the shared OpenAPI; prove the exact brand-asset hash and that the production entry/artifact contains no fixture, prototype path, second request/state layer, or statistical implementation.
- [x] 3.4 Run component/mount tests, typecheck, architecture checks, and build; stop on any regression or undeclared path need.

## 4. Candidate Acceptance — read-only except task markers

- [x] 4.1 Run targeted unit/contract suites, then full `npm run check` from `frontend/`, and record exact commands/results without claiming backend result-API coverage.
- [x] 4.2 Browser-check `/ranking` and `/co-star` at documented desktop/mobile Light/Dark states, including theme persistence without requests, share Clipboard/fallback, catalog pending/error, validation, cancellation, stale refresh, overflow, keyboard/focus, and a fresh console.
- [x] 4.3 Run strict validation for this change and all changes, OpenSpec doctor, `git diff --check`, exact writable/protected inventory, generated-residue, production-fixture, index, and ref checks.
- [x] 4.4 Mark only completed task boxes and stop with an unstaged candidate for main-agent review; report investigated/implemented/verified separately from uncommitted/unpushed/unreleased/undeployed.
