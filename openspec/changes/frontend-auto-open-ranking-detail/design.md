## Context

App already owns ranking selection and the coordinated person-detail operation.
During a primary ranking request the left surface renders skeletons, while the
right column currently renders an unrelated generic placeholder. After success,
ordinary queries leave `selectedPersonId` null even though the accepted payload
is ordered. PersonInspector already contains the correct pending skeleton, but
its markup is not reusable by App. The profile SafeImage defines a stable 3:4
size, while later compatibility CSS overrides its height to `auto` and stretches
it to the adjacent text grid.

## Goals / Non-Goals

**Goals:**

- Make the desktop ranking and Inspector columns communicate the same pending
  operation with matching skeletons.
- Automatically activate exactly the first accepted result after an ordinary
  changed ranking query, using the existing latest-only detail operation.
- Keep automatic compact activation non-modal: select/load the first result but
  leave the Drawer closed until the user activates a ranking row.
- Preserve exact share workspaces and current-selection refresh behavior.
- Remove generic/blank Inspector reservation when no person exists.
- Reuse one pending detail skeleton and make portrait geometry image-derived.
- Keep ranking controls visually aligned and pagination bounded when the ranking
  surface occupies the narrow left side of the desktop Inspector workspace.
- Use one plain centered hierarchy for the first-query and complete-zero ranking
  states, with no card chrome, duplicate action, zero summary, or zero pagination.
- Mirror the ready ranking topology during primary pending with direct
  `NSkeleton` leaves and the existing companion detail skeleton.

**Non-Goals:**

- No ranking/person-detail API, ordering, state owner, request layer, query,
  control semantics, metrics, content, image-proxy, co-star, theme, dependency,
  non-ranking empty-state, or deployment change.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Local specified/implemented/focused-verified only |
| Owner | Frontend ranking and person Inspector |
| Writable paths | Exact proposal paths, DESIGN/sidecar, and two root specs only at later sync/archive |
| Read-only protected inputs | PRODUCT, QueryWorkspace/Header/selector, query coordinator/model/store/contracts, Backend/updater/Archive, co-star, original worktree, external state |
| Deletion complement | Remove only generic desktop detail placeholder; preserve all real states/data/controls/drawers/tests |
| Mutable refs | Current local worktree only |
| Consumes | Accepted ranking item order, existing detail resource/operation, lazy loader, compact drawer, SafeImage geometry |
| Produces | Companion detail skeleton, first-result activation, single-column no-person state, shared plain ranking empty state, ready-shaped ranking pending, reusable detail skeleton, fixed portrait, bounded ranking controls/pagination |
| Dependencies | Completed main-first App topology and accepted ranking/person-inspector capabilities; no new package |
| Deliverables | Source/CSS/tests/OpenSpec plus focused build/layout/browser evidence |
| Acceptance | Correct pending skeleton/topology, first ID request, share exception, plain first/zero empty states, empty/error column collapse, compact auto-close/manual-open Drawer, 3:4 geometry, equal-height controls, bounded pagination, no stale/double request or drift |
| Non-goals | Wire/backend/query/ranking control semantics/person evidence/theme/dependency changes |
| Operations deferred | Full accumulated gate, sync/archive, commit/push/PR/release/deploy/host mutation |
| Stop/rollback conditions | Wrong ID, double/stale request, share/drawer regression, missing status, distorted image, overflow, or failed focused checks |

Dependency direction remains `accepted rankings -> App selection -> existing
person-detail coordinator -> PersonInspector`. Skeleton presentation and first-
row activation do not write back into query or server ordering.

## Decisions

### 1. Extract the existing detail skeleton instead of creating a second one

`PersonDetailSkeleton.vue` owns the current profile, metrics, and section
skeleton markup plus its scoped styles. PersonInspector uses it for a pending
detail request; App uses the same component as the desktop companion while the
primary ranking request is pending. The skeleton root carries `aria-busy`, a
polite “正在加载人物详情” status, and decorative children remain hidden.

