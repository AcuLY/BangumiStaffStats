> Supersession (2026-09-08): `contracts-remove-query-sharing` retires the query-sharing feature and overrides the sharing-specific requirements, preservation clauses, and acceptance assumptions below. URL fragments are cleared without parsing or replay. Header now has an always available same-tab “回到旧版” link to `https://search.bgmss.fun/old/` immediately left of theme. Exact accepted workspace recovery remains frontend-local through validated v2 JSON session storage; v1 fragment-based storage is discarded. Completed evidence below remains historical, and unrelated requirements are unchanged.

## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | Planned. No implementation task starts until this change is strict-valid and the primary agent records a zero-P0/P1 planning review. |
| Owner | Frontend; primary agent owns all groups and final audit. |
| Writable paths | `PRODUCT.md`; `frontend/ARCHITECTURE.md`; `frontend/scripts/check-architecture.mjs` only for the two exact new inventory entries; `frontend/src/app/App.vue`; `frontend/src/features/query/session.ts`; `frontend/tests/setup.ts` only for per-test tab-session cleanup; `frontend/tests/features/query/session.test.ts`; `frontend/tests/features/query/components.test.ts`; `openspec/changes/frontend-persist-query-session/**`; lifecycle-only `openspec/specs/frontend-query-shell/spec.md` and exact archive destination. |
| Read-only protected inputs | `DESIGN.md`; `.impeccable/design.json`; all architecture-check behavior outside the two inventory entries; `frontend/src/app/routes.ts`; existing query model/share/store/coordinator; generated query wire; `contracts/**`; backend/updater/operations; oracle; unrelated OpenSpec paths. |
| Deletion complement | No deletion, rename, dependency/generated-wire edit, architecture-check behavior change, nested OpenSpec root, broad formatting/cleanup, or write outside declared paths. |
| Mutable refs | Local `codex/persist-query-results` worktree and its owned files; versioned same-origin tab-session key only during runtime/tests; no remote ref. |
| Consumes | Accepted share contract, Applied Query/workspace state, coordinator replay, route mode, catalog readiness, and native session storage. |
| Produces | Product/spec behavior, persistence owner, App integration, tests, current-result refresh restoration, and acceptance evidence. |
| Dependencies | Existing frontend layers only, directed from App to session/share/model/generated adapters; no new dependency or cross-language producer. |
| Deliverables | Implemented and tested same-tab refresh recovery, architecture documentation/inventory alignment, deterministic tab-session test isolation, and strict-valid synchronized/archived OpenSpec lifecycle. |
| Acceptance | Focused Vitest; typecheck/build/full frontend check where pinned tools are available; real ranking/co-star browser refresh; strict change/all OpenSpec; `git diff --check`; exact diff review. |
| Non-goals | Response/offline cache, durable/cross-tab history, dirty-Draft persistence, URL payload, automatic collection refresh, user controls, backend/contracts/statistics, redesign, or unrelated cleanup. |
| Operations deferred | No nginx/systemd/Compose/timer/host/cutover/retirement work; commit, push, PR, merge, release, and deployment are not authorized. |
| Stop/rollback conditions | Stop on branch/HEAD/dirty mismatch, artifact review failure, authority conflict, overlapping edit, contract pressure, or scope-expanding acceptance failure. Reverse only exact owned patches; forbid `reset --hard`, checkout rollback, `git clean`, `git add -A`, broad recursive deletion, and external-repository mutation. |

## 1. Frontend product and persistence owner

- [x] 1.1 Preflight `git status --short --branch`, `git rev-parse HEAD`, active OpenSpec ownership, exact writable paths, and strict-reviewed artifacts on `codex/persist-query-results` at baseline `94329c934867302113107d758e5658d7aa05cd1a`; stop on unexpected overlap or mismatch.
- [x] 1.2 Update only `PRODUCT.md` with the accepted same-tab refresh rule, explicit-share precedence, fresh replay, and excluded state.
- [x] 1.3 Implement `frontend/src/features/query/session.ts` as a guarded versioned session-storage owner that encodes/decodes canonical share fragments, preserves only same-query mode entries, and fails closed without throwing into the app.
- [x] 1.4 Add `frontend/tests/features/query/session.test.ts` coverage for ranking/co-star round-trip, new-query invalidation, malformed/incompatible data cleanup, storage exceptions, and response/transient-state exclusion through the reused share contract.

## 2. Composition-root replay integration

