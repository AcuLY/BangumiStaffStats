## MODIFIED Requirements

### Requirement: Packaging SHALL preserve the accepted frontend behavior

This capability SHALL configure the production artifact for the approved
`/v2/` deployment base and make only the minimum browser-boundary route,
API, and image URL changes needed for that base. It SHALL make no change to
CSS, visual assets, copy, product dependencies, statistical/API semantics, or
application state behavior. Package/Vite and source edits SHALL preserve the
accepted external appearance, interactions, copy, states, and responsive
behavior of oracle
`644b7748674e553f863d0ffd61d029f86fdc0717` plus separately approved
PRODUCT/DESIGN additions. The only intentional product delta is the
user-authorized public path.

The fixed same-tab legacy-navigation link `https://search.bgmss.fun/old/` is
an explicit Header destination outside the SPA base; it SHALL not carry query
state or change deployment routing. Every production-owned static asset, dynamic import, History API destination,
native API request, and same-origin image request SHALL stay below
`/v2/**`. API adapters SHALL retain logical `/api/v1/**` references, and the
browser boundary SHALL map those to `/v2/api/v1/**` without changing request
method, body, query, response, or error behavior. Dev/test with root base SHALL
retain the existing logical paths.

#### Scenario: Frontend packaging candidate is reviewed

- **WHEN** exact-path diff, existing architecture/wire/type/unit/build/artifact gates, accepted oracle/design evidence, and nested-base tests are checked
- **THEN** only the approved path boundary differs and no visual, interaction, state, statistical, or runtime API semantic behavior has changed

#### Scenario: Production artifact is inspected

- **WHEN** the exact production index, assets, deferred imports, route URLs, API calls, and image requests are inspected
- **THEN** all application asset, mode-navigation, API and image URLs SHALL remain below `/v2/**`; only the explicit legacy-navigation link SHALL point to `https://search.bgmss.fun/old/`

#### Scenario: Root-base test environment runs

- **WHEN** unit and integration tests run with the root development base
- **THEN** logical `/ranking`, `/co-star`, and `/api/v1/**` behavior SHALL remain unchanged while focused mapper tests prove the `/v2/` production projection
