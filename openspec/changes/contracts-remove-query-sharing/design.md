## Context
Sharing is fully client-side but publicly modeled in the query contracts and Go/TypeScript generated types. Session refresh and failed dynamic-import reload reuse its fragment codec. The user selected https://search.bgmss.fun/old/ and explicitly allowed preserving and extending dirty files.

## Change boundary
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

## Goals / Non-Goals
Remove the public feature end to end while retaining ordinary query behavior, same-tab recovery and retry. No host routing changes, historical archive rewrite, result snapshots, dependency upgrades or compatibility shim.

## Decisions
- Frontend-owned recovery.ts contains strict recovery types and validation composed from existing query/operation decoders. It has no URL, base64, clipboard or server contract. The session owner stores a version 2 JSON envelope under bgmss-query-session-v2. Old v1 session data is discarded without decoding; this avoids retaining the removed sharing protocol solely for migration.
- App restores only sessionStorage intent. Old URL fragments are inert: they do not prefill or execute a query and are cleared on initial route normalization. The ordinary ?user= prefill remains.
- Failed-chunk retry first saves validated recovery intent to session storage, then reloads the unchanged route. If persistence is unavailable it returns failure without losing intent in a blind reload.
- Header uses an always enabled Naive UI anchor button with a jump icon, fixed absolute href and same-tab navigation. It shares a right-aligned action container with the adjacent theme button, and shows 回到旧版 on desktop or 旧版 below 780px, retaining the full accessible name. Retain a 44px target and existing neutral styling; compress existing layout only as needed on narrow screens.
- Delete the share schema and three public components; regenerate all dependent Go/TS output from the contracts. SharedQueryV1 is an ordinary query contract and stays.
- Historical OpenSpec archives remain evidence; active authorities and active changes are reconciled to retirement. Existing unfinished session-change implementation is preserved and its share-dependent assumptions are superseded.

## Risks / Trade-offs
- Session validation may regress during decoupling: reuse strict operation decoders and existing semantic checks with explicit malformed-storage and exact-state replay tests.
- An old tab loses its v1 recovery state once: it falls back to the editable form, with no compatibility share parser.
- Fixed /old/ may not be hosted yet: implementing the link does not claim or authorize its deployment.
- Historical Mac-only contract acceptance cannot run on Windows: retain its historical provenance and record current portable generation/test evidence separately, never fabricate a pass.

## Migration Plan
Contracts and consumers change together locally. Update product/design authority before runtime edits. Validate, sync specs and archive only after required acceptance. Rollback only owned changes, preserving the initial dirty tree. No commit, push or deployment.

## Open Questions
None. Primary review: scope and design accepted, zero identified P0/P1 planning issues; apply still waits for strict validation.

## Portable query verification boundary

The contracts owner adds `contracts/goldens/query/verify-current.mjs` and a
compatibility entrypoint in `verify.mjs`. Original verifier/manifest bytes are
preserved under `evidence/historical-query/` in this change. Remaining semantic
goldens and deterministic projections are verified with pinned dependencies;
obsolete macOS executable hashes and sandbox invocation records remain
historical evidence only. This does not change runtime query semantics or add
dependencies.
