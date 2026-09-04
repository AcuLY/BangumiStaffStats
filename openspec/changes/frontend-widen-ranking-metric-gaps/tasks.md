| Boundary | Declaration |
|---|---|
| Status | Implemented with focused, build, artifact-content, and rendered verification; complete frontend gate and archival remain blocked by the recorded environment-sensitive failures below. |
| Owner | Frontend / `frontend-ranking-results`; the primary agent is the sole implementation owner. |
| Writable paths | `openspec/changes/frontend-widen-ranking-metric-gaps/**`; `openspec/changes/archive/2026-09-02-frontend-widen-ranking-metric-gaps/**`; `openspec/specs/frontend-ranking-results/spec.md`; `frontend/src/shared/styles/base.css`; `frontend/tests/shared/ranking-layout.test.ts`; only the exact persistent-file inventory entry in `frontend/scripts/check-architecture.mjs`. |
| Read-only protected inputs | `PRODUCT.md`; `DESIGN.md`; `.impeccable/design.json`; `.impeccable/surfaces/route.md`; `frontend/src/features/ranking/components/RankedPersonList.vue`; `frontend/src/features/person-detail/person-detail.css`; `frontend/ARCHITECTURE.md`; all `openspec/specs/**` except exact writable `openspec/specs/frontend-ranking-results/spec.md`; contracts/backend/updater/operations; oracle `644b7748674e553f863d0ffd61d029f86fdc0717`. |
| Deletion complement | No deletion, rename, or generated output except the verified OpenSpec archive move from the active change path to the exact dated archive path; no edit outside the exact writable paths. |
| Mutable refs | Local branch `codex/widen-ranking-metric-gaps` only; no remote refs. |
| Consumes | Existing ranking markup, ranking/result specs, spacing tokens, personal/global states, container reflow, and supplied `/ranking?user=729218` evidence. |
| Produces | Shared ranking-only metric grid override, focused source test, automated/rendered evidence, synced main spec, and archived completed change. |
| Dependencies | Existing `frontend-ranking-results` -> CSS/test correction; read-only `frontend-design-system`, `frontend-accessibility`, and `frontend-oracle-fidelity` -> acceptance. No cross-language or reverse dependency. |
| Deliverables | Strict-valid artifacts, bounded implementation, focused/full frontend checks, clean detector, Browser geometry/screenshots, clean diff, synced spec, and archived change. |
| Acceptance | Exact commands below; cross-language contract/backend/updater gates are not applicable because their paths and semantics remain unchanged. |
| Non-goals | Metric computation/formatting/copy, component markup, co-star/person-detail/theme behavior, page breakpoints, dependencies, external state, or deployment. |
| Operations deferred | No nginx, systemd, Compose, timer, host, service, cutover, live run, legacy deletion, push, PR, merge, release, or deployment work. |
| Stop/rollback conditions | Stop on branch/HEAD/dirty mismatch, authority conflict, active owner conflict, validation failure, co-star drift, header/row misalignment, overflow, or scope expansion. Reverse only exact owned hunks. `reset --hard`, checkout rollback, `git clean`, `git add -A`, broad recursive deletion, and external-repository mutation are forbidden. |

## 1. Frontend preflight and planning review

- [x] 1.1 In `D:\Luca\Code\bgmss-widen-ranking-metric-gaps`, verify branch `codex/widen-ranking-metric-gaps`, base HEAD `94329c934867302113107d758e5658d7aa05cd1a`, no pre-existing changes in the CSS/test writable paths, no conflicting active OpenSpec owner, and only this change's planning artifacts as allowed dirt.
- [x] 1.2 Review proposal, design, delta spec, and tasks against `PRODUCT.md`, `DESIGN.md`, the route surface brief, existing ranking code/spec, and the two independent Impeccable layout assessments; record zero P0/P1 planning findings and run `npx --yes @fission-ai/openspec@1.6.0 validate frontend-widen-ranking-metric-gaps --strict` before apply.

