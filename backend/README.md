# Backend

This directory is the production backend module. Startup requires an explicit
immutable Archive root and attempts the accepted one-shot load before serving.
A successful load publishes the validated read-only SQLite store. A load
failure emits one bounded `archive_load_failed` JSON event. A non-cancellation
failure serves only the runtime surface permanently not-ready; cancellation
during loading returns without serving. Neither path retries, falls back,
reloads, or exposes a business route.
If the mandatory event writer fails or short-writes, startup closes the owned
Archive state and returns without serving.

The development runtime has exactly three infrastructure routes, one
same-origin image route, and the immutable Catalog route:

```text
GET /livez
GET /readyz
GET /metrics
GET /api/v1/images/bangumi/{subjects|persons|characters}/{positiveID}?type={small|grid|large|medium|common}
GET /api/v1/catalog
```

All five reject other methods. `/readyz` performs one fixed one-second
`archive_meta` identity read through the published Store. `/metrics` is
standard-library, low-cardinality Prometheus text instrumentation; its
production exposure, scrape configuration, retention, alerts, and SLOs remain
deferred operations work. The reusable HTTP transport generates request IDs,
uses the shared error envelope, caps strict JSON bodies at 65,536 bytes, and
requires an endpoint-owned structural validator to accept the exact bounded
raw JSON before any typed destination assignment. It also contains request
deadlines, cancellations, and panics without registering a placeholder
business endpoint.

Typed business responses freeze one request-scoped execution observation
before their first response commitment. The same fixed
`collection/cache/sqlite/compute/projection` values drive `Server-Timing`,
phase histograms, and the allowlisted terminal event. `/metrics` samples the
single process `QueryRuntime.Stats` snapshot once per scrape. Collection and
image upstream metrics describe per-request experiences; coalesced collection
waiters are therefore not presented as additional physical fetches.

An optional `-update-status /absolute/path/update-status.json` flag enables a
strict read-only metrics projection of the shared v1 updater terminal status.
The source must be a non-symlink regular file, is capped at 64 KiB, and never
changes readiness or ordinary API behavior. Its `dataVersion`, error code,
path, and content never become labels.

The image route constructs only fixed `https://api.bgm.tv/v0/...` requests,
ignores environment proxies, rejects redirects and arbitrary request headers,
uses an independent timeout and concurrency pool, admits only reviewed image
MIME values, and streams at most 8 MiB. It stores no image bytes and does not
choose an image type for the frontend.

`GET /api/v1/catalog` projects the currently published immutable Archive Store
into the generated `CatalogSuccessEnvelopeV1`. It performs fresh fixed reads,
returns the published `dataVersion`, rejects query parameters and request
bodies, and exposes no mutation or refresh operation. Before Archive
publication it returns the catalog-specific `NOT_READY` envelope.

The module pins Go 1.26.5 and keeps downloaded toolchains, module/build caches,
temporary files, and binaries below ignored backend-local directories.

`internal/query` is the production, pre-statistics query authority. It
normalizes preserved raw `SharedQueryV1` JSON into the accepted Effective Query
and `q1:` digest, loads corrected facts through fixed argument-bound reads on
the immutable Archive Store, and produces deterministic position, identity,
ranking-person, participation, and participant-intersection sets. Global
evaluation never requests collection data. Personal evaluation accepts one
caller-supplied UID-bound immutable collection snapshot and overlays only its
status, score, update month, and tags.

The package intentionally does not compute statistics, merge series, search,
sort, paginate, cache, fetch a collection, or expose an HTTP endpoint.
`mergeSeries` remains part of Effective Query and its digest for the later
statistics layer, but does not change these raw Subject sets.

`internal/statistics` is the production post-query domain authority. It binds
one immutable series index to the Archive `dataVersion`, derives anime
connected components and versioned representative order, materializes subject
or series units from the accepted raw Subject sets, and computes exact global
and personal rating summaries, preference evidence, distributions, subject
timelines, de-duplicated summaries, and named strict total-order indexes.
Source `float64` scores cross the boundary once through Go's shortest
round-trip decimal representation; all later aggregation, floor, half-up
rounding, equality, and preference work is exact standard-library rational
arithmetic. Reduced rational evidence uses canonical base-10 numerator and
positive-denominator strings in memory and JSON, so it does not inherit
`int64` or JavaScript safe-integer limits. Global evaluation never reads
personal facts. The package exposes
no HTTP shape, search, pagination, cache, network fetch, write-capable SQL, or
global mutable publication.

