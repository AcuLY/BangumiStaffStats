## Context

Development produced deterministic Backend, Updater, Frontend, and Contracts
artifact machinery. The authorized acceptance closure did not materialize or
retain the formal component-artifact set: CI built ephemeral AMD64 artifacts,
while the formal Darwin/ARM64 matrix was unexecuted. Operations must not invent
those byte identities and must keep two authorities separate:

1. the frozen product revision/tree and build definitions bound by the
   authorized archived lifecycle evidence for
   `complete-integrated-development-acceptance`; and
2. the later Operations controller revision/tree that assembles, releases,
   deploys, and validates that product.

The production guide reserves a single-host topology with host Nginx/systemd,
Compose API/Prometheus, and a one-shot Updater. The current authorization
allows repository definitions and one isolated host validation, but not live
activation. `myserver` currently presents the expected CentOS Stream 9 AMD64,
Docker Engine 26.1.4, and Compose 2.27.1 profile; every fact is rechecked and
sealed before a write because host state may drift.

The exact current external scopes are:

| State | Root / identity | Current authorization |
|---|---|---|
| Repository definitions | `operations/**`, three named workflows, one `.gitignore` line | Create, test, review, and commit. |
| Local generated evidence | `operations/.tmp/**` | Create and remove by run ownership. |
| Isolated validation | `myserver:/srv/bgmss-ops-validation`, project `bgmss_ops_validation`, API `127.0.0.1:19090:8080` | Mutate only after collision preflight; clean with identity proof. |
| Reserved production | `/srv/bgmss-v2`, project `bgmss_v2`, API `127.0.0.1:18080:8080` | Name in inert definitions only; do not write or start. |
| Current legacy | `/srv/bgmss` and all current routes/services/data | Read-only and protected. |
| Host integration | Nginx, systemd, TLS, DNS, firewall, users/groups, public ports | Read/syntax-check only; do not install, reload, or alter. |
| Distribution | Git tag, GHCR, GitHub Release, Environment/secrets, deploy SSH | Define policy only; do not execute. |

### Change boundary

| Field | Declaration |
|---|---|
| Status | Investigated: complete; specified: complete after strict validation and main-agent review; implemented/verified/committed/pushed/released/deployed: no at proposal time. |
| Owner | Main agent: decisions, spec audit, coordination, final acceptance/lifecycle. Subagents: disjoint foundation/release, runtime/recovery, and isolated-validation implementation blocks when parallel benefit exceeds handoff cost. |
| Writable paths | Repository: `operations/**`, `.github/workflows/{operations,release,deploy}.yml`, exact `.gitignore` line `/operations/.tmp/`, this change, and later synchronized operations specs. External only after admission: newly created `/srv/bgmss-ops-validation/**`; project `bgmss_ops_validation` containers and exact `runtime`/`outbound` networks for services `api`, `updater`, `prometheus`; exact API bind; no named volume; two component load tags, three validation aliases, and one pinned Prometheus digest reference (six sealed image references across three images). |
| Read-only protected inputs | All product/Contracts/authority/oracle/build inputs and archived authorized acceptance evidence; `.github/workflows/ci.yml`; external refs/registries/releases/secrets. On `myserver`, every path/resource/ref except the admitted validation namespace and exact six previously absent image references, especially `/srv/bgmss`, `/srv/bgmss-v2`, current Compose/Docker state, Nginx/systemd/TLS, public listeners, and legacy processes/data. |
| Deletion complement | No tracked or pre-existing state. Local/remote cleanup is limited to a closed run-created path inventory, immutable labeled project resources, and image references still resolving to their captured manifest/config/runtime identity with no foreign consumer. |
| Mutable refs | Listed repository worktree files; isolated run marker/pointers/links; captured validation containers and two networks; exact six image references/three image identities. Commits/push/OpenSpec lifecycle are main-agent actions. No live, legacy, registry, release, tag, Environment, secret, daemon, or public-route ref is mutable. |
| Consumes | Archived authorized CI/remote development-acceptance lifecycle bundle and frozen product identity; accepted build/contracts/tool identities; Archive/current/status contracts; full inactive and minimal validation Archives; read-only host facts. The formal Darwin/ARM64 matrix remains explicitly unexecuted and is never represented as green. |
| Produces | AMD64 component/compatibility/release evidence, release/deploy policy, production-boundary definitions, recovery entrypoints/runbooks, and canonical isolated-validation/non-interference evidence. |
| Dependencies | Frozen product and Contracts → accepted-development receipt → fresh AMD64 validation candidate; for a later tag, frozen-baseline comparison → two builds of that exact tag commit → tag-release candidate/published manifest; runtime definitions → isolated validation. No reverse dependency or upstream rewrite is allowed. |
| Deliverables | Proposal's exact repository artifacts, local gates, AMD64 candidate, and isolated validation/cleanup result. |
| Acceptance | Per-spec gates plus cross-capability rendered topology, transaction, provenance, secret, negative, residue, and protected-state audits. |
| Non-goals | Product/UI/API/statistics changes; reuse of ARM64 bytes as AMD64; production activation/build; release execution; public routing; real scheduler/acquisition; SLO sign-off; migration/cutover; or legacy retirement. |
| Operations deferred | Registry/GitHub publication; Environment/secret setup; `/srv/bgmss-v2` installation/start; Nginx/systemd/TLS/DNS/firewall/users; real timer/update; public preview/cutover; observation windows; and old-stack deletion. |
| Stop/rollback conditions | Stop before first mutation on authority/identity/tool/path/project/port/image/space ambiguity. After a validation mutation, preserve primary failure, restore only captured run-owned state, conditionally clean only still-owned resources, record secondary rollback/cleanup faults, and never touch protected state to force completion. |

