# Minimal single-host operations

This directory defines the repository-side deployment and recovery path.
Production activation evidence remains in its archived OpenSpec. The reviewed
Nginx model keeps the legacy application at the domain root and reserves
`/v2/**` for the new frontend/API; `/etc` installation, secrets, TLS, firewall
changes, and legacy retirement remain explicit host-owned actions.

## Runtime

`compose.yaml` runs the API and Prometheus continuously and defines the updater
as a terminating `docker compose run --rm updater` service. Both published
ports bind to `127.0.0.1`. All services are non-root, read-only, initialized,
capability-free, protected by `no-new-privileges`, resource/PID bounded, and
logged through journald. The Docker socket, host/PID networking, legacy paths,
mutable `latest`, and undeclared writable volumes are absent.

The project has one base Compose topology and no application proxy settings or
external proxy network. Production egress is a host-owned prerequisite:
Mihomo transparently captures host and Docker bridge traffic in `rule` mode and
chooses DIRECT or Proxy by destination. Its configuration, credentials, and
listeners are global host state and are not stored or managed here.

The root layout is fixed:

```text
<root>/
  compose/compose.yaml
  config/prometheus/{prometheus.yml,rules.yml}
  operations/{bin,lib}
  releases/<source-revision>/{frontend,tools,release.env,build.json}
  state/{current.env,previous.env}
  current-frontend -> releases/<revision>/frontend
  previous-frontend -> releases/<revision>/frontend
  current-tools -> releases/<revision>/tools
  previous-tools -> releases/<revision>/tools
  data/                         # root:65532, mode 1770 (sticky)
    current.json               # root:65532, mode 0640
    previous.json              # root:65532, mode 0640, once available
    operations.lock            # root:root, mode 0600, pre-created
    update-status.json         # updater-owned status output
    versions/                  # root:65532, mode 1770 (sticky)
      <dataVersion>/           # recursively root:65532, dirs 0550/files 0440
  prometheus/
```

The updater remains able to create same-filesystem `.bgmss-stage-*` directories,
its status file, and an absent version below `versions/`. Sticky directories
prevent UID/GID `65532:65532` from replacing the root-owned pointers or fixed
lock. After the updater exits, the host recursively changes the published
version to root ownership and read-only group access before activation. The API
uses the same numeric group and proves that read path through readiness/catalog
checks.

Only current and previous application/Archive references are active.
Application rollback swaps env/tools/frontend but never data. Data rollback
swaps `current.json` but never application state. These minimal commands do not
automatically delete older on-disk releases or snapshots; any later retention
cleanup is a separate reviewed operation with exact targets.

## Prerequisites and bootstrap

The host needs Bash, Docker with Compose v2, `curl`, `flock`, `jq`, GNU
`realpath`, GNU `sha256sum`, GNU `stat`, and `tar`. Nginx and
`systemd-analyze` are needed only for template validation. Prometheus must be a
reviewed pinned tag or digest already available to Docker; `latest` is rejected.
Before production activation, the host-transparent rule gateway must already
be validated from the host and every production Docker bridge with all proxy
environment variables removed. The gateway must keep its controller, DNS, and
optional mixed listeners on loopback.

Create the exact root and permissions once. This is an explicit production
preparation action, not something the deployment command infers:

```sh
install -d -m 0755 /srv/bgmss-v2 /srv/bgmss-v2/releases
install -d -m 0750 /srv/bgmss-v2/{compose,config/prometheus,operations,operations/bin,operations/lib,state,prometheus}
install -d -o root -g 65532 -m 1770 /srv/bgmss-v2/data /srv/bgmss-v2/data/versions
install -o root -g root -m 0600 /dev/null /srv/bgmss-v2/data/operations.lock
install -m 0644 operations/compose.yaml /srv/bgmss-v2/compose/compose.yaml
install -m 0644 operations/prometheus/*.yml /srv/bgmss-v2/config/prometheus/
install -m 0555 operations/bin/{deploy,update,rollback-app,rollback-data,check} /srv/bgmss-v2/operations/bin/
install -m 0444 operations/lib/common.sh /srv/bgmss-v2/operations/lib/common.sh
chown -R 65532:65532 /srv/bgmss-v2/prometheus
```

Seed `data/current.json` and its immutable `data/versions/<dataVersion>`
before the first deploy. Install the pointer as `root:65532` mode `0640`;
recursively install the version as `root:65532` with directory mode `0550` and
file mode `0440`. Never mutate the active SQLite file in place.

## Commands

Every state-changing command takes the same non-waiting
`<root>/data/operations.lock`. Deployment verifies the complete bundle
`SHA256SUMS`, validates the closed `build.json`, loads and checks the exact
image tags/revision labels, safely installs the versioned frontend and unique
`archive-smoke`, switches the API env/tools, waits at most 60 seconds, and
switches the frontend last. On readiness failure it restores and verifies the
previous state. A later deploy may change only the API/updater image revision;
project, root, Prometheus image, ports, and the production/validation resource
profile must exactly match `state/current.env`. Any failure while installing
or activating a newly absent release removes only that exact, still-inactive
candidate, so the same admitted bundle can be retried. `ERR`, `HUP`, `INT`, and
`TERM` use the same transaction restoration path; successful signal recovery
returns `129`, `130`, or `143` as appropriate.

