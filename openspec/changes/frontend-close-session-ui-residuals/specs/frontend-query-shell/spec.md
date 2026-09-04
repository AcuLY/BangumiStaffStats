## Capability Boundary

- **Status:** local residual correction implemented and focused-verified.
- **Owner:** Frontend query shell.
- **Writable paths:** PositionSelector, QueryEditor, App feedback projection,
  exact RankingResults/CandidatePicker/CoStarWorkspace message projection,
  focused query/App tests, design authorities, this change, root spec later.
- **Read-only protected inputs:** query state/model/coordinator semantics, API,
  catalog contents, Backend/updater/Archive, external state.
- **Deletion complement:** preserve all fields, feedback/recovery messages,
  catalog leaves/state, actions, and tests.
- **Mutable refs:** current dirty worktree only.
- **Consumes:** current primary resource error/feedback, Naive Popover placement,
  accepted all-position candidate semantics.
- **Produces:** viewport-visible menu, one visible primary feedback owner, truthful help.
- **Dependencies:** existing QueryWorkspace/PositionSelector; no package.
- **Deliverables:** source/tests/browser/build evidence.
- **Acceptance:** near-fold menu visible; no duplicate message; help matches default.
- **Non-goals:** query/API/data semantics or form redesign.
- **Operations deferred:** full gate/lifecycle/Git/deploy.
- **Stop/rollback conditions:** hidden recovery, menu clipping, state or focus drift.

## ADDED Requirements

### Requirement: Query residual presentation SHALL have one truthful visible owner

PositionSelector SHALL use viewport-aware anchored placement and SHALL keep its
trigger and menu usable when opened near any viewport edge without changing
Query Workspace height. When QueryEditor already displays the current primary
operation’s error, warning, feedback, or cancellation message, App and the
matching ranking/candidate surface SHALL NOT render that same operation/message
again. State titles and recovery actions SHALL remain available. Other operation
feedback SHALL remain visible. Co-star position help SHALL describe the mixed
all-position default and SHALL NOT claim that the first selected position is the
default browser. At the same public small/medium size, PositionSelector’s custom
trigger SHALL match adjacent Naive Select roles for entered text, placeholder,
control background, default/hover/focus boundary, and suffix icon in Light and
Dark. Its 44px suffix target SHALL remain part of one visual control rather than
rendering a separate divider or hover cell. Help/Info icons SHALL retain their
distinct help affordance instead of being recolored as placeholder decoration.
Implementation SHALL use project-owned semantic tokens and public component
behavior, not private Naive selectors or variables.

Ranking and co-star SHALL both label this stage “职位”, use “选择职位” as the
empty-row placeholder, and present PositionSelector as a variable-length list
backed by the public Naive DynamicInput API. At least one selector row SHALL
remain. Each row SHALL hold at most one position and selecting a new leaf SHALL
replace that row’s prior value and close its menu. Creating a row SHALL append
an empty selector; removing a row SHALL remove only that row and its selected
position. Empty rows SHALL stay local editing state and SHALL NOT enter
`positionKeys`. Non-empty rows SHALL project to the existing ordered unique
`positionKeys` array. A position selected by another row SHALL be disabled in
the active catalog. Only one row catalog SHALL be open at a time, and row
creation/removal SHALL preserve keyboard focus without changing query/API
semantics. Mode-specific position semantics SHALL remain available through the
title Info help and accessible name, and SHALL NOT be repeated as a visible
helper line above the selector.

The position catalog SHALL size to content rather than the active trigger,
equivalent to a Select with `consistent-menu-width=false`: up to 480px on
desktop, clamped to 12px viewport gutters, and one-column at compact widths.
The catalog list SHALL scroll vertically only and SHALL NOT expose a horizontal
scrollbar. Public NPopover flip/shift SHALL keep the menu in view. The established
catalog surface SHALL be the only background/radius/shadow owner; the raw
Popover wrapper SHALL NOT add a second square shadow/background layer.
DynamicInput create/remove actions SHALL be ordinary rectangular default Naive
Buttons, not circle/quaternary/secondary actions. The position field SHALL have
zero right padding. Visible actions SHALL be square at the public 28/34px size
with 44px click height. The row SHALL use a start-aligned flex flow in which the
selector grows into all remaining width and the action group remains fixed at
the right; it SHALL NOT use `space-between`. The selector-to-actions gap and the
gap between the two actions SHALL each resolve to the shared 8px spacing token.
Targets SHALL NOT overlap, and the last action SHALL remain flush with the
field's right edge.

#### Scenario: Near-fold catalog opens
- **WHEN** a user opens PositionSelector with insufficient space below the trigger
- **THEN** the bounded menu SHALL flip or shift into the viewport, remain
  keyboard reachable, and leave Query Workspace/document height unchanged

#### Scenario: Empty PositionSelector is compared with Naive Select
- **WHEN** the empty ranking-position trigger and an adjacent same-size Naive
  Select are rendered in Light or Dark, at rest, hover, and keyboard focus
- **THEN** text/placeholder/background/boundary/suffix roles and vertical
  typography SHALL match while the custom suffix retains a 44px effective target
- **AND** no separate suffix divider/fill or generic surface/tertiary placeholder
  treatment SHALL remain

#### Scenario: User replaces one position
- **WHEN** one selector row contains position A and the user chooses position B
  in that row
- **THEN** the row SHALL contain B, the ordered query value SHALL replace A with
  B at the same index, and the catalog SHALL close

#### Scenario: User adds and removes position rows
- **WHEN** the user creates another selector, chooses a unique position, and
  later removes either row
- **THEN** DynamicInput SHALL keep at least one row and the ordered query value
  SHALL contain exactly the non-empty remaining rows without duplicates

#### Scenario: Position catalog opens beside DynamicInput actions
- **WHEN** the catalog opens on desktop or compact view
- **THEN** it SHALL expand independently of trigger width up to its bounded
  content width, remain wholly within the viewport, and have no horizontal
  scrollbar
- **AND** neighboring create/remove actions SHALL render as rectangular default
  square Buttons with 44px click height, an 8px gap from the flexed selector,
  an 8px gap between actions, and no right inset after the final action

#### Scenario: External query state replaces positions
- **WHEN** undo, reset, share replay, or another accepted parent update replaces
  `positionKeys`
- **THEN** rows SHALL reconcile to that ordered value, or to one empty row when
  it is empty, without stale menus, duplicate ids, or extra emissions

#### Scenario: Primary query fails while editor is open
- **WHEN** QueryEditor renders the active ranking/candidate failure or cancel copy
- **THEN** the same operation/message SHALL appear exactly once in the visible
  page while the matching result state retains its recovery action

#### Scenario: Child operation fails
- **WHEN** person-detail, partners, or co-star feedback has no equivalent local
  QueryEditor owner
- **THEN** App SHALL continue rendering the global feedback

#### Scenario: Co-star help is read
- **WHEN** the query mode is co-star
- **THEN** help SHALL state that selected positions feed the mixed all-position
  candidate view and SHALL not name a first-position default