## Goals / Non-Goals

**Goals:**

- Rebuild the formally accepted product identity twice for `linux/amd64` and
  produce byte-identical component, compatibility, and release-candidate
  evidence.
- Define distinct validation and tag-release candidates, with a strict
  transition from the tag-bound candidate to a published manifest whose images
  are addressed only by final registry digests.
- Provide one production topology, one shared host lock, explicit install/data
  state machines, separate app/data rollback, bounded retention, and
  actionable runbooks.
- Keep ordinary operations CI read-only; isolate package/release and deploy
  authority to their exact triggers/jobs.
- Validate the committed definitions on `myserver` with a second root,
  project, loopback port, bind-mounted state, and globally closed image
  ownership.
- Finish with canonical evidence, zero run-owned residue, and no protected
  mutation.

**Non-Goals:**

- No change to PRODUCT, DESIGN, oracle behavior, product source, statistics,
  wire schemas, artifact schemas, build definitions, or development
  acceptance.
- No multi-architecture publication in v1.
- No production host build, mutable image tag, Watchtower, self-hosted Actions
  runner, or source checkout on the production server.
- No long-lived Frontend container, public Prometheus/metrics, Grafana, Loki,
  Tempo, OTel Collector, Pushgateway, Alertmanager, or node exporter.
- No installation or activation of the reserved production state in this
  change.

## Decisions

### 1. Rebuild the frozen product in two isolated local checkouts

The Operations controller reads the archived authorized acceptance receipt and
extracts its exact frozen product revision/tree
`3f585cfe0a0dd61fe783a839528fef25470a58db`/
`93e29a0c51c0305db8a43e7d029b8eaa3014a1b8`. It creates two independently owned
temporary Git checkouts below `operations/.tmp/**`, with no credentialed
remote and no push capability. Each checkout must be the exact frozen product
commit, with raw tracked bytes/modes matching Git, no dirty/untracked
non-ignored content, and no `assume-unchanged`/`skip-worktree` flags.

For current isolated validation, the accepted component entrypoints run for
`linux/amd64` in both checkouts with separate caches. The controller prepends
the exact admitted Node 24.18.0/npm 11.16.0 directory instead of accepting the
host default, fixes `DOCKER_DEFAULT_PLATFORM=linux/amd64`, and binds the
selected Buildx/BuildKit builder identities. Backend, Updater, and coordinator
smokes SHALL actually execute the generated AMD64 images, so a missing or
broken execution path is a blocking failure rather than an inferred
capability. Native AMD64 runners execute directly; a different host may use
only an exact admitted and recorded QEMU/binfmt path. Their new statements and
compatibility manifests bind the frozen product identity. The Operations
controller identity is recorded in validation-candidate control metadata, not
substituted into product evidence. No prior formal artifact root is available
to copy; any caller-supplied prior artifact identity is rejected rather than
inserted into the AMD64 candidate.

