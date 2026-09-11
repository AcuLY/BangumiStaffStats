## Context
Both series work variants omit the representative subject's tags although ordinary subject cards carry metaTags. Both services already load per-subject tags from the immutable fact set and identify the exact displayed representative. The frontend must not derive metadata from members or summary aggregates.

## Change Boundary
| Field | Boundary |
|---|---|
| Status | Implemented after strict validation and primary review; acceptance status and remaining gates are recorded in tasks.md |
| Owner | Primary specification/acceptance/frontend owner; delegated contracts/backend owner |
| Writable paths | This change; contracts/schemas/{person-detail,co-star}/success-envelope-v1.schema.json; contracts/goldens/api/{person-detail,co-star}/{cases/*.json,verify.mjs}; backend/internal/{persondetail,costar}/{types.go,build.go,projection.go,clone.go,cache.go,build_test.go,cache_test.go,view_test.go}; backend/internal/httpapi/wire/{person_detail,co_star}.gen.go; frontend/src/api/generated/{person-detail,co-star}/{types.gen.ts,schemas.gen.ts}; frontend/src/features/person-detail/components/PersonItemBrowser.vue; frontend/src/features/co-star/components/CoStarWorkBrowser.vue; frontend/tests/{api/{person-detail,co-star}.test.ts,features/{person-detail/components,co-star/co-star-components}.test.ts}; tmp-formal-development/backend-development-implementation-guide.md; exact affected root specs |
| Read-only protected inputs | PRODUCT.md, DESIGN.md, accepted data decisions, Archive store/schema, query/statistics, other active changes and recent user UI edits |
| Deletion complement | Retain all names, member order, dates used for sorting, roles/counts, pagination, tag summaries, metrics and request budgets |
| Mutable refs | None; current master worktree only |
| Consumes | Existing representative ID and subject meta tags already loaded in fact sets |
| Produces | Required bounded metaTags on both personal/global series work variants of both operations |
| Dependencies | Contracts -> Backend -> Frontend; no new dependency |
| Deliverables | Reviewed specifications, schemas/goldens/generated consumers, production projections and UI, test/browser evidence |
| Acceptance | Schema/golden validation, generated drift checks, representative-vs-member and empty-tag tests, affected backend/frontend gates, browser series cards |
| Non-goals | Change representative selection, aggregate tag semantics, Archive schema/dataVersion, statistics, runtime budgets, unrelated audit issues |
| Operations deferred | Production deployment, external services, Git commit/push/merge/release; local runtime validation recorded separately |
| Stop/rollback conditions | Conflicting user/concurrent edit, expanded query/statistics semantics, changed generated isolation or failed acceptance; no destructive rollback |

## Goals / Non-Goals
Restore representative metadata on both series surfaces and scopes. Preserve role presentation, the ongoing NTag migration, layout, sorting timestamps and every statistical result. Do not modify tag-summary aggregation, representative selection, Archive inputs or dependencies.

## Decisions
1. Add required metaTags to each series work variant, alongside representative. Reuse the existing subject field's unique array of at most 16 nonempty strings (each at most 255 characters). Empty metadata is [].
2. Use the existing representative ID to obtain meta tags from the already loaded fact set and the current stable, bounded tag-name helper. Do not use all matched members or aggregated tag evidence.
3. Carry the immutable slice through cache cloning, memory accounting and scope-specific wire projection in persondetail and costar. Generate both Go and TypeScript from the owned schema; never edit generated consumers directly.
4. Reuse the subject-card metadata NTag layout in each series branch. No frontend query or statistical computation is introduced.
5. This is one cross-component correction with Contracts -> Backend -> Frontend dependency. The primary handles frontend only after concurrent NTag ownership has completed; the delegated agent owns contracts/backend/generated slices.

## Risks / Trade-offs
- Strict closed schemas reject mismatched producers/consumers -> verify generated pairs together and keep local runtime acceptance explicit; production activation is out of scope.
- Representatives can differ from matched members -> use the existing displayed representative and test conflicting member tags.
- Slice aliasing or missing accounting -> focused cache mutation/cost tests.
- Concurrent UI updates -> reread exact component state immediately before the additive series branch change and retain NTag, xicons and divider work.

## Migration Plan
Review and strictly validate the artifacts, update contracts and goldens, implement backend projections, regenerate consumers, then add frontend rendering. Validate an updated local backend before browser acceptance against the new strict client; preserve the prior local binary if a local development restart is required. No Archive rebuild or new dataVersion is needed. Do not claim deployed status from source/test results.

## Open Questions
None for data semantics. Local runtime readiness and complete component gates remain acceptance tasks, not assumed success.
