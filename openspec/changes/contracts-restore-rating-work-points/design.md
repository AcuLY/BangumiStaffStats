## Context

Oracle 644b7748674e553f863d0ffd61d029f86fdc0717 RatingDistributionChart.vue explicitly says 圆点表示单部作品评分 · 折线表示季度均分. It spreads works across their quarter without merging identical scores. Existing backend guide's aggregate-only timeline describes the missing implementation; the user's request restores original presentation with server-owned evidence. Reconcile the guide and root specs in this change.

## Goals / Non-Goals

Restore exact subject points and seasons. Keep query semantics, score precision, current quarterly means, series suppression, theme, navigation and pagination. Do not reconstruct points from the currently displayed page or change co-star charts.

## Decisions

Each timeline item retains year/quarter/average/count and adds required works array of `{ subject: SubjectReference, score: hundredths }`. Each valid dated rated subject occurs once. Work order within a quarter is canonical date then subject ID. count equals works.length. Quarter means remain backend statistics output. Unknown/monthless dates and zero/unrated scores produce no dot; partial month dates retain their precision. Series timeline remains empty. Timeline is invariant under detail view/search/page changes.

Frontend separately computes line positions from quarters and dot positions from works. Within a quarter, index i of n uses (i+1)/(n+1), as the oracle does. Tooltips show name, original date, work score and supplied quarter mean. All hover/focus/arrow navigation operates on works. Seasons are 冬季/春季/夏季/秋季 and labels disappear when quarter width is below 24px.

## Ownership and writable paths

- Contracts owner: contracts/schemas/person-detail/success-envelope-v1.schema.json; contracts/goldens/api/person-detail/**; generated frontend/src/api/generated/person-detail/** and only generated person-detail blocks/files emitted by frontend/scripts/generate-person-detail-wire.mjs. Read generator before running; preserve unrelated query-wire changes.
- Backend owner: backend/internal/persondetail/{types.go,build.go,clone.go,cache.go,*_test.go}; backend/internal/statistics/rating.go/types.go only if an exported date/score primitive is necessary, with corresponding tests. Prefer existing canonical helpers. No Archive/runtime/service changes.
- Primary: frontend/src/features/person-detail/components/RatingEvidence.vue; frontend/src/features/person-detail/person-detail.css; frontend/tests/features/person-detail/components.test.ts; frontend/tests/api/person-detail* only if required; DESIGN.md Charts paragraph; tmp-formal-development/backend-development-implementation-guide.md timeline paragraph; this change and three named root specs.
- Read-only: PRODUCT.md, accepted decisions, oracle, all unrelated dirty files/data/operations. Mutable refs: none. Deletion complement: aggregate-dot rendering and Qx presentation only, never quarter averages or evidence.
- Local QA runtime only: primary may build `.tmp/rating-work-points/api-linux`, preserve `/root/.local/share/bgmss-local/api` as `api.before-rating-work-points-20260908`, and restart the existing WSL development API on 127.0.0.1:8080 through the existing backend.sh launcher with its image proxy. Runtime `api`, `api.pid`, and dedicated `rating-work-points` logs are the only external writable resources. Archive/current pointer and the concurrent profile-v2 rebuild are read-only. No production host mutation. Rollback reuses the retained binary and identical arguments/proxy.

## Risks / Trade-offs

Payload grows proportionally to rated works. Cache accounting and deep clone must include nested references/date/name and preserve cache isolation. Required schema field needs coordinated producer/consumer regeneration; do not silently accept omitted work evidence. No hidden truncation.

## Migration and validation

Contract and fixtures precede consumers. Primary reviewed against the user request: no invented points, frontend formulas or source mixing; no outstanding P0/P1 planning issue. Run strict change validation before apply. Run person-detail contract verification, generator reproducibility, Go persondetail tests and affected backend gate, frontend person-detail tests and affected frontend gate, desktop/mobile live QA, keyboard/tooltip checks, git diff --check. Record failures as failures and stop if repair would expand scope. Sync/archive only after acceptance is complete. Local dev restart if needed uses existing configuration and preserves rollback binary; no production deployment.
