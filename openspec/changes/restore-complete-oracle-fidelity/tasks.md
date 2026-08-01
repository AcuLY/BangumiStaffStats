## Task Boundary

| Field | Boundary |
| --- | --- |
| Status | Design approved; apply blocked until Tasks 1.1–1.4 are complete and the planning commit is clean. Each later group distinguishes investigated, implemented, verified, and committed; pushed/released/deployed remain false. |
| Owner | Primary agent is the sole owner. Backend and frontend groups execute sequentially because the user disallows subagents. |
| Writable paths | Only paths declared in proposal/design and repeated in each group. Any additional production path requires proposal/design/task amendment, strict validation, explicit review, and a new planning commit before edit. |
| Read-only protected inputs | Oracle `644b7748674e553f863d0ffd61d029f86fdc0717`; authorities; accepted contracts/specs; generated wire; completed compact-scroll change; dependencies/lockfiles; updater; operations; external repos; remotes; hosts/services/deployments. |
| Deletion complement | No capability, route, API, business field, accepted test, or approved addition deletion. Only duplicated oracle-incompatible presentation can be removed while retaining its capability. Only evidence inside the declared ignored audit root can be regenerated/cleaned. |
| Mutable refs | Local topic-branch commits, declared source/tests, backend projection values, Vue local presentation state, and ignored loopback evidence/processes. |
| Consumes | Approved planning artifacts, immutable oracle, audit evidence, accepted schemas, raw local API, current source/tests, pinned tools. |
| Produces | Contract-valid flows, difference ledger, TDD repairs, production-browser matrix, green full gates, final report, local phase commits, synchronized archived change. |
| Dependencies | `4bfbc19`; current baseline; accepted backend/frontend capabilities; immutable oracle. Direction: contracts → backend → strict adapters → feature models → components → browser evidence. |
| Deliverables | Tasks 1–12 and their recorded evidence. |
| Acceptance | Exact commands below plus complete browser matrix, zero unclassified outward difference, strict OpenSpec/all-spec/diff status, and clean final worktree. |
| Non-goals | New capability, schema/contract change, dependency addition, prototype source copy, unrelated refactor, operations. |
| Operations deferred | Push, PR, merge, release, deploy, host/service/public-route mutation, production data mutation, legacy retirement. |
| Stop/rollback conditions | Stop on branch/HEAD mismatch with unexpected dirty state, out-of-scope path, authority conflict, schema-change need, overlapping owner, unreproducible finding, third failed hypothesis, or materially expanded failure. Never use `reset --hard`, checkout-based rollback, `git clean`, `git add -A`, broad recursive deletion, or writes outside declared paths. Roll back only an exact owned slice. |

## 1. Planning Baseline — owner: primary agent; writable: this OpenSpec change only

- [x] 1.1 Preflight: ran `git status --short --branch`, `git rev-parse HEAD`, `git worktree list --porcelain`, and `npx --yes @fission-ai/openspec@1.6.0 status --change restore-complete-oracle-fidelity --json`; confirmed linked worktree branch `codex/post-production-frontend-fixes` at planning parent `4bfbc19` and removed only tool-created untracked prior-change metadata before proceeding.
- [x] 1.2 Reviewed proposal, delta spec, design, and tasks against `AGENTS.md`, PRODUCT/DESIGN authority order, immutable oracle hash, accepted capability names, exact writable paths, deletion complement, and user-approved “external parity / internal rewrite” boundary; zero unresolved P0/P1 findings remain.
- [x] 1.3 Ran `npx --yes @fission-ai/openspec@1.6.0 validate restore-complete-oracle-fidelity --strict`, `npx --yes @fission-ai/openspec@1.6.0 validate --specs --strict`, and `git diff --check`; change validation and all 53 accepted specs passed.
- [ ] 1.4 Stage exact planning paths only, inspect `git diff --cached --stat` and `git diff --cached --check`, and commit the approved planning baseline. Do not push.

## 2. Deterministic Baseline and Difference Ledger — owner: primary agent; writable: ignored audit root and task markers

