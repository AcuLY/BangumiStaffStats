# frontend-query-shell Specification

## Purpose
Define the production SPA shell that owns ranking/co-star routes, catalog-backed
query editing, immutable applied-query state, operation coordination, sharing,
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
only personal Draft. On first document load, the shell SHALL consume at most
one valid v1 share fragment through the same ordinary application service and
then remove the fragment by history replacement. Invalid share SHALL remove
the fragment, show a structured local error, and start no request or automatic
`?user=` fallback.

Successful personal application SHALL replace `?user=` with the effective
trimmed UID; successful global application SHALL remove `?user=`. These URL
updates SHALL remain inside the configured base and SHALL not start another
request. The Header SHALL retain one share action immediately beside the mode
switch at every viewport. It SHALL remain visibly disabled when no Applied
Query exists and otherwise serialize only the current mode's last-successful
Applied Query plus accepted operation input/view into the existing versioned
fragment wire. The generated share URL SHALL use the public base-aware path
while the envelope retains its existing logical route identity. Dirty Draft,
pending attempts, responses, request IDs, revision, dataVersion, digests,
refresh flags, theme, and transient UI state SHALL not enter the link.

The share action SHALL use the Clipboard API when available, temporarily show
the DESIGN check feedback for approximately 1500ms, and announce success
through a polite live region. Clipboard absence or failure SHALL expose the
same generated read-only selectable link in a lightweight adjacent popover;
it SHALL not discard the link or show a success modal.

#### Scenario: Draft changes and mode changes

- **WHEN** the user edits Draft and switches between ranking and co-star below `/v2/`
- **THEN** the browser path SHALL switch only between `/v2/ranking` and `/v2/co-star`
- **AND** Applied Query, queryRevision, ordered PositionKeys, current-revision resources, and edited Draft SHALL remain unchanged

#### Scenario: A new query succeeds
- **WHEN** final validation passes and the active operation returns the latest successful response for a semantically new Draft
- **THEN** the operation resource, Applied Query, and next queryRevision SHALL commit atomically
- **AND** no later feature may create a second Applied Query owner

#### Scenario: A shared query is present on first load

- **WHEN** one valid v1 share and `?user=other` are both present below `/v2/`
- **THEN** the share SHALL be applied at most once through ordinary query application
- **AND** the fragment SHALL be removed, `?user=` SHALL not trigger another request, and history SHALL remain below `/v2/`

#### Scenario: The visible result is shared while Draft is dirty

- **WHEN** an Applied Query exists and the user edits Draft or starts a newer pending attempt
- **THEN** the share action SHALL encode the current visible result's last-successful Applied Query and accepted operation state at the matching `/v2/` public route
- **AND** it SHALL exclude the dirty Draft and pending attempt from the generated link

#### Scenario: Clipboard copying is unavailable

- **WHEN** a valid share link is generated but Clipboard API copying is unavailable or fails
- **THEN** the same `/v2/`-based read-only selectable link SHALL remain available in the adjacent fallback popover
- **AND** the shell SHALL not report a successful copy or lose the generated link

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
- **THEN** only the position selector SHALL show its skeleton or local
  error/retry state while the rest of the editor remains usable
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

### Requirement: Personal collection refresh SHALL have explicit recovery states

Only an explicit personal rankings/candidates apply-or-refresh action SHALL
set `refreshCollection=true`. Before starting, the coordinator SHALL save the
recoverable Applied Query/resource, move the active personal resource out of
visible `ready` into `pending`, and SHALL not automatically retry.

Fresh success SHALL commit normally. Stale success SHALL commit usable data
and map stable `COLLECTION_STALE` warning metadata to a visible warning without
parsing server text. Hard failure or cancellation SHALL restore the saved
resource and Applied Query plus separate feedback. Global, view-only, detail,
partners, and co-star requests SHALL never carry the flag.

#### Scenario: Explicit refresh returns stale data
- **WHEN** a personal main operation succeeds with stale collection metadata
  and `COLLECTION_STALE`
- **THEN** the usable result SHALL commit and the stable stale warning SHALL be announced
- **AND** no background or automatic refresh retry SHALL start

#### Scenario: Explicit refresh fails
- **WHEN** a personal refresh hard-fails or is canceled
- **THEN** the prior usable Applied Query/resource SHALL be restored and the
  failed attempt SHALL remain visible as feedback
- **AND** stale prior data SHALL not be presented as a successful refresh

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
theme action in the DESIGN order. One app-level owner SHALL expose only
`light|dark`, persist only versioned localStorage key `bgmss-theme-v1`, and
drive the Naive provider and semantic CSS tokens through public APIs. Invalid
or unavailable storage SHALL fall back to Light without failure. Theme SHALL
not enter query Draft/Applied state, URL parameters, share payload, resource
state, or Skeleton behavior; the prototype `bgmss-workbench-theme` key SHALL
not be read or written.

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

#### Scenario: Theme is toggled and restored
- **WHEN** the user toggles the Header theme action and reloads the document
- **THEN** the same Light or Dark theme SHALL be restored from `bgmss-theme-v1` and applied through the provider plus semantic document marker
- **AND** no request, query revision, share value, route change, or loading state SHALL be produced

#### Scenario: Production artifact is inspected
- **WHEN** the built artifact and source inventory are checked
- **THEN** they SHALL contain one formal SPA and no prototype entry, fixture
  path, bulk data, second request layer, second state system, or frontend statistic implementation
