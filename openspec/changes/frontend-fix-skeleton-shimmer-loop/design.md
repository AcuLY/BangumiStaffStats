## Context

The application already depends on Naive UI and uses `NSkeleton` in catalog, generic deferred, and candidate-row states, with Light/Dark colors and radius controlled by `appThemeOverrides`. Other loading states build plain `span`, `i`, `b`, or `div` blocks and animate a shared custom gradient. The user has selected full standardization on Naive UI rather than maintaining and repairing the custom shimmer.

### Change boundary

| Field | Boundary |
|---|---|
| Status | Revised plan; apply only after strict validation and zero-P0/P1 review |
| Owner | Primary agent, frontend presentation |
| Writable paths | Exact paths listed in `proposal.md` |
| Read-only protected inputs | Product/design authorities, theme override, request/store/API code, tests outside the three declared test paths, Naive UI source, oracle commit |
| Deletion complement | Only superseded untracked `frontend/tests/shared/skeleton-shimmer.test.ts`; no tracked file/state/dependency deletion |
| Mutable refs | No commit, remote ref, PR, release, deployment, host, service, or production state |
| Consumes | `naive-ui@2.44.1`, Skeleton theme overrides, current loading wrappers |
| Produces | Direct `NSkeleton` usage for every visual placeholder, app-owned reduced-motion class, layout-faithful initial ranking pending state, focused coverage |
| Dependencies | App/provider -> Naive UI theme -> `NSkeleton`; feature wrappers control layout only |
| Deliverables | Vue/CSS conversion, inventory entry, test, rendered evidence |
| Acceptance | Strict spec, focused Skeleton/ranking/affected tests, typecheck, build, diff check, one bounded full check, Browser pending/ready desktop/mobile/reduced-motion |
| Non-goals | Loading state machine, copy, non-ranking geometry, palette/radius, spinners, requests/data/dependencies/operations |
| Operations deferred | Push through deployment and all host mutation |
| Stop/rollback conditions | Stop on ownership, protected-input, state, geometry, accessibility, console, or scope failure; exact uncommitted patch rollback only |

## Goals / Non-Goals

**Goals:**

- Render every visual loading placeholder with Naive UI `NSkeleton`.
- Preserve the correct wrapper grids, dimensions, breakpoints, status text, and `aria-busy` boundaries while repairing the initial ranking wrapper that currently diverges from its ready surface.
- Remove the entire custom Skeleton animation implementation.
- Disable Naive UI Skeleton animation under reduced motion through an app-owned class.

**Non-Goals:**

- Changing which requests show loading or how long they remain pending.
- Reworking loading layouts outside the reported initial ranking surface, copy, theme tokens, or non-Skeleton spinners.
- Adding a wrapper abstraction or dependency.

## Decisions

### Use direct NSkeleton components and retain feature wrappers

Each custom placeholder leaf becomes `<n-skeleton class="app-skeleton …" :sharp="false" />`. Existing wrapper classes remain responsible for grid, spacing, and responsive geometry. Specific leaf classes remain only where width or height differs, such as inline metrics and pagination.

Direct components were chosen over a new `AppSkeleton` wrapper because the project already uses `NSkeleton`, all required variation is available through props/classes, and a wrapper would add inventory and indirection without behavior.

### Mark all Skeleton instances with an app-owned class

Existing and new instances receive `app-skeleton`. The reduced-motion media query targets this class and sets `animation: none`, avoiding selectors against Naive UI private structure. The existing theme override continues to own colors and radius.

### Remove custom material while preserving geometry

All custom linear-gradient backgrounds, `ranking-shimmer` references/keyframes, and feature no-preference animation blocks are removed. CSS selectors move from generic child tags to `.app-skeleton` or retained leaf classes. Dimensions are unchanged and verified through computed rectangles in real pending states.

### Mirror the ready ranking topology with NSkeleton leaves

The initial core-pending branch uses the same `ranking-pane` controls/list/pagination regions and row grid roles as the ready branch. Stable headings remain visible, the current Draft scope selects three global or four personal metric tracks, and each visual placeholder leaf is a direct `<n-skeleton class="app-skeleton">`. Wrapper classes own geometry only; they do not paint, animate, or wrap `NSkeleton` in a new component.

The generic six-block layout was rejected because changing the visual primitive alone cannot prevent the summary, toolbar, column, row, and pagination jump reported by the user. The previous independent implementation was also rejected because its custom `<i>` blocks and animation owner would violate this change's single-primitive contract.

### Convert SafeImage loading only

`SafeImage` renders an `NSkeleton` only for `loading`. Its `missing` and `error` branches keep the existing icon fallback so the three states remain distinguishable. Image state, timeout, sources, dimensions, and accessibility labels do not change. Directly affected co-star assertions are updated from custom child tags and per-feature shimmer media blocks to Naive UI roots and the centralized reduced-motion owner.

### Focused ownership test replaces shimmer test

The superseded untracked shimmer test is replaced by `skeleton-system.test.ts`. It verifies no production source contains `ranking-shimmer` or custom Skeleton gradients, every Skeleton instance carries `app-skeleton`, all former custom leaf surfaces render `NSkeleton`, reduced motion is centralized, and the persistent inventory includes the test.

## Risks / Trade-offs

- [Naive UI pulse differs from the prior directional shimmer] -> This is the user-approved intentional delta; preserve all geometry and theme mapping.
- [Component root elements differ from former inline tags] -> Keep wrappers and CSS classes, then verify DOM/layout at desktop and mobile widths.
- [SafeImage nests the component inside its fixed media wrapper] -> Keep the outer media owner unchanged and make the Skeleton decorative while the wrapper retains the state label.
- [A future custom placeholder bypasses the primitive] -> Focused source ownership test rejects custom animation and missing app-owned classes.
- [Ranking layout wrappers accidentally become a second Skeleton implementation] -> Keep all visual leaves as `NSkeleton`; CSS may only define grid placement and dimensions, and focused tests assert both ownership and topology.

## Migration Plan

Apply the compatibility correction directly on the existing `codex/fix-skeleton-shimmer-loop` branch, run focused and rendered checks, then sync/archive only after acceptance. Do not create or depend on a separate alignment worktree. No data or deployment migration exists.

## Open Questions

None.
