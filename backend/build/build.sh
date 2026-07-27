#!/usr/bin/env bash
set -euo pipefail

build_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
backend_root="$(CDPATH= cd -- "$build_root/.." && pwd -P)"
repository_root="$(CDPATH= cd -- "$backend_root/.." && pwd -P)"
generated_root="$build_root/.tmp"

# shellcheck source=path-policy.sh
source "$build_root/path-policy.sh"
# shellcheck source=source-policy.sh
source "$build_root/source-policy.sh"
# shellcheck source=toolchain-policy.sh
source "$build_root/toolchain-policy.sh"

go_image='docker.io/library/golang:1.26.5-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651'
runtime_image='gcr.io/distroless/static-debian13:nonroot@sha256:f7f8f729987ad0fdf6b05eeeae94b26e6a0f613bdf46feea7fc40f7bd72953e6'
accepted_openapi='sha256:e7aba7c34b0d6f74e533e8e9fd31c8f0aa40ed15c440669ec87a7204c963cf11'
accepted_manifest_schema='sha256:5a2b0cd7294312e9dcbdd413a1b01c4218652c4c39fd7472b74e40622e7a3e73'
accepted_schema_sql='sha256:3cce7ce75fb4a7d2943ee8b9fb7c5df2639fae8fa0a2e07bddb3e1519ffdc8e0'
accepted_application_version='v0.1.0'
accepted_application_version_digest='sha256:d0b4f9120ba026c00fa23cb84b4e1620a2e6436592e58155a5151653179572c0'
accepted_domain_rules_version='domain-raw-v1'
accepted_cast_rules_version='cast-exact-v1'
accepted_compatibility_matrix='sha256:659121caac966df42a6201dcfb539ac1cd0f7f6a4e452495707833f7c8b889ac'

target_architecture=''
output_root="$generated_root/artifacts"
cache_root="$generated_root/cache"

usage() {
  echo 'usage: ./build/build.sh [--target-arch amd64|arm64] [--output-root PATH] [--cache-root PATH]' >&2
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --target-arch)
      [[ "$#" -ge 2 ]] || {
        usage
        exit 2
      }
      target_architecture="$2"
      shift 2
      ;;
    --output-root)
      [[ "$#" -ge 2 ]] || {
        usage
        exit 2
      }
      output_root="$2"
      shift 2
      ;;
    --cache-root)
      [[ "$#" -ge 2 ]] || {
        usage
        exit 2
      }
      cache_root="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$target_architecture" ]]; then
  case "$(uname -m)" in
    arm64|aarch64) target_architecture='arm64' ;;
    x86_64|amd64) target_architecture='amd64' ;;
    *)
      echo 'unable to infer a supported target architecture' >&2
      exit 1
      ;;
  esac
fi
if [[ "$target_architecture" != 'amd64' && "$target_architecture" != 'arm64' ]]; then
  echo "unsupported target architecture: $target_architecture" >&2
  exit 1
fi

artifact_attest_source "$repository_root"
source_revision="$artifact_source_revision"
source_tree="$artifact_source_tree"
source_date_epoch="$artifact_source_date_epoch"

generated_root="$(artifact_prepare_generated_root "$generated_root")"
output_root="$(artifact_resolve_child_directory "$generated_root" "$output_root" 'output root')"
cache_root="$(artifact_resolve_child_directory "$generated_root" "$cache_root" 'cache root')"
case "$output_root/" in
  "$cache_root/"*)
    echo 'output root must not be nested below the disposable cache root' >&2
    exit 1
    ;;
esac
case "$cache_root/" in
  "$output_root/"*)
    echo 'disposable cache root must not be nested below the output root' >&2
    exit 1
    ;;
