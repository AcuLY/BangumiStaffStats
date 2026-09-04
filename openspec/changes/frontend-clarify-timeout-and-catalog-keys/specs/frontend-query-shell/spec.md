## Capability Boundary

- **Status:** user-authorized local query-shell interaction delta.
- **Owner:** Frontend query shell.
- **Writable paths:** PositionSelector and PositionCatalogBrowser including
  their component-scoped styles except the transferred positions-list inline-
  start padding rule and post-leaf close/focus slice, focused component tests
  excluding the new alignment/close cases,
  this change, and root spec only at later sync.
- **Read-only protected inputs:** PRODUCT/DESIGN/sidecar, QueryEditor/query
  state, Catalog/API/generated contracts, Backend/updater/Archive, original
  worktree, and external state.
- **Deletion complement:** no position/group/shortcut/value/tag/query field/
  capability/test or unrelated removal.
- **Mutable refs:** current local worktree only.
- **Consumes:** dynamic Catalog, canonical PositionKey, compact media contract,
  semantic tokens, and public Naive UI Popover/Input/Tag primitives.
- **Produces:** unique occurrences, canonical selection, hierarchical browse,
  flat search, and responsive desktop/compact shells.
- **Dependencies:** existing Vue/Naive UI and accepted query model; no new package.
- **Deliverables:** component/CSS/test/browser/build evidence.
- **Acceptance:** groups only disclose; leaf copies sync to one key/tag; search
  is canonical/flat/contextual; desktop portal and compact inline panel remain
  accessible, bounded, and overflow-free.
- **Non-goals:** Catalog/query/API/result/theme/dependency changes or group
  selection/cascade.
- **Operations deferred:** full gate, sync/archive, and all external integration.
- **Stop/rollback conditions:** stop on state/key/tag drift, selectable groups,
  inaccessible keyboard/focus, hover-only behavior, clipping/overflow, or
  failed checks.

## MODIFIED Requirements

### Requirement: Query input SHALL use the shared wire and dynamic catalog

The query model SHALL own defaults, summary text, normalization, dirty/no-op
comparison, and structured field errors while reusing the accepted
`SharedQueryV1` and operation view components. It SHALL model personal/global
as a closed union, construct global submissions without personal fields,
reject a global wire value that carries any personal field, and SHALL never
infer fields by parsing display messages.

The catalog store SHALL load only `GET /api/v1/catalog` through the accepted
client/strict adapter. The selector SHALL treat PositionKey as opaque, use
catalog groups, labels, order, selectability, exclusivity, and capabilities,
and preserve first-occurrence order. A canonical position SHALL remain visible
under every declared parent/shortcut group. Each browse occurrence SHALL have a
stable group-scoped identity, while Query Draft, tags, validation, share state,
and API requests SHALL contain only one canonical PositionKey. Selecting or
removing any occurrence SHALL synchronize every copy, preserve canonical
selection order/exclusivity, and render exactly one tag. Occurrence identities
and display-group keys SHALL never enter query state or wire data. The selector
SHALL not restore a static position enum or infer behavior from a key prefix or
label.

With empty search, the selector SHALL present a progressive two-level
`category -> position` browser. Category rows SHALL only expand/collapse and
SHALL NOT select a group, cascade selection, or alter query state. The curated
featured shortcut SHALL be initially expanded and other categories SHALL be
independently expandable. Hover MAY style a row but SHALL NOT trigger behavior.

With non-empty search, the selector SHALL replace category browsing with one
flat result per canonical PositionKey in first-occurrence order. Matching SHALL
cover the visible label, Chinese/English/Japanese names, PositionKey/ID,
category keys, and category labels; each result SHALL show all applicable
parent-category context. Clearing search SHALL restore the browse hierarchy and
its expanded categories.

At every width, the browser SHALL use a viewport-aware panel anchored to the
selector and portaled to body. Below 780px, it SHALL retain full trigger width,
compact targets, and bounded height without pushing following Query Editor
content. Large groups SHALL use one bounded component
scroll region without cancelling page scroll at its boundaries. Compact
trigger, search, category, and position actions SHALL expose at least 44px
targets. Selected tags and the catalog-toggle button SHALL remain sibling
controls rather than nested interactive elements. The toggle SHALL expose a
labelled dialog relationship and category/position buttons SHALL expose
disclosure/`aria-pressed` state through native buttons. Escape SHALL close only
the position browser, stop before QueryEditor, and restore trigger focus;
disclosure and leaf selection SHALL work without hover using keyboard and touch.
Pointer activation outside both the selector trigger and browser SHALL close
the browser at desktop and compact widths without changing selection or moving
focus; pointer activation inside search, disclosure, leaves, or tags SHALL NOT
prematurely dismiss it.

#### Scenario: Structured validation fails

- **WHEN** Draft violates scope, UID, status, subject-type, position,
  exclusivity, range, or capability rules
- **THEN** no operation request SHALL start, field errors SHALL target the
  corresponding controls, and Draft plus the previous Applied Query/result
  SHALL remain intact

#### Scenario: Catalog is pending or fails

- **WHEN** catalog loading is pending or returns a retryable error
- **THEN** only the position selector SHALL show its skeleton or local
  error/retry state while the rest of the editor remains usable
- **AND** failure SHALL not be represented as an empty catalog

#### Scenario: One position appears in several groups

- **WHEN** a canonical PositionKey is present in a shortcut and one or more
  Catalog groups
- **THEN** every browse occurrence SHALL remain visible with a unique identity
  and independent hover/focus state without duplicate-key warning
- **AND** selecting/removing any occurrence SHALL update one canonical model
  value, all copies' selected state, and one visible tag

#### Scenario: Categories are browsed without search

- **WHEN** the user opens the ready selector with an empty search
- **THEN** only the featured shortcut's positions SHALL begin disclosed while
  every other category remains independently collapsible
- **AND** activating a category SHALL only change disclosure, never query state

#### Scenario: Positions are searched

- **WHEN** search matches a repeated position by any accepted name, ID/key, or
  category term
- **THEN** exactly one canonical result SHALL appear with all parent context
- **AND** selecting it SHALL synchronize its browse copies and one tag

#### Scenario: Desktop and compact browsers open

- **WHEN** the same selector is opened at desktop and below 780px
- **THEN** desktop and compact SHALL use one anchored body portal with
  viewport-aware placement and no horizontal overflow
- **AND** both SHALL preserve the same canonical state, bounded list scrolling,
  keyboard/touch selection, Escape isolation, and trigger focus restoration

#### Scenario: Pointer moves to another control

- **WHEN** the position browser is open and the user activates an element
  outside PositionSelector
- **THEN** the browser SHALL close without changing canonical selection or
  focusing the trigger
- **AND** the same pointer behavior SHALL work for desktop and compact portal
  presentations without leaking a document listener
