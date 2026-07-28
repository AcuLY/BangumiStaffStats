## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Investigated: complete; specified: complete after strict validation; implemented, verified, committed, pushed, released, and deployed: no. |
| Owner | Updater artifact apply owner; main agent specification/audit/acceptance owner. |
| Writable paths | `updater/build/runtime_prune.py`, `updater/build/test_artifact.py`, and this active change. |
| Read-only protected inputs | Every other repository path, including Updater artifact/check/smoke/Dockerfile/source/configuration/lock, Backend/Frontend/Contracts/Operations implementation, root authorities, other OpenSpec, and all external state. |
| Deletion complement | No tracked deletion. Generated deletion is only an admitted installed-runtime root's direct real `bin/**` subtree and the matching `bin/**` rows in installed distribution `RECORD` files before publication. |
| Mutable refs | None during apply. |
| Consumes | Existing `updater-build-artifact`, uv 0.11.32 target-install layout, frozen dependency metadata, and the current runtime-prune verifier. |
| Produces | Native and OCI runtime closures with no installer-generated command shim or interpreter-path byte. |
| Dependencies | `implement-operations-foundation-and-isolated-validation` pauses candidate assembly until this correction passes exact-head Development Actions, is synchronized/archived, and a separate acceptance-refresh change closes same-product, dual-identity remote targeted evidence; Operations then separately rebinds its frozen product receipt. |
| Deliverables | Two exact implementation/test files and this strict-valid delta. |
| Acceptance | Focused positive/negative/path-independence tests in exact-head Development Actions; clean residue/diff; acceptance-free product identity plus exact-compatible acceptance-control identity for the separate remote targeted refresh; subsequent Operations cross-checkout Updater byte-and-mode equality. |
| Non-goals | No supported Updater CLI, module, dependency, lock, Archive, API, schema, acquisition, scheduling, activation, or product behavior change. |
| Operations deferred | Release, registry, deployment, activation, host/service/public-route mutation, scheduling, cutover, and legacy retirement. |
| Stop/rollback conditions | Stop on edits outside the writable set, incomplete or ambiguous generated-file ownership, `RECORD` invalidity, imported-module deletion, surviving root installer scripts, behavior/dependency drift, or external mutation need. |

## ADDED Requirements

### Requirement: Packaged Updater runtimes SHALL exclude installer command shims

After dependency and wheel installation, the native runtime install root and
OCI `/opt/runtime` SHALL contain no direct `bin` child. The runtime-prune
owner SHALL admit only a real, non-linked installer-script subtree whose
regular files are exactly and uniquely named by safe `bin/**` rows in the
installed distributions' `RECORD` files. It SHALL delete those generated
files and directories, remove only their matching `RECORD` rows, preserve
every other installed byte and row, and then reverify the complete remaining
runtime metadata. A symlink, special file, unsafe path, unrecorded file,
duplicate owner, missing recorded file, or residual direct `bin` child SHALL
fail closed.

Admission and deletion SHALL remain bound to opened directory and file
identities. Before the first unlink, the helper SHALL rescan the complete
subtree through non-following directory descriptors, atomically isolate the
admitted `bin` tree under one collision-free internal quarantine name, and
revalidate its device, inode, type, mode, link count, size, digest, and stable
timestamps as applicable. A replaced directory, file, hard link, recreated
public `bin`, or pre-existing/transient quarantine residue SHALL fail without
following an external path or deleting either an unadmitted replacement or an
earlier admitted file. A pre-delete failure SHALL restore the isolated tree to
`bin` when and only when the public name is still absent and the quarantined
identity remains owned.

The supported native `bundle_root/bin/bgmss-updater` launcher is created
outside this pruned install root and SHALL remain unchanged. The OCI runtime
continues to invoke the package module directly. No absolute build, checkout,
cache, virtual-environment, or interpreter path SHALL enter either published
runtime through an installer command shim.

#### Scenario: A dependency installer emits a console script
- **WHEN** uv installs `bin/jsonschema` beneath either admitted runtime root and its exact digest/size row appears in one distribution `RECORD`
- **THEN** pruning removes that generated script and row, removes the now-empty direct `bin` directory, and verifies every remaining `RECORD` byte
- **AND** the supported native launcher and importable `jsonschema` package remain present

#### Scenario: Two interpreter roots differ
- **WHEN** otherwise identical producer-shaped runtime trees contain installer scripts whose shebangs name two distinct absolute Python paths
- **THEN** their independently pruned runtime inventories and bytes are identical and contain neither path

#### Scenario: Installer-script ownership is not closed
- **WHEN** direct `bin` contains a symlink, special or unrecorded file, a duplicate-record owner, an unsafe path, or a `RECORD` row whose file is absent or mismatched
- **THEN** pruning fails without accepting or publishing a runtime

#### Scenario: An admitted installer entry is replaced before deletion
- **WHEN** a file, hard link, or intermediate directory is replaced after admission or after quarantine but before the first unlink
- **THEN** descriptor-relative identity revalidation rejects the tree, preserves every not-yet-deleted admitted file and every replacement, does not touch an external sentinel, and leaves no quarantine residue after safe restoration

#### Scenario: A pruned runtime retains an installer directory
- **WHEN** runtime verification observes any direct `bin` child or internal installer quarantine residue after pruning
- **THEN** verification rejects the runtime even if all imported Python packages remain valid
