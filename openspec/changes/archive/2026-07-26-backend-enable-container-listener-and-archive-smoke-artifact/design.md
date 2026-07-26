## Context

`app.RunWithOptions` already accepts an address and opens it with `net.Listen`.
Only `cmd/api` fixes that address to loopback. Backend artifact smoke currently
uses `--network container:<api>`, which proves loopback health but not the
cross-container path required by Compose. The binary export stage also emits
only `bgmss-api`, although the accepted `cmd/archive-smoke` is required by the
one-shot producer. The pinned BuildKit OCI exporter emits a pure OCI layout
without Docker's compatibility `manifest.json`; GitHub's Docker Engine 28
therefore routes the normalized archive through its legacy importer and fails
at `blobs/json`, although Docker Engine 29 loads the same archive.

## Change Boundary

| Field | Declaration |
|---|---|
| Status | Product prerequisite, local and uncommitted until acceptance. |
| Owner | Backend implementation subagent. |
| Writable paths | Exact API command/test, Backend Dockerfile/build tree, inventory lines in `backend/scripts/check.sh`, and this change. |
| Read-only protected inputs | Internal runtime/server/archive implementation, accepted Archive smoke source, contracts, locks, other components, harness/CI, refs/remotes, hosts, and production. |
| Deletion complement | No tracked deletion; only owned ignored artifact output cleanup. |
| Mutable refs | None during apply. |
| Consumes | Existing address-accepting app runtime and deterministic Backend artifact pipeline. |
| Produces | Validated listener policy, bridge smoke, a load-compatible OCI-media-type archive, and two-executable bundle metadata. |
| Dependencies | Go standard library only; accepted toolchain/artifact identities. |
| Deliverables | Production code/tests and deterministic artifact changes. |
| Acceptance | CLI negatives, full Backend gates, repeated artifact builds, bundle/rootfs inspection, bridge smoke, Contracts verification, residue. |
| Non-goals | Route semantics, app/server refactor, new dependency, Compose, host ports, release/deploy. |
| Operations deferred | Host topology, Nginx, systemd, secrets, monitoring installation, activation/cutover. |
| Stop/rollback conditions | Stop on protected overlap, behavioral drift, unsafe listener admission, cross-container failure, nondeterminism, or external mutation. |

## Decisions

### Parse a narrow listener value at the command boundary

The command SHALL use a private testable parser based on a dedicated
`flag.FlagSet`. `-listen-address` defaults to `127.0.0.1:8080`. The host must
be an IP literal for which `net.IP.IsLoopback()` is true or
`net.IP.IsUnspecified()` is true, with no IPv6 zone and a numeric port in
`1..65535`. This admits `127.0.0.1`, `::1`, `0.0.0.0`, and `::` in their valid
host:port syntax while rejecting DNS names and interface-specific/public IPs.
The existing required archive root and optional update-status arguments remain
semantically unchanged. Any parser failure is mapped to a fixed single-line
error that never reflects raw argument bytes, so oversized or newline-bearing
input cannot amplify or inject command logs.

### Prove bridge reachability without host exposure

Artifact smoke SHALL create a uniquely named user-defined internal bridge after
proving no same-name network/container exists. The API starts with
`-listen-address 0.0.0.0:8080`; a separate pinned helper container on that
bridge probes the API container by its exact container name. No `-p`,
`--publish`, host network, live project network, or external request is
allowed. Creation captures immutable container/network IDs. Cleanup rechecks
the reusable name, per-run ownership label, and immutable ID together, then
deletes only by ID. The first post-load image ID is captured before further
inspection; cleanup never forces image removal and refuses a replaced tag/ID.
Cleanup preserves the primary failure and records any ownership/residue error
as secondary evidence.

### Export two binaries, ship only one in the runtime image

The BuildKit binary stage SHALL export same-target, `CGO_ENABLED=0`,
trimpath/build-id-normalized `bgmss-api` and `archive-smoke`. The deterministic
tar bundle contains:

```text
bin/bgmss-api
bin/archive-smoke
metadata/build.json
```

`metadata/build.json` SHALL bump from schema version 1 to schema version 2 and
include a sorted, closed `executables` array with role, path, size, and
`sha256:` digest. Version 1 remains historical evidence but is not accepted for
new two-executable bundles. Bundle verification rejects missing, extra,
duplicate, unsafe, non-executable, or digest-mismatched members.
Checksum inventory, SBOM, and component statement continue to bind the outer
bundle and OCI bytes. The OCI runtime filesystem and entrypoint remain
API-only.

### Preserve OCI media types and add exporter-owned Docker compatibility

The image build SHALL use the pinned BuildKit Docker exporter only in its
single-platform file-output mode with `oci-mediatypes=true`, the exact declared
image name, disabled provenance/SBOM, fixed source epoch, and rewritten
timestamps. This preserves OCI index, manifest, config, and layer media types
while allowing the pinned exporter and its vendored containerd archive writer
to emit the Docker-compatible `manifest.json`; project code SHALL not invent
that compatibility format.

The raw exporter tar is an untrusted intermediate. A repository-owned Go
admitter SHALL extract it only into a new owned temporary directory with
bounded total/member sizes and member count. It SHALL reject absolute,
non-normalized, duplicate, linked, PAX/xattr, device, FIFO, sparse, or otherwise
unsupported entries. The closed layout permits only `oci-layout`, `index.json`,
`manifest.json`, `blobs/sha256/<64 lowercase hex>`, and their required
directories. Inspection SHALL require OCI layout version `1.0.0`, one exact
target graph, no orphan/extra blob, and one strict compatibility record whose
`Config`, ordered `Layers`, and sole `RepoTags` value match the inspected OCI
graph and declared image name. The runtime user gate SHALL parse a numeric UID
and reject every zero encoding, including leading-zero forms, rather than only
matching the literal string `0`. Accepted files/directories are materialized as
`0444`/`0555`, then the existing sorted epoch-zero USTAR normalizer produces
the final `.oci.tar`; no raw exporter header can affect distributed bytes.

## Dependency Direction

```text
cmd/archive-smoke source ─┐
cmd/api listener parser ──┼─> Backend deterministic artifact
existing app runtime ─────┘             ↓
                              Operations consumes bytes
```

## Risks / Trade-offs

- Binding wildcard inside the container is necessary for bridge traffic; host
  exposure remains separately constrained by Operations to loopback.
- Adding a second binary increases the bundle but not the resident API image.
- The Docker exporter is used only to obtain its maintained compatibility
  record. Explicit OCI media types and closed graph verification prevent a
  silent conversion to an opaque Docker-only artifact.
- The explicit address allowlist excludes unusual interface-specific binds,
  which prevents accidental exposure and keeps topology decisions operations-owned.

## Migration Plan

1. Implement and test the CLI parser with unchanged default.
2. Extend the deterministic binary export and bundle verifier.
3. Replace namespace-sharing smoke with a dedicated internal bridge.
4. Export and strictly admit the closed OCI-media-type layout plus exact Docker
   compatibility record; add unsafe/tamper/graph mismatch negatives.
5. Run complete dirty-worktree Backend source, pure artifact, and static policy
   gates; hand the exact unstaged implementation to the main agent.
6. Main agent audits and commits the implementation candidate, then runs two
   clean-attested artifact builds, bridge smoke, and Contracts verification.
7. On success the main agent syncs/archives/commits lifecycle state and
   rebuilds integrated artifacts; on failure it returns a bounded correction
   to the Backend owner.
