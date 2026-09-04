## Capability Boundary

- **Status:** user-authorized local layout delta.
- **Owner:** Frontend query shell.
- **Writable paths:** DESIGN/sidecar/Header/QueryWorkspace topology and
  QueryEditor wheel binding only; base CSS topology/corner/scrollbar rules except
  transferred query transition/workspace-attention/footer rules; narrow App
  compact-entry placement hunk; CoStarWorkspace external-owner prop; co-star
  entry CSS except transferred rail/toolbar/row/focus/reveal rules; focused
  topology/scrollbar tests excluding polish/hardening cases; change/root spec later.
- **Read-only protected inputs:** QueryEditor form/state/business/results, candidate selection/picker behavior, unrelated active changes/external state; completed App ranking/person-detail outputs and ranking integration tests remain frozen.
- **Deletion complement:** preserve all controls/state/results/tests; remove only old Header/overlay/context placement.
- **Mutable refs:** current worktree only.
- **Consumes:** shared QueryWorkspace and main content.
- **Produces:** in-flow collapsible query panel and content-owned compact co-star summary.
- **Dependencies:** accepted query shell and semantic tokens.
- **Deliverables:** focused structural/rendered evidence.
- **Acceptance:** main-first placement, no Header query/context row/teleport/fixed overlay, compact co-star summary before analysis, preserved disclosure/selection/focus/responsive behavior.
- **Non-goals:** form/query/result/Header-bar/dependency changes.
- **Operations deferred:** full gate/lifecycle/integration batch.
- **Stop/rollback conditions:** state/focus/overflow/accessibility/visual/test failure.

## MODIFIED Requirements

### Requirement: Query Workspace SHALL preserve the approved outward behavior

The production components SHALL preserve the final oracle/DESIGN query fields,
summary, controls, state, and visual language while intentionally changing the
workspace placement. With no Applied Query the editor SHALL start expanded.
Success SHALL collapse to the applied summary; validation failure, request
failure, and cancellation SHALL keep it expanded with Draft.

At every supported viewport the collapsible Query Workspace SHALL be the first
content surface inside `<main>`, above feedback and the persistent ranking/
co-star mode panels. It SHALL NOT be a Header child/slot, fixed overlay,
teleported body child, drawer, or independently scrolling top-level region.
Collapsed summary and expanded editor SHALL form one unified content surface;
expansion SHALL participate in document flow and push results downward.
The summary's bottom corners SHALL transition for the same directional duration
as the editor enter/leave transition, so intermediate frames SHALL NOT show a
fully rounded summary attached to a still-visible panel or square corners after
the panel has finished.
The document SHALL remain the sole vertical scroll owner; the editor SHALL NOT
cancel or contain wheel events that would otherwise scroll the page.
The desktop document SHALL keep its real right shell scrollbar with automatic
gutter behavior and SHALL NOT reserve a mirrored left scrollbar gutter. Header
chrome SHALL span the usable viewport; the existing content-line inset remains
intentional and symmetric within that usable width.
Controls SHALL meet DESIGN focus, keyboard, target-size, contrast,
status-announcement, and reduced-motion requirements.

The Header SHALL contain only brand, the two-mode control, share action, and one
theme action in DESIGN order. It SHALL NOT contain a query row, compact co-star
context, selection summary, or other task surface. Theme, brand asset,
persistence, URL, share, and query state contracts remain unchanged.

Below 780px, after a co-star query has produced its accepted candidate resource,
the existing compact person-selection summary SHALL render exactly once inside
the active co-star mode content, after Query Workspace/feedback and immediately
before the analysis layout. It SHALL continue to open the existing candidate
Drawer, reflect the one selection owner, naturally wrap names/positions, close
an expanded query before opening when allowed, and restore focus to the same
content entry. Desktop SHALL keep the existing candidate rail and SHALL NOT show
the compact entry.

#### Scenario: Desktop and mobile disclosure behavior

- **WHEN** the same editor is opened at desktop and compact viewports
- **THEN** both SHALL expand in main document flow above results, retain Draft,
  and preserve close/apply/cancel/focus behavior without overflow
- **AND** neither viewport SHALL create a fixed query overlay, Header query row,
  or wheel trap

#### Scenario: Query succeeds and collapses

- **WHEN** a valid query completes successfully
- **THEN** the main-content panel SHALL collapse to the applied summary in the
  same DOM position and the current result panel SHALL remain directly after it

#### Scenario: Compact co-star candidates are ready

- **WHEN** a co-star query succeeds below 780px with no selected person
- **THEN** Header SHALL remain one row with no compact context child
- **AND** exactly one “尚未选择人物” entry SHALL render inside co-star content
  after Query Workspace and before the analysis empty state
- **AND** activating it SHALL open the existing candidate Drawer and restore
  focus to that content entry after close

#### Scenario: Query disclosure animates in either direction

- **WHEN** the editor begins its 160ms enter or 120ms leave transition
- **THEN** the summary bottom corners SHALL interpolate over that same duration
- **AND** the final open/closed corner shape SHALL be reached with the panel's
  corresponding transition completion

#### Scenario: Theme is toggled and restored

- **WHEN** the user toggles the Header theme action and reloads
- **THEN** theme persistence/provider/document markers SHALL remain unchanged
- **AND** no query request, revision, share, route, or placement drift occurs

#### Scenario: Production artifact is inspected

- **WHEN** source, DOM, and built artifact are checked
- **THEN** there SHALL be one QueryWorkspace inside main, no Header query slot,
  no query-editor teleport/fixed overlay, and no prototype/fixture/statistics code

#### Scenario: Desktop browser uses classic scrollbars

- **WHEN** the viewport is at least 780px and the browser renders a non-overlay
  vertical shell scrollbar
- **THEN** only the real right gutter SHALL be reserved and the Header/page
  SHALL NOT gain a mirrored blank strip on the left

`frontend-refine-ranking-detail-and-picker` supersedes only this change's
compact candidate bottom-Drawer/open-close contract with an in-flow accordion.
Content-summary ownership, query-close guard, selection, and focus safety remain.
