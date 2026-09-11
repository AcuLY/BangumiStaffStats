## Context
Header is visually outside the drawer but app-root inert/aria-hidden blocks it. App already closes drawer on leaving rankings. User explicitly requests this navigation and uniform 18px section headings.
## Goals / Non-Goals
Enable Header pointer/keyboard navigation, preserve background isolation and scroll locking, close on mode switch, retain accepted person state. No query/data/routing contract changes or backend work.
## Decisions
Isolate `.app-page-scroll` rather than `#app`/`.app-shell`. Use a named non-modal dialog because Header stays operable; loop keyboard focus through Header and drawer while page content is inert. Enter initially at drawer; close/Escape restores opener except Header navigation retains Header focus. Existing mode watcher closes drawer. Synchronize changed accessibility requirement before apply.
Section h2/h3 in person detail use 18px like co-star section h2. Tag-name columns use max-content with existing 8px gap; tag values wrap in minmax(0,1fr). Preserve metadata/name typography and skeleton ownership.
## Ownership / boundaries
Writable: frontend/src/app/App.vue; frontend/src/features/person-detail/components/PersonDetailSurface.vue; frontend/src/features/person-detail/person-detail.css; frontend/src/features/co-star/co-star-oracle.css; frontend/tests/features/person-detail/components.test.ts; frontend/tests/app/rankings.integration.test.ts; DESIGN.md; this change and named root specs. Read-only: PRODUCT.md, oracle, other pending changes, backend/contracts/operations. No refs or external writes. Delete only superseded full-app isolation and obsolete modal claims.
## Risks / validation
Avoid focus restoration stealing navigation focus; repeated open/close and breakpoint changes must restore prior background attributes and scroll. Primary planning review: scopes and user intent agree, no outstanding P0/P1. Strict change validation, focused component/integration tests, build, actual 390/715/1200 viewport title/tag measurements and Header switching, diff check. Full frontend gate attempted; record baseline blockers separately. Do not archive with incomplete acceptance.
