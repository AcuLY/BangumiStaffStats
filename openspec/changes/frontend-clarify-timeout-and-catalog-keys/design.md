## Context

PRODUCT/DESIGN define one dynamic PositionSelector with repeated references,
category-first browsing, canonical-deduplicated search, a desktop portal, and a
compact in-editor panel. The current NSelect correction made its 249 rendered
anime references unique while preserving 165 canonical positions, but still
flattens all 15 groups and produces an empty-looking portal at 390px. The
controlling implementation guide explicitly forbids forcing repeated positions
into a TreeSelect; PositionSelector must remain the canonical owner and may use
only public component APIs for its shell and primitives.

The five API adapters also need the already-implemented factual distinction
between query timeout and collection unavailability.

## Goals / Non-Goals

**Goals:**

- Preserve all Catalog copies, canonical order, one-tag selection,
  exclusivity, search coverage, validation, retry, and wire semantics.
- Make empty-search browsing progressively disclose category then positions.
- Make non-empty search flat, canonical-deduplicated, and contextual.
- Give desktop and compact widths context-appropriate shells over the same
  state, with keyboard/touch/focus behavior and bounded scrolling.
- Preserve accurate operation-specific timeout copy.

**Non-Goals:**

- No Catalog/API/generated DTO/Backend/request-timeout/dependency change.
- No group selection, cascade semantics, static enum, new query owner, form or
  result redesign, theme change, or production deployment.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Local specified/implemented/focused-verified only |
| Owner | Frontend query shell; primary agent reviews and accepts |
| Writable paths | Exact proposal paths and affected root specs at later sync/archive |
| Read-only protected inputs | PRODUCT/DESIGN/sidecar, QueryEditor/query state, Catalog/generated contracts, Backend/updater/Archive, original worktree, external state |
| Deletion complement | Preserve every group/position/shortcut/value/tag/API/test; replace only flat Select and inaccurate copy branches |
| Mutable refs | Current local topic worktree only |
| Consumes | Dynamic Catalog, canonical PositionKey, compact media contract, public Naive UI Popover/Input/Tag APIs, stable error codes |
| Produces | Custom hierarchical browser, canonical flat search, shared responsive state, factual timeout copy |
| Dependencies | Existing Vue/Naive UI 2.44.1 and accepted frontend capabilities; no new package |
| Deliverables | Source/tests/OpenSpec plus focused build/layout/browser evidence |
| Acceptance | Independent disclosures, nonselectable groups, canonical sync/search, desktop portal, compact inline panel, keyboard/touch/overflow/log checks |
| Non-goals | Contract/data/backend/query/result/theme/dependency changes |
| Operations deferred | Full accumulated gate, sync/archive, commit/push/PR/release/deploy/host mutation |
| Stop/rollback conditions | Stop on overlap, selectable groups, state/tag/key drift, inaccessible interaction, overflow/clipping, hover-only behavior, or failed checks; restore exact Frontend files only |

Dependency direction remains `Backend Catalog/error codes -> strict adapters ->
query state -> PositionSelector -> PositionCatalogBrowser`. Occurrence identity
and panel state never flow backward into Query Draft or requests.

The separate `frontend-move-query-panel-into-content` implementation remains
frozen. This change detects the accepted `<780px` media contract inside
PositionSelector and does not edit QueryEditor, shared `base.css`, or any
query-panel-owned source; new selector/browser styling is component-scoped.

## Decisions

### 1. Keep occurrence identity separate from canonical selection

PositionSelector builds group occurrences with collision-free JSON tuple keys
`[groupKey, positionKey]`. The browser receives every occurrence, but checked/
selected presentation derives directly from `modelValue: PositionKey[]`.
Activating any occurrence toggles its canonical PositionKey, applies existing
exclusive-group replacement, preserves first-selection order, and renders tags
directly from canonical values. Search uses a separate `search` key namespace.

This replaces the former NSelect expanded-value adapter. TreeSelect/Cascader
are rejected because repeated references, canonical tags, no-cascade groups,
and flat search do not fit their value models; the implementation guide also
forbids this shortcut.

### 2. Use one custom browser with two responsive shells

