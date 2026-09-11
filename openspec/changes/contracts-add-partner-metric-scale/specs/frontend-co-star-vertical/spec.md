## Capability Boundary

| Field | Boundary |
|---|---|
| Status | PRESERVE_ORACLE progress; planned until strict validation and primary review |
| Owner | Frontend primary owner |
| Writable paths | Exact Frontend/doc inventory in this change's design.md; this delta and root capability at primary-owned sync |
| Read-only protected inputs | Existing ranking arithmetic/tokens, current NTag/xicons/AppViewport/typography/C1/C2 geometry, other component behavior and unrelated work |
| Deletion complement | No controls or content removed; add only the missing progress evidence/layer |
| Mutable refs | None |
| Consumes | Required server metricScale, current row metric values and ranking percentage/direction formatter |
| Produces | Consistent cooperation progress with stable view semantics |
| Dependencies | Contracts/Backend response before Frontend consumption; primary serializes concurrent component edits |
| Deliverables | Frozen adapter value, request-match check, progress markup/styles and focused rendered evidence |
| Acceptance | API/driver/formatter/component tests; desktop/mobile Light/Dark progress/focus/pending checks and full Frontend gate |
| Non-goals | Page aggregation, extra requests, new math, labels/fonts/layout restyling, identity management changes |
| Operations deferred | All server, deployment, host and remote changes |
| Stop/rollback conditions | Incorrect scale, current-design regression or failed verification; do not invent a local statistical fallback |

## ADDED Requirements

### Requirement: Cooperation rows SHALL render server-scaled sorting progress

Cooperation rows SHALL consume the accepted response metricScale and existing row values, reuse current ranking progress arithmetic, and follow DESIGN.md:416. Count/average/overall SHALL fill from the start; personal preference SHALL share ranking's zero-centered positive/right and negative/left display with visible sign and current semantic colors. Null or zero scale SHALL show no spurious fill, and a valid zero score SHALL remain 0.00. Progress SHALL be decorative and SHALL not replace actual metric text or accessible row descriptions.

The adapter SHALL retain immutable exact scale values and the driver SHALL reject a metric discriminator that mismatches the normalized requested sort. The frontend SHALL not compute a population maximum from current items or leaders, issue supplementary requests, or approximate a missing scale. Existing current typography, widths, padding, focus, selection, NTag/xicons/AppViewport and C1/C2 fixes SHALL remain unchanged.

#### Scenario: Positive and larger negative scores share a scale
- **WHEN** the server returns max 4/5 and the visible scores are +1/5 and -4/5
- **THEN** the positive progress SHALL occupy one quarter of its half-track and negative progress its complete half-track
- **AND** both SHALL retain their signed textual values using the current ranking formatter

#### Scenario: Search or pagination changes visible rows
- **WHEN** the same person appears after a search/page/order change with the same server scale
- **THEN** that person's progress length SHALL remain identical
- **AND** the existing pending rows SHALL retain the last accepted rows/scale together after failure or cancellation

#### Scenario: Strict response is missing or mismatched
- **WHEN** metricScale is absent, invalid or names another metric
- **THEN** the existing decode/error path SHALL handle the failed response
- **AND** no locally inferred progress SHALL be displayed as accepted evidence
