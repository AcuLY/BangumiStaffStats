## Why

Two rendered gaps remain after the accepted ranking/detail and responsive residual work: when a changed ranking query succeeds, the left result can replace its skeleton before the right detail is ready, briefly exposing a one-column/full-width ranking layout; at 320–328px, the root `320px` minimum combines with the reserved viewport scrollbar to force horizontal scrolling. Both are visible continuity failures in states and widths the product claims to support.

## What Changes

- Keep the desktop companion `PersonDetailSkeleton` mounted after ranking acceptance while the automatically selected first person's coordinated detail request is still pending, then replace it directly with the real Inspector or its error state.
- Prevent the ranking workspace from entering its no-detail single-column layout during that accepted-result/detail-pending bridge.
- Make the root minimum width respect the actual scrollbar-reduced client width so a nominal 320px viewport does not create a 10px horizontal scroll range.
- Add timing-sensitive ranking integration coverage and root-scrollbar source/rendered regressions at 320, 328, 329, and 330px.
- Classify both corrections as **INTENTIONAL_DELTA** follow-through governed by the user's current browser comments, DESIGN's stable loading/reflow requirements, and the accepted `frontend-auto-open-ranking-detail` / `frontend-close-session-ui-residuals` behavior. All ranking data, automatic selection, share, drawer, theme, and oracle behavior remain **PRESERVE_ORACLE** relative to `644b7748674e553f863d0ffd61d029f86fdc0717`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-ranking-results`: require the right companion detail skeleton to remain layout-stable from primary acceptance until the selected detail leaves pending.
- `frontend-query-shell`: require the reserved viewport scrollbar and root minimum width to avoid horizontal overflow at the supported 320px extreme.

## Impact

- **Status:** Proposed local follow-up; apply is blocked until proposal, delta specs, design, and tasks are strict-valid and pass main-agent review.
- **Owner:** Frontend presentation/state projection; primary agent owns the bounded correction and acceptance.
- **Writable paths:** `openspec/changes/frontend-stabilize-ranking-result-layout/**`; exact next-write transfer notes in `openspec/changes/frontend-auto-open-ranking-detail/{proposal.md,tasks.md}` and `openspec/changes/frontend-close-session-ui-residuals/{proposal.md,tasks.md}`; `frontend/src/app/App.vue`; `frontend/src/shared/styles/base.css`; `frontend/tests/app/rankings.integration.test.ts`; `frontend/tests/shared/scrollbar-system.test.ts`.
- **Read-only protected inputs:** `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, query store/model/coordinator, ranking/person-detail drivers and contracts, PersonDetailSkeleton/PersonDetailSurface/PersonInspector internals, other frontend CSS/tests, Backend/updater/Archive, remotes, hosts, and production.
- **Deletion complement:** Remove no skeleton section, result/detail state, automatic selection, share behavior, drawer behavior, root scrollbar ownership, test, or unrelated dirty change.
- **Mutable refs:** Current local `codex/remove-archive-admission` dirty worktree only; no remote or external ref.
- **Consumes:** Existing ranking/person-detail resource phases, accepted first-person selection, reusable detail skeleton, viewport shell scrollbar, and semantic root layout.
- **Produces:** A gap-free ranking-to-detail transition and scrollbar-safe 320px root layout with focused and rendered evidence.
- **Dependencies:** Existing Vue/Naive/native CSS only; dependency direction remains accepted resources -> App projection -> existing components/styles. No new package, state owner, request, or contract.
- **Deliverables:** Strict OpenSpec, bounded App/CSS/test edits, focused Vitest/typecheck/build/detector/diff evidence, query-transition Browser evidence, and 320/328/329/330 rendered reflow evidence.
- **Acceptance:** Desktop primary pending shows two skeleton regions; ranking acceptance keeps the right person-detail-shaped skeleton while detail is pending and never expands the left pane; detail ready/error replaces the skeleton without an empty frame; exactly one first-person request remains; no-person selection/column, share, refresh, and compact semantics remain unchanged while later complete-zero interior presentation is owned by `frontend-auto-open-ranking-detail`; 320–330px page `scrollWidth <= clientWidth + 1`; no control overlap, framework overlay, or relevant console warning/error.
- **Non-goals:** Query/statistical/API changes, different automatic person choice, longer artificial loading time, animation/redesign, other responsive cleanup, Figma, dependencies, broad test repair, or deployment.
- **Operations deferred:** Complete accumulated gate, root-spec sync/archive, commit/push/PR/merge/release/deploy, host and production mutation.
- **External state:** No other repository or external state is touched.
- **Stop/rollback conditions:** Stop on double/stale detail request, share or compact drawer drift, zero-result column regression, false loading status, root scrollbar ownership change, overlap with undeclared dirty paths, failed focused acceptance, or required scope expansion. Roll back only the exact follow-up hunks.
