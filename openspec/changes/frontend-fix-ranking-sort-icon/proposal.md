## Why

The shared ranking sort-direction button gives its chevron a tertiary foreground color and only transitions its rotation, while Naive UI transitions the button text color over 300ms. This makes the icon visibly disagree with the adjacent label in Dark mode and snap at a different time during theme changes.

## What Changes

- Make the sort-direction chevron inherit the button's computed foreground color in every theme and interaction state.
- Give the chevron color the same 300ms standard easing used by the public Naive UI button while preserving the existing 160ms directional rotation and reduced-motion behavior.
- Add focused regression coverage and verify the rendered ranking toolbar in Light/Dark and ascending/descending states.
- Classify the user-visible correction as **INTENTIONAL_DELTA** governed by the user's browser comment and DESIGN.md's Light/Dark semantic-token and motion rules. The remaining ranking toolbar behavior and appearance stay **PRESERVE_ORACLE** relative to `644b7748674e553f863d0ffd61d029f86fdc0717`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-query-shell`: Require the shared sort-direction affordance to keep its icon color and theme transition synchronized with its button label.

## Impact

- **Status:** Proposed; apply is blocked until proposal, delta spec, design, and tasks pass strict validation and main-agent review.
- **Owner:** Frontend.
- **Writable paths:** `openspec/changes/frontend-fix-ranking-sort-icon/**`, `frontend/src/shared/styles/base.css`, and `frontend/tests/features/ranking/components.test.ts`.
- **Read-only protected inputs:** `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/surfaces/route.md`, `frontend/src/features/ranking/components/SortDirectionButton.vue`, `frontend/src/shared/components/AppIcon.vue`, `frontend/src/app/theme.ts`, `frontend/src/app/themeOverrides.ts`, `openspec/specs/frontend-query-shell/spec.md`, and oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`.
- **Deletion complement:** No files, selectors, tests, assets, dependencies, or capabilities are deleted.
- **Mutable refs:** Local branch `codex/fix-ranking-sort-icon` only; no remote refs.
- **Consumes:** Existing semantic text tokens, Naive UI's public button output, the shared `AppIcon`, and the established reduced-motion rule.
- **Produces:** One CSS correction, focused regression coverage, rendered verification evidence, and this OpenSpec change.
- **Dependencies:** Existing Vue/Naive UI frontend only; no dependency or toolchain change.
- **Deliverables:** Matching icon/text foreground color, synchronized theme color transition, unchanged sort rotation/behavior, and honest validation evidence.
- **Acceptance:** `npx --yes @fission-ai/openspec@1.6.0 validate frontend-fix-ranking-sort-icon --strict`; focused Vitest for ranking components; `npm run check`; rendered Browser checks on `/ranking?user=729218` in Light/Dark and both sort directions; `git diff --check`.
- **Non-goals:** Redesigning the toolbar, changing copy, target size, sort semantics, theme ownership, other icons, Naive UI internals, or unrelated CSS cleanup.
- **Operations deferred:** No push, pull request, merge, release, deployment, host mutation, or production activation is authorized.
- **External state:** No other repository or external state is touched.
- **Stop/rollback conditions:** Stop on authority conflict, overlapping concurrent edits, strict-validation failure, relevant test/build failure, or a fix requiring private Naive UI selectors/variables. Rollback is the exact removal of this change's bounded CSS/test/spec additions on the local topic branch.
