## Why

Below 780px, the expanded Query Workspace currently turns off its local vertical scroller, so touch scrolling is delegated to the document and can move the results page beneath the query panel. Restoring that bounded scroller exposed a visual regression: the in-flow mobile editor still paints the same 92% chrome background as its translucent sticky Header parent, so those pixels receive two translucent chrome layers and appear effectively opaque. This bounded mobile correction restores one intended scroll owner and one translucent chrome paint layer while preserving the existing query behavior and topology.

## What Changes

- Keep the expanded compact Query Editor vertically usable at 360px and 390px widths and at short viewport heights by making its existing scroll region the local vertical scroll owner.
- While the compact Query Editor is open, temporarily lock the actual viewport scroll owner (`document.scrollingElement`, which is the document root in standards mode); restore its exact prior inline overflow value when the editor closes, the viewport crosses to desktop, or the component unmounts, without mutating body inline overflow.
- Below 780px, make the in-header `.query-editor-overlay` background transparent so the existing `.app-header` remains the sole translucent chrome/background/backdrop painter for those pixels; preserve the desktop teleported overlay's own chrome background and backdrop.
- Preserve desktop scrolling, query state, copy, API behavior, layout outside scroll ownership, focus behavior, and the immutable oracle appearance.
- Add focused regression coverage for compact open/close, breakpoint transition, unmount cleanup, desktop non-locking, the mobile local-scroll CSS contract, and the single mobile chrome-paint contract.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-query-shell`: Clarify that the below-780px document-flow Query Editor owns vertical scrolling while expanded and prevents scroll chaining into the underlying page, with exact lifecycle restoration.

## Impact

| Field | Boundary |
| --- | --- |
| Status | Bounded mobile interaction bug correction; apply remains blocked until proposal, delta spec, design, and tasks pass strict validation and main-agent review. |
| Owner | Frontend implementation owner for Query Workspace presentation and interaction state. |
| Writable paths | `openspec/changes/prevent-mobile-query-scroll-through/proposal.md`; `openspec/changes/prevent-mobile-query-scroll-through/design.md`; `openspec/changes/prevent-mobile-query-scroll-through/specs/frontend-query-shell/spec.md`; `openspec/changes/prevent-mobile-query-scroll-through/tasks.md`; `frontend/src/features/query/components/QueryWorkspace.vue`; `frontend/src/shared/styles/base.css`; `frontend/tests/features/query/components.test.ts`; `frontend/tests/shared/scrollbar-system.test.ts`. |
| Read-only protected inputs | `AGENTS.md`; `PRODUCT.md`; `DESIGN.md`; `.impeccable/design.json`; `frontend/ARCHITECTURE.md`; `frontend/src/features/query/components/QueryEditor.vue`; `frontend/src/features/query/composables/useCompactLayout.ts`; `frontend/src/features/person-detail/components/PersonDetailSurface.vue`; `frontend/src/features/person-detail/person-detail.css`; accepted specs under `openspec/specs/`; oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`; ignored preview runtime files; `node_modules/`; generated `dist/` or build output. |
| Deletion complement | No files, public behavior, query fields, tests, selectors, or styles are deleted. |
| Mutable refs | Only Query Workspace's compact/open lifecycle state and the exact prior inline overflow value of the actual root viewport scroll owner; body inline overflow and all route, query, resource, storage, and external refs remain unchanged. |
| Consumes | Existing `editing` state, `useCompactLayout` breakpoint signal, Query Editor scroll region, CSS viewport units, `document.scrollingElement`, and the accepted reversible lock/restore lifecycle pattern. |
| Produces | Reversible compact-only root viewport scroll isolation, a bounded mobile Query Editor scroll container, and one Header-owned translucent chrome layer for the in-flow mobile editor. |
| Dependencies | Existing Vue 3 lifecycle/watch APIs and CSS; no dependency or toolchain changes. Dependency direction remains frontend presentation consuming existing query state only. |
| Deliverables | Strict-valid OpenSpec artifacts, RED/GREEN focused regression tests, minimal Query Workspace/CSS correction, and verification evidence. |
| Acceptance | Focused query tests; relevant CSS/architecture tests; `npm run check`; strict validation of this change and all specs; `git diff --check`; final owned-path diff audit; representative mobile/desktop behavior verification where locally possible. |
| Non-goals | No query semantics, copy, API, store, coordinator, focus model, desktop overlay chrome, parent Header blur/background, theme token, breakpoint, generalized scroll-lock utility, Drawer behavior, visual redesign, dependency, contract, schema, or broad cleanup changes. |
| Operations deferred | No external repository, push, pull request, merge, release, deployment, live service, host, route, or production activation is touched. |
| Stop/rollback conditions | Stop on authority conflict, overlapping concurrent edits, unexpected test failure, required scope expansion, inability to preserve the prior root overflow exactly or body inline overflow unchanged, or evidence of desktop/query/visual drift. Roll back only the exact owned edits; never use destructive Git cleanup. |

Behavior classification: Query copy, semantics, desktop behavior, and appearance are `PRESERVE_ORACLE` against `644b7748674e553f863d0ffd61d029f86fdc0717`. Compact scroll ownership is an `INTENTIONAL_DELTA` governed by the reported bug, `DESIGN.md` responsive Query Workspace rules, and `frontend-accessibility`'s single intended scroll-owner requirement. This change creates no `NEW_CAPABILITY`.
