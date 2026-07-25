## Capability Boundary

| Field | Declaration |
|---|---|
| Status | investigated: complete; specified: complete after strict validation; implemented: no; verified: no; committed: no; pushed: no; released: no; deployed: no |
| Owner | Backend apply group. |
| Writable paths | `backend/Dockerfile`, `backend/build/**`, and only persistent-inventory handling in `backend/scripts/check.sh`; generated output only below ignored `backend/build/.tmp/**`. |
| Read-only protected inputs | Root authorities/oracle/OpenSpec outside this change; `contracts/**`; all Backend source, module, script hunks outside the exact inventory amendment, README, and config files outside the writable paths; all Updater/Frontend paths; external repositories/state. |
| Deletion complement | None. |
| Mutable refs | None. |
| Consumes | Clean candidate Backend source, `backend/go.mod`, `backend/go.sum`, Go 1.26.5, accepted API/Archive contracts, Contracts statement schema, and existing Backend checks. |
| Produces | Reproducible API binary bundle, local OCI image archive, checksum inventory, SPDX SBOM, Backend component statement, and owner-local smoke helpers. |
| Dependencies | Exact direct IDs: `produce-immutable-archive`, `derive-position-catalog-and-cast`, `implement-backend-archive-consumer`, `implement-backend-http-and-observability`, `implement-image-proxy`, `implement-query-result-set`, `implement-statistics-series-sort-evidence`, `expose-dynamic-catalog`, `admit-public-collection-client`, `implement-bounded-query-cache`, `expose-rankings`, `expose-candidates`, `expose-person-detail`, `expose-partners`, `expose-co-star`, `implement-frontend-query-shell`, `implement-frontend-ranking-results`, `implement-frontend-person-inspector`, `implement-frontend-co-star-vertical`, `harden-frontend-design-and-accessibility`; all active changes must also be completed/archived before apply. |
| Deliverables | Digest-pinned multi-stage `backend/Dockerfile`, deterministic build/checksum/SBOM/statement/reproducibility scripts and tests, local-output ignore rules, and an exact persistent-inventory update that admits only those tracked build files plus generated `build/.tmp/**`. |
| Acceptance | Existing Backend full/race/vet/build/check gate; two clean byte-identical builds; offline evidence validation; non-root artifact-only API health/metrics smoke; exact paths/residue/diff checks. |
| Non-goals | Backend product/source/module changes, API changes, dependency upgrades, registry/release/deploy, Compose, activation, or production config. |
| Operations deferred | Production listener/topology, service manager, secrets/TLS, Archive activation/restart/rollback/cleanup, registry/release/deploy/SSH, monitoring/SLO, migration/cutover. |
| Stop/rollback conditions | Stop on incomplete admission, source/module edit need, unpinned tool/base, nondeterminism, evidence mismatch, source/runtime leak, mutable Archive access, publication/deploy logic, or protected mutation. Roll back only owned uncommitted files and ignored `.tmp` output. |

## ADDED Requirements

### Requirement: Backend builds SHALL be deterministic and content-addressed

For one clean candidate source identity, target OS/architecture, Go 1.26.5
toolchain, locked modules, and declared normalized build inputs, Backend SHALL
produce a byte-identical API binary bundle and local OCI image archive across
two isolated builds. Build paths, timestamps, UID/GID, modes, archive order,
compression headers, and Go link metadata SHALL be normalized. Final local
output SHALL be content-addressed and SHALL never be overwritten with
different bytes. The acceptance-capable build entrypoint SHALL derive
revision/tree/epoch from the canonical checkout it actually builds, SHALL
require a clean matching index, tracked worktree, and untracked non-ignored
set, and SHALL reject caller identity overrides that do not exactly restate
that derived candidate before writing output. Clean verification SHALL compare
raw worktree bytes and executable modes with every stage-zero Git tree/index
entry, reject content-hiding `assume-unchanged` and `skip-worktree` flags, and ignore no drift because of local
attributes, filters, exclude configuration, or an untracked ignore-control
file.

#### Scenario: Backend is rebuilt from identical inputs

- **WHEN** two builds run with fresh caches/output roots and the same source,
  target platform, pinned toolchain/base images, and normalized inputs
- **THEN** distributed artifact bytes, checksum inventory, SPDX SBOM, and
  component statement are byte-identical

#### Scenario: An existing content address has different bytes

- **WHEN** publication would replace an existing local content-addressed
  directory with non-identical content
- **THEN** the build fails without modifying the existing artifact

#### Scenario: Backend source differs from its declared candidate

- **WHEN** `HEAD`, `HEAD^{tree}`, the index, tracked Backend source, an
  untracked non-ignored path, or a caller-supplied source identity disagrees
- **THEN** the build fails before copying source or creating an artifact and
  cannot emit a statement that claims the clean `HEAD`

### Requirement: The Backend runtime image SHALL be minimal and immutable

`backend/Dockerfile` SHALL be multi-stage and pin each base image by an
immutable literal digest that no build argument can override. Its runtime
stage SHALL contain the API executable and only required runtime trust/data
files, SHALL contain no source, module cache, compiler, or build tool, SHALL
run as a non-root user, and SHALL accept Archive and optional development
status inputs only through explicit read-only mounts/arguments.
It SHALL have no registry, release, deployment, activation, scheduler, or
production topology behavior.

#### Scenario: The local runtime image is inspected

- **WHEN** image metadata and filesystem are checked after a local `push=false`
  build
- **THEN** bases are digest-pinned, the configured user is non-root, product
  source/build tools are absent, and only the API runtime deliverable remains

### Requirement: Backend evidence SHALL describe the exact runtime artifact

Backend SHALL emit a complete sorted SHA-256 inventory, deterministic SPDX 2.3
JSON with the locked Go runtime dependency closure, and a strict Backend
component statement conforming to the Contracts schema. The statement SHALL
bind the accepted Archive compatibility and exact OpenAPI digest without
claiming cross-component compatibility.

#### Scenario: Backend evidence is handed to Contracts

- **WHEN** Contracts validates the Backend artifact directory offline
- **THEN** every artifact digest/size and locked runtime module agrees with the
  checksum inventory, SBOM, statement, module locks, and built binary metadata

### Requirement: Backend smoke SHALL start only the built API

Owner-local and Contracts smoke SHALL start the built API artifact as non-root
against a disposable read-only accepted Archive fixture and SHALL verify
`/livez`, `/readyz`, and `/metrics` on loopback before bounded termination.
It SHALL not import source, build at runtime, modify an Archive/pointer, contact
a registry, or claim production readiness.

#### Scenario: Built API is healthy against the local fixture

- **WHEN** the source tree is absent from runtime paths and the accepted
  disposable fixture is mounted read-only
- **THEN** the API reaches ready state, health/metrics responses pass their
  existing contracts, the fixture remains byte-identical, and the process
  terminates cleanly

#### Scenario: Runtime requires source or writable Archive state

- **WHEN** startup requires source/build tools, writes the Archive/pointer, or
  escapes declared local inputs
- **THEN** smoke fails and no Backend artifact is accepted