Alternative: put a generic card or reuse DeferredSurfaceState. Rejected because
the user explicitly requested detail-shaped loading and the existing inspector
already defines the correct information silhouette.

### 2. Activate first result only after ordinary accepted primary queries

The coordinator callback runs after the ranking payload and new query revision
commit and after stale child state is cleared. For a changed ordinary ranking
query, App reads `rankings.payload.items[0].person.id`, assigns the existing
selection owner, loads the lazy surface, keeps any compact drawer closed, and
calls the existing person-detail executor once. Manual row activation continues
to open the compact drawer.

For an unchanged refresh, the current selected detail still reruns; only a
missing selection falls back to the new first item. Ranking view operations do
not auto-jump because they are not primary query commits. Zero results leave the
selection null and use a one-column ranking workspace.

### 3. Preserve explicit share workspaces

`replayShare` sets a narrow flag around the primary replay. The success callback
does not auto-select while this flag is active. A share with detail continues to
request and select its encoded person/view; a share without detail stays
unselected. The flag is restored in `finally`, including failure/cancellation.

Alternative: always select the first result. Rejected because omission of the
optional share detail is accepted workspace state and existing replay tests
require exact restoration.

### 4. Never render the generic desktop detail placeholder

While ranking is pending, desktop renders `PersonDetailSkeleton`. When a person
is selected, the existing lazy PersonDetailSurface/deferred fallback renders.
When ready/error has no selectable person, App adds a single-column modifier and
renders no right child. Compact retains its single-column ranking and opens the
existing drawer only after manual row activation.

### 5. Let SafeImage dimensions own portrait height

The profile portrait consumes the existing SafeImage 3:4 box and uses
`align-self: start` instead of stretching. Desktop and wider compact drawers
stay 160×213; narrow ≤520px variants use 96×128. Every compact drawer removes
corner rounding so the media edge is flush. The pending skeleton uses the same
160×213 profile track. Right-side
identity/summary can wrap or clamp independently without resizing the portrait.
Work-card participation-role values use the existing primary fact weight; only
the value is emphasized, while its label remains secondary.

### 6. Keep Naive UI controls and repair their ranking-pane composition

The existing Naive `NInput`, `NSelect`, `NButton`, and `NPagination` remain the
interaction owners. The late `person-detail.css` ranking-workspace layer only
normalizes composition inside the narrower ranking pane: search, sort, and
direction share a 44px minimum row; direction reserves 80px so “升序/降序” and
its icon remain intact. At a ranking-pane container width of 340px or less,
search spans the first row while sort and direction occupy the second.

Pagination uses a two-column first row for summary and page navigation. Its
page-size/jump instance explicitly spans a second full row, sizes to content,
aligns to the end, and may wrap within the pane. Page navigation keeps a
content-driven width with a 100% maximum instead of inheriting the base
`width: 100%`. No horizontal scrolling, custom pagination primitive, hidden
label, or semantic pagination change is introduced.

### 7. Restore Inspector hierarchy and stable compact interactions

The fixed 3:4 portrait remains the profile height authority, but it shares one
grid row with a `person-profile__copy` wrapper whose identity and biography rows
use natural height and `align-content: start`. At <=480px the wrapper becomes
`display: contents` so the established full-width biography row remains. Metric
evidence keeps the existing accessible button/Naive Popover contract while
replacing the raw text/pseudo-circle glyph with the shared `AppIcon`
information-circle resource at 16px inside the existing 24px visible box and
44px effective target.

Rating bar height variables move from the decorative fill to the stable track
that owns both fill and count. The count therefore resolves to `bar height + 4px`
above the fill. The manual Naive Tooltip remains anchored to the count, but its
teleported content is pointer-transparent so appearing over the chart cannot
steal hover from the bar and repeatedly toggle itself.

