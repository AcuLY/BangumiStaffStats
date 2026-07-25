#!/usr/bin/env bash
set -euo pipefail

script_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
backend_root="$(CDPATH= cd -- "$script_root/.." && pwd)"
cache_root="$backend_root/.cache"
temporary_root="$backend_root/.tmp"

cleanup() {
  if [[ -d "$cache_root" ]]; then
    chmod -R u+w "$cache_root" 2>/dev/null || true
  fi
  rm -rf -- "$cache_root" "$temporary_root"
}
trap cleanup EXIT
cleanup
mkdir -p \
  "$cache_root/go-build" \
  "$cache_root/go-mod" \
  "$cache_root/go-path" \
  "$cache_root/npm" \
  "$temporary_root/home" \
  "$temporary_root/system" \
  "$temporary_root/bin"

export HOME="$temporary_root/home"
export TMPDIR="$temporary_root/system"
export GOCACHE="$cache_root/go-build"
export GOMODCACHE="$cache_root/go-mod"
export GOPATH="$cache_root/go-path"
export GOENV=off
export GOWORK=off
export GOTOOLCHAIN=go1.26.5+auto
export npm_config_cache="$cache_root/npm"
export npm_config_update_notifier=false
export REDOCLY_TELEMETRY=off

go_command="${GO_BOOTSTRAP:-$(command -v go || true)}"
if [[ -z "$go_command" ]]; then
  echo "go is required" >&2
  exit 1
fi
if [[ "$("$go_command" env GOVERSION)" != "go1.26.5" ]]; then
  echo "Go 1.26.5 is required" >&2
  exit 1
fi
selected_go_root="$("$go_command" env GOROOT)"
pinned_gofmt="$selected_go_root/bin/gofmt"
if [[ ! -x "$pinned_gofmt" || "$selected_go_root" != "$cache_root/go-mod/"*go1.26.5* ]]; then
  echo "Go 1.26.5 GOROOT is not contained in the backend module cache: $selected_go_root" >&2
  exit 1
fi

cd "$backend_root"

"$script_root/generate-query-wire.sh" --check
"$script_root/generate-catalog-wire.sh" --check
"$script_root/generate-rankings-wire.sh" --check
"$script_root/generate-candidates-wire.sh" --check
"$script_root/generate-person-detail-wire.sh" --check
"$script_root/generate-partners-wire.sh" --check
"$script_root/generate-co-star-wire.sh" --check

unformatted="$("$pinned_gofmt" -l cmd internal)"
if [[ -n "$unformatted" ]]; then
  echo "unformatted Go files:" >&2
  echo "$unformatted" >&2
  exit 1
fi

cp go.mod "$temporary_root/go.mod.before"
cp go.sum "$temporary_root/go.sum.before"
"$go_command" mod tidy
cmp -s go.mod "$temporary_root/go.mod.before" || {
  echo "go.mod changes after go mod tidy" >&2
  exit 1
}
cmp -s go.sum "$temporary_root/go.sum.before" || {
  echo "go.sum changes after go mod tidy" >&2
  exit 1
}

"$go_command" test ./internal/httpapi ./internal/observability ./internal/app
"$go_command" test ./internal/httpapi -run '^$' -fuzz '^FuzzDecodeStrictJSON$' -fuzztime=3s
"$go_command" test ./internal/architecture
"$go_command" test ./internal/query/...
"$go_command" test ./internal/ranking
"$go_command" test ./internal/candidates
"$go_command" test ./internal/persondetail
"$go_command" test ./internal/partners
"$go_command" test ./internal/costar
"$go_command" test ./internal/runtimecache
"$go_command" test ./internal/runtimecache -count=20
"$go_command" test ./internal/statistics/...
"$go_command" test ./internal/statistics/... -count=20
"$go_command" test ./internal/statistics -run '^$' -fuzz '^FuzzDecimalBoundary$' -fuzztime=3s
"$go_command" test ./internal/statistics -run '^$' -fuzz '^FuzzSortPersonAverage$' -fuzztime=3s
"$go_command" test ./internal/statistics -run '^$' \
  -bench '^(BenchmarkEvaluateRatings|BenchmarkBuildSeriesIndex|BenchmarkSortPeople)$' \
  -benchtime=1x -benchmem
