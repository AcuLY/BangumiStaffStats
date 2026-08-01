## Context

Query Workspace is rendered inside the sticky Header. At 780px and above, `QueryWorkspace.vue` teleports the editor overlay to `body`; `base.css` bounds the overlay to the viewport and `.query-editor__scroll` owns vertical scrolling. Below 780px, teleport is disabled so the editor remains in Header document flow as required by `DESIGN.md` and `frontend-query-shell`, but the mobile CSS resets the local scroll region to `max-height: none` and `overflow: visible`. Touch movement therefore scrolls the viewport and can move the underlying results beneath the expanded editor.

The first implementation copied the mobile Person Detail Drawer's body-lock target, but accepted review established that this application explicitly gives `html` `overflow-y: scroll`. In standards mode `document.scrollingElement` is the document element, and body overflow propagates to the viewport only while root overflow is visible. Query Workspace therefore needs the same reversible lifecycle principle applied to the actual root viewport scroll owner, without becoming a modal Drawer, changing focus behavior, mutating body inline overflow, or leaving mobile document-flow topology.

Rendered inspection at 390px in both themes also confirms a visual regression introduced by making the mobile child a bounded scrolling surface. `.app-header` paints `var(--chrome-background)` plus `blur(16px) saturate(135%)`; the in-flow `.query-editor-overlay` is its descendant and independently paints the same 92% chrome background while only its child backdrop filter is disabled. The resulting double background violates `DESIGN.md`'s requirement that each pixel receive one translucent background layer and makes the editor appear opaque. Mobile must rely on the Header's chrome paint, while the desktop teleported overlay must keep its own background and backdrop because it is no longer inside the Header paint stack.

## Change Boundary

