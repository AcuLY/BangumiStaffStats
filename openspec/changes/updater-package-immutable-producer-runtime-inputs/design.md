## Context

The artifact source attestation already reads exact Git blobs for the entire
candidate but snapshots only Updater package/build inputs. The native bundle
contains the installed package and launcher; the OCI build context contains
only Updater files. `smoke.py` mounts a live Contracts tree for
`contract-check`. The accepted production CLI therefore cannot run from
artifact bytes alone.

## Change Boundary

| Field | Declaration |
|---|---|
| Status | Updater artifact change; local and uncommitted until accepted. |
| Owner | Updater implementation subagent. |
| Writable paths | Updater Dockerfile/build helpers/tests and this change. |
| Read-only protected inputs | Runtime manifest/declared Contracts bytes, two catalog YAMLs, Updater source/config/locks, other components/harness/CI/operations, external state. |
| Deletion complement | No tracked deletion; only owned ignored output cleanup. |
| Mutable refs | None during apply. |
| Consumes | Exact attested runtime authority and current deterministic artifact pipeline. |
| Produces | Identical producer input subtree in native bundle and OCI, metadata/labels/evidence, source-free smoke. |
| Dependencies | Accepted Contracts manifest/statement rule; existing frozen build toolchains. |
| Deliverables | Artifact implementation/tests and handoff evidence. |
| Acceptance | Full artifact tests, two builds, byte/mode/rootfs/label/statement comparison, embedded runtime smoke, residue. |
| Non-goals | Product producer changes, authority edits, new dependency, real produce/acquisition, operations. |
| Operations deferred | Archive-smoke/output mounts, scheduler, paths/users/secrets, release/deploy/activate/cutover. |
| Stop/rollback conditions | Stop on dirty overlap, manifest ambiguity/drift, protected edit, nondeterminism, broadened input, runtime write, or external mutation. |

## Decisions

### Copy only attested Git blobs selected by the Contracts manifest

The build SHALL strict/canonical-parse
`contracts/artifacts/producer-runtime-inputs-v1.json` from the candidate's
attested Git blobs, verify its logical digest/count/total/set digest, and select
exactly its 42 `100644` records. It SHALL compare every declared digest/size to
the attested blob, not the mutable live file. It SHALL separately select only
the two exact tracked Catalog YAML blobs. Missing, extra, duplicate, reordered,
unsafe, symlink-mode, or mismatched records stop before the build context.

The normalized source snapshot contains:

```text
producer-input-authority/producer-runtime-inputs-v1.json
producer/contracts/**          # exactly 42 manifest records
producer/catalog/display-v1.yaml
producer/catalog/staff-sets-v1.yaml
```

No README, OpenAPI, API schema/golden, Contracts tool, test source, credential,
environment file, or ignored live file is admitted.

### Use fixed bundle and image paths

The native runtime bundle v2 contains its existing launcher/site-packages plus:

```text
producer/contracts/**
producer/catalog/display-v1.yaml
producer/catalog/staff-sets-v1.yaml
producer/metadata/producer-runtime-inputs-v1.json
producer/metadata/producer-inputs.json
```

The OCI image contains identical logical bytes below
`/opt/bgmss/producer/`. OCI producer files are owned by `65532:65532` with
mode `0444`; its directories are `0555`. Native-tar producer members retain
the existing deterministic archive owner `0:0`, but producer files are `0444`
and producer directories are `0555`; unrelated native members retain the
existing normalized modes. The runtime root remains read-only.

The exact OCI labels are:

```text
org.bangumi-staff-stats.producer-runtime-inputs-manifest-sha256
org.bangumi-staff-stats.catalog-config-digest
org.bangumi-staff-stats.common-commit
```

The first two values include the `sha256:` prefix; the common-commit value is
the lower-case 40-hex Git object name. No label contains a host path or
timestamp.

Production arguments will later use:

```text
--contracts-root /opt/bgmss/producer/contracts
--catalog-config /opt/bgmss/producer/catalog/display-v1.yaml
```

### Emit canonical producer-input metadata

`producer/metadata/producer-inputs.json` is canonical JSON with a trailing LF,
rejects unknown or duplicate keys, and has exactly this schema:

```json
{
  "catalog": {
    "catalogConfigDigest": "sha256:<64 lower-hex>",
    "files": [
      {
        "path": "catalog/display-v1.yaml",
        "sha256": "sha256:<64 lower-hex>",
        "size": 1
      },
      {
        "path": "catalog/staff-sets-v1.yaml",
        "sha256": "sha256:<64 lower-hex>",
        "size": 1
      }
    ],
    "root": "catalog"
  },
  "commonCommit": "<40 lower-hex>",
  "contracts": {
    "fileCount": 42,
    "fileSetDigest": "sha256:<64 lower-hex>",
    "manifestPath": "metadata/producer-runtime-inputs-v1.json",
    "manifestSha256": "sha256:<64 lower-hex>",
    "root": "contracts",
    "totalSize": 1
  },
  "roots": {
    "native": "producer",
    "oci": "/opt/bgmss/producer"
  },
  "schemaVersion": 1
}
```

