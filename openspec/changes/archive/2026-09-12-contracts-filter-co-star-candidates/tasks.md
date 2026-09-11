## Task boundary
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
## 1. Contracts
- [x] 1.1 Preflight current master/HEAD and preserve unrelated dirty work; verify reviewed strictly valid artifacts.
- [x] 1.2 Add optional participant input and strict structural/semantic goldens; regenerate affected Go/TypeScript consumers and propagated acceptance identities.
- [x] 1.3 Run candidate goldens and generated checks plus affected artifact contract tests.

## 2. Backend
- [x] 2.1 Preflight current master/HEAD and owned files; verify reviewed strictly valid artifacts and contracts.
- [x] 2.2 Validate participant identities, filter per-position candidates by the exact shared raw-work intersection, and isolate canonical cache keys while preserving optimized metrics.
- [x] 2.3 Add regressions for A/AB, pairwise-only exclusion, identities, series, counts, cache and invalid inputs; run focused tests and full backend gate.

## 3. Frontend
- [x] 3.1 Preflight current master/HEAD and owned files; verify reviewed strictly valid artifacts and generated input contract.
- [x] 3.2 Refresh selection-bound candidate membership, guard stale/error/cancel rows, preserve view controls, and restore exact saved participants before the first request.
- [x] 3.3 Add default/clear/identity/race/recovery regressions and run focused tests plus full frontend gate.

## 4. Integration
- [x] 4.1 Review actual diffs and cross-component consistency; synchronize product and user documentation.
- [x] 4.2 Verify real local browser desktop/mobile selection filtering, keyboard, empty/loading and console behavior.
- [x] 4.3 Record exact evidence, run diff hygiene, synchronize and archive this change, validate all OpenSpec, and hand accepted changes to the release coordinator without deploying.
