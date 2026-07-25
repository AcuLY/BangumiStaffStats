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
  -> features/catalog/store.ts (catalog lifecycle)
  -> features/query/store.ts (Draft / Applied / revision)
  -> features/query/coordinator.ts (operation transactions)
  -> app/routes.ts + app/theme.ts (History/share and theme owners)
```

`src/shared` cannot depend on `app`, `api`, or features. API code cannot depend
on app or features. Components do not call `fetch`, consume generated wire
types, or instantiate stores. Store instances are created by the composition
root and passed down; leaf components may use type-only store contracts.
Pinia and Naive UI remain the only application state and component systems.

The runtime, catalog, and query stores have separate ownership. The query
coordinator owns cancellation, latest-response admission, stable rollback, and
the atomic Applied/revision commit. Production injects no result fixture: until
a result driver is registered, result execution fails closed.

The shared OpenAPI and JSON Schemas under `../contracts` are read-only
authorities. Generated catalog values cross `api/adapters/catalog.ts`; generated
query values are confined to the query adapter/model/coordinator/share boundary.
PositionKey is opaque application data: the frontend validates references and
capabilities but never derives meaning from its string prefix.

The Header is the only owner of the approved 64×64 RGBA brand mark at
`src/assets/brand/bgmss.png` (SHA-256
`d3d1ca5d14d560f3415dfbcc84b58ece72741a51cf860362d09284ed21aa394a`).
The theme owner persists only `bgmss-theme-v1`; History writes are same-origin
relative paths and successful personal/global queries are the only source of
the `?user=` projection.
