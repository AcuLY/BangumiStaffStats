## Context
The picker currently does not receive the selection. The candidate core already evaluates all positions independently and uses a lightweight metric path introduced in 4bea284. Shared Query and analysis selections have separate owners.

## Change boundary
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
### Exact implementation ownership
- Contracts: contracts/schemas/query/operation-components-v1.schema.json; contracts/openapi/openapi.yaml; contracts/goldens/api/candidates/verify.mjs and cases/*.json; contracts/goldens/query/manifest.json (generator-owned identity inventory); generated consumers under frontend/src/api/generated/{query-wire,candidates,catalog,rankings,person-detail,partners,co-star}/ and backend/internal/httpapi/wire/*.gen.go plus their generated inventory files; contracts/artifacts/lib/validation.mjs, contracts/artifacts/fixtures/positive/{backend,frontend}/component-statement.json, backend/build/build.sh and backend/build/artifact_test.go only for propagated OpenAPI identity pins (resolve actual pin file names before writing).
- Backend: backend/internal/candidates/{request.go,operation.go,service.go,cache.go,build.go,types.go,build_test.go,service_test.go,cache_test.go,view_test.go,archive_benchmark_test.go}; backend/internal/httpapi/candidates_handler_test.go. Existing statistics/candidates.go is read-only. Additional tests in these existing files, avoiding check.sh file-inventory changes.
- Frontend: frontend/src/app/App.vue; frontend/src/features/co-star/{model.ts,components/CandidatePicker.vue}; frontend/src/features/query/{coordinator.ts,recovery.ts}; frontend/src/api/{candidates.ts,adapters/queryWire.ts}; frontend/tests/{app/co-star.integration.test.ts,features/query/coordinator.test.ts,features/query/recovery.test.ts,features/co-star/components.test.ts,api/candidates.test.ts}. Existing related test files may be synchronized only where their expected candidate request shape changes; list exact paths in evidence.
- Primary: PRODUCT.md; README.md; this change and its three accepted specs; local validation evidence under this change. Earlier screenshot/community work remains intact.

## Goals / Non-Goals
Only identities sharing a raw work with the whole selected group are candidates. Keep all candidate metrics on their existing full filtered-query scope, after removing invalid identities. Do not change partner rankings, formulas, limits, visual layout or dependencies.

## Decisions
1. Add optional input.participants using PersonIdentityV1, empty equivalent to omission, up to 10 unique people and 20 unique identities. Validate all explicit keys against operation-permitted positions including main voice roles. Reject duplicate people/identities and invalid fields. No work IDs or UI selected flags cross the API.
2. Reuse query participant evaluation: union identities for each participant, intersect the resulting raw SubjectID sets. Filter each candidate identity by nonempty overlap, then build position counts, merged person rows and existing metrics. An empty intersection gives an empty result, never unconstrained fallback. Series aggregation comes later.
3. Preserve selected-row/partial-identity management. A currently selected identity can remain as a removal toggle when it meets the same membership predicate; additional identities are offered only if valid. Tray removal remains available even when no candidate survives. This avoids losing the existing ability to refine selected identities.
4. Cache identity includes canonically sorted people and position keys. Input order alone is irrelevant; changing identity membership is relevant. Search/sort/page stay outside core identity.
5. Frontend sends selection on candidate view changes and defaults to page 1 after selection changes while retaining current position/search/sort/page size. Use existing abort and sequence ownership, with synchronous display invalidation when selection changes. Retain internal accepted Query readiness for dependent analysis while hiding/locking incompatible old candidate payloads on failure/cancel. Retry uses the current desired selection.
6. Initial query stays unconstrained, chooses the existing default person once, then obtains filtered all-position candidates. Clearing all selected people intentionally remains empty selection and restores unconstrained candidates without auto-selecting again. Recovery derives the constraint from saved partners/co-star identities before its first candidate request; old saved states without this field remain readable.

## Risks / Trade-offs
- Pairwise-only matching would show invalid C -> explicit AB/AC/BC but no ABC regression.
- Stale requests would reintroduce invalid actions -> sync invalidation and late response/cancel/retry tests.
- Main/all browse duplication -> explicit participant keys are not added to candidate browse positions.
- Candidate counts still differ from collaboration counts -> preserve requested filtering-only scope and document count semantics.
- Large all-position queries -> preserve lightweight metric evaluator and reuse one common-subject intersection.

## Migration Plan
Optional input keeps no-selection clients compatible. Backend and generated frontend are released together by the separate release coordinator. No deployment in this task. Roll back only owned files if acceptance fails.

## Open Questions
None blocking.