For an actual later version tag, the operations guide requires every artifact
to be built from the tag's own commit. The release workflow therefore
double-builds that exact tag commit after proving its product/build/contract
inputs remain byte-identical to the frozen baseline and every intervening path
is either the exact audited `contracts/acceptance/**` control-plane restoration
and fixes through `b56ce858733b18875df3101a423c6d1b356eed54`, the exact archived
development-acceptance lifecycle/main-spec delta, or approved
Operations/OpenSpec lifecycle. Product, build, and non-acceptance Contracts
authority blobs/modes remain byte-identical to the frozen baseline. Its
statements bind the tag commit;
it never promotes the earlier validation candidate.

Alternative considered: build the current isolated-validation candidate from
the Operations branch tip. Rejected because the current validation goal is to
produce the missing AMD64 form of the exact formally accepted product.

Alternative considered: reuse or retag the accepted ARM64 OCI archives.
Rejected because target architecture is part of the artifact contract and
runtime bytes are not interchangeable.

### 2. Use an accepted receipt and distinct candidate stages

The release control plane has four canonical closed documents:

- `accepted-development.json` is the main-agent-audited receipt derived from
  the exact archived authorized CI/remote lifecycle bundle. It binds lifecycle
  status
  `development-acceptance-closed-by-authorized-ci-and-remote-evidence`, frozen
  product identity, acceptance implementation, CI head/run, archived lifecycle
  commit, remote package/targeted counts, the narrow Linux fixture exception,
  unexecuted formal-cell inventory, cleanup/audit facts, and accepted
  build/contract digests. It records
  `priorDevelopmentArtifacts.status=not-materialized-for-authorized-closure`
  and contains no fabricated component/compatibility byte identity, formal
  result digest, or synthesized
  `development-accepted-operations-pending` verdict.
- `validation-candidate-v1.json` is local and explicitly unpublished. It binds
  the frozen product and Operations controller identities, three newly built
  AMD64 component statements/artifact sets, compatibility manifest,
  Backend/Updater OCI graph identities and archives, the standalone
  `archive-smoke` extracted and verified from the Backend bundle, Frontend tar,
  Prometheus reviewed digest, and a sorted payload-checksum inventory. That
  inventory excludes the candidate and itself; a separate complete-file
  inventory outside the addressed directory enumerates every candidate file
  and derives the directory content address without embedding itself or the
  address.
- The tag-release candidate is also unpublished but binds a later version tag's
  exact commit, its two fresh AMD64 builds, the accepted-development baseline,
  and the Operations controller at that tag. It never reuses the validation
  candidate's component bytes.
- `release-manifest.json` is publishable and deployable. It is created only
  after the release workflow verifies the final GHCR digests for the exact
  tag-release candidate graphs. It binds tag/version, accepted baseline,
  tag/Operations source authority, two image digests,
  Frontend/standalone-`archive-smoke`/payload-checksum/compatibility facts,
  OpenAPI and Archive compatibility, and Prometheus digest. The payload
  inventory excludes the release manifest and itself; the manifest digest is
  a separate immutable release-asset identity and deploy input.

All four document/schema families are operations-owned because they assemble deployment facts;
they embed but do not redefine the Contracts compatibility authority.
Production deploy accepts only the published form. Isolated validation accepts
only the validation candidate plus a separate sealed validation input.

Alternative considered: one nullable manifest for validation, tag preparation,
and published state. Rejected because mixed source authorities and nullable
registry identities make it too easy for deploy to accept an unpublished or
wrong-commit candidate.

### 3. Keep operations tooling isolated from application runtime

Repository layout is divided by write owner:

```text
operations/
  package.json
  package-lock.json
  README.md
  lib/                    # shared canonical JSON, paths, process/policy helpers
  schemas/                # receipt, validation/tag candidate, release schemas
  release/                # clean AMD64 build, assembly, promotion verification
  compose/                # one parameterized topology
  config/                 # exact production interfaces and image pins
  prometheus/             # scrape/retention configuration
  nginx/                  # inert production template
  systemd/                # inert service/timer templates
  bin/                    # fixed host deploy/update/rollback/check entrypoints
  runbooks/               # install, update, rollback, recovery, cleanup
  validation/             # sealed input/result, SSH runner, remote payload
  test/
    helpers/
    release/
    runtime/
    validation/
  .tmp/                   # ignored, run-owned, absent at handoff
```

Release/test control code uses exact Node 24.18.0 and npm 11.16.0. Host
entrypoints use Bash, Docker Compose, `jq`, `curl`, `flock`, `sha256sum`,
`tar`, and coreutils only; remote preflight verifies them before staging.
No Node runtime or application source is installed on the host.

