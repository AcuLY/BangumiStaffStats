## Capability Boundary

- **Status:** local interaction hardening.
- **Owner:** Frontend query shell.
- **Writable paths:** QueryWorkspace/PositionSelector/PositionCatalogBrowser/
  QueryEditor exact focus/reveal branches, shared reveal/base styles, query tests,
  DESIGN/sidecar, this change, root spec later.
- **Read-only protected inputs:** query state/fields/catalog/API/Backend/external state.
- **Deletion complement:** preserve fields, disclosure, catalog selection and states.
- **Mutable refs:** current worktree only.
- **Consumes:** anchored query/catalog, focus token, reduced motion.
- **Produces:** retained reveal focus, viewport-aware catalog, safe breakpoint, 44px targets.
- **Dependencies:** Vue/Naive public APIs; no package.
- **Deliverables:** source/tests/browser/build evidence.
- **Acceptance:** compact/global focus retained; 390/779/780/961 no overflow/duplicate ID.
- **Non-goals:** query semantics or visual redesign.
- **Operations deferred:** full gate/lifecycle/Git/deployment.
- **Stop/rollback conditions:** focus, catalog, selection, overflow, or test regression.

## ADDED Requirements

### Requirement: Query-shell reveal actions SHALL retain focus and viewport ownership

Temporary whole-panel attention SHALL never clear or move the current focus
when its timer expires. First-query reveal SHALL focus the first editor field on
desktop fine-pointer personal scope; compact/touch/global SHALL focus the
labelled Query Workspace without forcing a text keyboard. Both SHALL retain
focus after attention ends.

Compact position catalog activation SHALL open one Naive UI anchored body-portal
dialog with ordinary selector overlay behavior and SHALL NOT change Query
Workspace or Query Editor height. Keyboard activation SHALL enter the first
available non-text catalog control; typing/pointer activation in the combobox
SHALL retain input focus, while the arrow trigger SHALL retain its own focus.
Closing or crossing the 780px boundary SHALL fully unmount dialog content and
its follower so no duplicate ID or overflow remains.

The selector trigger SHALL expose the searchable combobox input; the panel SHALL
NOT repeat a search field. Typing SHALL open/filter the catalog while retaining
input focus. The compact list SHALL use the measured Naive UI small-selector
maximum height of 212.8px, start at `bottom-start` with viewport-aware
flip/shift enabled, and clip list/scrollbar backgrounds to the panel radius.

PositionSelector SHALL NOT add a catalog attention/focus border or an
arrow-only focus outline. Its trigger SHALL retain the same single branded
focus state as neighboring Naive selectors; its menu SHALL use a neutral 6px
surface and Naive-equivalent menu shadow. Keyboard-active menu items SHALL use
the same neutral pending background instead of a focus border, except for the
system-required Highlight outline in forced-colors mode.

Catalog option rows SHALL match measured Naive selector option geometry: 28px
at compact/small, 34px at desktop/medium, 14px text on a 21px line, `0 12px`
base padding with the existing right-side mark reservation, a square outer row,
and zero inter-row gap. Search results SHALL keep category context on the same
line and truncate it rather than increasing row height.

Every catalog option SHALL render hover, keyboard-pending, and
selected-pending feedback through a state layer inset 4px from both inline
edges, with the 6px control radius and Naive's 300ms
`cubic-bezier(.4, 0, .2, 1)` background-color transition. Static selection
SHALL use the brand text/check state without a filled row. Reduced motion SHALL
disable this transition.

Interactive category disclosure rows SHALL retain the same 14px/21px type and
12px inline padding, add 4px block padding beyond the option height (36px
compact / 42px desktop), and use primary text for the category label. Category
counts and arrows SHALL remain tertiary. Their hover/focus state SHALL use the
same inset rounded fading layer as catalog options.

Compact Query Editor input/select/button controls, including PositionSelector,
SHALL retain the public Naive `small` 28px visible surface while exposing at
least 44px effective targets.

#### Scenario: Compact first-query attention ends
- **WHEN** compact/global reveal attention reaches its timeout
- **THEN** focus SHALL remain on the labelled Query Workspace and not fall to body

#### Scenario: Compact catalog opens like a selector
- **WHEN** the trigger is near the viewport bottom and opens the compact catalog
- **THEN** the fixed-height overlay SHALL flip or shift fully into the viewport,
  Query Workspace height SHALL remain unchanged, and the dialog SHALL remain
  keyboard reachable through its own scroll region

#### Scenario: User searches from the trigger
- **WHEN** the user focuses the position trigger and types a query
- **THEN** the catalog SHALL prefer bottom-start placement but flip or shift to
  remain fully inside the viewport, show canonical de-duplicated search results,
  retain combobox focus, and contain no second search input

#### Scenario: Compact panel reaches its bottom edge
- **WHEN** the fixed-height catalog scrolls to its final element
- **THEN** content, background, and scrollbar SHALL remain clipped inside the
  same rounded outer panel with no straight child corner below it

#### Scenario: Selector receives focus and opens
- **WHEN** the combobox or arrow receives focus and the menu opens
- **THEN** only the trigger SHALL show the neighboring Naive selector focus
  state; the menu and arrow SHALL add no focus border or attention halo

#### Scenario: Catalog items are compared with Naive options
- **WHEN** compact and desktop menus render category, option, selected, search,
  pending, and disabled rows
- **THEN** options SHALL equal the neighboring Naive small/medium row metrics
  and state-layer motion, category disclosures SHALL be 8px taller with primary
  labels, and no state background SHALL touch the menu's inline edge

#### Scenario: Catalog crosses the breakpoint
- **WHEN** an open/closed catalog crosses 779/780 or desktop shrinks to 390
- **THEN** at most one panel ID SHALL exist and document scrollWidth SHALL equal clientWidth

#### Scenario: Compact form targets are measured
- **WHEN** query controls render below 780px
- **THEN** PositionSelector and neighboring Naive controls SHALL be 28px high
  visibly and each effective pointer target SHALL be at least 44px
