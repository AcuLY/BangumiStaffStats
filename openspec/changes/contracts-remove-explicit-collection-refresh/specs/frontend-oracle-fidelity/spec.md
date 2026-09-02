## Capability Boundary

- **Status/Owner:** Modified; Frontend owns oracle-compatible presentation.
- **Writable paths:** Accepted frontend oracle-fidelity spec and the Query Editor button removal covered by frontend-query-shell.
- **Read-only protected inputs:** Oracle commit, product/design authorities, all other formal surfaces, and archived changes.
- **Deletion complement:** Preserve every non-deleted hierarchy, control, responsive transition, focus behavior, and accessibility affordance.
- **Mutable refs:** Local topic branch only.
- **Consumes/Produces:** Consumes oracle/product/design evidence; produces compatibility requirements for frontend consumers.
- **Dependencies/Deliverables:** No new dependency; production-addition exception no longer names the deleted capability.
- **Acceptance:** Rendered Query Editor comparison in Light/Dark at desktop/mobile plus full frontend gate.
- **Non-goals/Operations deferred:** No visual redesign or deployment change.
- **Stop/rollback conditions:** Stop on unintended visual drift; roll back the isolated branch.

## MODIFIED Requirements

### Requirement: Existing formal surfaces SHALL match the approved oracle

The formal SPA SHALL reproduce the outward appearance and interaction of the
approved oracle commit for the header, query editor, ranking results, person
inspector, and site footer at every supported breakpoint and in Light and Dark
themes.

#### Scenario: Architectural rewrite is visually compatible

- **WHEN** a user operates an existing migrated surface
- **THEN** its visible hierarchy, geometry, typography, colors, controls,
  responsive transitions, copy, focus behavior, and interactions SHALL match
  the oracle
- **AND** internal feature boundaries MAY differ without visible redesign

#### Scenario: Production additions coexist with compatibility

- **WHEN** production data, dynamic catalogs, sharing, or real resource states
  add behavior absent from the prototype
- **THEN** only that explicitly approved addition MAY differ
- **AND** surrounding oracle behavior and presentation SHALL remain unchanged

#### Scenario: Accessibility does not enlarge oracle-visible controls

- **WHEN** an oracle control is visibly smaller than the required hit target
- **THEN** the visible control SHALL retain oracle geometry
- **AND** an invisible hit area SHALL provide the required target size without
  overlap or changed layout

#### Scenario: Site footer preserves the oracle contract

- **WHEN** the SPA renders any supported route
- **THEN** its site-information navigation SHALL expose “问题反馈” followed by
  the oracle separator and “粤ICP备2024321317号”
- **AND** the links SHALL use the oracle destinations and safe external-tab
  behavior
- **AND** the navigation SHALL remain centered, wrapping, keyboard-visible,
  and touch-target-safe in Light and Dark themes at desktop and mobile widths
- **AND** implementation terminology about query scope or Archive version
  SHALL NOT replace or accompany that oracle footer content
