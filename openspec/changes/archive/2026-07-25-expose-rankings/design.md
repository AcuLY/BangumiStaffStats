## Context

The expensive core is `query.Result + statistics.Evaluation` for one immutable
Archive and usable collection snapshot. Search, sort, direction, and pagination
are view projection and must not re-run the core or change summary/ranks.

## Contract decisions

- `POST /api/v1/rankings` accepts `{query, view?, refreshCollection?}` only.
- `view` defaults to empty search, `count`, descending, page 1, pageSize 10.
- Scores crossing the wire use nullable integer hundredths. Preference keeps
  canonical rational strings plus evidence counts; frontend display conversion
  is presentation only.
- A person reference is `{id,name,nameCN}` with nullable `nameCN` and no image
  URL. Images remain derived through the same-origin proxy.
- `summary` is complete-core `{personCount,workUnit,workCount,characterCount?}`.
- `metricScale` is computed before search from the selected primary metric and
  carries the same scalar representation as rows.
- `rank` is assigned after complete-set sorting and before search/page.
- Personal response includes collection freshness; global response omits both
  collection metadata and preference properties.
- Query, catalog, and rankings generators each select their owned operation or
  component graph before hashing and generation. Evidence hashes the canonical
  capability projection, never the complete shared OpenAPI document, so adding
  an unrelated operation cannot mutate or invalidate an accepted projection.

## Service decisions

The ranking package loads one Archive fact set and person-name projection,
normalizes the query against current catalog context, evaluates query/statistics
once, creates immutable row cores, and projects views from copies/indexes.
Personal collection loading is injected; global mode never calls it.

The service accepts the bounded result-cache interface. The key excludes view
fields and includes dataVersion/queryDigest and personal collectionDigest.
Until the public collection adapter is admitted, tests use explicit providers;
there is no fixture or hidden network fallback in production wiring.

## HTTP decisions

The handler enforces POST, JSON content type, 64 KiB body, unknown-field and
trailing-document rejection, no query parameters, no-store responses, stable
errors, requestId/dataVersion metadata, and cancellation without partial write.
The route is registered even when Archive/collection dependencies are not
ready and then returns the stable readiness/upstream error.

## Verification

Contract goldens cover personal/global, every sort, missing metrics, rank-before-
search, pagination, cast summary, empty and out-of-range pages, invalid
scope/view/refresh, and cancellation. Backend repeated/race/vet/build/check and
frontend generated-contract drift gates must pass.
