# Backend

This directory is the production backend module. The foundation deliberately
serves an empty `http.ServeMux`: product routes and runtime data features belong
to later OpenSpec changes.

The module pins Go 1.26.5 and keeps downloaded toolchains, module/build caches,
temporary files, and binaries below ignored backend-local directories.

```sh
cd backend
./scripts/generate-query-wire.sh --check
./scripts/check.sh
```

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
