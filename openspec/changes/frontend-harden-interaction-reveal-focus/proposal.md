## Why

The workbench has several actions that update or replace a result above the
trigger—pagination, compact catalog disclosure, candidate selection, analysis
topology changes, and preference “locate” links—but they do not consistently
reveal the new target or preserve focus. The same omission causes hidden new
content, focus falling to body, and breakpoint-only overflow despite otherwise
correct component states.

## What Changes

- Establish one frontend reveal contract: after an accepted cross-region action,
  scroll the owning result region into view, focus a semantic region/control,
  briefly emphasize the complete target, and honor reduced motion.
- Apply it to ranking, candidate, partners, person-item, and co-star-work
  pagination after accepted page/page-size requests.
- Make the position catalog use one Naive UI anchored body-portal Popover at
  every viewport, so compact disclosure behaves like an ordinary selector
  without changing Query Workspace height; fully unmount its content/follower
  on close or across the 780px boundary.
- Make the trigger itself the searchable combobox, remove the duplicate search
  field inside the panel, and use a fixed Naive-small-aligned 212.8px list that
  uses viewport-aware Naive placement and clips every child to the panel radius.
- Remove catalog-specific focus/attention borders and arrow outlines; match the
  Naive selector contract of one trigger focus state plus a neutral 6px menu
  surface with the standard menu shadow.
- Align catalog options with measured Naive menu geometry: 28px compact and
  34px desktop height, `0 12px` padding, 21px line-height, square contiguous
  outer rows, and an inset rounded state layer with Naive's 300ms fade.
- Keep category disclosure labels in primary text and give their interactive
  rows 4px additional block padding (36px compact / 42px desktop), while
  counts and arrows remain tertiary and search context stays inline.
- Make desktop “选择人物” reveal/focus the candidate rail and make Partners →
  CoStar topology replacement reveal/focus the new analysis region.
- Preserve focus after query attention expires and after selected identity/
  person removal; add consistent target emphasis to both preference-locator
  flows.
- Bring compact Query Editor input/select/button effective targets to 44px
  without changing their Naive UI `small` 28px visible surfaces.

This is a user-authorized `INTENTIONAL_DELTA` from oracle
`644b7748674e553f863d0ffd61d029f86fdc0717`, extending the accepted WCAG 2.2 AA
focus, responsive, and reduced-motion rules. Existing requests, result meaning,
component-library ownership, and visual identity remain `PRESERVE_ORACLE`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-query-shell`: retain reveal focus, make compact catalog disclosure
  an anchored overlay, eliminate breakpoint follower overflow, and restore
  compact visible/control target consistency.
- `frontend-ranking-results`: reveal and focus new ranking pages after accepted
  pagination.
- `frontend-person-inspector`: reveal/focus person-item pages and emphasize
  preference-located work browser results.
- `frontend-co-star-vertical`: reveal candidate/partners/common-work pages,
  candidate rail and analysis topology; restore removal focus and locator emphasis.

## Impact

- **Status:** local implementation and focused verification; not committed,
  pushed, merged, released, or deployed.
- **Owner:** Frontend interaction/focus layer; primary agent owns specification,
  cross-feature consistency, and acceptance.
- **Writable paths:** this change; `DESIGN.md`, `.impeccable/design.json`;
  `frontend/src/shared/composables/useResultReveal.ts`, exact reveal styles in
  `frontend/src/shared/styles/base.css`; `frontend/src/app/App.vue`;
  `frontend/src/features/query/components/{QueryWorkspace,PositionSelector,PositionCatalogBrowser,QueryEditor}.vue`;
  `frontend/src/features/ranking/components/RankingResults.vue`;
  `frontend/src/features/person-detail/components/{PersonInspector,PersonItemBrowser}.vue`
  and exact reveal/compact-target rules in `person-detail.css`;
  `frontend/src/features/co-star/components/{CandidatePicker,CoStarWorkspace,PartnersSurface,CoStarSurface,CoStarWorkBrowser}.vue`
  and exact reveal rules in `co-star.css`, `partners.css`, `co-star-analysis.css`;
  focused query/ranking/person/co-star/App tests; four root specs only during
  deferred sync/archive; exact ownership-transfer notes in older active changes.
- **Read-only protected inputs:** API/generated contracts, query/statistics/
  selection semantics except focus restoration, Backend/updater/Archive,
  unrelated components/tests, remotes, hosts, and production.
- **Deletion complement:** remove no control, status, result, selection action,
  breakpoint, request, test, or accessible name; remove only orphaned CSS and
  leaked Popover follower ownership.
- **Mutable refs:** current local worktree only.
- **Consumes:** accepted view results, stable result regions, existing Naive UI
  controls/Drawer focus traps, semantic focus token, reduced-motion media query.
- **Produces:** shared reveal helper, focus-safe transitions, bounded attention,
  breakpoint-safe anchored catalog, and compact 28px-visible/44px-effective targets.
- **Dependencies:** Vue 3/Naive UI/native DOM scrolling; no package.
- **Deliverables:** code/tests, strict OpenSpec, typecheck/build/detector/diff,
  desktop/compact/breakpoint browser evidence.
- **Acceptance:** every audited P1/P2 route reveals its target without focus
  loss; pagination waits for accepted data; 352/390/779/780/961 have no
  overflow, parent-height shift, or duplicate panel ID; compact controls retain
  28px visible height with 44px effective targets; trigger search, bottom-start
  preferred viewport-aware placement, Naive-aligned neutral menu styling, rounded clipping, and
  exact item metrics, reduced-motion, and forced-colors hold.
- **Non-goals:** changing data/query/selection formulas, pagination semantics,
  route topology, visible Naive size, broad restyle, dependencies, Backend, or deploy.
- **Operations deferred:** complete accumulated Frontend gate, root sync/archive,
  commit/push/PR/release/deploy and production mutation.
- **Stop/rollback conditions:** stop on request timing/state drift, focus trap or
  screen-reader regression, partial selection mutation, breakpoint overflow,
  unrelated visual change, or focused acceptance failure.

Apply is blocked until proposal, design, four delta specs, and tasks are
complete, strict-valid, reconciled with active change ownership and cumulative
specs, and reviewed by the primary agent with zero unresolved P0/P1.

`frontend-close-session-ui-residuals` receives the next write for viewport-aware
PositionSelector flip/placement, native-button AdaptivePagination semantics and
44px targets, and CoStarWorkspace 779/780 focus transfer. This change retains
its accepted-response reveal, attention expiry, removal focus, locator, and
stable analysis-region behavior; its former no-flip decision is superseded.
