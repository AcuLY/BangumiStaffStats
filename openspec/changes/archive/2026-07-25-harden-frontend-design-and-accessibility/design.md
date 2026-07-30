## Context

This is the final frontend development gate, not a design iteration. The
ranking and co-star verticals establish production behavior; oracle commit
`644b7748674e553f863d0ffd61d029f86fdc0717` establishes the only approved
outward baseline; `PRODUCT.md` and `DESIGN.md` define the already-approved
production and accessibility additions. The current
`.impeccable/design.json` predates the final implementation and must remain
untouched until the rendered candidate is accepted.

| Boundary | Declaration |
|---|---|
| Status | Investigated: complete. Specified/main-agent reviewed: complete. Implemented, verified, committed, pushed, released, and deployed: no. |
| Owner | One Frontend implementation agent owns source/test corrections, matrix execution, and the final sidecar write. A separate Impeccable reviewer is read-only; the main agent owns spec decisions and acceptance. |
| Writable paths | Evidence-backed hunks under `frontend/src/**`; corresponding `frontend/tests/**`; only `frontend/scripts/check-architecture.mjs`, `frontend/scripts/check-production-artifact.mjs`, `frontend/index.html`, and `frontend/vite.config.ts` when a failing gate requires them; exact `.impeccable/design.json` after all preceding gates; this change's task markers. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `.impeccable/surfaces/route.md`, all other `.impeccable/**`, Impeccable skill files, oracle, formal guides, contracts/backend/updater, generated DTOs/generators, package manifests/lockfile, other OpenSpec artifacts, external repositories, refs/remotes, and operations state. |
| Deletion complement | Delete only tests newly created by this change. Restore existing files by owned hunk and restore `.impeccable/design.json` from its exact preimage; never clean a directory broadly. |
| Mutable refs | None during apply. Accepted lifecycle actions remain with the main agent; remote refs are protected. |
| Consumes | Archived ranking and co-star frontend verticals, accepted frontend capabilities, oracle evidence, current product/design authorities, production APIs/contracts, and installed Impeccable tooling. |
| Produces | Production-preview evidence, regression tests and smallest proven fixes, clean bundle evidence, accessibility/fidelity matrix results, and the current schema-v2 Impeccable sidecar. |
| Dependencies | Direct edges are `implement-frontend-query-shell`, `implement-frontend-ranking-results`, `implement-frontend-person-inspector`, `implement-frontend-co-star-vertical`, and `restore-frontend-oracle-fidelity` → this change. All five must be verified, committed, and archived; no other active frontend owner may overlap apply paths. |
| Deliverables | Matrix and oracle comparisons, focused fixes/tests, full checks, artifact-denylist results, sidecar regeneration/validation, and an independent finish review. |
| Acceptance | All capability scenarios pass against the production bundle and the independent review has zero P0/P1 findings. |
| Non-goals | Redesign, aesthetic preference, new product behavior/copy/API/statistics/state, dependency upgrades, private component DOM, protected-authority edits, unrelated cleanup, or non-frontend work. |
| Operations deferred | Hosting, production configuration, release/deploy/cutover, secrets, timers, monitoring deployment, hosts, and live state. |
| Stop/rollback conditions | Stop on an unmet archive gate, overlapping owner, authority conflict, unproven difference, undeclared path/dependency/behavior, attempted redesign/private-DOM coupling, or premature sidecar write. Revert only owned hunks/new tests and restore the sidecar preimage. |

## Goals / Non-Goals

**Goals:**

- Prove the final built SPA preserves the oracle except for already-approved
  `PRODUCT.md`/`DESIGN.md` additions.
- Prove responsive and WCAG 2.2 AA behavior across the complete required
  browser matrix and repair only reproduced defects.
- Prove the production artifact is clean and within its existing budget.
- Regenerate the Impeccable extensions sidecar from the accepted design and
  implementation without changing `DESIGN.md`.

**Non-Goals:**

- No redesign, exploratory polish, new capability, dependency, abstraction,
  state/request layer, statistical logic, or operations work.
- No source change merely because a reviewer prefers another appearance.

## Decisions

### 1. Admission is archive-gated and single-owner

Apply starts only after the three archived frontend foundations and both active
frontend completion changes are fully verified, committed, and archived, and
after all overlapping frontend ownership has ended. One implementation owner
executes the sequence; the finish reviewer does not write. This prevents the
matrix or sidecar from describing a moving target.

Alternative considered: begin on whichever screen appears complete. Rejected
because concurrent changes would invalidate evidence and sidecar output.

### 2. Production-preview evidence precedes every correction

Build with the pinned toolchain, serve `frontend/dist`, and compare the same
mode, theme, viewport, state, and deterministic server response against the
oracle. The base layout matrix is:

- modes: ranking and co-star;
- themes: Light and Dark;
- widths: 360, 390, 768, 779, 780, 781, 917, 1024, 1185, and 1440px.

The run also exercises loading/error/empty/retry states, query editing and
sharing, sorting/search/pagination, person and candidate Drawers, every
SafeImage state, tooltips, keyboard order, focus return, Escape, inertness,
scroll ownership, reduced motion, forced colors, and 200% zoom where those
states apply. Browser console, required resources, direct upstream requests,
duplicate IDs, and horizontal overflow are inspected.

Each difference is classified before editing:

- `PRESERVE_ORACLE`: visible geometry, hierarchy, copy, state, interaction, and
  responsive behavior must match the oracle; antialiasing alone is not a
  defect.
- `INTENTIONAL_DELTA`: only a named, existing higher-authority requirement is
  retained and linked in evidence.
- `NEW_CAPABILITY`: only this final verification and sidecar output.

Alternative considered: inspect source or component snapshots alone. Rejected
because rendered production behavior is the acceptance surface.

### 3. Fix the smallest public layer and add a regression

A source change requires a reproducible matrix failure. The owner changes the
smallest feature/shared public layer, adds or tightens a focused test, and
reruns the affected slice before the full matrix. Public component props,
slots, semantic classes, and documented theme tokens are allowed; private
Naive UI DOM or internal variables are not. Invisible hit-area enlargement is
allowed only when it preserves visible oracle geometry.

Alternative considered: broad visual cleanup or component replacement.
Rejected because it is both higher-risk and outside the approved behavior.

### 4. Verify the install and production artifact as shipped

The pinned Node/npm versions, a fresh install, `npm run check`, and production
preview are authoritative. Existing architecture and artifact checks must
continue to enforce one SPA entry, approved assets, no source maps, no
fixture/prototype/test paths or markers, no browser statistics, no direct
Bangumi API URL, and initial JavaScript gzip below the existing 300 KiB
ceiling. No package or lockfile change is authorized.

Alternative considered: accept the development server after unit tests.
Rejected because development transforms can conceal production-only failures.

### 5. Regenerate the sidecar last and preserve root authority

Only after code, bundle, and rendered evidence are stable may the owner replace
`.impeccable/design.json`. The result must:

- use `schemaVersion: 2` and contain only supported extension metadata;
- derive canonical values, narrative, rules, and breakpoint meaning from the
  unchanged current `DESIGN.md`, copying narrative text verbatim where the
  Impeccable schema requires it;
- describe the final implementation with 5–10 representative, self-contained
  `ds-` component snippets using public tokens and visible interaction states;
- contain valid JSON with no duplicate keys, stale prototype terminology, or
  primitive-token authority duplicated from `DESIGN.md`;
- pass Impeccable context/validation and the live-panel schema/read-only
  rendering check without an auto-fix write.

Alternative considered: regenerate early and adjust it alongside source.
Rejected because generated documentation must describe the accepted result,
not guide a redesign.

### 6. Finish with independent rendered review

After all gates pass, a separate reviewer receives the exact candidate,
oracle, accepted delta list, and matrix evidence. The reviewer may report
findings but cannot edit. Any P0/P1 reopens the smallest affected task and its
checks; zero P0/P1 permits main-agent acceptance.

## Risks / Trade-offs

- **Matrix cost** → Run the full matrix only on a stable production candidate;
  use focused reruns while repairing a demonstrated defect.
- **Platform rendering noise** → Compare structure, geometry, state, and
  interaction; record antialiasing-only differences instead of changing code.
- **Accessibility fix changes appearance** → Prefer semantic markup, focus
  control, and invisible target geometry; stop for a spec amendment if a
  visible oracle delta is truly required.
- **Sidecar drifts from source** → Generate once from frozen accepted inputs and
  validate it after every later corrective rerun.
- **Dirty shared worktree causes collateral edits** → Record preimages and
  owned paths, inspect the candidate diff, and never use broad reset/clean.

## Migration Plan

1. Verify archive and ownership admission gates; record relevant preimages.
2. Build and run the unmodified candidate through full checks and matrix.
3. For each proven defect, add a regression, apply the smallest fix, and rerun
   focused gates; when stable, rerun the full check and matrix.
4. Regenerate and validate only `.impeccable/design.json`.
5. Obtain independent zero-P0/P1 review, then hand the exact diff and evidence
   to the main agent for acceptance and lifecycle work.
6. On failure, restore only owned hunks/new tests and the sidecar preimage.

## Open Questions

None. A newly discovered need for a dependency, public behavior change,
protected-path edit, or visible departure from the oracle requires stopping
and amending this change before implementation continues.
