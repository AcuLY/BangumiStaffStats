## Capability Boundary

| Field | Contract |
|---|---|
| Status | Modified development artifact; not released or deployed. |
| Owner | Updater. |
| Writable paths | Updater Dockerfile/build helpers/tests declared by this change. |
| Read-only protected inputs | Product source/config/locks and all Contracts/other component/external state. |
| Deletion complement | None beyond owned ignored output cleanup. |
| Mutable refs | None during apply. |
| Consumes | Existing deterministic artifact pipeline plus accepted producer inputs. |
| Produces | Reproducible bundle/image v2 with embedded producer inputs and statement binding. |
| Dependencies | Frozen Python/uv/BuildKit/Buildx and Contracts statement authority. |
| Deliverables | Snapshot/package/image/evidence/verifier/smoke changes. |
| Acceptance | Two byte-identical builds, full artifact tests, embedded smoke, Contracts verification, residue. |
| Non-goals | Wheel API/product changes, dependency updates, actual produce/acquisition, release/deploy/activation. |
| Operations deferred | Archive-smoke/output mounts, schedule, host/release/deployment/cutover. |
| Stop/rollback conditions | Stop on source/lock/authority drift, nondeterminism, evidence mismatch, runtime leak/write, or external mutation. |

## MODIFIED Requirements

### Requirement: Updater builds SHALL be deterministic and content-addressed

For one clean candidate source identity, target OS/architecture, Python 3.14.6,
uv 0.11.32, frozen `uv.lock`, accepted producer-runtime manifest, and declared
normalized inputs, Updater SHALL produce a byte-identical wheel, native runtime
bundle v2, and local OCI image archive across two isolated builds. The native
bundle and image SHALL contain identical immutable producer Contracts/catalog
inputs and canonical evidence; the wheel remains product-code-only.
Paths, timestamps, ownership, modes, archive order, and compression headers
SHALL be normalized. Final output SHALL be content-addressed and never
overwritten with different bytes. Candidate identity and clean raw Git
bytes/modes SHALL be attested before copying any product or producer input.
The source snapshot SHALL contain only tracked regular blobs from that exact
candidate; ignored live-worktree files SHALL NOT affect or enter the artifact.

#### Scenario: Updater is rebuilt from identical inputs
- **WHEN** two frozen builds use fresh roots and identical candidate, authority, target and toolchains
- **THEN** wheel, bundle v2, OCI, producer metadata, checksum/SBOM/statement and all artifact bytes are identical

#### Scenario: A producer input or candidate differs
- **WHEN** source identity, manifest/catalog blob, mode, declared digest, lock, or caller override disagrees
- **THEN** build fails before output and cannot claim the clean candidate

#### Scenario: Frozen dependency input is unavailable or drifts
- **WHEN** the build cannot satisfy the exact lock offline/from its declared cache or resolved package metadata disagrees with `uv.lock`
- **THEN** it fails without loosening pins, rewriting the lock, or publishing a partial artifact

#### Scenario: Updater source differs from its declared candidate
- **WHEN** `HEAD`, `HEAD^{tree}`, the index, tracked Updater source, an untracked non-ignored path, or a caller-supplied source identity disagrees
- **THEN** the build fails before copying source or creating an artifact and cannot emit a statement that claims the clean `HEAD`

### Requirement: The Updater runtime image SHALL remain one-shot

`updater/Dockerfile` SHALL remain multi-stage and pin every base image by an
immutable digest. The runtime image SHALL install only the built
package/runtime closure and the exact read-only producer input subtree. It
SHALL contain no product source, tests, compiler, package cache, build tool,
scheduler, resident loop, activation wrapper, registry, release, deployment,
or topology behavior. It SHALL run as non-root, require an explicit finite
command, and exit with that command.

#### Scenario: The local updater image is inspected and run
- **WHEN** metadata/filesystem and embedded input smoke are checked after a local `push=false` build
- **THEN** bases are digest-pinned, source/build tools are absent, producer inputs are exact/read-only, and each finite command exits with its bounded result

### Requirement: Updater evidence SHALL describe the exact runtime artifact

