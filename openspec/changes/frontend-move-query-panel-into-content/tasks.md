## Task Boundary

| Field | Boundary |
|---|---|
| Status | Local focused fix; heavy gates deferred |
| Owner | Frontend shell/query workspace |
| Writable paths | Exact proposal paths excluding transferred QueryWorkspace no-op/reveal, QueryEditor footer copy, base transition/attention/footer, App mode/default/reveal, co-star rail/toolbar/row/focus/reveal and focused-test slices; topology/sidecar/wheel binding/remaining tests/root spec later |
| Read-only protected inputs | QueryEditor form/state/business/results/unrelated changes/external state; completed App/ranking test frozen for next owner |
| Deletion complement | Preserve all controls/state/results; remove old placement only |
| Mutable refs | Current worktree only |
| Consumes | App/Header/QueryWorkspace/CSS |
| Produces | In-flow collapsible main-content panel |
| Dependencies | Existing shell/tokens |
| Deliverables | Code/test/typecheck/build/browser/layout evidence |
| Acceptance | Correct DOM/order/state/focus/responsive/no overlay |
| Non-goals | Form/query/result/dependency/deploy changes |
| Operations deferred | Full gate/sync/archive/commit/push/release/deploy |
| Stop/rollback conditions | Overlap/state/focus/overflow/visual/test failure |

## 1. Planning and implementation

- [x] 1.1 Reconcile DESIGN/sidecar and the orthogonal active query-shell delta;
  review strict-valid artifacts and run layout detector.
- [x] 1.2 Move QueryWorkspace from Header slot to first main child; remove obsolete Header query row.
- [x] 1.3 Replace teleport/fixed overlay and internal scroll CSS with one in-flow
  collapsible surface; remove obsolete QueryEditor wheel containment.
- [x] 1.4 Update registered ranking/co-star tests for DOM order, disclosure,
  native page scrolling, sole shell-scroll ownership, and removed Header/
  overlay CSS.
- [x] 1.5 Remove the desktop `stable both-edges` document override and update
  the scrollbar regression to forbid browser-dependent mirrored left gutter.
- [x] 1.6 Match query-summary bottom-corner enter/leave transitions to the
  panel's directional durations without changing disclosure state ownership.
- [x] 1.7 Remove AppHeader compact-context ownership and mount the existing
  MobileCandidateEntry as the first child of App's co-star mode content; rename
  CoStarWorkspace's external-entry prop and delete only obsolete Header wiring.
  Preserve candidate Drawer, selection, focus restoration, query-close guard,
  desktop rail, lazy loading/error availability, and all ranking/detail App
  behavior.

## 2. Focused validation

- [x] 2.1 Run focused Vitest, typecheck/build, layout detector, strict change validation, diff check.

  Evidence: focused Vitest passed 10/10 unique tests across ranking structure/
  wheel, co-star CSS, existing disclosure/focus regressions, and the scrollbar
  ownership contract; `npm run build`
  passed Vue typecheck plus Vite production build; Impeccable layout detect
  returned `[]`; both coordinated active changes are strict-valid;
  design.json parses and `git diff --check` passes. Vite retains its existing
  non-blocking large-chunk warning.
- [x] 2.2 Browser-check expanded/collapsed ranking/co-star at desktop and practical compact width with clean logs/screenshots.

  Evidence: local Vite `127.0.0.1:5174/ranking` showed a measured 59px
  single-row sticky Header, one static QueryWorkspace as main's first child,
  zero Header query/overlay nodes, natural result displacement and page wheel
  scrolling. At 390x844 the editor remained in flow with visible overflow,
  document `scrollWidth === clientWidth`, and no console warn/error. Desktop
  and compact viewport screenshots were inspected; switching to `/co-star`
  kept the same first-child ownership and clean console at both widths. The
  full breakpoint/theme matrix remains deliberately batched.
- [x] 2.3 Re-run the focused scrollbar test/diff/strict validation and measure
  Header/main/document geometry at 779/780/desktop with classic scrollbars,
  confirming one right gutter and no left strip.

  Evidence: 6/6 scrollbar tests passed and the source forbids
  `stable both-edges`. IAB classic-scrollbar geometry at 781/780/779 reported
  `scrollbar-gutter: auto`, Header left 0, document scrollWidth equal clientWidth,
  and only the real 9px right scrollbar; main content retained intentional 16px
  desktop / 12px compact insets.
- [x] 2.4 Add focused source/browser evidence for open/close start, midpoint,
  and completion radii plus reduced motion; re-run strict/diff/layout checks.

  Evidence: the summary now computes a 160ms ease-out bottom-corner transition
  while opening and 120ms ease-in while closing, matching the panel's existing
  directional durations; the established reduced-motion rule still reduces both
  to zero. Raw browser-frame sampling observed intermediate corner radii during
  both directions while the panel transition was active. The focused query/
  ranking Vitest run passed 29/29, Vue typecheck plus production build passed,
  Impeccable layout detection returned `[]`, all three coordinated changes are
  strict-valid, and `git diff --check` passes.
- [ ] 2.5 Update focused AppHeader/co-star/query tests and browser-check compact
  ready/selected/query-expanded states: exactly one content entry, no Header
  context row, Drawer open/close focus restoration, desktop rail unchanged,
  clean console, layout detector, strict validation, build, and diff check.

  Partial evidence: focused query/co-star/component Vitest passed 57/57; Vue
  typecheck and production build passed; Impeccable layout detection returned
  `[]`; both coordinated changes are strict-valid and `git diff --check` passes.
  Tests prove no Header context node, exactly one mode-content entry, temporary
  hiding while Query Editor is expanded, lazy load/failure persistence, and
  existing Drawer/focus isolation. The IAB captured the pre-change Header state,
  but final reload was blocked by its localhost URL security policy; no browser
  workaround was attempted, so rendered acceptance remains pending.

## 3. Deferred lifecycle

- [ ] 3.1 During the later batch, run the complete Frontend gate, synchronize
  the root spec after `frontend-clarify-timeout-and-catalog-keys`, archive and
  validate all. Commit/push/release/deploy remain out of scope unless separately
  authorized.
