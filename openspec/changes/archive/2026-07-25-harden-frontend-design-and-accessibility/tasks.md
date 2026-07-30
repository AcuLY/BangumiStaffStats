## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | Investigated, specified, implemented, verified, and committed at `a0edd1c0`: complete. Pushed, released, and deployed: no. |
| Owner | Main agent admits and accepts; one Frontend implementation owner writes the bounded candidate; one separate Impeccable reviewer is read-only. |
| Writable paths | Proven hunks under `frontend/src/**`; corresponding `frontend/tests/**`; only `frontend/scripts/check-architecture.mjs`, `frontend/scripts/check-production-artifact.mjs`, `frontend/index.html`, and `frontend/vite.config.ts` when a failing gate requires them; exact `.impeccable/design.json` last; this change's task markers. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, oracle, all other `.impeccable/**`, formal guides, contracts/backend/updater/generated DTOs and generators, manifests/lockfile, other OpenSpec artifacts, refs/remotes, external repositories, and operations state. |
| Deletion complement | Delete only tests newly created here; restore existing files by owned hunk and the sidecar by exact preimage. |
| Mutable refs | None during apply; main-agent lifecycle may update the local index/branch only after acceptance; remote refs stay protected. |
| Consumes | Verified, committed, archived ranking/co-star verticals; accepted frontend capabilities; oracle; current product/design authorities; production APIs/contracts; Impeccable tooling. |
| Produces | Production matrix evidence, focused regression fixes, clean artifact evidence, regenerated sidecar, and independent zero-P0/P1 review. |
| Dependencies | `implement-frontend-query-shell`, `implement-frontend-ranking-results`, `implement-frontend-person-inspector`, `implement-frontend-co-star-vertical`, and `restore-frontend-oracle-fidelity` → this change; all five archived before apply, with no overlapping frontend owner. |
| Deliverables | Forty base browser combinations plus named states, automated/full checks, production bundle audit, sidecar validation, and final review. |
| Acceptance | All specs pass against `frontend/dist`, strict validation remains green, and separate review reports zero P0/P1. |
| Non-goals | Redesign/polish, new behavior/API/statistics/dependency, protected-path work, private DOM, broad cleanup, or non-frontend implementation. |
| Operations deferred | Hosting, production configuration, release/deploy/cutover, secrets, timers, monitoring deployment, hosts, and live state. |
| Stop/rollback conditions | Stop on admission mismatch, overlapping owner, authority conflict, unproven finding, undeclared path/dependency/behavior, redesign, or premature sidecar work. Never use `reset --hard`, checkout rollback, `git clean`, `git add -A`, broad recursive deletion, or external mutation; restore only owned hunks/new tests and the sidecar preimage. |

## 1. Main Agent — Admission and Specification

- [x] 1.1 Run `openspec validate harden-frontend-design-and-accessibility --strict`; review proposal, design, specs, tasks, direct dependency direction, writable paths, and oracle classification; approve apply only with zero P0/P1 planning findings.
- [x] 1.2 Verify all five direct changes are verified, committed, and archived and every overlapping frontend owner has exited; record branch, `git rev-parse HEAD`, `git status --short`, allowed dirty paths, and preimages for every candidate file including `.impeccable/design.json`; stop on mismatch. Admission recorded on `codex/formal-rewrite` at `153dff7fb4c134f0871d7f4ac15950b7fecffd71` with a clean worktree; `.impeccable/design.json` SHA-256 preimage is `e1bc5c4263312a806a2c8c226d052fdd8d77666db09a3cd4802c5ddb1c59090d`; source/test candidates are admitted only after the implementation owner reproduces a failure.

## 2. Frontend Implementation Owner — `frontend/**` and Final Sidecar

