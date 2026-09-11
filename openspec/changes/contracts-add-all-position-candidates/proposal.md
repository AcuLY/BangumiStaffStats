> Supersession (2026-09-08): `contracts-remove-query-sharing` retires the query-sharing feature and overrides the sharing-specific requirements, preservation clauses, and acceptance assumptions below. URL fragments are cleared without parsing or replay. Header now has an always available same-tab “回到旧版” link to `https://search.bgmss.fun/old/` immediately left of theme. Exact accepted workspace recovery remains frontend-local through validated v2 JSON session storage; v1 fragment-based storage is discarded. Completed evidence below remains historical, and unrelated requirements are unchanged.

## Why

The candidate picker can browse only one applied position at a time, forcing
users to choose a position before seeing people even though the query already
contains an ordered position set. The requested default is one authoritative
mixed view across all applied positions, which requires a contract and Backend
ranking mode rather than client-side aggregation.

## What Changes

- Extend Candidates input so `positionKey: null` means all applied query
  positions; a canonical string continues to mean one position.
- Extend candidate items with ordered `positionKeys` describing the person's
  actual matching identities. In all-position mode each person appears once,
  their participating works/series are unioned across those positions, and the
  Backend ranks/searches/paginates the resulting person set.
- Keep ordered per-position counts unchanged and return `positionKey: null` for
  the mixed view. Contract goldens and generated Go/TypeScript consumers move
  together.
- Make “全部职位” the first/default candidate selector option, remove the
  redundant “浏览职位” label, and toggle all returned identities when a mixed
  row is activated.
- Preserve single-position semantics, query order, selection limits, exact
  share replay, latest-only view state, and Backend statistical authority.

This is a user-authorized `INTENTIONAL_DELTA` from oracle
`644b7748674e553f863d0ffd61d029f86fdc0717`. Existing single-position results,
wire strictness, and selection/analysis behavior remain `PRESERVE_ORACLE`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contracts-candidates-api`: add the nullable all-position input/result mode
  and per-item ordered contributing position keys.
- `backend-candidates-api`: compute and cache one server-ranked person union
  across all applied positions while preserving independent position counts.
- `frontend-co-star-vertical`: default to “全部职位”, render the mixed server
  page, and toggle each row's authoritative identity set.

## Impact

- **Status:** local specification, implementation, and focused verification;
  not committed, pushed, merged, released, or deployed.
- **Owner:** Contracts owns wire shape/generation; Backend owns aggregation and
  ranking; Frontend consumes the accepted page. Primary agent reviews all
  boundaries and acceptance.
- **Writable paths:** this change; `PRODUCT.md`, `DESIGN.md`,
  `.impeccable/design.json`; `contracts/schemas/query/operation-components-v1.schema.json`,
  `contracts/schemas/candidates/{request-v1,success-envelope-v1}.schema.json`,
  `contracts/openapi/openapi.yaml`, `contracts/goldens/api/candidates/**`;
  generated `backend/internal/httpapi/wire/{query_wire,candidates}.gen.go` and
  `frontend/src/api/generated/{query-wire,candidates}/**`; exact generator/check
  inventories required by those outputs; `backend/internal/candidates/{request,operation,types,build,view,cache,service,projection}.go`
  and focused tests; `frontend/src/api/{candidates,adapters/candidates}.ts`,
  `frontend/src/features/query/{coordinator,share}.ts`,
  `frontend/src/features/co-star/{model,selection}.ts`,
  `frontend/src/features/co-star/components/CandidatePicker.vue`,
  `frontend/src/app/App.vue`, `frontend/src/features/co-star/co-star.css`, and
  focused API/query/co-star/App tests; three root specs only during deferred
  sync/archive.
- **Read-only protected inputs:** Rankings/partners/co-star/person-detail wire
  graphs, catalog/query membership authority, unrelated Backend services,
  updater/Archive contents, original worktree, remotes, hosts, and production.
- **Deletion complement:** remove no position counts, candidates, single-
  position mode, selection action, share state, error/pending state, or test;
  remove only the redundant visible label in the picker.
- **Mutable refs:** current local worktree and later the existing loopback
  Backend process only after focused Backend acceptance.
- **Consumes:** ordered effective query positions, independent PositionResults,
  existing statistics evaluation/sort, canonical catalog labels, and one
  frontend selection owner.
- **Produces:** strict nullable all-position wire, server-authoritative mixed
  candidate pages, generated consumers, and default “全部职位” picker state.
- **Dependencies:** existing standard library, JSON Schema/OpenAPI generators,
  candidate runtime cache/statistics, Vue/Naive UI; no new package.
- **Deliverables:** coherent contracts/goldens/generated bytes, Backend core/
  cache/projection, strict frontend decoding/state/UI, focused Go/Node/Vitest/
  build/browser evidence.
- **Acceptance:** all mode yields one person row with ordered matching
  identities and unioned works, stable backend rank/search/page; single mode is
  unchanged; first load defaults all; selecting a row adds only its returned
  identities; desktop/compact selector remains readable and overflow-free.
- **Non-goals:** changing query membership, ranking AND semantics, analysis
  formulas, position counts, API route, dependencies, other operation wires,
  broad UI redesign, deployment, or production mutation.
- **Operations deferred:** complete accumulated gates, root-spec sync/archive,
  commit/push/PR/release/deploy, and production mutation.
- **Stop/rollback conditions:** stop on active ownership conflict, generated
  graph drift outside Candidates, client-derived ranking, incorrect union or
  identity order, selection-limit bypass, single-mode drift, focused failure,
  or need to mutate undeclared external state.

Apply is blocked until proposal, design, three delta specs, and tasks are
complete, strict-valid, reconciled with controlling PRODUCT/DESIGN and active
changes, and reviewed by the primary agent with zero unresolved P0/P1.

Within the broad paths above, this change owns only nullable Candidates wire,
mixed identity decoding/mapping, “全部职位” selector label removal/row position
copy, and their tests. It explicitly excludes polish mode-loader/no-op/default-
selection policy, toolbar/row-border/rail-focus slices and the later hardening
change's pagination/topology/removal/locator reveal/focus slices.

`frontend-close-session-ui-residuals` receives the next write only for
CandidatePicker’s null-versus-undefined pending projection and QueryEditor’s
truthful all-position help copy. This change retains all nullable wire/schema,
Backend mixed-candidate authority, decoding, row identities, default selection,
and accepted all-position semantics.
