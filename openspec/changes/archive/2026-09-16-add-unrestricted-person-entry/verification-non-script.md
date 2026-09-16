# Non-script completion acceptance

## Scope and status

This pass completes the application, not script distribution. The existing root `bangumi_plugin.js` and `frontend/tests/app/bangumi-plugin.test.ts` remain read-only. Installation documentation, download UI and an artifact script copy are not acceptance requirements. No commit, push, deployment or production mutation is claimed.

Baseline HEAD: `0387cbf391da61df3afa6ae0a357d6a754905fd7`, existing dirty master worktree preserved. This is an in-progress checkpoint, not whole-feature acceptance. Earlier verification remains in `verification.md`.

## Backend component gate — passed

Executed from the repository using the external evidence runner:

```sh
python3 /root/.hermes/workspace/bangumi-staff-stats/run-non-script-gates.py backend
```

The runner invokes the unchanged acceptance command `backend/scripts/check.sh` with the pinned toolchain and the previously authorized locked offline npm cache recovery wrapper. `GOMAXPROCS=1`, `GOFLAGS=-p=1` limit load; assertions, generation checks and cleanup are not removed.

Actual result: exit 0, `backend checks passed`; full component script includes generated checks, ordinary tests, race tests, verification and build. Runner confirms source identities unchanged and backend `.cache` / `.tmp` absent after exit. Evidence: `../qa/non-script-gates/backend.json` and `backend.log` relative to the repository root. The runner's source manifest binds this dirty-tree result, not a release commit.

## Contracts — metadata blockers resolved

The user approved the bounded metadata repair. Only three SHA256 fields in `contracts/goldens/api/catalog/index.json` and thirteen authority SHA256 fields in `contracts/goldens/statistics/index.json` were synchronized to the inspected current bytes. Catalog stale pins matched CRLF variants of unchanged Git-tracked inputs. Statistics references now identify the accepted decision document, current PRODUCT and query-domain handoff. Fixture content, numerical expectations, dependencies, source authorities and both verifier implementations were unchanged by the repair; no guard was disabled.

Fresh acceptance with the pinned wrapper:

- `node contracts/goldens/statistics/verify.mjs`: exit 0 twice; 5 files / 35 cases; identical inventory/result digests. External-copy negative tests reject an extra inventory file, altered case bytes and an altered protected authority pin (each expected exit 1).
- Catalog's locked offline `npm ci` followed by its unchanged `node verify.mjs`: exit 0 (`proc_aa99c730e55d`). Result: 8 inventoried files, 2 success / 7 error / 36 invalid cases; query/response component preservation, deterministic Go generation and temporary compilation all true.
- Exact JSON comparison permits only those sixteen planned SHA256 fields; all protected inputs retained their recorded bytes. `git diff --check` passes. No release commit or whole-application approval follows from this bounded repair.

Earlier required-contract replay (`contracts-required-r2.json`) passed query, query-domain, candidates, co-star, partners, person-detail, rankings and artifact tests; the new standalone catalog pass resolves that run's sole failed verifier, rather than pretending the earlier run was green. Statistics is an additional gate. Evidence under `../qa/non-script-gates/`: `metadata-repair-final.json`, `approved-metadata-repair-plan.json`, `verify-metadata-repair.py`, `catalog-metadata-green.log`, `statistics-metadata-green-{1,2}.log`, `statistics-negative-*.log`. Original baseline-failure logs/comparisons remain preserved.

## Real Go HTTP integration — passed in controlled QA environment

The recovered isolated harness was started by the QA preparer; the parent verified its executable/PID ownership and both ports' health directly, then exercised the real APIs:

```sh
python3 /root/.hermes/workspace/bangumi-staff-stats/qa/non-script-entry/launcher.py status
python3 /root/.hermes/workspace/bangumi-staff-stats/qa/non-script-entry/api-smoke.py
```

Actual result: exit 0; 26 distinct cases passed. Cases include health/catalog, target absent from first ranking page, wishlist target inclusion and exclusion for each of five types, staff/cast work deduplication, NSFW-only/no-participation/empty collection, absent entity, missing/private users, timeout/network failures, empty ranking, explicit NSFW inclusion and legacy specific-position detail.

- API: `http://127.0.0.1:18081`.
- Static frontend/proxy: `http://127.0.0.1:15174`.
- Actual saved requests/responses and counted case summary: `../qa/non-script-entry/evidence/api-smoke-summary.json` and sibling JSON files.
- Data provenance: `../qa/non-script-entry/provenance.json` and `prepare.py`. This is a controlled derivative of the repository's immutable minimal golden, copied outside the repository. Fixture IDs/profiles are synthetic test data, not live Bangumi facts.
- Production Go handlers, services, runtime cache and query/statistical evaluation are executed. Only the upstream collection snapshot boundary is substituted. Image fetching is intentionally disabled for synthetic IDs; bounded proxy fault injection is explicitly labelled.
- This does **not** exercise live upstream Bangumi, production Archive admission, deployment or release readiness. Serving an existing `frontend/dist` does not prove the new frontend was built or browser-accepted.

