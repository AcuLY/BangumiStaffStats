# Product audit — relationship Hero portrait flow

## Audited journey

1. **Open 共演分析 with the original three-person selection — unhealthy before, healthy after.** At 516 × 712 the baseline left a large empty area on the right because two fixed 180px tracks occupied only part of the stage. The accepted result uses all available width with three equal 3:4 cards and a full-width summary.
2. **Expand from three to four people — healthy.** The deliberate `2 + 2` topology remains centered at 180 × 240 per card; the second row does not stretch and the summary retains the full stage width.
3. **Expand to five people — healthy.** At 516px the result is `3 + 2` with the final row centered. At a 644px relationship container it becomes the linked `3 + 2` flow with equal 62px final-row side offsets and a bounded central `×` connector.
4. **Expand to six people — healthy.** The compact state is `3 + 3`; at 1024px the linked state remains `3 + 3`. All six cards retain two metrics and the 3:4 ratio.
5. **Reduce below 360px — healthy.** At 320 × 712, six cards form six centered 240 × 320 rows. No metric is removed and no horizontal overflow is introduced.
6. **Return to the requested state — healthy.** The Browser was restored to 516 × 712, the original three people, closed picker, zero scroll offset, and zero horizontal overflow.

## Strengths

- One capacity-driven card rule now covers the family of compact and linked group states instead of fixing only the reported three-person screenshot.
- Incomplete rows preserve empty capacity and center the existing cards; card width never expands just to fill a row.
- The shared summary is structurally independent from portrait track width and consistently aligns to the stage edges.
- Existing imagery, semantic tokens, metric hierarchy, and responsive `×` connector language remain intact.

## Findings and resolution

- **P1 — resolved:** `<360px` single-column behavior was previously defeated by selector specificity. The narrow override now has equal specificity and owns the card flex basis.
- **P1 — resolved:** the linked five-person remainder was previously left-biased. Explicit flex row breaks now let every incomplete linked row center generically.
- **P2 — resolved:** the 516px baseline wasted about 112px on the right and constrained the summary to the same narrow tracks.
- **P3 — resolved:** the four-person layout had an abrupt 180px-to-240px size jump around the compact/connector transition. It now scales through an intermediate bounded basis.
- No unresolved P0–P2 issue remains in the audited surface.

## Accessibility and resilience

- Person cards remain semantic articles with headings; decorative connectors remain `aria-hidden` and non-interactive.
- Two metrics remain visible on every card at every measured width.
- No page or stage horizontal overflow was measured at 320px, 516px, or 1024px.
- New console warnings/errors in the final verification window: 0.

## Saved evidence

- `01-three-people-516-before.jpg`
- `02-three-people-516-after.jpg`
- `03-three-people-516-comparison.jpg`
- `04-five-people-516-after.jpg`
- `05-six-people-516-after.jpg`
- `06-six-people-320-after.jpg`
- `07-five-people-1024-after.jpg`
- `../../design-qa.md`

## Evidence limits

- This audit is grounded in screenshots, live DOM geometry, role-based interactions, console logs, unit tests, and a production build.
- It does not include screen-reader output, forced-colors mode, or high text-only zoom.
