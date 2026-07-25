#!/usr/bin/env bash
set -euo pipefail

script_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
backend_root="$(CDPATH= cd -- "$script_root/.." && pwd)"
repository_root="$(CDPATH= cd -- "$backend_root/.." && pwd)"
mode="${1:-}"

if [[ "$mode" != "--write" && "$mode" != "--check" ]] || [[ "$#" -ne 1 ]]; then
  echo "usage: $0 <--write|--check>" >&2
  exit 2
fi

go_command="${GO_BOOTSTRAP:-$(command -v go || true)}"
node_command="$(command -v node || true)"
npm_command="$(command -v npm || true)"
if [[ -z "$go_command" || -z "$node_command" || -z "$npm_command" ]]; then
  echo "go, node, and npm are required" >&2
  exit 1
fi

cache_root="$backend_root/.cache"
temporary_root="$backend_root/.tmp"
work_root="$temporary_root/catalog-wire"
tool_root="$work_root/tool"
projection_root="$work_root/projection"
generated_file="$work_root/catalog.gen.go"
target_file="$backend_root/internal/httpapi/wire/catalog.gen.go"

cleanup_work() {
  if [[ -d "$work_root" && ! -L "$work_root" ]]; then
    chmod -R u+rwX "$work_root" 2>/dev/null || true
    find "$work_root" -depth -delete
  fi
}
trap cleanup_work EXIT
cleanup_work
mkdir -p \
  "$cache_root/go-build" \
  "$cache_root/go-mod" \
  "$cache_root/go-path" \
  "$cache_root/npm" \
  "$temporary_root/home" \
  "$temporary_root/system" \
  "$tool_root"

export HOME="$temporary_root/home"
export TMPDIR="$temporary_root/system"
export GOCACHE="$cache_root/go-build"
export GOMODCACHE="$cache_root/go-mod"
export GOPATH="$cache_root/go-path"
export GOENV=off
export GOWORK=off
if [[ "${BGMSS_ACCEPTANCE_GOROOT+x}" == 'x' &&
  "$BGMSS_ACCEPTANCE_GOROOT" == "$cache_root/go-mod/golang.org/toolchain@v0.0.1-go1.26.5.darwin-arm64" ]]; then
  export GOTOOLCHAIN=local
else
  export GOTOOLCHAIN=go1.26.5+auto
fi
export npm_config_cache="$cache_root/npm"
export npm_config_update_notifier=false
export REDOCLY_TELEMETRY=off

if [[ "$("$go_command" env GOVERSION)" != "go1.26.5" ]]; then
  echo "Go 1.26.5 is required" >&2
  exit 1
fi

cp \
  "$repository_root/contracts/goldens/api/catalog/package.json" \
  "$repository_root/contracts/goldens/api/catalog/package-lock.json" \
  "$tool_root/"
(
  cd "$tool_root"
  "$npm_command" ci --ignore-scripts --no-audit --no-fund
)

"$node_command" "$script_root/prepare-catalog-wire.mjs" "$projection_root"
redocly_cli="$tool_root/node_modules/@redocly/cli/bin/cli.js"
if [[ "$("$node_command" "$redocly_cli" --version --config "$projection_root/redocly.yaml")" != "2.40.0" ]]; then
  echo "Redocly 2.40.0 is required" >&2
  exit 1
fi
"$node_command" "$redocly_cli" bundle \
  "$projection_root/source/openapi/openapi.yaml" \
  --output "$work_root/catalog.bundle.json" \
  --config "$projection_root/redocly.yaml"
(
  cd "$backend_root"
  "$go_command" tool oapi-codegen \
    -generate models,skip-prune \
    -package wire \
    -o "$generated_file" \
    "$work_root/catalog.bundle.json"
)

# The production projection deliberately excludes shared error declarations
# already owned byte-for-byte by query_wire.gen.go.
expected_sha="a50ccd6a148158a90111de7abb7bced4df1db084b718ad495b8dfcdc5373c04d"
actual_sha="$(shasum -a 256 "$generated_file" | awk '{print $1}')"
if [[ "$actual_sha" != "$expected_sha" ]]; then
  echo "catalog wire digest mismatch: $actual_sha" >&2
  exit 1
fi

if [[ "$mode" == "--write" ]]; then
  mkdir -p "$(dirname -- "$target_file")"
  cp "$generated_file" "$target_file"
  echo "updated ${target_file#"$backend_root/"}"
  exit 0
fi
if [[ ! -f "$target_file" ]] || ! cmp -s "$generated_file" "$target_file"; then
  echo "generated catalog model is stale: ${target_file#"$backend_root/"}" >&2
  exit 1
fi
echo "catalog wire generation is current"
