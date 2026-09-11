## Why
Audit B2 found that series cards omit representative metadata in person details and co-star results. Accepted data decision 134 requires the cover, title and tags to come from the same representative subject; both APIs currently lack that series field.

## What Changes
- Add required `metaTags: string[]` to the personal/global series work variants of person-detail and co-star, matching the existing subject-work tag constraints.
- Populate it from the already loaded representative subject's meta tags, preserving selection and statistical authority.
- Render the returned tags with the incumbent NTag metadata layout, preserving the user's concurrent NTag migration.
- Regenerate isolated Go/TypeScript consumers and update meaningful goldens/projection/cache tests.
- This is an INTENTIONAL_DELTA restoring the accepted data decision (tmp-formal-development/decisions/prototype-data-logic-audit.md:134). Other appearance and behavior preserve oracle 644b7748674e553f863d0ffd61d029f86fdc0717 and newer user decisions.
- **BREAKING during mixed-version use:** strict old/new consumers and producers must be validated together; no deployed API or Archive version is changed here.

## Capabilities
### New Capabilities
- None.
### Modified Capabilities
- `contracts-person-detail-api`: series metadata field.
- `contracts-co-star-api`: series metadata field.
- `backend-person-detail-api`: representative metadata projection.
- `backend-co-star-api`: representative metadata projection.
- `frontend-person-inspector`: render representative metadata on series cards.
- `frontend-co-star-vertical`: render representative metadata on common series cards.

## Impact
| Field | Boundary |
|---|---|
| Status | Proposed; implementation waits for all artifacts, strict validation and primary review |
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

No other repository or external host is writable. Apply is blocked until proposal, design, specs and tasks pass strict validation and primary-agent review. Preserve existing dirty work and exact generator ownership; never reset --hard, use checkout rollback, git clean, git add -A or broad deletion.
