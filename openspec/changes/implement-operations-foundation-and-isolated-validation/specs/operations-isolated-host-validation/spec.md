# operations-isolated-host-validation Specification

## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Investigated: complete; specified: complete only after strict validation and main-agent approval; implemented: no; verified: no; committed: no; pushed: no; released: no; deployed: no. |
| Owner | Operations isolated-host validation apply group. |
| Writable paths | Repository: `operations/validation/**`, `operations/test/validation/**`, and generated ignored `operations/.tmp/**`. External after successful preflight: only newly created paths below `myserver:/srv/bgmss-ops-validation/**`; Compose project `bgmss_ops_validation` services `api`, `updater`, `prometheus`; project-labeled containers/network; no named volumes; the two artifact-declared Backend/Updater load tags; their two aliases `localhost/bgmss-ops-validation-{api,updater}:<accepted-product-revision>-amd64`; the exact pinned upstream Prometheus digest reference; and alias `localhost/bgmss-ops-validation-prometheus:<reviewed-version>-amd64`. All six image references are sealed and proven absent before load/pull. For each of the three images the input and run evidence bind all refs, OCI manifest digest, config digest, and Docker runtime ID. API publication is exactly `127.0.0.1:19090:8080`. |
| Read-only protected inputs | All repository paths outside the listed owner paths; operations-built AMD64 release candidate/artifacts and validation Archive inputs; SSH configuration/credentials. On `myserver`: `/srv/bgmss/**`; `/srv/bgmss-v2/**`; every other `/srv/**` path; every pre-existing Compose project, container, network, image/tag, and volume; all Nginx/systemd/TLS/secret/user/firewall/cron state; public ports; legacy data/processes; and every port other than the exact validation bind. Only the six input-declared image references that preflight proves absent are excluded from the image/tag read-only set. |
| Deletion complement | No repository or pre-existing remote state. Cleanup may remove only the exact run-created path inventory; captured validation container/network IDs whose names plus project/service/run labels still match; and each exact run-created image reference only when it still resolves to the captured OCI manifest/config/runtime identity and no foreign container uses it. |
| Mutable refs | The listed repository files and ephemeral `operations/.tmp/**`; after admission, the validation root's run marker, release/data pointers, captured validation project resources, and the six exact image references/three image identities. No other image/tag, Git ref, registry/release, production/legacy ref, named volume, host service, or external configuration is mutable. |
| Consumes | Committed operations implementation; accepted clean `linux/amd64` release candidate; exact component/compatibility evidence; one accepted full inactive Archive plus an accepted minimal rollback Archive; expected app/data identities; read-only host/tool/resource snapshots. |
| Produces | Strict validation-input/result/resource schemas; transfer/render/run/cleanup entrypoints; local negative tests; canonical before/result/after evidence; and one isolated success/failure report whose highest claim is operations definitions validated in a non-live namespace. |
| Dependencies | `operations-release-assembly`, `operations-single-host-runtime`, archived authorized CI/remote development-acceptance lifecycle bundle, accepted Archive contracts/fixtures, and explicit user authorization for `myserver`. Direction is accepted candidate/runtime definitions → isolated validation; no validation observation becomes product semantics. |
| Deliverables | Exact repository owner paths, local failure tests, ephemeral sealed host evidence, and zero-residue/non-interference proof. |
| Acceptance | Exact expected host facts; no-collision before-write proof; sealed transfer; production-vs-validation render diff; image/load ownership; Compose/API/Updater/Prometheus/Frontend install checks; safe release/data switch and rollback exercise; lock/timeout/signal/failure injection; closed cleanup; after-state comparison; no residual path/project/container/network/image/port/process; protected-state seals; strict OpenSpec; exact paths; and diff hygiene. |
| Non-goals | Production activation, public preview, Nginx/systemd/TLS/user/firewall mutation, real scheduler install, real weekly acquisition, GHCR/GitHub Release/deploy execution, SLO/capacity certification, legacy traffic/routing/data/process mutation, cutover, stability observation, or retirement. |
| Operations deferred | All live-state actions listed in Non-goals plus any validation on a different host/root/project/port or reuse of an existing validation namespace. |
| Stop/rollback conditions | Stop before first write if host/tool facts drift, target root/project/service/image/tag/port/path ownership is non-empty or ambiguous, required space is insufficient, accepted inputs fail seals, or protected resources cannot be inventoried. After mutation, stop activation on any failure; restore only run-owned prior pointers, terminate only captured validation resources, preserve primary and cleanup failures, and never touch a protected resource to complete cleanup. |

