## Why

The production backend currently exposes only infrastructure routes, so the
frontend cannot load Bangumi images through the required same-origin boundary.
This change adds the bounded image proxy already defined by the backend guide.

## What Changes

- Add the exact image GET route for allowed resource, positive ID, and required
  image type values.
- Construct only fixed `api.bgm.tv` upstream requests, stream bounded image
  responses, and preserve only reviewed cache/conditional headers.
- Reject redirects, unsafe inputs, oversized/non-image/error responses, leaked
  credentials, and cancellation/timeout failures with safe API errors.
- Add focused handler/client/SSRF/cancellation/observability tests.

Behavior classification: `NEW_CAPABILITY`. The immutable prototype oracle
`644b7748674e553f863d0ffd61d029f86fdc0717` has no production same-origin image
proxy; the route and security behavior come from backend guide §6.1 and the
formal master-plan `implement-image-proxy` row.

## Capabilities

### New Capabilities

- `backend-image-proxy`: Bounded same-origin Bangumi image retrieval, streaming,
  cache-header handling, cancellation, and safe failure behavior.

### Modified Capabilities

- `backend-http-runtime`: Admit the exact image route without weakening the
  three infrastructure routes or admitting any other business route.
- `backend-runtime-foundation`: Add the `httpapi -> imageproxy` dependency and
  keep the image route available when Archive readiness is false.
- `backend-observability`: Add only closed image route/operation/outcome
  dimensions and one identity-free terminal image event.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated/specification in progress; implemented/verified/committed/pushed/released/deployed: no |
| Owner | One Backend subagent implements; main agent reviews the specification and accepts the result. |
| Writable paths | This change; `backend/internal/imageproxy/**`; exact necessary files under `backend/internal/httpapi/**`, `backend/internal/observability/**`, `backend/internal/app/**`; `backend/internal/architecture/dependencies_test.go`; `backend/scripts/check.sh`; and `backend/README.md`. |
| Read-only protected inputs | Archive/contracts/updater/frontend, other OpenSpec changes/root specs, guides, Git refs/remotes, hosts, and production. |
| Deletion complement | None. |
| Mutable refs | None during apply; apply does not stage, commit, archive, or push. |
| Consumes | Accepted `backend-http-runtime` and `backend-observability`, standard-library HTTP primitives, and backend guide §6.1. |
| Produces | The exact image route, bounded upstream adapter, safe response/error behavior, and tests. |
| Dependencies | Accepted `implement-backend-http-and-observability`; already complete. |
| Deliverables | Production Go implementation plus unit/integration/security/cancellation tests. |
| Acceptance | Targeted tests, `go test -race ./...`, `go vet ./...`, `CGO_ENABLED=0 go test/build`, backend check script, strict OpenSpec, diff/scope/residue gates. |
| Non-goals | UI size selection, wildcard proxy, collection API, CDN/production cache configuration, deploy, or operations. |
| Operations deferred | CDN, production networking, monitoring deployment, rollout, and cache tuning. |
| Stop/rollback conditions | Stop on required writes outside the exact backend envelope or any need for a caller-supplied host/URL; remove only owned uncommitted additions on rollback. |

No other repository or external state is mutated. Push, PR, tag, release,
deployment, host mutation, and production activation remain unauthorized.
Apply is blocked until all four artifacts are strict-valid and main-reviewed.
