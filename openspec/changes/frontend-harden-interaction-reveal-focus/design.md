## Context

The app already has correct latest-only data state, responsive surfaces, focus
traps, and several one-off attention rings. Residual defects arise when a
control updates content above itself or replaces its own component: the data is
correct, but target visibility/focus is not owned consistently. Desktop and
compact routes have different scroll owners, so AdaptivePagination cannot infer
the target.

## Goals / Non-Goals

**Goals:** one reveal protocol; accepted pagination reveal across five consumers;
selector-like compact catalog/breakpoint safety; candidate rail and topology
focus; locator attention; removal focus recovery; 28px visible and 44px
effective compact targets.

**Non-Goals:** request/data semantics, auto-opening unrelated surfaces, visible
control-size changes, global page animation, dependency additions, or deployment.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Local focused implementation; accumulated full gate deferred |
| Owner | Frontend interaction/focus layer; primary agent accepts |
| Writable paths | Exact proposal paths and explicit older-change transfers |
| Read-only protected inputs | API/contracts/statistics/query semantics, Backend/updater/Archive, external state |
| Deletion complement | Preserve controls/results/actions/tests; remove only orphan CSS/follower ownership |
| Mutable refs | Current local worktree only |
| Consumes | Accepted view responses, stable regions, focus token, reduced-motion, Naive public APIs |
| Produces | Shared reveal helper, focus-safe topology, compact catalog/targets |
| Dependencies | Existing Vue/Naive/native DOM; no package |
| Deliverables | Source/tests/spec/build/detector/browser evidence |
| Acceptance | All audited P1/P2 routes reveal/focus without overflow or data drift |
| Non-goals | Data/route/restyle/dependency/deploy changes |
| Operations deferred | Full gate, sync/archive, Git integration, release/deploy |
| Stop/rollback conditions | Request timing, focus trap, selection, overflow, visual, or test regression |

Dependency direction remains `accepted component action -> owning result
component -> shared DOM-only reveal helper`. The helper never starts requests,
chooses data, or guesses another component's target.

## Decisions

1. A shared composable owns only `target ref + attention timer + reduced-motion
   scroll/focus`. Consumers call it after an awaited accepted view response.
   Scroll uses `scrollIntoView` so document, Inspector, and Drawer owners are
   handled natively; target CSS supplies sticky-header scroll margin.
2. Result targets are semantic regions with `tabindex=-1`. Reveal scrolls first,
   then focuses with `preventScroll`, and never blurs when attention expires.
   Attention lasts 900ms; reduced motion removes interpolation, not focus/state.
3. Pagination remains a pure emitter. RankingResults, CandidatePicker,
   PartnersSurface, PersonItemBrowser, and CoStarWorkBrowser each await their
   existing execute function and reveal only on `true`. Search/sort remains
   focus-preserving and does not force scroll.
4. PersonItemBrowser receives the existing execute function as a prop so it can
   observe acceptance; it no longer relies on a fire-and-forget Vue event for
   pagination. This does not create a request owner.
5. PositionSelector uses one Naive UI NPopover/body portal at desktop and
   compact widths. Disclosure overlays and never participates in Query Workspace
   layout. The Popover starts at `bottom-start` and retains Naive viewport-aware
   flip/shift; compact catalog list height is the measured Naive small-menu
   maximum, 212.8px.
   The trigger's inline combobox owns filtering and the panel contains only
   results/categories. Close and breakpoint changes clear both panel and filter;
   `display-directive="if"` removes the dialog/follower. The panel clips its
   scrolling descendants to a Naive-aligned 6px outer radius. The catalog adds
   no attention/focus border or halo: trigger focus remains the single Naive-like
   focus state and the menu uses the neutral Naive menu shadow. Typing retains
   input focus; ArrowDown enters the first available result/category without a
   second arrow-only outline.
   Option rows consume the same size variables as Naive menus: compact 28px,
   desktop 34px, 14/21px type, `0 12px` padding, square contiguous outer rows,
   and no inter-row gap. Their hover/focus/selected-pending layer follows the
   installed Naive 2.44.1 implementation: 4px inline inset, 6px radius, and a
   300ms `cubic-bezier(.4, 0, .2, 1)` background fade. Static selection uses
   brand text/check without a filled row. Category disclosure rows intentionally
   keep primary labels and add 4px block padding beyond the option height (36px
   compact / 42px desktop); counts/arrows remain tertiary. Search context stays
   visible inline and truncates rather than creating a taller two-line option.
6. Desktop candidate empty action scrolls/focuses candidate search. Partners
   activation includes its trigger; the stable CoStarWorkspace analysis region
   receives focus/attention while the new surface loads. Removal actions restore
   the nearest surviving identity/person control or persistent picker entry.
7. Preference locators keep exact server search and input focus, adding the same
   work-browser attention. Compact form surfaces, including PositionSelector,
   stay Naive `small` at 28px visibly and expand effective hit geometry to 44px
   through their owning interactive regions. Search belongs to the selector
   trigger rather than a second panel field.

Alternatives rejected: putting scroll logic in AdaptivePagination cannot know
the owner; focusing the first row can trigger actions; time-based scrolling
before response races stale/latest-only state; an in-flow compact catalog
changes parent geometry; two responsive Popovers or a disabled retained Popover
can leak stale followers and duplicate panel ownership.

## Risks / Trade-offs

- **Concurrent view request becomes stale** -> reveal only when execute returns true.
- **Target unmounts during reveal** -> shared helper null-checks and stable owner
  regions handle topology changes.
- **Focus rings mistaken for validation** -> whole-region neutral focus color,
  short duration, no error token or copy.
- **Keyboard removal has no survivor** -> deterministic fallback to tray header/
  persistent mobile entry; never body by design.
- **Breakpoint transition duplicates panel** -> close synchronously before branch
  replacement and assert ID count <=1.

## Migration Plan

First reconcile older active delta ownership and split competing requirement
titles. Implement shared helper/consumers, then compact selector/touch targets,
then topology/removal/locator paths. Run focused tests and browser matrix at
390/779/780/961 plus clean dynamic 780→390. Full gate, sync/archive, Git and
deployment remain deferred. Rollback restores only declared Frontend paths.

## Open Questions

None.
