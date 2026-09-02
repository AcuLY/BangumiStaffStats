## Capability Boundary

- **Status:** Modified capability; implementation blocked until strict validation and main-agent zero-P0/P1 review.
- **Owner:** Frontend.
- **Writable paths:** `frontend/src/shared/styles/base.css`; `frontend/tests/shared/scrollbar-system.test.ts`; `openspec/changes/frontend-remove-desktop-side-gutters/**`; lifecycle sync only at `openspec/specs/frontend-oracle-fidelity/spec.md`.
- **Read-only protected inputs:** `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `.impeccable/**`, `tmp-formal-development/**`, oracle `644b7748674e553f863d0ffd61d029f86fdc0717`, all other tracked/untracked files, and production state.
- **Deletion complement:** No file or directory may be deleted.
- **Mutable refs:** Local branch `codex/remove-desktop-side-gutters` and working tree only; no remote ref.
- **Consumes:** Existing root scrollbar contract, design authorities, user screenshot, and read-only browser geometry.
- **Produces:** Corrected page-edge presentation and focused regression evidence.
- **Dependencies:** Existing frontend CSS/test/build stack only; no cross-language contract and no new statistical authority.
- **Deliverables:** Viewport-filling page chrome without a mirrored scrollbar gutter, preserving the shared 1280px content line.
- **Acceptance:** Focused scrollbar test, full frontend check/build, layout detector, representative browser geometry, strict OpenSpec validation, and `git diff --check`.
- **Non-goals:** Inner content width/gutters, component layout, scroll styling, mobile behavior, API/data semantics, dependencies, unrelated cleanup, or nested OpenSpec roots/skills.
- **Operations deferred:** Push, PR, release, deployment, host mutation, production activation, routing, and cache work remain separately authorized states.
- **Stop/rollback conditions:** Stop on overlap, conflict, gate failure, horizontal overflow, content-line drift, mobile regression, or out-of-scope edits; rollback only the exact owned patch.

## ADDED Requirements

### Requirement: Page chrome SHALL not reserve a mirrored scrollbar gutter

At every supported viewport, the formal SPA's outer shell and full-width chrome SHALL occupy the complete document content width up to the native scrollbar edge. The page SHALL NOT reserve a matching empty scrollbar gutter on the opposite inline edge. The Header, Query, Main Workspace, and Footer inner content SHALL continue to share the governed 1280px maximum content line and responsive content padding.

#### Scenario: Desktop route uses a visible vertical scrollbar

- **WHEN** a user opens `/ranking` or `/co-star` at a desktop viewport with a visible shell scrollbar
- **THEN** the shell and Header chrome SHALL begin at the non-scrollbar viewport edge and end at the real scrollbar edge
- **AND** no equal-width blank strip SHALL appear on the opposite edge
- **AND** Header, Query, Main Workspace, and Footer inner content SHALL retain one centered 1280px maximum line

#### Scenario: Document changes between short and long states

- **WHEN** query and result states change the document height across the viewport height
- **THEN** the reserved real scrollbar track SHALL keep the available document width stable
- **AND** the shell SHALL NOT introduce a second synthetic gutter or horizontal overflow

#### Scenario: Small and intermediate viewports render

- **WHEN** the SPA renders at supported mobile, breakpoint-adjacent, or zoomed widths
- **THEN** existing responsive content padding and structural breakpoints SHALL remain unchanged
- **AND** document `scrollWidth` SHALL not exceed `clientWidth + 1`

#### Scenario: Implementation paths are dirty or acceptance regresses

- **WHEN** either owned implementation path has a pre-existing overlapping change, or focused/full acceptance detects edge, alignment, overflow, or responsive drift
- **THEN** apply SHALL stop without overwriting the overlap or mutating any protected path, remote ref, or external state
- **AND** the change SHALL not be reported as verified, released, or deployed
