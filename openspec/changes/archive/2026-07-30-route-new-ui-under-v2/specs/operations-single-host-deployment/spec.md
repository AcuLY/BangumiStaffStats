## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Implemented, production-applied, rollback-verified, and public-path accepted. |
| Owner | Main agent, exact sequential production owner. |
| Writable paths | `operations/nginx/bgmss.conf`, the exact new legacy-root placeholder substitution in `operations/bin/validate-isolated`, and `operations/README.md`; on `myserver`, exact admitted new release/application refs via existing deploy transaction, `/srv/bgmss-v2/config/nginx/nginx.conf`, `/etc/nginx/nginx.conf`, its same-directory temporary, and one exact new pre-change backup. |
| Read-only protected inputs | Archive data/pointers, updater/timer/logrotate/proxy/TLS/DNS/firewall, legacy `/srv/bgmss` data/config/containers, stopped loader, unrelated vhosts/routes/services, and historical `.pre-bgmss-v2` backup. |
| Deletion complement | No deletion; failed deploy/cutover restores transactional application refs and exact new Nginx preimage. |
| Mutable refs | Branch lifecycle, `bgmss-v2` current/previous application refs through deploy, exact active/candidate/new backup Nginx files. |
| Consumes | Green exact-head bundle, legacy frontend root, new loopback API, active Nginx preimage, real Archive. |
| Produces | Legacy root plus new `/v2/**` on one TLS vhost with both stacks retained. |
| Dependencies | Frontend nested-base artifact → admitted deploy → path cutover. |
| Deliverables | Reviewed operations bytes, admitted release, Nginx candidate/backup, content-aware old/new probes, lifecycle evidence. |
| Acceptance | Proposal acceptance, `nginx -t`, exact hash/probe checks, unchanged protected identities/data. |
| Non-goals | Updater/Archive/TLS/DNS/firewall/observability/legacy lifecycle changes. |
| Operations deferred | Legacy retirement and extended load/soak. |
| Stop/rollback conditions | Stop on topology/hash/artifact/probe drift; restore exact new backup on any syntax/reload/content failure. |

## MODIFIED Requirements

### Requirement: Nginx cutover SHALL be atomic and reversible

Path migration SHALL create one exact absent, change-specific backup without
overwriting the historical
`/etc/nginx/nginx.conf.pre-bgmss-v2`. It SHALL modify only the existing
`search.bgmss.fun` TLS server so `/` and every path outside `/v2/**` again use
the retained legacy frontend at `/srv/bgmss/frontend/dist`, exact `/v2`
redirects to `/v2/`, `/v2/` serves
`/srv/bgmss-v2/current-frontend` with base-aware SPA fallback, and
`/v2/api/v1/` proxies to the unchanged `127.0.0.1:18080/api/v1/` backend
path. Existing `/statistics`, `/timeline`, `/proxy`, per-site logs, TLS, and
every unrelated location/server byte SHALL remain present and equivalent.

The admitted candidate SHALL be retained at
`/srv/bgmss-v2/config/nginx/nginx.conf`. Migration SHALL record and recheck the
active preflight SHA-256 before the first write, require the new backup hash to
equal it, and use a structure-aware transformation whose diff is bounded to
the named TLS block and reviewed path locations. It SHALL copy through the
exact same-directory temporary and atomic rename, run `nginx -t` before each
reload, and verify the active hash equals the intended candidate or backup.
It SHALL restore the new backup, revalidate, and reload if reload or any
required content-aware public probe fails.

#### Scenario: Public path split succeeds
- **WHEN** the candidate validates/reloads, `/` hashes exactly to the retained legacy `index.html`, `/v2/` hashes exactly to the deployed new `index.html`, new static/deferred assets resolve, both new SPA modes remain below `/v2/`, and `/v2/api/v1/catalog` reports the accepted real data version
- **THEN** legacy SHALL own the root while the new stack receives only `/v2/**` traffic, with both serving stacks still running and the loader still intentionally stopped

#### Scenario: Candidate configuration or public probe fails
- **WHEN** syntax, reload, legacy-root content, new frontend/assets/routes, or new API acceptance fails
- **THEN** the exact new backup SHALL be restored/reloaded and the previously active public state SHALL be required to recover before returning failure

#### Scenario: Reserved prefix cannot fall through
- **WHEN** a missing or malformed `/v2/**` static, SPA, or API request is made
- **THEN** Nginx SHALL resolve it within the new-stack locations or return a new-stack error and SHALL NOT serve legacy HTML as a successful fallback

#### Scenario: Existing legacy auxiliary routes are probed
- **WHEN** `/statistics`, `/timeline`, and `/proxy` are requested after the path split
- **THEN** their existing upstream ownership and declared healthy or known-excluded status SHALL remain unchanged
