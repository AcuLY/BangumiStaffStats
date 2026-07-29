# Minimal single-host operations

This directory defines the repository-side deployment path only. It is not a
production activation record. Public Nginx integration, `/etc` installation,
service enablement, secrets, TLS, firewall changes, and legacy retirement are
deliberately deferred.

## Runtime

`compose.yaml` runs the API and Prometheus continuously and defines the updater
as a terminating `docker compose run --rm updater` service. Both published
ports bind to `127.0.0.1`. All services are non-root, read-only, initialized,
capability-free, protected by `no-new-privileges`, resource/PID bounded, and
logged through journald. The Docker socket, host/PID networking, legacy paths,
mutable `latest`, and undeclared writable volumes are absent.

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
  data/{current.json,previous.json,update-status.json,operations.lock,versions}
  prometheus/
```

Only current and previous application/Archive references are active.
Application rollback swaps env/tools/frontend but never data. Data rollback
swaps `current.json` but never application state. These minimal commands do not
automatically delete older on-disk releases or snapshots; any later retention
cleanup is a separate reviewed operation with exact targets.

## Prerequisites and bootstrap

The host needs Bash, Docker with Compose v2, `curl`, `flock`, `jq`, GNU
`realpath`, GNU `sha256sum`, and `tar`. Nginx and `systemd-analyze` are needed
only for template validation. Prometheus must be a reviewed pinned tag or
digest already available to Docker; `latest` is rejected.

Create the exact root and permissions once. This is an explicit production
preparation action, not something the deployment command infers:

```sh
install -d -m 0755 /srv/bgmss-v2 /srv/bgmss-v2/releases
install -d -m 0750 /srv/bgmss-v2/{compose,config/prometheus,operations,operations/bin,operations/lib,state,data,data/versions,prometheus}
install -m 0644 operations/compose.yaml /srv/bgmss-v2/compose/compose.yaml
install -m 0644 operations/prometheus/*.yml /srv/bgmss-v2/config/prometheus/
install -m 0555 operations/bin/{deploy,update,rollback-app,rollback-data,check} /srv/bgmss-v2/operations/bin/
install -m 0444 operations/lib/common.sh /srv/bgmss-v2/operations/lib/common.sh
chown -R 65532:65532 /srv/bgmss-v2/data
chown -R 65532:65532 /srv/bgmss-v2/prometheus
```

Seed `data/current.json` and its immutable `data/versions/<dataVersion>`
before the first deploy. Never mutate the active SQLite file in place.

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
candidate, so the same admitted bundle can be retried.

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

The systemd timer is weekly and persistent, with a six-hour service timeout.
The Nginx file is a loopback-only complete test configuration, not a public
vhost. Validate templates before any separately approved install:

```sh
nginx -t -p /tmp/bgmss-nginx-prefix/ -c /tmp/bgmss-nginx-prefix/nginx.conf
systemd-analyze verify operations/systemd/bgmss-archive-update.service operations/systemd/bgmss-archive-update.timer
```

Prometheus scrapes every 30 seconds and retains seven days/512 MiB. The first
rules cover API down/not-ready, sustained 5xx/upstream errors, queue/cache
pressure and oversize rejection, and updater failure/age/duration. Prometheus
failure does not participate in API readiness.

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
deferred.
