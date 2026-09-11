## Why

The accepted prototype shows one point per rated work and a line of quarterly means. The production detail response only retains quarterly aggregates, so the UI merges works and cannot show work-specific tooltips. The user explicitly requests restoring the design, including Chinese season labels.

## What Changes

- PRESERVE_ORACLE: individual work dots, quarter-average line, work title/date/score tooltip, and 冬季/春季/夏季/秋季 axis labels when space permits. Preserve existing responsive year ticks, 8px/12px dots and 44px nearest-point targets.
- Extend each person-detail timeline quarter with required `works`: subject reference (including original date) plus integer-hundredths score. Backend selects the complete eligible work set before pagination; frontend only positions the supplied evidence.
- Preserve canonical score/date rules and empty series timelines. No dependencies, Archive changes, or production deployment.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `contracts-person-detail-api`: exact work evidence per timeline quarter.
- `backend-person-detail-api`: build, clone and account for work points.
- `frontend-person-inspector`: restore oracle scatter and season presentation.

## Impact

Current master worktree only. Primary owns planning/frontend/verification; one contract owner and one backend owner use non-overlapping scopes from design.md. Preserve unrelated dirty work including active profile, loading and query changes. No Git refs, public host, Archive data or secrets are mutated.
