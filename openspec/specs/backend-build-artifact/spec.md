# backend-build-artifact Specification

## Purpose
Define deterministic, content-addressed Backend development artifacts, their minimal immutable runtime, exact evidence, and artifact-only smoke contract.

## Capability Boundary

| Field | Declaration |
|---|---|
| Status | investigated: complete; specified: complete after strict validation; implemented and verified: complete; committed: `c1e0623ddd14ba678a32b082d7e16d2e66017606`; pushed: `origin/codex/formal-rewrite`; released: no; deployed: no |
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
## Requirements
### Requirement: Backend builds SHALL be deterministic and content-addressed

For one clean candidate source identity, target OS/architecture, Go 1.26.5
toolchain, locked modules, and declared normalized build inputs, Backend SHALL
produce a byte-identical API binary bundle and local OCI image archive across
two isolated builds. The binary bundle SHALL contain normalized same-target
`bgmss-api` and `archive-smoke` executables plus canonical build metadata.
Build paths, timestamps, UID/GID, modes, archive order, compression headers,
and Go link metadata SHALL be normalized. Final local output SHALL be
content-addressed and SHALL never be overwritten with different bytes. The
acceptance-capable build entrypoint SHALL derive revision/tree/epoch from the
canonical checkout it actually builds, SHALL require a clean matching index,
tracked worktree, and untracked non-ignored set, and SHALL reject caller
identity overrides that do not exactly restate that derived candidate before
writing output. Clean verification SHALL compare raw worktree bytes and
executable modes with every stage-zero Git tree/index entry and reject
content-hiding state.

#### Scenario: Implementation is still dirty
- **WHEN** Backend build-control source differs from the attested candidate commit
- **THEN** pure/synthetic tests may validate the implementation, but no clean-attested artifact or reproducibility claim is emitted

#### Scenario: Backend is rebuilt from identical inputs
- **WHEN** two builds run with fresh caches/output roots and the same source, target platform, pinned toolchain/base images, and normalized inputs
- **THEN** the two-executable bundle, OCI bytes, checksum inventory, SPDX SBOM, component statement, and inner executable evidence are byte-identical

#### Scenario: An existing content address has different bytes
- **WHEN** publication would replace an existing local content-addressed directory with non-identical content
- **THEN** the build fails without modifying the existing artifact

#### Scenario: Backend source differs from its declared candidate
- **WHEN** candidate identity, tracked bytes/modes, or declared inputs disagree
- **THEN** the build fails before copying source or creating an artifact

### Requirement: Backend binary bundle SHALL expose exact producer gates

The normalized Backend bundle SHALL contain exactly `bin/bgmss-api`,
`bin/archive-smoke`, and `metadata/build.json` below their required
directories. Both binaries SHALL be regular non-symlink files built for the
statement target with `CGO_ENABLED=0`, deterministic Go flags, and executable
mode `0555`. `metadata/build.json` SHALL use schema version 2 and bind a closed
role/path/size/SHA-256 record for each; historical schema version 1 SHALL not
be accepted for a new bundle. Verification SHALL reject an unsafe, missing,
extra, duplicate, non-executable, wrong-target, or digest-mismatched member.
Outer checksum, SBOM, and component evidence SHALL bind the complete bundle
bytes.

#### Scenario: Operations consumes Archive validation
- **WHEN** the accepted bundle is verified and `bin/archive-smoke` is extracted through the declared member
- **THEN** its size and digest match canonical bundle metadata
- **AND** no Backend source or build tool is required

#### Scenario: Inner bundle content drifts
- **WHEN** an executable/member/mode/role/path/size/digest differs or an extra member appears
- **THEN** verification fails before the bundle can be accepted

### Requirement: The Backend runtime image SHALL be minimal and immutable

The runtime image SHALL contain `bgmss-api` and only required runtime
trust/data files. It SHALL not contain `archive-smoke`, source, module cache,
compiler, or build tool. It SHALL remain non-root, immutable, and accept
Archive/status inputs only through explicit read-only mounts/arguments.
Numeric user parsing SHALL reject UID zero in canonical or leading-zero form,
with or without a group field.

#### Scenario: The local runtime image is inspected
- **WHEN** image metadata and filesystem are checked after a local `push=false` build
- **THEN** the API is the only Backend executable and `archive-smoke` exists only in the binary bundle

#### Scenario: A root UID uses a non-canonical spelling
- **WHEN** the runtime config user is `00`, `000:123`, or another numeric encoding of UID zero
- **THEN** artifact verification rejects the image before it can be accepted

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

Owner-local and Contracts artifact smoke SHALL start only the built API runtime
image against a disposable read-only accepted Archive fixture. The API SHALL
listen explicitly on its container bridge, and a distinct probe process or
container on the same uniquely owned internal network SHALL verify `/livez`,
`/readyz`, and `/metrics` through the API network identity. Smoke SHALL not
share the API network namespace merely to reach its loopback listener, publish
a host port, join a pre-existing/live network, import source, build at runtime,
modify an Archive/pointer, or contact a registry/external endpoint. It SHALL
perform exact bounded cleanup on success or failure.

#### Scenario: Built API is healthy through the artifact network
- **WHEN** the source tree is absent, the accepted fixture is mounted read-only, and API/probe join the exact owned internal network
- **THEN** all health/metrics probes pass through the API bridge identity, inputs remain byte-identical, and every owned runtime resource terminates cleanly

#### Scenario: Runtime requires unsafe reachability or mutable state
- **WHEN** startup requires source/build tools, a shared network namespace, host publication, a live network, writable Archive state, or an external request
- **THEN** smoke fails and no Backend artifact is accepted

### Requirement: Backend image archive SHALL remain OCI-native and Docker-load-compatible

The single-platform Backend image SHALL be exported by the pinned BuildKit
Docker exporter with explicit OCI media types, exact image name, normalized
source epoch, and no provenance/SBOM attachment. Its distributed `.oci.tar`
SHALL contain one closed OCI layout version `1.0.0` graph plus the exact
exporter-generated Docker compatibility `manifest.json`. The compatibility
record SHALL contain only the declared image tag and SHALL point to the same
config and ordered layers admitted by the OCI graph. A bounded repository-owned
extractor SHALL reject an absolute, non-normalized, duplicate, linked,
extended-attribute, PAX, sparse, device, FIFO, oversized, unsupported, extra,
or orphan member before materialization. Final files/directories SHALL be
normalized to `0444`/`0555` and repacked as sorted epoch-zero USTAR bytes.
Project code SHALL not synthesize the Docker compatibility format.

#### Scenario: An older supported Docker Engine loads the artifact
- **WHEN** Docker Engine 26 or 28 loads the accepted normalized `.oci.tar`
- **THEN** it restores exactly the declared local image tag from the compatibility record
- **AND** the image config, ordered layers, target, user, and entrypoint match the verified OCI graph

#### Scenario: Exporter layout or compatibility evidence drifts
- **WHEN** the raw tar has an unsafe/unsupported/extra/orphan member, the graph is not one exact target, or `manifest.json` disagrees with its config, layers, or image tag
- **THEN** packaging fails before the normalized image archive or component statement is emitted
