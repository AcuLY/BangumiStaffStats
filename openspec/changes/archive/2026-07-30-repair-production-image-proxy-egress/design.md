## Context

`imageproxy.NewClient` currently sets `Transport.Proxy=nil`, stops automatic
redirects, allows its dialer to reach only `api.bgm.tv:443`, and treats `302`
as a protocol error. That is fail-closed but incompatible with both the
production network and Bangumi's documented image response. The existing
operations proxy mode already owns a validated credential-free proxy
URL/network pair; no new operator setting is needed.

## Decisions

### 1. Parse one dedicated environment value at process assembly

The API command uses `os.LookupEnv("BGMSS_IMAGE_HTTPS_PROXY")` so absence means
direct mode while a present empty value remains invalid. It passes the optional
raw value through `app.RunOptions` to HTTP runtime construction; `httpapi`
constructs the image client before serving. This keeps `app` from gaining a
new `imageproxy` dependency and permits startup errors to remain sanitized.

The Backend validator mirrors the existing operations URL contract: at most
320 ASCII bytes, canonical credential-free `http://HOST:PORT`, lowercase DNS
labels, and canonical port `1..65535`, with no userinfo, path, query, fragment,
or alternate spelling. Generic proxy variables are never read.

Alternative rejected: `http.ProxyFromEnvironment`, because ambient variables
and `NO_PROXY` would silently change release authority.

### 2. Use separate closed direct and explicit-proxy transports

Direct mode retains the fixed public-address dialer, expanded only from
`api.bgm.tv:443` to the two exact targets `api.bgm.tv:443` and
`lain.bgm.tv:443`. Explicit proxy mode uses only the validated proxy URL; its
dialer may reach that configured proxy, while requests can still be created
only for the two approved HTTPS targets. Both modes retain destination TLS
hostname/certificate validation, disabled compression, connection/header
bounds, one timeout, and one semaphore permit.

Alternative rejected: reuse the current fixed-origin dialer in proxy mode,
because Go must dial the proxy endpoint before issuing CONNECT.

### 3. Follow the official redirect manually

Automatic redirect following remains disabled. `Fetch` sends the exact initial
request and handles a response as follows:

1. An accepted final response continues through the existing status/MIME/body
   and cache-header path.
2. One initial `302` may supply an absolute Location with exact HTTPS
   `lain.bgm.tv`, no userinfo, fragment, or non-default port. The official path
   and query are allowed, including default-image paths; the caller contributes
   none of them.
3. The intermediate body is closed, and a second explicit GET copies only the
   reviewed Accept and conditional headers under the original context/permit.
4. Any other redirect or a redirect from the second response is a safe protocol
   failure and is never followed.

This keeps redirect count, target, headers, timeout, body closure, and error
classification explicit without creating a general redirect policy.

### 4. Derive API projection in the existing proxy overlay

`compose.updater-proxy.yaml` adds only:

- API `BGMSS_IMAGE_HTTPS_PROXY=${BGMSS_UPDATER_HTTPS_PROXY}`;
- API membership in existing `updater_proxy`; and
- no change to updater or the external-network definition.

Direct mode therefore remains unchanged. In proxy mode updater keeps
`BGMSS_HTTPS_PROXY`, API receives only the image key, and Prometheus remains on
`backend` with neither key. Tests render both modes and assert all three
service projections. No release-env, base Compose, common/deploy command, or
proxy lifecycle change is needed.

Production deploys the new application first under the old overlay. It then
backs up and atomically swaps only the installed overlay under the existing
operations lock, force-recreates API, and verifies projection plus the image
route. On failure it restores the old overlay and force-recreates API again;
normal application rollback remains available after topology is restored.

### 5. Send one fixed project User-Agent

Both explicit approved GETs set exact
`User-Agent: AcuLY/BangumiStaffStats (https://github.com/AcuLY/BangumiStaffStats)`.
The value is a code constant, contains no request or environment data, and
replaces the Go transport default that `api.bgm.tv` rejects. Incoming
User-Agent and arbitrary headers remain outside the image request model and
cannot affect either hop.

Alternative rejected: omit the header or rely on Go's implicit
`Go-http-client/1.1`, because production repetition proved both identities
receive `403`. Forwarding the browser identity is also rejected because it
would widen the reviewed request boundary without adding product value.
