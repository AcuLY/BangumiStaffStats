## Task Boundary

| Field | Boundary |
|---|---|
| Status | Local focused fix; heavy gates deferred |
| Owner | Primary agent, Frontend query shell and co-star vertical |
| Writable paths | Exact proposal paths and transferred selector/callback/test slices |
| Read-only protected inputs | Query/coordinator/API/catalog/statistics/selection-limit authorities and external state |
| Deletion complement | Preserve all fields, controls, leaves, candidates, selection actions, shares, and results |
| Mutable refs | Current local worktree only |
| Consumes | Existing components/tokens and accepted candidate payload |
| Produces | Six requested interaction/presentation outcomes |
| Dependencies | Existing active query/catalog/co-star work; no new package |
| Deliverables | Strict artifacts, code/docs/tests, focused/build/layout/browser/diff evidence |
| Acceptance | State-safe first-two selection and responsive visual polish |
| Non-goals | Broad redesign, contract/statistics/Backend/deploy work |
| Operations deferred | Full gate, sync/archive, commit/push/release/deploy |
| Stop/rollback conditions | Ownership/state/share/focus/overflow/test mismatch |

## 1. Frontend query shell

- [x] 1.1 Preflight branch, HEAD, allowed dirty state, current active changes,
  transferred ownership, and strict-valid reviewed artifacts; stop on mismatch.
- [x] 1.2 Update PRODUCT/DESIGN/sidecar for backend-ranked first-two selection
  and preserve closed mobile Drawer/share replay semantics.
- [x] 1.3 Add vertical Query Workspace disclosure motion and remove only the
  catalog leaf inline-start indent.
- [x] 1.4 Add an applied-query target-mode execution path and remove the two
  applied-only placeholders; preserve dirty Draft, ready target resources, and
  exact share initialization.
- [x] 1.5 Add focused query component/source assertions for grid-row motion,
  reduced motion, synchronized durations, and unindented leaves.
- [x] 1.6 Make unchanged submit a silent disclosure-preserving no-op, close the
  catalog after leaf activation, and remove the redundant footer pending label.
- [x] 1.7 Add focused QueryWorkspace/coordinator/selector/footer regressions and
  desktop/compact browser evidence for these states.

  Evidence: focused query/coordinator tests prove the no-op guard publishes no
  feedback and the leaf closes its catalog. Browser at 961x807 kept QueryEditor
  mounted after unchanged submit with no “查询条件没有变化”, no request/app
  feedback, and no `.query-editor__status`; both tested leaf activations closed
  the desktop catalog after its transition.
- [x] 1.8 Add a first-query reveal mode that scrolls to top, emphasizes the
  entire Query Workspace, and enters editor focus from the co-star empty-state
  action. The historical ranking CTA slice is superseded and transferred to
  `frontend-auto-open-ranking-detail`.
- [x] 1.9 Add focused timer/focus/scroll/source regressions plus desktop and
  compact rendered checks for the retained co-star action, preserving ordinary
  disclosure and reduced motion; ranking CTA evidence below is historical only.

  Evidence: focused query/ranking/co-star Vitest passed 53/53; Vue typecheck and
  production build passed; targeted detector returned `[]`; `git diff --check`
  passes. At 961x807 the first-query action moved scrollY 153.9 -> 0, applied
  the whole-panel attention ring, focused `userId`, and cleared attention after
  its timer. At 390x844 the Query Workspace itself received focus, scroll
  completed at 0 without opening an input field, and document scrollWidth equaled
  clientWidth. Ordinary summary disclosure did not add attention. A clean reload
  added no warn/error; one retained Naive global-style entry came from HMR.

## 2. Frontend co-star vertical

- [x] 2.1 Preflight the exact App/co-star CSS/test slices and confirm no
  concurrent overlapping write; stop on mismatch.
- [x] 2.2 Align search/sort/order controls, add neutral candidate-row borders,
  and render the rail attention/focus outline outside internal content.
- [x] 2.3 Initialize an empty ordinary accepted candidates query with up to the
  first two backend items while preserving share replay, retained selection,
  view-only operations, limits, and closed mobile Drawer.
- [x] 2.4 Add focused component/integration tests for presentation and all
  initial-selection guards.
- [x] 2.5 Give SortDirectionButton an optional public size prop and render the
  Person Inspector work Input/Select/Button with the ranking toolbar's shared
  responsive size (`medium` desktop, `small` compact) plus 44px effective hit
  regions; add focused component/source assertions without changing other
  toolbars.
- [x] 2.6 Narrow compact direction-label hiding to the actual label node so
  candidate, ranking, and other shared SortDirectionButton consumers retain a
  visible arrow; add a source regression and compact browser evidence.
- [x] 2.7 Restore the candidate direction label beside its arrow, reserve an
  80px direction track across candidate toolbar layouts, and verify 360/430/605
  plus desktop without clipping or overflow.
- [x] 2.8 Replace the shared chevron with a straight-stem direction arrow and
  align SortDirectionButton's input surface with adjacent Naive Selects in
  Light/Dark, default/hover/focus, and asc/desc states.

## 3. Focused acceptance and deferred lifecycle

- [x] 3.1 Run affected query/co-star Vitest, Vue typecheck/build, Impeccable
  layout detector, strict validation for coordinated changes, and
  `git diff --check`; record exact evidence. Do not use reset/checkout/clean,
  broad deletion, `git add -A`, or writes outside declared paths.

  Evidence: 123/123 focused tests passed across coordinator/query/co-star/person/
  ranking/App integration; Vue typecheck and Vite production build passed;
  targeted Impeccable detection returned `[]`; this change is strict-valid and
  `git diff --check` passes. Vite retains only its existing large-chunk warning.
- [x] 3.2 Browser-check about 961x807 and one compact viewport: vertical
  disclosure, aligned toolbar, row borders, outward rail ring, default first
  two people, closed Drawer, keyboard focus, console, and overflow.

  Evidence: the native local Backend at 8080 and proxied Vite 5174 rendered at
  961x807 and 390x844. Catalog leaf/category left edges matched with 0px list
  inline padding. A 10ms close sampling captured panel heights 342.7 -> 263.6 ->
  15.9 -> unmounted while opacity changed 1 -> 0.769 -> 0.045, proving the
  vertical transition rather than an opacity-only jump. Mode switch loaded the same Applied Query without the obsolete
  state and selected backend ranks 1/2. Candidate work tools measured 28px;
  the Inspector work toolbar now matches ranking at 34px on desktop and 28px
  below 780px across Input/Select/Button, while sort retained 112px in the rail.
  Unselected rows kept a neutral 1px CSS border; rail attention used a z-index 3
  ring inset -3px outside children. Both viewports had scrollWidth equal
  clientWidth. Compact Drawer remained closed until explicitly opened and then
  showed the same aligned controls/borders. A clean reload added no new warn/
  error; the log buffer retained one earlier HMR-only Naive global-style entry.

  Size-unification follow-up evidence: the focused person-detail cascade test
  passed; pinned Node 24.18.0/npm 11.16.0 typecheck and Vite build passed; the
  edited component/CSS detector returned `[]`; strict validation and
  `git diff --check` passed. At 893px, ranking and Inspector work tools both
  measured 34px visibly and about 44px effectively; at 390px both measured
  28px visibly and about 44px effectively. Both viewports retained zero
  horizontal overflow, and a fresh browser tab had no warning/error.
- [ ] 3.3 During the later user-requested batch only, run the complete Frontend
  gate and sync/archive root specs. Committed, pushed, merged, released, and
  deployed remain false unless separately authorized.