### 4. Add only two control-plane libraries

| Library | Purpose | Alternatives | Owner/cost | Acceptance |
|---|---|---|---|---|
| `ajv` 8.20.0 | Draft 2020-12 validation for strict Operations release and validation evidence. | Hand-written schema walkers would duplicate mature boundary/error handling. | Operations control plane only; no browser, API, Updater image, or host runtime bytes. Exact lock and transitive closure are committed. | `npm ci --ignore-scripts`, schema positive/negative corpus, unknown/duplicate/path/tamper cases, lock integrity, license/advisory review. |
| `yaml` 2.9.0 | Parse workflow/Compose/template YAML for repository-owned policy tests before tool-specific rendering. Version 2.8.1 is forbidden because it is affected by GHSA-48c2-rrv3-qjmp; 2.9.0 is the current stable patched line. | Regex parsing is unsafe; relying only on GitHub or Compose misses cross-file policy. | Operations test/release control plane only; no product or host runtime bytes. Exact lock committed. | Frozen install, duplicate-key rejection, deeply nested collection rejection, closed workflow/Compose fixtures, round-trip-independent semantic assertions, license/advisory review. |

Ajv remains pinned at 8.20.0, and its exact lock closure SHALL select
`fast-uri` 3.1.4 or a later separately reviewed patched version; known
vulnerable 3.1.0, 3.1.1, and 3.1.3 closures are not admissible.

Node built-ins remain authoritative for canonical JSON, hashes, subprocesses,
and filesystem containment. `bash -n`, `docker compose config`,
`systemd-analyze verify`, and isolated `nginx -t` provide tool-native checks.
No general framework, alternate request layer, template engine, or product
dependency is added.

### 5. Render one Compose model through two exact profiles

One Compose definition is parameterized but its validator accepts only these
closed tuples:

| Field | Production template | Isolated validation |
|---|---|---|
| Root | `/srv/bgmss-v2` | `/srv/bgmss-ops-validation` |
| Project | `bgmss_v2` | `bgmss_ops_validation` |
| API bind | `127.0.0.1:18080:8080` | `127.0.0.1:19090:8080` |
| Long-lived services | `api`, `prometheus` | `api`, `prometheus` |
| One-shot service | `updater` | `updater` |
| Networks | internal `runtime` for API/Prometheus; egress-capable `outbound` for API/Updater | internal `runtime` for API/Prometheus; also-internal `outbound` for API/Updater |
| Volumes | Exact bind mounts below root | Exact bind mounts below validation root |
| Named volumes | none | none |
| Public metrics/Prometheus | none | none |
| Host Nginx/systemd | inert templates | never started or installed |

The API command explicitly passes `-listen-address 0.0.0.0:8080`,
`-archive-root`, and the read-only update-status path. The internal `runtime`
network carries API-to-Prometheus traffic. A distinct project-scoped
`outbound` network is attached only to API and Updater because the image proxy
and real acquisition require upstream HTTPS; it publishes no port and is
non-internal only in production. The isolated profile renders the same second
network as internal, so validation cannot use it for external acquisition.
Compose uses immutable
digests in production and captured local validation aliases with
`pull_policy: never` during isolated validation. Containers run non-root,
drop capabilities, enable `no-new-privileges`, carry bounded memory/CPU/log
policy, and mount no source, secret beyond its declared interface, or Docker
socket.

Separate duplicated production/validation Compose files were considered and
rejected because their security and resource behavior could drift. Unbounded
environment substitution was also rejected; the renderer and tests admit only
the two exact tuples.

### 6. Keep host paths and writers closed

The production semantic layout is fixed under `/srv/bgmss-v2`:

```text
releases/<version>/{release-manifest.json,checksums.txt,frontend/,bin/archive-smoke}
current-frontend -> releases/<version>/frontend
compose/{compose.yaml,release.env}
data/{current.json,update-status.json,updater.lock}
data/versions/<dataVersion>/{bangumi.sqlite,manifest.json}
data/.bgmss-stage-<run-id>/
observability/prometheus/
secrets/
```

