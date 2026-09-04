## Capability Boundary

- **Status:** Proposed intentional presentation correction; no implementation authority until strict validation and main-agent review pass.
- **Owner:** Frontend.
- **Writable paths:** `openspec/changes/frontend-fix-ranking-sort-icon/**`, `frontend/src/shared/styles/base.css`, and `frontend/tests/features/ranking/components.test.ts`.
- **Read-only protected inputs:** Product/design/theme/component authorities and oracle commit named in `proposal.md` and `design.md`.
- **Deletion complement:** No deletion of files, selectors, tests, assets, dependencies, or capabilities.
- **Mutable refs:** Local `codex/fix-ranking-sort-icon` only.
- **Consumes:** Existing semantic foreground tokens, public Naive UI button presentation, shared `AppIcon`, and reduced-motion behavior.
- **Produces:** One shared sort-direction affordance correction plus focused and rendered verification evidence.
- **Dependencies:** Existing frontend presentation stack only; no new package, contract, API, schema, or statistical authority.
- **Deliverables:** Matching icon/label color and synchronized theme color transition without changing direction behavior.
- **Acceptance:** Strict OpenSpec validation, focused ranking test, full frontend check, rendered Light/Dark plus asc/desc verification, and `git diff --check`.
- **Non-goals:** Redesign, copy/size/sort/theme-owner changes, other icon changes, private UI-library internals, or broad cleanup.
- **Operations deferred:** Push, PR, merge, release, deployment, host mutation, and production activation.
- **Stop/rollback conditions:** Stop on authority conflict, overlap, validation failure, relevant test/build failure, or required scope expansion; rollback removes only this bounded CSS/test/spec delta.

## ADDED Requirements

### Requirement: Sort-direction icon SHALL remain visually unified with its button label

Every shared ranking sort-direction control SHALL render its chevron with the same computed foreground color as its adjacent button label in Light and Dark themes and in interactive states. Theme-driven foreground changes SHALL interpolate with the same duration and easing as the button label, while the directional rotation MAY retain its shorter existing feedback timing. Reduced-motion preference SHALL disable both icon transitions without changing the final color or direction.

#### Scenario: Theme changes while a sort-direction control is visible

- **WHEN** the document changes between Light and Dark while a shared sort-direction button is visible
- **THEN** the chevron and label SHALL start from equal computed foreground colors and finish at equal computed foreground colors
- **AND** their foreground transitions SHALL use the same duration and easing without an icon-only snap

#### Scenario: Sort direction changes

- **WHEN** the user activates a descending or ascending shared sort-direction button
- **THEN** the existing label, accessible name, emitted order, and 180-degree directional relationship SHALL remain correct
- **AND** the chevron SHALL remain the same computed foreground color as the label throughout the resulting button state

#### Scenario: Reduced motion is requested

- **WHEN** `prefers-reduced-motion: reduce` applies
- **THEN** the chevron SHALL immediately reach the correct theme color and direction with zero transition duration
