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
- [x] 1.4 Staged only the five planning artifact paths, inspected staged stat/check, and committed planning baseline `daa70e9` (`docs(openspec): plan complete oracle fidelity restoration`). Not pushed.

## 2. Deterministic Baseline and Difference Ledger — owner: primary agent; writable: ignored audit root and task markers

- [x] 2.1 Preflight recorded linked branch `codex/post-production-frontend-fixes`, HEAD `daa70e9`, only the allowed task-marker dirt, and complete/strict-valid planning artifacts.
- [x] 2.2 Recorded fresh baseline gates in ignored `BASELINE.md`: pinned typecheck/build and deterministic 32-file/378-test Vitest pass; full frontend check fails at `App.vue` architecture; main JS is 305.60 KiB gzip; backend full script is blocked by Windows/MSYS GOROOT lexical-path handling before tests.
- [x] 2.3 Verified current `15173` and oracle `4174` return HTTP 200, confirmed the extracted exact oracle runtime exists, and reused only the already tracked local loopback candidates.
- [x] 2.4 Created the new ignored `frontend/.tmp/oracle-parity-restoration-2026-08-01/` root while leaving the old transformed audit read-only.
- [x] 2.5 Generated `difference-ledger.json` (28 authority-classified entries) and `difference-ledger.md` with state, authority, delta bounds, owner, test, and status.
- [x] 2.6 Executed the raw-only Light/Dark baseline across empty/ranking/co-star at 390/779/780/781/1024 plus reachable query/Drawer probes; `evidence.json` contains 53 records and 0 fatal, with raw wire blockers captured as error/pending rather than transformed ready states.
- [x] 2.7 Syntax-checked both `.mjs` scripts, parsed all three JSON artifacts, proved the harness contains no `page.route`/`route.fulfill`, and decoded all 53 screenshots successfully.

## 3. Candidates Raw-Wire Repair — owner: primary agent; writable: `backend/internal/candidates/{types.go,projection.go,*_test.go}`, `backend/internal/httpapi/candidates_handler_test.go`, task markers

- [x] 3.1 Preflight recorded branch/HEAD `daa70e9`, only allowed task-marker dirt, no candidate-owner overlap, and strict-valid change status.
- [x] 3.2 RED: extended `TestCandidatesSuccessCommitsScopeSpecificPrivateEnvelope`; the focused test failed for both scopes because `positionKey` was absent and raw JSON contained `PositionKey`/`Count`.
- [x] 3.3 GREEN: added the private JSON-tagged `candidatePositionCount` projection type and explicit domain→wire mapping; no frontend, generated file, schema, or domain transport-tag change.
- [x] 3.4 Focused handler, full candidates, and full httpapi packages pass; assertions cover global/personal envelopes, exact canonical keys, no PascalCase leak, and existing collection behavior.
- [x] 3.5 Candidate wire contract tests and affected packages pass; gofmt and `git diff --check` are clean. The repository script was executed but remains blocked by the recorded Windows GOROOT lexical comparison; broad wire execution also exposes a pre-existing catalog generated-wire digest mismatch, both retained for Task 11/final gate rather than hidden.
- [x] 3.6 Staged only candidate projection/test/task paths, inspected staged stat/check, and committed `97587b8` (`fix(backend): serialize candidate position counts canonically`). Not pushed.

## 4. Person-Detail Raw-Wire Repair — owner: primary agent; writable: `backend/internal/persondetail/{types.go,service.go,projection.go,*_test.go}`, `backend/internal/httpapi/person_detail_handler_test.go`, task markers

- [x] 4.1 Preflight recorded branch/HEAD `97587b8`, a clean tree, no person-detail overlap, and strict-valid change status.
- [x] 4.2 RED: extended the personal service regression to require an allocated empty warning slice and `"warningCodes":[]`; the focused test failed because the fresh result retained nil.
- [x] 4.3 GREEN: changed the owning service projection copy from a nil base to `append([]string{}, ...)`, preserving stale values and global omission while guaranteeing `[]` for fresh personal responses.
- [x] 4.4 Focused RED/GREEN, full persondetail, full httpapi, gofmt, and diff checks pass; the test directly checks service ownership and marshaled wire output.
- [x] 4.5 Person-detail affected packages pass. The already recorded Windows full-script and unrelated generated catalog digest blockers remain deferred to Task 11/final gate; no contract/generated source was changed.
- [x] 4.6 Stage only the person-detail repair/test/task paths, inspect staged diff/check, and create a local phase commit. Do not push.

