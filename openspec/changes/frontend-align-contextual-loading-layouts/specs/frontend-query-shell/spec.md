## Capability Boundary

| Field | Boundary |
|---|---|
| Status | 2026-09-08 review revision; implement after strict validation and primary review |
| Owner | Frontend. Primary: query/App/docs/shared tests/inventory/review; ranking owner; work-card owner; co-star owner |
| Writable paths | `PRODUCT.md`; `DESIGN.md`; this change directory; `frontend/src/app/App.vue`; `frontend/src/features/query/components/PositionSelector.vue`; `frontend/src/shared/components/DeferredSurfaceState.vue`; `frontend/src/shared/components/WorkCardsSkeleton.vue`; `frontend/src/features/person-detail/components/PersonDetailSkeleton.vue`; `frontend/src/features/person-detail/components/PersonInspector.vue`; `frontend/src/features/person-detail/components/PersonDetailSurface.vue`; `frontend/src/features/ranking/components/RankingToolbar.vue`; `frontend/src/features/ranking/components/RankingResults.vue`; `frontend/src/features/ranking/components/RankedPersonList.vue`; `frontend/src/features/ranking/components/RankingColumns.vue`; `frontend/src/features/ranking/components/RankingListSkeleton.vue`; `frontend/src/features/ranking/components/RankingResultsSkeleton.vue`; `frontend/src/features/person-detail/components/PersonItemBrowser.vue`; `frontend/src/features/person-detail/person-detail.css`; `frontend/src/features/co-star/components/CandidatePicker.vue`; `frontend/src/features/co-star/components/CandidateRowsSkeleton.vue`; `frontend/src/features/co-star/components/CandidateWorkspaceSkeleton.vue`; `frontend/src/features/co-star/components/PartnersSurface.vue`; `frontend/src/features/co-star/components/PartnersSkeleton.vue`; `frontend/src/features/co-star/components/CoStarSurface.vue`; `frontend/src/features/co-star/components/CoStarAnalysisSkeleton.vue`; `frontend/src/features/co-star/components/CoStarWorkBrowser.vue`; `frontend/src/features/co-star/co-star.css`; `frontend/src/features/co-star/co-star-analysis.css`; `frontend/src/features/co-star/co-star-oracle.css`; `frontend/src/features/co-star/partners.css`; `frontend/src/shared/styles/base.css` (obsolete skeleton selectors only); `frontend/scripts/check-architecture.mjs`; `frontend/tests/shared/skeleton-system.test.ts`; `frontend/tests/features/ranking/components.test.ts`; `frontend/tests/features/person-detail/components.test.ts`; `frontend/tests/features/co-star/components.test.ts`; `frontend/tests/features/co-star/partners-components.test.ts`; `frontend/tests/features/co-star/co-star-components.test.ts`; `frontend/tests/features/query/components.test.ts`; `frontend/tests/app/rankings.integration.test.ts`; `frontend/tests/app/app.mount.test.ts`; sync only the three declared main specs; screenshot harness/gallery outside repository |
| Read-only protected inputs | API/contracts/coordinator/store/backend/operations, pinned dependencies and lockfile, theme overrides, oracle, unrelated dirt including AdaptivePagination.vue; Unrelated ready-state edits remain protected; the later explicit user request authorizes aligning PersonDetailSkeleton with the current implementation |
| Deletion complement | Only obsolete loading markup/CSS and its corresponding assertions inside writable files; no data or files outside owned scope |
| Mutable refs | None; current master/worktree only |
| Consumes | User comments 1-11; current ready layouts; NSkeleton migration baseline and person-detail correction; immutable oracle 644b7748674e553f863d0ffd61d029f86fdc0717 |
| Produces | Contextual loading layouts, shared faithful list skeletons, selector loading state, dynamic-data placeholders, real known labels and controls, current detail layout, deduplicated screenshot gallery |
| Dependencies | App -> feature skeletons -> shared visual components -> existing Naive UI; no new library or statistical authority |
| Deliverables | Source, proportional tests, accepted docs/specs, screenshot review with exact viewport/container dimensions and alias coverage |
| Acceptance | Strict change validation; focused component and integration tests; npm ci --ignore-scripts --no-audit --no-fund then npm run check using Node24.18.0/npm11.16.0; browser desktop/mobile/light/dark/pending/ready and keyboard; git diff --check; strict all validation after sync/archive |
| Non-goals | Statistical/API behavior, request timing/caching, ready-state redesign, pagination implementation, dependency/architecture expansion, fixes to unrelated baseline failures |
| Operations deferred | Commit/push/PR/merge/release/deploy, remote hosts and live services |
| Stop/rollback conditions | Preserve unrelated and concurrent edits; stop on ownership conflict, relevant failed acceptance, loading presentation mismatch or ready drift; rollback only exact owned changes |

## MODIFIED Requirements

### Requirement: Query input SHALL use the shared wire and dynamic catalog

The query model SHALL own defaults, summary text, normalization, dirty/no-op
comparison, and structured field errors while reusing the accepted
`SharedQueryV1` and operation view components. It SHALL model personal/global
as a closed union, construct global submissions without personal fields,
reject a global wire value that carries any personal field, and SHALL never
infer fields by parsing display messages.

The catalog store SHALL load only `GET /api/v1/catalog` through the accepted
client/strict adapter. The selector SHALL treat PositionKey as opaque, use
catalog groups, labels, order, selectability, exclusivity, and capabilities,
and preserve first-occurrence order. It SHALL not restore a static position
enum or infer behavior from a key prefix or label.

#### Scenario: Structured validation fails
- **WHEN** Draft violates scope, UID, status, subject-type, position,
  exclusivity, range, or capability rules
- **THEN** no operation request SHALL start, field errors SHALL target the
  corresponding controls, and Draft plus the previous Applied Query/result
  SHALL remain intact

#### Scenario: Catalog is pending or fails
- **WHEN** catalog loading is pending or returns a retryable error
- **THEN** only the position selector SHALL retain its recognizable control with a loading indicator, or show its local error/retry state, while the rest of the editor remains usable
- **AND** failure SHALL not be represented as an empty catalog
