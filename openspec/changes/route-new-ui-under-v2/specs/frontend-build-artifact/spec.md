## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Specified; implementation and verification pending. |
| Owner | Main agent, direct sequential implementation. |
| Writable paths | `frontend/vite.config.ts`, `frontend/src/shared/navigation/basePath.ts`, exact API/image mapping hunks in `frontend/src/api/client.ts` and `frontend/src/shared/media/bangumiImage.ts`, exact `/v2/` URL resolution in `frontend/scripts/check-production-artifact.mjs`, nested-base URL resolution only in `frontend/build/smoke.mjs`, its exact tests in `frontend/build/test.mjs`, exact related frontend tests, and their persistent inventory entries in `frontend/scripts/check-architecture.mjs`. |
| Read-only protected inputs | Dependencies/lock, UI/CSS/assets/copy, API schemas/adapters, backend/updater/contracts, artifact integrity mechanics outside required nested-base support. |
| Deletion complement | New utility/test only; existing files are hunk-restored. |
| Mutable refs | This change and branch lifecycle only. |
| Consumes | Vite build, logical `/api/v1/**` references, accepted deterministic artifact workflow. |
| Produces | Static artifact with `/v2/` local assets and browser API/image paths. |
| Dependencies | Accepted frontend product and build artifact capabilities. |
| Deliverables | Production Vite base, URL mapper, focused tests, nested-base artifact smoke compatibility. |
| Acceptance | Green frontend/full Actions; index/assets/deferred chunks and API/image references remain below `/v2/`; deterministic evidence remains valid. |
| Non-goals | Dependency, UI, API contract, backend handler, or artifact identity-policy changes. |
| Operations deferred | Live serving/cutover is owned by operations. |
| Stop/rollback conditions | Stop on nondeterminism, missing/escaping URL, contract/UI drift, or artifact gate regression. |

## MODIFIED Requirements

### Requirement: Packaging SHALL preserve the accepted frontend behavior

This capability SHALL configure the production artifact for the approved
`/v2/` deployment base and make only the minimum browser-boundary route, share,
API, and image URL changes needed for that base. It SHALL make no change to
CSS, visual assets, copy, product dependencies, statistical/API semantics, or
application state behavior. Package/Vite and source edits SHALL preserve the
accepted external appearance, interactions, copy, states, and responsive
behavior of oracle
`644b7748674e553f863d0ffd61d029f86fdc0717` plus separately approved
PRODUCT/DESIGN additions. The only intentional product delta is the
user-authorized public path.

Every production-owned static asset, dynamic import, History API destination,
share URL, native API request, and same-origin image request SHALL stay below
`/v2/**`. API adapters SHALL retain logical `/api/v1/**` references, and the
browser boundary SHALL map those to `/v2/api/v1/**` without changing request
method, body, query, response, or error behavior. Dev/test with root base SHALL
retain the existing logical paths.

#### Scenario: Frontend packaging candidate is reviewed

- **WHEN** exact-path diff, existing architecture/wire/type/unit/build/artifact gates, accepted oracle/design evidence, and nested-base tests are checked
- **THEN** only the approved path boundary differs and no visual, interaction, state, statistical, or runtime API semantic behavior has changed

#### Scenario: Production artifact is inspected

- **WHEN** the exact production index, assets, deferred imports, route/share URLs, API calls, and image requests are inspected
- **THEN** every new-stack browser-owned same-origin URL SHALL remain below `/v2/**` and no request SHALL escape to a legacy root path

#### Scenario: Root-base test environment runs

- **WHEN** unit and integration tests run with the root development base
- **THEN** logical `/ranking`, `/co-star`, and `/api/v1/**` behavior SHALL remain unchanged while focused mapper tests prove the `/v2/` production projection
