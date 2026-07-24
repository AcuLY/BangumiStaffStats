## Why

The backend has a bounded process and an Archive readiness state, but no production transport or development-observable health surface. This Wave 2 change establishes the strict HTTP and observability substrate required before catalog, image, and query endpoints can be added.

## What Changes

- Add a standard-library `net/http` runtime with bounded server/request timeouts, server-generated request IDs, cancellation propagation, panic containment, strict JSON helpers, and shared error envelopes.
- Add exact `GET /livez`, `GET /readyz`, and internal `GET /metrics` routes; readiness consumes only the accepted Archive state's published store and one bounded fixed read.
- Add concurrency-safe low-cardinality Prometheus exposition and allowlisted JSON app/query events without raw requests, credentials, upstream bodies, or user identifiers.
- Make deadline-versus-cancellation outcomes commit-aware and explicit, and
  keep an Archive startup failure observable through one allowlisted app event
  while the runtime remains not-ready.
- Add transport, fuzz, cancellation, health, metrics, event, and race tests while keeping all business endpoints absent.

Behavior classification: `NEW_CAPABILITY`. The immutable prototype oracle `644b7748674e553f863d0ffd61d029f86fdc0717` has no backend transport or observability behavior to preserve.

## Capabilities

### New Capabilities

- `backend-http-runtime`: Strict bounded HTTP lifecycle, request context, JSON/error transport, and health/readiness routes.
- `backend-observability`: Allowlisted structured events and low-cardinality Prometheus metrics for the runtime surfaces that exist.

### Modified Capabilities

- `backend-runtime-foundation`: Replace the consumer-stage fail-before-serving
  lifecycle with the accepted three-route health runtime, not-ready startup
  failure behavior, and the admitted observability package graph.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved after lifecycle, cancellation, mandatory raw-validator, and startup-event write-failure closure; implemented: complete; owner, independent, and main-agent verification: complete; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | One Backend implementation owner applies after dependency acceptance; main agent reviews and accepts. |
| Writable paths | Planning: `openspec/changes/implement-backend-http-and-observability/**`. Apply: `backend/internal/httpapi/server.go`, `backend/internal/httpapi/server_test.go`, `backend/internal/httpapi/handler.go`, `backend/internal/httpapi/handler_test.go`, `backend/internal/httpapi/middleware.go`, `backend/internal/httpapi/middleware_test.go`, `backend/internal/httpapi/transport.go`, `backend/internal/httpapi/transport_test.go`, `backend/internal/observability/events.go`, `backend/internal/observability/events_test.go`, `backend/internal/observability/metrics.go`, `backend/internal/observability/metrics_test.go`, `backend/internal/app/run.go`, `backend/internal/app/run_test.go`, `backend/cmd/api/main.go`, `backend/internal/architecture/dependencies_test.go`, `backend/scripts/check.sh`, `backend/README.md`, and this change's task markers. |
| Read-only protected inputs | Accepted `backend/internal/archive/**`; `contracts/**`; root specs; formal guides, `PRODUCT.md`, and `DESIGN.md`; generated `backend/internal/httpapi/wire/**`; all other code/changes; Git refs/remotes; other repositories, hosts, and production. |
| Deletion complement | None; no authority, generated model, Archive code, or existing behavior may be deleted. |
| Mutable refs | None during apply; no stage, commit, archive, branch/ref mutation, or push. |
| Consumes | Accepted `backend-runtime-foundation`, `contracts-query-wire`, and the single published state/store interface from accepted `backend-archive-consumer`. |
| Produces | Standard-library HTTP infrastructure, three development health/metrics routes, bounded error/health responses, structured-event sink, and in-process metric registry. |
| Dependencies | `bootstrap-backend-runtime` and `define-shared-query-wire` are accepted; apply is explicitly blocked until `implement-backend-archive-consumer` is accepted. No new module dependency is admitted. |
| Deliverables | Server/router/middleware/transport, health/readiness, commit-aware deadline/cancellation handling, metrics/events including the bounded Archive-load failure event, app assembly, cumulative runtime-foundation amendment, architecture/inventory checks, documentation, and tests. |
| Acceptance | Exact route/method/media/body/error/request-ID tests, mandatory raw-validator and generated-union/custom-unmarshal bypass JSON tests/fuzzing, pre/post-commit cancellation/deadline/panic tests, Archive success/failure/cancellation readiness integration including event writer/short-write startup failure, parseable low-cardinality metrics, event redaction/allowlist tests, synchronized foundation review, full/race/vet/build/OpenSpec gates, and no residue. |
| Non-goals | Catalog/query/statistics/cache/collection/image handlers, Archive validation or mutation, producer/updater events, `update_activated`, authentication/CORS, pprof, Prometheus deployment, operations, or legacy compatibility. |
| Operations deferred | Management-listener exposure policy, Prometheus scrape/retention/alerts, SLOs, production limits, nginx/systemd/Compose, secrets, activation/restart/rollback, release, and deployment. |
| Stop/rollback conditions | Stop before mutation if dependency acceptance, generated authority, writable-path, or concurrent-owner checks drift. On failure, cancel serving, close only owned runtime resources, preserve Archive state and protected inputs, and revert only this owned candidate. |

This change touches no other repository or external mutable state. Push, PR, tag, release, deployment, host mutation, and production activation require later explicit authorization. Apply remains blocked until all four artifacts strictly validate, pass main-agent review, and the Archive consumer is accepted.
