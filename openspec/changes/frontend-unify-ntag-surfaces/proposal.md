## Why
Role tags, work metadata and selected identity chips still render custom pill markup, while grouped evidence already uses NTag. Group labels have manual top offsets and are not vertically centered. The user requests auditing every tag and using NTag consistently.
## What Changes
- Replace hand-painted content/role/identity tags with Naive UI NTag; use public small/round APIs for neutral evidence, existing primary semantics for selected removable identities.
- Center group labels against their tag rows, removing manual top margins. Preserve names, counts, grouping, wrapping and state.
- Remove superseded pill styles; keep list/layout rules. Adaptive role measurement and overflow tooltips must use the same NTag geometry. Skeletons remain NSkeleton, aligned to actual tag height.
- Audit query NDynamicTags and existing NTag usage without replacing unrelated buttons, navigation or rank markers.
## Capabilities
### New Capabilities
- None.
### Modified Capabilities
- `frontend-accessibility`: shared tag presentation and interaction ownership.
## Impact
Frontend only; no dependencies, contracts, backend, service changes or refs. Primary owns planning/audit/shared skeletons; two independent component owners implement detail and co-star blocks while preserving existing dirty work.