The compact Drawer title uses DESIGN's 24px Panel step while section headings
remain 20px. On open, the dialog container receives initial programmatic focus;
Tab/Shift+Tab then enter the existing focus loop, so pointer-style entry does not
paint a persistent close-button ring while keyboard focus remains visible. The
scroll lock moves from `body` to the actual `documentElement` scroll owner. This
avoids turning body into a new overflow container, preserves the sticky Header
at viewport top, and lets the existing Drawer layer continue to start at the
Header's first-row bottom without exposing Query Editor content.

### 8. Share one plain ranking empty-state hierarchy

The initial ranking state retains its centered 360px layout but drops
`surface-panel` and the duplicate “设置查询条件” action because Query Editor is
already open and owns query input. A ready payload whose complete
`summary.personCount` is zero bypasses the normal ranking pane entirely and
renders the same icon/title hierarchy, so no `0` summary, toolbar, table, or
pagination is shown. Search-empty pages with a non-zero complete summary remain
in the normal pane so the search control is still available.

### 9. Keep Skeleton visuals in Naive UI and layout in wrappers

Primary pending reuses the ready controls/list/pagination region names and row
tracks. Every visible placeholder leaf is direct `NSkeleton`; the already-owned
person-detail ranking CSS supplies only dimensions and grid placement. The
existing right-side PersonDetailSkeleton stays unchanged, and no new Skeleton
wrapper, gradient, keyframe, request, or data owner is introduced.

## Risks / Trade-offs

- **Callback starts duplicate detail work** -> centralize first activation and
  branch ordinary/share/unchanged contexts before one execute call; assert count.
- **Stale first result wins** -> read only the already accepted coordinator
  payload inside its successful callback; existing sequence protection remains.
- **Compact background selection is mistaken for an open detail** -> keep the
  selected row and coordinated detail request, but set Drawer visibility only
  from explicit row activation or an exact detail share.
- **Lazy module is not ready during primary pending** -> App skeleton is a small
  synchronous component and does not wait for the person-detail chunk.
- **Empty/error result leaves half-width ranking** -> explicit single-column
  class whenever primary is not pending and selection remains null.
- **Zero results leave meaningless controls or pagination** -> gate the plain
  empty branch on complete `summary.personCount === 0`; preserve the normal pane
  for search-empty pages whose complete summary is non-zero.
- **Pending layout becomes a second Skeleton system** -> require direct
  `NSkeleton` leaves and assert personal/global tracks plus absence of pending
  controls in focused tests.
- **Fixed portrait clips long biography** -> only the image box is fixed; text
  retains existing wrap/clamp/expand behavior and does not stretch the image.
- **Toolbar label is squeezed by the desktop two-column workspace** -> reserve
  the direction label width and switch only the toolbar's own narrow container
  to a two-row arrangement.
- **Pagination tools land in the summary column or overflow** -> assign both
  page and tool grid tracks explicitly, cap them to the pane, and allow the
  tool instance to wrap without changing its controls.
- **Tooltip content steals chart hover** -> keep the tooltip presentational and
  pointer-transparent; retain bar and keyboard focus as the only state owners.
- **Changing scroll lock shifts the background** -> preserve/restore the exact
  documentElement inline overflow value and assert scroll position plus sticky
  Header/Drawer geometry before and after close.
- **Removing the initial close focus hides keyboard location** -> focus the
  labelled dialog container first and keep the existing focus-visible rule when
  the user tabs to close/help/chart controls.

## Migration Plan

Strict-validate planning, extract the skeleton, update App selection/state
rendering and profile CSS, then normalize the ranking control/pagination grid
and Inspector profile/icon/chart/Drawer interactions. Run focused ranking/person-
detail tests, build, layout detector, and live pending/success/compact/geometry/
hover/focus checks, including compact automatic-close and manual-open behavior.
Full gate and OpenSpec lifecycle remain in the accumulated batch. Rollback
restores only the declared App/person-detail/shared-icon/test paths;
selector/query/Backend work remains.

## Open Questions

None.
