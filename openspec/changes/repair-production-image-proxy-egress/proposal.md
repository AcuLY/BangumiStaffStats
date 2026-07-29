## Why

Production image requests cannot succeed on `myserver`. Direct
`api.bgm.tv` egress is unavailable, while the Backend deliberately ignores
proxies; through the existing host proxy, Bangumi returns its documented
`302` image redirect to `lain.bgm.tv`, which the Backend also rejects.

## What Changes

- Add one optional `BGMSS_IMAGE_HTTPS_PROXY` input for Backend image traffic.
  Validate it as the same canonical credential-free HTTP proxy URL already
  authorized in release state; never inherit generic HTTP/HTTPS/ALL/NO proxy
  variables.
- Keep the initial request fixed to `https://api.bgm.tv`; manually accept only
  one absolute credential-free HTTPS `302` target on exact `lain.bgm.tv`, then
  reject every other or second redirect.
- Preserve the existing timeout, concurrency, response-header, status, image
  MIME, declared/actual body-size, cache-header, cancellation, safe-error, and
  low-cardinality observation bounds across both hops.
- Extend `compose.updater-proxy.yaml` so proxy mode derives
  `BGMSS_IMAGE_HTTPS_PROXY` from the existing root-managed updater proxy URL and
  attaches API and updater, but not Prometheus, to the existing external
  network.
- Build and deploy the replacement API, then replace only the installed proxy
  overlay among operations definitions. Keep Archive, updater behavior,
  Prometheus, Nginx, systemd, logrotate, proxy lifecycle, and the stopped legacy
  loader unchanged.

## Impact

Affected capabilities are `backend-image-proxy` and
`operations-single-host-deployment`.

Repository implementation is limited to:

- `backend/internal/imageproxy/{client.go,client_test.go}`
- `backend/internal/httpapi/{handler.go,handler_test.go}`
- `backend/internal/app/{run.go,run_test.go}`
- `backend/cmd/api/{main.go,main_test.go}`
- `backend/README.md`
- `operations/compose.updater-proxy.yaml`
- `operations/test/updater-proxy.sh`
- `operations/bin/validate-isolated`
- proxy wording in `operations/README.md`
- the accepted Product revision in `operations/bin/build-bundle.sh`
- this change and the two affected main specs during normal sync/archive

No dependency, public API/schema, frontend, data, query, statistics, or updater
semantic changes are required. Production uses the existing `/srv/bgmss-v2`
project, `proxy-net`, `http://myserver-proxy:7897`, release env, deploy/rollback
commands, and loopback ports. Among installed operations files, only
`/srv/bgmss-v2/compose/compose.updater-proxy.yaml` changes. Implementation
remains paused until this change is strict-valid and reviewed.

## Non-goals

- Generic proxy inheritance, credentials, custom CAs, TLS bypass, retries,
  caller-supplied targets, or a general redirect/open-proxy facility.
- Changes to `compose.yaml`, operations command/library scripts, release-env
  keys, updater source, Nginx, systemd, logrotate, Prometheus, or proxy/network
  management.
- Archive publication, updater execution, public cutover, or legacy retirement.
