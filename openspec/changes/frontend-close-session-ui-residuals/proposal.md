## Why

The session accumulated many focused UI corrections, but a requirement-by-
requirement audit found several user-visible and accessibility defects that
earlier completion claims missed: hidden near-fold position menus, mismatched
ranking controls, duplicate operation feedback, keyboard-inaccessible
pagination, breakpoint focus loss, stale all-position copy/state, and a loading
skeleton that does not match the final person profile. These defects share one
release risk: tests covered isolated happy paths but not the complete rendered
interaction.

## What Changes

- Restore viewport-aware PositionSelector placement so its anchored menu flips
  or shifts into view like an ordinary selector without resizing Query Workspace.
- Align PositionSelector’s trigger text, placeholder, background, default/
  hover/focus boundary, and suffix icon with the adjacent same-size Naive Select
  in both Light and Dark; remove the visually separate suffix cell treatment.
- Replace the tag-style multi-selector with one Naive DynamicInput-backed list:
  each row is an ordinary mutually exclusive position selector, rows can be
  inserted/removed, at least one empty-capable row remains, and both modes use
  the shared “职位” / “选择职位” copy.
- Preserve the pre-DynamicInput compact catalog chrome: content width up to
  480px, viewport-bounded with no horizontal scrolling, one native-equivalent
  rounded menu surface and shadow, and no second raw-Popover shadow layer.
  Keep mode-specific position semantics in the existing title Info help without
  repeating a visible field hint, remove the position field’s right inset, and
  render add/remove as ordinary square default Naive Buttons without circle/
  quaternary/secondary variants. Separate the selector from its action group
  and the two square actions from each other by the shared 8px spacing token,
  let the selector flex into the remaining width, and keep the final action
  flush with the field's right edge without `space-between`.
- When the ranking toolbar renders, make its search/sort/order controls visibly
  use one Naive UI size at each breakpoint while retaining 44px effective targets.
- Establish one visible owner for primary-query error/cancel feedback instead
  of rendering the same message inside and below Query Workspace.
- Give every AdaptivePagination previous/page/next/fast-jump item a native
  keyboard-focusable button and at least 44px effective target through public
  Naive pagination render APIs.
- Transfer focus between the compact co-star Drawer entry and desktop candidate
  search when crossing 779/780; focus must never fall to `body`.
- Treat nullable candidate `positionKey: null` as the explicit all-position
  state during pending views and replace the obsolete “first position is the
  default browser” help with truthful all-position copy.
- Make PersonDetailSkeleton mirror the final profile’s top alignment, compact
  square portrait, and edge geometry.
- Add rendered and automated regressions for every corrected requirement and
  keep the complete accumulated gate deferred until another sufficient batch.

