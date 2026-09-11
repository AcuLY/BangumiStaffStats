## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Updater-specific input packaging retired; Backend artifact becomes the sole runtime consumer. |
| Owner | Backend artifact owns embedded builder inputs; Contracts retains the closed manifest authority. |
| Writable paths | This delta spec and exact updater packaging/build paths after Backend input binding is accepted. |
| Read-only protected inputs | Producer-runtime manifest, Archive/catalog schemas and goldens, governed catalog bytes, unrelated artifacts, production, hosts, remotes, and archived OpenSpec. |
| Deletion complement | Updater native/OCI producer roots, metadata, labels, smoke paths, and updater-only packaging tests. |
| Mutable refs | Local `codex/embed-go-archive-builder` only. |
| Consumes | Accepted Backend embedding defined by `backend-build-artifact` and `contracts-producer-runtime-inputs`. |
| Produces | No Updater-native or Updater-OCI producer-input subtree. |
| Dependencies | Backend component statement binding and exact embedded-input verification. |
| Deliverables | Retirement of updater packaging while preserving byte-identical authority in Backend. |
| Acceptance | Backend binary/image evidence binds the manifest and governed catalog inputs; no updater root or label remains. |
| Non-goals | Changing the 42-file authority, catalog semantics, schema bytes, or source identity rules. |
| Operations deferred | Release/deployment and live image deletion remain separate. |
| Stop/rollback conditions | Stop if Backend packaging drops, regenerates, or broadens any admitted input; roll back owned local cleanup. |

## REMOVED Requirements

### Requirement: Updater artifacts SHALL embed the exact producer input authority

**Reason**: Updater artifacts no longer exist.

**Migration**: Embed and attest the same closed Contracts/catalog authority in the single Backend artifact.

### Requirement: Packaged producer inputs SHALL be immutable and self-describing

**Reason**: The Updater-specific native/OCI roots, labels, metadata, and component statement are removed.

**Migration**: Bind exact input bytes and digests through Backend build metadata/component evidence and compile them into `bgmss-api` so the container needs no mutable external input subtree.

### Requirement: Embedded producer inputs SHALL pass finite networkless smoke

**Reason**: There is no Updater image or Python smoke command to exercise.

**Migration**: Verify embedded input identity through Backend artifact inspection and Go contract tests; keep Backend artifact smoke source-free and externally networkless.
