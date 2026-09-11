## Context

`App.vue` currently renders QueryWorkspace through AppHeader's query slot.
QueryWorkspace teleports its expanded editor to `body` on desktop and positions
it below a 121px two-row sticky Header. The requested topology is one 59px
Header followed by a content-owned query surface and results.

## Goals / Non-Goals

**Goals:** semantic/main ownership, one query surface, content-owned compact
co-star context, unchanged disclosure/selection state, clear content rhythm,
desktop/mobile parity.

**Non-Goals:** QueryEditor redesign, new fields/copy/motion, result or Header-bar
redesign, new dependency.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Local focused implementation |
| Owner | Frontend shell/query workspace |
| Writable paths | Exact proposal paths including the narrow reclaimed App candidate-entry template hunk, DESIGN/sidecar, Header/QueryEditor placement CSS, tests, root spec later |
| Read-only protected inputs | Product/query/candidate selection/API/unrelated active changes/external state; all completed App ranking/person-detail logic remains frozen |
| Deletion complement | Preserve controls/state/results/picker; remove only old Header placement mechanics |
| Mutable refs | Current worktree only |
| Consumes | QueryWorkspace, App main, semantic tokens |
| Produces | In-flow collapsible query panel and compact co-star selection summary |
| Dependencies | Existing Vue/Naive UI shell |
| Deliverables | Code/test/browser/layout evidence |
| Acceptance | Correct DOM order, no Header context row/overlay, state/focus/responsive preservation |
| Non-goals | Form/business/result/dependency changes |
| Operations deferred | Full gate/lifecycle/integration batch |
| Stop/rollback conditions | State/focus/overflow/visual/test regression |

Direction remains `App -> QueryWorkspace -> QueryEditor`; Header no longer owns
or slots the Query Workspace. The implemented
`frontend-clarify-timeout-and-catalog-keys` delta remains authoritative for
PositionSelector identity and timeout copy. It is source-disjoint from this
layout delta; root-spec synchronization applies that delta first and this one
second so both requirements are retained.

`frontend-auto-open-ranking-detail` completed its owned App ranking/person-detail
state changes and those behaviors remain frozen. This query-shell change now
receives the next write only for the compact candidate-entry import, obsolete
Header orchestration helper/computed/slot, and `header-owns-mobile-entry` prop in
the App template. It SHALL preserve QueryWorkspace's main-first placement and
all ranking/detail code; `rankings.integration.test.ts` remains protected.

## Decisions

1. Mount QueryWorkspace first inside `.app-main`. Feedback follows it, then the
   two persistent mode panels, preserving DOM/focus order.
2. QueryWorkspace becomes the bordered ordinary `surface` panel. Its summary is
   the panel header; the editor body sits below one divider. No nested card,
   teleport, fixed position, backdrop blur, or independent editor scrollbar.
3. Desktop `--header-height` becomes the measured complete 59px Header box,
   including its structural borders. Main keeps the
   existing 1280px content line and gains a 24px query-to-result rhythm.
4. Collapse motion uses short opacity only; document height follows state
   naturally. Existing state/focus functions remain, minus overlay geometry.
5. QueryEditor no longer intercepts wheel events. Native document scrolling
   owns vertical movement at every pointer position inside the inline panel.
6. The document retains a real 10px right shell scrollbar with
   `scrollbar-gutter: auto`; the desktop `stable both-edges` override is removed
   so supporting non-overlay-scrollbar browsers do not reserve a fake left
   gutter. Content-line padding remains the intentional page inset.
7. Query summary bottom corners interpolate over the same directional duration
   as the adjacent panel: 160ms ease-out when opening and 120ms ease-in when
   closing. Vue keeps the leaving panel mounted for 120ms, so the summary only
   reaches its fully rounded closed shape as that panel finishes disappearing.
8. Compact co-star selection keeps the existing `MobileCandidateEntry` mounted
   by App, but moves it from AppHeader's slot to the first child of the persistent
   co-star mode panel. It therefore remains available during lazy workspace
   loading/failure and sits after Query Workspace/feedback but before analysis.
   `headerOwnsMobileEntry` is renamed to `externalOwnsMobileEntry` to describe
   this App content ownership without implying Header placement. Header drops
   the slot, visibility prop, second-row wrapper, and contextual CSS. The entry's
   selection owner, Drawer, opener/focus restoration, query-close guard,
   accessible label, and desktop rail remain unchanged.

Alternatives rejected: retaining a teleport with main-relative coordinates is
still an overlay; placing the panel inside each mode duplicates shared Draft;
moving only CSS leaves Header DOM/semantics wrong.

## Risks / Trade-offs

- **Large editor pushes results** -> intentional in-flow behavior; collapse
  remains one click and successful query auto-collapses.
- **Sticky Header height drift** -> bind desktop token to actual bar height.
- **Mobile nested scroll** -> remove editor max-height/overflow and wheel
  containment; page owns scroll.
- **Focus regression** -> preserve summary/editor refs and test open/close/submit.
- **Browser-dependent left strip** -> measure `documentElement`/Header/main at
  779/780/desktop with classic scrollbars and forbid `stable both-edges`.
- **Transient mismatched silhouette** -> sample computed bottom radii at start,
  midpoint, and completion for both opening and closing directions.
- **Candidate entry duplicates or loses focus** -> require exactly one entry in
  the active co-star content, none in Header, and exercise open/close focus
  restoration with Query Editor expanded/collapsed.

## Migration Plan

Focused structural test, typecheck/build, dedicated 5174 browser desktop and
compact checks. Full matrix and spec lifecycle remain batched.

## Open Questions

None.