These are user-authorized `INTENTIONAL_DELTA` corrections governed by the
session’s explicit annotations and `DESIGN.md` control/focus/loading contracts.
All query data, ranking/statistical semantics, selection limits, routes, and
the remaining external behavior stay `PRESERVE_ORACLE` against
`644b7748674e553f863d0ffd61d029f86fdc0717`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-query-shell`: require viewport-aware catalog placement, one primary
  feedback owner, and truthful all-position help.
- `frontend-ranking-results`: require size-consistent ranking controls and
  keyboard/touch-operable shared pagination.
- `frontend-person-inspector`: require pending skeleton geometry to mirror the
  responsive final profile.
- `frontend-co-star-vertical`: preserve focus across responsive picker topology
  changes and preserve explicit nullable all-position state while pending.

## Impact

- **Status:** ten residuals locally implemented/focused-verified; not committed,
  pushed, merged, released, or deployed.
- **Owner:** Frontend; primary agent owns specification, shared-component
  consistency, runtime browser evidence, and final acceptance.
- **Writable paths:** this change; `DESIGN.md`, `.impeccable/design.json`;
  `frontend/src/app/App.vue` exact operation-feedback projection;
  `frontend/src/features/query/components/{PositionSelector,PositionCatalogBrowser,QueryEditor}.vue`;
  `frontend/src/features/ranking/components/AdaptivePagination.vue` and only the
  rendered-toolbar/pagination slices in `RankingResults.vue`; exact ranking
  control/pagination rules in
  `frontend/src/shared/styles/base.css` and
  `frontend/src/features/person-detail/person-detail.css`;
  `frontend/src/features/person-detail/components/PersonDetailSkeleton.vue`;
  `frontend/src/features/co-star/components/{CoStarWorkspace,CandidatePicker}.vue`;
  focused query/ranking/person/co-star/App tests; exact ownership-transfer notes
  in older active changes; affected root specs only during deferred sync/archive.
- **Read-only protected inputs:** query/API/generated contracts, backend
  statistical semantics, Archive/updater data, candidate ranking and selection
  limits, final PersonProfile content, unrelated UI/components/tests, remotes,
  hosts, and production.
- **Deletion complement:** remove no field, pagination function, candidate,
  status recovery, skeleton section, accessible name, test, or result surface;
  replace only duplicate/misleading presentation and inaccessible wrappers.
- **Mutable refs:** current dirty local worktree only; no remote or external ref.
- **Consumes:** Naive UI public Popover and Pagination render APIs, existing
  compact breakpoint, accepted candidate nullable input, semantic focus/touch
  tokens, and current final-profile geometry.
- **Produces:** viewport-visible and Naive-aligned dynamic selector rows/overlay,
  coherent toolbar geometry,
  single feedback presentation, accessible shared pagination, breakpoint-safe
  co-star focus, stable all-position pending state, and faithful detail skeleton.
- **Dependencies:** existing Vue/Naive/native DOM only; no new package.
- **Deliverables:** strict specs, code/docs/tests, focused Vitest/typecheck/build/
  detector/diff evidence, plus 352/390/636/779/780/961 rendered interaction checks.
- **Acceptance:** every listed defect has direct current-state evidence;
  selector/pagination/picker work by keyboard and pointer; visible controls match
  28/34px public sizes with >=44px effective targets; PositionSelector matches
  adjacent Naive Select text/placeholder/background/boundary/suffix roles in
  Light and Dark; each row replaces its own value, add/remove preserves ordered
  unique position keys and at least one row, both modes use shared position copy;
  compact content-width menus have no horizontal scrollbar or duplicate chrome;
  add/remove actions use size-matched square default Button surfaces with 44px
  click height, 8px selector-to-actions and action gaps, and a flush final edge;
  no duplicate feedback, focus-to-body,
  parent-height shift, page overflow, or console error.
- **Non-goals:** query/statistical/API schema changes, backend performance or
  image transport, broad redesign, dependencies, full gate, lifecycle, or deploy.
- **Operations deferred:** full accumulated Frontend gate, root-spec sync/archive,
  commit/push/PR/merge/release/deploy, and any host/production mutation.
- **Stop/rollback conditions:** stop on state/request drift, lost feedback or
  recovery action, inaccessible pagination, focus trap/body fallback, compact
  clipping/overflow, candidate-selection drift, skeleton layout shift, unrelated
  visual change, or failed focused acceptance.

This change receives exact next-write ownership from
`frontend-harden-interaction-reveal-focus`,
`frontend-polish-query-and-co-star-workspace`,
`frontend-clarify-timeout-and-catalog-keys`, and
`contracts-add-all-position-candidates` only for the paths/behaviors declared
above. Apply is blocked until proposal, design, four delta specs, and tasks are
complete, strict-valid, and reviewed by the primary agent with zero unresolved
P0/P1 planning findings.

`frontend-stabilize-ranking-result-layout` receives next-write ownership only
of the root `html`/`body` minimum-width declarations in `base.css` and the exact
root-width assertion in `scrollbar-system.test.ts`. It SHALL preserve the
accepted scrollbar owner, toolbar/pagination geometry, theme, selector, focus,
  and all other residual outputs.

`frontend-auto-open-ranking-detail` receives next-write ownership of
RankingResults' primary pending and complete-zero branches, App's ranking
first-query state, the exact empty/pending CSS in `base.css`, and their focused
query/ranking tests. This change retains toolbar/pagination geometry only when
those controls render; its completed historical tasks remain checked.
