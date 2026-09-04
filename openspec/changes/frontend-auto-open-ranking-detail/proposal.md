## Why

The ranking workspace currently shows a generic “选择人物查看详情” placeholder
beside a ranking skeleton, then leaves the Inspector empty after a successful
ordinary query until the user clicks a row. The detail profile portrait is also
stretched by the adjacent text grid instead of keeping SafeImage's 3:4 size.
The ranking route's first-query and complete-zero states also diverge: the
first is a bordered card with a duplicate query action, while zero results keep
`0` summary/controls/pagination around a different compact empty treatment. The
currently served 5174 checkout also gives primary pending a generic row-block
shape instead of the ready ranking topology.

## What Changes

- Remove the desktop right-side person placeholder from the ranking workspace.
- While an initial or changed primary ranking query is pending without a
  current matching selection, render the real person-detail skeleton structure
  in the Inspector column alongside the ranking skeleton; an unchanged refresh
  retains its accepted detail.
- After an ordinary successful ranking query with results, automatically select
  the first returned ranking item and start the existing coordinated
  person-detail request; compact layout keeps the detail drawer closed until
  the user activates a ranking row.
- Preserve exact share replay: a ranking share without a detail workspace does
  not invent a selection, while a share with detail continues to replay that
  exact person/view.
- Collapse a ready/error ranking workspace to one column only when no person can
  be selected, rather than reserving an empty Inspector column.
- Extract the existing Inspector pending markup into one reusable skeleton used
  by App and PersonInspector.
- Keep profile portraits at the SafeImage 3:4 dimensions (160×213 normally,
  96×128 at narrow ≤520px layouts) instead of stretching to the right text height.
- Remove portrait corner rounding throughout compact/drawer detail layouts so the image
  aligns flush with the compact profile edge.
- Emphasize each work card's “参与职位” value with the same strong data weight
  as its other primary fact values.
- Keep the identity and biography tracks top-aligned inside the fixed portrait
  profile instead of distributing spare portrait height between text rows.
- Replace the hand-drawn text “i” evidence control with the existing AppIcon
  system, and keep metric help optically centered without shrinking its target.
- Position rating counts immediately above their bars and prevent the teleported
  tooltip from intercepting the bar hover target and flickering.
- Restore Drawer hierarchy and focus behavior: “人物详情” uses Panel typography,
  opening focuses the dialog rather than painting a close-button ring, keyboard
  focus remains visible, and document-root scroll locking keeps the sticky Header
  in the reserved top strip even when Query Editor is expanded.
- Keep the ranking search, sort selector, and direction button aligned to one
  44px interaction row; reserve enough width for the full direction label and
  reflow the toolbar into two rows only when its own pane becomes narrow.
- Keep Naive UI pagination primitives inside the ranking pane by placing page
  navigation on the first row and the content-sized page-size/jump tools on a
  full-width second row that can wrap instead of being clipped into the summary
  column.
- Add focused state, auto-selection, share, skeleton, geometry, control, and
  pagination regressions.
- Render the first-query ranking state directly on the canvas without panel
  chrome and remove its duplicate “设置查询条件” button; the already-open Query
  Editor remains the sole action surface.
- When the complete ranking summary contains zero people, suppress its summary,
  toolbar, table, and pagination and render the same plain centered empty-state
  hierarchy as the first-query state. Search-empty pages with a non-zero
  complete summary keep their recovery controls and summary.
- Make primary ranking pending mirror the ready summary/toolbar/column/row/
  pagination topology with direct Naive UI `NSkeleton` leaves while preserving
  the existing companion detail skeleton.

