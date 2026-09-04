## Why

The newly in-flow Query Workspace and hierarchical position browser expose a
small set of visual discontinuities: the editor fades without visibly changing
height, position leaves retain an unintended left indent, and the co-star rail
mixes control geometry, clipped focus treatment, and borderless candidate rows.
The user also wants an ordinary successful co-star query to begin with the first
two backend-ranked candidates instead of an empty analysis state.

## What Changes

- Animate Query Editor disclosure vertically as well as by opacity while
  keeping it in document flow and honoring reduced motion.
- Remove the left indent from disclosed position leaves without changing the
  hierarchy, canonical identity, or compact behavior.
- Align the candidate search/sort/order toolbar, give every candidate row a
  visible neutral border, and move the rail attention/focus ring outside its
  contents so internal controls cannot cover it.
- Keep the candidate direction button's “升序 / 降序” label visible beside its
  arrow at every supported width and reserve an 80px toolbar track for it.
- Replace the bent chevron with the shared icon system's straight-stem direction
  arrow and give the direction Button the same input background as adjacent
  Naive Select controls across themes and interaction states.
- Remove the applied-but-unloaded mode state: switching modes with an Applied
  Query directly loads the target operation from that same query while
  preserving any dirty Draft.
- Normalize the nested Person Inspector work toolbar to the same responsive
  Naive UI size as the ranking toolbar: `medium` on desktop and `small` below
  780px for Input, Select, and direction Button through public size props.
- Treat an unchanged Query Draft submission as a silent no-op: no request,
  duplicate feedback, error styling, or editor collapse.
- Close the hierarchical position catalog after a leaf is activated and remove
  the redundant left-side “查询中” footer status while keeping button/pending
  semantics accessible.
- Keep the co-star first-query empty-state action revealing Query Workspace:
  scroll the document to top, expand/focus the editor, and briefly emphasize the
  complete parameter panel without changing ordinary summary disclosure. The
  later ranking feedback removes its duplicate action because ranking Query
  Editor is already open.
- After an ordinary accepted primary co-star query, default-select up to the
  first two candidates in backend order when selection is empty. Preserve exact
  share replay, retained selection, candidate view-only operations, and the
  mobile picker closed state.
- Add focused product/component/integration/browser evidence and defer the
  complete Frontend gate to the user's later batch.

