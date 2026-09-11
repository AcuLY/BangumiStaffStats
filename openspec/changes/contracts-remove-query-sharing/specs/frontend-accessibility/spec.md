## MODIFIED Requirements

### Requirement: Complete production browser matrix

The production preview SHALL pass ranking and co-star modes in Light and Dark
themes at 360, 390, 768, 779, 780, 781, 917, 1024, 1185, and 1440 CSS pixels.
The matrix SHALL also cover applicable loading, error, empty, retry, search,
sort, pagination, legacy navigation, query-editor, person-Drawer, candidate-Drawer, and
SafeImage states using deterministic production-shaped data.

#### Scenario: Base matrix is executed

- **WHEN** the final production candidate is evaluated
- **THEN** all forty mode/theme/viewport combinations are recorded and pass the oracle plus accepted-delta comparison

#### Scenario: Stateful workflow is exercised

- **WHEN** each named transient, error, empty, navigation, and overlay state is invoked at its applicable responsive topology
- **THEN** its copy, continuity, focus, geometry, and recovery behavior satisfy `PRODUCT.md`, `DESIGN.md`, and the oracle baseline
