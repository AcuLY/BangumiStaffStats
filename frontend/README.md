# Formal frontend

This directory is the clean-room production frontend for Bangumi Staff
Statistics. It starts with one Vue SPA and deliberately contains no business
feature, real API endpoint, fixture, prototype boot path, or frontend-owned
statistics.

## Local commands

Run commands from this directory with Node `24.18.0` and npm `11.16.0`.

- `npm run generate:query-wire` regenerates the committed TypeScript wire types.
- `npm run check:query-wire` regenerates below `.tmp/` and checks byte drift.
- `npm run check:architecture` enforces ownership and dependency boundaries.
- `npm run test` runs mount, transport, and shared-contract tests.
- `npm run build` runs Vue TypeScript project checks and the production build.
- `npm run check:artifact` checks the built artifact and gzip budget.
- `npm run cleanup` removes only the declared disposable frontend roots.

The Vite fallback intentionally serves the same neutral foundation at `/`,
`/ranking`, and `/co-star`. Route behavior belongs to a later approved change.
