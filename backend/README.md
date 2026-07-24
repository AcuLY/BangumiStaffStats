# Backend

This directory is the production backend module. The process still serves an
empty `http.ServeMux`, but startup now requires an explicit immutable Archive
root and publishes its validated read-only SQLite store before serving.

The module pins Go 1.26.5 and keeps downloaded toolchains, module/build caches,
temporary files, and binaries below ignored backend-local directories.

```sh
cd backend
./scripts/generate-query-wire.sh --check
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
