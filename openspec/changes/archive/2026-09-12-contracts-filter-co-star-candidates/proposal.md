## Why

The picker currently offers people with no common work with the selected group, leading to avoidable empty analyses. The user requested only effective candidates: after A select collaborators of A; after AB select people who share a single work with both A and B.

## What Changes

- INTENTIONAL_DELTA: candidate membership is constrained by the exact common raw works of selected identities, before series aggregation, ranking and paging.
- NEW_CAPABILITY: optional candidate input.participants carries 0–10 distinct people and at most 20 identities. Omission/empty preserves the initial unconstrained query.
- INTENTIONAL_DELTA: selection changes refresh the candidate list on page one; stale, failed or cancelled views cannot offer invalid selections. Selection identity management and default initialization remain available.
- PRESERVE_ORACLE: existing candidate metric semantics, visual structure, sorting, formulas and shared-query boundaries from PRODUCT.md and oracle 644b7748674e553f863d0ffd61d029f86fdc0717.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `contracts-candidates-api`: explicit participants as a semantic candidate input.
- `backend-candidates-api`: exact common-work filtering and participant cache isolation.
- `frontend-co-star-vertical`: selection-bound candidate requests, recovery and stale-result protection.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Implemented and verified; reviewed and strictly validated before apply |
| Owner | Primary specification/integration; contracts owner schemas and generated consumers; backend owner candidates; frontend owner query/selection presentation |
| Writable paths | Owner-specific lists in design.md; this change; PRODUCT.md; README.md; accepted contracts-candidates-api, backend-candidates-api and frontend-co-star-vertical specs |
| Read-only protected inputs | DESIGN.md; data decision/master/implementation guides; unrelated changes; docs/images and community draft; Archive/runtime data; operations/; existing dirty work |
| Deletion complement | None |
| Mutable refs | Local master: exact owned feature commit after acceptance; no push or deployment. Planning began at 4bea284; release coordinator added 6850ad3 |
| Consumes | Shared Query, explicit participant identities, current catalog, immutable Archive and public collections |
| Produces | Effective candidate identity membership and selection-bound views |
| Dependencies | contracts -> generated consumers -> backend statistics and frontend API -> selection UI |
| Deliverables | Contract, bounded filtering, stale-response-safe picker, regression tests and synchronized specs |
| Acceptance | Candidate contract goldens/generators; backend ./scripts/check.sh; frontend npm ci --ignore-scripts --no-audit --no-fund and npm run check; artifact contract tests; desktop/mobile browser; git diff --check; strict OpenSpec |
| Non-goals | Metric/formula changes, ranking/partners result changes, new dependencies, new recommendation system |
| Operations deferred | No production mutation, push or deployment; release coordinator handles integration separately |
| Stop/rollback conditions | Stop on overlapping concurrent edits or authority conflict; undo only owned hunks; no reset --hard, checkout rollback, git clean, git add -A or broad deletion |
