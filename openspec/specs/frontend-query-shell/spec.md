# frontend-query-shell Specification

## Purpose
Define the production SPA shell that owns ranking/co-star routes, catalog-backed
query editing, immutable applied-query state, operation coordination, local recovery,
theme behavior, and the responsive accessible Query Workspace.

## Requirements
### Requirement: One query shell SHALL own routes and shared query state

The formal SPA SHALL expose logical `/ranking` and `/co-star` shell modes at
the configured production base, currently public `/v2/ranking` and
`/v2/co-star`, with one `QueryDraft`, one immutable last-successful
`AppliedQuery`, one ordered `positionKeys` array, and one monotonic
`queryRevision`. Operation/logical-path/deployment-base SHALL not enter the
shared query signature. Editing Draft or switching modes SHALL not apply,
reset, or fork shared state; only a successful semantically new application
SHALL advance revision.

Rankings and candidates SHALL retain separate normalized view and resource
slots tagged with their revision. A slot for the current revision MAY be
restored on mode return; an absent slot MAY be loaded through the registered
operation port without resubmitting Draft.

The configured base root and its `index.html` SHALL replace to the public
ranking path while preserving safe query parameters; root-domain paths outside
the configured base SHALL not be claimed by this shell. `?user=` SHALL prefill
only personal Draft. URL fragments SHALL NOT restore query state or trigger a business request; an initial fragment SHALL be cleared without decoding.

Successful personal application SHALL replace `?user=` with the effective
trimmed UID; successful global application SHALL remove `?user=`. These URL
updates SHALL remain inside the configured base and SHALL not start another
request. The Header SHALL contain an always available same-tab link labeled “回到旧版” immediately left of the theme button, with fixed href `https://search.bgmss.fun/old/`. No sharing or clipboard action SHALL remain. The legacy link and theme button SHALL share one right-aligned Header action container. The link SHALL include a jump icon and show “旧版” below 780px, while retaining “回到旧版” as its accessible name.

#### Scenario: Draft changes and mode changes

- **WHEN** the user edits Draft and switches between ranking and co-star below `/v2/`
- **THEN** the browser path SHALL switch only between `/v2/ranking` and `/v2/co-star`
- **AND** Applied Query, queryRevision, ordered PositionKeys, current-revision resources, and edited Draft SHALL remain unchanged

#### Scenario: A new query succeeds
- **WHEN** final validation passes and the active operation returns the latest successful response for a semantically new Draft
- **THEN** the operation resource, Applied Query, and next queryRevision SHALL commit atomically
- **AND** no later feature may create a second Applied Query owner

#### Scenario: An old query fragment is present
- **WHEN** a document opens with an old query fragment and no valid tab session
- **THEN** no query SHALL be decoded or automatically executed from that fragment
- **AND** the fragment SHALL be cleared and the editable form SHALL remain available

#### Scenario: Return to the old application
- **WHEN** the Header is rendered in either mode, theme or viewport
- **THEN** the legacy anchor (回到旧版 on desktop, 旧版 on mobile) SHALL precede the theme button and point exactly to https://search.bgmss.fun/old/
- **AND** it SHALL remain keyboard accessible and available before any query succeeds

#### Scenario: A path outside the deployment base is loaded

- **WHEN** the legacy root or another path outside `/v2/**` is requested
- **THEN** the new query shell SHALL not claim, redirect, or rewrite that path

### Requirement: Query input SHALL use the shared wire and dynamic catalog

The query model SHALL own defaults, summary text, normalization, dirty/no-op
comparison, and structured field errors while reusing the accepted
`SharedQueryV1` and operation view components. It SHALL model personal/global
as a closed union, construct global submissions without personal fields,
reject a global wire value that carries any personal field, and SHALL never
infer fields by parsing display messages.

The catalog store SHALL load only `GET /api/v1/catalog` through the accepted
client/strict adapter. The selector SHALL treat PositionKey as opaque, use
catalog groups, labels, order, selectability, exclusivity, and capabilities,
and preserve first-occurrence order. It SHALL not restore a static position
enum or infer behavior from a key prefix or label.

#### Scenario: Structured validation fails
- **WHEN** Draft violates scope, UID, status, subject-type, position,
  exclusivity, range, or capability rules
- **THEN** no operation request SHALL start, field errors SHALL target the
  corresponding controls, and Draft plus the previous Applied Query/result
  SHALL remain intact

#### Scenario: Catalog is pending or fails
- **WHEN** catalog loading is pending or returns a retryable error
- **THEN** only the position selector SHALL retain its recognizable control with a loading indicator, or show its local error/retry state, while the rest of the editor remains usable
- **AND** failure SHALL not be represented as an empty catalog

