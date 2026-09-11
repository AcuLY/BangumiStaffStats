## Capability Boundary

- **Status:** local user-authorized footer placement delta.
- **Owner:** Frontend shell/footer.
- **Writable paths:** this change, shell/footer-only declarations in
  `frontend/src/shared/styles/base.css`,
  `frontend/tests/shared/shell-layout.test.ts`, root spec only during later
  sync.
- **Read-only protected inputs:** footer markup/copy/links, feature state/styles,
  APIs/contracts, Backend/updater/Archive, external state.
- **Deletion complement:** preserve the semantic footer, links, separator,
  touch/focus/safe-area behavior, Header, main content, and viewport scroll owner.
- **Mutable refs:** current local worktree and task markers only.
- **Consumes:** existing shell DOM order and responsive main content.
- **Produces:** normal-flow viewport-bottom placement on short pages.
- **Dependencies:** accepted `frontend-oracle-fidelity`; no package.
- **Deliverables:** CSS/test/browser/build evidence.
- **Acceptance:** short-page bottom alignment, long-page non-overlap, bounded
  scrollWidth, unchanged footer interaction.
- **Non-goals:** fixed footer, redesign/copy/link changes, feature/data/API work.
- **Operations deferred:** full gate, lifecycle, Git/release/deploy/host mutation.
- **Stop/rollback conditions:** overlay, nested scroll, Header/main shift,
  overflow, footer interaction drift, or failed focused checks.

## ADDED Requirements

### Requirement: Site footer SHALL finish short pages at the viewport bottom

The existing site footer SHALL remain in normal document flow. When Header,
main content, and footer are shorter than the viewport, the shell SHALL
distribute unused vertical space before the footer so the footer's bottom edge
meets the viewport bottom, including current safe-area padding. When content is
longer than the viewport, the footer SHALL follow that content and SHALL NOT
overlay it, create an internal page-shell scroll container, or replace the
document root as scroll owner. Footer copy, link order/destinations, navigation
label, wrapping, focus, touch targets, colors, and separators SHALL remain
unchanged.

#### Scenario: Compact route has short content

- **WHEN** a supported route renders at 605×807 with content shorter than the
  available page height
- **THEN** the footer bottom SHALL differ from the viewport bottom by no more
  than one CSS pixel
- **AND** no blank document region SHALL follow the footer

#### Scenario: Result content exceeds the viewport

- **WHEN** ranking or analysis content is taller than the viewport
- **THEN** the footer SHALL render after that content without covering it
- **AND** documentElement SHALL remain the sole shell scroll owner with no
  horizontal overflow introduced by the footer height chain
