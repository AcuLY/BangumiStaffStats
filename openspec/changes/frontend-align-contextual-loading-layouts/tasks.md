## Task Boundary

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

## 1. Primary scope and loading controls
- [x] 1.1 Verify branch/HEAD/allowed dirty baseline and strict-valid reviewed artifacts before edits.
- [x] 1.2 Update PRODUCT/DESIGN for selector/pagination/contextual loading; wire App lazy fallbacks and stable submitted presentation inputs; update shared inventory/assertions.
- [x] 1.3 Verify query controls, lazy ranking/candidate/analysis transitions and responsive parent-context screenshots.

## 2. Ranking owner
- [x] 2.1 Verify scope, shared dirty baseline and reviewed artifacts before edits.
- [x] 2.2 Implement shared columns/rows/full skeleton, known work-unit label and real/hidden pagination in ranking components.
- [x] 2.3 Run focused ranking tests and hand off exact files plus rendering expectations.

## 3. Work-card owner
- [x] 3.1 Verify scope, preserve previous person-detail CSS/tests, and read reviewed artifacts before edits.
- [x] 3.2 Implement shared WorkCardsSkeleton and integrate PersonItemBrowser detailed/compact works/series/characters; preserve ready geometry.
- [x] 3.3 Run focused person-detail tests and hand off consumer interface.

## 4. Co-star owner
- [x] 4.1 Verify scope, protected pagination file and reviewed artifacts before edits.
- [x] 4.2 Implement detailed candidate, partner and co-star skeletons; share initial/view rows and remove pagination placeholders; integrate WorkCardsSkeleton.
- [x] 4.3 Run focused co-star tests and hand off eager fallback interfaces and screenshot cases.

## 5. Primary integration and delivery
- [x] 5.1 Audit actual diffs and run focused integration plus complete affected frontend gate with pinned tools; record exact results.
- [x] 5.2 Render desktop/mobile/light/dark states, check padding using actual parent context, keyboard, console and built artifact; regenerate deduplicated review gallery and open it.
- [ ] 5.3 Sync accepted delta specs, archive this completed change, run openspec validate --all --strict and git diff --check; report precise lifecycle states.

## Verification evidence (2026-09-06)

- Existing master at 3612f50, ahead of origin by 48, preserved. Preexisting person-detail correction retained; unrelated AdaptivePagination and local data/log files untouched.
- Focused: ranking 26/26, person detail 19/19, co-star 46/46, primary query/App/shared 53/53 passed.
- Complete unit run: 473/473 passed. Final bundle/portrait source rerun passed 469 tests; four process-timeout cases during concurrent screenshot capture were rerun with file parallelism disabled, and all 15 tests in their two suites passed. Every final-source test is covered by passing evidence.
- npm ci --ignore-scripts --no-audit --no-fund succeeded with Node24.18.0/npm11.16.0. Production build and check:artifact passed on final presentation: initial JavaScript gzip304460 <307200 bytes.
- Seven query/catalog/rankings/candidates/person-detail/partners/co-star generated wire gates passed; query Unicode gate is blocked by preexisting DerivedAge.txt byte/hash drift. A Git-LF contract snapshot passes authority reading but then detects an existing generated Unicode table drift.
- Original npm run check stops on the two preexisting untracked frontend vite log files. A temporary source-only copy passes architecture ownership and the updated five-surface recovery check (190 files). No local logs were moved or deleted.
- Artifact packaging tests remain blocked by existing VERSION CRLF. A Git-LF authority copy reaches an existing OpenAPI digest mismatch. No unrelated release authority or contract bytes were changed to bypass these gates.
- Main specs synchronized to the accepted user changes. Archival remains pending while the aggregate gates above are unresolved; no commit, push, merge or deployment occurred.

