## Context

Operation membership currently requires identities inside Shared Query.positionKeys. Backend candidate/partner/co-star calculations already consume individual PositionResults and can retain exact raw-work evidence across roles. User approved expanding partner/candidate roles independently, and choosing one source by default.

## Goals / Non-Goals

Goals: director A -> script/cast/etc B under unchanged subject/collection filters; exact source identities; one automatic source; small hint. Non-goals: automatic changes to ranking, formulas, dependencies, new pages or public sharing.

## Change boundary

| Boundary | Declaration |
|---|---|
| Status | Implemented and committed locally in b675b8d; full acceptance/archival remain governed by unchecked tasks |
| Owner | Backend/contracts owner, frontend API/coordinator owner, primary App/UI/docs owner |
| Writable paths | Owned sets below; this change and its two accepted capability specs |
| Read-only protected inputs | Other dirty hunks, active change artifacts, archive data, operations, guides, AGENTS |
| Deletion complement | None |
| Mutable refs | None; master 3612f50 |
| Consumes | Shared Query, catalog selection/capabilities, existing data/statistical authorities |
| Produces | Isolated operation scope and cross-role selection flow |
| Dependencies | Contract -> generated -> backend/coordinator -> App/UI -> acceptance |
| Deliverables | Code, regression tests, docs/specs, exact evidence |
| Acceptance | Focused tests plus frontend check/backend check.sh/contract goldens; real-data browser desktop/mobile; diff hygiene; strict specs |
| Non-goals | No new dependencies/formulas/Query owner |
| Operations deferred | All production operations; local read-only QA 8081 + preview 5175 allowed with existing helpers |
| Stop/rollback conditions | Conflicting writer/authority or expanded scope stops; no destructive cleanup or rollback of unrelated work |

### Owned files

- Contracts also owns contracts/schemas/candidates/success-envelope-v1.schema.json and its generated consumers: all-scope positionCounts and item positionKeys use the existing catalog position bound instead of the old 16-query-position bound; all identifiers remain validated. Added many-positions golden covers 33 entries without truncation.

- Primary owns openspec/specs/contracts-person-workspace-links/spec.md only to extend explicit identity membership to the accepted all scope; other requirements remain unchanged.

- Safer read-only QA after the existing-service start was rejected by automatic approval: backend/.cache/person-workspace-links-qa/main.go and backend/.cache/cross-position-readonly-api expose existing app.RunWithOptions with ArchiveUpdater:nil on loopback 8081, read existing Archive only, and do not replace/stop the existing 8080 service. Temporary preview 5175 may proxy to this isolated API.

- Local development activation for the user's current 5174 preview: primary may back up /root/.local/share/bgmss-local/api into backend/.cache/cross-position-previous-api, verify it with cmp, and replace only that executable and its api.pid via the existing read-only D:/Luca/Data/BangumiStaffStats/local-runtime/backend.sh launcher. Activate the verified linux/amd64 backend/.cache/cross-position-api on existing loopback 8080, preserving the existing proxy setting and Archive root. Archive bytes and production hosts remain outside writable scope. Roll back by starting the verified backup through the same launcher. Frontend 5174 remains in place except a necessary npm-ci native-lock restart of its exact owned process.

- Backend additionally owns backend/internal/candidates/operation.go for the existing Operation struct's scope field.