Updater SHALL emit a sorted checksum inventory, deterministic SPDX 2.3
evidence, canonical build/producer metadata, and a strict component statement.
The statement SHALL bind the accepted Archive compatibility and exact
`contracts/producer-runtime-inputs-v1` digest. Native bundle metadata, OCI
labels/rootfs, outer metadata, checksum/SBOM, and statement SHALL agree
offline. The build metadata v2 SHALL bind both the canonical producer-input
document digest and the producer-runtime manifest digest; clean-attested
repeat builds SHALL run only after the implementation candidate is committed.
Evidence SHALL not claim activation or cross-component compatibility.

#### Scenario: Updater evidence is handed to Contracts
- **WHEN** Contracts validates the Updater artifact directory offline
- **THEN** every artifact and producer-input identity agrees with evidence and the frozen candidate

#### Scenario: Implementation is still dirty

- **WHEN** build-control source differs from the attested candidate commit
- **THEN** pure/synthetic tests may validate the implementation, but no
  clean-attested artifact or reproducibility claim is emitted

### Requirement: Updater smoke SHALL use the built package without activation

Owner-local and Contracts smoke SHALL run `doctor`, embedded `contract-check`,
and embedded catalog validation from the built artifact with product source
absent. It SHALL not perform real acquisition, run `produce`, schedule itself,
read or write a production path, create/activate `current.json`, or emit
`update_activated`. Every created container SHALL carry a per-run ownership
label. Cleanup SHALL remove a named container only after its current label
matches that exact run and immutable container ID, then delete only by that ID.
Smoke SHALL record the first post-load image ID before further validation.
Because supported Docker storage backends expose either the verified OCI
config digest (classic image store) or verified OCI manifest digest
(containerd image store) as that immutable ID, smoke SHALL admit exactly those
two artifact-bound alternatives and reject every other ID. Cleanup SHALL use
the captured alternative, never force image removal, and SHALL not delete a
replacement tag/image. A load that fails after creating the declared tag SHALL
apply the same two-digest ownership proof before cleanup. Cleanup SHALL
preserve the primary failure.

#### Scenario: Built updater validates itself and shared contracts
- **WHEN** smoke runs outside source with only the artifact and disposable state
- **THEN** all finite validations succeed, input bytes remain unchanged, and no residual process/state remains

#### Scenario: Smoke attempts activation or source fallback
- **WHEN** the artifact imports source, mounts repository inputs, writes producer inputs/Archive state, schedules work, or contacts a network
- **THEN** smoke fails and no Updater artifact is accepted

#### Scenario: A smoke container name is occupied or changes ownership
- **WHEN** a pre-existing or concurrently created container has a planned smoke name without the exact current-run ownership label
- **THEN** smoke fails without stopping or deleting that foreign container

#### Scenario: The loaded image tag changes ownership
- **WHEN** the declared image tag no longer resolves to the first post-load image ID
- **THEN** smoke reports the collision and removes no replacement image or tag

#### Scenario: Supported image stores expose different immutable IDs
- **WHEN** a supported classic or containerd image store loads the accepted archive
- **THEN** smoke accepts only the verified OCI config or manifest digest exposed by that store
- **AND** all later container creation and cleanup use the captured immutable ID

## ADDED Requirements

### Requirement: Updater image archive SHALL load on supported Docker Engines

The single-platform Updater image SHALL use the pinned BuildKit Docker exporter
with explicit OCI media types, the exact declared image tag, normalized source
epoch, and disabled provenance/SBOM attachments. The distributed archive SHALL
contain one closed OCI layout `1.0.0` graph plus the exporter-owned Docker
compatibility `manifest.json`. Its sole compatibility record SHALL name the
declared tag and the same config and ordered layers as the verified OCI graph.
A bounded repository-owned admission path SHALL reject unsafe, duplicate,
linked, unsupported, oversized, extra, or orphan members before normalization;
project code SHALL not synthesize the compatibility format.

#### Scenario: An older supported Engine loads the Updater image
- **WHEN** Docker Engine 26 or 28 loads the accepted normalized image archive
- **THEN** it restores exactly the declared local tag and the verified OCI config/layers

#### Scenario: Exporter or compatibility evidence drifts
- **WHEN** the raw archive is unsafe or its compatibility record, graph, target, or tag disagrees
- **THEN** packaging fails before image metadata or component evidence is emitted
