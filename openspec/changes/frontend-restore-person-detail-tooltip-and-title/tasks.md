## Task Boundary

| Field | Boundary |
|---|---|
| Status | Ready for reviewed apply only after strict validation and zero-P0/P1 main-agent review |
| Owner | Frontend / `frontend-person-inspector`; primary agent owns every task below |
| Writable paths | `openspec/changes/frontend-restore-person-detail-tooltip-and-title/**`; `frontend/src/features/person-detail/components/RatingEvidence.vue`; `frontend/src/features/person-detail/person-detail.css`; `frontend/tests/features/person-detail/components.test.ts` |
| Read-only protected inputs | `PRODUCT.md`; `DESIGN.md`; `.impeccable/design.json`; `.impeccable/surfaces/route.md`; root specs; oracle commit; contracts/goldens; `frontend/src/shared/styles/base.css`; every other frontend path and active change |
| Deletion complement | None |
| Mutable refs | None |
| Consumes | Person-detail bucket examples/hidden counts, semantic text tokens, public Naive UI Tooltip API, focused golden-backed tests |
| Produces | Title-only bounded score tooltip, primary preference-title foreground, test and browser evidence |
| Dependencies | Existing person-inspector, design-system, accessibility, contract, and backend-statistics capabilities; direction remains contracts/backend → frontend |
| Deliverables | Strict-valid artifacts, exact production/test hunks, focused and affected frontend checks, rendered desktop/compact evidence, final diff audit |
| Acceptance | Commands and browser checks in groups 3–4; no cross-language artifact changes are expected |
| Non-goals | No API/schema/statistical/dependency/architecture/global-style changes; no unrelated cleanup |
| Operations deferred | No commit, push, PR, merge, release, deployment, route, service, or live-host mutation |
| Stop/rollback conditions | Stop on branch/HEAD drift, newly overlapping dirty files, artifact-review P0/P1, authority conflict, contract mismatch, failed strict validation, or scope expansion. Roll back by reversing only these exact hunks; never use `reset --hard`, checkout rollback, `git clean`, `git add -A`, broad deletion, or writes outside declared paths. |

## 1. Frontend / Declared Person Inspector Files

- [x] 1.1 Preflight `git status --short --branch`, HEAD, declared dirty state, target-file overlap, active owners, and all four planning artifacts; record a zero-P0/P1 main-agent review and stop on mismatch before editing implementation files.
- [x] 1.2 Extend `frontend/tests/features/person-detail/components.test.ts` with a failing regression for title-only ordered tooltip rows, an omission row, accessible bar metadata, and primary semantic title styling.
- [x] 1.3 Update `frontend/src/features/person-detail/components/RatingEvidence.vue` so visible score tooltips render only server-provided names plus the omission row while the focusable bar retains complete accessible metadata.
- [x] 1.4 Update only `.person-preference-work__copy strong` and the local score-tooltip list styles in `frontend/src/features/person-detail/person-detail.css`, using `--text-primary`, one-line ellipsis, existing spacing, and the shared tooltip content class without changing chart geometry.

## 2. Frontend / Automated Acceptance

- [x] 2.1 Run `npm test -- tests/features/person-detail/components.test.ts` from `frontend/` and record the exact result.
- [x] 2.2 Run `npm run check` from `frontend/`; if an unrelated pre-existing gate blocks it, record the exact failure separately and still run typecheck/build plus every affected focused gate without editing protected files.
- [x] 2.3 Run the Impeccable detector once for the changed frontend files, `npx --yes @fission-ai/openspec@1.6.0 validate frontend-restore-person-detail-tooltip-and-title --strict`, and `git diff --check` scoped to the declared writable paths.

## 3. Frontend / Rendered Acceptance

- [x] 3.1 At desktop width, exercise `/ranking?user=lucay126` from row selection through the populated score-bar tooltip using pointer and keyboard focus; verify one work/series name per row, omission behavior when present, no repeated score/count prose, semantic primary preference-title color, page identity, no overlay, console health, and no horizontal overflow.
- [x] 3.2 Repeat the target tooltip and title checks at one compact/mobile viewport, including viewport-bounded tooltip placement, title ellipsis, keyboard focus, and theme-appropriate primary foreground; capture fresh screenshot evidence for the final report.

## 4. Final Audit and Lifecycle Report

- [x] 4.1 Re-read the owned diff against proposal/design/spec/tasks and oracle evidence, confirm no protected or unrelated file changed, and report investigated, specified, implemented, verified, committed, pushed, released, and deployed states separately.

## Verification Evidence

- Focused regression: pinned Node 24.18.0 / npm 11.16.0 `npm test -- tests/features/person-detail/components.test.ts` passed 1 file and 9 tests. The synthetic populated bucket verifies ordered title rows, `… +4`, retained score/count/title/omission accessible metadata, and the semantic-title CSS guard.
- Full unit suite: the ordinary parallel run passed 370/377 but hit seven existing asynchronous App-suite failures, including explicit timeouts. The three failed files then passed 28/28 with one worker, and the complete one-worker run passed 32 files and 377/377 tests.
- Type/build: pinned `npm run build` passed Vue typecheck and Vite production build; only the existing >500 kB chunk warning remained.
- Complete gate boundary: system `npm run check` stopped before code checks because Node was 24.6.0 rather than required 24.18.0. The pinned retry stopped at `check:architecture` because pre-existing untracked `vite-dev.err.log` and `vite-dev.out.log` are outside the persistent inventory. Individually attempted wire gates also exposed pre-existing CRLF drift, and `check:query-unicode` exposed an existing `DerivedAge.txt` hash drift. `check:artifact` failed the existing `/v2/` favicon-resolution condition; `artifact:test` passed 2/8 and failed six Windows native-path guards. Generated-file line-ending side effects from those diagnostic gates were restored byte-for-byte to HEAD and have no diff.
- Static acceptance: final Impeccable detector output was `[]`; strict OpenSpec validation passed; owned-path `git diff --check` passed.
- Rendered acceptance: because the user's 5174 tab is served from a separate worktree, current-repository QA used temporary `http://127.0.0.1:5182/ranking?user=lucay126` against the same local backend. At 1280×720 Light and 390×844 Dark, score 8 exposed exactly three title-only rows, each with nowrap/ellipsis CSS and full `title`; the tooltip stayed inside the viewport; keyboard focus landed on the score bar; page and chart `scrollWidth` equaled `clientWidth`; and preference titles computed exactly to each theme's `--text-primary`. The live bucket had no hidden entries, while omission rendering is covered by the focused runtime test. No framework overlay or target-surface error occurred. The only console finding was an existing duplicate-key warning in the unrelated PositionSelector used to establish the query.
