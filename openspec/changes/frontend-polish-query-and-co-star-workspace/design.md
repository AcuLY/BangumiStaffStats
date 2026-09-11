> Supersession (2026-09-08): `contracts-remove-query-sharing` retires the query-sharing feature and overrides the sharing-specific requirements, preservation clauses, and acceptance assumptions below. URL fragments are cleared without parsing or replay. Header now has an always available same-tab “回到旧版” link to `https://search.bgmss.fun/old/` immediately left of theme. Exact accepted workspace recovery remains frontend-local through validated v2 JSON session storage; v1 fragment-based storage is discarded. Completed evidence below remains historical, and unrelated requirements are unchanged.

## Context

The current implementation already has the correct content-owned Query
Workspace, hierarchical catalog, persistent co-star rail/drawer, and one
selection owner. This change polishes those same structures and adds one
explicit initial-selection policy; it introduces no component library or
secondary state owner.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Local focused implementation; heavyweight gate deferred |
| Owner | Primary agent, Frontend query shell and co-star vertical |
| Writable paths | Exact proposal paths and exact transferred selector/callback/coordinator/toolbar/test slices |
| Read-only protected inputs | Query/coordinator/API/catalog/statistics/selection-limit authorities, Backend/updater/Archive, external state |
| Deletion complement | Preserve all controls, leaves, candidate data, selection actions, shares, and result surfaces |
| Mutable refs | Current local worktree only |
| Consumes | Vue Transition, accepted candidate payload order/current position, Naive UI public controls, semantic tokens |
| Produces | Vertical disclosure motion, flat leaf alignment, direct mode loading, compact Inspector toolbar, consistent candidate rail, default first-two selection |
| Dependencies | Existing query-shell/catalog/co-star changes; no new dependency |
| Deliverables | Docs/spec/code/tests/build/layout/browser/diff evidence |
| Acceptance | Six requested annotations, share/retention/view-only preservation, desktop/compact accessibility |
| Non-goals | Broad redesign, API/statistics/schema/dependency/Backend/deployment changes |
| Operations deferred | Complete gate, sync/archive, Git integration, release/deploy |
| Stop/rollback conditions | Ownership, state, share, focus, overflow, console, or focused-test regression |

Dependency direction remains `App primary candidate acceptance -> existing
CoStarSelection -> existing analysis watchers`. Presentation consumes semantic
tokens and Naive UI public APIs; it does not reach into library-private DOM or
recompute Backend ranking.

## Decisions

1. Query disclosure uses the grid-row accordion pattern on the existing panel:
   active states transition `grid-template-rows` and opacity; from/to states use
   `0fr`; the existing editor supplies `min-height: 0` and overflow clipping.
   Durations remain 160ms enter and 120ms leave so the already synchronized
   summary corners stay coherent. Reduced motion sets both transitions to zero.
2. Disclosed position leaves start on the same content line as category rows.
   Remove only the list's inline-start padding; keep vertical padding, grids,
   hierarchy, focus, and compact target sizing.
3. The candidate toolbar keeps existing Naive Input/Select and shared
   SortDirectionButton. It uses one consistent visible control height and gives
   the sort selector enough inline space; responsive rows preserve search as
   the full-width first control when constrained. The direction track is 80px
   and the shared button keeps both its current “升序 / 降序” label and AppIcon
   visible; compact reflow uses a second row instead of discarding information.
   SortDirectionButton uses a straight-stem down arrow that rotates for asc and
   consumes the same input-control surface as adjacent Naive Selects while
   leaving Button border/hover/focus ownership with Naive's public component.
4. Candidate rows receive a neutral 1px border in every unselected state.
   Hover changes background/border without layout shift; selected state keeps
   the brand border. No new card shadow or nested surface is introduced.
5. The desktop rail attention ring is an outward outline/pseudo-element outside
   the rail content box, rather than an inset shadow underneath children. The
   rail reserves no new internal padding, so data density and control alignment
   remain unchanged.
6. On an ordinary successful primary candidates application, after the accepted
   payload is committed and after a changed query clears prior selection, App
   replaces an empty selection with identities for the first two payload items
   (or all available when fewer than two), using the accepted current
   `positionKey` and its catalog label. This consumes backend order verbatim.
7. Exact share replay suppresses this default until the share-specific empty,
   partner, or analysis state is restored. Same-query refresh with retained
   selection does not overwrite it. Candidate search/sort/order/page/position
   operations use `executeCandidateView`, not the primary-success callback, so
   they never reinitialize selection. Compact layout does not open the Drawer.
8. Mode navigation observes the existing Applied Query. When the target primary
   resource does not match the current revision/query, the coordinator executes
   that accepted query directly rather than revalidating or committing the
   possibly dirty Draft. Existing accepted target resources are reused. The two
   applied-only placeholder sections are removed.
9. Person Inspector shares the ranking toolbar's responsive density: its work
   toolbar passes Naive UI `medium` on desktop and `small` below 780px to Input,
   Select, and the shared direction Button. SortDirectionButton gains an optional
   public size prop while retaining its existing viewport-derived default
   everywhere else. CSS does not target Naive private internals to fake the
   visible height; each 28/34px control keeps a 44px effective hit region.
10. QueryWorkspace detects `Applied Query + !dirty` before coordinator
    execution and returns without changing disclosure. The coordinator's own
    ready same-query guard also clears stale no-op feedback and publishes
    nothing, covering programmatic/retry callers.
11. PositionSelector closes its existing Popover/in-flow browser after a leaf
    activation and restores trigger focus. QueryEditor removes only the visible
    left footer status; the disabled submit label and operation live regions
    continue to announce real pending work.
12. QueryWorkspace exposes an optional reveal mode used only by App's co-star
    first-query empty-state action. It scrolls the document to top, expands the
    editor, applies a 900ms whole-panel attention class, and then focuses the
    established first editor target. Ordinary summary toggles call the same
    method without reveal. Reduced motion uses instant scrolling and zero CSS
    transition while preserving the visible attention state duration.

## Risks / Trade-offs

- Grid-row animation needs an overflow-clipping child; keep the current editor
  boundary and browser-check intermediate height.
- Wider sort control reduces search width; constrained breakpoints already move
  search to its own row and will be checked at compact width.
- Default two-person selection immediately starts analysis through existing
  synchronous selection watchers; tests must await that real request rather
  than add a parallel trigger.
- A share replay is itself a primary candidates request; an explicit replay
  guard is required so `state: empty` remains exact and partner/analysis state
  is not transiently replaced.
- Mode switching while Draft is dirty must not overwrite or submit Draft; the
  applied-query execution path accepts only the immutable current Applied Query.
- A shared direction component serves page and nested toolbars; its optional
  size prop must default to the current behavior so ranking/candidate controls
  do not shrink unexpectedly.

## Oracle and Acceptance

Oracle comparison preserves established tokens, hierarchy, copy, controls, and
responsive topology. The six requested behaviors are intentional deltas.
Acceptance uses focused source/component/integration tests plus rendered
desktop and compact checks for intermediate query height, candidate geometry,
outward focus ring, initial two selected people, closed mobile Drawer, console,
and horizontal overflow.

## Open Questions

None.