- [x] 2.1 Recheck branch, HEAD, allowed dirty state, archive/owner admission, reviewed strict-valid artifacts, pinned Node `24.18.0`/npm `11.16.0`, writable paths, and protected inputs before editing; stop safely on any mismatch.
- [x] 2.2 From `frontend/`, run a fresh `npm ci` and `npm run check`; serve the generated `dist` with `npm run preview` and record the unmodified production baseline before deciding whether code changes are needed.
- [x] 2.3 Compare ranking against oracle `644b7748674e553f863d0ffd61d029f86fdc0717` in Light/Dark at 360, 390, 768, 779, 780, 781, 917, 1024, 1185, and 1440px, including query/share, loading/error/empty/retry, search/sort/page, person Drawer, SafeImage, overflow, console, resources, and network; classify every difference before editing.
- [x] 2.4 Run the same production comparison for co-star, including 0/1/2–10 selection topology, candidate Drawer/rail/tray, partners, pair/group analysis, local search/sort/page, tooltips, person Drawer, SafeImage, overflow, console, resources, and network.
- [x] 2.5 Exercise keyboard order, visible focus, panel/Drawer trapping and return, Escape, hidden/inert state, tooltip pointer/focus/tap dismissal, 44px effective targets, single scroll ownership, unique semantics, non-color state, contrast, forced colors, reduced motion, and 200% zoom across applicable matrix states.
- [x] 2.6 For each reproducible failure only, add or tighten a focused test under `frontend/tests/**`, apply the smallest public-API/semantic-token correction under the declared paths, and rerun its focused test and affected browser slice; make no source change for passing surfaces. No new production failure was reproduced, so no source or test change was made.
- [x] 2.7 Run `npm run check` again against the corrected candidate and confirm the artifact checker still enforces one HTML entry, approved assets, no source maps/forbidden content/direct upstream/browser statistics, and initial JavaScript gzip below 300 KiB.
- [x] 2.8 Serve the rebuilt `dist` and rerun the complete forty-combination base matrix plus all named state, keyboard, accessibility, console, resource, network, and overflow checks; record that every observed difference is oracle-preserved or cites an existing approved delta.
- [x] 2.9 Only after tasks 2.2–2.8 pass, regenerate exact `.impeccable/design.json` from unchanged `DESIGN.md` and the frozen final implementation; validate schema version 2, supported extensions, verbatim narrative, canonical values, 5–10 self-contained `ds-` snippets, valid JSON/no duplicate keys, no stale terminology, and no primitive-token authority duplication.
- [x] 2.10 Run `node .agents/skills/impeccable/scripts/context.mjs --target frontend/src/app/App.vue` in a fresh validation session and the read-only live-panel schema/render check; confirm no unexpected write, inspect `git diff --check` plus the exact owned diff, rerun `npm run check`, and hand the candidate/evidence to the reviewer.

## 3. Impeccable Finish Reviewer — Read-only Candidate Review

- [x] 3.1 Recheck the exact candidate HEAD/status, oracle, accepted-delta list, production-build identity, complete matrix evidence, sidecar validation, and protected-path diff before review; stop without writing on mismatch.
- [x] 3.2 Review the rendered production candidate for fidelity, responsive behavior, accessibility, interaction continuity, bundle evidence, and sidecar accuracy; report findings by severity and require zero P0/P1 without changing files. Independent review reported zero P0/P1; its one sidecar-only font-stack P2 was corrected and strictly revalidated by the main agent.

## 4. Main Agent — Acceptance and Lifecycle

- [x] 4.1 Audit every task result, reviewer finding, command output, matrix record, and owned diff; resolve P0/P1 through the smallest reopened task and revalidation, then record implemented/verified status separately from committed/pushed/released/deployed.
- [x] 4.2 Rerun `openspec validate harden-frontend-design-and-accessibility --strict` and `openspec validate --all --strict`; after acceptance, perform only narrow staging/commit and OpenSpec sync/archive lifecycle actions, leaving push, release, and deployment false unless separately authorized. The accepted implementation was committed at `a0edd1c0`; push, release, and deployment remain false.
