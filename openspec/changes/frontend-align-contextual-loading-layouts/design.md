## Context

This is the user-approved follow-up to the current NSkeleton migration and person-detail correction. The 11 screenshots are review evidence, not new content or a reason to copy the gallery harness into production. Pending scope and mode are known before response data; ready layout classes and real controls remain authoritative.

## Change boundary

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

## Goals / Non-Goals

Goals: recognizable loading controls and business layouts; one row skeleton per structural family; dynamic-data placeholders with real controls and fixed text; a compact review gallery with explicit alias coverage. Non-goals are listed above.

## Decisions

1. Keep catalog selector height and affordance using existing selector styling and Naive loading indicator. Disable selection while unresolved and retain local error/retry. Avoid pretending the catalog is empty.
2. Use lightweight feature skeleton components at lazy module boundaries. Ranking and candidate layouts are eager; partner/co-star analysis layouts are warmed only when entering co-star mode, alongside catalog/candidate loading, to preserve the existing initial JavaScript budget. They do not trigger data requests. Generic DeferredSurfaceState retains error presentation and accepts a loading slot; no generic four-line skeleton remains in reachable business flows. A ranking fallback uses RankingResultsSkeleton plus the existing desktop detail placeholder. Candidate fallback does not invent selected people; partner/co-star fallback uses identities already selected.
3. RankingColumns remains shared for known headings. Restore the workUnit/pendingWorkUnit presentation pipeline from the submitted query. Initial ranking summary labels and toolbar are real; only unresolved numeric statistics and list content are NSkeleton. View refresh preserves resolved summary, controls and focus.
4. Shared WorkCardsSkeleton is presentational only: props count, compact, personal, kind(subject|series|character), participantCount. It contains no backend/statistical formulas. Person and co-star browsers consume it with their actual content mode. Candidate rows and partner summaries/rows preserve their distinct real layouts. CoStarAnalysisSkeleton receives known people, scope, workUnit and pageSize and mirrors applicable sections.
5. Work/character/candidate headings, search/sort/density/position controls and pagination remain real while dynamic rows wait. Keep AdaptivePagination unchanged and pending when accepted data exists, hidden without data. No PaginationSkeleton or shared control-placeholder mode is introduced. Cancel/retry/close remain usable.
6. CSS skeletons consume accepted final geometry and theme tokens, including eager readiness of required layout CSS. The screenshot harness must keep the production main/workspace ancestors, and include context so pane cropping is not confused with missing page insets. No automatic padding redesign is authorized.
7. Owners are non-overlapping: ranking component files/tests; person item/shared WorkCardsSkeleton/person-detail CSS and test; co-star component/CSS/test files; primary all App/query/shared inventory/docs/specs/gallery. Shared test registration is primary-owned. WorkCardsSkeleton interface is frozen before consumer integration.

## Risks / Trade-offs

- Lazy fallback may import ready heavy modules -> eager modules contain only loading presentation and small shared primitives; keep feature data/logic deferred.
- Contract fixtures have different counts -> labels come from submitted query, counts only from accepted data; screenshot fixtures are clearly labeled.
- First and view loading may drift -> component reuse and behavioral tests; duplicate screenshots replaced by explicit alias notes.
- Preexisting dirty files -> preserve earlier detail changes and leave unrelated pagination changes untouched; audit only owned diff.

## Migration Plan

Local source and document updates, focused tests and affected frontend gate, actual rendered comparison, then sync and archive if accepted checks pass. No release or deployment. Rollback is an exact owned patch only.

## Follow-up screenshot review (2026-09-07)

The user clarified that the rating loading region must read as a bar chart, not a wall of horizontal placeholder rows. Co-star rating loading therefore uses a compact schematic vertical bar chart with a 1-10 score axis, count-axis placeholders, separated columns and whitespace. Fixed placeholder heights carry no statistical meaning; successful chart data and interactions are unchanged. This explicit visual delta is recorded in DESIGN.md.

## Final review decision (2026-09-08)

The user explicitly reversed the proposed fixed-text/control-placeholder decision: only unresolved backend dynamic information is skeletonized. Components, fixed text, known query labels and accepted selected identities remain real. The previous full Tag requirement remains: one complete rounded placeholder covers each tag including its border/padding footprint, rather than a real tag shell with only text replaced.

The ranking initial shell uses real summary labels and disabled RankingToolbar with only number values as skeleton. Ranking workUnit/pendingWorkUnit props are retained. Current-turn placeholder changes to work/character/candidate headings, controls, pagination, partner text and co-star fixed labels are reversed exactly, preserving existing unrelated work. PersonDetailSkeleton.vue is read-only per user decision after concurrent edits; use the latest other-task implementation for comparison and screenshots.

The ordinary and character-count detail gallery share one family. Shared-framework aliases and optional real structural differences stay grouped; screenshot production uses one frozen current source copy. Primary owns docs/App/gallery and validation, ranking owner owns ranking placeholder refinement. Other owners only reverse their own superseded patches.

## Latest detail alignment follow-up

The user subsequently requested direct adjustment of PersonDetailSkeleton against the latest implementation, superseding the earlier read-only choice for that file. The placeholder now consumes the actual PersonProfile/Inspector CSS classes and container rules rather than maintaining an independent layout copy. Static metric/tag/chart labels and disabled controls remain real; dynamic values, full Tag shapes, vertical chart bars, preference content and work/character cards use NSkeleton. Known work-unit, section and page size are presentation inputs from the accepted query/view. Ready components and backend contracts are unchanged.