All requested presentation and initial-selection changes are
`INTENTIONAL_DELTA` from oracle
`644b7748674e553f863d0ffd61d029f86fdc0717`, governed by the user's explicit
2026-08-27 annotations and the reconciled PRODUCT/DESIGN rules. Existing query,
catalog, selection-limit, share, API, ranking, and analysis behavior remains
`PRESERVE_ORACLE`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-query-shell`: polish the in-flow query disclosure motion and remove
  the position-leaf indent.
- `frontend-co-star-vertical`: polish rail controls/focus/rows and initialize an
  empty ordinary query from the first two accepted backend candidates.
- `frontend-person-inspector`: use one compact Naive UI size across the embedded
  work-search toolbar.

## Impact

- **Status:** local specification, implementation, and focused verification.
- **Owner:** Frontend query shell and co-star vertical; primary agent owns all
  writes and acceptance.
- **Writable paths:** this change; `PRODUCT.md`, `DESIGN.md`,
  `.impeccable/design.json`; the exact query transition rules in
  `frontend/src/shared/styles/base.css`; the exact position-list padding rule in
  `frontend/src/features/query/components/PositionCatalogBrowser.vue`; exact
  candidate rail/toolbar/row/focus rules in
  `frontend/src/features/co-star/co-star.css`; the ordinary-query callback/share
  replay guard and mode-loader watch in `frontend/src/app/App.vue`; the applied-
  query primary execution path in `frontend/src/features/query/coordinator.ts`;
  `frontend/src/features/person-detail/components/PersonItemBrowser.vue`, the
  public optional size prop in
  `frontend/src/features/ranking/components/SortDirectionButton.vue`, exact
  work-toolbar rules in `frontend/src/features/person-detail/person-detail.css`;
  focused query/co-star/ranking/person tests; root specs only during the deferred
  sync batch.
- **Read-only protected inputs:** Query Draft/Applied ownership, coordinator and
  API contracts, catalog data, candidate ranking/count computation, selection
  limits, analysis components, Backend/updater/Archive, original worktree,
  remotes, hosts, and production.
- **Deletion complement:** remove no fields, catalog groups/leaves, candidates,
  selection actions, share states, tests, or result surfaces.
- **Mutable refs:** current local worktree only.
- **Consumes:** accepted candidate payload order/current position identity,
  existing Vue Transition, Naive UI public controls, and semantic tokens.
- **Produces:** vertically animated query disclosure, unindented leaves,
  consistent co-star controls/borders/focus, direct same-Applied-Query mode
  loading, compact Inspector work controls, and deterministic first-two
  selection for ordinary co-star apply.
- **Dependencies:** the implemented `frontend-move-query-panel-into-content`
  topology and `frontend-clarify-timeout-and-catalog-keys` browser; no package.
- **Deliverables:** bounded code/docs/tests, strict validation, focused Vitest,
  build/typecheck, layout detector, desktop/compact browser evidence, diff check.
- **Acceptance:** requested visuals at about 961x807 and compact width; mode
  switch starts the missing target resource without applying dirty Draft or
  rendering the obsolete applied-only state; nested work controls share small;
  selection begins with up to two backend items only on ordinary accepted primary apply;
  exact share/retained/view-only states remain unchanged; no clipped focus,
  overflow, console error, or automatic mobile drawer.
- **Non-goals:** redesigning the whole Query Editor or candidate picker,
  changing candidate ordering/statistics/API/contracts, dependencies, Backend,
  Archive, deployment, or unrelated cleanup.
- **Operations deferred:** complete Frontend gate, root-spec sync/archive,
  commit, push, PR, release, deployment, and production mutation.
- **Stop/rollback conditions:** stop on active ownership conflict, share replay
  drift, lost retained selection, selection/order mismatch, inaccessible focus,
  layout overflow, failed focused checks, or required scope expansion.

`contracts-add-all-position-candidates` receives the next write for nullable
candidate input/result state, CandidatePicker's position selector/row identities,
App default mixed identities, coordinator/share candidate input, adapters, and
their cross-component tests. This change retains only the independent toolbar/
row-border/focus polish and query-shell corrections described above.

`frontend-harden-interaction-reveal-focus` receives all subsequent cross-region
pagination/locator/topology/removal focus, compact catalog breakpoint/target,
QueryWorkspace focus-retention, compact 44px effective-target, and shared reveal
helper slices. This change keeps its completed motion/no-op/leaf-close/mode-load/
default-policy/toolbar/border/size outputs frozen.

Apply is blocked until proposal, design, delta specs, and tasks are complete,
strict-valid, reviewed by the primary agent with zero P0/P1 planning findings,
and the two older active changes explicitly transfer the exact next-write
slices named above.

`frontend-auto-open-ranking-detail` receives next-write ownership of App's exact
ranking first-query empty-state template and the ranking CTA assertion slice in
`frontend/tests/features/query/components.test.ts`. The historical ranking
reveal evidence remains a record, but its visible CTA requirement is superseded
by the user's 2026-09-02 instruction; co-star reveal behavior remains owned here.

`frontend-close-session-ui-residuals` receives the next write for the main
ranking toolbar’s 34/28px visible versus 44px effective geometry, primary-query
duplicate-feedback projection, and PersonDetailSkeleton responsive geometry.
This change retains its Query disclosure/no-op/mode-load/default-selection,
candidate toolbar/row/rail ring, and PersonItemBrowser small-toolbar outputs.