## 2. Frontend implementation

- [x] 2.1 In `frontend/src/shared/styles/base.css`, add the shared ranking-only count/score/preference tracks and 8px column gap, increase the outer metric minimum to 180px, move the existing two-row container threshold to 380px, and restore the row's single-line named areas above that threshold so header and rows return to the same four tracks without changing the unscoped co-star-compatible rule.
- [x] 2.2 Add `frontend/tests/shared/ranking-layout.test.ts` to lock the outer minimum, ranking-only shared header/row override, count/score/preference minima, spacing token, global variant, paired narrow/wide container rules, and synchronized single-row area mapping, then register that exact persistent file in `frontend/scripts/check-architecture.mjs`.

## 3. Frontend acceptance and evidence

- [x] 3.1 From `frontend/`, install the pinned dependency tree if required and run the focused ranking layout test plus directly affected ranking component tests.
- [ ] 3.2 Run the complete affected frontend gate `npm run check`, final strict change validation, and `git diff --check`; stop on any failure. Contract/backend/updater gates remain explicitly not applicable.
- [x] 3.3 Rerun `node .agents/skills/impeccable/scripts/detect.mjs --json --scope layout frontend/src/features/ranking/components/RankedPersonList.vue frontend/src/shared/styles/base.css`, then use the Browser plugin on the isolated local preview to verify page identity, meaningful content, no framework overlay, console health, row activation, header/value alignment, at least 8px visible metric separation, and `scrollWidth <= clientWidth + 1` at 893, 780, 781, 380, 381, and 360/390px representative states.
- [x] 3.4 Audit the exact diff and record lifecycle truth separately: investigated, specified, implemented, and verified may become complete; committed, pushed, merged, released, and deployed remain incomplete unless separately authorized and performed.

## 4. OpenSpec lifecycle

- [ ] 4.1 Mark tasks complete only from recorded evidence, sync the accepted `frontend-ranking-results` delta, archive to `openspec/changes/archive/2026-09-02-frontend-widen-ranking-metric-gaps/`, and run `npx --yes @fission-ai/openspec@1.6.0 validate --all --strict`.

## Verification evidence

- Focused final gate: `tests/shared/ranking-layout.test.ts` and
  `tests/features/ranking/components.test.ts`, 2 files / 10 tests passed under
  Node 24.18.0 and npm 11.16.0.
- The Linux architecture check passed with 168 registered persistent files;
  every wire drift check and query Unicode check passed.
- One complete serial Vitest run passed 33 files / 380 tests before the final
  responsive-only grid-area refinement; the final focused tests passed after
  that refinement. Later complete reruns were not stable: the default run had
  one unrelated `app.mount` timeout after 379 passing tests, and the final
  single-worker run had unrelated `app.mount`/co-star timeouts after 377 passing
  tests. The isolated `app.mount` rerun passed. No unrelated timeout was fixed
  or hidden.
- Final typecheck and Vite production build passed. The Linux artifact-content
  verifier passed for the final build. Artifact-tool unit tests remain
  environment-blocked: Windows paths are rejected by the tool and WSL-on-NTFS
  reports executable-mode drift for tracked files.
- Browser at `http://localhost:5175/ranking?user=729218` passed page identity,
  meaningful content, framework-overlay absence, zero console warnings/errors,
  row activation, and responsive geometry. At 893px the computed column gap is
  8px, the `10 / 10.00 / 6.43 / +0.56` glyph gaps are 15.61 / 11.78 / 19.99px,
  all four header offsets are 0px, no metric cell clips, and page overflow is
  absent. 360, 380, 381, 390, 421, 422, 780, 781, and 893px all retained 0px
  header offsets with no clipped metric cells or positive page overflow.
- Lifecycle truth: investigated, specified, implemented, focused-verified,
  build-verified, and browser-verified are complete. The complete affected gate,
  sync, archive, commit, push, merge, release, and deployment are incomplete.
