## Capability Boundary

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

## REMOVED Requirements

### Requirement: Co-star sharing SHALL restore accepted query intent safely
**Reason**: Sharing is removed end to end.
**Migration**: Exact co-star intent recovery remains through frontend-local tab storage as specified by frontend-query-shell; URL fragments do not restore it.