- [ ] 2.1 Preflight: record branch/HEAD/allowed dirty paths and verify Tasks 1.1–1.4 plus strict artifact status; stop on mismatch.
- [ ] 2.2 Run the current backend gate and pinned frontend baseline with Node `24.18.0`/npm `11.16.0`; record every pre-existing failure without changing source: backend repository check, focused/full Vitest with deterministic worker settings, `npm run typecheck`, `npm run check`, and `npm run build`.
- [ ] 2.3 Verify the oracle runtime and current local candidate URLs, extract the exact oracle commit into the ignored evidence root if absent, and start only tracked loopback processes; record session IDs/PIDs and readiness probes.
- [ ] 2.4 Replace the old transformed audit path with a new ignored `frontend/.tmp/oracle-parity-restoration-2026-08-01/` evidence root; preserve old evidence read-only.
- [ ] 2.5 Generate `difference-ledger.json` and `difference-ledger.md` containing mode/theme/viewport/state/data identity, oracle/current selectors, classification, governing authority, allowed delta bounds, test owner, evidence path, and initial status for every observed difference.
- [ ] 2.6 Run a baseline production-browser capture at 390×844, 779×900, 780×900, 781×900, and 1024×768 in Light/Dark for initial, query-open, ranking-ready, person-ready, and applicable co-star states; confirm the ledger reproduces every known P0/P1 defect.
- [ ] 2.7 Syntax-check all ignored harness scripts, parse every generated JSON, and verify every referenced screenshot is decodable. Mark baseline investigated; do not commit ignored evidence.

## 3. Candidates Raw-Wire Repair — owner: primary agent; writable: `backend/internal/candidates/{types.go,projection.go,*_test.go}`, `backend/internal/httpapi/candidates_handler_test.go`, task markers

- [ ] 3.1 Preflight: record branch/HEAD/allowed dirty paths, confirm no overlap in candidate owners, and re-run strict change status; stop on mismatch.
- [ ] 3.2 RED: add a focused projection or handler regression proving `summary.positionCounts` currently emits `PositionKey`/`Count` rather than accepted `positionKey`/`count`; run the exact package test and record the expected failure.
- [ ] 3.3 GREEN: implement the smallest wire-safe projection correction at the JSON projection boundary without frontend normalization, generated-file edits, schema changes, or transport leakage into unrelated domain owners.
- [ ] 3.4 Verify exact member spelling, global/personal envelopes, empty/non-empty position counts, deterministic marshaling, and existing candidates service/handler suites with `go test` on affected packages.
- [ ] 3.5 Run the repository backend gate and candidates contract artifact/wire checks; run `git diff --check` and inspect the exact owned diff.
- [ ] 3.6 Stage only the candidate repair/test/task paths, inspect staged diff/check, and create a local phase commit. Do not push.

## 4. Person-Detail Raw-Wire Repair — owner: primary agent; writable: `backend/internal/persondetail/{types.go,service.go,projection.go,*_test.go}`, `backend/internal/httpapi/person_detail_handler_test.go`, task markers

- [ ] 4.1 Preflight: record branch/HEAD/allowed dirty paths, confirm no overlap in person-detail owners, and re-run strict change status; stop on mismatch.
- [ ] 4.2 RED: add a focused service/projection/handler regression proving a fresh personal response currently serializes `meta.collection.warningCodes` as `null`; run the exact test and record the expected failure.
- [ ] 4.3 GREEN: allocate/copy the empty warning slice at the owning service/projection boundary so fresh responses emit `[]`, while preserving stale warning values and global omission.
- [ ] 4.4 Verify global/personal envelope separation, fresh/stale warning values, deterministic marshaling, and existing person-detail service/handler suites with affected-package `go test`.
- [ ] 4.5 Run the repository backend gate and person-detail contract artifact/wire checks; run `git diff --check` and inspect the exact owned diff.
- [ ] 4.6 Stage only the person-detail repair/test/task paths, inspect staged diff/check, and create a local phase commit. Do not push.