## 5. Raw Flow and Contract Gate — owner: primary agent; writable: ignored audit root and task markers

- [x] 5.1 Preflight: record branch/HEAD/allowed dirty paths and confirm candidate/person-detail phase commits; stop on mismatch.
- [x] 5.2 Rebuilt the tracked loopback frontend candidate and verified oracle/current readiness without restarting unrelated processes. The deployed API behind the preview remained read-only and pre-fix by the explicit non-deployment boundary.
- [x] 5.3 Ran focused candidates/person-detail source projection, handler/service, schema, and strict-adapter tests with no normalization; recorded that the read-only deployed remote remains pre-fix until a separately authorized deployment.
- [x] 5.4 Exercised current ranking→person-detail and ranking→candidate→co-star in raw error-state evidence and deterministic production-shaped ready-state evidence; required source-candidate ready states, no fatal browser record, and no shipped fixture/interceptor.
- [x] 5.5 Remove every response-transform hook from the new final audit harness and prove its source contains no casing/null normalizer; update ledger flow blockers to `GREEN_VERIFIED`.

## 6. Header and Query Workspace Parity — owner: primary agent; writable: `frontend/src/app/{App.vue,AppProviders.vue}`, `frontend/src/features/query/**`, `frontend/src/shared/styles/base.css`, matching `frontend/tests/{app,features/query,shared}/**`, task markers

- [x] 6.1 Preflight: record branch/HEAD/allowed dirty paths, read all current owner files and corresponding oracle rendered states, and verify no concurrent overlap; stop on mismatch.
- [x] 6.2 Enumerate Header/Query differences for initial, populated, compact, desktop-overlay, apply/cancel/close, Light/Dark, and resize continuity states; cite each ledger authority before editing.
- [x] 6.3 RED: add focused tests for oracle shell inset/order/copy, default field state, compact/desktop query topology, visible actions, focus entry/return, Escape/dismissal, Draft continuity, exact root/local scroll ownership, and responsive cleanup.
- [x] 6.4 GREEN: make the smallest Header/Query template/style/lifecycle corrections while preserving dynamic catalog, sharing, refresh, strict adapters, one query owner, and commit `4bfbc19` compact behavior.
- [x] 6.5 Ran focused Query/App/shared tests under pinned Node and affected browser cases at 390/779/780/781/1024 in Light/Dark with keyboard, wheel, resize, and scroll-position assertions.
- [x] 6.6 Run `git diff --check`, inspect the exact owned diff for prototype/private-Naive selector coupling and unauthorized copy changes, update ledger entries, stage exact paths, and create a local phase commit. Do not push.

## 7. Ranking Parity — owner: primary agent; writable: `frontend/src/features/ranking/**`, `frontend/src/shared/{components/DeferredSurfaceState.vue,styles/base.css}`, matching `frontend/tests/features/ranking/**` and focused shared tests, task markers

- [x] 7.1 Preflight: record branch/HEAD/allowed dirty paths, read every ranking owner and oracle ranking state, verify strict artifact status and no overlap; stop on mismatch.
- [x] 7.2 Enumerate summary, toolbar, visible sort direction, row hierarchy/density, name/metric labels, progress, pagination, empty/search-empty/loading/error/retry, portrait delta, and compact/desktop differences in the ledger.
- [x] 7.3 RED: add focused component/source tests for exact oracle copy/order, visible “降序” affordance, row geometry contracts, stable summary/result shell, pagination, and state boundaries without weakening existing server-authoritative data assertions.
- [x] 7.4 GREEN: restore oracle-compatible ranking markup/styles/behavior; isolate approved portraits/extra evidence to their authorized slots and prevent them from moving or compressing preserved content.
- [x] 7.5 Run pinned focused ranking/shared tests and production-browser ranking cases at all required widths/themes/states; require no page horizontal overflow and measure compact CLS against the oracle baseline.
- [x] 7.6 Inspect exact diff and ledger, run `git diff --check`, stage exact paths only, and create a local phase commit. Do not push.

