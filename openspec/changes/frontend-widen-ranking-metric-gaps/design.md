## Context

The personal ranking list uses one outer grid for rank, avatar, identity, and
metrics, then one shared inner grid selector for both metric labels and metric
values. At the reported 893px viewport, the inner grid is 154.39px wide with
tracks of `36.80 / 36.80 / 36.80 / 40px`, no column gap, and only 0.59px of
room after the `10.00` glyphs. The header and every row are currently aligned,
but the lack of a deliberate interval makes adjacent values read as one token.

This is an Operate-surface refinement: the reading path remains rank -> person
identity -> comparable metrics, density remains high, and only the spacing
inside the metric group changes. `PRODUCT.md`, `DESIGN.md`, the route surface
brief, the existing Vue markup, and the accepted OpenSpec remain controlling
inputs. The user's browser comments authorize the intentional delta from the
otherwise preserved oracle appearance.

| Boundary | Declaration |
|---|---|
| Status | Reviewed small-correction design; implementation starts only after all artifacts are strict-valid and the main-agent review records zero P0/P1 planning findings. |
| Owner | Frontend / `frontend-ranking-results`. |
| Writable paths | `openspec/changes/frontend-widen-ranking-metric-gaps/**`; `openspec/changes/archive/2026-09-02-frontend-widen-ranking-metric-gaps/**`; `openspec/specs/frontend-ranking-results/spec.md`; `frontend/src/shared/styles/base.css`; `frontend/tests/shared/ranking-layout.test.ts`; only the exact persistent-file inventory entry in `frontend/scripts/check-architecture.mjs`. |
| Read-only protected inputs | `PRODUCT.md`; `DESIGN.md`; `.impeccable/design.json`; `.impeccable/surfaces/route.md`; `frontend/src/features/ranking/components/RankedPersonList.vue`; `frontend/ARCHITECTURE.md`; all `openspec/specs/**` except the exact writable `openspec/specs/frontend-ranking-results/spec.md`; contracts/backend/updater/operations; oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`. |
| Deletion complement | No deletion, rename, or generated output except the verified OpenSpec archive move from the active path to the exact dated archive path; no edit outside the exact writable paths. |
| Mutable refs | Local `codex/widen-ranking-metric-gaps` only. |
| Consumes | Existing ranking markup, spacing scale, personal/global class states, container reflow, and supplied rendered evidence. |
| Produces | One shared metric-track definition used by header and rows, one source regression test, and local acceptance evidence. |
| Dependencies | `frontend-ranking-results` -> this correction; the implementation consumes but does not modify `frontend-design-system`, `frontend-accessibility`, and `frontend-oracle-fidelity`. No reverse dependency or cross-component write is introduced. |
| Deliverables | Strict-valid OpenSpec, bounded CSS/test diff, focused/full frontend results, clean detector output, responsive Browser measurements/screenshots, synced accepted spec, and archived completed change. |
| Acceptance | Strict OpenSpec; focused Vitest; `npm run check`; `git diff --check`; Impeccable layout detector; rendered 893, 780, 781, 380, 381, and mobile checks with aligned labels/values, positive inter-column spacing, and no page overflow. |
| Non-goals | Metric data/formatting/copy, row behavior, toolbar, person detail, co-star, theme, page-level breakpoint architecture, component markup, and new dependencies. |
| Operations deferred | No repository deployment definitions, isolated host validation, live activation, rollback execution, legacy retirement, push, PR, merge, release, or deployment. |
| Stop/rollback conditions | Stop for authority or ownership conflict, overlapping dirty paths, validation failure, header/row divergence, overflow, or scope expansion. Roll back only the exact added/changed hunks; never use destructive cleanup. |

## Goals / Non-Goals

**Goals:**

- Give both decimal score tracks enough intrinsic room for the rendered
  `10.00` reference and the signed preference track enough room for `+10.00`,
  while preserving the existing tabular-number typography.
- Insert one spacing-scale step between adjacent metrics so values remain
  distinct at the reported intermediate width.
- Keep the metric header and row values on the identical shared grid in both
  personal and global ranking states.
- Preserve container-query reflow and page-level overflow guarantees.

**Non-Goals:**

- Do not change the metric formatter, data source, order, labels, or semantic
  summary.
- Do not redesign the row, reduce information density, or change page-level
  breakpoints.
- Do not add JavaScript measurement, new markup, packages, or dependencies.

## Decisions

### Use the existing shared header/row selector as the single owner

Both `.ranking-columns__metrics` and `.ranked-person-row__metrics` will receive
one ranking-scoped override after the current shared rule. The override will
define a 24px count track, two 40px minimum decimal score tracks, a 48px signed
preference track, and `var(--space-2)` (8px) column gaps. With the existing 4px
leading inset, the personal grid's minimum is
`4 + 24 + (2 * 40) + 48 + (3 * 8) = 180px`.

The existing unscoped shared rule remains unchanged so the co-star partner
surface retains its current layout. The ranking-specific header and row
selectors are still combined, preventing two spacing owners.

Alternative considered: add margins to individual row values and separately
mirror them in the header. Rejected because two spacing owners can drift and
because margins do not participate in grid sizing.

### Increase only the outer metric minimum, not its wide-layout proportion

The final outer track changes from `minmax(144px, 40%)` to
`minmax(180px, 40%)`. This guarantees the inner minimum at constrained
single-row widths while preserving the current 40% proportion whenever the
pane is wide enough. The existing two-row container layout moves from a 340px
to a 380px maximum so constrained mobile panes reflow before the larger metric
minimum unduly compresses the person identity.

The pre-existing mobile base layer leaves a two-row `grid-template-areas` value
on ranking rows even after the pane grows beyond that container threshold. A
complementary `width > 380px` ranking-only container rule will explicitly
restore the row's single-line `rank avatar identity metrics` areas, so its
named children occupy the same four tracks as the header's source-ordered
children. Clearing only the container areas is insufficient because the
pre-existing named child placements would otherwise create implicit columns.

Alternative considered: increase the percentage without moving the container
threshold. Rejected because it would unnecessarily reduce identity space at
wide sizes and leave a compressed one-row interval just above 340px.

### Lock the layout contract with a focused source test and rendered geometry

A small test will assert that the outer minimum, ranking-only shared selectors,
count/score/preference tracks, tokenized column gap, paired container queries,
and the wide-side single-row area mapping
remain co-owned. The new persistent test file will be added to the existing
exact architecture inventory without changing any other architecture rule.
Browser acceptance will measure label/value left-edge alignment, positive glyph separation, and page
`scrollWidth <= clientWidth + 1` at representative widths.

Alternative considered: snapshot the whole stylesheet or component. Rejected
because it would be noisy and would not directly encode the regression.

### Oracle comparison boundary

The markup, labels, typography, order, row hierarchy, interactions, and
responsive topology are preservation evidence against oracle commit
`644b7748674e553f863d0ffd61d029f86fdc0717`. The increased metric minimum, 8px
inner gaps, and corresponding narrow-container threshold are the sole
intentional delta, authorized by the user's
two browser comments and consistent with `DESIGN.md`'s dense-but-readable
spacing guidance. There is no new capability.

## Risks / Trade-offs

- [Long person names lose up to 26px at constrained one-row widths] -> Keep the
  existing ellipsis/title behavior and verify 780/781/893px; the <=380px
  container reflows metrics to a second row before identity space collapses.
- [A fixed numeric minimum may be insufficient for an impossible formatter
  expansion] -> Scope the contract to the accepted two-decimal formats and
  verify the requested `10.00` reference plus signed preference output.
- [Personal and global grids could diverge later] -> Keep selectors combined
  and assert the shared rule in the focused test.
- [A CSS-only test could pass while rendering regresses] -> Pair it with live
  DOM geometry, screenshots, console checks, and overflow measurements.

## Migration Plan

No data or runtime migration is required. Apply the bounded CSS and test hunks,
run local acceptance, sync the accepted delta, and archive the completed change.
Integration/deployment remain deferred. Reversal is the exact removal of these
hunks if acceptance fails before archival.

## Open Questions

None. The requested spacing amount is derived from the existing 8px design
token and the measured `10.00` reference width.