| Field | Boundary |
| --- | --- |
| Status | Bounded mobile interaction bug correction; reviewed as a zero-P0/P1 planning block before apply. |
| Owner | Frontend Query Workspace implementation owner. |
| Writable paths | `openspec/changes/prevent-mobile-query-scroll-through/proposal.md`; `openspec/changes/prevent-mobile-query-scroll-through/design.md`; `openspec/changes/prevent-mobile-query-scroll-through/specs/frontend-query-shell/spec.md`; `openspec/changes/prevent-mobile-query-scroll-through/tasks.md`; `frontend/src/features/query/components/QueryWorkspace.vue`; `frontend/src/shared/styles/base.css`; `frontend/tests/features/query/components.test.ts`; `frontend/tests/shared/scrollbar-system.test.ts`. |
| Read-only protected inputs | `AGENTS.md`; `PRODUCT.md`; `DESIGN.md`; `.impeccable/design.json`; `frontend/ARCHITECTURE.md`; `frontend/src/features/query/components/QueryEditor.vue`; `frontend/src/features/query/composables/useCompactLayout.ts`; `frontend/src/features/person-detail/components/PersonDetailSurface.vue`; `frontend/src/features/person-detail/person-detail.css`; `openspec/specs/**`; oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`; ignored preview runtime files; dependencies and generated output. |
| Deletion complement | No deletion or renaming. Existing Query Editor markup, state, copy, controls, selectors, desktop rules, and Drawer implementation remain. |
| Mutable refs | Query Workspace's existing `editing` and compact signals are observed; one local saved copy of the actual root viewport scroll owner's inline overflow is mutated and restored. Body inline overflow remains unchanged. |
| Consumes | Existing query disclosure state, compact breakpoint signal, Query Editor scroll wrapper, sticky Header geometry, and native Vue/CSS behavior. |
| Produces | Compact-only reversible root viewport lock, a viewport-bounded mobile Query Editor scroll owner, and one Header-owned translucent chrome paint layer on mobile. |
| Dependencies | Vue 3 `watch`/unmount lifecycle and CSS dynamic viewport units. No new package. Direction remains Query Workspace presentation consuming query state; no reverse dependency or statistical logic. |
| Deliverables | Delta spec, regression test, minimal component/style patch, and exact verification evidence. |
| Acceptance | RED then GREEN focused query test; CSS and architecture checks; full `npm run check`; strict change/all-spec validation; `git diff --check`; final owned-path audit; representative 360/390/desktop and short-height behavior check when the local preview can run. |
| Non-goals | Modal semantics, inert background, focus trapping, visual restyle, copy changes, query/state/API changes, desktop lock or desktop overlay chrome changes, parent Header blur/background changes, theme token changes, shared global lock abstraction, Drawer changes, dependency changes, or operations. |
| Operations deferred | No remote, external repository, release, deployment, host, route, service, or production mutation. |
| Stop/rollback conditions | Stop if viewport-scroll ownership is shared concurrently, document-flow placement cannot be preserved, desktop becomes locked, mobile content cannot scroll, prior root overflow cannot be restored exactly, body inline overflow changes, tests expose unrelated failure, or scope must widen. Revert only exact owned lines/files. |

## Goals / Non-Goals

**Goals**

- Make the expanded Query Editor the only vertical touch-scroll owner below 780px.
- Keep every query control reachable at 360px, 390px, and short viewport heights.
- Restore the actual root viewport scroll owner's exact prior inline overflow value on every exit path while preserving body inline overflow.
- Preserve desktop page scrolling and all existing query behavior and appearance.

**Non-Goals**

- Do not convert Query Workspace into a modal or Drawer.
- Do not alter Query Editor markup, focus policy, query semantics, request coordination, or responsive breakpoint.
- Do not introduce a permanent global overflow rule or a generalized overlay manager.

## Decisions

### 1. Lock the actual viewport scroll owner from Query Workspace lifecycle state

`QueryWorkspace.vue` will watch the existing `editing` and `compact` refs together. When both are true it will resolve `targetWindow.document.scrollingElement`, falling back only to `document.documentElement` when the API is absent even though standards mode makes that element the viewport scroll owner. It will save that root element's current inline `style.overflow` once and set it to `hidden`. Any other state restores the exact saved value to the same element, and `onBeforeUnmount` performs the same restoration. The lifecycle will not mutate `document.body.style.overflow`.

This preserves the accepted reversible lifecycle shape while targeting the standards-correct scroll owner. It directly covers close, successful apply, failure-preserved open state, compact-to-desktop transition, and unmount without creating another state owner.

**Alternative considered:** prevent every `touchmove` event. Rejected because non-passive listener correctness is browser-sensitive, can obstruct controls, and treats symptoms rather than assigning one scroll owner.

**Alternative considered:** a shared scroll-lock utility or dual root/body lock. Rejected because this application has a concrete standards-mode root scroll owner, the correction has one bounded owner, and mutating body would be unnecessary state expansion that weakens exact restoration guarantees.

### 2. Restore the existing Query Editor scroll region on mobile

The below-780px rules will keep `.query-editor-overlay` in static document flow but bound its available height to the viewport beneath the Header bar and summary. `.query-editor` and `.query-editor__scroll` will inherit that bound, retain `overflow-y: auto`, and use `overscroll-behavior-y: contain` so the panel remains usable and does not chain at its edges.

Because that mobile overlay remains inside `.app-header`, its below-780px rule will also set `background: transparent`. The Header keeps the accepted `var(--chrome-background)` and `backdrop-filter: blur(16px) saturate(135%)`, so each mobile pixel receives one translucent chrome layer. The base/desktop `.query-editor-overlay` background and backdrop remain unchanged for the teleported overlay. This preserves the existing DOM, visual surface, mobile topology, and safe-area bottom padding while correcting scroll ownership and the newly exposed duplicate paint.

**Alternative considered:** make the mobile overlay fixed or teleport it to `body`. Rejected because `DESIGN.md` and `frontend-query-shell` explicitly require the mobile editor to remain in document flow, and a fixed overlay would create a larger visual/topology delta.

### 3. Test lifecycle and CSS contracts at the existing component boundary

The focused component test will simulate a reactive compact media query, set a non-default prior inline overflow value on `document.scrollingElement`, assert RED because the current body-only implementation leaves that actual root owner unchanged, then cover exact root restoration after close, 780px transition, and unmount plus desktop non-locking. It will also assert that body inline overflow is preserved. A source-level CSS assertion will protect the compact scroll-container contract and require the mobile overlay background to be transparent while the parent Header and base desktop overlay retain their chrome paint/backdrop, because jsdom cannot perform real touch layout or compositing.

No public query fixtures or semantic assertions change.

## Risks / Trade-offs

- **[Risk] A short viewport clips the editor because Header height is miscomputed** → Bound the mobile overlay from the existing Header bar and 44px query summary contract, keep the inner region scrollable, and verify short-height rendering.
- **[Risk] Root overflow is overwritten on cleanup or restored to a replacement node** → Save the exact root element/value pair once, restore that same element's captured inline value, and reset the sentinel after restoration.
- **[Risk] Desktop inherits the lock after crossing 780px** → Drive cleanup from the same reactive compact signal and test the transition explicitly.
- **[Risk] Scroll chaining persists at panel edges** → Keep local `overflow-y: auto` and use `overscroll-behavior-y: contain` on the mobile scroll owner.
- **[Risk] Removing the child background also removes desktop overlay chrome** → Scope `background: transparent` only to the existing below-780px override and assert that the base overlay still owns its background/backdrop.
- **[Risk] Mobile translucency is lost because the parent chrome changes** → Leave `.app-header` background/backdrop untouched and assert both remain present alongside the transparent mobile child.
- **[Trade-off] The document scrollbar may disappear while editing** → This is temporary and scoped to the compact expanded state; preserving underlying scroll position and preventing background movement take precedence.

## Migration Plan

1. Strict-validate the planning artifacts.
2. Add and run the focused regression test to capture the expected RED failure.
3. Add the compact/open root-scroll-owner lifecycle and mobile scroll CSS.
4. Run focused and full frontend/OpenSpec gates.
5. Leave the change uncommitted and unarchived for parent-session review.

Rollback removes only the new Query Workspace lifecycle functions/watch, restores the prior mobile CSS declarations, and removes the focused regression assertions. No data or external migration exists.

## Oracle and Delta Evidence

- `PRESERVE_ORACLE`: copy, control hierarchy, focus behavior, query semantics, desktop overlay, mobile document-flow placement, theme, and all unrelated visuals against `644b7748674e553f863d0ffd61d029f86fdc0717`.
- `INTENTIONAL_DELTA`: below-780px expanded Query Editor owns vertical scrolling and prevents underlying viewport movement by locking the actual root scrolling element, governed by the reported bug and the accepted single-scroll-owner accessibility rule.
- `NEW_CAPABILITY`: none.

## Open Questions

None. The user supplied the breakpoint, lifecycle requirements, non-goals, and accepted comparison pattern.
