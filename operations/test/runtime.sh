#!/usr/bin/env bash
set -euo pipefail

repository_root=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
operations_root="$repository_root/operations"
# shellcheck source=../lib/common.sh
source "$operations_root/lib/common.sh"

fail() {
  printf 'operations runtime test failure: %s\n' "$*" >&2
  exit 1
}

for script in \
  "$operations_root/bin/build-bundle.sh" \
  "$operations_root/bin/check" \
  "$operations_root/bin/deploy" \
  "$operations_root/bin/rollback-app" \
  "$operations_root/bin/validate-isolated" \
  "$operations_root/lib/common.sh"; do
  bash -n "$script"
done

test_root=$(mktemp -d "${TMPDIR:-/tmp}/bgmss-operations-runtime.XXXXXX")
cleanup() {
  local resolved
  resolved=$(realpath "$test_root")
  case "$resolved" in
    "${TMPDIR:-/tmp}"/bgmss-operations-runtime.*) rm -rf -- "$resolved" ;;
    *) fail "refusing to clean unexpected test root: $resolved" ;;
  esac
}
trap cleanup EXIT

root="$test_root/root"
project=bgmss-validation
api_image=localhost/bgmss-backend-api:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-amd64
prometheus_image="$BGMSS_PROMETHEUS_IMAGE_PIN"
api_port=18080
prometheus_port=19090

release_env_document \
  "$root" "$project" "$api_image" "$prometheus_image" \
  "$api_port" "$prometheus_port" production >"$test_root/production.env"
cat >"$test_root/expected-production.env" <<EOF
COMPOSE_PROJECT_NAME=$project
BGMSS_ROOT=$root
BGMSS_API_IMAGE=$api_image
BGMSS_PROMETHEUS_IMAGE=$prometheus_image
BGMSS_API_PORT=$api_port
BGMSS_PROMETHEUS_PORT=$prometheus_port
EOF
cmp -s "$test_root/production.env" "$test_root/expected-production.env" ||
  fail "production release env is not the exact two-service authority"

release_env_document \
  "$root" "$project" "$api_image" "$prometheus_image" \
  "$api_port" "$prometheus_port" validation >"$test_root/validation.env"
for expected in \
  BGMSS_API_MEM_LIMIT=768m \
  BGMSS_API_GOMEMLIMIT=512MiB \
  BGMSS_PROMETHEUS_MEM_LIMIT=192m; do
  grep -Fqx "$expected" "$test_root/validation.env" ||
    fail "validation release env omits $expected"
done
if grep -Eiq 'updater|update-status|proxy' "$test_root/validation.env"; then
  fail "release env retained updater, status-file, or proxy state"
fi

bundle="$test_root/bundle"
data_version="$BGMSS_MINIMAL_DATA_VERSION"
mkdir -p "$bundle/minimal-archive/versions/$data_version"
for file in \
  api.oci.tar \
  frontend.tar \
  compatibility-manifest.json \
  minimal-archive/current.json \
  "minimal-archive/versions/$data_version/manifest.json" \
  "minimal-archive/versions/$data_version/bangumi.sqlite"; do
  : >"$bundle/$file"
done
cat >"$bundle/build.json" <<EOF
{
  "sourceRevision": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "sourceTree": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "applicationVersion": "v0.1.0",
  "platform": "linux/amd64",
  "apiImage": "$api_image",
  "components": ["backend", "frontend"]
}
EOF
(
  cd "$bundle"
  find . -type f ! -name SHA256SUMS -printf '%P\n' |
    LC_ALL=C sort |
    xargs sha256sum --
) >"$bundle/SHA256SUMS"
verify_bundle "$bundle"
verify_build_metadata "$bundle/build.json"

cp "$bundle/build.json" "$test_root/invalid-build.json"
jq '.components += ["updater"]' "$bundle/build.json" >"$test_root/invalid-build.json"
if verify_build_metadata "$test_root/invalid-build.json" 2>/dev/null; then
  fail "build metadata accepted a third product component"
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  env -i PATH="$PATH" \
    COMPOSE_PROJECT_NAME="$project" \
    BGMSS_ROOT="$root" \
    BGMSS_API_IMAGE="$api_image" \
    BGMSS_PROMETHEUS_IMAGE="$prometheus_image" \
    BGMSS_API_PORT="$api_port" \
    BGMSS_PROMETHEUS_PORT="$prometheus_port" \
    docker compose --file "$operations_root/compose.yaml" config --format json |
    jq -e '
      (.services | keys | sort) == ["api", "prometheus"]
      and .services.api.read_only == true
      and .services.prometheus.read_only == true
      and ([.services.api.volumes[]
        | select(.target == "/var/lib/bgmss/archive")
        | .read_only] == [false])
      and ([.services.prometheus.volumes[]
        | select(.source | endswith("/data"))] | length) == 0
    ' >/dev/null || fail "Compose is not the exact API+Prometheus projection"
fi

for active in \
  "$operations_root/compose.yaml" \
  "$operations_root/env.example" \
  "$operations_root/bin/build-bundle.sh" \
  "$operations_root/bin/deploy" \
  "$operations_root/bin/rollback-app" \
  "$operations_root/bin/check" \
  "$operations_root/lib/common.sh"; do
  if grep -Eiq 'BGMSS_UPDATER|updater\.oci|update-status|archive-smoke' "$active"; then
    fail "active runtime path retains retired updater/status/tool input: $active"
  fi
done

printf 'operations runtime tests passed\n'
