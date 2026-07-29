# frontend-build-artifact Specification

## Purpose
Define deterministic, content-addressed Frontend static artifacts that preserve accepted product behavior and can be validated and smoked without source.

## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Base artifact and `/v2/` extension investigated, specified, implemented, and verified; deployed source `ae70b2ada2529741bfc8bcfd4a248835bb2f915d` is publicly accepted below `/v2/`. |
| Owner | Frontend owner within the combined Frontend/Contracts apply group. |
| Writable paths | `frontend/build/**`, `frontend/package.json`, `frontend/vite.config.ts`, and only persistent-inventory handling in `frontend/scripts/check-architecture.mjs`; generated output only below ignored `frontend/build/.tmp/**`. |
| Read-only protected inputs | Root authorities/OpenSpec outside this change; oracle `644b7748674e553f863d0ffd61d029f86fdc0717`; `contracts/**`; `frontend/index.html`, `frontend/src/**`, `frontend/public/**`, `frontend/tests/**`, every `frontend/scripts/**` hunk outside the exact inventory amendment, `frontend/ARCHITECTURE.md`, `frontend/README.md`, all tsconfig/OpenAPI config, all Backend/Updater paths, external repositories/state. |
| Deletion complement | None. |
| Mutable refs | None. |
| Consumes | Clean candidate Frontend source/assets, package lock, Node 24.18.0, npm 11.16.0, Vite configuration, accepted OpenAPI, Contracts statement schema, and existing Frontend type/test/build/artifact checks. |
| Produces | Reproducible static tar artifact, checksum inventory, SPDX SBOM, Frontend component statement, and static artifact smoke helpers. |
| Dependencies | Exact direct IDs: `produce-immutable-archive`, `derive-position-catalog-and-cast`, `implement-backend-archive-consumer`, `implement-backend-http-and-observability`, `implement-image-proxy`, `implement-query-result-set`, `implement-statistics-series-sort-evidence`, `expose-dynamic-catalog`, `admit-public-collection-client`, `implement-bounded-query-cache`, `expose-rankings`, `expose-candidates`, `expose-person-detail`, `expose-partners`, `expose-co-star`, `implement-frontend-query-shell`, `implement-frontend-ranking-results`, `implement-frontend-person-inspector`, `implement-frontend-co-star-vertical`, `harden-frontend-design-and-accessibility`; all active changes must also be completed/archived before apply. |
| Deliverables | Deterministic build/checksum/SBOM/statement/reproducibility/static-smoke helpers, local-output ignore rules, only necessary package/Vite build-setting edits, and an exact persistent-inventory update that admits only those tracked build files plus generated `build/.tmp/**`. |
| Acceptance | Existing architecture/wire/type/unit/build/artifact gates and accepted oracle/design evidence; two clean byte-identical builds; offline evidence validation; source-free loopback static smoke; exact paths/residue/diff checks. |
| Non-goals | Any Vue/CSS/asset/index/test/API/route behavior edit, product dependency addition/upgrade, web-server image, hosting/CDN config, registry/release/deploy, or redesign. |
| Operations deferred | Static hosting/reverse proxy/CDN/cache policy, production paths/secrets/TLS, registry/release/deploy/SSH, monitoring/SLO, preview/cutover/migration/retirement. |
| Stop/rollback conditions | Stop on incomplete admission, protected frontend edit need, product dependency drift, nondeterminism, artifact/evidence mismatch, UI/interaction drift, direct forbidden network target, hosting/publication/deploy logic, or protected mutation. Roll back only owned uncommitted files and ignored `.tmp` output. |

## Requirements

### Requirement: Frontend static builds SHALL be deterministic and content-addressed

For one clean candidate source identity, Node 24.18.0, npm 11.16.0, frozen
`package-lock.json`, Vite configuration, and declared normalized build inputs,
Frontend SHALL produce a byte-identical normalized static tar artifact across
two isolated `npm ci` builds. Archive paths, timestamps, UID/GID, modes, entry
order, and compression headers SHALL be normalized. Final local output SHALL be
content-addressed and SHALL never be overwritten with different bytes.
The acceptance-capable build entrypoint SHALL derive revision/tree from the
canonical checkout it actually copies, require a clean matching index, tracked
worktree, and untracked non-ignored set, and reject any caller identity that
does not exactly restate that derived candidate before writing output. Clean
verification SHALL compare raw worktree bytes and executable modes with every
stage-zero Git tree/index entry, reject content-hiding `assume-unchanged` and
`skip-worktree` flags, and ignore no drift
because of local attributes, filters, exclude configuration, or an untracked
ignore-control file. The copied source SHALL contain only tracked regular blobs
from that exact candidate.

#### Scenario: Frontend is rebuilt from identical inputs

- **WHEN** two builds run with fresh dependency/cache/output roots and the same
  source, exact toolchain/lock, and normalized inputs
- **THEN** static artifact bytes, checksum inventory, SPDX SBOM, and component
  statement are byte-identical

#### Scenario: Lock or generated output drifts

- **WHEN** `npm ci` would change the lock, generated wire checks fail, or the
  built file inventory differs between isolated builds
- **THEN** packaging fails without updating dependencies or accepting partial
  output

#### Scenario: Frontend source differs from its declared candidate

- **WHEN** `HEAD`, `HEAD^{tree}`, the index, tracked Frontend source, an
  untracked non-ignored path, or a supplied source identity disagrees
- **THEN** the build fails before copying source or creating an artifact and
  cannot emit a statement that claims the clean `HEAD`

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

### Requirement: Frontend evidence SHALL describe the exact static artifact

Frontend SHALL emit a complete sorted SHA-256 inventory, deterministic SPDX
2.3 JSON with the locked browser-runtime dependency closure, and a strict
Frontend component statement conforming to the Contracts schema. The statement
SHALL bind the exact accepted OpenAPI digest and static artifact inventory
without claiming hosting or cross-component compatibility. Source maps,
prototype/fixture boot paths, unapproved assets, and direct `api.bgm.tv` image
targets SHALL remain excluded by the existing production-artifact gate.

#### Scenario: Frontend evidence is handed to Contracts

- **WHEN** Contracts validates the Frontend artifact directory offline
- **THEN** every static file digest/size and runtime package agrees with the
  checksum inventory, SBOM, statement, package lock, and production-artifact
  inventory

### Requirement: Frontend smoke SHALL serve only built static files

Owner-local and Contracts smoke SHALL extract the normalized artifact into a
disposable directory, serve it on a loopback-only ephemeral port with no source
fallback, fetch the entry document, and verify every referenced local asset
exists and is immutable. It SHALL not choose production hosting, add a
web-server image, contact undeclared external services, or modify artifact
bytes.

#### Scenario: Static artifact is served outside the source tree

- **WHEN** smoke runs with only the extracted artifact available
- **THEN** the entry document and all referenced built assets return
  successfully, no source path is requested, artifact bytes remain unchanged,
  and the server terminates cleanly

#### Scenario: Built output depends on source or missing assets

- **WHEN** the entry references an absent/escaping/source-tree asset or serving
  changes a built file
- **THEN** smoke fails and no Frontend artifact is accepted
