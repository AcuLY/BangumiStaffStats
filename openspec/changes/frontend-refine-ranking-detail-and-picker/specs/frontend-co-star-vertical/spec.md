## Capability Boundary

- **Status:** local user-authorized topology delta.
- **Owner:** Frontend co-star vertical.
- **Writable paths:** App compact picker projection, MobileCandidateEntry/CoStarWorkspace/CoStarSurface/CSS, focused co-star/App tests, this change, root spec later.
- **Read-only protected inputs:** candidate/selection/request/result semantics, Backend/contracts/external state.
- **Deletion complement:** preserve CandidatePicker content/states/actions, selection order, desktop rail, analysis hierarchy, retries, focus names, and tests.
- **Mutable refs:** current dirty worktree only.
- **Consumes:** persistent content summary, compact breakpoint, CandidatePicker, native disclosure semantics.
- **Produces:** padding-free selected overview and in-flow compact picker accordion.
- **Dependencies:** existing Vue/Naive/native CSS only.
- **Deliverables:** source/tests/browser/build evidence.
- **Acceptance:** no bottom picker Drawer; accordion works by pointer/keyboard; focus/overflow/desktop rail remain correct.
- **Non-goals:** selection/data/API/desktop rail redesign.
- **Operations deferred:** full gate/lifecycle/Git/deploy.
- **Stop/rollback conditions:** selection/request drift, hidden tabbables, body focus, accordion clipping, desktop regression.

## ADDED Requirements

### Requirement: Compact candidate selection SHALL be an in-flow accordion

This requirement supersedes every earlier active-change clause requiring the
compact candidate picker to open as a bottom Drawer. At 780px and above the
existing candidate rail SHALL remain unchanged. Below 780px the persistent
selected-person summary SHALL be a disclosure button controlling one CandidatePicker
panel immediately below it in document flow. Opening SHALL push analysis content
down and SHALL NOT teleport, lock body scroll, inert/aria-hide the App, create a
modal focus trap, or automatically move focus when the summary itself is used.
The collapsed panel SHALL not remain tabbable.

#### Scenario: Summary toggles the compact picker
- **WHEN** a pointer or keyboard user activates the selected-person summary
- **THEN** `aria-expanded` SHALL toggle, the in-flow panel SHALL open/close with
  bounded disclosure motion, and focus SHALL remain on the summary

#### Scenario: Empty analysis requests selection
- **WHEN** the zero-person action opens the compact picker
- **THEN** the accordion SHALL expand and candidate search SHALL receive focus

#### Scenario: Escape closes the accordion
- **WHEN** focus is within the expanded compact picker and Escape is pressed
- **THEN** the panel SHALL collapse and focus SHALL return to the persistent summary

#### Scenario: The 779/780 boundary is crossed
- **WHEN** focused rail/panel content is replaced by the other responsive branch
- **THEN** focus SHALL transfer to the equivalent summary/desktop search,
  accordion state SHALL close, and unrelated external focus SHALL not move

### Requirement: Selected-people overview SHALL own no redundant outer padding

The co-star selected-people overview SHALL apply no outer content padding at
desktop or compact widths because its participant cards and summary grid own
their own spacing and dividers.

#### Scenario: Desktop selected overview is measured
- **WHEN** the selected-people section renders at 961px
- **THEN** its first child SHALL begin at the section content edge with zero
  computed section padding and unchanged internal card spacing