"$go_command" test ./internal/httpapi/wire
"$go_command" test ./internal/archive/contracttest
"$go_command" test ./internal/archive ./cmd/archive-smoke
"$go_command" test ./...
"$go_command" test -race ./...
"$go_command" vet ./...
"$go_command" build ./...
CGO_ENABLED=0 "$go_command" test ./...
CGO_ENABLED=0 "$go_command" build -o "$temporary_root/bin/api" ./cmd/api
CGO_ENABLED=0 "$go_command" build -o "$temporary_root/bin/archive-smoke" ./cmd/archive-smoke
CGO_ENABLED=0 "$go_command" test -c -o "$temporary_root/bin/query.test" ./internal/query
"$go_command" mod verify

query_test_size="$(wc -c < "$temporary_root/bin/query.test" | tr -d '[:space:]')"
if [[ "$query_test_size" -gt 16777216 ]]; then
  echo "query test binary exceeds reviewed 16 MiB budget: $query_test_size bytes" >&2
  exit 1
fi

sqlite_version="$("$go_command" list -m -f '{{.Version}}' modernc.org/sqlite)"
libc_version="$("$go_command" list -m -f '{{.Version}}' modernc.org/libc)"
if [[ "$sqlite_version" != "v1.54.0" || "$libc_version" != "v1.74.1" ]]; then
  echo "unexpected SQLite dependency versions: sqlite=$sqlite_version libc=$libc_version" >&2
  exit 1
fi
for license in \
  "$GOMODCACHE/modernc.org/sqlite@v1.54.0/LICENSE" \
  "$GOMODCACHE/modernc.org/libc@v1.74.1/LICENSE"; do
  if [[ ! -f "$license" ]] || ! grep -q 'Redistribution and use in source and binary forms' "$license"; then
    echo "expected BSD-style dependency license is absent" >&2
    exit 1
  fi
done

jcs_version="$("$go_command" list -m -f '{{.Version}}' github.com/gowebpki/jcs)"
text_version="$("$go_command" list -m -f '{{.Version}}' golang.org/x/text)"
sync_version="$("$go_command" list -m -f '{{.Version}}' golang.org/x/sync)"
if [[ "$jcs_version" != "v1.0.1" || "$text_version" != "v0.40.0" || "$sync_version" != "v0.22.0" ]]; then
  echo "unexpected query/cache dependency versions: jcs=$jcs_version text=$text_version sync=$sync_version" >&2
  exit 1
fi
jcs_license="$GOMODCACHE/github.com/gowebpki/jcs@v1.0.1/LICENSE"
text_license="$GOMODCACHE/golang.org/x/text@v0.40.0/LICENSE"
sync_license="$GOMODCACHE/golang.org/x/sync@v0.22.0/LICENSE"
if [[ ! -f "$jcs_license" ]] || ! grep -q 'Apache License' "$jcs_license"; then
  echo "expected Apache-2.0 JCS license is absent" >&2
  exit 1
fi
if [[ ! -f "$text_license" ]] ||
  ! grep -q 'Redistribution and use in source and binary forms' "$text_license"; then
  echo "expected BSD-style x/text license is absent" >&2
  exit 1
fi
if [[ ! -f "$sync_license" ]] ||
  ! grep -q 'Redistribution and use in source and binary forms' "$sync_license"; then
  echo "expected BSD-style x/sync license is absent" >&2
  exit 1
fi

