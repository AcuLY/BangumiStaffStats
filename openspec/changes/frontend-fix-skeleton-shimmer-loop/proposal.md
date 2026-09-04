## Why

The frontend currently mixes Naive UI `NSkeleton` with hand-built placeholder elements and a custom `ranking-shimmer` animation. The duplicate systems produce inconsistent motion and the custom loop flashes at its reset boundary, so the user has chosen Naive UI Skeleton as the single visual primitive.

## What Changes

- Replace every hand-built visual Skeleton block in ranking, candidate pagination, person detail, partner, co-star, and image-loading states with Naive UI `NSkeleton`.
- Keep the existing loading-state ownership, wrapper layout, dimensions, responsive behavior, status text, and accessibility semantics.
- Remove the custom shimmer gradients, `ranking-shimmer` keyframes, and feature animation rules.
- Give every `NSkeleton` an app-owned class so reduced-motion suppression remains centralized without selecting Naive UI internals.
- Correct the initial ranking pending wrapper so its `NSkeleton` leaves occupy the real summary, toolbar, column, row, and pagination topology instead of six generic full-width blocks.
- Add focused ownership coverage and register the new test in the frontend persistent inventory.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-accessibility`: Establish Naive UI `NSkeleton` as the only visual Skeleton primitive while preserving loading semantics and reduced-motion behavior.

## Impact

- **Status:** Revised small frontend correction; apply is blocked until the revised artifacts pass strict validation and zero-P0/P1 main-agent review.
- **Owner:** Frontend presentation; primary agent owns the complete block.
- **Behavior classification:** `INTENTIONAL_DELTA` from the defective custom shimmer to Naive UI's theme-controlled pulse. Existing loading boundaries remain `PRESERVE_ORACLE`; the ranking wrapper correction restores the approved ready-layout topology required by `DESIGN.md` and immutable oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717` rather than preserving the defective generic-block geometry.
- **Writable paths:** `openspec/changes/frontend-fix-skeleton-shimmer-loop/**`; `frontend/src/app/App.vue`; `frontend/src/features/query/components/PositionSelector.vue`; `frontend/src/shared/components/DeferredSurfaceState.vue`; `frontend/src/shared/components/SafeImage.vue`; `frontend/src/features/ranking/components/RankingResults.vue`; `frontend/src/features/person-detail/components/PersonInspector.vue`; `frontend/src/features/person-detail/components/PersonItemBrowser.vue`; `frontend/src/features/co-star/components/CandidatePicker.vue`; `frontend/src/features/co-star/components/PartnersSurface.vue`; `frontend/src/features/co-star/components/CoStarSurface.vue`; `frontend/src/features/co-star/components/CoStarWorkBrowser.vue`; `frontend/src/shared/styles/base.css`; `frontend/src/features/person-detail/person-detail.css`; `frontend/src/features/co-star/co-star.css`; `frontend/src/features/co-star/co-star-analysis.css`; `frontend/src/features/co-star/partners.css`; `frontend/tests/shared/skeleton-system.test.ts`; `frontend/tests/features/ranking/components.test.ts`; `frontend/tests/features/co-star/co-star-components.test.ts`; `frontend/scripts/check-architecture.mjs`; accepted sync only in `openspec/specs/frontend-accessibility/spec.md`.
- **Read-only protected inputs:** `PRODUCT.md`, `DESIGN.md`, `.impeccable/**`, `frontend/src/app/themeOverrides.ts`, request/store/API code, tests outside the three declared test paths, Naive UI package source, and the oracle commit.
- **Deletion complement:** Only the untracked superseded `frontend/tests/shared/skeleton-shimmer.test.ts` may be removed. No product state, loading branch, dependency, or tracked file may be deleted.
- **Mutable refs:** No commit, remote ref, PR, release, deployment, host, service, or production state.
- **Consumes:** Existing Naive UI dependency, Skeleton theme overrides, and current loading wrappers.
- **Produces:** One Naive UI Skeleton implementation across all visual Skeleton surfaces, app-owned reduced-motion control, a layout-faithful initial ranking pending state, and focused ownership coverage.
- **Dependencies:** Existing `naive-ui@2.44.1` only; no package or toolchain change.
- **Deliverables:** Revised strict-valid artifacts, bounded Vue/CSS conversion, inventory entry, focused test, and rendered desktop/mobile evidence.
- **Acceptance:** Strict OpenSpec validation; focused Skeleton and ranking tests; affected component tests; typecheck; build; `git diff --check`; browser comparison of real pending/ready ranking geometry at desktop/mobile plus image loading and reduced motion. Full frontend check may be run once if focused gates pass, without further unrelated audit loops.
- **Non-goals:** Changing when loading appears, request behavior, copy, non-ranking geometry, theme colors/radius, non-Skeleton spinners, data contracts, dependencies, or unrelated UI.
- **Operations deferred:** Push, PR, merge, release, deployment, activation, and host mutation.
- **Stop/rollback conditions:** Stop on ownership conflict, protected-input edit, loading geometry/state regression, missing status semantics, relevant console error, or required scope expansion. Roll back only this bounded uncommitted diff with exact patches.