Root owns scripts, release definitions, and secret interfaces. Nginx is a
read-only Frontend consumer. API is a read-only Archive/status consumer.
The data root is root-owned, group-writable only by the Updater group, and
sticky (`01770`); the existing `current.json` is root-owned so the Updater
cannot replace or remove it. Updater alone creates and writes its actual
`.bgmss-stage-*`, `versions`, and `update-status.json` objects. The
deploy/activation wrapper validates the closed root inventory before and after
Updater execution, is the sole `current.json` writer, and mounts the verified
release asset `releases/<version>/bin/archive-smoke` read-only and executable
at `/opt/bgmss/release/archive-smoke`. Prometheus alone writes its TSDB. The
wrapper alone changes current release/data refs and controls Compose. No two
actors share an undeclared writable path.

The validation root uses the same shape plus a run-ownership marker and
evidence directory. It contains no production or legacy mount.

### 7. Model release and Archive changes as explicit transactions

All active-state changes share one non-waiting host `flock`. A transaction is:

```text
admit lock/input/space/compatibility
  -> stage immutable bytes
  -> verify closed bytes and permissions
  -> capture previous refs
  -> atomically replace one declared ref
  -> restart + readiness + app/data identity + minimal query
  -> commit status/event/retention
```

Failure before switch deletes only the run's closed staging inventory. Failure
after switch restores the captured previous refs, restarts, and re-verifies.
If that also fails, the state machine stops, records both failures, and
preserves both versions for manual recovery. The primary error is never
replaced by rollback/cleanup detail.

Application rollback changes image/release/Frontend refs but not compatible
data. Data rollback changes `current.json` and API process generation but not
application/Frontend. A combined transaction requires a later explicit schema
release authorization.

Application activation does not pretend `compose/release.env` and
`current-frontend` are one filesystem-atomic switch. It atomically replaces
the API release reference first, restarts and verifies API, and atomically
replaces `current-frontend` last. Any later failure restores every captured
reference in reverse order and re-verifies the previous state.

Archive scheduling is
`OnCalendar=Sun *-*-* 03:30:00 Asia/Shanghai` with `Persistent=true`, invoking
one six-hour oneshot wrapper. Updater remains a finite pinned-image command.
`no-change`
and pre-switch failures leave current untouched. Only verified activation
emits one LF-terminated canonical JSON event with exactly `event`,
`run_id`, `app_version`, `old_data_version`, `new_data_version`, and
`duration_seconds`; `event` is exactly `update_activated`.

The initial Updater container limit is the guide's 640 MiB migration baseline,
not a claimed formal benchmark. Isolated full-Archive validation records peak
memory and proves no OOM within that cap; failure stops activation and requires
a reviewed specification amendment before production use.

### 8. Treat repository definitions, validation, activation, and retirement as separate states

| Transition | This change |
|---|---|
| Write/test repository definitions | Authorized. |
| Build local AMD64 candidate | Authorized after development acceptance and clean frozen-product admission. |
| Validate under isolated root/project/port | Authorized after host collision preflight. |
| Publish tag/images/GitHub Release | Definition created; execution deferred. |
| Install/start `/srv/bgmss-v2` | Deferred. |
| Install/reload Nginx/systemd/TLS or change public routing | Deferred. |
| Operate preview/dual stack and real weekly runs | Deferred. |
| Cut over, observe 14+7 days, return 410, retire old stack/volumes | Deferred. |

Production wrappers are inert repository inputs until a later activation
change installs and invokes them. `deploy.yml` being present is not evidence
that an Environment, secret, forced command, release, or deployment exists.

### 9. Separate workflow authorities by trigger and job

`operations.yml` handles pull requests, ordinary pushes, and manual
verification with `contents: read`. It builds locally, never logs into a
registry, never selects an Environment, and never contacts a host.

`release.yml` runs only from a version tag equal to root `VERSION`. Only the
publishing job receives `contents: write` and `packages: write`; all
third-party Actions use exact commit pins. It proves the tag commit against the
frozen accepted baseline, double-builds that exact tag commit, publishes
Backend/Updater, verifies returned digests, and creates one immutable GitHub
Release. It does not deploy.

`deploy.yml` is manual, concurrency-serialized, and gated by the `production`
Environment. It consumes an existing version plus manifest digest. Only the
deploy job reads SSH configuration and invokes one fixed remote command with
bounded arguments. It never builds or carries arbitrary shell.

Repository policy tests parse all three workflows and continue protecting the
existing development `ci.yml` as read-only test/build authority.

### 10. Close global Docker image state during host validation

