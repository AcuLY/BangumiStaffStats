## Why

Production browser acceptance loaded the previous `/v2/` application after a
successful application rollback-forward. Both reproducible `index.html`
artifacts had epoch mtimes and equal byte lengths, so Nginx emitted the same
mtime/size-derived ETag for different HTML bytes and returned `304` to a stale
conditional SPA-route request.

## What Changes

- Make every `/v2/` SPA entry response non-storable and insensitive to stale
  `If-None-Match` and `If-Modified-Since` validators.
- Cover the exact `/v2/`, `/v2/index.html`, and named SPA-fallback paths while
  leaving hashed static assets cacheable under the existing prefix location.
- Add a focused static regression and apply the same bounded change to the
  active `search.bgmss.fun` TLS vhost with atomic backup, validation, reload,
  and content-aware probes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `operations-single-host-deployment`: require release-correct SPA entry HTML
  after deploy and rollback while preserving the legacy root and hashed asset
  behavior.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Proposed for immediate production repair after strict validation and main-agent review. |
| Owner | Operations; main agent owns this small implementation and live repair. |
| Writable paths | `operations/nginx/bgmss.conf`; focused assertions in `operations/test/runtime.sh`; `operations/README.md`; this change's lifecycle files; the active `search.bgmss.fun` TLS vhost locations named by this change. |
| Read-only protected inputs | Frontend artifacts, API routes, root legacy locations, TLS material, unrelated Nginx servers/locations, and every other repository path. |
| Deletion complement | No product or host file deletion; only stale-validator response behavior may be disabled for the named SPA entry paths. |
| Produces | Release-correct `/v2/` entry HTML and regression/live evidence. |
| Acceptance | Strict OpenSpec validation; Bash/static regression; `nginx -t`; forced stale conditional requests return `200`, current asset reference, and `Cache-Control: no-store`; root and API remain healthy; browser QA. |
| Non-goals | Asset-cache redesign, CDN work, frontend changes, root legacy cache changes, API changes, or unrelated vhost hardening. |
| Stop/rollback conditions | Stop on unexpected vhost SHA or structural drift; restore the exact new backup if syntax, reload, route, content, or browser acceptance fails. |
