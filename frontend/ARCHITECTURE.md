# Frontend architecture

The formal frontend has one entry and one owner for each foundational concern:

```text
index.html
  -> src/app/main.ts (one Vue mount and one Pinia root)
     -> App.vue
        -> AppProviders.vue (one Naive UI provider chain)

future app/features
  -> operation mappers
     -> src/api/client.ts (the only request owner)
     -> src/api/adapters/queryWire.ts (the only generated-wire importer)
        -> src/api/generated/query-wire/types.gen.ts
```

`src/shared` cannot depend on `app`, `api`, or future features. API code cannot
depend on app or features. Components do not call fetch or consume generated
wire types. Leaf components do not import stores. Pinia and Naive UI are the
only application state and component systems.

The runtime store represents only bootstrap readiness or failure. Query draft,
applied query, catalog, result, route, selection, statistics, and theme state
are outside this foundation.

The shared OpenAPI and JSON Schemas under `../contracts` are read-only
authorities. Generated types are dependencies, not an application model.
Unknown transport values must cross the strict query-wire adapter before use.
