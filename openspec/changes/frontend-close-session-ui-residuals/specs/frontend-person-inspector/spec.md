## Capability Boundary

- **Status:** local residual correction.
- **Owner:** Frontend person Inspector.
- **Writable paths:** PersonDetailSkeleton, exact skeleton/person CSS, focused
  person/App tests, design authorities, this change, root spec later.
- **Read-only protected inputs:** person payload/requests, final PersonProfile
  content/semantics, Backend/contracts/Archive/external state.
- **Deletion complement:** preserve every skeleton section and final profile element.
- **Mutable refs:** current dirty worktree only.
- **Consumes:** accepted final responsive profile geometry and skeleton primitives.
- **Produces:** layout-stable, top-aligned responsive loading profile.
- **Dependencies:** existing PersonProfile/PersonDetailSurface; no package.
- **Deliverables:** source/rendered-geometry tests/browser/build evidence.
- **Acceptance:** skeleton and final profile share portrait/copy/edge geometry.
- **Non-goals:** person data, loading duration, image transport, final-profile redesign.
- **Operations deferred:** full gate/lifecycle/Git/deploy.
- **Stop/rollback conditions:** layout shift, missing skeleton, compact clipping or drift.

## ADDED Requirements

### Requirement: Person detail loading geometry SHALL mirror the final profile

PersonDetailSkeleton SHALL preserve the final PersonProfile’s responsive intro
geometry: top-aligned identity/copy and a 160×213 flush portrait on desktop and
wider compact Drawers; at 520px and below, a 96×128 portrait with the same 16px
profile inset as the final profile. Every compact Drawer portrait SHALL be
square. Loading SHALL NOT vertically center copy, add a compact portrait radius,
or introduce an inset absent from the final profile at that width.

#### Scenario: Desktop detail is pending
- **WHEN** person detail loads in the desktop Inspector
- **THEN** skeleton portrait and copy SHALL occupy the same top-aligned intro
  tracks and dimensions as the final profile

#### Scenario: Wider compact Drawer detail is pending
- **WHEN** person detail loads in a compact Drawer wider than 520px
- **THEN** the 160×213 skeleton portrait SHALL be square and flush to the same
  edge as the final portrait, and copy SHALL keep the same top start

#### Scenario: Narrow compact Drawer detail is pending
- **WHEN** person detail loads in a compact Drawer at 520px or below
- **THEN** the 96×128 skeleton portrait SHALL be square, use the same 16px
  profile inset as the final portrait, and keep copy aligned to the top

#### Scenario: Pending detail resolves
- **WHEN** skeleton is replaced by PersonProfile
- **THEN** intro width, portrait edge, and copy start SHALL not visibly jump