Compose labels do not own global image tags. Both validation networks are
captured by immutable ID and exact project/name labels; cleanup requires both
identities. The sealed validation input
therefore enumerates six image references across three image identities:

1. the Backend artifact-declared Docker-load tag;
2. `localhost/bgmss-ops-validation-api:<product-revision>-amd64`;
3. the Updater artifact-declared Docker-load tag;
4. `localhost/bgmss-ops-validation-updater:<product-revision>-amd64`;
5. the exact reviewed upstream Prometheus digest reference; and
6. `localhost/bgmss-ops-validation-prometheus:<reviewed-version>-amd64`.

The selected reference is
`prom/prometheus:v3.13.1-distroless@sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80`.
Admission requires its `linux/amd64` child manifest
`sha256:335b5796a6e4355530475575253f84de20b8ad07bf899f65ed218451ce4c60b4`
with descriptor size `4067`, runtime UID/GID `65532`, and no shell-dependent
health or control command.

Preflight requires all six absent. Backend/Updater load captures the OCI
manifest and config digests plus the Docker runtime ID before aliasing.
Prometheus pull accepts only the exact digest/architecture, captures the same
identity set, then creates its validation alias. Compose uses only aliases.

Cleanup first proves no foreign container consumes the identities. It removes
each alias/source reference only while the current reference still resolves to
the captured manifest/config/runtime identity. It never uses force. If another
tag, replacement, or consumer appears, cleanup preserves it, records residue,
and fails validation rather than deleting a foreign image.

### 11. Use one sealed local controller and fixed remote payload

The local validation controller:

1. validates the committed Operations checkout and AMD64 candidate;
2. collects a read-only remote preflight over SSH;
3. builds a strict `validation-input-v1.json`;
4. creates the exact absent validation root and transfers a closed payload;
5. invokes only the fixed uploaded remote entry with the input path;
6. pulls back result/resource evidence;
7. invokes identity-checked cleanup; and
8. repeats the read-only inventory.

It does not interpolate free-form user values into shell. The remote payload
sets a restrictive umask, sanitizes environment, validates every input again,
and records every created path/resource before later mutation. Archive inputs
are the accepted full inactive Archive plus a small accepted compatible
Archive for safe pointer rollback; no real acquisition or weekly timer runs.

### 12. Exercise success and failure without touching host daemons

Remote success validation uses product artifacts only:

- Updater `doctor` and embedded contract check;
- installed Frontend hashes and atomic link rollback;
- API `/livez`, `/readyz`, expected `dataVersion` and
  `bgmss_build_info`, and a minimal typed query;
- Prometheus internal scrape;
- minimal → full Archive activation, full → minimal rollback, and final
  minimal → full activation through the validation wrapper;
- full-Archive Updater peak-memory/no-OOM evidence under the initial 640 MiB
  cap, explicitly recorded as an isolated migration measurement rather than a
  formal benchmark.

Safe run-owned failure exercises cover a lock collision and a post-switch
readiness failure/rollback. The complete fault matrix—including disk,
interrupted writes, invalid manifests, foreign replacement, updater timeout,
double failure, signals, and cleanup faults—runs locally against disposable
roots and fake/captured tool adapters. Host Nginx/systemd templates are
syntax-checked from the isolated root only; they are never copied or reloaded.

### 13. Make cleanup an identity transaction

Every remote file created by transfer/extraction is added to a canonical path
manifest after path, type, mode, size, digest, device, and non-symlink checks.
Cleanup removes files individually and directories bottom-up with `rmdir`.
It refuses a changed inode/type/device/marker or an unknown directory member;
there is no `rm -rf`, wildcard target, or unbounded Compose down with volumes.

Containers and network are captured by immutable ID plus
project/service/run labels. Cleanup rechecks that tuple and deletes by ID.
Image cleanup follows Decision 10. Primary, rollback, and cleanup statuses are
separate fields in the result.

The final after-snapshot checks:

- validation root/project/containers/network/listener/process/image refs are
  absent;
- no named volume existed;
- `/srv/bgmss-v2` retains its before-state (including absence);
- `/srv/bgmss` root identity, live mounts/resources, and declared static
  configuration remain unchanged;
- Nginx/systemd active configuration and public listeners remain unchanged.

Live application data content and secret bytes are not read or hashed. If a
protected process/config/resource changes concurrently, the result fails
non-interference without claiming that validation caused it.

### 14. Preserve product and oracle behavior by exact path exclusion

