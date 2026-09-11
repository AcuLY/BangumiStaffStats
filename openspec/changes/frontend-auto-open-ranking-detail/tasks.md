> Supersession (2026-09-08): `contracts-remove-query-sharing` retires the query-sharing feature and overrides the sharing-specific requirements, preservation clauses, and acceptance assumptions below. URL fragments are cleared without parsing or replay. Header now has an always available same-tab “回到旧版” link to `https://search.bgmss.fun/old/` immediately left of theme. Exact accepted workspace recovery remains frontend-local through validated v2 JSON session storage; v1 fragment-based storage is discarded. Completed evidence below remains historical, and unrelated requirements are unchanged.

## Task Boundary

| Field | Boundary |
|---|---|
| Status | Local investigated/specified/implemented/focused-verified only |
| Owner | Frontend ranking/person Inspector; primary agent accepts |
| Writable paths | Exact proposal paths including DESIGN/sidecar and ranking empty/pending base CSS, excluding the later polish change's mode-loader/co-star-default, work-toolbar/SortDirectionButton, and new focused-test slices; two root specs only at later sync/archive |
| Read-only protected inputs | PRODUCT, QueryWorkspace/Header/selector, coordinator/query/contracts, Backend/updater/Archive, co-star, original worktree, external state |
| Deletion complement | Remove only generic desktop detail placeholder; preserve all real data/states/controls/drawers/tests |
| Mutable refs | Current local worktree only |
| Consumes | Accepted ranking order, existing detail executor/resource, lazy loader, compact drawer, SafeImage geometry |
| Produces | Companion detail skeleton, first-result activation, no-person single column, shared skeleton, fixed portrait |
| Dependencies | Completed main-first App topology and accepted ranking/person capabilities; no new package |
| Deliverables | Source/CSS/tests/OpenSpec plus focused build/layout/browser evidence |
| Acceptance | Pending skeleton, one first-ID request, exact shares, empty/error collapse, compact auto-close/manual-open Drawer, 3:4 portrait, no stale/double request or drift |
| Non-goals | Wire/backend/query/ranking controls/person evidence/theme/dependency changes |
| Operations deferred | Full accumulated gate, sync/archive, commit/push/PR/release/deploy/host mutation |
| Stop/rollback conditions | Stop on overlap, wrong/double/stale request, share/drawer/status/geometry/overflow regression, or failed checks |

Forbidden: reset/checkout rollback, git clean, `git add -A`, broad deletion,
generated/Backend/external writes, and production operations.

## 1. Planning and ownership — owner: primary agent

- [x] 1.1 Verify branch/HEAD/dirty paths, freeze the prior query-panel App/test
  outputs, review all artifacts against ranking/person specs and source, require
  strict validation and zero unresolved P0/P1 before implementation.

## 2. Loading and activation — owner: Frontend App/person detail

- [x] 2.1 Extract one reusable PersonDetailSkeleton and replace the duplicated
  PersonInspector pending markup without changing its accessible loading state.
- [x] 2.2 Update App ranking state so desktop primary pending renders the detail
  skeleton, ordinary success selects/requests first item once, exact share replay
  is suppressed/preserved, and no-person ready/error uses no generic or reserved
  right column.
- [x] 2.3 Lock real and skeleton portrait tracks to 3:4 image-derived dimensions
  across desktop, narrow container, and drawer variants; remove compact portrait
  radius and emphasize work-card role values without text clipping or SafeImage
  lifecycle changes.
- [x] 2.4 Normalize the existing ranking toolbar to equal 44px controls with an
  80px direction track and a <=340px two-row container layout; make pagination
  pages content-sized and its page-size/jump tools span and wrap within a full
  second row, without replacing Naive UI primitives.
- [x] 2.5 Top-align profile rows, replace the raw evidence “i” with shared
  AppIcon information-circle, restore 24px Drawer Panel typography, move initial
  focus to the dialog, and lock/restore the documentElement scroll owner so the
  sticky Header remains above the Drawer over expanded Query Editor content.
