# Design QA — 共演分析人物卡片响应式列表

final result: passed

## Source and implementation

- Source visual truth: `artifacts/person-card-narrow-audit-2026-07-21/01-three-people-516-before.jpg`
- Implementation screenshot: `artifacts/person-card-narrow-audit-2026-07-21/02-three-people-516-after.jpg`
- Full-view same-state comparison: `artifacts/person-card-narrow-audit-2026-07-21/03-three-people-516-comparison.jpg`
- Focused comparison: the full 516 × 712 capture is also the focused comparison because the audited Hero, summary, and following section are all legible in one viewport; a crop would remove the surrounding alignment evidence.
- Additional responsive evidence:
  - `artifacts/person-card-narrow-audit-2026-07-21/04-five-people-516-after.jpg`
  - `artifacts/person-card-narrow-audit-2026-07-21/05-six-people-516-after.jpg`
  - `artifacts/person-card-narrow-audit-2026-07-21/06-six-people-320-after.jpg`
  - `artifacts/person-card-narrow-audit-2026-07-21/07-five-people-1024-after.jpg`
- Primary state: dark theme, 共演分析, 佐仓绫音 / 花田十辉 / 藤泽庆昌, viewport 516 × 712.

## Comparison and iteration history

1. Baseline — failed: the `max-width: 519px` rule fixed two 180px portrait tracks at the left edge. At a 474px stage this left about 112px unused on the right, placed the third portrait at row 2 column 1, and limited the summary to the same narrow track width.
2. First correction — partial: compact groups moved to a centered wrapping collection and the summary became a full-width flex row. The 516px three-person state became one `3` row with 156.664 × 208.883 portraits.
3. Generalized audit — found two adjacent defects: the `<360px` single-column rule lost to the earlier selector's specificity, and the linked five-person `3 + 2` layout left its second row aligned to the left at `≥640px`.
4. Final correction — passed: sub-360 cards now use one centered 240px column; linked groups use the same wrapping card/connector flow with explicit zero-height row breaks, so every incomplete row centers without stretching cards. Four-person `2 × 2` cards also scale continuously into the 600px central-connector topology.

## Responsive matrix verified in the in-app Browser

| State | Relationship container / viewport | Topology | Card size | Result |
|---|---|---|---:|---|
| 3 people | 474px / 516 × 712 | `3` | 156.664 × 208.883 | passed |
| 4 people | 474px / 516 × 712 | `2 + 2` | 180 × 240 | passed |
| 5 people | 474px / 516 × 712 | `3 + 2`, final row centered | 156.664 × 208.883 | passed |
| 6 people | 474px / 516 × 712 | `3 + 3` | 156.664 × 208.883 | passed |
| 6 people | 278px / 320 × 712 | six centered single rows | 240 × 320 | passed |
| 5 people | 644px / 1024 × 768 | linked `3 + 2`, final-row offsets 62px / 62px | 180 × 240 | passed |
| 6 people | 644px / 1024 × 768 | linked `3 + 3` | 180 × 240 | passed |

All measured cards retained a `0.75` width/height ratio and two visible profile metrics. Stage and page horizontal overflow were zero. The summary matched the stage content edges in every measured state.

## Fidelity surfaces

- Typography: existing sizes, weights, wrapping, and localized text were retained. Names, roles, values, and labels remained readable in the accepted captures.
- Spacing and layout: card widths are capacity-driven and bounded; incomplete rows center but never stretch. The summary owns a full row, and no new outer container or nested border was added.
- Colors and surfaces: existing semantic surface, divider, text, and primary tokens were retained. No palette change was introduced.
- Images: original person images and crops were retained. Media height continues to derive only from the 3:4 portrait ratio.
- Copy and information hierarchy: no copy or metric was hidden. Profile cards keep value-over-label metrics and the shared summary keeps its existing number-first, label-second grid.
- Decorative relationships: connectors remain non-interactive and `aria-hidden`; the `×` node scales inside its real connector slot. Row-break connectors occupy no visual height.

## Interaction, accessibility, and console checks

- Added and removed profiles through the rendered picker/rail controls while checking 3, 4, 5, and 6-person states.
- Every card remains a semantic `article` with a level-two person heading. Connector marks remain decorative and pointer-inert.
- The final verification window began at `2026-07-21T09:05:01.577Z`; it emitted zero new console warnings or errors. Older Vite debug entries were excluded.
- The Impeccable layout detector returned zero findings for the five scoped production files after the fix.

## Automated verification

- Targeted component suite: 3 files, 18 tests passed.
- Full frontend unit suite: 32 files, 152 tests passed.
- Production build: passed, including Naive UI CSS boundary validation, Vue type checking, and Vite build.
- Scoped `git diff --check`: passed.
- The existing Vite chunk-size advisory remains informational and unrelated to this layout.

## Evidence limits

- Visual QA covers the dark theme and the recorded 320px, 516px, and 1024px states.
- Browser semantics and role-based interactions were checked, but this run did not include a screen-reader session, forced-colors mode, or 200–400% text-only zoom.
- Scope is the relationship Hero portrait flow, connectors, and attached summary; unrelated workbench surfaces were not re-audited.
