## Compatibility Rule

For every existing surface, the oracle controls visible geometry, typography,
color, hierarchy, responsive transitions, control presentation, animation,
copy, and interaction. Formal code may use a different component structure,
but users must not perceive a redesign.

The following production additions remain:

- dynamic catalog and strict API-backed data;
- real pending, empty, error, retry, and cancellation behavior;
- versioned share actions and collection refresh where already approved;
- accessibility requirements from `DESIGN.md`, including a minimum 44px hit
  area implemented with invisible hit geometry when the oracle's visible
  control is smaller.

## Repair Surfaces

1. Header and query editor: restore the oracle brand line, header proportions,
   icon/button presentation, Naive control appearance, chips, help affordances,
   and expand/collapse behavior without changing query semantics.
2. Ranking: restore summary/toolbar/table/list/pagination geometry and all
   desktop/mobile state presentations without changing server authority.
3. Person inspector: restore profile hierarchy, tags, charts, item browser,
   Drawer mask/panel treatment, and focus/Escape/background-inert behavior
   without changing person-detail DTOs or request ownership.
   Closing the compact Drawer changes only its local open state and preserves
   the selected person and accepted detail. Profile identity copy derives its
   position line from the accepted query rather than the current server page.
   Timeline points and overflowed character appearances retain oracle-visible
   geometry while exposing keyboard/touch-accessible hit and disclosure
   targets.
   Deferred person-detail code may preload after ranking data arrives, but its
   loading/error state is not a ranking result and SHALL remain visually absent
   until a person is selected (and, on compact layouts, its Drawer is open).
   Selecting a person then exposes the local real loading/error state without
   replacing the ranking surface.

## Implementation Constraints

- Prefer the oracle's existing markup/style patterns where compatible, but
  keep the formal feature boundaries and production state ownership.
- Keep cross-surface public Naive theme restoration in the app provider (or
  one app-owned override module); use feature-local overrides only for
  genuinely surface-specific control geometry.
- Do not duplicate prototype fixtures, local statistics, or upstream calls.
- Do not touch active co-star-owned files until explicit handoff. If a shared
  presentational file is needed, sequence ownership rather than merging
  overlapping edits.
- Regression tests should assert durable visible/behavioral contracts, not
  private component structure that blocks safe refactoring.
