## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | Investigated: complete. Specified/main-agent reviewed: complete. Implemented, verified, committed, pushed, released, and deployed: no. |
| Owner | One Frontend implementation owner runs and repairs the matrix; a separate finish reviewer is read-only; the main agent accepts. |
| Writable paths | Proven corrective hunks under `frontend/src/**`, corresponding `frontend/tests/**`, exact allowed checker/config paths only when a failing gate requires them, and task markers; this capability does not write the sidecar before all shared gates pass. |
| Read-only protected inputs | Product/design authorities, oracle, Impeccable inputs, formal guides, contracts/backend/updater/generated DTOs, package manifests/lockfile, other OpenSpec artifacts, refs/remotes, external repositories, and operations state. |
| Deletion complement | Delete only new tests from this change; restore existing files by owned hunk; never clean broadly. |
| Mutable refs | None during apply; remote refs are protected. |
| Consumes | Archived frontend verticals, accepted interface behavior, oracle, `PRODUCT.md`, `DESIGN.md`, and the built production bundle. |
| Produces | Complete responsive/accessibility evidence and the smallest regression-tested repairs required for WCAG 2.2 AA and oracle compatibility. |
| Dependencies | Direct change IDs are `implement-frontend-query-shell`, `implement-frontend-ranking-results`, `implement-frontend-person-inspector`, `implement-frontend-co-star-vertical`, and `restore-frontend-oracle-fidelity`; all five point into this capability and must be verified, committed, and archived before apply. |
| Deliverables | Forty base mode/theme/viewport combinations, named state and input-method checks, accessibility checks, focused regressions, and zero-P0/P1 finish review. |
| Acceptance | Every scenario below passes against production preview with no page overflow, console/resource failure, or unapproved visible delta. |
| Non-goals | Redesign, copy/product/API/statistics changes, dependency additions, private DOM coupling, backend/contract/updater work, or unrelated cleanup. |
| Operations deferred | Hosting, production config, release, deploy, cutover, secrets, timers, monitoring deployment, host mutation, and live state. |
| Stop/rollback conditions | Stop on unmet archive/ownership gates, authority conflict, a required visible/unapproved delta, undeclared path/dependency/behavior, or non-reproducible finding. Revert only owned hunks/new tests. |

## ADDED Requirements

### Requirement: Complete production browser matrix

The production preview SHALL pass ranking and co-star modes in Light and Dark
themes at 360, 390, 768, 779, 780, 781, 917, 1024, 1185, and 1440 CSS pixels.
The matrix SHALL also cover applicable loading, error, empty, retry, search,
sort, pagination, share, query-editor, person-Drawer, candidate-Drawer, and
SafeImage states using deterministic production-shaped data.

#### Scenario: Base matrix is executed

- **WHEN** the final production candidate is evaluated
- **THEN** all forty mode/theme/viewport combinations are recorded and pass the oracle plus accepted-delta comparison

#### Scenario: Stateful workflow is exercised

- **WHEN** each named transient, error, empty, navigation, and overlay state is invoked at its applicable responsive topology
- **THEN** its copy, continuity, focus, geometry, and recovery behavior satisfy `PRODUCT.md`, `DESIGN.md`, and the oracle baseline

### Requirement: Keyboard and overlay behavior is complete

Every interactive control SHALL be operable by keyboard with a visible focus
indicator. Query panels, Drawers, dialogs, menus, and tooltips SHALL follow
the focus, inertness, dismissal, and focus-return behavior defined by
`DESIGN.md`.

#### Scenario: Drawer lifecycle is keyboard-operated

- **WHEN** a keyboard user opens and closes a person or candidate Drawer by its controls or Escape
- **THEN** focus enters the intended control, remains in the active modal surface, hidden content is inert and absent from Tab order, and focus returns to the logical opener

#### Scenario: Tooltip is used without a pointer

