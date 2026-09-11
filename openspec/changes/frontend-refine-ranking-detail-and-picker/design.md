## Context

The current Vue surfaces already own the correct data and request state. The
defects come from two generations of responsive CSS being active together and
from compact co-star selection still using a modal NDrawer. Browser measurements
at 568px show ranking header/value centers separated by more than 200px, a
person-work facts grid ending about 48px before its card edge, and pagination
creating an implicit second grid column. At 961px the selected-people overview
adds 20px padding around children that already own their dividers.

The user explicitly replaces only the compact candidate host. CandidatePicker,
selection ordering, request/view state, result surfaces, desktop rail, and all
backend-authoritative values remain unchanged.

## Goals / Non-Goals

**Goals:**

- Correct the nine annotated layout/interaction defects at their narrow owners.
- Replace the compact bottom picker Drawer with an accessible in-flow accordion
  while reusing the complete CandidatePicker.
- Preserve 44px targets, keyboard focus, responsive state, and clean horizontal
  containment across 568px/961px and the 779/780 boundary.

**Non-Goals:**

- No query, selection, ranking, pagination-event, or person-data semantics.
- No desktop rail redesign, new component library, broad CSS cleanup, backend,
  contract, Archive, operations, Git integration, or production change.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Local specification and implementation |
| Owner | Frontend; primary agent owns shared CSS/topology and acceptance |
| Writable paths | Exact proposal paths and supersession notes only |
| Read-only protected inputs | API/generated contracts, payloads, coordinator/query semantics, Backend/updater/Archive, unrelated files, external state |
| Deletion complement | Preserve data, actions, selected order, removal, retries, pagination, results, desktop rail, dialog label/close, tests |
| Mutable refs | Current dirty worktree only; no Git/external ref |
| Consumes | Current DOM order, CSS grid/container queries, compact media state, CandidatePicker, native disclosure semantics |
| Produces | Aligned layouts, closed facts, stable pagination, matched summaries, in-flow compact picker |
| Dependencies | Existing Vue/Naive/native CSS only; no package |
| Deliverables | Strict specs, source/tests, focused build/browser evidence |
| Acceptance | Nine defects absent; keyboard/focus/overflow preserved; no desktop/data drift |
| Non-goals | Data/API/backend/broad redesign/full gate/lifecycle/deploy |
| Operations deferred | Root sync/archive, complete gate, commit/push/release/deploy |
| Stop/rollback conditions | Request/selection drift, lost focus/recovery, hidden tabbables, overflow, pagination emit drift, desktop regression, failed checks |

Dependency direction remains `App state -> existing responsive host -> existing
CandidatePicker/result components`. Presentation never becomes a data authority.

## Decisions

1. **Repair late-layer grid ownership, not templates.** Give the late compact
   ranking row an explicit one-line `rank avatar identity metrics` area map;
   retain the existing `<=340px` container override for its intended two-line
   layout. Reset shared AdaptivePagination child `grid-column/grid-row` to
   `auto`, allowing DOM order to form rows while higher-specificity consumer
   layouts still win. Pages remain nowrap; tools may wrap.

2. **Stretch the facts grid at its owner.** `person-work-row__facts` explicitly
   restores `justify-self: stretch`, neutralizing the older generic
   `.person-item__scores` compact rule without altering role columns or markup.
   This closes both the empty right edge and truncated divider.

3. **Use close-only compact detail chrome.** Remove only the visible strong
   title, keep `role=dialog`, `aria-label=人物详情`, the 52px bar, focus trap,
   scroll lock, and close action, and align that action to the inline end.

4. **Reuse CandidatePicker in an in-flow disclosure.** Remove NDrawer,
   teleport, focus trap, app-root inerting, scroll lock, and wheel containment.
   The persistent compact summary is the accordion button. Its controlled panel
   renders CandidatePicker in document flow and uses the existing query-panel
   160ms-open/120ms-close motion vocabulary. No candidate behavior is forked.

5. **Keep focus transitions explicit.** Summary activation toggles without
   moving focus; an analysis empty-state activation opens and focuses candidate
   search; Escape closes to the persistent summary. Desktop-to-compact rail
   focus transfers to the closed summary. Compact-to-desktop panel/summary focus
   transfers to desktop search. External focus is never stolen.

6. **Match summary geometry without fixed truncation.** Compact selected-person
   summary uses 12px name/role type, a 28px visible action inside a 44px target,
   and border-box sizing like Query Summary. Single-line states match at 44px;
   long content remains allowed to wrap and grow. Query separator pseudo-content
   explicitly uses weight 400 while values remain 600.

7. **Remove only selected-overview outer padding.** The selected cards and
   summary grid already own their internal spacing/dividers, so the desktop
   `selected-people-panel` padding becomes zero without changing other analysis
   sections.

## Risks / Trade-offs

- **Accordion content becomes tall** → it remains normal page flow, preserves
  component-tier scrolling where already owned, and introduces no second shell
  scroll trap.
- **Compact focus falls to body during topology change** → capture ownership
  synchronously before branch replacement and focus only the equivalent mounted
  control after the next render.
- **Shared pagination reset affects other consumers** → reset placement to auto
  only on project-owned classes; ranking/candidate higher-specificity layouts
  and event owners remain unchanged and receive focused tests.
- **Title removal reduces dialog identity visually** → the person profile is the
  visible identity and the dialog retains its accessible name and close action.
- **Summary equality breaks on long copy** → equality is required only for
  one-line content; DESIGN wrapping remains authoritative.

## Migration Plan

Add exact supersession notes to older active Drawer/title owners, strict-validate,
then implement shared CSS, person chrome, and compact accordion slices. Run
focused tests/typecheck/build/detector/diff and Browser checks at 568px, 961px,
779px, and 780px. Roll back only the exact owned hunks if a stop condition is
hit. Root sync/archive and all integration/deployment states remain deferred.

## Open Questions

None.
