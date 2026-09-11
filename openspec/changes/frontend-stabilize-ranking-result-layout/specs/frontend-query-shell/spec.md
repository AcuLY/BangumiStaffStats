## Capability Boundary

- **Status:** Proposed correction to supported root reflow.
- **Owner:** Frontend shell presentation.
- **Writable paths:** This change, `frontend/src/shared/styles/base.css`, `frontend/tests/shared/scrollbar-system.test.ts`, and exact ownership-transfer notes.
- **Read-only protected inputs:** Header/query/result components, scrollbar colors/tiers, other CSS/tests, Backend, external state.
- **Deletion complement:** Preserve the vertical viewport scrollbar, 320px design floor, semantic layout, and all controls/content.
- **Mutable refs:** Current local dirty worktree only.
- **Consumes:** Existing root minimum and reserved 10px viewport scrollbar.
- **Produces:** Scrollbar-aware minimum sizing without horizontal root overflow.
- **Dependencies:** Native CSS sizing only; no package or script.
- **Deliverables:** Root CSS/test correction and rendered 320–330 evidence.
- **Acceptance:** `scrollWidth <= clientWidth + 1` at 320/328/329/330 with vertical scrollbar retained.
- **Non-goals:** Hiding overflow, scrollbar redesign, broader responsive cleanup, Figma.
- **Operations deferred:** Full gate, sync/archive, Git/release/deploy/host mutation.
- **Stop/rollback conditions:** Lost vertical scrollbar ownership, clipped content, supported-width regression, or failed checks.

## ADDED Requirements

### Requirement: Root minimum width SHALL account for the reserved viewport scrollbar

The frontend shell SHALL retain its 320px design floor without forcing horizontal page scrolling when the browser reserves space for the required viewport scrollbar. At nominal viewport widths from 320px upward, the root and body minimum sizing SHALL shrink to the actual available client width when necessary; the shell SHALL NOT hide horizontal overflow to mask a layout error or remove the vertical scrollbar owner.

#### Scenario: 320px viewport reserves a vertical scrollbar

- **WHEN** the browser reports a nominal 320px inner width and a narrower client width because the viewport scrollbar is reserved
- **THEN** the page scroll width SHALL be no more than client width plus one subpixel tolerance
- **AND** all ranking toolbar controls and list content SHALL remain present without horizontal clipping

#### Scenario: Client width reaches the design floor

- **WHEN** the available client width is at least 320px
- **THEN** the ordinary 320px design floor and current vertical scrollbar ownership SHALL remain unchanged
