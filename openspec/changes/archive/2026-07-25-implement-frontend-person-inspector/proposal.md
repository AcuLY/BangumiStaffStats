## Why

The production ranking list is usable but its rows do not yet open the
Archive-backed person detail that completes the ranking workspace.

## What Changes

- Add the strict person-detail API driver to the existing query coordinator.
- Connect ranking-row activation to a desktop inspector and mobile drawer.
- Render the approved person summary, metrics, evidence, charts, tags, works,
  series, and cast-only character browser from server-provided values.

## Capability

- `frontend-person-inspector`: production person-detail state and presentation.

## Scope

| Field | Value |
|---|---|
| Writable paths | `frontend/src/api/**person*`, `frontend/src/features/person-detail/**`, ranking activation wiring, `frontend/src/app/**`, shared presentation primitives/styles, matching tests/check inventories, and this change's task markers |
| Inputs | Accepted query/ranking state, generated person-detail contract, DESIGN/PRODUCT, and prototype oracle `644b7748674e553f863d0ffd61d029f86fdc0717` |
| Non-goals | Candidate tray, partners, co-star analysis, frontend statistics, fixtures, operations, or deployment |