## 5. Raw Flow and Contract Gate — owner: primary agent; writable: ignored audit root and task markers

- [ ] 5.1 Preflight: record branch/HEAD/allowed dirty paths and confirm candidate/person-detail phase commits; stop on mismatch.
- [ ] 5.2 Rebuild and restart only tracked loopback backend/frontend candidates as needed; verify readiness and preserve unrelated processes.
- [ ] 5.3 Run candidates and person-detail raw live schema probes with no interception or response transform; require HTTP success plus accepted-schema validation and record exact failure paths if any.
- [ ] 5.4 Exercise raw current ranking→person-detail and ranking→candidate→co-star flows in the production bundle; require ready states and no adapter parse error, console error, failed required resource, or direct upstream browser request.
- [ ] 5.5 Remove every response-transform hook from the new final audit harness and prove its source contains no casing/null normalizer; update ledger flow blockers to `GREEN_VERIFIED`.

## 6. Header and Query Workspace Parity — owner: primary agent; writable: `frontend/src/app/{App.vue,AppProviders.vue}`, `frontend/src/features/query/**`, `frontend/src/shared/styles/base.css`, matching `frontend/tests/{app,features/query,shared}/**`, task markers

- [ ] 6.1 Preflight: record branch/HEAD/allowed dirty paths, read all current owner files and corresponding oracle rendered states, and verify no concurrent overlap; stop on mismatch.
- [ ] 6.2 Enumerate Header/Query differences for initial, populated, compact, desktop-overlay, apply/cancel/close, Light/Dark, and resize continuity states; cite each ledger authority before editing.
- [ ] 6.3 RED: add focused tests for oracle shell inset/order/copy, default field state, compact/desktop query topology, visible actions, focus entry/return, Escape/dismissal, Draft continuity, exact root/local scroll ownership, and responsive cleanup.
- [ ] 6.4 GREEN: make the smallest Header/Query template/style/lifecycle corrections while preserving dynamic catalog, sharing, refresh, strict adapters, one query owner, and commit `4bfbc19` compact behavior.
- [ ] 6.5 Run focused Query/App/shared tests under pinned Node; run affected browser cases at 360/390/779/780/781/1024 in Light/Dark with keyboard, wheel, resize, and scroll-position assertions.
- [ ] 6.6 Run `git diff --check`, inspect the exact owned diff for prototype/private-Naive selector coupling and unauthorized copy changes, update ledger entries, stage exact paths, and create a local phase commit. Do not push.

## 7. Ranking Parity — owner: primary agent; writable: `frontend/src/features/ranking/**`, `frontend/src/shared/{components/DeferredSurfaceState.vue,styles/base.css}`, matching `frontend/tests/features/ranking/**` and focused shared tests, task markers

- [ ] 7.1 Preflight: record branch/HEAD/allowed dirty paths, read every ranking owner and oracle ranking state, verify strict artifact status and no overlap; stop on mismatch.
- [ ] 7.2 Enumerate summary, toolbar, visible sort direction, row hierarchy/density, name/metric labels, progress, pagination, empty/search-empty/loading/error/retry, portrait delta, and compact/desktop differences in the ledger.
- [ ] 7.3 RED: add focused component/source tests for exact oracle copy/order, visible “降序” affordance, row geometry contracts, stable summary/result shell, pagination, and state boundaries without weakening existing server-authoritative data assertions.
- [ ] 7.4 GREEN: restore oracle-compatible ranking markup/styles/behavior; isolate approved portraits/extra evidence to their authorized slots and prevent them from moving or compressing preserved content.
- [ ] 7.5 Run pinned focused ranking/shared tests and production-browser ranking cases at all required widths/themes/states; require no page horizontal overflow and measure compact CLS against the oracle baseline.
- [ ] 7.6 Inspect exact diff and ledger, run `git diff --check`, stage exact paths only, and create a local phase commit. Do not push.

