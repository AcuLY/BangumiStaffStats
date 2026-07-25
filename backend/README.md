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

```sh
cd backend
./scripts/generate-query-wire.sh --check
./scripts/generate-catalog-wire.sh --check
go test ./internal/query/...
go test ./internal/catalog ./internal/httpapi/wire
go test ./internal/httpapi -run '^$' \
  -fuzz '^FuzzDecodeStrictJSON$' -fuzztime=3s
./scripts/check.sh
```

Run the API against a separately approved local Archive root:

```sh
go run ./cmd/api -archive-root /absolute/path/to/archive
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
