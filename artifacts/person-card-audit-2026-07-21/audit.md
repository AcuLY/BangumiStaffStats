# Product Design Audit — 共演分析人物卡片列表

## Scope

The audit covers the selected-person portrait list in the co-star relationship hero, its decorative connectors, the attached metric summary, and the responsive transitions that alter row topology. It does not cover candidate-list semantics, ranking rows, or the downstream shared-work browser.

## Flow evidence

1. **Baseline consistency check — needs correction.** Five people at `1024 × 768` rendered as `2 + 2 + 1`; card width jumped to 240px and the last card occupied a visually isolated third row. Evidence: `02-five-people-1024-baseline.png`.
2. **Same-state before/after comparison — healthy.** Five people now render as `3 + 2`, keep the same card width on both rows, and preserve the third slot as empty instead of stretching the last row. Evidence: `16-five-people-before-after-comparison.jpg`.
3. **Desktop population matrix — healthy.** Three, five, and six people share a three-card row capacity; four people intentionally retain the symmetric `2 × 2` hub until a full four-card row can fit. Evidence: `19-three-people-1024-final.jpg`, `10-four-people-1024-final.png`, `17-five-people-1024-final.jpg`, and `15-six-people-1024-final.jpg`.
4. **Mobile reflow — healthy.** At 406px the list uses two 180px cards per row; at 320px it becomes one centered 240px column. Card metrics remain visible, and no page-level horizontal overflow was measured. Evidence: `13-three-people-406-final.png`, `12-six-people-406-final.png`, and `14-three-people-320-final.jpg`.
5. **Wide-screen density — healthy.** The analysis dashboard remains capped at 1440px and dense-group cards stop at 240px, preventing the portraits and connector marks from scaling with unused viewport space. Five people use one complete row when it actually fits; six people retain the three-column flow. Evidence: `18-five-people-2560-final.jpg` and `11-six-people-2560-final.png`.

## What works well

- The 3:4 portrait ratio is now a single invariant; no independent max-height competes with the image ratio.
- Capacity, not person-count patches, determines the normal dense-group layout.
- Connector size responds to its slot and the current topology. A wrapped row never displays a connector to the next row.
- The last incomplete row retains empty grid positions, so its cards never expand.
- The portrait scrim, modest two-level text shadow, and brighter secondary labels improve legibility without making every element glow.
- The metric summary follows the established ranking-inspector hierarchy: number first, explanation below, left aligned, fixed cell width per row.

## UX and accessibility findings

| Severity | Finding | Resolution |
|---|---|---|
| P1 | Narrow cards removed collection-count and average-score content. | Resolved: metric hiding was deleted; the list now reflows before content has to disappear. |
| P2 | Five people followed a different sizing system from six people. | Resolved: all dense groups use the shared compact three-track flow when capacity permits. |
| P2 | Dense-group portraits could grow to 260px on wide screens. | Resolved: 260px is reserved for two- and three-person feature states; dense groups cap at 240px. |
| P2 | Connector size and visibility were tied to exact counts. | Resolved: slot-based sizing and row-boundary suppression replace count-specific dimensions. |
| P2 | Long names or combined roles had no explicit wrap boundary. | Resolved: heading and role copy now allow safe wrapping within the fixed-ratio card. |
| P3 | All eager images had the same network priority. | Resolved: only the first two portrait images receive high fetch priority. |

No open P0, P1, or P2 finding remains in this bounded surface.

## Accessibility strengths

- Semantic articles and headings expose each person as a distinct content unit.
- Decorative connector graphics and portrait imagery do not add redundant accessible names.
- The summary remains a definition list and preserves a consistent reading order.
- The responsive implementation reflows without horizontal page scrolling at the tested 320px minimum.
- Content is not removed solely because the card container becomes narrow.
- The 599–644px boundary sweep kept cards at `180 × 240`; the 640px transition changes topology without a reverse size jump.

## Evidence limits

- The audit used rendered screenshots, computed browser geometry, DOM structure, and source review. It did not run a screen reader, forced-colors mode, reduced-motion mode, or text-only zoom above 100%.
- The portrait-list cards are informational rather than interactive, so keyboard-action testing applies to the separate person picker and is outside this audit.
- Historic console warnings from hot reload and unrelated role tags were present in the long-lived development tab. A fresh post-build five-to-six transition produced no new warning or error.

## Saved evidence

All screenshots and comparison artifacts are saved in `artifacts/person-card-audit-2026-07-21/`. The implementation QA summary is saved at the repository root as `design-qa.md`.
