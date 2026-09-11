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

## ADDED Requirements

### Requirement: Loading presentation SHALL preserve known content topology

Business loading surfaces SHALL use the same responsive columns, card grouping, portrait geometry and meaningful field locations as their corresponding ready surfaces. Every visual placeholder leaf SHALL be NSkeleton with the app-owned motion class. Existing independent operation boundaries, polite status and aria-busy semantics SHALL remain. Only unresolved backend dynamic information SHALL use Skeleton. Components, fixed labels, known query text and accepted selected identities SHALL remain real; pagination SHALL remain the actual pending control when accepted data exists and be hidden without data. Whole Tag placeholders SHALL cover the full tag dimensions including border/padding, without retaining a real shell around a text-only skeleton.

#### Scenario: Module and result waiting share the target layout
- **WHEN** a ranking, candidate, partner or co-star module or its initial data is waiting
- **THEN** the corresponding target layout SHALL appear rather than a generic centered four-line loader
- **AND** unresolved candidates SHALL NOT fabricate selected people or an analysis result

#### Scenario: Cards wait for list data
- **WHEN** works, series, characters, candidates or partners are awaiting a list response
- **THEN** each card SHALL preserve its actual portrait, name, identity and metric/content grouping rather than one whole-card rectangle
- **AND** compact, personal/global and participant-count variations SHALL use only their applicable structure

#### Scenario: A view update preserves accepted controls
- **WHEN** a list search, sort or page request is pending
- **THEN** headings, controls, values and input focus SHALL remain while only unresolved backend list information is replaced
- **AND** the same row skeleton as initial loading SHALL be used when the ready row structure is the same
- **AND** existing pagination SHALL remain real and pending without NSkeleton, with no fabricated first-load total

#### Scenario: Responsive review is delivered
- **WHEN** the user reviews the corrected loading layouts
- **THEN** screenshots SHALL report viewport and actual component/container widths and preserve sufficient parent context to assess gutters
- **AND** shared skeleton frameworks, including detail with/without a character count, SHALL be documented as aliases rather than repeated screenshot families