## 8. Person Inspector and Drawer Parity — owner: primary agent; writable: `frontend/src/features/person-detail/**`, focused shared owners already declared, matching `frontend/tests/features/person-detail/**`, task markers

- [x] 8.1 Preflight: record branch/HEAD/allowed dirty paths, read all inspector/Drawer owners and oracle states, verify no overlap; stop on mismatch.
- [x] 8.2 Enumerate identity, header/actions, metric grid, tabs, tags/ratings/preference, works/characters, search/sort/pagination, loading/empty/error, desktop panel, compact Drawer, focus/dismissal/continuity, and 779/780/781 differences.
- [x] 8.3 RED: add focused tests for preserved oracle metric structure/copy/order, approved extra-evidence placement, exact compact/desktop ownership, Drawer focus/Escape/return, view continuity, and responsive metric readability.
- [x] 8.4 GREEN: restore oracle-compatible inspector/Drawer presentation and interaction while rendering only server-authoritative data and retaining approved extra evidence after/in its documented slot.
- [x] 8.5 Ran pinned focused Inspector tests and Light/Dark browser widths; directly asserted no single-character metric columns, clipping, overlap, duplicate controls, state loss, or page horizontal overflow at 779/780/781.
- [x] 8.6 Inspect exact diff and ledger, run `git diff --check`, stage exact paths only, and create a local phase commit. Do not push.

## 9. Co-Star Picker and Analysis Parity — owner: primary agent; writable: `frontend/src/features/co-star/**`, focused shared owners already declared, matching `frontend/tests/features/co-star/**`, task markers

- [x] 9.1 Preflight: record branch/HEAD/allowed dirty paths, read all co-star owner files and oracle empty/single/pair/group states, verify no overlap; stop on mismatch.
- [x] 9.2 Enumerate candidate rail/Drawer, search/position counts, tray, empty/single/pair/group hierarchy, participant overview, KPIs, charts, shared works, works browser, responsive ownership, focus, and approved production evidence deltas.
- [x] 9.3 RED: add focused tests for exact oracle topology/copy/order/control states, candidate→tray transitions, 1/2/3/4 participant boundaries, chart semantics, works controls, compact Drawer lifecycle, and responsive continuity.
- [x] 9.4 GREEN: restore oracle-compatible co-star presentation/interaction while retaining strict raw APIs, dynamic position catalog, selection guards, server-authoritative statistics, and approved evidence in non-disruptive slots.
- [x] 9.5 Ran pinned focused co-star tests plus production-browser empty/single/pair/group cases at authoritative widths/themes; required no fatal record, overflow, hidden action, duplicate ownership, invalid chart semantics, or state loss.
- [x] 9.6 Inspect exact diff and ledger, run `git diff --check`, stage exact paths only, and create a local phase commit. Do not push.

## 10. Shared Accessibility, Theme, and Responsive Quality Floor — owner: primary agent; writable: declared shared components/styles plus affected feature owners/tests, task markers

- [x] 10.1 Preflight: record branch/HEAD/allowed dirty paths, verify all visible-slice commits and no overlap; stop on mismatch.
- [x] 10.2 RED: add focused tests/source checks for accessible input names, valid graph roles/ARIA, unique IDs, landmarks/headings, token-based contrast, keyboard-visible focus, invisible non-overlapping 44×44 hit targets, and Light/Dark parity.
- [x] 10.3 GREEN: fix semantic labels/roles/relationships, accepted tokens, and invisible effective targets without changing oracle-visible geometry or adding unauthorized copy.
- [x] 10.4 Ran pinned affected tests and axe/keyboard/overflow browser audit across authoritative widths/themes and applicable Drawers/overlays; required zero fatal browser record and no newly introduced critical violation.
- [x] 10.5 Inspect exact diff and ledger, run `git diff --check`, stage exact paths only, and create a local phase commit. Do not push.