## 8. Person Inspector and Drawer Parity — owner: primary agent; writable: `frontend/src/features/person-detail/**`, focused shared owners already declared, matching `frontend/tests/features/person-detail/**`, task markers

- [ ] 8.1 Preflight: record branch/HEAD/allowed dirty paths, read all inspector/Drawer owners and oracle states, verify no overlap; stop on mismatch.
- [ ] 8.2 Enumerate identity, header/actions, metric grid, tabs, tags/ratings/preference, works/characters, search/sort/pagination, loading/empty/error, desktop panel, compact Drawer, focus/dismissal/continuity, and 779/780/781 differences.
- [ ] 8.3 RED: add focused tests for preserved oracle metric structure/copy/order, approved extra-evidence placement, exact compact/desktop ownership, Drawer focus/Escape/return, view continuity, and responsive metric readability.
- [ ] 8.4 GREEN: restore oracle-compatible inspector/Drawer presentation and interaction while rendering only server-authoritative data and retaining approved extra evidence after/in its documented slot.
- [ ] 8.5 Run pinned focused inspector tests and all required browser widths/themes/states; directly assert no single-character metric columns, clipping, overlap, duplicate controls, state loss, or page horizontal overflow at 779/780/781 and 200% zoom.
- [ ] 8.6 Inspect exact diff and ledger, run `git diff --check`, stage exact paths only, and create a local phase commit. Do not push.

## 9. Co-Star Picker and Analysis Parity — owner: primary agent; writable: `frontend/src/features/co-star/**`, focused shared owners already declared, matching `frontend/tests/features/co-star/**`, task markers

- [ ] 9.1 Preflight: record branch/HEAD/allowed dirty paths, read all co-star owner files and oracle empty/single/pair/group states, verify no overlap; stop on mismatch.
- [ ] 9.2 Enumerate candidate rail/Drawer, search/position counts, tray, empty/single/pair/group hierarchy, participant overview, KPIs, charts, shared works, works browser, responsive ownership, focus, and approved production evidence deltas.
- [ ] 9.3 RED: add focused tests for exact oracle topology/copy/order/control states, candidate→tray transitions, 1/2/3/4 participant boundaries, chart semantics, works controls, compact Drawer lifecycle, and responsive continuity.
- [ ] 9.4 GREEN: restore oracle-compatible co-star presentation/interaction while retaining strict raw APIs, dynamic position catalog, selection guards, server-authoritative statistics, and approved evidence in non-disruptive slots.
- [ ] 9.5 Run pinned focused co-star tests plus production-browser empty/single/pair/group cases at all required widths/themes; require no broken image, overflow, hidden action, duplicate ownership, invalid chart semantics, or state loss.
- [ ] 9.6 Inspect exact diff and ledger, run `git diff --check`, stage exact paths only, and create a local phase commit. Do not push.

## 10. Shared Accessibility, Theme, and Responsive Quality Floor — owner: primary agent; writable: declared shared components/styles plus affected feature owners/tests, task markers

- [ ] 10.1 Preflight: record branch/HEAD/allowed dirty paths, verify all visible-slice commits and no overlap; stop on mismatch.
- [ ] 10.2 RED: add focused tests/source checks for accessible input names, valid graph roles/ARIA, unique IDs, landmarks/headings, token-based contrast, keyboard-visible focus, invisible non-overlapping 44×44 hit targets, and Light/Dark parity.
- [ ] 10.3 GREEN: fix semantic labels/roles/relationships, accepted tokens, and invisible effective targets without changing oracle-visible geometry or adding unauthorized copy.
- [ ] 10.4 Run pinned affected tests and full axe/keyboard/zoom/overflow browser audit at all required widths/themes and applicable Drawers/overlays; require zero critical violation and no named prohibited defect from the spec.
- [ ] 10.5 Inspect exact diff and ledger, run `git diff --check`, stage exact paths only, and create a local phase commit. Do not push.

## 11. Suite Determinism, Architecture, Bundle, and Layout Stability — owner: primary agent; writable: declared App/feature/shared/test owners only, task markers

