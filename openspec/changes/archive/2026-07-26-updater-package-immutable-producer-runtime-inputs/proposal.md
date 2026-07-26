## Why

The production `produce` command requires shared Contracts and the governed
display/staff-set catalog, but neither the Updater OCI image nor its native
runtime bundle contains those inputs. A deployment would therefore need a
mutable source checkout or an ad-hoc copy assembled by Operations. Contracts
now defines the exact 42-file producer runtime authority; Updater must package
that authority and its own two catalog documents into the accepted artifact.

## What Changes

- Extend the attested Updater source snapshot with the exact Contracts
  producer-runtime manifest, its 42 declared source blobs, and exactly
  `display-v1.yaml` plus `staff-sets-v1.yaml`.
- Embed identical read-only producer inputs in the native runtime bundle and
  OCI image under fixed `/opt/bgmss/producer/**` paths.
- Add canonical producer-input metadata binding the Contracts manifest digest,
  file-set digest/count/size, both catalog byte records, canonical
  `catalogConfigDigest`, and accepted `commonCommit`.
- Fix the metadata shape, bundle/image root mappings, and the three OCI label
  keys so native/OCI/offline verification has one closed interpretation.
- Supply `producerRuntimeInputsManifestSha256` to the Contracts statement
  emitter so the component statement includes
  `contracts/producer-runtime-inputs-v1`.
- Bump the native runtime bundle and outer build metadata formats to v2.
- Export the image through the pinned Docker exporter with explicit OCI media
  types and strictly verify its exporter-owned Docker compatibility record so
  Docker Engine 26/28 can load the normalized artifact.
- Extend artifact verification and smoke to prove exact embedded bytes,
  permissions, image labels, source-free `contract-check`, and catalog loading
  without running acquisition, `produce`, activation, or a scheduler; bind
  cleanup to immutable container/image identities.

## Capabilities

### New Capabilities

- `updater-packaged-producer-inputs`: define the immutable built-in Contracts
  and catalog inputs exposed by the one-shot Updater artifact.

### Modified Capabilities

- `updater-build-artifact`: make the native bundle and OCI image self-contained
  for producer contract/config inputs and bind them in artifact evidence.

## Impact

| Field | Declaration |
|---|---|
| Status | Product artifact prerequisite; apply waits for strict validation, main-agent approval, and the accepted Contracts runtime manifest. |
| Owner | One Updater implementation subagent; main agent specifies, audits, accepts, and performs lifecycle work. |
| Writable paths | `updater/Dockerfile`, `updater/build/**`, and this change's task/lifecycle paths. |
| Read-only protected inputs | `contracts/artifacts/producer-runtime-inputs-v1.json` and its 42 declared files; `updater/config/catalog/display-v1.yaml`; `updater/config/catalog/staff-sets-v1.yaml`; all Updater product source/config/locks outside build paths; Backend/Frontend/acceptance/CI/operations; remotes, hosts, production. |
| Deletion complement | None; generated output remains confined to accepted ignored Updater build roots and guarded cleanup. |
| Mutable refs | Current local branch only after main-agent acceptance; no remote ref during apply. |
| Consumes | Accepted Contracts producer-runtime manifest/statement rule, two governed catalog files, current Updater package/runtime artifact builder, Python 3.14.6, uv 0.11.32, Buildx 0.34.1, BuildKit 0.27.1. |
| Produces | Native bundle and Docker-load-compatible OCI-media-type archive with an exact immutable producer subtree, canonical metadata, labels, statement binding, and source-free smoke evidence. |
| Dependencies | `contracts-define-producer-runtime-input-manifest` accepted and locally available; existing Updater build artifact. No new library/lock. |
| Deliverables | Snapshot/packaging/Docker changes, metadata v2, verification and comprehensive artifact tests/smoke. |
| Acceptance | Attested-copy and unsafe/archive-graph negatives; full Python source and artifact tests while dirty; then, from the committed clean candidate, two byte-identical builds, Engine 26/28 image load, native/OCI inventory and mode/digest comparison, source-free embedded contract/catalog smoke, Contracts statement/compatibility verification, strict OpenSpec/diff/residue. |
| Non-goals | Changing Contracts or catalog authority, changing producer/acquisition semantics, including `archive-smoke`, running `produce`, real acquisition, scheduling, activation, release, deployment, or host mutation. |
| Operations deferred | Backend `archive-smoke` mounting, output/status/archive paths, Compose/timer/secrets, release assembly, transfer, activation and cutover. |
| Stop/rollback conditions | Stop on unavailable/unaccepted manifest, authority drift, partial/broadened copy, source/lock change need, nondeterminism, runtime-input writeability, image/bundle mismatch, external request, unexpected path, or external mutation. |

This is a `NEW_CAPABILITY`; existing producer semantics are unchanged. The
change touches no external state and authorizes no push, release, deployment,
or activation. Apply begins only after strict validation and main-agent review.
