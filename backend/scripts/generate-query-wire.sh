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
work_root="$temporary_root/query-wire"
tool_root="$work_root/tool"
projection_root="$work_root/projection"
generated_file="$work_root/query_wire.gen.go"
target_file="$backend_root/internal/httpapi/wire/query_wire.gen.go"

cleanup_work() {
  rm -rf -- "$work_root"
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
selected_go_root="$("$go_command" env GOROOT)"
pinned_gofmt="$selected_go_root/bin/gofmt"
if [[ ! -x "$pinned_gofmt" || "$selected_go_root" != "$cache_root/go-mod/"*go1.26.5* ]]; then
  echo "Go 1.26.5 GOROOT is not contained in the backend module cache: $selected_go_root" >&2
  exit 1
fi

cp \
  "$repository_root/contracts/goldens/query/package.json" \
  "$repository_root/contracts/goldens/query/package-lock.json" \
  "$tool_root/"
(
  cd "$tool_root"
  "$npm_command" ci --ignore-scripts --no-audit --no-fund
)

redocly_cli="$tool_root/node_modules/@redocly/cli/bin/cli.js"
public_components=(
  CandidatesInputV1
  CandidatesViewV1
  CatalogContextV1
  CoStarInputV1
  CoStarShareWorkspaceV1
  CoStarViewV1
  EffectiveQueryV1
  ErrorEnvelopeV1
  PartnersInputV1
  PartnersViewV1
  PersonDetailInputV1
  PersonDetailViewV1
  QueryDigestProjectionV1
  RankingShareWorkspaceV1
  RankingsViewV1
  SharePayloadV1
  SharedQueryV1
)

build_projection() {
  local current_projection="$1"
  local current_generated="$2"

  "$node_command" \
    "$script_root/prepare-query-wire.mjs" \
    prepare \
    "$current_projection"

  local redocly_version
  redocly_version="$("$node_command" "$redocly_cli" --version --config "$current_projection/redocly.yaml")"
  if [[ "$redocly_version" != "2.40.0" ]]; then
    echo "Redocly 2.40.0 is required, got $redocly_version" >&2
    exit 1
  fi

  "$node_command" "$redocly_cli" bundle \
    "$current_projection/source/openapi/openapi.yaml" \
    --dereferenced \
    --ext json \
    --component-names-strategy basename \
    --component-renaming-conflicts-severity error \
    --remove-unused-components=false \
    --keep-url-references=false \
    --output "$current_projection/query.bundle.json" \
    --config "$current_projection/redocly.yaml"

  "$node_command" \
    "$script_root/prepare-query-wire.mjs" \
    verify-bundle \
    "$current_projection"

  (
    cd "$backend_root"
    "$go_command" tool oapi-codegen \
      -generate models,skip-prune \
      -package wire \
      -o "$current_generated" \
      "$current_projection/query.bundle.json"
  )
  "$pinned_gofmt" -w "$current_generated"

  if [[ ! -s "$current_generated" ]]; then
    echo "generated query models are empty" >&2
    exit 1
  fi
  for component in "${public_components[@]}"; do
    if ! grep -q "^type ${component} " "$current_generated"; then
      echo "generated query model is missing $component" >&2
      exit 1
    fi
  done
}

build_projection "$projection_root" "$generated_file"

if [[ "$mode" == "--write" ]]; then
  mkdir -p "$(dirname -- "$target_file")"
  cp "$generated_file" "$target_file"
  echo "updated ${target_file#"$backend_root/"}"
  exit 0
fi

if [[ ! -f "$target_file" ]]; then
  echo "generated query model is missing: ${target_file#"$backend_root/"}" >&2
  exit 1
fi
if ! cmp -s "$generated_file" "$target_file"; then
  echo "generated query model is stale: ${target_file#"$backend_root/"}" >&2
  exit 1
fi
echo "query wire generation is current"
