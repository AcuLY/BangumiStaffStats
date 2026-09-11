## Why

The user requested complete removal of query sharing and a Header link back to
the old application at `https://search.bgmss.fun/old/`. Sharing currently also
underpins tab refresh and failed-chunk reload recovery; those useful recovery
behaviors must remain without a public URL protocol.

## What Changes

- **BREAKING / INTENTIONAL_DELTA:** remove share URL creation, decoding, replay,
  copy controls, share schema/components/goldens and all generated consumers.
- Keep query/session recovery local to `sessionStorage` with frontend-owned
  validated recovery state; retire the old fragment-based session envelope.
- Add an always available, same-tab “回到旧版” link immediately left of theme.
- Preserve normal query APIs, statistics, mode navigation, theme behavior and
  incumbent layout outside this explicit delta (oracle
  `644b7748674e553f863d0ffd61d029f86fdc0717`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contracts-query-wire`: retire the share-only public contract and consumers.
- `frontend-query-shell`: replace sharing with legacy navigation; retain local recovery.
- `frontend-co-star-vertical`: retire share replay requirements.
- `backend-runtime-foundation`: update the remaining 14-component query generator inventory.
- `frontend-foundation`: update the query generator inventory and non-share adapter cases.
- `frontend-build-artifact`: remove share URL requirements and declare the explicit legacy-link exception.
- `frontend-accessibility`: replace sharing with legacy navigation in the existing browser state matrix.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Apply blocked until all planning artifacts pass strict validation and primary review. User authorized the change and preservation of existing dirty edits. |
| Owner | Primary owns frontend, authorities, specs and final acceptance; delegated contracts/backend owner owns contract removal and generated consumers. |
| Writable paths | Frontend: `frontend/src/app/{App.vue,routes.ts}`, `frontend/src/api/adapters/queryWire.ts`, `frontend/src/features/query/{share.ts,session.ts,recovery.ts}`, `frontend/src/features/query/components/{AppHeader.vue,QueryIcon.vue}`, `frontend/src/shared/styles/base.css`, directly affected `frontend/tests/{api,app,features/query,shared}/**`, `frontend/scripts/{check-architecture.mjs,generate-query-wire.mjs,check-query-wire-generated.mjs}`, generated query-wire consumers. Contracts/backend: `contracts/schemas/query/share-payload-v1.schema.json`, share entries in `contracts/openapi/openapi.yaml`, `contracts/goldens/query/{cases,manifest.json,verify.mjs}`, directly dependent golden verifiers/manifests, `backend/scripts/{prepare-query-wire.mjs,generate-query-wire.sh}`, `backend/internal/httpapi/wire/query_wire.gen.go` and directly affected wire/query tests. Documentation: `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` and relevant surface brief, `frontend/{ARCHITECTURE,README}.md`, share references in active `tmp-formal-development/*.md`; share requirements/references in active `openspec/specs/**` and active changes (only reconciliation notes/references); this change and its archive destination. Disposable generator/validation artifacts in existing ignored `.tmp`, `.cache`, `node_modules`, `dist` roots. |
| Read-only protected inputs | Statistical implementations, Archive/data files, operations configuration, secrets, legacy directories, unrelated dirty edits and historical archives. |
| Deletion complement | Delete only share-only code/schema/fixtures/tests and generated declarations; no broad cleanup or removal of normal SharedQuery types. |
| Mutable refs | Current master working tree only; no commit/ref movement. |
| Consumes | Accepted query and operation contracts, session state, existing Header tokens. |
| Produces | No public sharing protocol; local validated recovery; fixed legacy link; regenerated types and focused regression evidence. |
| Dependencies | Existing Vue/Naive/Ajv and pinned generator toolchains; no new dependency. Contracts change before generated consumers. |
| Deliverables | Coherent implementation, regression tests, active docs/specs and verification evidence. |
| Acceptance | Focused recovery/route/Header/API tests, full frontend check, relevant backend wire tests and backend gate, contract artifact tests, deterministic generation checks, desktop/mobile browser with keyboard and theme, strict OpenSpec and diff hygiene. Report environmental failures honestly. |
| Non-goals | Remove tab recovery, remove shared query APIs, persist results, keep old share compatibility, change statistics or redesign Header. |
| Operations deferred | No host, routing, deployment, push, merge or release. `/old/` hosting and eventual root cutover are separate work. |
| Stop/rollback conditions | Stop for new concurrent overlap or scope expansion; preserve pre-existing changes and revert only owned edits if needed. |

## Contract verification implementation scope

The delegated contracts owner may add `contracts/goldens/query/verify-current.mjs`
and preserve the original verifier and manifest, byte for byte, under this
change's `evidence/historical-query/`. The active verifier retains query
normalization, digest, canonicalization, strict schema/negative, input
immutability, Unicode and generator determinism checks using the existing
pinned dependencies. Historical macOS execution evidence is retired from
active acceptance and is not represented as a new execution.
