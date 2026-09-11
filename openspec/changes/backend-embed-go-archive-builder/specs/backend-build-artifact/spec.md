## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Modified by `backend-embed-go-archive-builder`; specification only until strict validation and implementation acceptance. |
| Owner | Backend artifact owner, with Contracts validation of component evidence. |
| Writable paths | This delta spec, `backend/Dockerfile`, `backend/build/**`, exact Backend build inventory/tests, and generated ignored `backend/build/.tmp/**`. |
| Read-only protected inputs | Product/query/public API semantics, accepted Contracts bytes except declared consumed manifests, frontend, real Archive data, unrelated worktrees, production, hosts, remotes, and archived OpenSpec. |
| Deletion complement | Updater artifact references/fixtures and obsolete Backend status-file packaging assertions only after the single Backend artifact passes. |
| Mutable refs | Local `codex/embed-go-archive-builder` only. |
| Consumes | Clean Backend source/modules, exact producer-runtime manifest and governed catalog inputs, accepted Archive/OpenAPI contracts, Go 1.26.5, and pinned build bases. |
| Produces | One reproducible `bgmss-api` binary bundle and OCI image containing the API plus embedded Go Archive builder inputs, with checksum/SBOM/component evidence. |
| Dependencies | `backend-archive-builder`, `contracts-producer-runtime-inputs`, `contracts-artifact-compatibility`, and existing Backend artifact gates. |
| Deliverables | Updated deterministic build/evidence/smoke paths and a single Backend OCI archive; no second command or Updater artifact. |
| Acceptance | Two clean byte-identical Backend builds; exact embedded-input binding; offline evidence; source-free API smoke using disposable writable Archive state; full affected build gates. |
| Non-goals | A second executable/image, ORM, scheduler library, runtime Python, release/deploy, real acquisition, or public API/UI changes. |
| Operations deferred | Registry, release, deployment, live Archive writes/deletion, host mutation, and production scheduling verification. |
| Stop/rollback conditions | Stop on nondeterminism, input/source mismatch, source/runtime leak, unbounded authority outside the Archive mount, or failed artifact smoke; roll back owned local output only. |

## ADDED Requirements

### Requirement: Backend artifact SHALL embed the exact Archive-builder input authority

The Backend build SHALL bind the canonical producer-runtime manifest and the
two governed catalog configuration inputs from the attested clean candidate.
The resulting `bgmss-api` binary and OCI image SHALL require no Python package,
Updater image, repository source mount, or mutable external schema/config mount
to build an Archive. Build metadata and the Backend component statement SHALL
record the exact manifest and catalog identities used by the binary.

#### Scenario: Embedded builder inputs are inspected
- **WHEN** Contracts verifies the Backend bundle, OCI filesystem, build metadata, and component statement
- **THEN** all producer-runtime and catalog identities SHALL agree with the clean candidate and canonical authority
- **AND** no Updater artifact or runtime input mount SHALL be required

#### Scenario: Embedded input identity drifts
- **WHEN** an admitted input is absent, extra, regenerated, dirty, or differs in bytes, mode, or digest
- **THEN** the Backend build SHALL fail before emitting a clean-attested artifact

## MODIFIED Requirements

### Requirement: Backend builds SHALL be deterministic and content-addressed

For one clean candidate source identity, target OS/architecture, Go 1.26.5
toolchain, locked modules, canonical producer-runtime manifest, governed
catalog inputs, and declared normalized build inputs, Backend SHALL produce a
byte-identical API binary bundle and local OCI image archive across two
isolated builds. The binary bundle SHALL contain one normalized same-target
`bgmss-api` executable plus canonical build metadata. The builder code and
embedded input identities SHALL be part of the same attested Backend source
and artifact identity.

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
- **WHEN** Backend build-control, builder source, module locks, or governed embedded inputs differ from the attested candidate commit
- **THEN** pure/synthetic tests MAY validate the implementation, but no clean-attested artifact or reproducibility claim is emitted

