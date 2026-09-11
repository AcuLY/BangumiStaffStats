> Supersession (2026-09-08): `contracts-remove-query-sharing` retires the query-sharing feature and overrides the sharing-specific requirements, preservation clauses, and acceptance assumptions below. URL fragments are cleared without parsing or replay. Header now has an always available same-tab “回到旧版” link to `https://search.bgmss.fun/old/` immediately left of theme. Exact accepted workspace recovery remains frontend-local through validated v2 JSON session storage; v1 fragment-based storage is discarded. Completed evidence below remains historical, and unrelated requirements are unchanged.

## Why

The Query Workspace currently occupies a second Header row and expands as a
desktop overlay, visually making query parameters global chrome rather than
the first step of the current ranking/co-star task. The user explicitly wants
it moved into the document content above results while remaining collapsible.

## What Changes

- Remove the Query Workspace slot/row from the sticky Header; Header retains
  only brand, mode, share, and theme.
- Mount the same Query Workspace as the first child of `<main>`, before
  feedback and both persistent mode panels.
- Mount the existing compact co-star `MobileCandidateEntry` as the first child
  of the active co-star mode content after Query Workspace/feedback and before
  lazy workspace/analysis state; remove the Header compact-context slot/prop and
  Header-only CSS.
- Replace desktop teleport/fixed overlay behavior with one in-flow surface:
  collapsed summary header plus expanded QueryEditor body.
- Remove QueryEditor's obsolete wheel containment so the page remains the one
  vertical scroll owner while the pointer is over the inline editor.
- Remove the desktop `stable both-edges` shell gutter that mirrors the real
  right scrollbar as a browser-dependent blank strip on the left.
- Synchronize the summary header's bottom-corner transition with the editor
  panel's 160ms enter and 120ms leave durations so neither state flashes the
  wrong silhouette mid-transition.
- Preserve Draft/Applied Query ownership, automatic disclosure, collapse,
  submit/cancel/retry, focus restoration, Escape behavior, mounted mode panels,
  and mobile semantics.
- Add focused structural tests and desktop/mobile browser evidence; defer the
  complete Frontend gate to the requested later batch.

This is an `INTENTIONAL_DELTA` from oracle
`644b7748674e553f863d0ffd61d029f86fdc0717`, authorized by the user's explicit
layout request. Visual tokens, form content, controls, copy, and business
behavior remain `PRESERVE_ORACLE`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-query-shell`: place the collapsible Query Workspace in the main
  content flow above mode results at every viewport instead of in Header chrome
  or a desktop overlay.

## Impact

- **Status:** local specification/implementation/focused verification only.
- **Owner:** Frontend shell/query workspace; primary agent reviews/accepts.
- **Writable paths:**
  `openspec/changes/frontend-move-query-panel-into-content/**`,
  `DESIGN.md`, `.impeccable/design.json`,
  `frontend/src/app/App.vue`,
  `frontend/src/features/co-star/components/CoStarWorkspace.vue`,
  `frontend/src/features/co-star/co-star.css`,
  `frontend/src/features/query/components/{AppHeader,QueryWorkspace,QueryEditor}.vue`,
  `frontend/src/shared/styles/base.css`,
  `frontend/tests/app/co-star.integration.test.ts`,
  `frontend/tests/features/query/components.test.ts`,
  `frontend/tests/features/co-star/co-star-components.test.ts`,
  `frontend/tests/shared/scrollbar-system.test.ts`, and the exact root spec at
  later sync.
- **Read-only protected inputs:** PRODUCT, QueryEditor form/state internals,
  stores/coordinator/API/generated types, unrelated active-change paths, original
  dirty worktree, Backend/Archive, remotes/hosts/production. Ranking/person-detail
  state and all earlier completed `App.vue` behavior remain frozen; this change
  reclaims only the compact candidate-entry import/computed/helper/Header slot/
  CoStarWorkspace prop template hunk after `frontend-auto-open-ranking-detail`.
- **Deletion complement:** remove no query control/state/test/result surface;
  only remove the Header query/mobile-context rows, teleport/overlay mechanics,
  Header-only candidate-entry ownership, and obsolete CSS.
- **Mutable refs:** current local worktree only.
- **Consumes:** existing QueryWorkspace disclosure/state, `<main>`, semantic
  tokens, responsive breakpoints.
- **Produces:** one in-flow collapsible query surface above result content and
  one App-owned compact co-star selection summary before workspace/analysis.
- **Dependencies:** accepted frontend-query-shell, Vue 3, Naive UI, existing
  full Catalog/native Backend runtime, and the orthogonal implemented
  `frontend-clarify-timeout-and-catalog-keys` delta. The older delta owns
  PositionSelector identity/copy only; this change owns placement only and
  SHALL preserve it. The later ranking-detail change consumes this completed
  App topology without reopening QueryWorkspace placement. Root-spec sync order
  is catalog/timeout first, layout second, ranking detail third.
- **Deliverables:** component/CSS/test diff, strict change validation, layout
  detector, focused Vitest/typecheck/build, browser DOM/console/screenshots.
- **Acceptance:** no `.app-header__query` or fixed query overlay; Query Workspace
  is inside main before feedback/mode panels; collapsed/expanded states work;
  corner geometry stays synchronized during both transition directions; no
  `.app-header__mobile-context`; compact co-star entry is inside its mode content
  after Query Workspace and opens the existing picker; no mirrored left scrollbar
  gutter, overlap/overflow/console error at desktop and compact widths.
- **Non-goals:** changing form fields, query semantics, Header primary bar,
  result layouts, drawers, routes, copy, dependencies, Backend, or deployment.
- **Operations deferred:** complete gate, sync/archive, commit/push/PR/release/
  deploy and production mutation remain in the later batch.
- **Stop/rollback conditions:** stop on active-change overlap, lost state/focus,
  responsive overflow, result ordering drift, inaccessible disclosure, or
  focused test/browser failure; restore only exact declared paths.

`frontend-polish-query-and-co-star-workspace` receives the next write for the
exact QueryWorkspace silent-no-op/reveal behavior, QueryEditor footer-copy
deletion, query-panel enter/leave plus workspace-attention/footer rules in
`base.css`, the co-star rail/toolbar/row/focus rules, App's mode-loader/
candidate-default/empty-action callbacks, and their focused tests. This change
keeps its completed topology/corner/scrollbar/compact-entry outputs frozen and
no longer owns those transferred slices. `frontend-harden-interaction-reveal-focus`
receives only later cross-region reveal/focus, compact target, pagination and
breakpoint hardening; it SHALL preserve this topology.

Apply is blocked until proposal/design/spec/tasks are strict-valid, DESIGN and
its sidecar express the intentional delta, and the active capability deltas are
explicitly sequenced without source-path overlap.