### Requirement: Query application SHALL be cancelable and latest-only

One application service SHALL snapshot Draft, perform final
operation-specific validation, and call a typed rankings or candidates port.
It SHALL own a per-operation AbortController and sequence, and SHALL accept a
response only when operation, sequence, and request identity still match.
QueryStore SHALL own neither network calls nor feature resources.

Validation failure, normalized no-op, request failure, or cancellation SHALL
not advance revision or replace Applied Query/current usable data. A newer
request SHALL make every older completion stale even if the older transport
ignores abort. Ready with zero items SHALL remain `ready`, not a special empty
request state.

Dev/test MAY inject deterministic operation ports. The production entry and
artifact SHALL contain no fixture, fixture path, bulk snapshot, fabricated
success, or statistical calculation; until a later vertical installs a real
operation adapter, the port SHALL fail closed as unavailable.

#### Scenario: A slow response completes last
- **WHEN** request A is superseded by request B and A resolves after B
- **THEN** only B MAY update its resource, Applied Query, feedback, and revision
- **AND** A SHALL have no visible or stored effect

#### Scenario: The current request fails or is canceled
- **WHEN** the latest operation rejects or is canceled
- **THEN** the previous Applied Query and usable resource SHALL be restored or
  retained with separate current-request feedback
- **AND** the editor SHALL remain expanded with its Draft

### Requirement: Personal queries SHALL surface collection freshness

An ordinary personal operation that succeeds with stale collection metadata
and `COLLECTION_STALE` SHALL commit the usable result and announce the stable
warning without parsing server text or starting an automatic retry.

#### Scenario: Ordinary personal query returns stale data
- **WHEN** a personal operation succeeds with stale collection metadata and `COLLECTION_STALE`
- **THEN** the usable result SHALL commit and the stable stale warning SHALL be announced
- **AND** no background or automatic retry SHALL start

### Requirement: Query Workspace SHALL preserve the approved outward behavior

The production components SHALL preserve the final oracle/DESIGN Header and
Query Workspace, not their component or store structure. With no Applied Query the
editor SHALL start expanded. Success SHALL collapse to the applied summary;
validation failure, request failure, and cancellation SHALL keep it expanded
with Draft. On desktop the expanded editor SHALL overlay below the fixed
header without pushing content; below 780px it SHALL participate in document
flow. Controls SHALL meet DESIGN focus, keyboard, target-size, contrast,
status-announcement, and reduced-motion requirements.

The Header SHALL contain brand, the two-mode control, the fixed same-tab
“回到旧版” link to `https://search.bgmss.fun/old/` immediately left of one
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
state, URL parameters, local query-recovery state, resource state, or Skeleton behavior;
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
- **AND** no request, query revision, recovery-state mutation, route change, or loading state SHALL be produced

#### Scenario: Another tab changes the theme preference
- **WHEN** a same-browser tab stores valid `auto|light|dark` or removes the key
- **THEN** the open page SHALL converge to that explicit preference or current
  system-following `auto` state without reload
- **AND** disposal SHALL prevent later media or storage events from changing it

#### Scenario: Production artifact is inspected
- **WHEN** the built artifact and source inventory are checked
- **THEN** they SHALL contain one formal SPA and no prototype entry, fixture
  path, bulk data, second request layer, second state system, or frontend statistic implementation

### Requirement: Query recovery SHALL remain local to the current tab
The frontend SHALL persist only validated successful query and accepted operation intent as versioned JSON in sessionStorage. It SHALL use frontend-owned recovery state composed from existing query and operation contracts, not a public sharing schema or URL codec. Normal refresh and failed-chunk retry SHALL replay ordinary operations and retain latest-only acceptance. Old fragment-based session entries SHALL be discarded; unavailable or invalid storage SHALL leave queries usable. Failed-chunk retry SHALL reload only after recovery intent is successfully stored. A failed replay SHALL retain editable intent and SHALL not overwrite the last complete saved state with a degraded workspace.

#### Scenario: Refresh restores accepted analysis
- **WHEN** a valid current-version session contains ranking detail, partners or co-star analysis
- **THEN** refresh SHALL replay the exact accepted intent once and load current results using ordinary query operations
- **AND** dirty Draft, responses, theme and transient state SHALL not be persisted

#### Scenario: Storage cannot support reload recovery
- **WHEN** session storage rejects writing the intended workspace
- **THEN** failed-chunk recovery SHALL report failure without reloading the document

#### Scenario: Old session or corrupt data
- **WHEN** stored data is an old v1 fragment entry or an invalid v2 envelope
- **THEN** it SHALL be discarded without any share decoding or business request