expected_inventory='.gitignore
README.md
cmd/api/main.go
cmd/archive-smoke/main.go
cmd/archive-smoke/main_test.go
go.mod
go.sum
internal/app/run.go
internal/app/run_test.go
internal/architecture/dependencies_test.go
internal/archive/contract.go
internal/archive/contracttest/archive_contract_test.go
internal/archive/contracttest/doc.go
internal/archive/errors.go
internal/archive/filesystem.go
internal/archive/golden_test.go
internal/archive/loader.go
internal/archive/mutation_test.go
internal/archive/sqlite.go
internal/archive/state.go
internal/archive/state_test.go
internal/archive/store.go
internal/archive/test_helpers_test.go
internal/candidates/archive.go
internal/candidates/build.go
internal/candidates/build_test.go
internal/candidates/cache.go
internal/candidates/cache_test.go
internal/candidates/doc.go
internal/candidates/errors.go
internal/candidates/operation.go
internal/candidates/projection.go
internal/candidates/request.go
internal/candidates/service.go
internal/candidates/service_model.go
internal/candidates/service_test.go
internal/candidates/types.go
internal/candidates/view.go
internal/candidates/view_test.go
internal/catalog/catalog.go
internal/catalog/catalog_test.go
internal/catalog/store.go
internal/catalog/store_test.go
internal/costar/archive.go
internal/costar/build.go
internal/costar/build_test.go
internal/costar/cache.go
internal/costar/cache_test.go
internal/costar/clone.go
internal/costar/doc.go
internal/costar/errors.go
internal/costar/projection.go
internal/costar/request.go
internal/costar/request_test.go
internal/costar/service.go
internal/costar/service_test.go
internal/costar/types.go
internal/costar/view.go
internal/costar/view_test.go
internal/httpapi/candidates_handler.go
internal/httpapi/candidates_handler_test.go
internal/httpapi/catalog_handler.go
internal/httpapi/catalog_handler_test.go
internal/httpapi/co_star_handler.go
internal/httpapi/co_star_handler_test.go
internal/httpapi/handler.go
internal/httpapi/handler_test.go
internal/httpapi/image_handler_test.go
internal/httpapi/middleware.go
internal/httpapi/middleware_test.go
internal/httpapi/partners_handler.go
internal/httpapi/partners_handler_test.go
internal/httpapi/person_detail_handler.go
internal/httpapi/person_detail_handler_test.go
internal/httpapi/rankings_handler.go
internal/httpapi/rankings_handler_test.go
internal/httpapi/server.go
internal/httpapi/server_test.go
internal/httpapi/transport.go
internal/httpapi/transport_test.go
internal/httpapi/wire/candidates.gen.go
internal/httpapi/wire/candidates_contract_test.go
internal/httpapi/wire/catalog.gen.go
internal/httpapi/wire/catalog_contract_test.go
internal/httpapi/wire/co_star.gen.go
internal/httpapi/wire/co_star_contract_test.go
internal/httpapi/wire/partners.gen.go
internal/httpapi/wire/partners_contract_test.go
internal/httpapi/wire/person_detail.gen.go
internal/httpapi/wire/query_contract_test.go
internal/httpapi/wire/query_wire.gen.go
internal/httpapi/wire/rankings.gen.go
internal/httpapi/wire/rankings_contract_test.go
internal/imageproxy/client.go
internal/imageproxy/client_test.go
internal/observability/events.go
internal/observability/events_test.go
internal/observability/metrics.go
internal/observability/metrics_test.go
internal/partners/archive.go
internal/partners/build.go
internal/partners/build_test.go
internal/partners/cache.go
internal/partners/cache_test.go
internal/partners/doc.go
internal/partners/errors.go
internal/partners/projection.go
internal/partners/request.go
internal/partners/request_test.go
internal/partners/service.go
internal/partners/service_test.go
internal/partners/types.go
internal/partners/view.go
internal/partners/view_test.go
internal/persondetail/archive.go
internal/persondetail/build.go
internal/persondetail/build_test.go
internal/persondetail/cache.go
internal/persondetail/cache_test.go
internal/persondetail/clone.go
internal/persondetail/doc.go
internal/persondetail/errors.go
internal/persondetail/projection.go
internal/persondetail/service.go
internal/persondetail/service_test.go
internal/persondetail/types.go
internal/persondetail/view.go
internal/persondetail/view_test.go
internal/query/archive_loader.go
internal/query/archive_loader_test.go
internal/query/evaluate.go
internal/query/golden_test.go
internal/query/model.go
internal/query/normalize.go
internal/query/normalize_test.go
internal/query/unicode_assigned_15_1.go
internal/query/unicode_assigned_15_1_test.go
internal/ranking/clone.go
internal/ranking/errors.go
internal/ranking/model.go
internal/ranking/service.go
internal/ranking/service_test.go
internal/ranking/store.go
internal/ranking/view.go
internal/runtimecache/collection.go
internal/runtimecache/collection_test.go
internal/runtimecache/concurrency_test.go
internal/runtimecache/detached.go
internal/runtimecache/doc.go
internal/runtimecache/errors.go
internal/runtimecache/executor.go
internal/runtimecache/lru.go
internal/runtimecache/lru_test.go
internal/runtimecache/result.go
internal/runtimecache/result_test.go
internal/statistics/archive_integration_test.go
internal/statistics/benchmark_test.go
internal/statistics/decimal.go
internal/statistics/decimal_test.go
internal/statistics/doc.go
internal/statistics/errors.go
internal/statistics/evaluator.go
internal/statistics/evaluator_test.go
internal/statistics/golden_test.go
internal/statistics/preference.go
internal/statistics/preference_test.go
internal/statistics/property_test.go
internal/statistics/rating.go
internal/statistics/rating_test.go
internal/statistics/series.go
internal/statistics/series_test.go
internal/statistics/sort.go
internal/statistics/sort_test.go
internal/statistics/source.go
internal/statistics/source_test.go
internal/statistics/summary.go
internal/statistics/summary_test.go
internal/statistics/types.go
scripts/check.sh
scripts/generate-candidates-wire.sh
scripts/generate-catalog-wire.sh
scripts/generate-co-star-wire.sh
scripts/generate-partners-wire.sh
scripts/generate-person-detail-wire.sh
scripts/generate-query-wire.sh
scripts/generate-rankings-wire.sh
scripts/prepare-candidates-wire.mjs
scripts/prepare-catalog-wire.mjs
scripts/prepare-co-star-wire.mjs
scripts/prepare-partners-wire.mjs
scripts/prepare-person-detail-wire.mjs
scripts/prepare-query-wire.mjs
scripts/prepare-rankings-wire.mjs'
actual_inventory="$(
  find . -type f \
    -not -path './.cache/*' \
    -not -path './.tmp/*' \
    -print |
    sed 's#^\./##' |
    LC_ALL=C sort
)"
if [[ "$actual_inventory" != "$expected_inventory" ]]; then
  echo "unexpected persistent backend inventory:" >&2
  diff -u <(printf '%s\n' "$expected_inventory") <(printf '%s\n' "$actual_inventory") >&2 || true
  exit 1
