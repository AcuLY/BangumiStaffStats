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

### Requirement: Ranking resource states SHALL remain isolated

A new ranking query MAY replace the ranking body with its skeleton while Header
and Query summary remain available. A ranking view request SHALL preserve
summary and controls while replacing only rows; accepted pagination SHALL remain pending and initial pagination SHALL be absent. Initial and view requests SHALL share the same row and column skeleton. Known headings and controls SHALL remain real. The work/series heading SHALL be determined by the submitted query snapshot, not a later Draft edit. Only unresolved dynamic numeric values and list content SHALL use NSkeleton. Ranking failure SHALL
not erase an unrelated co-star resource. Route switching SHALL not auto-apply
Draft or refetch a present current-revision result.

#### Scenario: A ranking view request is pending
- **WHEN** search/sort/page changes for a ready ranking resource
- **THEN** the existing summary and toolbar SHALL remain visible while rows/pagination expose bounded pending state

#### Scenario: User returns from co-star
- **WHEN** a current-revision ranking resource already exists
- **THEN** the ranking surface SHALL restore it without advancing revision or automatically applying Draft