#### Scenario: Backend is rebuilt from identical inputs
- **WHEN** two builds run with fresh caches/output roots and the same source, target platform, pinned toolchain/base images, modules, producer-runtime manifest, catalog inputs, and normalized inputs
- **THEN** the one-executable bundle, OCI bytes, checksum inventory, SPDX SBOM, component statement, embedded inputs, and inner executable evidence are byte-identical

#### Scenario: An existing content address has different bytes
- **WHEN** publication would replace an existing local content-addressed directory with non-identical content
- **THEN** the build fails without modifying the existing artifact

#### Scenario: Backend source differs from its declared candidate
- **WHEN** candidate identity, tracked bytes/modes, embedded-input bytes, or declared inputs disagree
- **THEN** the build fails before copying source or creating an artifact

### Requirement: The Backend runtime image SHALL be minimal and immutable

The runtime image SHALL contain `bgmss-api`, its embedded Archive-builder
inputs, and only required runtime trust/data files. It SHALL not contain a
second Backend executable, Updater package/image payload, Python/uv runtime,
source, module cache, compiler, or build tool. It SHALL remain non-root and its
image root filesystem SHALL remain immutable. Runtime write authority SHALL be
limited to the explicitly configured Archive bind mount and bounded temporary
state needed by the embedded builder; no update-status file argument or mount
SHALL exist. Numeric user parsing SHALL reject UID zero in canonical or
leading-zero form, with or without a group field.

#### Scenario: The local runtime image is inspected
- **WHEN** image metadata and filesystem are checked after a local `push=false` build
- **THEN** the API SHALL be the only Backend executable, builder inputs SHALL be embedded and read-only, and no Python or Updater artifact SHALL be present

#### Scenario: Runtime write authority is projected
- **WHEN** the Backend image runs with its configured Archive root
- **THEN** only that bind mount and declared temporary state SHALL be writable while the image root remains read-only

#### Scenario: A root UID uses a non-canonical spelling
- **WHEN** the runtime config user is `00`, `000:123`, or another numeric encoding of UID zero
- **THEN** artifact verification rejects the image before it can be accepted

### Requirement: Backend evidence SHALL describe the exact runtime artifact

Backend SHALL emit a complete sorted SHA-256 inventory, deterministic SPDX 2.3
JSON with the locked Go runtime dependency closure, and a strict Backend
component statement conforming to the Contracts schema. The statement SHALL
bind the accepted Archive compatibility, exact OpenAPI digest, canonical
producer-runtime manifest digest, and governed catalog-input identity without
claiming a separate Updater component or cross-component compatibility.

#### Scenario: Backend evidence is handed to Contracts
- **WHEN** Contracts validates the Backend artifact directory offline
- **THEN** every artifact digest/size, locked runtime module, builder-input identity, checksum inventory, SBOM, statement, module lock, and built binary metadata SHALL agree

### Requirement: Backend smoke SHALL start only the built API

Owner-local and Contracts artifact smoke SHALL start only the built API runtime
image against a disposable writable materialization of the accepted Archive
fixture. The API SHALL listen explicitly on its container bridge, and a
distinct probe process or container on the same uniquely owned internal
network SHALL verify `/livez`, `/readyz`, and `/metrics` through the API network
identity. Smoke SHALL prove that the embedded builder inputs are present, but
SHALL NOT perform real acquisition, mount product source, publish a host port,
join a pre-existing/live network, contact a registry/external endpoint, or
write outside its disposable Archive root. It SHALL perform exact bounded
cleanup on success or failure.

#### Scenario: Built API is healthy through the artifact network
- **WHEN** source is absent, a disposable fixture copy is mounted as the exact writable Archive root, and API/probe join the owned internal network
- **THEN** all health/metrics probes pass, immutable fixture inputs remain valid, and every owned runtime resource terminates cleanly

#### Scenario: Runtime requires unsafe reachability or mutable state
- **WHEN** startup requires source/build tools, Python, an Updater image, shared network namespace, host publication, a live network, a write outside the disposable Archive root, or an external request
- **THEN** smoke fails and no Backend artifact is accepted
