## Why

The API currently exposes safe request metrics and terminal events, but it does
not yet expose the fixed query phases, process-wide queue/cache state, upstream
outcomes, or the updater's bounded terminal status required by the development
guide. This leaves the implemented query runtime opaque during development and
prevents final artifact acceptance.

## What Changes

- Record the fixed query phases `collection`, `cache`, `sqlite`, `compute`, and
  `projection` once through a request-scoped typed trace. Use that same frozen
  observation for the `Server-Timing` response header, phase histograms, and
  bounded terminal query event facts.
- Export the single process-wide `QueryRuntime.Stats()` snapshot without
  summing the five service aliases, plus closed collection/result cache and
  executor metrics.
- Add closed image/collection upstream outcomes, fixed SQLite observations,
  and a safe optional reader for the authoritative `update-status.json`.
- Preserve the stricter accepted privacy contract: no UID, search/tag/entity
  value, digest, query document, SQL, URL, upstream body, cache key/value, raw
  error, or request-controlled label/event field.
- Keep all work in-process and development-only. Scraping configuration,
  monitoring, alerts, deployment, release, and activation remain deferred.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-observability`: complete the production-code instrumentation needed
  for development acceptance while preserving its closed privacy boundary.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated/specified/main-agent reviewed: complete; apply authorized after strict validation. Implemented/verified/committed/pushed/released/deployed: no |
| Owner | One Backend implementation agent; main agent reviews specification, staged candidate, and acceptance. |
| Writable paths | New `backend/internal/querytiming/**`; `backend/internal/observability/{metrics.go,metrics_test.go,events.go,events_test.go,update_status.go,update_status_test.go}`; `backend/internal/httpapi/{middleware.go,middleware_test.go,handler.go,handler_test.go,transport.go,transport_test.go,rankings_handler.go,rankings_handler_test.go,candidates_handler.go,candidates_handler_test.go,person_detail_handler.go,person_detail_handler_test.go,partners_handler.go,partners_handler_test.go,co_star_handler.go,co_star_handler_test.go,image_handler_test.go}`; `backend/internal/runtimecache/{collection.go,collection_test.go,result.go,result_test.go}`; the five query service `service.go` and `service_test.go` files; `backend/internal/app/{run.go,run_test.go}`; `backend/cmd/api/main.go`; exact architecture/check inventory updates; `backend/README.md`; and this change's task markers |
| Protected inputs | Contracts and updater are read-only; generated wire, Archive schema/data, frontend, oracle, guides, sibling changes, external repository, refs/remotes, services, and hosts are protected. |
| Consumes | Accepted process-wide query runtime, current HTTP observability, update-status v1 schema/goldens, and guide section 13. |
| Produces | Fixed phase trace/header/histograms, safe terminal event enrichment, aggregate runtime/cache/queue/upstream/SQLite metrics, optional Go updater-status reader, and integration tests. |
| Dependencies | Standard library and existing internal packages only; no metrics SDK or remote exporter. |
| Acceptance | Focused/repeated/race tests, privacy/cardinality/header identity assertions, update-status positive/negative goldens, full Backend test/vet/build/check, strict OpenSpec, and diff hygiene. |
| Behavior classification | `NEW_CAPABILITY` for development telemetry only. API bodies and frontend appearance/interaction remain unchanged and preserve oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`. |
| External state | Optional status file is read-only and explicitly configured. No external mutation, network publication, push, tag, release, deploy, or activation. |
| Operations deferred | Production listener exposure, scrape/retention configuration, dashboard, alerts, SLO, pprof, load testing, release, deploy, cutover, and activation. |
| Stop conditions | Stop on path overlap, request-controlled cardinality, header/event leakage, duplicate runtime accounting, generated-contract drift, dependency inversion, flaky timing assertions, or any protected/external mutation. |
