## Why

The cooperation list lacks the current-sort progress encoding required by DESIGN.md:416. Its existing leaders cannot supply the absolute maximum for signed preference: a leader of +0.20 does not reveal an off-page partner at -0.80. Computing the maximum from the visible page would change the same person's bar during search or pagination and violate the Backend statistical authority.

## What Changes

- **INTENTIONAL_DELTA — BREAKING for strict old response decoders:** add required `data.metricScale` to personal and global partners success responses, reusing the existing rankings `{metric, kind: "linear", max}` contract. The endpoint, request, v1 schema names and error shapes remain unchanged; Backend and Frontend consumers must be updated together before any separate runtime activation.
- Compute the selected metric's maximum from the complete candidate-position-filtered partner core before search/page, using exact absolute rational magnitude for preference. Keep null absence distinct from a valid zero.
- Extract the existing bounded rankings maximum scan into the existing Backend statistics owner and call it from rankings and partners; preserve rankings response values and behavior exactly.
- **PRESERVE_ORACLE:** restore the cooperation list's progress display from immutable oracle `644b7748674e553f863d0ffd61d029f86fdc0717` (`SinglePersonCooperation.vue` used `RankedPersonList`). Reuse current ranking percentage/direction formatting and current design tokens; retain every recent typography, NTag, xicons, AppViewport, C1/C2 layout and interaction correction.
- Regenerate only affected partners Go/TypeScript wire consumers and extend language-neutral, Backend, adapter and UI evidence for signed/off-page, zero, missing and filtered-set scales.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `contracts-partners-api`: required scope-safe metricScale and cross-language evidence.
- `backend-partners-api`: complete-set scale projection using the existing rankings maximum semantics.
- `frontend-co-star-vertical`: server-scaled cooperation progress with stable search/page behavior.

## Impact

| Field | Boundary |
|---|---|
| Status | Proposal only; apply blocked until proposal, design, all deltas and tasks are strictly valid and the primary agent reviews and authorizes implementation |
| Owner | Primary: decisions, Frontend integration, documentation and final acceptance; Contracts: response schema/goldens/generated consumers; Backend: shared maximum scan and partners projection |
| Writable paths | Current task: only `openspec/changes/contracts-add-partner-metric-scale/`; future apply: exact per-owner inventory in design.md |
| Read-only protected inputs | Current PRODUCT/DESIGN and accepted decisions; oracle; existing Archive/data; all source during this proposal task; unrelated dirty hunks, services, secrets and other repositories |
| Deletion complement | Future apply removes only the superseded private ranking maximum scan after the shared implementation is proven equivalent; no endpoint, metric, source data or other UI behavior is removed |
| Mutable refs | None; current master worktree only; no staging, commit, branch, push, merge, tag or release |
| Consumes | Existing rankings metric-scale schema, PersonSortEntry/Rational statistics, complete partners core, current ranking progress formatter, DESIGN.md:416 and PRODUCT.md:52–54/74 |
| Produces | One selected-metric scale per partners page, shared Backend maximum implementation, aligned cooperation progress, regenerated partners consumers and focused evidence |
| Dependencies | Contracts before Backend/Frontend consumers; source handoff with the ongoing B2 series-tag/generator owner and primary C1/C2/NTag/xicons/AppViewport work before overlapping apply writes |
| Deliverables | Complete reviewed plan; later coherent implementation, generated evidence and proportional acceptance |
| Acceptance | Strict OpenSpec validation now; later partners contract verifier/codegen checks, focused shared-scale/ranking/partners/API/UI tests, affected component gates and rendered progress checks |
| Non-goals | Frontend population statistics, extra requests, new endpoint/cache/dependency, leaders redesign, rankings semantic change, Archive/schema migration, theme/layout cleanup or generic plotting infrastructure |
| Operations deferred | No other repository or external/live state is changed; running services, pointer activation, production, deployment, release and remote integration remain outside this change |
| Stop/rollback conditions | Stop on conflicting ownership/authority, undeclared generated output or failed acceptance. Preserve all pre-existing work and revert only owned hunks when needed; never reset/checkout/clean/stash unrelated work |

The newer user-approved UI decisions are controlling. The oracle supplies only the progress behavior being restored; it cannot reinstate old fonts, icons, Drawer behavior, obsolete sharing or previous layout values.
