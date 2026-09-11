## Capability Boundary

- **Status:** local residual correction.
- **Owner:** Frontend co-star vertical.
- **Writable paths:** App’s exact persistent external entry projection,
  CoStarWorkspace/CandidatePicker responsive-focus and nullable-position slices,
  focused co-star/App tests, design authorities, this change, root spec later.
- **Read-only protected inputs:** candidate API/order/count/selection limits,
  co-star/partners semantics, Backend/contracts/Archive/external state.
- **Deletion complement:** preserve Drawer/rail/entry, all candidates, selection,
  labels, requests, and results.
- **Mutable refs:** current dirty worktree only.
- **Consumes:** compact media state, persistent content entry, desktop search,
  nullable accepted candidate input.
- **Produces:** breakpoint-safe focus and stable all-position pending projection.
- **Dependencies:** existing CoStarWorkspace/CandidatePicker; no package.
- **Deliverables:** source/tests/browser/build evidence.
- **Acceptance:** no focus-to-body across 779/780; null remains all-position.
- **Non-goals:** candidate/query semantics, ordering/counts, Drawer redesign.
- **Operations deferred:** full gate/lifecycle/Git/deploy.
- **Stop/rollback conditions:** automatic Drawer opening, focus theft, label/count drift.

## ADDED Requirements

### Requirement: Co-star responsive ownership SHALL preserve focus and explicit all-position state

When a responsive breakpoint removes the focused candidate-picker branch,
CoStarWorkspace SHALL transfer focus to the equivalent persistent control after
the replacement mounts: compact content entry for desktop-to-compact, and
desktop candidate search for compact-to-desktop. It SHALL NOT automatically open
the compact Drawer or move unrelated external focus. CandidatePicker SHALL treat
`positionKey: null` as an explicit all-position value and SHALL prefer it over a
stale payload during accepted/pending view transitions.

#### Scenario: Desktop rail becomes compact
- **WHEN** focus is inside the desktop candidate rail and width crosses below 780px
- **THEN** focus SHALL move to the persistent compact candidate entry, Drawer
  SHALL remain closed, and focus SHALL not fall to body

#### Scenario: Compact Drawer becomes desktop
- **WHEN** focus is inside the open compact Drawer and width crosses to 780px
- **THEN** Drawer SHALL close and desktop candidate search SHALL receive focus
  after the rail mounts

#### Scenario: Breakpoint changes with external focus
- **WHEN** active focus is outside the disappearing candidate-picker branch
- **THEN** responsive replacement SHALL not steal or move that focus

#### Scenario: All-position view is requested
- **WHEN** candidate input explicitly contains `positionKey: null` while an old
  single-position payload is retained during pending
- **THEN** label, region name, and next view request SHALL remain all-position,
  and range/count SHALL show an explicit pending unknown rather than the stale
  single-position value until a newer accepted payload arrives

`frontend-refine-ranking-detail-and-picker` supersedes this change's compact
Drawer preservation and Drawer-to-desktop focus clauses with an in-flow
accordion/panel-to-desktop transfer. Nullable all-position behavior remains.