- [x] 2.6 Move rating height variables to the stable track, render counts above
  fills, and make manual tooltip content pointer-transparent without changing
  pointer/keyboard state ownership or chart semantics.
- [x] 2.7 Keep automatic first-person selection/detail loading but leave the
  compact Drawer closed until explicit ranking-row activation; preserve exact
  detail-share replay and desktop automatic Inspector display.
- [x] 2.8 Remove ranking first-query card chrome and duplicate action; add a
  complete-zero plain branch that suppresses zero summary/controls/pagination
  while preserving search-empty recovery controls.
- [x] 2.9 Align primary ranking pending with ready regions and personal/global
  tracks using only direct `NSkeleton` leaves; preserve the companion detail
  skeleton and all request/selection behavior.

## 3. Focused tests — owner: Frontend tests

- [x] 3.1 Add ranking integration coverage for pending companion skeleton,
  ordinary first-ID request/selection, unchanged refresh, zero items, and share
  with/without exact detail; update person component/geometry assertions.
- [x] 3.2 Add focused source regressions for the toolbar height/width/container
  layout and pagination row/span/content-width constraints.
- [x] 3.3 Add focused component/source regressions for profile alignment, shared
  info icon, count placement, tooltip hit-testing, Drawer typography, dialog
  initial focus/focus loop, and document-root scroll restoration.
- [x] 3.4 Add ranking App regressions proving compact ordinary success does not
  mount/open the Drawer and explicit row activation still opens it without a
  duplicate or stale detail owner.
- [x] 3.5 Replace the superseded first-query CTA assertion and add focused
  personal/global pending, complete-zero, search-empty, plain-surface, and
  no-pagination regressions in the exact ranking/query component tests.

## 4. Focused acceptance — owner: primary agent

- [x] 4.1 Run focused Vitest, typecheck/build, Impeccable layout detector,
  strict validation, and diff check; browser-check desktop pending/success/
  geometry and the then-current compact automatic Drawer with clean console/
  screenshots, without expanding to the complete accumulated Frontend gate.

  Evidence: 25/25 ranking/person/scroll tests plus 11/11 selector tests passed;
  Vue typecheck and Vite production build passed; Impeccable layout detection
  returned `[]`; all three coordinated changes are strict-valid and diff check
  is clean. Real native Backend browser evidence showed ordinary query success
  automatically selecting first-ranked person 12 and displaying its Inspector;
  desktop portrait/intro both measured 160×213, role value weight 600, and
  compact query opened the existing drawer with selected first row, 160×213
  portrait, zero radius/overflow, close focus, and no warn/error. Deferred
  integration evidence proves the companion detail skeleton during pending;
  zero-result integration proves one-column/no-placeholder behavior. This
  historical compact auto-open evidence is superseded by task 4.4.
- [x] 4.2 Run the focused ranking/query CSS tests, strict validation, layout
  detector, diff check, and desktop/compact browser geometry/console checks for
  the toolbar and pagination; keep the complete Frontend gate deferred.

  Evidence: 29/29 focused query/ranking tests passed; Vue typecheck and Vite
  production build passed; Impeccable layout detection returned `[]`; all three
  coordinated changes are strict-valid and `git diff --check` passes. At an
  890px viewport with a 410px ranking pane, search/sort/direction each measured
  44px high, direction measured 80px wide with the full “降序” label, and tools
  spanned row two ending exactly at the pane edge. At 390px and 360px viewports,
  document scroll width equaled client width; 360px activated the two-row toolbar,
  kept the direction label visible, and bounded pagination pages/tools. Desktop
  and compact screenshots were inspected and the browser console had no warn/
  error entries.