- [ ] 11.1 Preflight: record branch/HEAD/allowed dirty paths, reproduce the full-suite mount timeout, architecture failure, initial-JS overage, and ranking CLS with pinned tools/production artifact; stop if a failure is not reproducible.
- [ ] 11.2 For each reproducible gate defect, complete systematic-debugging phases: collect order/resource/chunk/timeline evidence, state one root-cause hypothesis, and write or select the failing gate before source changes.
- [ ] 11.3 GREEN: repair deterministic test isolation/worker ownership without blind timeout inflation; move store ownership out of `App.vue` if the architecture gate requires it; split only existing feature boundaries; reserve stable shell geometry to remove avoidable CLS without outward drift.
- [ ] 11.4 Run pinned full `npm run check`, standalone `npm run build`, architecture/wire/artifact checks, full Vitest with the repository-approved deterministic worker settings, and production performance samples; require initial JS gzip below 300 KiB and current compact CLS not materially worse than oracle.
- [ ] 11.5 Inspect exact diff and ledger, run `git diff --check`, stage exact paths only, and create one or more phase-sized local commits. Do not push.

## 12. Complete Production Parity Acceptance — owner: primary agent; writable: ignored evidence, report, and task markers

- [ ] 12.1 Preflight: record branch/HEAD/allowed dirty paths, verify every implementation group committed and strict change status; stop on mismatch.
- [ ] 12.2 Build the exact final production artifact under pinned Node/npm and start tracked loopback oracle/current/API candidates; verify readiness and record artifact hashes/inventory.
- [ ] 12.3 Execute both modes and themes at 360/390/516/768/779/780/781/917/1024/1185/1440 and all applicable initial/loading/ready/empty/search-empty/error/retry/pagination/sorting/query-open/person-Drawer/candidate-Drawer/single/pair/group states.
- [ ] 12.4 Execute interaction probes for apply/cancel/close, share, refresh, sorting, pagination, search, person selection, candidate/tray transitions, Drawer/overlay focus/Escape/mask/resize, wheel/touch scroll ownership, and restored page position.
- [ ] 12.5 Execute runtime/accessibility/performance probes: console/rejection/resource/direct-upstream/image failures, duplicate IDs, landmarks/headings/names/ARIA, axe, page/local overflow, 200% zoom, FCP/CLS/long tasks/resources.
- [ ] 12.6 Generate final contact sheets and machine-readable summary; require every ledger entry `GREEN_VERIFIED`, zero fatal record, zero unclassified outward difference, and every approved delta citation/bounds assertion present.
- [ ] 12.7 Write the final acceptance report with exact commands/results, artifact/evidence paths, commits, residual risks, and explicit not-pushed/not-released/not-deployed state.

## 13. Full Repository and OpenSpec Lifecycle — owner: primary agent; writable: task markers, main `frontend-oracle-fidelity` during sync, archive output

- [ ] 13.1 Preflight: record branch/HEAD/allowed dirty paths and verify Task 12 complete; stop on mismatch.
- [ ] 13.2 Run the repository backend gate, pinned full frontend gate, standalone build, contract/schema/artifact checks, new raw probes, strict change validation, strict all-spec validation, `git diff --check`, and exact final status/diff audit from fresh executions.
- [ ] 13.3 Stage only final report/task markers, inspect staged diff/check, and create the final implementation acceptance commit. Do not push.
- [ ] 13.4 Sync the reviewed delta into `openspec/specs/frontend-oracle-fidelity/spec.md` using the OpenSpec sync workflow, verify merged requirements/scenarios, and strictly validate the main spec.
- [ ] 13.5 Archive `restore-complete-oracle-fidelity` using the OpenSpec archive workflow; validate archive integrity and strict all-spec status; commit exact lifecycle paths. Do not push.
- [ ] 13.6 Run final `git status --short --branch`, `git log -n 12 --oneline`, and final production artifact smoke; report implemented/verified/committed truthfully and keep pushed/released/deployed false.
