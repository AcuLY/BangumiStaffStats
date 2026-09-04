## Capability Boundary

- **Status:** local intentional control-density correction.
- **Owner:** Frontend person Inspector, primary agent.
- **Writable paths:** PersonItemBrowser toolbar size bindings,
  SortDirectionButton optional public size prop, exact person work-toolbar CSS,
  focused person/ranking tests, PRODUCT/DESIGN/sidecar, this change, root spec later.
- **Read-only protected inputs:** person-detail data/view semantics, Naive UI
  private DOM/variables, other toolbar defaults, Backend/contracts/external state.
- **Deletion complement:** preserve every work/character control, label, request,
  focus behavior, and result.
- **Mutable refs:** current local worktree only.
- **Consumes:** Naive UI public `size` props and existing shared direction Button.
- **Produces:** one viewport-responsive work-toolbar size shared with ranking.
- **Dependencies:** existing PersonItemBrowser and semantic spacing; no package.
- **Deliverables:** component/CSS/test/browser/build evidence.
- **Acceptance:** Input, Select, and direction Button all resolve to medium on
  desktop and small below 780px in the Inspector, with 44px effective targets
  and without clipping or overflow.
- **Non-goals:** work-browser semantics, density tabs, other control groups,
  private component-library overrides, dependency changes.
- **Operations deferred:** full gate, lifecycle, Git integration, deployment.
- **Stop/rollback conditions:** control mismatch, lost label/focus, overflow, or
  unrelated toolbar drift.

## ADDED Requirements

### Requirement: Inspector work browser SHALL preserve operation and responsive state

The Person Inspector work/character browser SHALL keep the existing search,
sort, order, section, density, pagination, pending, error, and result behavior.
Its Naive UI Input, Select, and direction Button SHALL share the ranking
toolbar's viewport-derived size: public `medium` at desktop widths and `small`
below 780px. The shared direction Button MAY accept an explicit size while
preserving its existing viewport-derived default for every caller that does not
provide one. CSS SHALL NOT reach into Naive UI private DOM or variables to
synthesize a different visible height. Each control SHALL retain at least a
44px effective hit region. The shared direction Button
SHALL use a straight-stem direction arrow and the same input control background
as an adjacent Naive Select in Light and Dark.

#### Scenario: Inspector work tools render

- **WHEN** the work or character browser toolbar is visible in the Inspector
- **THEN** search, sort, and order SHALL share Naive UI medium visible geometry
  on desktop and small visible geometry below 780px, with readable labels and
  aligned edges
- **AND** their existing 44px effective target, keyboard focus, request behavior,
  and responsive reflow SHALL remain intact

#### Scenario: Another shared direction control renders

- **WHEN** ranking or candidate toolbars use SortDirectionButton without an
  explicit size
- **THEN** their existing responsive size behavior SHALL remain unchanged
