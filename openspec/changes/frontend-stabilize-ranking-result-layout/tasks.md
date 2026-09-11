> Supersession (2026-09-08): `contracts-remove-query-sharing` retires the query-sharing feature and overrides the sharing-specific requirements, preservation clauses, and acceptance assumptions below. URL fragments are cleared without parsing or replay. Header now has an always available same-tab “回到旧版” link to `https://search.bgmss.fun/old/` immediately left of theme. Exact accepted workspace recovery remains frontend-local through validated v2 JSON session storage; v1 fragment-based storage is discarded. Completed evidence below remains historical, and unrelated requirements are unchanged.

## Task Boundary

| Field | Boundary |
|---|---|
| Status | Planned; implementation blocked until strict validation, ownership transfer, and zero-P0/P1 review |
| Owner | Frontend primary agent |
| Writable paths | Exact proposal paths only |
| Read-only protected inputs | Product/design/coordinator/contracts/components/unrelated dirty paths/external state |
| Deletion complement | Preserve all resource/selection/share/drawer/skeleton/scrollbar behavior and unrelated work |
| Mutable refs | Current local dirty `codex/remove-archive-admission` only |
| Consumes | Existing resource phases, selected ID, detail skeleton, root scrollbar |
| Produces | Stable detail bridge, 320px reflow, tests/evidence |
| Dependencies | Existing App/components/native CSS only; no package |
| Deliverables | Spec/code/tests/focused/build/browser evidence |
| Acceptance | One detail request; no full-width frame; skeleton until detail settles; zero/share/compact preserved; 320–330 no overflow; clean console/diff |
| Non-goals | Query/API/data changes, delay/animation/redesign/Figma/broad cleanup/deploy |
| Operations deferred | Full accumulated gate, sync/archive, commit/push/release/deploy/host mutation |
| Stop/rollback conditions | Request/state/share/drawer/empty regression, false loading, scrollbar-owner change, unrelated overlap, failed focused gate |

Forbidden: reset/checkout rollback, `git clean`, `git add -A`, broad deletion, undeclared writes, external mutation, and production operations.

## 1. Planning and ownership — primary

- [x] 1.1 Verify branch `codex/remove-archive-admission` at `411f54bbd631d01600baf56962ab2ae4a4d0f122`, preserve the enumerated dirty worktree, transfer only the exact App/ranking-test and root-CSS/scrollbar-test slices from the two prior changes, review all follow-up artifacts with zero P0/P1 findings, and pass strict validation before implementation. Evidence: exact dirty paths and prior owners were inspected; transfer notes were added; the follow-up and both source changes are strict-valid; `git diff --check` passes; review found zero P0/P1 planning issues.

## 2. Focused regressions and implementation — Frontend

- [x] 2.1 Extend `frontend/tests/app/rankings.integration.test.ts` so ready ranking rows must coexist with `PersonDetailSkeleton` while the exactly-once first-person detail request is deferred, then switch without `ranking-workspace--single`; preserve empty/share/compact assertions.
- [x] 2.2 Extend the App companion-skeleton projection to include selected detail pending on desktop, without changing coordinator state, request timing, automatic person choice, refresh, share, or Drawer behavior.
- [x] 2.3 Change root minimum sizing in `frontend/src/shared/styles/base.css` to respect scrollbar-reduced client width and add the corresponding invariant to `frontend/tests/shared/scrollbar-system.test.ts`; keep the viewport vertical scrollbar owner and do not hide overflow.

## 3. Focused acceptance and lifecycle — primary

- [x] 3.1 Run the focused ranking integration and scrollbar tests, Vue typecheck, Vite build, Impeccable detector, strict validation, and `git diff --check`; stop on relevant failure. Evidence: the two new exact regressions passed; exact share-without-detail and zero-result tests passed; pinned Node 24.18.0/npm 11.16.0 typecheck/build passed; detector returned `[]`; strict validation and diff check passed. The broader dirty test files retain unrelated pre-existing failures, including a compact test that still expects a removed Drawer bar button; the App correction is desktop-gated and does not touch that chrome.
- [x] 3.2 In the current in-app Browser, run a changed desktop primary query and record the ranking-pending -> ready-ranking/detail-pending -> detail-ready sequence, then verify 320/328/329/330 plus representative 352/390/780/893 widths, controls, overflow, interaction, framework overlay, and console. Evidence: recorded states at 330ms, 851ms, and 1307ms kept two-column geometry; ready ranking plus right skeleton preceded real detail with no single-column frame. At 320/328/329/330, page scroll width equaled client width; 352/390/780/893 retained their accepted layouts. A fresh tab had meaningful content, no overlay, and zero console warnings/errors.
- [x] 3.3 Audit exact owned diffs and report investigated/specified/implemented/verified/committed/pushed/merged/released/deployed separately; do not perform deferred lifecycle actions. Evidence: owned implementation is limited to App's derived desktop companion-pending projection, the two root minimum declarations, and the two focused regression slices; ownership notes and the new change are the only planning additions. Investigated/specified/implemented/focused-verified are complete; committed/pushed/merged/released/deployed are false.

`frontend-auto-open-ranking-detail` may change only the later first-query and
complete-zero interior presentation plus primary ranking pending topology. This
completed change continues to own companion-detail timing and root-width slices.
