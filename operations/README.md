# Single-host operations

The production topology contains two long-running containers:

- `api`: the Go API, embedded weekly Archive builder, and live Store owner;
- `prometheus`: loopback-only metrics storage and rule evaluation.

There is no Python updater image/service, Archive smoke tool, update-status
file, host Archive update wrapper, data rollback command, or Archive systemd
timer in the active topology. The API performs one asynchronous freshness check
at startup and schedules its weekly Sunday 04:15 UTC+8 refresh internally.

## Host layout

The reviewed default root is `/srv/bgmss-v2`:

```text
/srv/bgmss-v2/
  compose/compose.yaml
  config/prometheus/{prometheus.yml,rules.yml}
  operations/{bin,lib}/
  state/{current.env,previous.env}
  current-frontend -> releases/<revision>/frontend
  previous-frontend -> releases/<revision>/frontend
  releases/<revision>/{release.env,build.json,compatibility-manifest.json,frontend/}
  data/
    operations.lock
    current.json
    versions/<dataVersion>/{manifest.json,bangumi.sqlite}
  prometheus/
```

`data/` and `data/versions/` are owned by runtime UID/GID `65532:65532`
with mode `0750`; `current.json` is `65532:65532` mode `0640`. This is the
only product-data bind mounted writable into API. The API image root remains
read-only. Prometheus has no Archive mount.

## Deployment bundle

The manual `operations-preview` workflow builds one `linux/amd64` bundle with:

- `api.oci.tar`;
- `frontend.tar`;
- `build.json` declaring exactly `components: ["backend", "frontend"]`;
- `compatibility-manifest.json` assembled from those two component statements;
- the minimal Archive fixture used only for isolated validation; and
- `SHA256SUMS` covering every payload file.

The Backend component statement binds the canonical producer-runtime manifest
and the embedded Archive schema/display/staff-set inputs. Bundle creation does
not install Python or uv and does not build a third product artifact.

## Initial root preparation

Run these actions only on an explicitly authorized host. The repository change
itself does not install or enable anything.

```sh
install -d -m 0755 /srv/bgmss-v2 /srv/bgmss-v2/{releases,compose,config,operations,state,prometheus}
install -d -m 0755 /srv/bgmss-v2/config/prometheus /srv/bgmss-v2/operations/{bin,lib}
install -d -o 65532 -g 65532 -m 0750 /srv/bgmss-v2/data /srv/bgmss-v2/data/versions
install -o 0 -g 0 -m 0600 /dev/null /srv/bgmss-v2/data/operations.lock
install -m 0644 operations/compose.yaml /srv/bgmss-v2/compose/compose.yaml
install -m 0644 operations/prometheus/{prometheus.yml,rules.yml} /srv/bgmss-v2/config/prometheus/
install -m 0444 operations/lib/common.sh /srv/bgmss-v2/operations/lib/common.sh
install -m 0555 operations/bin/{deploy,rollback-app,check} /srv/bgmss-v2/operations/bin/
```

Seed one complete contract-valid Archive and `current.json` before the first
API start. Do not install the retired Archive service/timer or the dormant
update/data-rollback scripts while Go parity cleanup is pending.

## Deploy and application rollback

`deploy` verifies the closed bundle, loads only the API image, installs one
versioned Backend/Frontend release, waits for API readiness against the current
Archive, and switches the frontend last:

```sh
/srv/bgmss-v2/operations/bin/deploy \
  --root /srv/bgmss-v2 \
  --bundle /absolute/path/to/bundle \
  --version <40-hex-source-revision> \
  --project bgmss-v2 \
  --api-port 18080 \
  --prometheus-port 19090 \
  --prometheus-image 'prom/prometheus:v3.13.1-distroless@sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80'
```

Application rollback swaps only the previous release env/frontend and restarts
the API. It never changes `current.json` or retains a previous data slot:

```sh
/srv/bgmss-v2/operations/bin/rollback-app --root /srv/bgmss-v2
```

## Public application routes

The new frontend is built for `/`, with canonical `/ranking`, `/co-star` and
`/api/v1/` paths. Legacy remains available at `/old/`; its immutable root asset
references are served through a contained legacy static fallback. `/v2/` page
links redirect to their root equivalents with query strings preserved and
no-store responses. `/v2/api/v1/` remains a direct API compatibility path;
`/v2/assets/` can use the retained previous frontend during cutover. Missing
static files return 404, never SPA HTML. `/metrics` remains private.

Only the existing `search.bgmss.fun` TLS application locations are replaced;
`/statistics`, `/timeline`, `/proxy`, TLS and other sites remain intact. Save
an exact, change-specific Nginx and release-state backup; verify the preimage,
render and inspect the bounded candidate, run `nginx -t`, atomically install
and reload, then probe root, legacy, redirects, assets and API content. Restore
the exact config and prior application if acceptance fails. Never switch the
Archive data pointer as part of this route rollback.

## Health and observability

The repository Nginx template gives `/api/v1/` and `/v2/api/v1/` a 130-second upstream read
timeout, exceeding the backend's 120-second request and 125-second HTTP write
budgets. Existing deployments keep their current vhost settings until a
separately authorized template rollout; a repository edit is not deployment.

```sh
/srv/bgmss-v2/operations/bin/check --root /srv/bgmss-v2
```

The check verifies liveness, readiness, current dataVersion, catalog access,
metrics, Prometheus scrape, and journald logging for API and Prometheus.
Prometheus consumes the Backend's in-process `bgmss_archive_update_*` metrics;
it does not read or monitor a status file.

## Isolated validation

`operations/bin/validate-isolated` uses a unique absent runtime root, Compose
project, image tags, and loopback ports. It checks the two-service topology,
the API-only writable Archive mount, health/metrics, application rollback,
templates, and exact cleanup. It does not run a real Archive download, invoke a
Python updater, install a service/timer, or switch validation data pointers.

Focused repository checks while developing this topology are:

```sh
bash operations/test/runtime.sh
node --test contracts/artifacts/test/*.test.mjs
```

The full Backend/Contracts/Operations gates and a complete Archive build are
deferred until the accumulated Go builder/runtime work is ready.