This change is `NEW_CAPABILITY`. Product and Frontend paths are read-only; the
immutable oracle remains
`644b7748674e553f863d0ffd61d029f86fdc0717`. Preservation evidence is:

- exact repository diff excludes all product/UI paths;
- Operations tests consume existing HTTP/Archive/artifact contracts;
- the accepted frozen product revision/tree is the isolated-validation build
  source and the immutable comparison baseline for a later tag build;
- Frontend tar is installed and hashed without modifying its bytes; and
- no intentional product delta is recorded.

There is therefore no new screenshot/oracle rendering approval in this
operations change. Exact product/UI path exclusion, the immutable oracle
contract, and the green Frontend source/artifact Actions gates remain the
preservation authority; the unexecuted formal browser matrix is not
retroactively treated as green.

## Risks / Trade-offs

- **[AMD64 builds are expensive]** → Two fully isolated end-to-end sets are
  required only at operations verification/release gates; caches are separate
  for proof but may use a pre-sealed immutable dependency cache.
- **[A builder advertises AMD64 but execution is unusable]** → Admission binds
  the builder/platform facts, while Backend, Updater, and coordinator smokes
  must really execute the generated AMD64 images natively on AMD64 or through
  the exact admitted emulator on a different host before acceptance.
- **[Product and Operations identities differ]** → Both are first-class fields;
  binaries/statements bind product, release control evidence binds Operations,
  and deploy verifies both.
- **[A protected host changes concurrently]** → Admission and final inventory
  fail conservatively. No compensating mutation of the legacy service is
  attempted.
- **[Docker images are global and lack Compose ownership]** → Six exact refs and
  three manifest/config/runtime identities are absent-before-write, captured,
  rechecked, and conditionally removed without force.
- **[Prometheus pull adds external/network variability]** → Exact digest and
  architecture are sealed; pull failure occurs before Compose activation and
  uses the same identity cleanup.
- **[Bash transaction logic can be hard to test]** → Keep host entrypoints
  small, route parsing/canonical evidence through `jq`, inject fixed tool
  adapters locally, and exercise real safe paths in isolation.
- **[No remote real acquisition or timer]** → This validation proves config,
  artifact execution, activation, rollback, and monitoring, not production
  weekly behavior or SLO. Those remain later gates.
- **[Templates can drift before live installation]** → `operations.yml`
  continuously renders/tests them, while later activation must repeat exact
  host preflight and syntax checks.
- **[Cleanup refuses unknown state and may leave residue]** → This is
  intentional fail-safe behavior; evidence names exact manual recovery targets
  rather than deleting ambiguous state.

## Migration Plan

1. Require `complete-integrated-development-acceptance` to be synchronized,
   archived, and committed with its exact authorized CI/remote lifecycle
   bundle; record the frozen product and evidence identities while preserving
   the fact that no canonical formal result was emitted.
2. Implement and locally test the Operations foundation/release control plane.
3. Implement and locally test the single-host runtime, recovery, observability,
   and inert host-integration templates.
4. Implement and locally test the isolated validation controller/payload.
5. Commit the reviewed Operations implementation so its controller identity is
   stable; keep release/deploy workflows undispatched.
6. From the frozen accepted product revision/tree, build two clean AMD64 sets,
   verify byte identity, and assemble the unpublished candidate.
7. Run the read-only `myserver` preflight. Stop without writes on any mismatch.
8. Create only `/srv/bgmss-ops-validation`, run isolated success/failure
   validation, pull evidence, perform bounded cleanup, and prove
   non-interference/zero residue.
9. Mark verified task evidence, synchronize/archive the change, and run final
   repository/Actions checks. Report released/deployed as false.
10. A later explicit activation change may configure secrets/users, install
    root-owned files, create `/srv/bgmss-v2`, start `bgmss_v2`, install/reload
    Nginx/systemd, and exercise live rollback. Publication, cutover, observation,
    and retirement remain separately gated.

Rollback for steps 2–4 is limited to uncommitted owned repository files and
ignored local output. Step 8 rollback is the identity-checked validation
transaction described above. No step in this plan rolls back, stops, or edits
the legacy stack.

## Open Questions

None. The Prometheus identity is pinned above. Required host control-plane
facts are implementation inputs selected under the acceptance rules; any
mismatch observed at apply/validation time is a stop condition requiring
specification review, not an implicit fallback.