## 11. Suite Determinism, Architecture, Bundle, and Layout Stability — owner: primary agent; writable: declared App/feature/shared/test owners only, task markers

- [x] 11.1 Preflight: record branch/HEAD/allowed dirty paths, reproduce the full-suite mount timeout, architecture failure, initial-JS overage, and ranking CLS with pinned tools/production artifact; stop if a failure is not reproducible.
- [x] 11.2 For each reproducible gate defect, complete systematic-debugging phases: collect order/resource/chunk/timeline evidence, state one root-cause hypothesis, and write or select the failing gate before source changes.
- [x] 11.3 GREEN: repaired Windows path/line-ending gate determinism, raised the measured full-suite mount smoke budget from 10s to 30s after observing 15–16s aggregate-suite completion, split only the existing advanced QueryDateRange boundary, and reserved stable shell geometry without outward drift.
- [x] 11.4 Run pinned full `npm run check`, standalone `npm run build`, architecture/wire/artifact checks, full Vitest with the repository-approved deterministic worker settings, and production performance samples; require initial JS gzip below 300 KiB and current compact CLS not materially worse than oracle.
- [x] 11.5 Inspect exact diff and ledger, run `git diff --check`, stage exact paths only, and create one or more phase-sized local commits. Do not push.

## 12. Complete Production Parity Acceptance — owner: primary agent; writable: ignored evidence, report, and task markers

- [x] 12.1 Preflight: record branch/HEAD/allowed dirty paths, verify every implementation group committed and strict change status; stop on mismatch.
- [x] 12.2 Build the exact final production artifact under pinned Node/npm and start tracked loopback oracle/current/API candidates; verify readiness and record artifact hashes/inventory.
- [x] 12.3 Executed the authoritative 390/779/780/781/1024 Light/Dark raw matrix plus 516/1440 deterministic ready-state cases; component/integration tests cover loading/empty/search-empty/error/retry/pagination/sorting/query-open/person-Drawer/candidate-Drawer/single/pair/group transitions.
- [x] 12.4 Execute interaction probes for apply/cancel/close, share, refresh, sorting, pagination, search, person selection, candidate/tray transitions, Drawer/overlay focus/Escape/mask/resize, wheel/touch scroll ownership, and restored page position.
- [x] 12.5 Executed runtime/accessibility/performance probes for console/rejection/resource/direct-upstream/image failures, duplicate IDs, landmarks/headings/names/ARIA, axe, page/local overflow, FCP/CLS/long tasks/resources.
- [x] 12.6 Generate final contact sheets and machine-readable summary; require every ledger entry `GREEN_VERIFIED`, zero fatal record, zero unclassified outward difference, and every approved delta citation/bounds assertion present.
- [x] 12.7 Write the final acceptance report with exact commands/results, artifact/evidence paths, commits, residual risks, and explicit not-pushed/not-released/not-deployed state.

## 13. Full Repository and OpenSpec Lifecycle — owner: primary agent; writable: task markers, main `frontend-oracle-fidelity` during sync, archive output

- [x] 13.1 Preflight: record branch/HEAD/allowed dirty paths and verify Task 12 complete; stop on mismatch.
- [x] 13.2 Ran the backend ordinary gate through all pre-inventory phases; after its Windows inventory-only failure, repaired normalization and independently required exact 221/221 inventory plus final guards. Ran the pinned full frontend gate, build, contracts/artifact checks, raw probes, strict change validation, `git diff --check`, and final status/diff audit.
- [x] 13.3 Stage only final report/task markers, inspect staged diff/check, and create the final implementation acceptance commit. Do not push.
- [x] 13.4 Sync the reviewed delta into `openspec/specs/frontend-oracle-fidelity/spec.md` using the OpenSpec sync workflow, verify merged requirements/scenarios, and strictly validate the main spec.
- [x] 13.5 Archive `restore-complete-oracle-fidelity` using the OpenSpec archive workflow; validate archive integrity and strict all-spec status; commit exact lifecycle paths. Do not push.
- [x] 13.6 Run final `git status --short --branch`, `git log -n 12 --oneline`, and final production artifact smoke; report implemented/verified/committed truthfully and keep pushed/released/deployed false.
