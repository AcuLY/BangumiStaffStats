## Why

The user explicitly requests publishing the pending career/separator improvements and promoting the new application to the domain root. Production currently serves the new app only at /v2/ while the root serves legacy.

## What Changes

- Build and smoke the new frontend at /, with /ranking and /co-star as canonical public routes.
- Route /api/v1/ to the existing API, and serve legacy through /old/.
- Preserve /v2/ entry links with no-store redirects and retain old API/asset compatibility during cutover.
- Preserve /statistics, /timeline, /proxy, TLS, unrelated servers, Archive and runtime ports.
- Deploy the already-requested career and separator UI changes alongside this routing change.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- frontend-query-shell: production base changes to root.
- operations-single-host-deployment: reversible root promotion with legacy /old and /v2 compatibility.

## Impact

Frontend packaging and the search.bgmss.fun TLS vhost only. No dependency, API, database or statistics change. Host writes are explicitly authorized by the user; all unrelated dirty work remains protected.