These are `INTENTIONAL_DELTA` behaviors from oracle
`644b7748674e553f863d0ffd61d029f86fdc0717`, explicitly authorized by the
user's current request. They remain governed by PRODUCT's coordinated resource
semantics, DESIGN's ranking/Inspector hierarchy and fixed SafeImage lifecycle,
and the formal ranking vertical's independently waiting detail boundary.
Existing result content, metrics, controls, API contracts, and visual tokens
remain `PRESERVE_ORACLE`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-ranking-results`: pair primary ranking pending/empty states with the
  correct Inspector column behavior instead of a generic placeholder, and keep
  its existing toolbar/pagination primitives aligned inside narrow result panes;
  unify first-query/complete-zero presentation and align primary pending with
  the ready pane.
- `frontend-person-inspector`: automatically activate the first ordinary query
  result, reuse one detail skeleton, preserve exact share replay, and keep the
  profile portrait at its image-derived dimensions while restoring Inspector
  hierarchy, chart stability, evidence icons, and compact Drawer geometry.

## Impact

- **Status:** local specification/implementation/focused verification only;
  not committed, pushed, merged, released, or deployed.
- **Owner:** Frontend ranking/person-inspector; primary agent owns sequencing
  and acceptance.
- **Writable paths:**
  `openspec/changes/frontend-auto-open-ranking-detail/**`,
  `DESIGN.md`, `.impeccable/design.json`,
  `frontend/src/app/App.vue`,
  `frontend/src/features/ranking/components/RankingResults.vue`,
  the exact ranking empty/pending slices in
  `frontend/src/shared/styles/base.css`,
  `frontend/src/features/person-detail/components/PersonDetailSkeleton.vue`,
  `frontend/src/features/person-detail/components/PersonInspector.vue`,
  `frontend/src/features/person-detail/components/{PersonDetailSurface,PersonProfile,RatingEvidence,StatEvidencePopover}.vue`,
  `frontend/src/features/person-detail/person-detail.css`,
  `frontend/src/shared/components/AppIcon.vue`,
  `frontend/tests/app/rankings.integration.test.ts`, and
  `frontend/tests/features/{person-detail,query,ranking}/components.test.ts`; exact
  two root specs only during later sync/archive.
- **Read-only protected inputs:** PRODUCT.md, QueryWorkspace/
  Header/selector, query model/store/coordinator and generated/API contracts,
  Backend/updater/Archive, co-star surfaces, original worktree, remotes, hosts,
  and production.
- **Deletion complement:** remove only the generic desktop detail placeholder;
  preserve ranking/person data, empty/error/retry states, manual row activation,
  share payload semantics, drawers, skeleton sections, images, metrics, tests,
  and unrelated local work. Primary ranking pending SHALL NOT add or restore a
  project-owned Skeleton component, gradient, or keyframe.
- **Mutable refs:** current local `codex/remove-archive-admission` worktree only;
  no remote/external ref.
- **Consumes:** accepted ranking payload order, existing coordinated person-
  detail operation/resource, lazy surface loader, compact drawer, SafeImage 3:4
  contract, and completed main-first QueryWorkspace topology.
- **Produces:** synchronized ranking/detail loading, first-result activation,
  no generic Inspector placeholder, reusable detail skeleton, and fixed portrait
  geometry, aligned ranking controls, bounded pagination reflow, stable rating
  evidence, and a gap-free accessible compact Drawer.
- **Dependencies:** existing Vue/Naive UI and accepted ranking/person-detail
  capabilities; no new package, API, state owner, or request path.
- **Deliverables:** strict OpenSpec, source/CSS/tests, focused Vitest/typecheck/
  build/layout checks, and desktop/compact browser state/geometry/console evidence.
- **Acceptance:** desktop primary pending shows ranking plus detail skeleton;
  ordinary success with items selects/loads first; compact success keeps that
  person's existing drawer closed until manual row activation; exact share
  without detail remains unselected;
  zero results/error reserve no blank right column; manual/stale/latest-only
  behavior persists; first-query/complete-zero states share one plain hierarchy
  with no duplicate action or zero controls/pagination; search-empty controls
  remain; primary pending mirrors ready regions using `NSkeleton`; portrait
  measures 3:4 independently of long right text;
  compact portrait has no radius; participation-role values are bold; ranking
  search/sort/direction controls share a 44px row with the direction label fully
  visible; pagination pages and tools stay inside the pane at desktop and narrow
  widths; profile copy is top-aligned; evidence icons, rating labels/tooltips,
  Drawer title/focus and sticky-Header boundary remain stable; no overflow,
  duplicate request, relevant warn/error, or visual drift.
- **Non-goals:** changing Backend ordering, API/wire schemas, ranking pagination/
  control semantics or metrics, person calculations/content, query semantics,
  selector/QueryWorkspace behavior, non-ranking empty states, image proxy,
  dependency, theme, or production routing.
- **Operations deferred:** complete accumulated Frontend gate, root sync/archive,
  commit/push/PR/merge/release/deploy, host and production mutation.
- **Stop/rollback conditions:** stop on active path overlap, wrong first ID,
  double/stale detail request, share replay drift, mobile drawer regression,
  missing loading announcement, distorted image, overflow, or failed focused
  checks; restore only exact declared Frontend paths.

`frontend-move-query-panel-into-content` transferred its completed `App.vue` and
ranking-test outputs to this change for the ranking/detail slices above. Those
slices are now complete and frozen. The query-shell change receives the next
write only for moving App's compact candidate-entry Header slot into co-star
mode content and renaming its CoStarWorkspace ownership prop; it SHALL preserve
every ranking/detail state change.
`rankings.integration.test.ts` remains owned and frozen here.

`frontend-polish-query-and-co-star-workspace` now receives the next write for
App's target-mode loader and co-star default-selection callback/share guard,
PersonItemBrowser work-toolbar size bindings, SortDirectionButton's optional
public size prop, the exact work-toolbar rules in `person-detail.css`, and new
focused mode/toolbar tests. This change's completed ranking/detail activation,
geometry, chart, Drawer, and pagination outputs remain frozen.

`frontend-harden-interaction-reveal-focus` receives only PersonItemBrowser
accepted-pagination/preference-locator reveal, compact effective-target, and
related exact CSS/test slices. It SHALL preserve profile/Drawer/toolbar size,
ranking pagination geometry, chart and detail activation outputs.

Apply is blocked until proposal, design, both delta specs, and tasks are
strict-valid and reviewed by the primary agent with zero unresolved P0/P1.

`frontend-unify-info-triggers` receives next-write ownership of AppIcon's info
glyph, StatEvidencePopover's trigger class/asset, the exact stat-evidence trigger
presentation rules, and their focused info assertions. It SHALL preserve the
accepted evidence content, Popover state/placement, accessible name, 44px target,
focus/click/Escape behavior, and every non-info AppIcon glyph.

`frontend-stabilize-ranking-result-layout` receives next-write ownership only
of App's desktop companion-skeleton condition and the corresponding timing
slice in `rankings.integration.test.ts`. It SHALL preserve this change's
accepted first-person order/request, zero-result, share, refresh, compact
Drawer, component, geometry, and all other ranking/detail outputs.

The user's 2026-09-02 empty/loading-state feedback reopens only App's initial
ranking state, RankingResults' primary pending/complete-zero branches,
person-detail ranking-layout CSS, the exact ranking/query component assertions,
and this change's artifacts. It does not reopen the companion timing slice
owned by `frontend-stabilize-ranking-result-layout`.
