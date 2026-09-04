## Task Boundary

| Field | Boundary |
|---|---|
| Status | Planned; implementation starts only after strict validation and main-agent zero-P0/P1 review |
| Owner | Frontend, implemented by the primary agent as one bounded correction block |
| Writable paths | `openspec/changes/frontend-fix-ranking-sort-icon/**`; `frontend/src/shared/styles/base.css`; `frontend/tests/features/ranking/components.test.ts` |
| Read-only protected inputs | Exact product, design, theme, component, root-spec, and oracle inputs listed in `proposal.md` and `design.md` |
| Deletion complement | No deletion of files, selectors, tests, assets, dependencies, or capabilities |
| Mutable refs | Local `codex/fix-ranking-sort-icon` only |
| Consumes | Existing semantic foreground tokens, public Naive UI button presentation, shared icon, reduced-motion rule |
| Produces | Bounded CSS/test correction, updated task evidence, and rendered QA |
| Dependencies | `SortDirectionButton -> AppIcon`; `base.css -> semantic tokens`; no new dependency |
| Deliverables | Icon/text color equality, synchronized theme transition, preserved rotation/behavior, verification evidence |
| Acceptance | Strict OpenSpec validation; focused ranking Vitest; full frontend check; Browser Light/Dark and asc/desc checks; `git diff --check` |
| Non-goals | Redesign, behavior/copy/size/theme-owner/other-icon changes, private library internals, broad cleanup |
| Operations deferred | Push, PR, merge, release, deployment, host mutation, production activation |
| Stop/rollback conditions | Stop on branch/HEAD/dirty mismatch, artifact conflict, overlap, validation/test/build failure, or scope expansion; remove only this change's bounded additions for rollback |

Forbidden actions: `git reset --hard`, checkout-based rollback, `git clean`, `git add -A`, broad recursive deletion, undeclared writes, and external-repository mutation.

## 1. Frontend presentation correction

- [x] 1.1 Preflight `codex/fix-ranking-sort-icon` at `94329c934867302113107d758e5658d7aa05cd1a`; confirm only this OpenSpec change is dirty, all artifacts are reviewed, strict validation passes, and no active change or concurrent edit owns the writable CSS/test paths; stop on mismatch. Evidence: isolated branch/HEAD and sole dirty OpenSpec directory confirmed; `openspec list --json` reported only this active change; strict validation passed; main-agent planning review found zero P0/P1 issues.
- [x] 1.2 In `frontend/src/shared/styles/base.css`, make the shared sort-direction icon inherit the public button foreground and add the 300ms standard color transition while preserving the existing 160ms rotation and reduced-motion rule.
- [x] 1.3 In `frontend/tests/features/ranking/components.test.ts`, add focused coverage for inherited color, synchronized color timing, preserved transform timing, and existing reduced-motion coverage.

## 2. Acceptance and lifecycle evidence

- [x] 2.1 Run focused ranking component Vitest and strict validation while developing; record exact commands and outcomes. Evidence: `npx vitest run tests/features/ranking/components.test.ts` passed 7/7; `npx --yes @fission-ai/openspec@1.6.0 validate frontend-fix-ranking-sort-icon --strict` passed; `git diff --check` passed.
- [ ] 2.2 Run `npm run check` from `frontend/`, `git diff --check`, and final strict OpenSpec validation; stop on relevant failure. Partial evidence: pinned Node 24.18.0/npm 11.16.0 build passed; all eight generated-wire/Unicode drift checks passed; focused ranking tests passed 7/7; 31/32 full test files and 376/377 tests passed; strict OpenSpec validation and `git diff --check` passed. The complete gate remains non-green on unrelated baseline failures: architecture rejects unchanged `src/app/App.vue`; `app.mount.test.ts` times out; artifact verification cannot resolve the `/v2/` favicon; Windows artifact tests reject native backslash paths.
- [x] 2.3 In the in-app Browser at `/ranking?user=729218`, verify page identity, meaningful content, no framework overlay, console health, equal computed icon/label colors and synchronized color timing in Light/Dark, correct ascending/descending rotation and accessible name, reduced-motion behavior where supported, plus desktop and mobile screenshot evidence. Evidence: the user page established the pre-fix mismatch; an isolated actual-component harness from the topic worktree verified Light/Dark and asc/desc computed styles, equal transition-start/end colors, the 300ms color plus 160ms transform timing, accessible-name changes, zero console warnings/errors, desktop and 390px screenshots, and no horizontal overflow. Reduced-motion coverage was verified by the focused CSS test because the Browser runtime does not expose media emulation.
- [x] 2.4 Audit the final diff and report states separately: investigated, specified, implemented, verified, committed, pushed, merged, released, and deployed. Do not commit, push, merge, release, or deploy without separate scope/authorization. Evidence: final tracked implementation diff is limited to `base.css` and the ranking component test; the remaining untracked paths are only this change's OpenSpec artifacts. Investigated/specified/implemented/focused-verified are complete; complete-gate verified is blocked by documented baseline failures; committed/pushed/merged/released/deployed are false.
