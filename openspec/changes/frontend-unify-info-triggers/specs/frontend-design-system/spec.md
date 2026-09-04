## Capability Boundary

- **Status:** local user-authorized shared info-trigger delta.
- **Owner:** Frontend shared design system.
- **Writable paths:** shared InfoIcon/AppIcon/base class; exact QueryIcon,
  CoStarIcon, trigger markup/local info styles/tests; this change; root spec
  during later sync.
- **Read-only protected inputs:** help content/state, empty-state illustration,
  unrelated icons/features, APIs/contracts/Backend/updater/Archive/external state.
- **Deletion complement:** only duplicated info glyph branches and conflicting
  local presentation; preserve every control and interaction.
- **Mutable refs:** current dirty worktree and task markers only.
- **Consumes:** query trigger reference, semantic tokens, existing icon wrappers.
- **Produces:** one shared info glyph and trigger presentation contract.
- **Dependencies:** existing Vue/CSS; no package.
- **Deliverables:** source/style/test/browser/build evidence.
- **Acceptance:** identical glyph/16px icon/24px visible box/6px radius and
  token states across all interactive info triggers.
- **Non-goals:** help behavior/copy, empty illustration, unrelated icon changes.
- **Operations deferred:** full gate, lifecycle, Git/release/deploy/host mutation.
- **Stop/rollback conditions:** visual, layout, theme, target, interaction, test,
  or scope regression.

## ADDED Requirements

### Requirement: Interactive info triggers SHALL use one shared visual contract

Every interactive info/help trigger in query, person detail, partners, and
co-star work surfaces SHALL render the exact shared query-reference glyph at
16px inside a 24px visible control. The control SHALL use the 6px control radius,
tertiary text color and transparent background by default, text-primary color
on hover, and the shared visible focus ring. Its effective pointer target SHALL
be at least 44×44px without enlarging the visible box or overlapping a sibling
target. QueryIcon, AppIcon, and CoStarIcon SHALL render that info glyph from one
shared source rather than maintaining separate geometry.

#### Scenario: Info triggers render across product surfaces

- **WHEN** UID, query option, person metric evidence, partners metric, and series
  identity help triggers are rendered in the same theme
- **THEN** their glyph path, stroke, icon size, visible box, radius, default,
  hover, and focus presentation SHALL be identical
- **AND** each effective target SHALL remain at least 44×44px

#### Scenario: Decorative empty-state info renders

- **WHEN** the co-star no-common-work empty state displays its 28px info symbol
- **THEN** it MAY reuse the shared glyph but SHALL remain a non-interactive
  illustration without the info-trigger control surface
