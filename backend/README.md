# Backend

This directory is the production backend module. Startup requires an explicit
writable Archive root, reads `current.json` once, and minimally opens the
selected immutable SQLite Store before starting the in-process Go Archive
scheduler/builder. Runtime opening does not read `manifest.json`, hash or
recount SQLite, run integrity/foreign-key/schema checks, or perform Archive
admission; the Go builder completes those producer checks before inactive
publication. A successful initial open publishes the contained root-bound,
read-only/query-only Store internally, but app admission remains closed until
same-process public preparation completes: one series index, then fact sets for
anime, book, music, game and real, serially within one 120-second attempt. No
UID, collection fetch or user-result computation is part of preparation. The
common prepared view gates readiness, catalog and all five query services;
liveness and metrics stay responsive. Preparation is canceled and joined before
Store close if serving fails or the process stops. A post-open preparation
failure stays not-ready and exits boundedly, rather than serving cold queries.

Data activation uses a short query-maintenance interval: close new admission,
drain HTTP plus detached workers through their actual completion, retire old
Store-keyed caches, then prepare and commit the candidate. Old data/Store remain
available for rollback. A failed candidate/commit is restored and old data is
re-prepared with an independent at-most-120-second process-bound recovery attempt
before admission reopens. Failed restoration/recovery stays not-ready. Full old
and new cache generations are not retained together. This changes initialization
and activation only, not statistics, wire contracts or query/resource budgets.

A non-cancellation open failure emits one bounded
`archive_load_failed` event and begins degraded serving; the asynchronous
freshness check can later build and activate a complete Store without
restarting the process or listener.
If the mandatory event writer fails or short-writes, startup closes the owned
Archive state and returns without serving.

A successfully loaded runtime has three infrastructure routes, one
same-origin image route, the immutable Catalog route, and five strict
business-operation routes:

```text
GET /livez
GET /readyz
GET /metrics
GET /api/v1/images/bangumi/{subjects|persons|characters}/{positiveID}?type={small|grid|large|medium|common}
GET /api/v1/catalog
POST /api/v1/rankings
POST /api/v1/candidates
POST /api/v1/person-detail
POST /api/v1/partners
POST /api/v1/co-star
```

Every route rejects unapproved methods. `/readyz` performs one fixed one-second
`archive_meta` identity read through the prepared Store; an unprepared Store or
active maintenance window cannot become ready from this probe alone. `/metrics` is
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

Archive update events and `bgmss_archive_update_*` metrics come directly from
bounded in-process state. There is no Python updater, `update-status.json`
reader/writer, or external scheduler handoff.

The image route starts only at fixed `https://api.bgm.tv/v0/...` requests. It
ignores generic `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, and `NO_PROXY`
settings; an optional `BGMSS_IMAGE_HTTPS_PROXY=http://HOST:PORT` selects one
strictly validated canonical, credential-free dedicated egress proxy. A
present empty, invalid, or noncanonical value fails startup without reflecting
the value. The client manually accepts at most one exact `302` redirect to
absolute `https://lain.bgm.tv/...` (default HTTPS port only) and rejects every
other or second redirect. Both hops share one image-specific timeout and
concurrency permit, arbitrary request headers remain excluded, only reviewed
image MIME values are admitted, and at most 8 MiB is streamed. The backend
stores no image bytes and does not choose an image type for the frontend.

`GET /api/v1/catalog` projects the currently published immutable Archive Store
into the generated `CatalogSuccessEnvelopeV1`. It performs fresh fixed reads,
returns the published `dataVersion`, rejects query parameters and request
bodies, and exposes no mutation or refresh operation. Before prepared admission, or during maintenance/recovery, it returns the
catalog-specific `NOT_READY` envelope.

The module pins Go 1.26.5 and keeps downloaded toolchains, module/build caches,
temporary files, and binaries below ignored backend-local directories.

Public collections use the immutable `bangumi-collection-go` v0.1.2 release.
Same-ID nested subject metadata may have a different supported subject type;
the adapter preserves the top-level collection type and all collection fields.
Statistical inclusion continues to use the existing Archive/query authority.

Query timeout budgets are 10 seconds per outbound collection HTTP attempt,
90 seconds for a complete collection load (pagination, rate-limiter waits and
retries included), and 20 seconds for a shared result worker (executor queue,
Archive reads and computation included). The outer API request has 120 seconds
and the HTTP server write timeout is 125 seconds. The process-shared anonymous
collection client uses five requests per second with burst ten. These limits
preserve existing retry, cancellation, singleflight and cache-TTL behavior;
they do not guarantee that an upstream response is valid or available. The
repository Nginx template waits 130 seconds; an existing deployed vhost needs
its own authorized rollout to receive that setting.

`internal/query` is the production, pre-statistics query authority. It
normalizes preserved raw `SharedQueryV1` JSON into the accepted Effective Query
and `q1:` digest, loads corrected facts through fixed argument-bound reads on
the immutable Archive Store, and produces deterministic position, identity,
ranking-person, participation, and participant-intersection sets. Global
evaluation never requests collection data. Personal evaluation accepts one
caller-supplied UID-bound immutable collection snapshot and overlays only its
status, score, update month, and tags.

The package intentionally does not compute statistics, merge series, search,
sort, paginate, cache operation results, fetch a collection, or expose an HTTP
endpoint itself. Its immutable public FactSet cache remains Store-keyed and is
prepared and retired by the app lifecycle.
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

Candidate pages use the same unit normalization and exact averages through
`statistics.EvaluateCandidateMetrics`, without building unused contribution
evidence, rating charts, preference evidence or full summaries for every person.
To measure uncached all-position computation against a local Archive, set
`BGMSS_BENCHMARK_ARCHIVE_ROOT` and run `go test ./internal/candidates -run '^$'
-bench BenchmarkGlobalAllPositions -benchtime=1x -benchmem` with the pinned Go
toolchain. The benchmark does not change the production computation timeout.

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

Run the API against a separately approved writable local Archive root:

```sh
go run ./cmd/api -archive-root /absolute/path/to/archive
```

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