- Built `/v2/` browser smoke with controlled contract responses passed: loading NSelect has no Skeleton; submitted series heading and five ranking rows are present; no pagination Skeleton; desktop retains app-main gutter and 8px 12px row padding, mobile uses the accepted -12px workspace margin; mobile Inspector opens from the actual row keyboard action and Escape closes it; system dark follows; no horizontal overflow or console/page errors.
- `openspec validate --all --strict`: 79 passed, zero failed (CLI telemetry delivery errors do not change the validation result).

- Final review gallery: `http://127.0.0.1:13821/`, offline ZIP under the thread visualization folder `skeleton-review-v2/`. 28 distinct layout variants, 19 viewport widths, Light/Dark, exact 480/481/700/701px detail containers. Initial/view aliases and page-size repeats are consolidated; 34 pixel-identical viewport captures are additionally merged. Context, ready, refresh and bottom evidence are optional attachments on the same card, not repeated skeleton families.
- Gallery verification: all 1096 capture cases completed with no page errors, warnings, or document overflow. Partner skeleton avatar measured36x48; candidate geometry preserved. Family search, themed/dimension views, context/ready comparisons, original images, keyboard navigation and ZIP validated. No production source was changed during capture.

## 6. Review revision (2026-09-08)
- [x] 6.1 Primary: reconcile current authorities and strict-validate the revised loading rules.
- [x] 6.2 Primary: reverse superseded shared control/pagination patches and restore App known-heading forwarding.
- [x] 6.3 Ranking: keep real known summary/header/toolbar with only dynamic number/row placeholders; verify consumers/tests.
- [x] 6.4 Detail: reverse only current-turn fixed-label/control/pagination patches, preserving full Tag placeholders; leave detail skeleton read-only and recapture current implementation.
- [x] 6.5 Co-star: reverse only current-turn fixed-text/control placeholders, preserve dynamic content, complete Tag shapes and vertical chart.
- [x] 6.6 Primary: verify current rendered states, regenerate the grouped gallery without cast duplication, sync revised main specs and record current gate results.

## Current review verification (2026-09-08)

The final user decision is dynamic-information-only Skeleton. Superseded control/fixed-label/pagination patches were individually reversed; full Tag placeholders and prior vertical bars are preserved. Ranking now uses real fixed summary labels and disabled toolbar with numeric values as placeholders. PersonDetailSkeleton remains read-only per user choice during concurrent edits.

- Shared/app/person-detail focused run: 43 passed. Co-star focused run: 46 passed. Ranking focused run: 18 passed and the preexisting narrow two-line source assertion still fails against current one-line CSS.
- The first live type check found two errors in the new ranking fallback/tests; both were corrected. Subsequent live typecheck/build is blocked by concurrent removal of query/share while AppHeader/tests still import it; those unrelated files were not changed.
- A unified source snapshot at 2026-09-08 16:36:24 Asia/Shanghai renders all 32 initial desktop/mobile smoke cases without errors/warnings and its Vite production build and application-only Vue type check pass. The ranking page-size type-only correction is included. Final gallery: 16 grouped frameworks, 19 widths plus detail container boundaries, 616 observations / 597 unique skeleton images, zero errors/warnings/document overflows. Long-region capture was repaired by removing only outer page-scroll clipping and verifying unchanged component dimensions; no production layout was altered for screenshots.
- Dynamic-only browser checks confirm real ranking headings/toolbars, two numeric summary placeholders, real work/candidate controls and pagination, retained search input/value, full Tag dimensions and ten vertical chart bars. Ordinary/cast detail and candidate frame aliases are grouped. Gallery modal/search/theme/viewport/keyboard/mobile checks pass; served at http://127.0.0.1:13822/ with the offline ZIP in skeleton-review-20260908-dynamic.
- Existing aggregate architecture/Unicode/artifact acceptance history remains recorded above; this task does not repair unrelated blockers or claim archival.

## Latest detail alignment follow-up
- [x] Align the detail loading DOM with current production profile/metrics/section CSS; preserve fixed labels and real disabled controls and full Tag shapes.
- [x] Reuse work-card loading for the pending detail list and add preference/chart structure; forward accepted work-unit/section/page size to loading inputs.
- [x] Verify ready/loading geometry across widths, themes and container boundaries and replace only the grouped detail gallery evidence.

