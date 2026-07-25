## Capability Boundary

| Field | Declaration |
|---|---|
| Status | investigated: complete; specified: complete after strict validation; implemented: no; verified: no; committed: no; pushed: no; released: no; deployed: no |
| Owner | Updater apply group. |
| Writable paths | `updater/Dockerfile` and `updater/build/**`; generated output only below ignored `updater/build/.tmp/**`. |
| Read-only protected inputs | Root authorities/oracle/OpenSpec outside this change; `contracts/**`; all Updater source, tests, configuration, `pyproject.toml`, `uv.lock`, README, and other files outside writable paths; all Backend/Frontend paths; external repositories/state. |
| Deletion complement | None. |
| Mutable refs | None. |
| Consumes | Clean candidate Updater source, `pyproject.toml`, `uv.lock`, Python 3.14.6, uv 0.11.32, accepted Archive contracts, Contracts statement schema, and existing Updater checks/build. |
| Produces | Reproducible wheel/bundle, local OCI image archive, checksum inventory, SPDX SBOM, Updater component statement, and owner-local smoke helpers. |
| Dependencies | Exact direct IDs: `produce-immutable-archive`, `derive-position-catalog-and-cast`, `implement-backend-archive-consumer`, `implement-backend-http-and-observability`, `implement-image-proxy`, `implement-query-result-set`, `implement-statistics-series-sort-evidence`, `expose-dynamic-catalog`, `admit-public-collection-client`, `implement-bounded-query-cache`, `expose-rankings`, `expose-candidates`, `expose-person-detail`, `expose-partners`, `expose-co-star`, `implement-frontend-query-shell`, `implement-frontend-ranking-results`, `implement-frontend-person-inspector`, `implement-frontend-co-star-vertical`, `harden-frontend-design-and-accessibility`; all active changes must also be completed/archived before apply. |
| Deliverables | Digest-pinned multi-stage `updater/Dockerfile`, deterministic build/checksum/SBOM/statement/reproducibility scripts and tests, and local-output ignore rules. |
| Acceptance | Existing pytest/mypy/ruff/frozen-wheel gates; two clean byte-identical builds; offline evidence validation; non-root one-shot artifact-only `doctor`/contract smoke; exact paths/residue/diff checks. |
| Non-goals | Updater product/source/lock/config changes, dependency upgrades, real acquisition/periodic run, activation, registry/release/deploy, Compose, or production config. |
| Operations deferred | Scheduler/timer/`flock`, production paths/users/secrets/TLS, `current.json` activation/restart/rollback/cleanup and `update_activated`, registry/release/deploy/SSH, monitoring/SLO, migration/cutover. |
| Stop/rollback conditions | Stop on incomplete admission, source/lock edit need, unpinned tool/base, nondeterminism, evidence mismatch, source/runtime leak, scheduling/activation/publication logic, or protected mutation. Roll back only owned uncommitted files and ignored `.tmp` output. |

## ADDED Requirements

### Requirement: Updater builds SHALL be deterministic and content-addressed

For one clean candidate source identity, target OS/architecture, Python 3.14.6,
uv 0.11.32, frozen `uv.lock`, and declared normalized build inputs, Updater
SHALL produce a byte-identical wheel/bundle and local OCI image archive across
two isolated builds. Wheel/archive paths, timestamps, UID/GID, modes, entry
order, and compression headers SHALL be normalized. Final local output SHALL be
content-addressed and SHALL never be overwritten with different bytes.

#### Scenario: Updater is rebuilt from identical inputs

- **WHEN** two frozen builds run with fresh caches/output roots and the same
  source, target platform, pinned toolchain/base images, and normalized inputs
- **THEN** distributed artifact bytes, checksum inventory, SPDX SBOM, and
  component statement are byte-identical

#### Scenario: Frozen dependency input is unavailable or drifts

- **WHEN** the build cannot satisfy the exact lock offline/from its declared
  cache or resolved package metadata disagrees with `uv.lock`
- **THEN** it fails without loosening pins, rewriting the lock, or publishing a
  partial artifact

### Requirement: The Updater runtime image SHALL remain one-shot

`updater/Dockerfile` SHALL be multi-stage and pin every base image by immutable
digest. The runtime stage SHALL install only the built wheel and locked runtime
closure, contain no source, tests, compiler, package cache, or build tool, run
as non-root, require an explicit finite updater command, and exit with that
command. It SHALL contain no scheduler, resident loop, activation wrapper,
registry, release, deployment, or production topology behavior.

#### Scenario: The local updater image is inspected and run

- **WHEN** image metadata/filesystem and an explicit `doctor` invocation are
  checked after a local `push=false` build
- **THEN** bases are digest-pinned, the configured user is non-root, source and
  build tools are absent, and the finite command exits with its bounded result

### Requirement: Updater evidence SHALL describe the exact runtime artifact

Updater SHALL emit a complete sorted SHA-256 inventory, deterministic SPDX 2.3
JSON with the locked Python runtime dependency closure, and a strict Updater
component statement conforming to the Contracts schema. The statement SHALL
bind the accepted Archive manifest/SQLite schema producer compatibility and
SHALL not claim activation or cross-component compatibility.

#### Scenario: Updater evidence is handed to Contracts

- **WHEN** Contracts validates the Updater artifact directory offline
- **THEN** every artifact digest/size and runtime package agrees with the
  checksum inventory, SBOM, statement, `uv.lock`, and built wheel metadata

### Requirement: Updater smoke SHALL use the built package without activation

Owner-local and Contracts smoke SHALL run `doctor` and `contract-check` from
the built wheel/bundle or image using read-only Contracts inputs. It SHALL run
with product source absent from import paths and SHALL NOT perform real
acquisition, run `produce`, schedule itself, read or write a production path,
create/activate `current.json`, or emit `update_activated`.

#### Scenario: Built updater validates itself and shared contracts

- **WHEN** smoke runs outside the source tree with only the built artifact and
  read-only Contracts tree available
- **THEN** both finite commands succeed, import metadata resolves to the built
  package, inputs remain unchanged, and no residual process or state remains

#### Scenario: Smoke attempts activation or source fallback

- **WHEN** the built updater imports from source, writes contract/Archive
  inputs, creates an active pointer, schedules work, or contacts an undeclared
  external service
- **THEN** smoke fails and no Updater artifact is accepted