esac
artifact_create_child_directory "$output_root"
artifact_create_child_directory "$cache_root"
if [[ -n "$(find "$cache_root" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "disposable cache root is not empty: $cache_root" >&2
  exit 1
fi

work_root="$(mktemp -d "$generated_root/backend-build.XXXXXX")"
cleanup() {
  chmod -R u+w "$work_root" "$cache_root" 2>/dev/null || true
  rm -rf -- "$work_root" "$cache_root"
}
trap cleanup EXIT

snapshot_root="$work_root/source"
artifact_materialize_source_tree "$repository_root" "$source_tree" "$snapshot_root"
snapshot_backend_root="$snapshot_root/backend"
snapshot_contracts_root="$snapshot_root/contracts"

for command in docker git shasum go node; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "$command is required" >&2
    exit 1
  fi
done
if [[ "$(node --version)" != 'v24.18.0' ]]; then
  echo "Node 24.18.0 is required for Contracts validation, got $(node --version)" >&2
  exit 1
fi
artifact_require_container_toolchain

sha256_file() {
  local digest
  digest="$(shasum -a 256 -- "$1" | awk '{print $1}')"
  printf 'sha256:%s' "$digest"
}

openapi_digest="$(sha256_file "$snapshot_contracts_root/openapi/openapi.yaml")"
manifest_schema_digest="$(
  sha256_file "$snapshot_contracts_root/schemas/archive/archive-manifest.schema.json"
)"
schema_sql_digest="$(sha256_file "$snapshot_contracts_root/schemas/archive/schema.sql")"
application_version_digest="$(sha256_file "$snapshot_root/VERSION")"
compatibility_matrix_digest="$(
  sha256_file "$snapshot_contracts_root/schemas/archive/compatibility-matrix.json"
)"
application_version="$accepted_application_version"
if [[ "$openapi_digest" != "$accepted_openapi" ]] ||
  [[ "$manifest_schema_digest" != "$accepted_manifest_schema" ]] ||
  [[ "$schema_sql_digest" != "$accepted_schema_sql" ]] ||
  [[ "$application_version_digest" != "$accepted_application_version_digest" ]] ||
  [[ "$compatibility_matrix_digest" != "$accepted_compatibility_matrix" ]]; then
  echo 'accepted OpenAPI/Archive contract inputs have drifted' >&2
  exit 1
fi

mkdir -p \
  "$cache_root/go-build" \
  "$cache_root/go-mod" \
  "$cache_root/go-path"
export GOCACHE="$cache_root/go-build"
export GOMODCACHE="$cache_root/go-mod"
export GOPATH="$cache_root/go-path"
export GOENV=off
export GOWORK=off
export GOTOOLCHAIN=go1.26.5+auto
if [[ "$(go env GOVERSION)" != 'go1.26.5' ]]; then
  echo "Go 1.26.5 is required, got $(go env GOVERSION)" >&2
  exit 1
fi

helper="$work_root/backend-artifact"
(
  cd "$snapshot_backend_root"
  CGO_ENABLED=0 go build -tags artifacts -buildvcs=false -trimpath -ldflags='-buildid= -s -w' \
    -o "$helper" ./build
)

docker pull "$go_image" >&2

common_build_arguments=(
  --file "$snapshot_backend_root/Dockerfile"
  --platform "linux/$target_architecture"
  --pull
  --no-cache
  --provenance=false
  --sbom=false
  --build-arg "SOURCE_DATE_EPOCH=$source_date_epoch"
  --build-arg "SOURCE_REVISION=$source_revision"
  --build-arg "SOURCE_TREE=$source_tree"
  --build-arg "APPLICATION_VERSION=$application_version"
  --build-arg "OPENAPI_SHA256=$openapi_digest"
  --build-arg "ARCHIVE_MANIFEST_SCHEMA_SHA256=$manifest_schema_digest"
  --build-arg "ARCHIVE_SCHEMA_SQL_SHA256=$schema_sql_digest"
)

binary_root="$work_root/binary"
mkdir -p "$binary_root"
docker buildx build \
  "${common_build_arguments[@]}" \
  --target binary \
  --output "type=local,dest=$binary_root" \
  "$snapshot_backend_root" >&2
