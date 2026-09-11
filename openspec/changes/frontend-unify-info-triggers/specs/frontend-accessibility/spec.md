## Capability Boundary

- **Status:** local user-authorized info-trigger accessibility preservation.
- **Owner:** Frontend accessibility/shared controls.
- **Writable paths:** exact shared/feature info-trigger markup/styles/tests and
  this change; root spec during later sync.
- **Read-only protected inputs:** help content/placement/state semantics,
  unrelated controls, APIs/contracts/Backend/updater/Archive/external state.
- **Deletion complement:** preserve native buttons, names, expanded state,
  keyboard/pointer events, Tooltip/Popover content, focus return, and targets.
- **Mutable refs:** current dirty worktree and task markers only.
- **Consumes:** existing native trigger semantics and Tooltip/Popover owners.
- **Produces:** consistent target/focus presentation without behavior drift.
- **Dependencies:** accepted frontend accessibility and shared visual contract.
- **Deliverables:** component/source tests plus rendered interaction evidence.
- **Acceptance:** all triggers retain name/state/focus/click/Escape/blur and 44px
  targets after presentation unification.
- **Non-goals:** tooltip content, placement, duration, feature semantics.
- **Operations deferred:** full gate, lifecycle, Git/release/deploy/host mutation.
- **Stop/rollback conditions:** inaccessible name/state, lost focus/Escape,
  target overlap, tooltip regression, or failed checks.

## ADDED Requirements

### Requirement: Unified info presentation SHALL preserve complete interaction semantics

Visual unification SHALL NOT replace or weaken the existing native button,
accessible name, `aria-expanded` state, Tooltip/Popover content, hover, focus,
click/tap, Escape, blur/click-outside, or focus-return behavior. Each trigger
SHALL keep a visible keyboard focus indicator and at least a 44×44px effective
target in compact and desktop layouts, Light and Dark themes, and forced colors.

#### Scenario: Keyboard user opens and dismisses help

- **WHEN** any unified info trigger receives focus and its help is opened
- **THEN** the same content available by pointer SHALL be exposed with the
  correct accessible name/state and visible focus
- **AND** Escape or the existing dismissal action SHALL close it without
  trapping or losing logical focus

#### Scenario: Compact adjacent controls are measured

- **WHEN** an info trigger appears beside a label, metric, or series count at a
  compact supported width
- **THEN** its effective target SHALL not overlap the adjacent interactive target
  or create document-width overflow