## Bounded existing frontend audit

Independent read-only task-4.2 reviewer (`deleg_812393ff`, task 1) found no concrete blocking defect in the existing unrestricted/wish implementation. It reviewed shared draft/recovery/selectors, metadata-based identity admission, real candidate-driver projection, authoritative complete-identity handoff and detail presentation. The reviewer reports a fresh pinned one-worker run of 10 files / 393 tests, exit 0; this is reviewer evidence, not an independent parent replay. Source transcript: `/root/.hermes/cache/delegation/live/deleg_812393ff/task-1.log`.

That review explicitly excludes concurrent new entry code, integrated App/coordinator regressions, full frontend gates and browser acceptance. The original entry implementation task timed out; its parser/routes/happy-path files and RED/GREEN logs were recovered and inspected, but the timeout is not completion. The narrower follow-up owns entry cancellation/retry only, preserving a single frontend writer.

## Final integrated application checks

- Full frontend command: pinned `npm ci --ignore-scripts --no-audit --no-fund`, then unchanged `npm run check`; exit 0. All 53 Vitest files / 923 tests passed, all generated-wire/Unicode checks passed, typecheck/build passed, 29-file artifact check and artifact tests passed. Source identities were unchanged during the run. Evidence: `../qa/final-frontend/final-r2.{json,log}`. The initial offline attempt failed only because its dependency cache was incomplete; the locked online install succeeded without dependency changes.
- Full contracts replay, including query/query-domain/statistics, all API verifiers and all artifact test files: 11 command steps, each exit 0; source identities unchanged. Evidence: `../qa/non-script-gates/contracts-final-r1.{json,log}`. This is a new whole-run success, not relabeling an earlier failure. Its backend cache/temp absence flag is false; no cleanup success is claimed for that run.
- Independent parser/routes review approved precise inventory registration; 64 focused tests passed. Architecture guard still rejects an extra path. Final source spec review approved the non-script frontend slice with no concrete blocker: `../qa/final-spec-review/HANDOFF.md`.
- Final built frontend was served by the real Go QA harness; HTTP index bytes matched `frontend/dist/index.html`. 28 distinct browser cases passed and are recorded individually in `../qa/browser-release/cases.jsonl`, aggregated in `summary.json`. Coverage includes five types/all entry defaults, wish-only data, off-page target, NSFW-excluded and wholly empty collection, typed local empty versus entity/network errors, explicit retry, cancellation, stale response and changed selection, invalid/ordinary URLs, tab recovery/refresh ownership, edit-before-catalog, real ranking/co-star/return handoff, desktop light/dark, mobile drawer/Escape/focus and duplicate-ID/overflow checks. No captured JavaScript errors.
- Screenshots are in the same external browser directory. A QA-only explicit Noto Sans CJK SC face fixes the headless host's missing-glyph Arial fallback; platform font inspection confirmed the actual CJK face. No product CSS/font change was made. Browser target reset and harness assertions that assumed the wrong theme attribute/copy or disallowed existing tab recovery were corrected and rerun, not counted as product passes.
- `frontend/ARCHITECTURE.md` was reconciled after the full gate to accepted entry/query-all/empty/handoff behavior and the existing theme key. The subsequent architecture check and diff check passed; only documentation changed relative to the verified frontend source.
- Existing operations runtime tests passed. GitHub SSH/CLI authentication was verified without exposing credentials; only the authorized separate Windows staging directory was created, not the original worktree.

## Remaining acceptance

Final independent code-quality review approved with no concrete merge blocker (`../qa/final-quality-review/HANDOFF.md`). Its earlier browser limitations are resolved by the subsequent 28-case evidence, actual cross-mode round trip and CJK platform-font verification above. Six accepted main specs were synchronized, preserving existing scenarios; strict validation passed 100 items with zero failures (`../qa/spec-sync/HANDOFF.md`). Existing unrelated desktop-overlay versus document-flow prose was not changed by this feature; current DESIGN and already accepted implementation retain authority. Implementation and accepted specs were committed as `ae7d09540a4b409e1de4b9ea1aa26020db031359`; this completed feature is archived after synchronization. Remote CI, immutable bundle acceptance, push/merge and production activation/readback remain separate deployment gates. No pushed, merged or deployed state is claimed here.

The pre-existing untracked root userscript and its test are retained byte-for-byte as repository inputs so the existing closed frontend inventory/test suite remains reproducible in a clean checkout. They are not modified, copied into the frontend artifact, installed or published to Bangumi by this pass.