api_binary_path="$binary_root/bgmss-api"
archive_smoke_binary_path="$binary_root/archive-smoke"
binary_inventory="$(
  find "$binary_root" -mindepth 1 -maxdepth 1 -print |
    LC_ALL=C sort
)"
expected_binary_inventory="$archive_smoke_binary_path
$api_binary_path"
if [[ "$binary_inventory" != "$expected_binary_inventory" ]] ||
  [[ ! -f "$api_binary_path" || -L "$api_binary_path" ]] ||
  [[ ! -f "$archive_smoke_binary_path" || -L "$archive_smoke_binary_path" ]]; then
  echo 'BuildKit binary export did not produce exactly bgmss-api and archive-smoke' >&2
  exit 1
fi
archive_smoke_build_info="$(
  docker run --rm \
    --pull never \
    --platform "linux/$target_architecture" \
    --network none \
    --read-only \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --mount "type=bind,src=$binary_root,dst=/probe,readonly" \
    --entrypoint /probe/archive-smoke \
    "$go_image" \
    --build-info
)"
expected_build_info="$(
  printf '{"revision":"%s","version":"%s"}' \
    "$source_revision" "$application_version"
)"
if [[ "$archive_smoke_build_info" != "$expected_build_info" ]]; then
  echo 'Archive smoke binary does not report the declared release identity' >&2
  exit 1
fi

raw_image_archive="$work_root/docker-export.tar"
image_name="localhost/bgmss-backend-api:${source_revision}-${target_architecture}"
docker buildx build \
  "${common_build_arguments[@]}" \
  --target runtime \
  --output "type=docker,dest=$raw_image_archive,tar=true,oci-mediatypes=true,rewrite-timestamp=true,name=$image_name" \
  "$snapshot_backend_root" >&2

declared_inputs=(
  'backend/Dockerfile'
  'backend/build/artifact.go'
  'backend/build/build.sh'
  'backend/build/path-policy.sh'
  'backend/build/source-policy.sh'
  'backend/build/toolchain-policy.sh'
  'backend/go.mod'
  'backend/go.sum'
  'VERSION'
  'contracts/openapi/openapi.yaml'
  'contracts/schemas/archive/archive-manifest.schema.json'
  'contracts/schemas/archive/compatibility-matrix.json'
  'contracts/schemas/archive/schema.sql'
)
input_arguments=()
for relative_path in "${declared_inputs[@]}"; do
  input_arguments+=(--input "$relative_path=$(sha256_file "$snapshot_root/$relative_path")")
done
input_arguments+=(
  --input "toolchain/buildkit-image=$artifact_buildkit_image_digest"
)

component_root="$work_root/component"
"$helper" package \
  --api-binary "$api_binary_path" \
  --archive-smoke-binary "$archive_smoke_binary_path" \
  --image-archive "$raw_image_archive" \
  --output "$component_root" \
  --source-revision "$source_revision" \
  --source-tree "$source_tree" \
  --application-version "$application_version" \
  --target-os linux \
  --target-arch "$target_architecture" \
  --openapi-sha256 "$openapi_digest" \
  --archive-manifest-schema-sha256 "$manifest_schema_digest" \
  --archive-schema-sql-sha256 "$schema_sql_digest" \
  --archive-domain-rules-version "$accepted_domain_rules_version" \
  --archive-cast-rules-version "$accepted_cast_rules_version" \
  --archive-compatibility-matrix-sha256 "$compatibility_matrix_digest" \
  --go-image "$go_image" \
  --runtime-image "$runtime_image" \
  "${input_arguments[@]}" >&2
"$helper" verify --artifact-root "$component_root"

ARTIFACT_ROOT="$component_root" CONTRACTS_ROOT="$snapshot_contracts_root/artifacts" \
  node --input-type=module <<'NODE'
import { pathToFileURL } from 'node:url';

const validator = await import(
  pathToFileURL(`${process.env.CONTRACTS_ROOT}/lib/validation.mjs`).href
);
validator.verifyComponentDirectory(process.env.ARTIFACT_ROOT, 'backend');
NODE

"$helper" publish --artifact-root "$component_root" --destination-root "$output_root"