Detail follow-up validation: 29 focused tests passed; live application Vue type check and Vite build passed. Browser compared 168 current ready/loading cases across 19 widths, light/dark, personal subject/series, global subject/character and 480/481/700/701px containers. Portrait dimensions/radius, profile padding/columns, metric columns/cell heights matched; no page errors or document overflow; all ten loading chart bars have nonzero height. The existing gallery retains one detail framework with updated ready/bottom/global/series attachments, and records its separate update time. No ready layout, backend, contract, dependency or Git ref change was made by this follow-up.

## Production route integration verification

The approved current design is already implemented in the production PersonDetailSkeleton, PersonInspector and App loading entry points. Verified the actual localhost:5174/ranking?user=lucay126 page against real backend responses, temporarily holding request dispatch only to observe pending states. Initial director query, switching people, changing page size, next-page updates, mobile drawer pending/ready and Tab/Escape all passed. Detail paging retained the resolved profile and real pagination while only list rows showed Skeleton. Fixed labels/controls remained real, complete Tag geometry passed, no browser page errors or document overflow were observed. Evidence is in the thread visualization directory person-detail-production/verification.json with real pending/ready screenshots. No additional production source change was needed after this audit; no commit, push or deployment was performed.

## Co-star initial query loading correction

- [x] Connect analysis placeholders to both CandidateWorkspaceSkeleton fallbacks and the loaded CoStarWorkspace while a core candidate query is pending. Reuse the existing asynchronously warmed partner/co-star skeletons, preserving the initial bundle boundary.
- [x] Represent unknown participants without fabricated identities or a zero-person result; keep the candidate view-update path independent from resolved analysis.
- [x] Verify initial queries, changed queries, candidate view updates, module waiting and candidate-to-analysis request handoff. App integration: 16 passed; two related co-star component suites: 38 passed. Vue typecheck and Vite build passed.
- [x] Verify the real localhost:5174/co-star?user=lucay126 route at 1440px and 390px using real backend responses with held request dispatch. Both pending stages render, analysis starts only after candidates, desktop candidate search retains analysis, mobile picker stays collapsed after automatic selection, no page errors/overflow. Evidence: co-star-query-loading/verification.json and actual route screenshots in the thread visualization directory.

This corrects a missing presentation branch only. Backend/coordinator query semantics, selected identities, fixed controls, full Tag placeholders and request budgets are unchanged. No commit, push or deployment performed.

## Skeleton consistency audit

Rechecked current loaded and loading surfaces using rendered DOM boxes, preserving real controls/static labels and complete Tag placeholders. Corrected mobile ranking row height (80→68px), ranking metric line boxes, missing pending character-count summary, candidate identity line boxes (34→38.08px), partner mobile secondary-line visibility (82→76px), partner source/summary/module line boxes, co-star identity wrapping and default sort labels, obsolete generic work-card role rows, character appearance wrappers, and compact work-row height (57→56px). Pure staff work cards no longer reserve the removed 参与职位 area; cast context reserves the current 配音角色 structure.

Validation: 144 main ready/pending pairs (288 renders), 384 co-star/partner renders, and48 work/character renders. Audited stable boxes match with no browser page errors or horizontal overflow. Diagram shape, tag/member/result counts, text length and auto-fit differences are explicitly excluded from a pixel-equality claim. The accepted compact vertical co-star loading chart is preserved; real plot height depends on available/visible data series. Current type check and Vite build passed. Focused test sweep plus the targeted co-star rerun covers128 passing tests out of130; two App drawer inert assertions remain failing, outside the changed geometry logic. No claim of full integration-gate success is made.

Review artifact: http://127.0.0.1:13822/consistency.html ; report has32 current screenshot pairs, viewport/theme controls and explicit remaining differences. Evidence JSONs are under the thread temporary consistency-audit folder and copied with the report. No commit/push/deployment.