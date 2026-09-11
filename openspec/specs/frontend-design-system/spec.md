# frontend-design-system Specification

## Purpose
Define the evidence-bounded frontend design-system acceptance boundary that preserves the approved oracle except for higher-authority deltas, retains SafeImage and semantic-token primitives, validates the built production artifact, and regenerates the Impeccable sidecar only for the accepted implementation.
## Requirements
### Requirement: Oracle-compatible final presentation

The frontend SHALL preserve the visual, copy, interaction, state, and
responsive behavior of oracle commit
`644b7748674e553f863d0ffd61d029f86fdc0717`. It SHALL retain only deltas already
required by higher-authority `PRODUCT.md`, `DESIGN.md`, or accepted
capabilities and SHALL NOT introduce reviewer-preference redesign.

#### Scenario: Existing surface matches the oracle

- **WHEN** the same mode, theme, viewport, state, and deterministic data are rendered from the production bundle and oracle
- **THEN** geometry, hierarchy, content, state, and interaction match except for an explicitly cited accepted delta

#### Scenario: Difference has no governing requirement

- **WHEN** a reviewer observes a difference that is neither an oracle match nor an already-approved intentional delta
- **THEN** the difference is treated as a defect or the work stops for specification amendment, and it is not accepted as polish

### Requirement: Evidence-bounded design-system repair

The implementation SHALL change source only for a reproducible acceptance
failure, SHALL add focused regression coverage for each repair, and SHALL use
public component APIs, semantic markup/classes, and documented tokens rather
than private component-library DOM or internals.

#### Scenario: Candidate already passes

- **WHEN** an inspected surface passes its oracle, design, and accessibility gates
- **THEN** the owner makes no source change to that surface

#### Scenario: Defect is reproduced

- **WHEN** a fidelity or design-system defect is reproduced in the production preview
- **THEN** the smallest owned layer and a focused regression are changed and the affected plus full gates are rerun

### Requirement: SafeImage and shared primitives remain complete

The final frontend SHALL preserve the shared primitive contracts in
`DESIGN.md`, including SafeImage loading, loaded, missing, and error states,
stable 3:4 media geometry, semantic design tokens, visible focus, and
oracle-compatible responsive presentation.

#### Scenario: Image transitions through every state

- **WHEN** an approved image is loading, loads, is absent, or fails
- **THEN** SafeImage preserves its 3:4 slot, exposes the correct non-broken state, and never requests a direct arbitrary or `api.bgm.tv` URL

#### Scenario: Shared control is restyled

- **WHEN** a corrective style is needed for a shared control
- **THEN** it uses project-owned semantic tokens or public component APIs and preserves the oracle-visible geometry and states

### Requirement: Production artifact is the acceptance target

The frontend SHALL pass the pinned Node/npm fresh-install workflow, full
`npm run check`, and browser QA against the built `frontend/dist`. The artifact
SHALL keep one SPA HTML entry, only approved assets, no source maps, forbidden
fixture/prototype/test content, frontend statistical formulas, direct Bangumi
API upstream, or undeclared request/state layer, and SHALL keep initial
JavaScript gzip below the existing 350 KiB ceiling.

#### Scenario: Clean candidate is built

- **WHEN** dependencies are freshly installed with the pinned toolchain and `npm run check` runs
- **THEN** type, architecture, wire drift, unit, build, artifact, and size gates all pass without changing package manifests or the lockfile

#### Scenario: Production-only defect exists

- **WHEN** the development server passes but the built artifact or production preview violates a gate
- **THEN** the candidate remains unaccepted until the production failure is fixed and regressed

### Requirement: Impeccable sidecar describes the accepted implementation

Only this change SHALL regenerate `.impeccable/design.json`, and only after
both frontend verticals are archived and all code, bundle, and browser gates
pass. The root `DESIGN.md` SHALL remain unchanged and authoritative.

#### Scenario: Sidecar is regenerated

- **WHEN** the final candidate has passed all pre-sidecar gates
- **THEN** the sidecar is valid schema version 2 extension metadata derived from current `DESIGN.md` and the final implementation, with required narrative copied verbatim and 5–10 representative self-contained public-token `ds-` snippets

#### Scenario: Sidecar validation runs

- **WHEN** the regenerated JSON is parsed and checked through Impeccable context and live-panel validation
- **THEN** it has no duplicate keys, stale prototype terminology, primitive-token authority duplication, schema/render failure, or unexpected write outside the exact sidecar

#### Scenario: Earlier gate fails

- **WHEN** a dependency, code, bundle, browser, or review gate is not complete
- **THEN** `.impeccable/design.json` is not regenerated and its preimage remains intact

### Requirement: Business icons SHALL use the recommended xicons family
All application-owned non-brand icons SHALL render from the pinned @vicons/ionicons5 outline components as vendor Vue SVG components. AppIcon SHALL map semantic names; InfoIcon SHALL provide the same InformationCircleOutline glyph across application/query/co-star wrappers. No hand-drawn business-icon paths, icon fonts, CDN assets or additional icon family SHALL remain. This intentionally supersedes the original exact inline information glyph while preserving the shared help trigger behavior.

BGMSS brand images/favicon and data visualization SVGs SHALL remain unchanged. Naive UI's internal controls SHALL retain their supported built-in icons. Caller sizing, currentColor, title/help behavior, keyboard focus ownership, sorting rotations and hit targets SHALL remain intact. Decorative glyphs SHALL be aria-hidden and non-focusable.

#### Scenario: Business glyphs across features
- **WHEN** Header, query controls, ranking/pagination, detail or co-star surfaces render icons
- **THEN** all application-owned glyphs SHALL use the same library family with their original meaning and requested size
- **AND** sorting direction SHALL retain a straight arrow shaft and existing rotation

#### Scenario: Brand and chart exceptions
- **WHEN** the migration is applied
- **THEN** BGMSS brand image/favicon and rating chart SVG code SHALL be unchanged

#### Scenario: Keyboard and compact controls
- **WHEN** the user traverses compact help or Header controls by keyboard in either theme
- **THEN** the icon SHALL not introduce another focus stop and the host SHALL retain its name, behavior and hit target
