## Why

The two production frontend verticals need one final rendered acceptance pass
before the frontend can be considered complete. This pass must close only
demonstrated oracle-fidelity, responsive, accessibility, and production-bundle
defects, then regenerate the stale Impeccable sidecar from the accepted result.

## What Changes

- **PRESERVE_ORACLE** — use commit
  `644b7748674e553f863d0ffd61d029f86fdc0717` as the sole outward visual and
  interaction baseline; this change is not authorization to redesign or
  “polish” the UI.
- **INTENTIONAL_DELTA** — preserve only additions already required by
  `PRODUCT.md`, `DESIGN.md`, and accepted frontend capabilities. This change
  introduces no further product, copy, state, API, or statistical delta.
- **NEW_CAPABILITY** — exercise the built production bundle across the complete
  `DESIGN.md` browser matrix and repair only evidence-backed fidelity or WCAG
  2.2 AA defects.
- **NEW_CAPABILITY** — verify production-artifact hygiene, SafeImage states,
  responsive/scroll/focus/tooltip behavior, and regenerate
  `.impeccable/design.json` only after the rendered candidate is stable.

## Capabilities

### New Capabilities

- `frontend-design-system`: final oracle-compatible design-system, production
  bundle, and generated Impeccable-sidecar acceptance.
- `frontend-accessibility`: final responsive, keyboard, focus, assistive-state,
  motion, contrast, target-size, and browser-matrix acceptance.

### Modified Capabilities

None.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Investigated, specified, implemented, verified, and committed at `a0edd1c0`: complete. Pushed, released, and deployed: no. |
| Owner | One Frontend implementation agent owns the bounded source/test corrections, browser matrix, and final sidecar regeneration after admission. A separate read-only Impeccable finish reviewer checks rendered evidence; the main agent owns decisions, spec edits, lifecycle coordination, and final acceptance. |
| Writable paths | Evidence-backed hunks under `frontend/src/**`; corresponding tests under `frontend/tests/**`; only `frontend/scripts/check-architecture.mjs`, `frontend/scripts/check-production-artifact.mjs`, `frontend/index.html`, and `frontend/vite.config.ts` when a failing acceptance gate proves they are required; exact file `.impeccable/design.json` after all code/browser gates pass; and this change's task markers. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `.impeccable/surfaces/route.md`, every other `.impeccable/**` path, `.agents/skills/impeccable/**`, oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`, `tmp-formal-development/**`, `contracts/**`, `backend/**`, `updater/**`, generated DTOs and generators, `frontend/package.json`, `frontend/package-lock.json`, other OpenSpec changes/specs, external repositories, refs/remotes, and operations or production state. |
| Deletion complement | Only new tests created under the declared test paths may be deleted during rollback. Existing source/config/checker files and `.impeccable/design.json` are hunk- or file-preimage-restored; no directory-wide cleanup or unrelated deletion is allowed. |
| Mutable refs | None during apply. Staging, commit, OpenSpec sync/archive, and local branch housekeeping remain main-agent lifecycle actions after acceptance; remote refs remain protected. |
| Consumes | Fully verified, committed, and archived `implement-frontend-query-shell`, `implement-frontend-ranking-results`, `implement-frontend-person-inspector`, `implement-frontend-co-star-vertical`, and `restore-frontend-oracle-fidelity` outputs; accepted frontend capabilities; immutable oracle evidence; current `PRODUCT.md` and `DESIGN.md`; the production API/contract surfaces; and the existing Impeccable tooling. |
| Produces | A strictly checked production bundle, a completed rendered/browser/accessibility matrix, only proven corrective source/test changes, and one current schema-v2 `.impeccable/design.json` generated from the unchanged root design authority and final implementation. |
| Dependencies | Exact direct change IDs: `implement-frontend-query-shell`, `implement-frontend-ranking-results`, `implement-frontend-person-inspector`, `implement-frontend-co-star-vertical`, and `restore-frontend-oracle-fidelity`. Apply is blocked until all five are verified, committed, and archived and no other active frontend implementation owner overlaps these paths. |
| Deliverables | Oracle comparison; both modes in Light/Dark at every `DESIGN.md` viewport; keyboard/focus/tooltip/Drawer/scroll/SafeImage/state checks; production-bundle and artifact-denylist checks; focused regression tests for every repair; regenerated sidecar; and an independent read-only finish review. |
| Acceptance | Full frontend checks and a clean production build pass; the production preview passes the complete required matrix with no unapproved oracle difference, accessibility P0/P1, page overflow, duplicate ID, console error, failed required resource, direct `api.bgm.tv` access, forbidden fixture/prototype/statistics code, or stale sidecar; separate review reports zero P0/P1 findings. |
| Non-goals | Redesign, aesthetic preference work, new behavior/copy/API/state/statistics, backend/contracts/updater changes, new dependency or abstraction, private component DOM coupling, root design/product edits, prototype work, or unrelated cleanup. |
| Operations deferred | Hosting, nginx/systemd/Compose, deployment, monitoring configuration, release, tag, cutover, production secrets, real periodic execution, host mutation, and production activation. |
| Stop/rollback conditions | Stop before apply when either direct dependency is not archived, another frontend owner overlaps, the oracle conflicts with higher authority, a difference lacks rendered evidence, a fix needs an undeclared path/dependency/public behavior, or sidecar regeneration would precede final acceptance. Stop and amend the spec rather than redesigning, changing protected authority, coupling to private library DOM, or mutating external state. Roll back only owned hunks/new tests and restore the exact sidecar preimage if its validation fails. |
| External state | This change touches no other repository or external state. Pull request, push, tag, release, deployment, host mutation, and production activation require separate explicit authorization. |

Apply is approved and admitted at
`153dff7fb4c134f0871d7f4ac15950b7fecffd71`: every direct dependency is
verified, committed, and archived, and all overlapping frontend owners have
exited.