## ADDED Requirements

### Requirement: Host admission SHALL be read-only, exact, and complete

Before the first remote write, validation SHALL capture one canonical preflight
for SSH host `myserver` and require expected `x86_64`/`amd64`, CentOS Stream 9,
Docker Engine 26.1.4, Docker Compose 2.27.1, Nginx/systemd presence, and
sufficient disk/inodes. It SHALL prove that
`/srv/bgmss-ops-validation` is absent, Compose project
`bgmss_ops_validation` has no resources, `127.0.0.1:19090` is free, both
artifact-declared load tags, all three validation aliases, and the pinned
Prometheus digest reference are absent, and no requested
container/network/name/label collides. It SHALL inventory and seal protected
legacy/production paths, Compose/Docker resources, listeners, Nginx/systemd
state, and process identities without reading secret contents.
The Prometheus input SHALL be exact
`prom/prometheus:v3.13.1-distroless@sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80`
and admit only its `linux/amd64` child manifest
`sha256:335b5796a6e4355530475575253f84de20b8ad07bf899f65ed218451ce4c60b4`
with descriptor size `4067`, runtime UID/GID `65532`, and no shell-dependent
command.

#### Scenario: The approved namespace is free
- **WHEN** every expected host fact and absence/collision/space/protected-state check passes
- **THEN** validation emits a sealed admitted input and may create the exact validation root

#### Scenario: A fact or resource differs
- **WHEN** architecture/tool versions drift, the root exists, the port is occupied, an image/tag/project/name collides, space is insufficient, or protected ownership cannot be proven
- **THEN** validation exits before remote mutation and preserves the read-only evidence

### Requirement: Transfer and installation SHALL bind immutable accepted bytes

The local controller SHALL create a canonical validation input that binds the
committed operations revision/tree, release-candidate/checksum identities,
exact Backend and Updater image archive references/digests plus their
artifact-declared load tags, exact validation aliases, and expected OCI
manifest/config identities, plus the exact Prometheus digest/reference/alias,
Frontend and standalone `archive-smoke` release-asset bytes with source
member/size/digest/mode, compatibility manifest, full and minimal Archive
identities, target root/project/services/port, and expected app/data results.
Transfer SHALL use a new run-owned staging directory below the validation root,
verify every checksum and closed path/mode inventory on the host, and publish
the run marker before loading an image or starting Compose. Remote rendering
SHALL differ from the production template only in the declared root, project,
API bind, release source, and validation-only evidence hooks.

#### Scenario: Accepted inputs reach the host unchanged
- **WHEN** transfer, path/mode/size/digest checks, closed inventory, compatibility, and template-diff policy pass
- **THEN** the host may load exactly the captured image archives and install the versioned Frontend/Archive inputs

#### Scenario: Transfer or rendering is unsafe
- **WHEN** a file is missing/extra/linked/escaping/mutable, a digest changes, or rendering alters service/security/resource semantics beyond the declared validation substitutions
- **THEN** no image or Compose resource starts and cleanup considers only the already recorded run-owned paths

### Requirement: Validation runtime SHALL remain isolated and loopback-only

The run SHALL use only `/srv/bgmss-ops-validation`, Compose project
`bgmss_ops_validation`, services `api`, `updater`, and `prometheus`, one
run-owned project network, bind-mounted run-owned state, no named volume, and
API publication `127.0.0.1:19090:8080`. API and Prometheus SHALL use the same
security/resource semantics as production; Updater SHALL remain one-shot.
No validation service SHALL join a pre-existing network, mount
`/srv/bgmss`, `/srv/bgmss-v2`, `/etc`, Docker socket, host secrets, or source,
publish metrics/public ports, start Nginx/systemd, or contact a legacy process.

#### Scenario: The isolated project starts
- **WHEN** the admitted images, inactive Archive, rendered Compose, and exact port are used
- **THEN** only captured validation resources appear and every mount/network/publication remains within the declared boundary

#### Scenario: Compose would escape containment
- **WHEN** rendering or runtime inspection finds another root/project/network/volume/service/port/mount or a host integration action
- **THEN** the run stops, records the mismatch, and starts no further service

### Requirement: Success-path validation SHALL exercise artifact-only operation

