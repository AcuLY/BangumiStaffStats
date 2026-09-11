## Why

At desktop widths the document reserves a scrollbar gutter on both inline edges, leaving a visible canvas strip beside otherwise full-width Header and page chrome. This wastes horizontal space and contradicts the product's dense, data-first layout while providing no stability benefit because the vertical scrollbar is already always present.

## What Changes

- Remove the desktop-only symmetric scrollbar reservation while retaining the permanent vertical scrollbar and existing 10px shell scrollbar styling.
- Keep the 1280px shared content line, responsive breakpoints, and all component geometry unchanged.
- Replace the regression assertion that requires `stable both-edges` with an assertion that forbids symmetric viewport gutters.
- Classify the externally visible correction as **INTENTIONAL_DELTA** from the current desktop behavior, governed by the user's reported issue, `PRODUCT.md`'s density principle, and `DESIGN.md`'s full-width Header chrome plus shared content-line contract. Oracle behavior outside this exact edge treatment remains **PRESERVE_ORACLE** against `644b7748674e553f863d0ffd61d029f86fdc0717`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-oracle-fidelity`: Require page chrome to reach the viewport content edges without a synthetic matching gutter opposite the real scrollbar, while preserving the existing shared 1280px content line.

## Impact

- **Status:** Proposed; apply is blocked until proposal, specs, design, and tasks pass strict validation and main-agent zero-P0/P1 review.
- **Owner:** Frontend.
- **Writable paths:** `frontend/src/shared/styles/base.css`; `frontend/tests/shared/scrollbar-system.test.ts`; `openspec/changes/frontend-remove-desktop-side-gutters/**`; lifecycle sync may update only `openspec/specs/frontend-oracle-fidelity/spec.md`.
- **Read-only protected inputs:** `AGENTS.md`; `PRODUCT.md`; `DESIGN.md`; `.impeccable/**`; `tmp-formal-development/**`; oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`; all other source, tests, contracts, archives, untracked files, and the production site `https://search.bgmss.fun/v2/ranking`.
- **Deletion complement:** No file or directory may be deleted.
- **Mutable refs:** Local branch `codex/remove-desktop-side-gutters` and its working tree only; no remote refs.
- **Consumes:** Existing semantic CSS scrollbar tokens, current browser-computed geometry, user screenshot, PRODUCT/DESIGN layout authority, and the existing scrollbar regression test.
- **Produces:** One bounded CSS correction, one focused regression update, strict-valid OpenSpec artifacts, and verification evidence.
- **Dependencies:** Existing frontend toolchain only; no dependency or generated-contract change.
- **Deliverables:** Edge-to-edge page chrome at desktop widths with the real scrollbar remaining on its native edge; unchanged inner content alignment and mobile behavior.
- **Acceptance:** Focused scrollbar test; frontend `npm run check`; production build; Impeccable layout detector; headless/browser geometry at representative mobile and desktop widths; `git diff --check`; strict OpenSpec validation.
- **Non-goals:** Changing `--workspace-max`, content gutters, Header/Query/Main/Footer alignment, scrollbar colors or width, component structure, copy, APIs, backend/updater/contracts, unrelated cleanup, or design-sidecar drift.
- **Operations deferred:** Release, deployment, host mutation, production activation, cache invalidation, and public route changes remain out of scope and require separate explicit authorization.
- **Stop/rollback conditions:** Stop on tracked overlap, authority conflict, non-zero focused/full frontend gates, horizontal overflow, content-line drift, mobile regression, or any required edit outside writable paths. Roll back only the exact owned diff with an inverse patch; never use destructive checkout/reset/clean commands.
- **External state:** Production is inspected read-only only. This change touches no other repository and performs no push, PR, tag, release, deployment, or host mutation.