fi

if find . -type f \( -name 'go.work' -o -name '*.sqlite' -o -name '*.db' -o -name '*.out' \) \
  -not -path './.cache/*' -not -path './.tmp/*' | grep -q .; then
  echo "forbidden backend artifact found" >&2
  exit 1
fi
if find . -type d \( -name vendor -o -name openspec \) \
  -not -path './.cache/*' -not -path './.tmp/*' | grep -q .; then
  echo "forbidden backend directory found" >&2
  exit 1
fi
if grep -R -n -E '(/health|/proxy|ProxyFromEnvironment|update_activated|net/http/pprof)' \
  --include='*.go' --exclude='*_test.go' cmd internal \
  | grep -v 'internal/httpapi/wire/query_wire.gen.go' >/dev/null; then
  echo "deferred route or feature found in production source" >&2
  exit 1
fi
image_route_literals="$(
  grep -R -n -F '"/api/v1/images/bangumi/"' \
    --include='*.go' --exclude='*_test.go' cmd internal || true
)"
if [[ "$(printf '%s\n' "$image_route_literals" | wc -l | tr -d ' ')" != "1" ]] ||
  [[ "$image_route_literals" != internal/httpapi/handler.go:* ]]; then
  echo "image route literal is missing or outside its exact owner" >&2
  printf '%s\n' "$image_route_literals" >&2
  exit 1
fi

cleanup
trap - EXIT
if [[ -e "$cache_root" || -e "$temporary_root" ]]; then
  echo "backend disposable state remains" >&2
  exit 1
fi
echo "backend checks passed"