The example positive sizes are placeholders for positive integers; emitted
values come from the admitted blobs. Catalog records are in the shown fixed
bytewise path order. `catalogConfigDigest` is computed by the built Updater
from the embedded pair and embedded catalog schemas.

`commonCommit` comes only from
`contracts/goldens/archive/vectors/data-version.json` at
`input.commonCommit`, after strict parsing of that admitted manifest record.
That vector's `input.catalogConfigDigest` describes the vector fixture and
SHALL NOT be substituted for, or required to equal, the digest of the packaged
Updater catalog pair.

The outer build metadata format and native runtime bundle format become v2.
`bundle-metadata.json` adds exactly
`producerInputs: {path, sha256}`, where `path` is
`producer/metadata/producer-inputs.json`. Outer
`build-metadata.json` adds exactly
`producerInputs: {bundlePath, imagePath, sha256}` and adds full `sha256:`
values at `inputs.producerInputsSha256` and
`inputs.producerRuntimeInputsManifestSha256`. The image path is
`/opt/bgmss/producer/metadata/producer-inputs.json`. The component statement
uses the latter input to add the logical manifest authority. Compatibility
assembly therefore binds the producer inputs without changing its
three-component model.

### Preserve OCI media types and add Docker load compatibility

GitHub's Docker Engine 28 and the isolated validation host's Docker Engine 26
cannot load the prior pure `type=oci` tar: their classic loader falls into the
legacy `blobs/json` path because no Docker compatibility `manifest.json`
exists. The image build SHALL therefore use the pinned single-platform Docker
exporter with `oci-mediatypes=true`, exact tag, normalized timestamps, and
disabled provenance/SBOM attachments. The pinned exporter, not project code,
owns `manifest.json`.

The raw exporter tar SHALL pass a bounded safe admission path before
normalization. Verification requires layout version `1.0.0`, one exact target,
closed descriptor blobs with no orphan/extra member, and one strict
compatibility record whose config, ordered layers, and sole tag match the OCI
graph and declared reference. The existing OCI producer-tree and label
verification then consumes the same graph.

### Smoke the embedded inputs without producing data

Artifact smoke SHALL:

1. verify the native bundle inventory, modes, metadata, and declared digests;
2. inspect the OCI rootfs and labels for byte-identical producer inputs;
3. run `contract-check` inside the read-only, non-root, networkless image using
   only `/opt/bgmss/producer/contracts`; and
4. run a bounded isolated Python probe from the installed package that loads
   the embedded catalog pair against the embedded schemas and returns the
   metadata `catalogConfigDigest`; and
5. give every smoke container a per-run ownership label, refuse a pre-existing
   name, capture its immutable ID, and remove it only after the current
   name/label/ID tuple proves it belongs to that exact run; and
6. capture the first post-load image ID, refuse a replaced tag/ID, and remove
   only the immutable loaded image without force.

It SHALL not mount product source/Contracts/config into the container, run
`produce`, acquire data, create `current.json`, activate an Archive, or contact
the network. A name collision or ownership-label mismatch SHALL fail without
stopping or deleting the foreign container. The host Contracts root remains a
read-only control-plane input only for outer statement verification.

## Dependency Direction

```text
Contracts runtime manifest ─┐
Updater catalog YAMLs ──────┼─> attested Updater artifact ─> Operations
Updater built package ──────┘
```

## Risks / Trade-offs

- The image grows by about 1.8 MB to become source-checkout-independent.
- Indexed negative fixtures are included because the Contracts index is a
  closed authority; accepting only currently executed cases would create an
  unsafe partial copy.
- Catalog changes now require a new Updater artifact, matching the existing
  no-hot-reload product contract.

## Migration Plan

1. Wait for and verify the accepted Contracts runtime manifest.
2. Extend attested snapshot and focused tests.
3. Extend native/OCI packaging, metadata v2, labels, and verification.
4. Switch the pinned image export to Docker-load-compatible OCI media types
   and validate its closed compatibility graph.
5. Replace runtime mount-based smoke with embedded input smoke.
6. Run dirty-worktree source, pure, synthetic-artifact, and static policy
   gates; hand the exact unstaged implementation to the main agent.
7. Main agent audits and commits the implementation candidate, then runs the
   two clean-attested native/OCI builds and complete Contracts/smoke gates.
8. On success the main agent syncs/archives/commits lifecycle state and
   rebuilds integrated artifacts; on failure it returns a bounded correction
   to the implementation owner.
