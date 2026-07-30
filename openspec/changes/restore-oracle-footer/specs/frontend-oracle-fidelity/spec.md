## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | Modified by this change after strict validation and main-agent review. |
| Owner | Frontend |
| Writable paths | `frontend/src/app/App.vue`; footer-only declarations in `frontend/src/shared/styles/base.css`; one focused test below `frontend/tests/app/`; this change's task markers. |
| Read-only protected inputs | Oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`; product/design authorities; non-footer source/tests; manifests, generated files, and `.impeccable/design.json`. |
| Deletion complement | Only the exact unapproved footer sentence and superseded footer-only rules. |
| Mutable refs | This change's task markers; main-agent Git lifecycle only. |
| Consumes | Existing SPA shell, semantic tokens, and oracle footer evidence. |
| Produces | Oracle-compatible site footer plus regression and browser evidence. |
| Dependencies | Existing `frontend-oracle-fidelity` and `frontend-design-system` capabilities. |
| Deliverables | Source/style/test candidate and complete frontend acceptance. |
| Acceptance | Focused test; full `npm run check`; Light/Dark desktop/mobile browser QA against the built artifact; strict OpenSpec validation; `git diff --check`. |
| Non-goals | New footer copy or destinations, redesign, APIs, data semantics, dependencies, operations, or Impeccable regeneration. |
| Operations deferred | Release and production activation remain separately authorized. |
| Stop/rollback conditions | Stop on authority conflict, dirty overlap, unrelated drift, or visual/accessibility failure; restore only owned preimages. |

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

- **WHEN** production data, dynamic catalogs, sharing, collection refresh, or
  real resource states add behavior absent from the prototype
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
