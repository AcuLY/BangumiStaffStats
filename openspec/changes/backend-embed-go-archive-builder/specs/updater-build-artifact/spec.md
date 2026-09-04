## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Separate Updater artifact retired by `backend-embed-go-archive-builder`; deletion follows accepted Backend artifact parity. |
| Owner | Backend artifact owns the replacement executable/image; Contracts owns two-component assembly. |
| Writable paths | This delta spec and exact updater artifact/build files under `updater/**` after parity acceptance. |
| Read-only protected inputs | Existing updater artifact output remains read-only evidence until replacement acceptance; Backend/Frontend artifacts, Contracts authorities, production, hosts, remotes, and archived OpenSpec remain protected. |
| Deletion complement | `updater/Dockerfile`, `updater/build/**`, updater artifact fixtures/evidence, and updater-only CI/build references. |
| Mutable refs | Local `codex/embed-go-archive-builder` only. |
| Consumes | Accepted single Backend artifact carrying the embedded Go builder and producer inputs. |
| Produces | No Updater wheel, native bundle, OCI archive, checksum/SBOM, component statement, or smoke helper. |
| Dependencies | `backend-build-artifact`, `contracts-artifact-compatibility`, and Go builder fixture parity. |
| Deliverables | Removal of the third artifact component and all updater-specific packaging/smoke/toolchain paths. |
| Acceptance | Deployment bundle and compatibility manifest contain only Backend and Frontend product components; no Python/uv/Updater image build runs. |
| Non-goals | Weakening Backend/Frontend reproducibility, removing language-neutral Archive contracts, or publishing artifacts. |
| Operations deferred | Registry, release, deployment, and live image removal remain separately authorized. |
| Stop/rollback conditions | Stop if Backend evidence does not bind the producer inputs or two-component assembly is incomplete; roll back owned local cleanup only. |

## REMOVED Requirements

### Requirement: Updater builds SHALL be deterministic and content-addressed

**Reason**: A standalone Updater artifact is no longer built; the Go builder is part of the deterministic Backend artifact.

**Migration**: Bind builder source, modules, and producer inputs into `backend-build-artifact` reproducibility and evidence.

### Requirement: The Updater runtime image SHALL remain one-shot

**Reason**: The updater image and one-shot container are removed from the product topology.

**Migration**: Run scheduled construction inside the long-running non-root Backend image with only the Archive bind mount writable.

### Requirement: Updater evidence SHALL describe the exact runtime artifact

**Reason**: There is no Updater component statement, SBOM, checksum inventory, or image identity after artifact collapse.

**Migration**: Record the producer-runtime manifest and builder inputs in the Backend component statement and artifact evidence.

### Requirement: Updater smoke SHALL use the built package without activation

**Reason**: The Updater package/image smoke and its Python helper are removed with the artifact.

**Migration**: Exercise embedded-input identity and Backend runtime behavior through Backend artifact smoke and Go tests without reconstructing a separate updater smoke.

### Requirement: Updater image archive SHALL load on supported Docker Engines

**Reason**: No Updater OCI archive is distributed or loaded.

**Migration**: Keep Docker-load compatibility solely for the Backend OCI archive.

### Requirement: Packaged Updater runtimes SHALL exclude installer command shims

**Reason**: Python runtime installation and its generated console scripts no longer exist.

**Migration**: Delete the runtime-prune implementation/tests with the Python artifact; no equivalent shim handling is required in the Go-only Backend image.