With product source absent, validation SHALL load the two accepted AMD64
images, install and hash the Frontend release, run Updater `doctor` and
embedded `contract-check`, start API on the minimal accepted Archive, and
verify loopback `/livez`, `/readyz`, expected minimal `dataVersion`,
`bgmss_build_info` version/commit, a minimal typed query, and Prometheus scrape
of the API. It SHALL then activate the accepted full inactive Archive through
the run-owned wrapper, verify the new exact `dataVersion`, status/event,
readiness, metrics, query, and Updater peak-memory/no-OOM evidence within the
initial 640 MiB cap, roll back to the compatible minimal pointer and
verify again, and finally re-activate the full version. Frontend symlink
installation/rollback SHALL be verified by exact bytes without changing host
Nginx. The memory observation SHALL be labeled isolated migration evidence,
not a formal development benchmark; an OOM or cap breach SHALL fail validation
and block production activation pending specification review.

#### Scenario: Candidate and two Archives operate in isolation
- **WHEN** all artifact-only health, update-tool, static, scrape, activation, rollback, and re-activation checks pass
- **THEN** the canonical result records every expected app/data/resource identity and marks isolated validation successful

#### Scenario: Source, external service, or manual repair is required
- **WHEN** success requires source checkout, a production/legacy path, public route, host daemon change, undeclared download, or manual byte edit
- **THEN** validation fails and cannot claim the operations definitions passed

### Requirement: Failure paths SHALL preserve the last accepted validation state

Local tests and safe run-owned remote exercises SHALL cover lock contention,
invalid release manifest/checksum/platform, insufficient-space admission,
interrupted staging, foreign replacement, updater no-change/failure/timeout,
invalid or incompatible Archive, post-switch readiness failure, application
install failure, Frontend switch failure, rollback failure, SIGTERM, and
cleanup failure. Before-switch failures SHALL leave the accepted state
unchanged. Post-switch failures SHALL restore and verify the captured previous
run-owned app or data state. If restoration also fails, the controller SHALL
stop looping, preserve both states and primary/secondary evidence, and perform
only safe process containment.

#### Scenario: A candidate fails after a run-owned switch
- **WHEN** injected readiness or integrity failure occurs after the validation pointer/link/reference changed
- **THEN** the prior captured validation state is restored and verified before the failure is returned

#### Scenario: Rollback or cleanup also fails
- **WHEN** a foreign replacement, permission fault, or second readiness failure prevents safe restoration/removal
- **THEN** the original failure remains primary, secondary faults are recorded, unknown state is preserved, and no protected resource is used as compensation

### Requirement: Cleanup SHALL prove identity before every removal

The controller SHALL capture immutable container/network IDs and their
expected name plus project/service/run labels at creation, and each loaded
Backend/Updater image's two tags and Prometheus image's digest reference/alias,
plus each image's OCI manifest digest, config digest, and Docker runtime ID,
before container start. On success or failure it SHALL stop/remove
only resources whose full recorded identity still matches, never use force for
an image, refuse replacement/shared-tag deletion, and remove files only from the closed
run-created path manifest after verifying exact root, device, parent identity,
non-symlink components, marker, and unchanged object identity. Files SHALL be
removed individually and directories bottom-up only when empty; unknown
entries SHALL stop cleanup. The validation root itself SHALL be absent after a
clean run.

#### Scenario: All run-owned state is unchanged
- **WHEN** cleanup identities match the captured resources and closed path inventory
- **THEN** every validation process/container/network/image/path/listener is removed and no named volume ever exists

#### Scenario: A name or path was replaced
- **WHEN** a Docker name/tag, inode, marker, device, label, ID, or directory content no longer matches
- **THEN** cleanup preserves the replacement/unknown object and reports residue instead of deleting it

### Requirement: Final evidence SHALL prove non-interference without claiming deployment

After cleanup, validation SHALL repeat the preflight inventory and compare
protected path metadata, Compose/Docker resources, listeners, Nginx/systemd
state, and legacy process identities. It SHALL validate one canonical result
binding input/result/resource digests, commands, versions, durations,
success/failure/cleanup, and zero protected mutation/residue. Secret values
and unrestricted environment/process arguments SHALL not enter evidence. A
green result SHALL state only that the committed operations definitions and
accepted AMD64 candidate passed isolated validation; `released` and `deployed`
remain false.

#### Scenario: Cleanup and non-interference are complete
- **WHEN** the result validates, validation resources are absent, and every protected before/after seal matches
- **THEN** isolated validation may be marked verified while production activation and deployment remain unstarted

#### Scenario: Residue or protected drift remains
- **WHEN** any validation path/project/container/network/image/listener/process remains or a protected seal changes
- **THEN** the result is failed, exact residue is reported, and no production-readiness or deployment claim is made
