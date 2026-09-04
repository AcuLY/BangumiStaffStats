## Task Boundary

| Field | Boundary |
|---|---|
| Status | Revised plan pending strict validation and review |
| Owner | Primary agent, frontend presentation |
| Writable paths | Exact paths listed in `proposal.md` |
| Read-only protected inputs | Product/design authorities, theme override, request/store/API code, tests outside the three declared test paths, Naive UI source, oracle commit |
| Deletion complement | Only superseded untracked `frontend/tests/shared/skeleton-shimmer.test.ts`; no tracked file/state/dependency deletion |
| Mutable refs | No commit, remote ref, PR, release, deployment, host, service, or production state |
| Consumes | Existing Naive UI Skeleton, theme override, and loading wrappers |
| Produces | One Skeleton primitive, reduced-motion class, layout-faithful initial ranking pending state, inventory entry, focused tests |
| Dependencies | Provider/theme -> Naive UI Skeleton -> feature layout wrappers |
| Deliverables | Strict-valid artifacts, bounded conversion, focused/rendered evidence |
| Acceptance | Strict spec; focused Skeleton/ranking/affected tests; typecheck; build; diff check; one bounded full check; Browser pending/ready desktop/mobile/reduced-motion |
| Non-goals | State timing, copy, non-ranking geometry, theme values, spinners, requests, data, dependencies, operations |
| Operations deferred | Push, PR, merge, release, deployment, activation, host mutation |
| Stop/rollback conditions | Stop on mismatch, protected-input edit, state/geometry/a11y regression, console error, or scope expansion. Use exact patches only; forbid destructive Git, broad deletion, `git add -A`, and undeclared writes. |

## 1. Revised admission — primary agent; OpenSpec paths

- [x] 1.1 Verify branch, baseline HEAD, allowed prior uncommitted Skeleton diff, exact writable paths, and no conflicting active change.
- [x] 1.2 Strict-validate the revised change and record a zero-P0/P1 main-agent planning review.

## 2. Naive UI conversion — primary agent; declared Vue and CSS paths

- [x] 2.1 Recheck Task 1 admission and inspect every current custom/Naive Skeleton consumer before editing.
- [x] 2.2 Convert all custom ranking, candidate pagination, person-detail, partner, co-star, and SafeImage loading leaves to `NSkeleton`; add `app-skeleton` to existing instances and preserve wrappers, dimensions, status text, and busy semantics.
- [x] 2.3 Remove custom Skeleton gradients, `ranking-shimmer` keyframes/references, and redundant feature motion rules; centralize reduced-motion suppression on `.app-skeleton`.
- [x] 2.4 Replace the superseded shimmer test with `skeleton-system.test.ts` and register it in `frontend/scripts/check-architecture.mjs`.
- [x] 2.5 Update the directly affected co-star assertions from custom Skeleton tags/media blocks to Naive UI roots and centralized reduced motion.
- [x] 2.6 Align the initial ranking pending wrapper with the ready summary/toolbar/column/row/pagination topology using only direct `NSkeleton` leaves and the current Draft personal/global scope.
- [x] 2.7 Add focused ranking component coverage for personal/global topology, page-size-bounded rows, one polite status, decorative hiding, and absence of pending controls or fabricated results.

## 3. Focused and rendered verification — primary agent; no additional writable paths

- [x] 3.1 Re-run the focused Skeleton test, ranking/person/co-star component tests, typecheck, build, and `git diff --check` after the compatibility correction; fix only in declared paths.
- [x] 3.2 Use the Browser plugin on the existing branch server to compare real pending/ready ranking geometry at desktop/mobile and verify partial/image loading plus reduced motion; confirm page identity, non-blank DOM, no overlay, healthy console, matching tracks/heights, only `skeleton-loading`, and `animation: none` under reduced motion.
- [ ] 3.3 Run one complete frontend `npm run check`, then sync/archive the accepted OpenSpec, validate all strictly, inspect the final diff, and report lifecycle states accurately.

## Compatibility Evidence — 2026-09-02

- Compatibility implementation: initial ranking pending now uses the ready controls/list/pagination wrappers and current Draft scope, while all 87 visible personal-mode placeholder leaves are direct `.n-skeleton.app-skeleton`; no custom placeholder component, gradient, or keyframe was reintroduced.
- Focused automation: Skeleton ownership plus ranking tests passed 2 files / 13 tests. The complete affected ranking/person/co-star set passed 6 files / 54 tests. Typecheck, production build, `git diff --check`, strict change validation, and Impeccable layout detection passed.
- Desktop Browser at 1185px: after deferred CSS stabilized, pending/ready left-pane width and tracks matched; header heights were approximately `112/114`, row heights `72/72`, footer heights `80/80`; 10 rows, four personal metrics, one polite status, zero pending controls, and no horizontal overflow.
- Mobile Browser at 390px: pending/ready tracks matched; header heights were approximately `112/111`, row heights `80/81`, footer heights `68/68`; no horizontal overflow.
- Motion: normal Naive UI animation was only `skeleton-loading` at `2s`; under `prefers-reduced-motion: reduce`, the same leaves remained visible with `animation-name: none` and `0s` duration.
- Partial view: summary and search stayed visible while five row and one pagination `NSkeleton` leaves rendered; no ready rows leaked into the bounded pending region.
- This pass did not complete an uncached SafeImage Browser capture because the page-2 request returned the existing `查询暂时无法完成，请稍后重试`. Source ownership coverage still confirms `SafeImage` loading uses `NSkeleton`. Task 3.2 was concurrently marked complete by another execution and was preserved rather than rewritten.
- Full gate: the one authorized `npm run check` attempt stopped at the known Windows path baseline, `leaf component instantiates a store: src\\app\\App.vue`. No protected architecture or artifact script was modified to conceal it; task 3.3, spec sync, and archive remain open.
- Console: no Skeleton-related error or warning occurred. Two pre-existing PositionSelector duplicate-key warnings (`staff:anime:3`, `staff:anime:10`) were observed and kept out of scope.
- Lifecycle: investigated, specified, and implemented are complete; this pass verified focused/ranking Browser compatibility, but complete change verification remains open on task 3.3; committed, pushed, merged, released, and deployed remain false.