- Backend/contracts: contracts/schemas/query/operation-components-v1.schema.json; contracts/openapi/openapi.yaml; contracts/goldens/query/manifest.json and verify-current.mjs; contracts/goldens/api/{candidates,partners,co-star,person-detail}/verify.mjs and cases/*.json for new scope vectors; backend/internal/query/{operation_positions.go,operation_positions_test.go,evaluate.go,archive_loader.go}; backend/internal/{candidates,partners,costar,persondetail}/{types.go,model.go,request.go,service.go,cache.go,build.go,projection.go,view.go} as needed and their *_test.go files; backend/internal/httpapi/*_handler_test.go; generated backend/internal/httpapi/wire/*.gen.go and frontend/src/api/generated/ via existing tools only. Ignored existing backend/.cache/person-workspace-links-qa helper/binaries may be rebuilt for read-only local QA.
- Frontend scope owner: frontend/src/api/{candidates,partners,coStar,personDetail}.ts; frontend/src/api/adapters/queryWire.ts; frontend/src/features/query/{coordinator.ts,recovery.ts}; frontend/src/features/person-detail/workspaceLinks.ts; frontend/tests/api/{candidates,partners,co-star,person-detail,query-wire.contract}.test.ts; frontend/tests/features/query/{coordinator,recovery}.test.ts; frontend/tests/features/person-detail/workspace-links.test.ts.
- Primary: PRODUCT.md, DESIGN.md, frontend/ARCHITECTURE.md; frontend/src/app/App.vue; frontend/src/features/co-star/{model.ts,partners.ts,coStar.ts,co-star.css}; frontend/src/features/co-star/components/{CandidatePicker.vue,MobileCandidateEntry.vue,PartnersSurface.vue,CoStarWorkspace.vue}; frontend/tests/app/{co-star.integration,person-workspace-links,reveal-selection-bounds,app.mount}.test.ts; frontend/tests/features/co-star/*.test.ts; frontend/scripts/check-architecture.mjs only for exact new source/test inventory; existing ignored frontend/.tmp/person-workspace-preview.mjs for preview. No parallel writer may overlap these sets.

## Decisions

1. Add optional input.positionScope enum query|all to candidates, partners, co-star and person-detail. Missing or query preserves existing semantics. All means the current subject type's selectable positions supported by that operation. Normalized scope enters semantic input/cache identity; no response or collector cache can mix query and all scopes.
2. Shared Query is still strictly normalized unchanged. A bounded query operation helper resolves independent evaluated position keys and preserves subject/collection/tag/date/rating filters. Candidate/partner evaluation may include broad positions; co-star/detail evaluate only explicit identity keys. Do not re-submit the all catalog set through public Query normalization, because source cast:main and candidate cast:all can coexist across people while public query exclusivity remains unchanged.
3. All browsing uses canonical staff entries and cast all instead of also adding cast main when all exists. Explicit main filters and existing main source/participant identities remain valid and unchanged. For partners, source-required keys are distinct from default candidate keys, so source main does not accidentally restrict or duplicate partner all identities. Person ID deduplication and 10 people / 20 identity limits remain enforced.
4. Ordinary co-star application first loads candidates under original Query positions and atomically selects the first complete eligible person, skipping a person whose full identities exceed the limit. After a source is installed, candidate browsing expands to all. Ranking link pre-installs its exact source and must not be replaced by automatic selection. Query failure, edits without apply, view changes and session restoration do not trigger default selection.
5. UI partners requests use all scope and expose a full catalog-backed cooperation-position filter. Candidate view changes use all scope; explicit selected identities flow through partners/pair/group/detail unchanged. Keep original ranking Query and its exact locate operation. Frontend validation checks catalog/type/capability when live catalog is present; recovery structurally admits all-scope identities then validates against live catalog/server during replay.
6. A small one-person hint reads 点选下方候选人物，查看与已选人物的共演情况 in the visible selection area and 可继续选择人物，进行多人共演分析 in the mobile collapsed selection entry. It is ordinary contextual text, keyboard-readable, disappears at two or more people, and never opens a picker/toast/modal automatically.

## Explicit All query option (user-approved 2026-09-10)

The co-star position editor exposes an exclusive 全部 range option, backed by existing operation input.positionScope=all. It is not a catalog PositionKey and never expands into hundreds of SharedQuery AND positions. A ranking-detail 查看共演 action selects this range and the target's exact detail/query identities; UID, work type, collection statuses, filters, sorting and unapplied non-position Draft values remain unchanged. No origin flags or previous-analysis snapshots are introduced.

For a first All query, no concrete query position is required. The narrow contract extension admits query.positionKeys=[] only in all-scope candidates, partners, co-star and explicit identity detail. Ordinary SharedQuery normalization, rankings, and query-scope operations continue rejecting empty positions. Every other field, catalog membership and identity limit remains strict. Existing ALL evaluation and cache separation are reused. No hidden fallback position is generated. Existing nonempty ranking query positions may remain attached during handoff; ALL controls only the co-star operation.

The existing query store owns draft and accepted co-star position scope. It participates in dirty/undo/apply behavior and is represented in co-star summaries; accepted operation inputs remain the session-recovery source. Scope-only changes must execute even when SharedQuery is unchanged. All works on first entry, changed subject types and refresh; a transition to ranking from an all-only empty-position query opens the ordinary position editor instead of sending an invalid ranking request. Reapplying changed Query conditions retains the existing source-reset rule; this request does not approve the separately discussed source-preservation rule.

Additional exact ownership for this delta:
- Backend/contracts owner: contracts/schemas/query/{shared-query-v1,effective-query-v1,query-digest-projection-v1,operation-components-v1}.schema.json and existing per-operation request/schema files if needed; contracts/openapi/openapi.yaml; relevant existing API/query goldens and verifiers; backend/internal/query/{normalize.go,normalize_test.go,operation_positions.go,operation_positions_test.go} and candidate/partner/costar/persondetail service files/tests and HTTP validation files/tests; documented generator scripts only as required to reproduce schema changes; generated backend/internal/httpapi/wire and frontend/src/api/generated via the existing generators. No other frontend source.
- Frontend runtime owner: frontend/src/api/adapters/queryWire.ts; frontend/src/api/{candidates,partners,coStar,personDetail}.ts as required for strict context-aware decode; frontend/src/features/query/{model,store,coordinator,recovery}.ts; existing corresponding tests. No App/UI/CSS or generated-file edits.
- Primary: frontend/src/app/App.vue; frontend/src/features/query/components/{QueryWorkspace,QueryEditor,PositionSelector,PositionCatalogBrowser}.vue; existing related query component and App tests; frontend/src/features/query/query.css if needed; PRODUCT.md, DESIGN.md, frontend/ARCHITECTURE.md; this change and matching accepted specs. Existing content and all other dirty hunks stay protected.

Acceptance: first ALL query with empty concrete positions, ranking/query-scope rejection of empty positions, normal nonempty regressions, exact handoff target/other-parameter preservation, dirty/undo, failed/cancelled scope application, same-tab recovery, ordinary ranking mode after all-only query, generated drift checks, focused/full affected frontend/backend gates, 899px and mobile browser interaction, built artifact and diff hygiene. Primary review: this is the user-requested range choice, preserves API/statistics ownership and contains no synthetic positions or navigation state. Apply after strict validation; unrelated pre-existing acceptance blockers remain separately reported.

## Risks / Trade-offs

All-position evaluation can be larger; keep existing cache/executor limits and never eagerly evaluate all roles for a fixed pair or detail. Selection initialization is two bounded candidate requests, preserving user Query intent before broad browsing. Late responses and all-scope recovery must retain current revision/snapshot admission. Default-source tests expecting two people need intentional updates or explicit two-person fixtures.
