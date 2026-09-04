## Task Boundary

| Field | Boundary |
|---|---|
| Status | Local cross-component implementation; heavy gates deferred |
| Owner | Contracts -> Backend -> Frontend; primary agent accepts |
| Writable paths | Exact proposal paths and ownership-transfer notes |
| Read-only protected inputs | Other wire graphs/services, catalog/query authority, Archive data, external state |
| Deletion complement | Preserve single mode/counts/selection/share/errors/tests |
| Mutable refs | Current worktree; loopback Backend only after focused checks |
| Consumes | PositionResults, statistics/cache, generated DTOs, selection owner |
| Produces | All-position wire/core/page/default UI |
| Dependencies | Existing generators/Go/Vue/Naive UI; no package |
| Deliverables | Contracts/generated, Backend, Frontend, focused acceptance |
| Acceptance | Correct union/order/rank/limits/single mode/responsive behavior |
| Non-goals | Query/analysis/dependency/deploy changes |
| Operations deferred | Full gates, sync/archive, Git/release/deploy |
| Stop/rollback conditions | Ownership/wire/union/order/limit/single-mode/check failure |

Forbidden: reset/checkout rollback, git clean, broad deletion/staging,
`git add -A`, undeclared writes, external mutation, and production operations.

## 1. Contracts owner

- [x] 1.1 Preflight branch/HEAD/dirty state, active ownership transfers, reviewed
  artifacts, and strict validation; stop on mismatch.
- [x] 1.2 Reconcile PRODUCT/DESIGN/sidecar and add nullable all-position input,
  nullable response position, item positionKeys, OpenAPI, and goldens.
- [x] 1.3 Regenerate isolated Go/TypeScript Candidates consumers and prove
  unrelated generated inventories do not drift.

## 2. Backend candidates owner

- [x] 2.1 Preflight exact candidate files/generated DTOs and freeze unrelated
  Backend work; stop on overlap.
- [x] 2.2 Normalize/cache nullable position input and construct an immutable
  all-position person union with ordered matching keys and unioned works.
- [x] 2.3 Project/marshal all and single modes, preserving counts/ranks/search/
  pagination, and add focused request/build/view/cache/projection/service tests.

## 3. Frontend co-star owner

- [x] 3.1 Preflight adapter/coordinator/share/picker/selection/App slices and
  preserve existing active-change outputs.
- [x] 3.2 Decode/validate nullable position and item keys, default candidate
  primary/view state to all mode, and replay null share input exactly.
- [x] 3.3 Make “全部职位” first/default, remove “浏览职位”, render row identities,
  and atomically toggle/default-select returned identity sets within limits.
- [x] 3.4 Add focused API/coordinator/share/component/App tests for all/single,
  view operations, default first two, limits, and responsive state.

## 4. Focused acceptance and deferred lifecycle

- [x] 4.1 Run Candidates schema/golden/generator checks, focused Go/Node/Vitest,
  Vue typecheck/build, strict coordinated OpenSpec validation, detector, and
  `git diff --check`; record investigated/implemented/verified separately.
- [x] 4.2 Rebuild/restart only the existing loopback Backend, browser-check
  desktop/compact all-default and single switching with clean logs/overflow.

  Evidence: Candidates golden verification passed 16 cases; isolated frontend
  Candidates and query-wire drift checks passed; focused Go candidates/httpapi
  passed; focused Vitest passed 113/113; Vue typecheck/build passed; detector
  returned `[]`; `git diff --check` passes. The Windows-native Go 1.26.5 build
  replaced only loopback 8080 and returned `/readyz` 200 under PID 20960.
  At 961x807 a Director+Voice query defaulted to “全部职位” with 2344 unique
  people; Justin Roiland rendered one rank-501 row with Director/Voice and one
  activation added both identities. Switching to Director preserved the 259
  single-position count. At 390x844 the Drawer/selector measured 390px, showed
  no “浏览职位”, and document scrollWidth equaled clientWidth. Clean reload added
  no new warn/error; retained Naive global-style entries came from HMR only.
- [ ] 4.3 In the later accumulated batch only, run complete gates, sync/archive,
  and keep committed/pushed/merged/released/deployed false unless authorized.
