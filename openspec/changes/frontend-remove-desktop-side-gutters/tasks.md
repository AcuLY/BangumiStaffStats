## Task Boundary

| Field | Boundary |
|---|---|
| Status | Planned; implementation starts only after strict validation and main-agent zero-P0/P1 review |
| Owner | Frontend, implemented directly by the primary agent as one small correction block |
| Writable paths | `frontend/src/shared/styles/base.css`; `frontend/tests/shared/scrollbar-system.test.ts`; `openspec/changes/frontend-remove-desktop-side-gutters/**`; lifecycle sync only at `openspec/specs/frontend-oracle-fidelity/spec.md` |
| Read-only protected inputs | `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `.impeccable/**`, `tmp-formal-development/**`, oracle `644b7748674e553f863d0ffd61d029f86fdc0717`, every other tracked/untracked file, production URL |
| Deletion complement | No deletions |
| Mutable refs | Local branch `codex/remove-desktop-side-gutters` and working tree only; no remote refs |
| Consumes | Existing root scrollbar CSS/test, user screenshot, live computed geometry, design authorities |
| Produces | Bounded CSS/test correction, synchronized spec, verification record |
| Dependencies | Existing frontend stack only; tests consume CSS; no cross-language change |
| Deliverables | No mirrored desktop gutter; preserved real scrollbar, 1280px inner line, responsive layout |
| Acceptance | Commands and browser assertions in tasks 2.2–2.4 plus strict validation and diff audit |
| Non-goals | Content width, component/UI redesign, scrollbar tokens, mobile semantics, API/data/dependency/operations work, sidecar refresh |
| Operations deferred | Push, PR, release, deploy, host/cache/route mutation, activation and retirement |
| Stop/rollback conditions | Stop on branch/HEAD/overlap/artifact mismatch, failing acceptance, overflow/alignment/mobile drift, or out-of-scope edit; inverse-patch exact owned lines only |

Forbidden throughout: `git reset --hard`, checkout-based rollback, `git clean`, `git add -A`, broad recursive deletion, writes outside the exact writable paths, external-repository mutation, and all production operations.

## 1. Frontend implementation — exact CSS and focused test

- [x] 1.1 Preflight `git status --short --branch`, `git rev-parse HEAD`, `npx --yes @fission-ai/openspec@1.6.0 status --change frontend-remove-desktop-side-gutters --json`, and `npx --yes @fission-ai/openspec@1.6.0 validate frontend-remove-desktop-side-gutters --strict`; require branch `codex/remove-desktop-side-gutters`, HEAD `94329c934867302113107d758e5658d7aa05cd1a`, only the listed pre-existing unrelated untracked files plus this change's planning artifacts, zero active conflicting owner, and completed reviewed artifacts. Stop without implementation on mismatch.
- [x] 1.2 In `frontend/src/shared/styles/base.css`, remove only the desktop `html { scrollbar-gutter: stable both-edges; }` media block; retain root `overflow-y: scroll`, base `scrollbar-gutter: auto`, all scrollbar tokens, and all content-line rules.
- [x] 1.3 In `frontend/tests/shared/scrollbar-system.test.ts`, replace the positive `stable both-edges` assertion with a regression assertion that the symmetric gutter is absent while preserving existing shell/component tier assertions.

## 2. Frontend acceptance and lifecycle evidence

- [x] 2.1 Recheck `git diff -- frontend/src/shared/styles/base.css frontend/tests/shared/scrollbar-system.test.ts` and `git status --short`; stop on any overlapping or out-of-scope implementation change.
- [x] 2.2 Run the focused scrollbar test using the repository's Vitest command and require it to pass.
- [ ] 2.3 Run `npm run check` and `npm run build` from `frontend`, then `node .agents/skills/impeccable/scripts/detect.mjs --json --scope layout frontend/src/shared/styles/base.css frontend/src/app/App.vue`; require zero unexplained findings and no artifact/source drift.
  - Evidence: focused test (6/6), typecheck, wire generation consistency, production build, and Impeccable layout detector passed. The complete gate remains open because existing baseline checks fail outside this CSS delta: `src/app/App.vue` store-instantiation architecture check, one 10-second `app.mount.test.ts` timeout (375/376 tests passed), and Windows-native backslash handling in favicon/artifact path checks.
- [x] 2.4 Verify representative desktop and mobile geometry without mutating production: root/shell starts at the non-scrollbar viewport edge, only the real scrollbar edge is reserved, shared content lines remain aligned and capped at 1280px, `scrollWidth <= clientWidth + 1`, and browser console has no errors. Record that production itself remains unchanged until a separately authorized release/deploy.
  - Evidence: at 1440px, `html`, shell, and Header begin at x=0; only the real 10px scrollbar edge is reserved; the Footer/content line remains capped at 1280px; there is no horizontal overflow; console errors = 0. At 390px, `html`, shell, and Header begin at x=0 with no mirrored gutter or horizontal overflow; console errors = 0. The production URL was inspected read-only and remains unchanged.
- [ ] 2.5 Run `git diff --check`, strict validation for this change, and a final primary-agent zero-P0/P1 diff/spec review. Record states honestly: investigated, specified, implemented, and verified may become complete; committed, pushed, merged, released, and deployed remain false unless separately performed.
  - Evidence: `git diff --check` and strict validation pass, and the scoped semantic diff/spec review found no P0/P1 issue. Final acceptance remains open with task 2.3; investigated, specified, and implemented are complete, while verified, committed, pushed, merged, released, and deployed remain false.
