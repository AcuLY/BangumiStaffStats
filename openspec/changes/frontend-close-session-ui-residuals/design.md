## Context

The current app contains the intended components and state paths, but several
later fixes stopped at an outer wrapper or one tested transition. Live audits at
352/375/636/779/780/961 exposed failures that source-level assertions missed:
the position panel can render fully below the viewport, toolbar borders resolve
to mixed sizes, duplicate feedback has two DOM owners, Naive pagination items
are pointer-only DIVs, responsive co-star topology unmounts the focused node,
the loading profile differs from the final profile, and PositionSelector’s
custom trigger resolves generic surface/tertiary tokens instead of the adjacent
Naive Select’s control, placeholder, and suffix roles.

## Goals / Non-Goals

**Goals:**

- Close every confirmed Frontend residual from the session with one testable
  owner and rendered evidence.
- Preserve the accepted query, ranking, person-detail, candidate, and co-star
  data/state semantics.
- Fix shared causes once: AdaptivePagination for five consumers, ranking toolbar
  geometry at its owner, and responsive focus at CoStarWorkspace.
- Make the custom PositionSelector trigger consume one project-owned mapping of
  the same resolved Light/Dark roles as Naive Select, without selecting private
  Naive DOM or variables.
- Express multi-position intent through Naive DynamicInput rows rather than
  tags inside one multi-selector; preserve the existing ordered query array.

**Non-Goals:**

- Backend/image performance, new data behavior, dependency changes, redesign,
  full accumulated gate, lifecycle, or production operations.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Ten residuals implemented and focused-verified |
| Owner | Frontend interaction/presentation layer; primary agent accepts |
| Writable paths | Exact proposal paths and this change only |
| Read-only protected inputs | API/generated contracts, statistics/query semantics, candidate order/limits, final profile data, Backend/updater/Archive, external state |
| Deletion complement | Preserve all fields, results, actions, recovery copy, pagination functions, selection state, and tests |
| Mutable refs | Current dirty worktree only |
| Consumes | Naive public Popover/Pagination render APIs, compact media state, nullable candidate input, final profile geometry, focus/touch tokens |
| Produces | Ten verified residual corrections |
| Dependencies | Existing Vue 3/Naive UI/native DOM; no package |
| Deliverables | Code/docs/tests, strict OpenSpec, focused checks and browser matrix |
| Acceptance | Every proposal bullet has automated plus rendered evidence; no new P0/P1 |
| Non-goals | Backend/performance/image transport, schema/data semantics, broad restyle/deploy |
| Operations deferred | Full gate, sync/archive, Git integration, release/deploy/host mutation |
| Stop/rollback conditions | Request/state drift, hidden feedback, pointer-only pagination, focus-to-body, overflow, selection drift, skeleton mismatch, or unrelated churn |

Dependency direction remains `accepted state -> existing component owner ->
public Naive/native interaction primitive`. Presentation fixes never compute or
reinterpret backend data.

## Decisions

1. **Restore NPopover flip instead of scrolling the page.** Remove the later
   `flip=false` override and let Naive’s public follower place the bounded menu
   above or below the trigger. The menu remains one body portal and does not
   affect Query Workspace height. This matches ordinary selector behavior and
   avoids a custom placement engine.

2. **Separate visible size from touch target when controls render.** Ranking Input/Select/Button use
   public medium 34px at desktop and small 28px below 780px. Pseudo hit regions
   extend the owning controls to at least 44px without changing their visible
   borders or row geometry. This replaces the current outer `min-height:44px`
   rule that enlarges only two controls.

3. **Suppress only duplicated primary feedback.** QueryEditor remains the
   contextual owner for current ranking/candidate error or cancel copy while it
   is open. App’s global feedback and the matching RankingResults/CandidatePicker
   message projection are suppressed together; their state title and retry
   action remain. Child operations and states without the same local owner stay
   global. The coordinator remains the state authority and no recovery state is
   deleted.

4. **Use Naive’s public pagination render functions.** AdaptivePagination
   supplies native button content through `prev`, `next`, and `label`. Button
   clicks bubble to Naive’s existing page logic, while Enter/Space become native
   keyboard activation. Public pagination theme overrides set 28/34px visible
   items and enough item margin for adjacent 44px button hit regions to meet
   without overlap; no private `.n-*` selector/event patch or per-consumer fork
   is introduced.

5. **Transfer focus before responsive topology disappears.** On desktop→compact,
   capture whether focus is inside the rail, close/replace the branch, then focus
   the persistent compact entry without opening Drawer. On compact→desktop,
   close Drawer, wait for the rail, and focus candidate search when the removed
   Drawer owned focus. Unrelated external focus is not moved.

