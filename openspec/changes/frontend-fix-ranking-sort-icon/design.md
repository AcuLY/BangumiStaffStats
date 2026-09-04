## Context

`SortDirectionButton.vue` renders label text and the shared `AppIcon` inside a public Naive UI `NButton`. The later desktop-ranking rule in `base.css` currently assigns `var(--text-tertiary)` directly to the icon and transitions only `transform`. Rendered preflight on `/ranking?user=729218` measured a Light-mode button color of `oklch(0.34 0.014 285)` versus an icon color of `oklch(0.47 0.015 285)`; the button transitions color for 300ms with `cubic-bezier(0.4, 0, 0.2, 1)`, while the icon has only the existing 160ms rotation transition.

This is a shared presentation component consumed by ranking, person detail, candidate, partner, and co-star work browsers. The correction must therefore be component-consistent without changing any consumer's data or interaction behavior. The surface is an Operate UI: motion communicates direction and theme continuity but must remain fast and respect reduced motion.

### Change boundary

| Field | Boundary |
|---|---|
| Status | Apply-ready only after strict validation and main-agent zero-P0/P1 review |
| Owner | Frontend |
| Writable paths | `openspec/changes/frontend-fix-ranking-sort-icon/**`; `frontend/src/shared/styles/base.css`; `frontend/tests/features/ranking/components.test.ts` |
| Read-only protected inputs | `PRODUCT.md`; `DESIGN.md`; `.impeccable/design.json`; `.impeccable/surfaces/route.md`; `frontend/src/features/ranking/components/SortDirectionButton.vue`; `frontend/src/shared/components/AppIcon.vue`; `frontend/src/app/theme.ts`; `frontend/src/app/themeOverrides.ts`; `openspec/specs/frontend-query-shell/spec.md`; oracle `644b7748674e553f863d0ffd61d029f86fdc0717` |
| Deletion complement | No deletion of files, selectors, tests, assets, dependencies, or capabilities |
| Mutable refs | Local `codex/fix-ranking-sort-icon` only |
| Consumes | Existing semantic foreground colors, public Naive UI button output, shared icon, reduced-motion rule |
| Produces | Corrected shared icon presentation, regression test, rendered evidence, OpenSpec artifacts |
| Dependencies | Existing frontend stack only; dependency direction remains `SortDirectionButton -> AppIcon` and `base.css -> semantic tokens` |
| Deliverables | Icon/text color equality, synchronized theme-color transition, preserved rotation and sort semantics |
| Acceptance | Strict OpenSpec validation; focused ranking Vitest; full frontend check; rendered Light/Dark and asc/desc checks; `git diff --check` |
| Non-goals | Toolbar redesign, copy/size/behavior changes, theme-owner changes, other icon changes, private Naive UI internals, broad CSS cleanup |
| Operations deferred | Push, PR, merge, release, deploy, host mutation, and production activation |
| Stop/rollback conditions | Stop on authority conflict, overlapping edits, strict/test/build failure, or need for private UI internals. Roll back only this change's CSS/test/spec additions. |

## Goals / Non-Goals

**Goals:**

- Keep the chevron's computed color identical to the adjacent button label across Light, Dark, hover, focus, and pressed states.
- Synchronize the chevron's theme color interpolation with the button's 300ms standard transition while retaining the existing 160ms directional rotation.
- Preserve reduced-motion behavior and all sort semantics.

**Non-Goals:**

- Introduce a new motion system or token, replace Naive UI, or restyle the toolbar.
- Change `AppIcon` globally or alter any query, ranking, theme-storage, API, or accessibility semantics.

## Decisions

1. **Use `color: inherit` on the button-scoped icon.** The label already receives the correct public button foreground color from Naive UI and existing semantic theme overrides. Inheritance guarantees equality for normal, hover, focus, active, disabled, Light, and Dark states without duplicating palette values. Keeping `var(--text-tertiary)` was rejected because it intentionally creates the mismatch; binding a private `--n-*` variable was rejected by DESIGN.md and would couple the app to Naive UI internals.
2. **Declare independent color and transform transitions on the icon.** Color uses `300ms cubic-bezier(0.4, 0, 0.2, 1)` to match the rendered public button transition. Transform keeps `160ms cubic-bezier(0.22, 1, 0.36, 1)` so sorting direction remains immediate. A single shared duration was rejected because it would slow the existing sort feedback or preserve the theme mismatch.
3. **Keep the existing reduced-motion selector.** Its `transition-duration: 0s` continues to cover the icon and therefore disables both properties without another media rule.
4. **Verify both source contract and rendered state.** A focused test locks the inheritance and two-property transition; Browser evidence checks computed label/icon equality, transition strings, direction rotation, theme switching, console health, and representative desktop/mobile presentation. The oracle comparison is preservation-only for structure, copy, size, and interaction; the icon color/timing correction is the documented intentional delta.

## Risks / Trade-offs

- **[Risk] A future Naive UI release changes its public button timing.** → The focused test documents the current accepted timing, and rendered QA compares the icon against the computed button transition after upgrades.
- **[Risk] Inheritance changes hover or pressed appearance.** → This is intentional: icon and label must remain one affordance, and Browser QA exercises the shared state.
- **[Risk] Source-level CSS assertions can pass without visual correctness.** → Browser computed-style and screenshot evidence are mandatory acceptance, not replaced by the test.

## Migration Plan

No data or runtime migration is needed. Apply the bounded CSS/test change, run the acceptance gates, and include it in the next normal frontend release only after ordinary integration authorization. Rollback removes the new `color` value and color transition entry together.

## Open Questions

None. Preflight measured the governing computed values, and the requested behavior is bounded.
