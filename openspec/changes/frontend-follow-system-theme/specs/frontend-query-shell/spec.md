> Supersession (2026-09-08): `contracts-remove-query-sharing` retires the query-sharing feature and overrides the sharing-specific requirements, preservation clauses, and acceptance assumptions below. URL fragments are cleared without parsing or replay. Header now has an always available same-tab “回到旧版” link to `https://search.bgmss.fun/old/` immediately left of theme. Exact accepted workspace recovery remains frontend-local through validated v2 JSON session storage; v1 fragment-based storage is discarded. Completed evidence below remains historical, and unrelated requirements are unchanged.

## Capability Boundary

- **Status:** local user-authorized, implemented, focused-verified, and
  governing-document-synchronized theme ownership delta.
- **Owner:** Frontend App theme owner.
- **Writable paths:** exact theme owner, App/Header wiring, shared Header style,
  exact theme/Header tests, this change, `DESIGN.md`,
  `.impeccable/design.json`, and root query-shell spec.
- **Read-only protected inputs:** provider/tokens, query/URL/share/resource state,
  unrelated source/tests, packages/generated files, Backend/external state.
- **Deletion complement:** contextual theme Popover/follow-reset plumbing/styles
  and superseded v1/v2 persistence; preserve resolved Light/Dark application,
  one-click action, isolation, cleanup.
- **Mutable refs:** current dirty worktree and task markers only.
- **Consumes:** system color-scheme media, durable local preference, storage events.
- **Produces:** default system following, inferred persistent
  `auto|light|dark`, one visible toggle, and same-browser tab convergence.
- **Dependencies:** existing browser/Vue/Naive APIs; no package.
- **Deliverables:** implementation/tests/browser/build evidence.
- **Acceptance:** system initial/change, direct toggle, automatic return to
  `auto`, tab sync, fallback/disposal, no secondary UI or query side effect.
- **Non-goals:** visible three-state/reset UI, TTL, server/cross-device preference.
- **Operations deferred:** change archive, full gate, Git/release/deploy/host mutation.
- **Stop/rollback conditions:** early manual preference loss, stale listener,
  persistent Header clutter, incorrect theme/meta, storage exception, side effect.

## MODIFIED Requirements

### Requirement: Query Workspace SHALL preserve the approved outward behavior

The production components SHALL preserve the final oracle/DESIGN Header and
Query Workspace, not their component or store structure. With no Applied Query the
editor SHALL start expanded. Success SHALL collapse to the applied summary;
validation failure, request failure, and cancellation SHALL keep it expanded
with Draft. On desktop the expanded editor SHALL overlay below the fixed
header without pushing content; below 780px it SHALL participate in document
flow. Controls SHALL meet DESIGN focus, keyboard, target-size, contrast,
status-announcement, and reduced-motion requirements.

The Header SHALL contain brand, the two-mode control, share action, and one
theme action in the DESIGN order. One app-level owner SHALL expose only the
resolved `light|dark` theme and SHALL drive the Naive provider plus semantic
CSS tokens through public APIs. With no valid preference or with
`bgmss-theme-preference-v3=auto`, it SHALL initialize from
`prefers-color-scheme: dark` and follow system changes while the page is open.
Activating the Header theme action SHALL immediately toggle to the opposite
resolved Light/Dark theme. When that result matches the current system theme,
the owner SHALL persist `auto`; otherwise it SHALL persist the explicit
`light` or `dark`. The same one-click action SHALL be the only theme control;
activation SHALL NOT open a Popover, menu, settings surface, fixed-state copy,
or secondary reset action. Valid `auto|light|dark` writes and key removal in
another same-browser tab SHALL update the open page without reload.

Invalid, inaccessible, or unavailable storage SHALL fail safely to system
following; unavailable matchMedia SHALL fall back to Light. Disposal SHALL
remove media and storage listeners. Theme SHALL not enter query Draft/Applied
state, URL parameters, share payload, resource state, or Skeleton behavior;
the prototype `bgmss-workbench-theme` and superseded `bgmss-theme-v1` and
`bgmss-theme-override-v2` keys SHALL not be read or written.

The brand SHALL reuse the project's exact 64×64 RGBA mark from
`frontend/public/bgmss.png` at oracle
`644b7748674e553f863d0ffd61d029f86fdc0717`, SHA-256
`d3d1ca5d14d560f3415dfbcc84b58ece72741a51cf860362d09284ed21aa394a`,
as the production-owned `src/assets/brand/bgmss.png`. No screenshot, fixture,
prototype path, external request, or replacement visual identity SHALL enter
the production artifact.

#### Scenario: Desktop and mobile disclosure behavior
- **WHEN** the same editor is opened at a supported desktop viewport and below 780px
- **THEN** desktop SHALL use the anchored overlay and mobile SHALL use document flow
- **AND** close/apply/cancel SHALL preserve the specified focus and Draft behavior without overflow

#### Scenario: Page follows the system theme
- **WHEN** a page opens without a valid manual preference and the system theme
  is Dark or changes between Light and Dark
- **THEN** the resolved theme SHALL immediately match the current system theme
  through the provider plus semantic document marker
- **AND** no theme preference SHALL be written merely because the system changed

#### Scenario: Theme is toggled away from the system appearance
- **WHEN** the user activates the Header theme action
- **AND** the opposite resolved theme differs from the current system theme
- **THEN** it SHALL apply in one click and one non-expiring explicit Light/Dark
  value SHALL be stored
- **AND** later system changes SHALL NOT override it

#### Scenario: Toggle returns to the system appearance
- **WHEN** the user activates the same Header theme action
- **AND** the opposite resolved theme matches the current system theme
- **THEN** that theme SHALL apply, `auto` SHALL be stored, and live system
  following SHALL resume without another control or contextual surface
- **AND** no request, query revision, share value, route change, or loading state SHALL be produced

#### Scenario: Another tab changes the theme preference
- **WHEN** a same-browser tab stores valid `auto|light|dark` or removes the key
- **THEN** the open page SHALL converge to that explicit preference or current
  system-following `auto` state without reload
- **AND** disposal SHALL prevent later media or storage events from changing it

#### Scenario: Production artifact is inspected
- **WHEN** the built artifact and source inventory are checked
- **THEN** they SHALL contain one formal SPA and no prototype entry, fixture
  path, bulk data, second request layer, second state system, or frontend statistic implementation
