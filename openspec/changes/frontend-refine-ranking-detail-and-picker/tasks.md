## Task Boundary

| Field | Boundary |
|---|---|
| Status | Local specification complete; apply pending |
| Owner | Frontend; primary agent accepts all slices |
| Writable paths | Exact proposal paths, this change, exact supersession notes |
| Read-only protected inputs | API/generated contracts, data/query/request semantics, Backend/updater/Archive, unrelated files, external state |
| Deletion complement | Preserve data, actions, selection/removal/retry, pagination events, results, desktop rail, accessible detail name/close, tests |
| Mutable refs | Current dirty worktree only; no Git/external refs |
| Consumes | Existing Vue/Naive components, CSS grid/container queries, compact breakpoint |
| Produces | Nine bounded layout/interaction corrections |
| Dependencies | Existing dependencies only; no package |
| Deliverables | Strict specs, source/tests, focused checks and Browser evidence |
| Acceptance | All annotated defects absent at 568/961; accordion/focus/overflow correct at 779/780 |
| Non-goals | Backend/data/API/broad cleanup/full gate/lifecycle/deploy |
| Operations deferred | Root sync/archive, full accumulated gate, commit/push/release/deploy |
| Stop/rollback conditions | Scope/branch drift, conflicting edit, request/selection drift, body focus, hidden tabbables, overflow, emit drift, desktop regression, failed acceptance |

Forbidden: reset/checkout rollback, git clean, `git add -A`, broad deletion,
undeclared writes, external mutation, production or deployment work.

## 1. Planning and ownership — primary

- [x] 1.1 Reconfirm branch/HEAD/dirty paths, strict-valid artifacts, zero P0/P1
  review, and exact next-write supersession notes in all active Drawer/title
  owners; stop on overlap or conflict.
- [x] 1.2 Update DESIGN and sidecar only for in-flow compact picker, close-only
  detail chrome, summary parity, aligned grids, and shared pagination placement.

## 2. Ranking and person-detail layout — Frontend ranking/person owner

- [x] 2.1 Give compact ranking header/row matching one-line tracks while
  preserving the <=340px two-line container contract; add geometry tests.
- [x] 2.2 Restore full-width person-work facts and closed dividers for role rows;
  add long/wrapped contribution coverage.
- [x] 2.3 Reset shared AdaptivePagination child placement and tools wrapping
  without changing consumer events; test ranking/candidate/person consumers.
- [x] 2.4 Remove the visible compact detail title while preserving dialog name,
  close position, focus isolation, and scroll ownership; update focused tests.

## 3. Co-star accordion and summary polish — Frontend co-star/query owner

- [x] 3.1 Replace compact NDrawer hosting with an in-flow CandidatePicker
  accordion; remove App inert/scroll-lock/modal ownership and preserve every
  picker state/action.
- [x] 3.2 Preserve summary/empty-action/Escape and 779/780 focus behavior with
  collapsed content absent from Tab order; add component and App tests.
- [x] 3.3 Remove selected-overview outer padding, match compact summary
  height/type/action geometry, and set query separators to normal weight; add
  desktop/compact structure tests.

## 4. Focused acceptance — primary

- [x] 4.1 Run affected ranking/person/co-star/query/App Vitest, typecheck, Vite
  build, Impeccable detector, strict OpenSpec, and `git diff --check`.
- [x] 4.2 Browser-check 568px and 961px annotated layouts plus 779/780 accordion
  focus, pointer/keyboard toggle, Escape, scrollWidth, page interaction, images,
  framework overlay, and console health.
- [x] 4.3 Keep root sync/archive, complete accumulated gate, Git integration,
  release, deployment, and host/production mutation deferred.
