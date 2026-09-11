## Why

The production person inspector drifted from its approved score-distribution presentation: a score bar now compresses score, count, examples, and omission text into one sentence instead of showing a compact work-title list. Preference evidence titles also use a lower-emphasis color even though the user needs them to read as primary black text in the light theme.

## What Changes

- Restore the rating-distribution tooltip to a title-only, one-title-per-line list with bounded visible rows and an omission marker for additional works.
- Keep score and count in the bar's accessible name while removing those values and labels from the visible tooltip body.
- Render preference-evidence work titles with the theme's primary text color, which is near-black in Light and the corresponding accessible primary foreground in Dark.
- Add focused component and style regression coverage, then verify the real ranking inspector at desktop and compact widths.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-person-inspector`: Clarify the preserved score-tooltip list behavior and the preference-title text hierarchy within the existing adaptive person inspector.

## Impact

- **Status:** Proposed; apply is blocked until proposal, specs, design, and tasks pass strict validation and main-agent review.
- **Owner:** Frontend / `frontend-person-inspector`; the primary agent is the sole implementation owner for this bounded correction.
- **Behavior classification:** The title-only bounded tooltip is `PRESERVE_ORACLE` from immutable commit `644b7748674e553f863d0ffd61d029f86fdc0717`. The primary preference-title foreground is an `INTENTIONAL_DELTA` requested by the user and governed by `DESIGN.md` semantic theme colors.
- **Writable paths:** `openspec/changes/frontend-restore-person-detail-tooltip-and-title/**`, `frontend/src/features/person-detail/components/RatingEvidence.vue`, `frontend/src/features/person-detail/person-detail.css`, and `frontend/tests/features/person-detail/components.test.ts`.
- **Read-only protected inputs:** `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/surfaces/route.md`, `openspec/specs/frontend-person-inspector/spec.md`, the oracle commit, contracts and goldens, all other frontend source/tests, `frontend/src/shared/styles/base.css`, and every other active OpenSpec change.
- **Deletion complement:** None; no file, capability, test, or user data is deleted.
- **Mutable refs:** None; no branch, tag, remote ref, generated contract, persisted browser state, or live service state is mutated.
- **Consumes:** Existing person-detail bucket examples and hidden counts, semantic text tokens, current Naive UI Tooltip API, and the existing person-detail golden fixtures.
- **Produces:** A bounded title-list tooltip presentation, primary preference-title styling, focused regressions, and local verification evidence.
- **Dependencies:** Existing `frontend-person-inspector`, `frontend-design-system`, and `frontend-accessibility` capabilities; no new package or service dependency.
- **Deliverables:** Strict-valid change artifacts, implementation in the three declared frontend files, focused tests, affected frontend gate, rendered desktop/mobile evidence, and an exact final diff audit.
- **Acceptance:** Focused Vitest for `frontend/tests/features/person-detail/components.test.ts`; frontend typecheck/build or complete `npm run check` as local conditions permit; Impeccable detector result; desktop and compact `/ranking?user=lucay126` tooltip/foreground/keyboard/console/overflow checks; `openspec validate frontend-restore-person-detail-tooltip-and-title --strict`; and `git diff --check` on the owned paths.
- **Non-goals:** No metric or API change, no alternate tooltip framework, no global tooltip restyle, no ranking layout redesign, no copy changes outside the tooltip body, no theme-token rewrite, and no cleanup of unrelated dirty work.
- **Operations deferred:** Commit, push, pull request, merge, release, deployment, route changes, host mutation, and production activation remain out of scope without separate authorization.
- **External state:** This change touches no other repository or external/live system.
- **Stop/rollback conditions:** Stop on authority conflict, overlap with concurrent edits to writable files, strict validation failure, contract mismatch, or a fix requiring broader architecture or product behavior. Rollback is the exact removal of this change directory plus reversal of only the three declared frontend-file hunks before any separately authorized commit.
