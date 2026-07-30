## Why

The API artifact is healthy only when its probe shares the API container's
network namespace because `cmd/api` hard-codes `127.0.0.1:8080`. A normal
Compose bridge cannot forward traffic to a process bound to container
loopback. In addition, the updater's required `archive-smoke` executable is
validated from source but is absent from the Backend artifact, so a release
cannot provide that accepted producer gate without rebuilding Backend source.
Fresh GitHub Actions evidence also showed that Docker Engine 28 cannot load
the current pure OCI-layout tar and falls back to the legacy importer, while
Docker Engine 29 accepts the same bytes. The distributed image therefore needs
an exact compatibility record without abandoning OCI media types or relying on
the validating host's newest Engine behavior.

## What Changes

- Add a strict `-listen-address` API flag whose default remains
  `127.0.0.1:8080`, while an explicit `0.0.0.0:8080` enables container bridge
  reachability.
- Accept only IP-literal loopback or unspecified listeners with a valid
  nonzero port; reject hostnames, interface-specific addresses, zones, empty
  values, malformed values, and trailing arguments through a bounded
  non-reflecting error envelope.
- Change Backend artifact smoke to use a unique internal bridge and probe the
  API from a separate container, without publishing a host port; bind cleanup
  to immutable container/network/image identities.
- Build `archive-smoke` for the same target and include it with `bgmss-api` in
  the deterministic Backend binary bundle.
- Bind both inner executables by path, role, size, and SHA-256 in bundle
  metadata schema v2 while keeping `archive-smoke` out of the API runtime
  image.
- Export the single-platform image through the pinned Docker exporter with
  explicit OCI media types, strictly admit its closed OCI layout plus generated
  Docker compatibility manifest, and preserve the normalized `.oci.tar`
  distribution contract.

## Capabilities

### New Capabilities

- `backend-container-listener`: define the safe listener configuration accepted
  by the API command and prove bridge reachability.

### Modified Capabilities

- `backend-build-artifact`: make the Backend artifact provide the accepted
  `archive-smoke` producer gate as an independently digest-bound executable.

## Impact

| Field | Declaration |
|---|---|
| Status | Product prerequisite; apply is blocked until all artifacts are strict-valid and approved. |
| Owner | One Backend implementation subagent; main agent specifies, audits, accepts, and performs lifecycle work. |
| Writable paths | `backend/cmd/api/main.go`, new `backend/cmd/api/main_test.go`, `backend/Dockerfile`, `backend/build/**`, persistent-inventory lines in `backend/scripts/check.sh`, and this change's task/lifecycle paths. |
| Read-only protected inputs | `backend/internal/**`, `backend/cmd/archive-smoke/**`, modules/locks, Contracts, Updater, Frontend, acceptance harness, CI changes, remotes, hosts, and production. |
| Deletion complement | None; generated output is confined to existing ignored Backend artifact roots and removed by their accepted cleanup. |
| Mutable refs | Current local branch only after main-agent acceptance; no remote ref during apply. |
| Consumes | Accepted HTTP runtime, Archive smoke command, Backend artifact builder, component statement contract, Go 1.26.5, Buildx 0.34.1, and BuildKit 0.27.1. |
| Produces | Strict listener CLI, bridge-level smoke evidence, a Docker-load-compatible OCI-media-type image archive, and a deterministic Backend bundle containing two digest-bound executables. |
| Dependencies | Accepted `backend-http-runtime`, `backend-archive-consumer`, and `backend-build-artifact`; no new library. |
| Deliverables | Parser tests, Docker/build/bundle changes, smoke and policy tests, manifest/evidence updates generated only in artifact output. |
| Acceptance | Focused CLI tests; full Backend check/race/vet and artifact unit/policy tests while dirty; strict exporter-layout/unsafe-archive/compatibility-manifest negatives; then, from the committed clean candidate, two byte-identical builds, Docker image load, internal-bridge smoke, rootfs/bundle inspection, Contracts component verification, and exact residue/diff checks. |
| Non-goals | API route/response changes, statistics changes, dependency updates, public host binding by default, host port publication, Compose, release, deployment, activation, or host mutation. |
| Operations deferred | Host `127.0.0.1:18080` publication, resource limits, secrets, Nginx/systemd/timer configuration, deployment and cutover remain operations-owned. |
| Stop/rollback conditions | Stop on default behavior drift, an address-policy ambiguity, runtime-image inclusion of `archive-smoke`, nondeterministic bytes, bridge probe failure, source/lock change need, unexpected path, or external mutation. |

The listener flag is a `NEW_CAPABILITY`; the default local listener and every
existing HTTP behavior are `PRESERVE_ORACLE`. This change touches no external
repository or state and authorizes no push, release, deployment, or activation.