6. **Distinguish nullable value from missing value.** CandidatePicker checks
   whether `resource.input.positionKey` is defined, not nullish. Explicit null
   therefore remains “全部职位” during pending/stale-payload transitions. A stale
   single-position range/count is replaced by an explicit pending unknown until
   the all-position payload arrives. Query help states that all selected
   positions contribute to one mixed default candidate view.

7. **Make skeleton consume final geometry.** PersonDetailSkeleton uses the same
   top-aligned intro grid and 160×213 flush portrait on desktop and wider compact
   Drawers. At 520px and below it switches with PersonProfile to 96×128 plus the
   16px profile inset. Every compact Drawer portrait is square. Skeleton-only
   centering, rounding, and breakpoint-wide inset drift are removed.

8. **Map public Naive Select roles into project tokens.** PositionSelector uses
   project-owned Light/Dark values equivalent to the adjacent Naive Select for
   control background, default outline, text, placeholder, suffix icon, hover
   boundary, and focus shadow. The custom filter keeps native input semantics,
   while the suffix button remains a 44px target without a visual divider or
   independent hover fill. Info/help icons retain their separate readable-help
   role. No `.n-*` selector or `--n-*` variable becomes an implementation
   dependency.

9. **Use DynamicInput rows as the multi-value affordance.** PositionSelector
   keeps a local list of stable row records backed by Naive DynamicInput with
   `min=1`. Each row owns one filterable hierarchical selector and replaces
   only its own value; creating/removing/reordering rows projects the non-null
   row values into the existing ordered `positionKeys` array. An empty row is
   valid editing state but not a submitted position. Positions selected in
   other rows are disabled in the active catalog so duplicate keys cannot be
   emitted. Only one row Popover may be open; removal/breakpoint changes close
   it and restore or transfer focus safely. Both modes use “职位”, “选择职位”.
   Mode-specific position semantics remain in the title Info help, while the
   duplicate visible helper line is removed. Public DynamicInput slots provide create/
   remove actions with 44px project click height; no private DynamicInput DOM is
   styled.

10. **Preserve compact menu chrome and default rectangular actions.** Remove
    trigger-width locking but cap PositionCatalogBrowser at the prior 480px
    content width, clamp it to the viewport shell, and keep vertical-only
    scrolling. The browser itself retains the established Naive-equivalent
    6px radius/background/menu shadow; public Popover theme overrides remove
    only the duplicate raw-wrapper shadow that otherwise draws a square layer
    outside it. DynamicInput’s action slot renders ordinary default Naive
    Buttons without `circle`, `quaternary`, or `secondary`; each visible and
    horizontal interaction surface is square at 28/34px with a 44px click
    height. The row uses a start-aligned flex flow: selector `flex: 1 1 0`,
    action group `flex: 0 0 auto`, no `space-between`. The selector-to-actions
    gap and the gap between the two actions both use the shared 8px spacing
    token, while the last action remains flush to the zero-inset right edge.
    No private DOM is selected.

## Risks / Trade-offs

- **Popover flips over earlier fields** -> bounded list and Naive follower own
  placement; verify trigger remains visible and Escape/outside behavior holds.
- **Expanded targets approach adjacent controls** -> toolbar gaps and public
  pagination item margins keep 44px hit regions non-overlapping; measure both
  compact and desktop hit maps.
- **Pagination nested rendering changes styling** -> reset only the project-owned
  inner button and preserve Naive active/disabled outer classes.
- **Responsive focus moves unexpectedly** -> transfer only when the disappearing
  rail/Drawer branch currently contains `activeElement`.
- **Feedback suppression hides child errors** -> compare operation/message against
  the current primary resource; keep all nonmatching feedback global.
- **Skeleton rules drift again** -> rendered geometry tests compare skeleton and
  final profile at desktop and compact widths.
- **Naive defaults change later** -> focused Light/Dark computed-style evidence
  compares the custom trigger with an adjacent public Select and localizes the
  mapping in semantic project tokens.
- **Dynamic rows drift from parent Draft** -> reconcile external model changes
  by ordered key equality, preserve stable local row ids during local echoes,
  and cover undo/reset plus add/remove/select sequences in focused tests.
- **Content-width menu collides with viewport edge** -> use the existing public
  flip/shift follower plus a `calc(100dvw - 24px)` maximum and verify desktop/
  compact bounds directly.
- **Explicit action gaps squeeze the compact selector** -> keep the selector
  track shrinkable and flexed, reserve the two size-matched square actions plus
  one 8px internal gap, and verify the additional 8px group separation at 352px
  without page overflow or target overlap.

## Migration Plan

Reconcile ownership notes, strict-validate, then implement shared pagination and
independent component slices. Run focused tests/typecheck/build/detector/diff,
followed by 352/390/636/779/780/961 browser checks. Roll back only exact changed
Frontend hunks if any stop condition appears. Root sync/archive, Git, and deploy
remain deferred.

## Open Questions

None.