`internal/runtimecache` is the production in-process resource boundary for
read-only query work. The `internal/app` composition root constructs one
`QueryRuntime` and shares it with rankings, candidates, person detail,
partners, and co-star. It owns one collection cache (including the negative
cache), one result pool, and one executor. Its weighted-LRU kernel enforces
exact retained cost, item, and per-item limits while cloning every published
and returned value. Collection keys retain only a one-way UID digest plus
canonical subject type/statuses; positive values carry a canonical `c1:`
digest and exact fresh/fallback metadata. Only timeout, network, 429, and
upstream 5xx outcomes may use the extra 30-minute stale window. Not-found and
forbidden outcomes invalidate an old positive value and are negative-cached
for two minutes and 30 seconds respectively.

Typed result stores use global/personal semantic keys containing the versioned
operation, Archive `dataVersion`, `queryDigest`, operation `inputDigest`, and a
collection digest only for personal scope. Their heterogeneous cores share one
global LRU with a 190 MiB/512-item process budget and a 32 MiB per-item limit;
the budget is not divided among operations. Before the runtime is exposed,
each domain contributes one opaque canonical binding that fixes its operation,
core type, clone function, cost function, and detached same-key load group.
Facades can only consume that immutable binding; they cannot register or
replace policy. View search, sorting, ordering, and pagination cannot enter
these key types. Expensive different-key work shares the process executor with
at most two running and eight queued tasks. A full queue returns typed
`SERVER_BUSY` with retry guidance. `QueryRuntime.Stats` is the single aggregate
resource snapshot. A typed store's result statistics alias that same shared
pool and must not be summed across services. This package contains no HTTP,
external collection client, Archive access, statistics formula, persistence,
or operations behavior.

```sh
cd backend
./scripts/generate-query-wire.sh --check
./scripts/generate-catalog-wire.sh --check
go test ./internal/query/...
go test ./internal/runtimecache -count=20
go test -race ./internal/runtimecache
go test ./internal/statistics/...
go test ./internal/statistics/... -count=20
go test ./internal/catalog ./internal/httpapi/wire
go test ./internal/httpapi -run '^$' \
  -fuzz '^FuzzDecodeStrictJSON$' -fuzztime=3s
./scripts/check.sh
```

Run the API against a separately approved local Archive root:

```sh
go run ./cmd/api -archive-root /absolute/path/to/archive
```

Optionally include the local read-only updater terminal status:

```sh
go run ./cmd/api \
  -archive-root /absolute/path/to/archive \
  -update-status /absolute/path/to/update-status.json
```

Validate one inactive producer candidate without reading, creating, or
publishing `current.json`:

```sh
go run ./cmd/archive-smoke \
  -archive-root /absolute/path/to/staging \
  -data-version dv1-<64-lowercase-hex>
```

The smoke emits one bounded JSON result and closes the candidate. It does not
activate a version or perform any production/operations work.

To intentionally refresh the generated query transport models after the shared
contract changes:

```sh
cd backend
./scripts/generate-query-wire.sh --write
./scripts/generate-catalog-wire.sh --write
```

The scripts require a bootstrap `go` command plus Node.js and npm compatible
with the shared contract package. Generation copies that package metadata and
lock into disposable state, installs exact Redocly 2.40.0 there, and runs
`oapi-codegen/v2` 2.8.0 with its accepted runtime 1.1.2. Network access is
needed when pinned tools or modules are not already cached. The scripts read
the shared authorities under `../contracts` without modifying or copying them
into persistent backend source.

The runtime pins the CGO-free `modernc.org/sqlite` driver at `v1.54.0` and
guards its resolved `modernc.org/libc` dependency at `v1.74.1`. Archive files
are opened through a per-store root-bound read-only VFS with `mode=ro`,
`immutable=1`, private cache, query-only and foreign-key pragmas. The exported
store entry accepts only one bounded `SELECT` or `WITH` statement; missing,
sidecar, attached, and external files are never created.

Query normalization pins `golang.org/x/text` at `v0.40.0` for NFKC/default
folding and `github.com/gowebpki/jcs` at `v1.0.1` for RFC 8785. The check gate
verifies both versions and licenses, the generated Unicode 15.1 assigned-range
table against its protected authority, every shared query/Unicode/RFC/digest
vector, the query-domain corpus, and a reviewed query-test binary-size budget.
