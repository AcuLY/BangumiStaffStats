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

"$go_command" test ./internal/httpapi ./internal/app
"$go_command" test ./internal/architecture
"$go_command" test ./internal/httpapi/wire
"$go_command" test ./internal/archive/contracttest
"$go_command" test ./...
"$go_command" test -race ./...
"$go_command" vet ./...
"$go_command" build -o "$temporary_root/bin/api" ./cmd/api

expected_inventory='.gitignore
README.md
cmd/api/main.go
go.mod
go.sum
internal/app/run.go
internal/app/run_test.go
internal/architecture/dependencies_test.go
internal/archive/contracttest/archive_contract_test.go
internal/archive/contracttest/doc.go
internal/httpapi/server.go
internal/httpapi/server_test.go
internal/httpapi/wire/query_contract_test.go
internal/httpapi/wire/query_wire.gen.go
scripts/check.sh
scripts/generate-query-wire.sh
scripts/prepare-query-wire.mjs'
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
if grep -R -n -E '(/health|/ready|/metrics|readiness|image[-_ ]proxy|upstream client)' \
  --include='*.go' --exclude='*_test.go' cmd internal \
  | grep -v 'internal/httpapi/wire/query_wire.gen.go' >/dev/null; then
  echo "deferred route or feature found in production source" >&2
  exit 1
fi

cleanup
trap - EXIT
if [[ -e "$cache_root" || -e "$temporary_root" ]]; then
  echo "backend disposable state remains" >&2
  exit 1
fi
echo "backend checks passed"