Release env contains only the fixed project/root/image/port/profile topology.
Proxy mode, URL, network, dedicated proxy inputs, and generic proxy inputs are
forbidden release state. The common Compose wrapper always renders only
`compose.yaml`, rejects proxy state in `current.env`, and removes conflicting
calling-shell proxy variables before invoking Compose. Obsolete proxy
arguments and all unknown deploy arguments fail before the state lock, Docker,
release creation, or state mutation. Application rollback still swaps the
exact admitted current/previous env and links.

There is one locked upgrade exception for a deployment created by the retired
proxy release schema. `deploy` admits only its exact canonical
`BGMSS_UPDATER_TRANSPORT=proxy` plus URL/network trio and the exact installed
legacy overlay. Under `operations.lock`, it first rewrites the same old images
to a proxy-free env, force-recreates API and Prometheus from base Compose, and
waits for the old API to become ready. If that normalization fails, it restores
the original env and recreates through the validated legacy overlay. Once the
base-only old application is ready, both rollback slots use that clean old
state, the overlay is removed, and candidate failure or `rollback-app` cannot
reintroduce proxy release state. Partial, modified, generic-proxy, direct-mode,
or otherwise noncanonical legacy env is rejected before the lock.

```sh
/srv/bgmss-v2/operations/bin/deploy \
  --root /srv/bgmss-v2 \
  --bundle /path/to/admitted-bundle \
  --version <40-hex-source-revision> \
  --project bgmss-v2 \
  --api-port 18080 \
  --prometheus-port 19090 \
  --prometheus-image prom/prometheus:v3.13.1-distroless@sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80

/srv/bgmss-v2/operations/bin/check --root /srv/bgmss-v2
/srv/bgmss-v2/operations/bin/update --root /srv/bgmss-v2
/srv/bgmss-v2/operations/bin/rollback-app --root /srv/bgmss-v2
/srv/bgmss-v2/operations/bin/rollback-data --root /srv/bgmss-v2
```

`update` uses only the updater image's
`/opt/bgmss/producer/contracts`,
`/opt/bgmss/producer/catalog/display-v1.yaml`, fixed common commit
`6a8442c17143a870357a5ff812362e8b5cfe9f9d`, and the bind-mounted Backend
`archive-smoke`. It publishes an inactive version first; the host wrapper alone
atomically writes `current.json` and restarts/verifies the API.

The builder deliberately uses SQLite file-backed temporary tables and indices.
Only updater receives the fixed
`SQLITE_TMPDIR=/var/lib/bgmss/archive`, so those spill files use the existing
disk-backed Archive mount instead of the 256 MiB `/tmp` tmpfs. API and
Prometheus do not receive that input; ordinary process temporary files,
resource limits, mounts, and publication transactions remain unchanged.

The systemd timer is weekly and persistent, with a six-hour service timeout.
The Nginx file is a loopback-only complete test configuration for the reviewed
path split, not the host's complete public TLS configuration. It uses
`@@BGMSS_LEGACY_FRONTEND_ROOT@@` for the root application,
`@@BGMSS_FRONTEND_ROOT@@` for `/v2/**`, and maps `/v2/api/v1/**` to the
backend's unchanged `/api/v1/**` handlers. Exact `/v2/`,
`/v2/index.html`, and SPA-fallback responses disable mtime/size validators and
use `Cache-Control: no-store`; this is required because reproducible frontend
artifacts can have equal epoch mtimes and byte lengths across different
releases. The general `/v2/` prefix keeps direct lookup for content-hashed
assets and does not inherit that entry-document policy. Validate templates
before any separately approved install:

```sh
nginx -t -p /tmp/bgmss-nginx-prefix/ -c /tmp/bgmss-nginx-prefix/nginx.conf
systemd-analyze verify operations/systemd/bgmss-archive-update.service operations/systemd/bgmss-archive-update.timer
```

Prometheus scrapes every 30 seconds and retains seven days/512 MiB. The first
rules cover API down/not-ready, sustained 5xx/upstream errors, queue/cache
pressure and oversize rejection, updater failure/age/duration, an
unconfigured/invalid updater status source, and a valid source that has never
succeeded. Prometheus failure does not participate in API readiness.

## Isolated validation

`validate-isolated` is remote-owned and destructive only to the exact absent
root/project/image tags passed to it. It requires ports `19090` and `19091`,
records only the legacy `bgmss` Compose objects, three relevant existing
systemd units, the Nginx configuration hash, and at least two explicit
`HOST|http://127.0.0.1/PATH` legacy probes. Those probes use the supplied Host
header against loopback Nginx; arbitrary public URLs are rejected.
It seeds the bundle's minimal Archive, deploys with low-memory validation
limits, checks health/catalog/metrics/Prometheus/journald, exercises pointer
switch/restore and application restart/rollback, validates Nginx under a
temporary prefix and systemd units inertly, then removes only matching
run-owned objects. Postflight directly requires the exact validation
root/project to be absent and both ports free. It never installs, enables,
starts, repairs, reloads, or edits anything below `/etc`. It runs only updater
`doctor` and embedded `contract-check`; a real Archive production build is
deferred. Before those checks it inspects the real API/Prometheus containers and
a create-only updater container for the exact non-root user, read-only rootfs,
capability/security settings, CPU/memory/PID bounds, journald driver, mount
direction, and closed loopback-only port bindings.
It statically renders the base Compose file under conflicting calling-shell
proxy variables and proves that every service remains only on the backend
network with no proxy input or external network. The separate
`test/runtime.sh` build gate covers workflow-prefix integrity, release-env and
calling-shell closure, obsolete argument rejection before mutation, deploy
transactions, exact previous/current rollback, and base Compose projection
without starting an updater or creating an external network.
