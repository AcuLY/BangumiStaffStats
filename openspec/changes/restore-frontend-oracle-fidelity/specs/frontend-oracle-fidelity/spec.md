## ADDED Requirements

### Requirement: Existing formal surfaces SHALL match the approved oracle

The formal SPA SHALL reproduce the outward appearance and interaction of the
approved oracle commit for the header, query editor, ranking results, and
person inspector at every supported breakpoint and in Light and Dark themes.

#### Scenario: Architectural rewrite is visually compatible

- **WHEN** a user operates an existing migrated surface
- **THEN** its visible hierarchy, geometry, typography, colors, controls,
  responsive transitions, copy, focus behavior, and interactions SHALL match
  the oracle
- **AND** internal feature boundaries MAY differ without visible redesign

#### Scenario: Production additions coexist with compatibility

- **WHEN** production data, dynamic catalogs, sharing, collection refresh, or
  real resource states add behavior absent from the prototype
- **THEN** only that explicitly approved addition MAY differ
- **AND** surrounding oracle behavior and presentation SHALL remain unchanged

#### Scenario: Accessibility does not enlarge oracle-visible controls

- **WHEN** an oracle control is visibly smaller than the required hit target
- **THEN** the visible control SHALL retain oracle geometry
- **AND** an invisible hit area SHALL provide the required target size without
  overlap or changed layout

### Requirement: Responsive overlays SHALL preserve oracle behavior

Mobile inspectors and Drawers SHALL match the oracle's mask, translucency,
panel geometry, scroll ownership, focus return, Escape close, and background
interaction behavior.

#### Scenario: Mobile Drawer is open

- **WHEN** a user opens the person inspector below the desktop breakpoint
- **THEN** the Drawer SHALL match the oracle presentation
- **AND** background content SHALL be inert
- **AND** closing by the supported action SHALL restore focus correctly

#### Scenario: Person-detail code preloads without a selection
- **WHEN** ranking data is present and the deferred person-detail module is
  loading or has failed but no person is selected
- **THEN** no person-detail loading/error panel SHALL be visible
- **AND** the ranking surface SHALL retain its oracle-compatible hierarchy
- **AND** selecting a person SHALL then expose only the local real detail state

### Requirement: Fidelity SHALL be regression-tested

Compatibility SHALL be verified against the fixed oracle rather than reviewer
preference.

#### Scenario: Fidelity repair is accepted

- **WHEN** the repair candidate is ready
- **THEN** focused and full frontend gates SHALL pass
- **AND** Light/Dark browser checks at 360, 390, 779, 780, 1024, and 1440px
  SHALL cover interaction, focus, overflow, console, and failed resources
- **AND** any remaining difference SHALL be mapped to an explicit approved
  product requirement