- **WHEN** a tooltip trigger receives focus or keyboard activation
- **THEN** the same content available on hover is readable, viewport-safe, and dismissible by Escape or blur without trapping focus

#### Scenario: Hidden panel is traversed

- **WHEN** a query or overlay panel is hidden
- **THEN** it has synchronized hidden, inert, and accessibility state and none of its descendants receives keyboard focus

### Requirement: Responsive layout preserves meaning and targets

At every required viewport and at 200% zoom, the frontend SHALL preserve
meaning through structural reflow rather than tiny text or missing critical
data. It SHALL have no page-level horizontal overflow, a single intended
scroll owner per region, and at least 44 by 44 CSS-pixel effective pointer
targets where `DESIGN.md` requires them.

#### Scenario: Compact breakpoint boundary is crossed

- **WHEN** the viewport moves from 779 to 780 to 781 CSS pixels
- **THEN** the documented compact/standard topology changes without clipped content, duplicate controls, focus loss, or an unapproved visual state

#### Scenario: Dense surface is zoomed

- **WHEN** ranking or co-star content is viewed at 200% zoom
- **THEN** critical content and controls remain readable and operable with intended local scrolling and no document-width overflow

#### Scenario: Oracle control is visually smaller than its target

- **WHEN** a preserved visible control needs a larger effective hit area
- **THEN** invisible geometry may reach the required target size without changing its visible oracle geometry or overlapping another target

### Requirement: Accessible semantics and state are redundant

The frontend SHALL provide valid landmarks, headings, labels, names, roles,
relationships, status announcements, and unique IDs. Selection, loading,
error, disabled, chart-series, and preference states SHALL remain
understandable without color alone.

#### Scenario: Dynamic resource changes

- **WHEN** a request enters loading, succeeds, fails, retries, or is superseded
- **THEN** assistive technology receives the appropriate non-duplicated status while stale content and current controls follow the approved continuity contract

#### Scenario: Non-color presentation is inspected

- **WHEN** color is unavailable or forced-colors mode is active
- **THEN** labels, text, shapes, position, values, or system-color affordances still communicate every actionable and data state

#### Scenario: Document semantics are audited

- **WHEN** either route and its overlays are inspected
- **THEN** there are no duplicate IDs, unnamed controls, broken label relationships, invalid heading structure, or incorrect current/selected/expanded/modal state

### Requirement: Contrast and motion respect user settings

Text, controls, focus indicators, charts, and semantic states SHALL satisfy
the WCAG 2.2 AA contrast rules adopted by `DESIGN.md`. Reduced-motion mode
SHALL remove nonessential transition and animation without hiding state
changes or delaying interaction.

#### Scenario: Themes and forced colors are checked

- **WHEN** Light, Dark, and forced-colors presentations are evaluated
- **THEN** text, controls, focus, selected state, and data encodings remain perceivable and operable without relying on a theme-specific accidental contrast

#### Scenario: Reduced motion is enabled

- **WHEN** the operating preference requests reduced motion
- **THEN** nonessential animation is suppressed and every query, sort, panel, Drawer, tooltip, and loading transition remains immediate, understandable, and usable

### Requirement: Browser failures block acceptance

The candidate SHALL have no uncaught console error, failed required resource,
direct `api.bgm.tv` request, broken asset, or unexplained layout shift during
the matrix. Each confirmed accessibility or fidelity repair SHALL have
focused regression coverage and SHALL survive the full frontend check.

#### Scenario: Runtime failure is observed

- **WHEN** a required resource fails, an uncaught error appears, a direct upstream request is emitted, or layout becomes unstable
- **THEN** acceptance stops until the cause is repaired, regressed, and the affected plus full matrix passes

#### Scenario: Independent review completes

- **WHEN** a read-only Impeccable reviewer examines the exact final production candidate, oracle, delta list, and evidence
- **THEN** zero P0/P1 findings are required before main-agent acceptance
