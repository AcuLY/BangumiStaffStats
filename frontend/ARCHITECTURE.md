# Frontend architecture

The production frontend is one SPA with one bootstrap, request client, provider
chain, and application composition root:

```text
index.html
  -> src/app/main.ts (one Vue mount and one Pinia root)
     -> src/app/App.vue (service composition only)
        -> src/app/AppProviders.vue (one Naive UI provider chain)
        -> features/query Query Workspace

App.vue
  -> api/client.ts (the only fetch owner)
     -> api/catalog.ts
        -> api/adapters/catalog.ts (strict catalog boundary)
     -> api/rankings.ts
        -> api/adapters/rankings.ts (strict success/error boundary)
     -> api/candidates.ts
        -> api/adapters/candidates.ts
     -> api/personDetail.ts
        -> api/adapters/personDetail.ts
     -> api/partners.ts
        -> api/adapters/partners.ts
     -> api/coStar.ts
        -> api/adapters/coStar.ts
  -> features/catalog/store.ts (catalog lifecycle)
  -> features/query/store.ts (Draft / Applied / revision)
  -> features/query/coordinator.ts (operation transactions)
  -> features/query/session.ts (validated same-tab recovery intent)
  -> features/ranking (view state and result presentation)
  -> features/person-detail (one coordinated adaptive inspector)
  -> features/co-star (candidate, partner, pair, and group analysis)
  -> app/routes.ts + app/theme.ts (History and theme owners)
```

`src/shared` cannot depend on `app`, `api`, or features. API code cannot depend
on app or features. Components do not call `fetch`, consume generated wire
types, or instantiate stores. Store instances are created by the composition
root and passed down; leaf components may use type-only store contracts.
Pinia and Naive UI remain the only application state and component systems.

The runtime, catalog, and query stores have separate ownership. The query
coordinator owns cancellation, latest-response admission, stable rollback, and
the atomic Applied/revision commit. Ranking view requests reuse that transaction
sequence without committing Applied Query or advancing revision. Production
injects no result fixture: unavailable result capabilities fail closed.
The query session owner stores frontend-owned validated recovery intent in a
version 2 JSON envelope under `bgmss-query-session-v2` in tab-scoped storage.
`features/query/recovery.ts` owns its types and validation, composed from existing
query and operation decoders; this is not a public URL or backend contract.
The old v1 envelope is discarded without decoding. Recovery runs through the
coordinator and never stores a response or becomes another Applied Query or
result authority. Failed-chunk retry saves this same intent before reloading
and does not reload if storage cannot preserve it.

Routes clear initial URL fragments without interpreting or replaying them.
The ordinary `?user=` UID prefill remains. The Header includes an always
available same-tab link to `https://search.bgmss.fun/old/`, immediately left of
theme; it neither derives from the SPA deployment base nor carries query state.

The shared OpenAPI and JSON Schemas under `../contracts` are read-only
authorities. Generated catalog values cross `api/adapters/catalog.ts`; generated
query values are confined to the query adapter/model/coordinator/recovery boundary.
Generated operation values cross only their matching adapter and never enter a
component. Rankings, candidates, person detail, partners, and co-star ports
separate the local transaction ID used for latest-response admission from the
server request ID stored for result/error correlation. The person-detail
feature owns the coordinated ranking detail resource and a transient co-star
preview in `features/person-detail/workspaceLinks.ts`, which reuses typed API
drivers with revision, snapshot and latest-response admission. Preview evidence
has explicit identity scope and never replaces ranking selection or persists
response bodies. The co-star feature owns one identity-selection state and consumes
server-authoritative candidate, partner, pair, and group projections.
PositionKey is opaque application data: the frontend validates references and
capabilities but never derives meaning from its string prefix.

Co-star operations carry an optional positionScope separate from Shared Query.
The coordinator and preview owner validate all-scope identities against the
current catalog; default source selection first consumes query-scope candidates,
then the same candidate resource browses all positions. Operation scope travels
with accepted inputs through replay and caching; ranking Query remains unchanged.
The query store owns draft and accepted co-star position scope for the explicit
All selector, including scope-only dirty/undo/apply behavior. All is not a
PositionKey. Operation-aware decoders admit empty concrete positions only for
all-scope operations; ordinary shared-query/ranking decoders remain strict.
Detail handoff selects All and the existing target identities without changing
other Query/Draft fields. All-only queries entering ranking require concrete
positions before any ranking request; no placeholder position is generated.

`features/ranking` renders backend rank, complete summary, metric scale, and
pagination without recomputation. `shared/components/SafeImage.vue` accepts only
derived same-origin proxy candidates, retains a stable 3:4 box, advances
bounded per-source failures/timeouts, and distinguishes loading, loaded,
missing, and error states.

`shared/components/SearchSortToolbar.vue` owns the repeated search, sort, and
direction controls across ranking, candidates, partners, person works, common
works, and their disabled loading states. It uses the shared `useCompactLayout`
breakpoint to pass one size to the input, select, menu, direction button, and
optional filter slot: `medium` from 780px, `small` below it. Callers own query
values, labels, debounce, submission, and focus restoration; they do not override
the toolbar size. The exposed `inputElRef` supports existing result-reveal focus
restoration without moving request logic into the shared presentation component.

The Header is the only owner of the approved 64×64 RGBA brand mark at
`src/assets/brand/bgmss.png` (SHA-256
`d3d1ca5d14d560f3415dfbcc84b58ece72741a51cf860362d09284ed21aa394a`).
The theme owner persists only `bgmss-theme-v1`; History writes are same-origin
relative paths and successful personal/global queries are the only source of
the `?user=` projection.

Business icons use the exact `@vicons/ionicons5` outline package recommended
by Naive UI (xicons), rendered directly with the library Vue SVG components. AppIcon owns semantic mappings and
InfoIcon owns the shared information glyph; QueryIcon and CoStarIcon delegate
to that shared layer. Explicit static imports permit unused-icon elimination.
BGMSS brand assets, chart SVGs and Naive UI internal glyphs are separate owners.