- [x] 4.3 Re-run focused person/ranking tests, typecheck/build, layout detector,
  strict/diff checks, and browser-audit compact profile/chart/tooltip/focus plus
  expanded-query Drawer geometry with accepted screenshots and no new logs.

  Evidence: focused person/ranking Vitest passed 19/19; Vue typecheck and Vite
  production build passed; Impeccable layout detection returned `[]`; the change
  is strict-valid and `git diff --check` passes. Product Design Audit at 636×807
  captured and inspected profile, chart hover, and expanded-query Drawer states
  before and after. The biography now begins 2px after the natural identity row;
  Drawer/section titles measure 24px/20px; the trigger contains shared AppIcon
  with no raw “i”; score 6 and 8 counts end 4px above their fills; eight pointer
  samples kept one pointer-transparent tooltip visible at an unchanged position.
  Initial focus is the labelled dialog without a close ring, Tab moves to close
  with visible focus, and Shift+Tab wraps to the last control. With page scrollY
  400 and Query Editor expanded, documentElement locking kept Header at 0–55px
  and Drawer at 55px with no content gap; body overflow stayed unchanged. At
  360px document scrollWidth equaled clientWidth. Browser console was clean.

- [x] 4.4 Run the focused ranking App test, typecheck/build, Impeccable detector,
  strict validation, and diff check; browser-check compact ordinary success
  remains on the ranking list while manual row activation opens the labelled
  Drawer, with clean console and no framework overlay.

  Evidence: the focused ranking App suite passed 11/11; Vue typecheck and Vite
  production build passed; Impeccable detection returned `[]`; this change is
  strict-valid and `git diff --check` passes. At 647×807, ordinary success kept
  the accepted first row selected while rendering zero detail dialogs, no App
  inert state, no overflow, and no framework overlay. Activating that row then
  opened exactly one labelled detail dialog and focused it. At 961×807 the same
  selected person remained visible in the inline Inspector. Fresh browser logs
  contained no warning or error entries.

- [x] 4.5 Strict-validate the reconciled ownership and DESIGN/sidecar, run the
  focused query/ranking component and App regressions, Vue typecheck/build,
  Impeccable layout detector, and `git diff --check`; browser-check current 5174
  at 893px and 390px for initial, core-pending, complete-zero, search-empty, and
  ready states with no overflow, framework overlay, or relevant console error.

  Evidence: the ranking/query component suites passed 48/48 and the two exact
  App pending/complete-zero integration cases passed; the full 59-test focused
  batch passed 58/59, with only an unrelated existing compact theme test failing
  because its `matchMedia` helper dispatches an undefined event. Pinned Node
  24.18.0/npm 11.16.0 typecheck and production build passed (existing large-
  chunk warning only); Impeccable layout detection returned `[]`; all four
  coordinated changes are strict-valid; the sidecar parses and `git diff
  --check` passes. The complete Frontend gate was attempted but stopped before
  tests at the pre-existing architecture inventory mismatch for untracked
  `InfoIcon.vue`, `info-trigger.test.ts`, and `shell-layout.test.ts`.

  Browser evidence on the current 5174 checkout measured the 893px first state
  at 360px with transparent/no-border/no-shadow chrome and zero buttons. The
  729215 complete-zero state used the same 360px hierarchy with zero summary,
  toolbar, columns, footer, pagination, or zero-value copy. Core pending at
  893px and 390px rendered summary/toolbar/columns/10 rows/pagination with direct
  Naive Skeleton data leaves and the truthful query-derived “作品 / 系列” column
  label, no real controls, one visible ranking loading announcement, and
  `scrollWidth === clientWidth`. A 729218 non-zero result
  retained real rows/summary/controls; searching `__codex_no_match__` retained
  the 361-person/827-work summary, toolbar, and pagination while showing the
  search-empty title. The fresh QA tab had meaningful content, no framework
  overlay, and zero console warnings/errors.

## 5. Deferred lifecycle — owner: primary agent

- [ ] 5.1 In the later accumulated batch, run the complete gate, sync/archive
  after the catalog and query-panel changes, validate all strictly, and report
  commit/push/release/deploy as not done unless separately authorized.

`frontend-stabilize-ranking-result-layout` owns the next write only for App's
desktop companion-skeleton pending bridge and its exact ranking integration
timing assertions. All other completed tasks and deferred lifecycle work remain
unchanged here.