- [x] 2.1 Preflight branch/HEAD, confirm only Group 1 owned changes plus reviewed artifacts are dirty, and recheck that `App.vue` and `components.test.ts` have no concurrent overlap; stop safely on mismatch.
- [x] 2.2 Integrate the session owner in `frontend/src/app/App.vue`: explicit fragment first, `?user=` prefill only when no recovery intent exists, catalog-before-replay, initialization-gated writes, accepted-workspace persistence, ordinary non-refresh requests, and local replay-failure feedback.
- [x] 2.3 Extend `frontend/tests/features/query/components.test.ts` with normal-refresh replay, explicit-share precedence, failure retention, dirty-Draft exclusion, and representative ranking/co-star dependent-workspace restoration without changing visible success-path layout or copy.
- [x] 2.4 Update `frontend/ARCHITECTURE.md` to name the session recovery owner and add only `src/features/query/session.ts` plus `tests/features/query/session.test.ts` to the exact persistent inventory in `frontend/scripts/check-architecture.mjs`; change no checker behavior or unrelated entry.
- [x] 2.5 Update only `frontend/tests/setup.ts` to clear jsdom `sessionStorage` before each test so recovery remains opt-in per case and existing app integration tests do not inherit another test's saved query.
- [x] 2.6 Keep session writes gated when a validated replay's dependent request fails, retain the complete saved workspace, and reopen persistence after the next post-initialization primary query succeeds.
- [x] 2.7 Capture the session route before catalog loading and skip replay if the active route changes before catalog readiness.
- [x] 2.8 Add focused App regressions for dependent-failure snapshot retention/replacement and route changes during delayed catalog loading.

## 3. Verification and handoff

- [x] 3.1 Run focused tests with `npm exec vitest run tests/features/query/session.test.ts tests/features/query/components.test.ts` from `frontend/`; record exact passed counts and failures. Evidence: final rerun passed 2 files / 24 tests under Node 24.6.0/npm 11.5.1; `npm run typecheck` also passed after the hardening tests were added.
- [x] 3.2 Run `npm run typecheck`, `npm run build`, and `npm run check` serially from `frontend/`; if the local Node/npm versions differ from pinned `24.18.0`/`11.16.0`, record that toolchain mismatch separately from code results and do not misreport a partial gate as full acceptance. Evidence: local 24.6.0/11.5.1 was rejected as expected; ephemeral 24.18.0/11.16.0 passed typecheck, build, all eight wire/Unicode drift checks, and 388/388 Vitest with one worker. Default parallel Vitest repeatedly timed out only the existing mount smoke while its isolated run passed. The aggregate Windows gate remains non-green because architecture/artifact checks reject native backslash and `/v2/` filesystem paths before or outside this change.
- [ ] 3.3 Use the built/local application with deterministic or real local services to verify a successful `/ranking` refresh and a `/co-star` refresh with selected analysis at representative desktop and mobile widths, keyboard behavior, route/URL stability, and a clean browser console; do not mutate a live host or production service.
- [x] 3.4 Run `npx --yes @fission-ai/openspec@1.6.0 validate frontend-persist-query-session --strict`, `git diff --check`, and exact `git status`/diff review; confirm generated query wire, contracts, dependencies, protected files, unrelated work, and external state remain unchanged, then record investigated/implemented/verified status separately from uncommitted/unpushed/unreleased/undeployed status. Evidence: change strict validation and all 54 OpenSpec items passed; `git diff --check` passed; only declared product, architecture inventory/documentation, App/session, tests, and this change are dirty; dependency/lock, generated wire, contracts, backend, updater, operations, DESIGN/Impeccable state, remotes, and QA listeners are unchanged.

## Verification Notes

- Query-session hardening on 2026-09-04 keeps persistence writes closed after a
  dependent detail replay fails, proves the original complete session payload
  remains byte-semantically equivalent through decode, and proves a later
  successful primary query reopens persistence and replaces that older intent.
- Initialization now captures the session route before catalog loading and
  rechecks it before replay. A controlled delayed-catalog regression switches
  from `/ranking` to `/co-star`, observes zero ranking requests, and confirms
  the captured ranking session remains unchanged.
- Browser-first QA used the in-app Browser against local Vite and temporary read-only same-origin golden gateways. Page identity, first-query rendering, and clean console were observed, but the target refresh flow was not accepted: Browser request handling stalled API bodies and later returned `ERR_BLOCKED_BY_CLIENT` for fresh local tabs. No external Playwright fallback was installed or used, so task 3.3 remains open.
- Impeccable detector result for the changed application targets was `[]`.
