## Why

The formal frontend has production data wiring, but several existing query,
ranking, and person-detail surfaces no longer match the approved prototype.
The rewrite is architectural, not a redesign: outward appearance and
interaction must remain identical to oracle
`644b7748674e553f863d0ffd61d029f86fdc0717` except for explicitly approved
product additions.

## What Changes

- Restore oracle-exact header, query editor, ranking, person inspector, and
  responsive Drawer appearance and interaction.
- Preserve production API wiring, dynamic catalogs, real resource states,
  sharing, collection refresh, and other explicit `PRODUCT.md`/`DESIGN.md`
  additions.
- Add focused regression evidence and browser comparison coverage so later
  refactors cannot silently redesign existing surfaces.

## Capability

### New Capability

- `frontend-oracle-fidelity`: exact outward compatibility for all existing
  prototype surfaces already migrated into the formal SPA.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Investigated/specified/main-agent reviewed: complete; implemented/verified/committed: no. |
| Owner | One frontend implementation agent after the active co-star Group 1 handoff; main agent owns spec edits and acceptance. |
| Writable paths | Existing header/query/ranking/person-detail components and feature CSS, `frontend/src/app/AppProviders.vue`, an optional app-owned public Naive theme-override module, `frontend/src/shared/styles/base.css`, narrowly required shared presentational components, corresponding tests, and this change's task markers. |
| Protected paths | `frontend/src/features/co-star/**`, candidate/partners/co-star APIs and adapters, query coordinator/share semantics, backend/contracts/updater, generated DTOs, dependencies/lockfiles, external repositories, refs/remotes, and operations state. |
| Oracle | Commit `644b7748674e553f863d0ffd61d029f86fdc0717`, under `frontend/src/workbench/**`. |
| Higher-authority exceptions | Explicit `PRODUCT.md`, `DESIGN.md`, accepted OpenSpec, and production-state additions override the oracle only for the named capability; they do not authorize unrelated visual or interaction changes. |
| Acceptance | Targeted/full frontend gates plus Light/Dark browser comparison at 360, 390, 779, 780, 1024, and 1440px, including keyboard, focus return, Escape, inert/mask behavior, overflow, console, and failed-resource checks. |
| Non-goals | New design direction, backend/API/statistics/state changes, co-star implementation, dependency upgrades, prototype deletion, or operations work. |
