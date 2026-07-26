# Formal frontend

This directory is the clean-room production frontend for Bangumi Staff
Statistics. One Vue SPA provides the query editor, rankings, person detail,
candidate selection, single-person partner analysis, and multi-person co-star
analysis through strict generated same-origin API contracts. It contains no
runtime fixture, prototype boot path, second request/state layer, or
frontend-owned statistics.

## Local commands

Run commands from this directory with Node `24.18.0` and npm `11.16.0`.

- `npm run generate:query-wire` regenerates the committed TypeScript wire types.
- `npm run check:query-wire` regenerates below `.tmp/` and checks byte drift.
- `npm run check:architecture` enforces ownership and dependency boundaries.
- `npm run test` runs mount, transport, and shared-contract tests.
- `npm run build` runs Vue TypeScript project checks and the production build.
- `npm run check:artifact` checks the built artifact and gzip budget.
- `npm run cleanup` removes only the declared disposable frontend roots.

`/` and `/index.html` canonically replace to `/ranking`; `/ranking` and
`/co-star` are the two production modes of the same SPA. History, share,
theme, Draft/Applied Query, and latest-response behavior each have one owner.