`PositionCatalogBrowser.vue` owns category disclosures, search results, bounded
list, and occurrence buttons. `PositionSelector` owns trigger search/open/focus/
model state. At every width one `NPopover` anchors the browser to the trigger
and portals to body using only public placement, flip, width, and clickoutside
APIs; below 780px the content uses compact targets and bounded height without
participating in Query Editor layout.

The browser list uses the 6px component scrollbar and
`clamp(12rem, calc(100dvh - 11rem), 30rem)` maximum block size so a 41-leaf
group remains usable without turning the whole form into an unbounded list.
The compact trigger, search, category rows, and leaf rows have 44px targets.

Alternatives rejected: disabling flip can place the whole menu outside the
viewport; an unbounded inline list can add several screens for one group; a
Drawer creates a second interaction owner.

### 3. Separate browse and search information architecture

Empty search shows root category rows. Only the curated `shortcut:*:featured`
group starts expanded; any number of other groups can be toggled by click,
Enter/Space, or ArrowRight/ArrowLeft. Hover only paints feedback.

Non-empty search replaces the hierarchy with a first-occurrence ordered flat
list deduplicated by PositionKey. Matching covers label, Chinese/English/
Japanese names, PositionKey/ID, category names, and group labels. Each result
shows all parent categories. Clearing restores the previously expanded browse
state.

### 4. Use one button/dialog accessibility model

Selected NTags and the catalog toggle are sibling controls inside one visual
shell, never nested buttons. The toggle is a real button with
`aria-haspopup="dialog"`, expanded/controls/labelledby/invalid/described-by
state, and is the stable focus target for QueryEditor error recovery. The
browser is a labelled dialog/region: native category buttons own disclosure,
and native position buttons expose canonical checked state with `aria-pressed`.
Enter/Space therefore work without emulation; ArrowLeft/ArrowRight only
collapse/expand a focused category, while Tab follows ordinary DOM order.
Escape inside the browser stops propagation, closes only that browser, and
restores trigger focus instead of closing Query Editor. Compact pointer opening
does not force a mobile keyboard.

Desktop and compact outside-pointer dismissal remain delegated to NPopover's
public `clickoutside`. Close, breakpoint change, disable, and unmount clear the
single Popover/content owner. No global click manager is introduced.

### 5. Keep timeout copy factual and operation-specific

`UPSTREAM_TIMEOUT` remains “人物排行查询超时，请重试”, “候选人物查询超时，请重试”,
“人物详情查询超时，请重试”, “合作人物查询超时，请重试”, or
“共演分析查询超时，请重试”. `UPSTREAM_UNAVAILABLE` and
`UPSTREAM_PROTOCOL_ERROR` keep collection-unavailable copy.

## Risks / Trade-offs

- **Duplicate hover/checked state leaks across copies** -> VNode keys and hover
  are occurrence-scoped; selected state alone is canonical-scoped; browser-test
  a position present in three groups.
- **Occurrence UI leaks into business state** -> occurrence buttons emit only
  their `positionKey`; PositionSelector alone applies canonical toggle/order/
  exclusivity and no occurrence key is submitted.
- **Compact panel traps scrolling** -> bounded native overflow, no wheel event
  cancellation, and browser-check boundary handoff.
- **Search loses categories or ordering** -> derive context from every Catalog
  group, deduplicate in first-occurrence order, and add exact unit cases.
- **Popover clips/flips poorly** -> public viewport-aware placement, bounded
  size, and checks near the desktop right edge.
- **Escape closes Query Editor too** -> stop propagation in the browser before
  restoring the trigger; retain existing QueryEditor Escape tests.
- **Outside dismissal leaks listeners or closes on selection** -> bind only
  while the compact panel is open, test the selector root with `contains`, and
  always remove the exact capture listener.

## Migration Plan

Revise and strict-validate the cumulative change, replace the flat selector in
one component slice, run focused identity/hierarchy/timeout tests plus build,
then browser-check 1440px, 780px boundary, 390px, and 320px locally. The full
Frontend gate and OpenSpec sync/archive remain in the user's later accumulated
batch. Rollback restores only PositionSelector, PositionCatalogBrowser,
selector-prefixed CSS, and their tests; API fixes and Backend work remain
untouched.

## Open Questions

None.
