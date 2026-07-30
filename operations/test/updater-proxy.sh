#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

fail() {
  printf 'updater proxy test error: %s\n' "$*" >&2
  exit 1
}

repository_root=$(
  CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P
)
# shellcheck source=../lib/common.sh
source "$repository_root/operations/lib/common.sh"

for command in docker jq; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done

temporary_parent=${RUNNER_TEMP:-/tmp}
[[ "$temporary_parent" == /* && -d "$temporary_parent" && ! -L "$temporary_parent" ]] ||
  fail "temporary parent must be one absolute real directory"
test_root=$(mktemp -d "$temporary_parent/bgmss-updater-proxy-test.XXXXXX")
cleanup() {
  local result=$?
  trap - EXIT HUP INT TERM
  if [[ -d "$test_root" && ! -L "$test_root" &&
    "${test_root%/*}" == "$temporary_parent" &&
    "${test_root##*/}" == bgmss-updater-proxy-test.* ]]; then
    rm -rf -- "$test_root"
  else
    printf 'updater proxy test error: refusing ambiguous cleanup\n' >&2
    result=1
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

proxy_url=http://proxy.internal:7897
proxy_network=proxy-net
require_updater_https_proxy "$proxy_url"
require_updater_proxy_network "$proxy_network"
host_253="$(printf 'a%.0s' {1..63}).$(printf 'b%.0s' {1..63}).$(printf 'c%.0s' {1..63}).$(printf 'd%.0s' {1..61})"
host_254="${host_253}d"
require_updater_https_proxy "http://$host_253:65535"
require_updater_proxy_network "$(printf 'n%.0s' {1..128})"
if (require_updater_https_proxy "http://$host_254:7897" >/dev/null 2>&1) ||
  (require_updater_https_proxy "http://$(printf 'a%.0s' {1..64}).example:7897" \
    >/dev/null 2>&1); then
  fail "proxy host or DNS-label boundary was widened"
fi

invalid_urls=(
  ''
  'HTTP://proxy.internal:7897'
  'https://proxy.internal:7897'
  'http://proxy.internal'
  'http://proxy.internal:0'
  'http://proxy.internal:07897'
  'http://proxy.internal:65536'
  'http://Proxy.internal:7897'
  'http://-proxy.internal:7897'
  'http://proxy-.internal:7897'
  'http://proxy..internal:7897'
  'http://proxy.internal.:7897'
  'http://user@proxy.internal:7897'
  'http://proxy.internal:7897/'
  'http://proxy.internal:7897/path'
  'http://proxy.internal:7897?query'
  'http://proxy.internal:7897#fragment'
  'http://[::1]:7897'
  'http://pröxy.internal:7897'
  "$(printf 'x%.0s' {1..321})"
)
for invalid in "${invalid_urls[@]}"; do
  if (require_updater_https_proxy "$invalid" >/dev/null 2>&1); then
    fail "invalid proxy URL was admitted"
  fi
done
for invalid in '' '-proxy' 'proxy/network' "$(printf 'n%.0s' {1..129})"; do
  if (require_updater_proxy_network "$invalid" >/dev/null 2>&1); then
    fail "invalid proxy network was admitted"
  fi
done

workflow_prefix=$'name: development-artifacts\n\njobs:\n  verify:\n    runs-on: ubuntu-24.04'
printf '%s\n' "$workflow_prefix" >"$test_root/accepted-legacy-ci.yml"
printf '%s\n\n%s\n' \
  "$workflow_prefix" "$BGMSS_OPERATIONS_PREVIEW_CALLER" >"$test_root/current-ci.yml"

workflow_pair_matches() {
  local accepted=$1 current=$2 lines accepted_line current_line
  lines=$(development_workflow_prefix_lines "$accepted" "$current")
  IFS='|' read -r accepted_line current_line <<<"$lines"
  cmp -s \
    <(_development_workflow_product_prefix "$accepted" "$accepted_line") \
    <(_development_workflow_product_prefix "$current" "$current_line")
}

workflow_pair_matches \
  "$test_root/accepted-legacy-ci.yml" "$test_root/current-ci.yml" ||
  fail "legacy accepted Development workflow prefix did not match"
cp -- "$test_root/current-ci.yml" "$test_root/accepted-caller-ci.yml"
workflow_pair_matches \
  "$test_root/accepted-caller-ci.yml" "$test_root/current-ci.yml" ||
  fail "caller-bearing accepted Development workflow prefix did not match"
sed 's/ubuntu-24.04/ubuntu-22.04/' \
  "$test_root/current-ci.yml" >"$test_root/changed-product-ci.yml"
if (workflow_pair_matches \
  "$test_root/accepted-legacy-ci.yml" "$test_root/changed-product-ci.yml" \
  >/dev/null 2>&1); then
  fail "Development workflow product-prefix drift was admitted"
fi
sed 's/needs: verify/needs: unreviewed/' \
  "$test_root/current-ci.yml" >"$test_root/changed-caller-ci.yml"
if (workflow_pair_matches \
  "$test_root/accepted-legacy-ci.yml" "$test_root/changed-caller-ci.yml" \
  >/dev/null 2>&1); then
  fail "Development workflow caller drift was admitted"
fi
grep -Fqx \
  '  development_workflow_prefix_lines "$accepted_ci" "$current_ci"' \
  "$repository_root/operations/bin/build-bundle.sh" ||
  fail "operations bundle no longer invokes the paired Development workflow guard"
[[ "$(grep -Fc 'if ! cmp -s' "$repository_root/operations/bin/build-bundle.sh")" -eq 1 ]] ||
  fail "operations bundle must contain exactly one product-prefix comparison"

root="$test_root/root"
mkdir -p "$root/compose" "$root/state"
cp -- "$repository_root/operations/compose.yaml" "$root/compose/compose.yaml"
cp -- "$repository_root/operations/compose.updater-proxy.yaml" \
  "$root/compose/compose.updater-proxy.yaml"

write_env() {
  local destination=$1 mode=$2 url=${3:-} network=${4:-}
  release_env_document \
    "$root" bgmss-proxy-test \
    localhost/bgmss-api:test localhost/bgmss-updater:test \
    "$BGMSS_PROMETHEUS_IMAGE_PIN" 18080 19090 validation \
    "$mode" "$url" "$network" >"$destination"
}

write_env "$test_root/direct.env" direct
[[ "$(release_transport_state "$test_root/direct.env")" == 'direct||' ]] ||
  fail "direct release state did not round-trip"
! grep -q '^BGMSS_UPDATER_HTTPS_PROXY=' "$test_root/direct.env" ||
  fail "direct release unexpectedly contains a proxy URL"

write_env "$test_root/proxy.env" proxy "$proxy_url" "$proxy_network"
[[ "$(release_transport_state "$test_root/proxy.env")" == \
  "proxy|$proxy_url|$proxy_network" ]] ||
  fail "proxy release state did not round-trip"

cross_key_network=BGMSS_UPDATER_TRANSPORT
write_env "$test_root/cross-key-value.env" proxy "$proxy_url" "$cross_key_network"
[[ "$(release_transport_state "$test_root/cross-key-value.env")" == \
  "proxy|$proxy_url|$cross_key_network" ]] ||
  fail "canonical proxy value containing another transport key was rejected"

sed '/^BGMSS_UPDATER_TRANSPORT=/d' "$test_root/direct.env" >"$test_root/pre-change.env"
[[ "$(release_transport_state "$test_root/pre-change.env")" == 'direct||' ]] ||
  fail "pre-change env was not interpreted as direct"

[[ "$(resolve_updater_transport_request preserve "$test_root/pre-change.env")" == 'direct||' ]] ||
  fail "preserve did not resolve a pre-change env to direct"
[[ "$(resolve_updater_transport_request preserve "$test_root/proxy.env")" == \
  "proxy|$proxy_url|$proxy_network" ]] ||
  fail "preserve did not retain the current proxy pair"
[[ "$(resolve_updater_transport_request direct "$test_root/proxy.env")" == 'direct||' ]] ||
  fail "explicit direct did not remove the current proxy pair"
[[ "$(resolve_updater_transport_request \
  proxy "$test_root/direct.env" "$proxy_url" "$proxy_network")" == \
  "proxy|$proxy_url|$proxy_network" ]] ||
  fail "explicit proxy did not adopt the requested pair"

cp -- "$test_root/proxy.env" "$test_root/previous.env"
cp -- "$test_root/direct.env" "$test_root/current.env"
cmp -s "$test_root/proxy.env" "$test_root/previous.env" ||
  fail "previous proxy env was not preserved byte-for-byte"
cp -- "$test_root/previous.env" "$test_root/current.env"
[[ "$(release_transport_state "$test_root/current.env")" == \
  "proxy|$proxy_url|$proxy_network" ]] ||
  fail "preserved proxy state did not restore"

for invalid_case in partial duplicate invalid-mode invalid-url invalid-network; do
  cp -- "$test_root/direct.env" "$test_root/invalid.env"
  case "$invalid_case" in
    partial)
      sed -i.bak \
        's/^BGMSS_UPDATER_TRANSPORT=direct$/BGMSS_UPDATER_TRANSPORT=proxy/' \
        "$test_root/invalid.env"
      rm -f -- "$test_root/invalid.env.bak"
      printf 'BGMSS_UPDATER_HTTPS_PROXY=%s\n' "$proxy_url" >>"$test_root/invalid.env"
      ;;
    duplicate)
      printf 'BGMSS_UPDATER_TRANSPORT=direct\n' >>"$test_root/invalid.env"
      ;;
    invalid-mode)
      sed -i.bak 's/BGMSS_UPDATER_TRANSPORT=direct/BGMSS_UPDATER_TRANSPORT=ambient/' \
        "$test_root/invalid.env"
      rm -f -- "$test_root/invalid.env.bak"
      ;;
    invalid-url)
      sed -i.bak \
        's/^BGMSS_UPDATER_TRANSPORT=direct$/BGMSS_UPDATER_TRANSPORT=proxy/' \
        "$test_root/invalid.env"
      rm -f -- "$test_root/invalid.env.bak"
      printf 'BGMSS_UPDATER_HTTPS_PROXY=http://user@private.invalid:1\n' \
        >>"$test_root/invalid.env"
      printf 'BGMSS_UPDATER_PROXY_NETWORK=%s\n' "$proxy_network" >>"$test_root/invalid.env"
      ;;
    invalid-network)
      sed -i.bak \
        's/^BGMSS_UPDATER_TRANSPORT=direct$/BGMSS_UPDATER_TRANSPORT=proxy/' \
        "$test_root/invalid.env"
      rm -f -- "$test_root/invalid.env.bak"
      printf 'BGMSS_UPDATER_HTTPS_PROXY=%s\n' "$proxy_url" >>"$test_root/invalid.env"
      printf 'BGMSS_UPDATER_PROXY_NETWORK=-invalid\n' >>"$test_root/invalid.env"
      ;;
  esac
  if (release_transport_state "$test_root/invalid.env" >/dev/null 2>&1); then
    fail "$invalid_case release env was admitted"
  fi
done

ambiguous_transport_assignments=(
  'BGMSS_UPDATER_TRANSPORT = proxy'
  'BGMSS_UPDATER_HTTPS_PROXY = http://ambient.invalid:1'
  'BGMSS_UPDATER_PROXY_NETWORK: ambient-network'
  ' BGMSS_UPDATER_TRANSPORT=proxy'
  'export BGMSS_UPDATER_HTTPS_PROXY=http://ambient.invalid:1'
)
for assignment in "${ambiguous_transport_assignments[@]}"; do
  cp -- "$test_root/direct.env" "$test_root/ambiguous.env"
  printf '%s\n' "$assignment" >>"$test_root/ambiguous.env"
  if (release_transport_state "$test_root/ambiguous.env" >/dev/null 2>&1); then
    fail "noncanonical Compose env assignment was admitted"
  fi
done

system_path=$PATH
real_docker=$(command -v docker)
mkdir -p "$test_root/fake-bin"
cat >"$test_root/fake-bin/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
for key in \
  BGMSS_UPDATER_TRANSPORT \
  BGMSS_UPDATER_HTTPS_PROXY \
  BGMSS_UPDATER_PROXY_NETWORK; do
  [[ -z "${!key+x}" ]] || {
    printf 'ambient %s reached Compose\n' "$key" >&2
    exit 90
  }
done
printf '%s\n' "$*" >>"$BGMSS_DOCKER_CALLS"
exec "$BGMSS_REAL_DOCKER" "$@"
SH
chmod 0755 "$test_root/fake-bin/docker"
export BGMSS_REAL_DOCKER=$real_docker
export BGMSS_DOCKER_CALLS="$test_root/docker.calls"
export PATH="$test_root/fake-bin:$PATH"
export BGMSS_UPDATER_TRANSPORT=proxy
export BGMSS_UPDATER_HTTPS_PROXY=http://ambient.invalid:1
export BGMSS_UPDATER_PROXY_NETWORK=ambient-network
export BGMSS_IMAGE_HTTPS_PROXY=http://ambient-image.invalid:1
export HTTP_PROXY=http://ambient-http.invalid:1
export HTTPS_PROXY=http://ambient-https.invalid:1
export ALL_PROXY=http://ambient-all.invalid:1
export NO_PROXY='*'
export http_proxy=http://ambient-http-lower.invalid:1
export https_proxy=http://ambient-https-lower.invalid:1
export all_proxy=http://ambient-all-lower.invalid:1
export no_proxy='*'

cp -- "$test_root/direct.env" "$root/state/current.env"
compose "$root" config --format json >"$test_root/direct.json"
jq -e '
  .services.updater.environment.SQLITE_TMPDIR == "/var/lib/bgmss/archive"
  and (((.services.updater.environment // {})
    | with_entries(select(.key | test("proxy"; "i")))
    | keys) == [])
  and ((.services.updater.networks | keys | sort) == ["backend"])
  and ((.services.api.networks | keys | sort) == ["backend"])
  and ((.services.prometheus.networks | keys | sort) == ["backend"])
  and (((.services.api.environment // {})
    | with_entries(select(.key | test("proxy"; "i")))
    | keys) == [])
  and (((.services.prometheus.environment // {})
    | with_entries(select(.key | test("proxy"; "i")))
    | keys) == [])
  and ((.services.api.environment // {}) | has("SQLITE_TMPDIR") | not)
  and ((.services.prometheus.environment // {}) | has("SQLITE_TMPDIR") | not)
  and (.networks | has("updater_proxy") | not)
' "$test_root/direct.json" >/dev/null ||
  fail "direct Compose projection is not closed"

cp -- "$test_root/proxy.env" "$root/state/current.env"
compose "$root" config --format json >"$test_root/proxy.json"
jq -e \
  --arg proxy "$proxy_url" \
  --arg network "$proxy_network" '
    .services.updater.environment.SQLITE_TMPDIR == "/var/lib/bgmss/archive"
    and .services.updater.environment.BGMSS_HTTPS_PROXY == $proxy
    and ((.services.updater.networks | keys | sort) == ["backend","updater_proxy"])
    and (((.services.updater.environment // {})
      | with_entries(select(.key | test("proxy"; "i")))
      | keys) == ["BGMSS_HTTPS_PROXY"])
    and .services.api.environment.BGMSS_IMAGE_HTTPS_PROXY == $proxy
    and ((.services.api.networks | keys | sort) == ["backend","updater_proxy"])
    and (((.services.api.environment // {})
      | with_entries(select(.key | test("proxy"; "i")))
      | keys) == ["BGMSS_IMAGE_HTTPS_PROXY"])
    and ((.services.prometheus.networks | keys | sort) == ["backend"])
    and (((.services.prometheus.environment // {})
      | with_entries(select(.key | test("proxy"; "i")))
      | keys) == [])
    and ((.services.api.environment // {}) | has("SQLITE_TMPDIR") | not)
    and ((.services.prometheus.environment // {}) | has("SQLITE_TMPDIR") | not)
    and .networks.updater_proxy.external == true
    and .networks.updater_proxy.name == $network
  ' "$test_root/proxy.json" >/dev/null ||
  fail "proxy Compose projection widened or changed release authority"

(
  set -euo pipefail
  transaction_fake_bin="$test_root/transaction-fake-bin"
  command_root="$test_root/command-root"
  boundary_bundle="$test_root/boundary-bundle"
  payload_root="$test_root/payload"
  mkdir -p \
    "$transaction_fake_bin" \
    "$command_root/data/versions/$BGMSS_MINIMAL_DATA_VERSION" \
    "$command_root/releases/old/frontend" \
    "$command_root/releases/old/tools" \
    "$command_root/state" \
    "$command_root/compose" \
    "$command_root/config/prometheus" \
    "$command_root/prometheus" \
    "$boundary_bundle" \
    "$payload_root/frontend" \
    "$payload_root/tools"
  PATH="$transaction_fake_bin:$system_path"
  export PATH
  real_id=$(command -v id)
  real_stat=$(command -v stat)
  export BGMSS_REAL_ID=$real_id
  export BGMSS_REAL_STAT=$real_stat
  export BGMSS_TEST_ROOT=$command_root
  export BGMSS_TEST_DATA_VERSION=$BGMSS_MINIMAL_DATA_VERSION
  export BGMSS_TEST_PROJECT=bgmss-test
  export BGMSS_TEST_PROXY_URL=$proxy_url
  export BGMSS_TEST_PROXY_NETWORK=$proxy_network
  export BGMSS_TEST_PROM_IMAGE=$BGMSS_PROMETHEUS_IMAGE_PIN
  export BGMSS_TEST_BASE_COMPOSE="$command_root/compose/compose.yaml"
  export BGMSS_TEST_PROXY_COMPOSE="$command_root/compose/compose.updater-proxy.yaml"
  export BGMSS_TEST_BUNDLE_PARENT=$test_root
  export BGMSS_DOCKER_CALLS="$test_root/transaction-docker.calls"

  touch "$command_root/data/operations.lock"
  chmod 0600 "$command_root/data/operations.lock"
  printf '{"pointerSchemaVersion":1,"dataVersion":"%s","manifestDigest":"sha256:%s"}\n' \
    "$BGMSS_MINIMAL_DATA_VERSION" "$(printf 'd%.0s' {1..64})" \
    >"$command_root/data/current.json"
  chmod 0640 "$command_root/data/current.json"
  cp -- "$repository_root/operations/compose.yaml" \
    "$command_root/compose/compose.yaml"
  cp -- "$repository_root/operations/compose.updater-proxy.yaml" \
    "$command_root/compose/compose.updater-proxy.yaml"
  printf '<!doctype html><title>proxy test</title>\n' \
    >"$payload_root/frontend/index.html"
  printf '#!/usr/bin/env sh\nexit 0\n' >"$payload_root/tools/archive-smoke"
  chmod 0755 "$payload_root/tools/archive-smoke"

  cat >"$transaction_fake_bin/id" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ $# -eq 1 && "$1" == -u ]]; then
  printf '0\n'
else
  exec "$BGMSS_REAL_ID" "$@"
fi
SH
  cat >"$transaction_fake_bin/stat" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ $# -eq 4 && "$1" == -c && "$2" == '%u:%g:%a' && "$3" == -- ]]; then
  case "$4" in
    "$BGMSS_TEST_ROOT/data" | "$BGMSS_TEST_ROOT/data/versions")
      printf '0:65532:1770\n'
      exit 0
      ;;
    "$BGMSS_TEST_ROOT/data/operations.lock")
      printf '0:0:600\n'
      exit 0
      ;;
    "$BGMSS_TEST_ROOT/data/current.json" | "$BGMSS_TEST_ROOT/data/previous.json")
      printf '0:65532:640\n'
      exit 0
      ;;
  esac
fi
exec "$BGMSS_REAL_STAT" "$@"
SH
  cat >"$transaction_fake_bin/flock" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 2 && "$1" == -n && "$2" =~ ^[0-9]+$ ]] || exit 98
[[ -z "${BGMSS_TEST_LOCK_MARKER:-}" ]] || touch "$BGMSS_TEST_LOCK_MARKER"
[[ "${BGMSS_TEST_FLOCK_FAIL:-false}" == false ]]
SH
  cat >"$transaction_fake_bin/curl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == "--fail --silent --show-error --max-time 2 http://127.0.0.1:18080/readyz" ]] ||
  exit 98
printf '{"meta":{"dataVersion":"%s"}}\n' "$BGMSS_TEST_DATA_VERSION"
SH
  cat >"$transaction_fake_bin/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ -z "${BGMSS_TEST_DOCKER_MARKER:-}" ]] || touch "$BGMSS_TEST_DOCKER_MARKER"
printf '%s\n' "$*" >>"$BGMSS_DOCKER_CALLS"
case "${1:-}" in
  network)
    [[ $# -eq 3 && "$2" == inspect && "$3" == "$BGMSS_TEST_PROXY_NETWORK" ]] ||
      exit 98
    ;;
  load)
    [[ $# -eq 3 && "$2" == --input &&
      ("$3" == "$BGMSS_TEST_BUNDLE_PARENT"/bundle-*/api.oci.tar ||
        "$3" == "$BGMSS_TEST_BUNDLE_PARENT"/bundle-*/updater.oci.tar) &&
      -f "$3" ]] || exit 98
    ;;
  image)
    [[ "${2:-}" == inspect ]] || exit 98
    if [[ $# -eq 3 ]]; then
      image=$3
    elif [[ $# -eq 5 && "$3" == --format &&
      "$4" == '{{ index .Config.Labels "org.opencontainers.image.revision" }}' ]]; then
      image=$5
    else
      exit 98
    fi
    if [[ "$image" =~ ^localhost/bgmss-(backend-api|updater-artifact):([0-9a-f]{40})-amd64$ ]]; then
      [[ $# -eq 3 ]] || printf '%s\n' "${BASH_REMATCH[2]}"
    else
      [[ $# -eq 3 && "$image" == "$BGMSS_TEST_PROM_IMAGE" ]] || exit 98
    fi
    ;;
  compose)
    for key in \
      BGMSS_UPDATER_TRANSPORT \
      BGMSS_UPDATER_HTTPS_PROXY \
      BGMSS_UPDATER_PROXY_NETWORK; do
      [[ -z "${!key+x}" ]] || exit 90
    done
    shift
    project=
    env_file=
    files=()
    while (($#)); do
      case "$1" in
        --project-name)
          [[ $# -ge 2 ]] || exit 98
          project=$2
          shift 2
          ;;
        --env-file)
          [[ $# -ge 2 ]] || exit 98
          env_file=$2
          shift 2
          ;;
        --file)
          [[ $# -ge 2 ]] || exit 98
          files+=("$2")
          shift 2
          ;;
        *)
          break
          ;;
      esac
    done
    [[ "$project" == "$BGMSS_TEST_PROJECT" &&
      "$env_file" == "$BGMSS_TEST_ROOT/state/current.env" &&
      "${files[0]:-}" == "$BGMSS_TEST_BASE_COMPOSE" ]] || exit 98
    mode=$(sed -n 's/^BGMSS_UPDATER_TRANSPORT=//p' "$env_file")
    case "$mode" in
      direct)
        [[ ${#files[@]} -eq 1 &&
          "$(grep -Fxc 'BGMSS_UPDATER_TRANSPORT=direct' "$env_file")" -eq 1 &&
          "$(grep -Ec '^BGMSS_UPDATER_(HTTPS_PROXY|PROXY_NETWORK)=' "$env_file")" -eq 0 ]] ||
          exit 98
        ;;
      proxy)
        [[ ${#files[@]} -eq 2 &&
          "${files[1]}" == "$BGMSS_TEST_PROXY_COMPOSE" &&
          "$(grep -Fxc 'BGMSS_UPDATER_TRANSPORT=proxy' "$env_file")" -eq 1 &&
          "$(grep -Fxc "BGMSS_UPDATER_HTTPS_PROXY=$BGMSS_TEST_PROXY_URL" "$env_file")" -eq 1 &&
          "$(grep -Fxc "BGMSS_UPDATER_PROXY_NETWORK=$BGMSS_TEST_PROXY_NETWORK" "$env_file")" -eq 1 ]] ||
          exit 98
        ;;
      *)
        exit 98
        ;;
    esac
    [[ "$*" == "config --quiet" ||
      "$*" == "up --detach api prometheus" ||
      "$*" == "up --detach --no-deps --force-recreate api" ]] ||
      exit 98
    ;;
  *)
    exit 98
    ;;
esac
SH
  chmod 0755 \
    "$transaction_fake_bin/id" \
    "$transaction_fake_bin/stat" \
    "$transaction_fake_bin/flock" \
    "$transaction_fake_bin/curl" \
    "$transaction_fake_bin/docker"

  old_revision=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
  release_env_document \
    "$command_root" bgmss-test \
    "localhost/bgmss-backend-api:${old_revision}-amd64" \
    "localhost/bgmss-updater-artifact:${old_revision}-amd64" \
    "$BGMSS_PROMETHEUS_IMAGE_PIN" 18080 19090 validation direct |
    sed '/^BGMSS_UPDATER_TRANSPORT=/d' \
      >"$command_root/state/current.env"
  cp -- "$command_root/state/current.env" "$test_root/expected-pre-change.env"
  ln -s releases/old/frontend "$command_root/current-frontend"
  ln -s releases/old/tools "$command_root/current-tools"

  marker="$test_root/invalid-deploy-docker-called"
  lock_marker="$test_root/invalid-deploy-lock-opened"
  export BGMSS_TEST_DOCKER_MARKER=$marker
  export BGMSS_TEST_LOCK_MARKER=$lock_marker
  export BGMSS_TEST_FLOCK_FAIL=true
  deploy_args=(
    --root "$command_root"
    --bundle "$boundary_bundle"
    --version 0000000000000000000000000000000000000000
    --project bgmss-test
    --api-port 18080
    --prometheus-port 19090
    --prometheus-image "$BGMSS_PROMETHEUS_IMAGE_PIN"
    --profile validation
  )
  initial_release_inventory=$(
    find "$command_root/releases" -mindepth 1 -printf '%P|%y|%l\n' |
      LC_ALL=C sort
  )
  invalid_deploy_requests=(
    '--updater-transport proxy --updater-https-proxy http://proxy.internal:7897'
    '--updater-transport direct --updater-proxy-network proxy-net'
    '--updater-transport preserve --updater-https-proxy http://proxy.internal:7897'
    '--updater-transport ambient'
    '--updater-transport proxy --updater-https-proxy http://proxy.internal:07897 --updater-proxy-network proxy-net'
    '--updater-transport proxy --updater-https-proxy http://proxy.internal.:7897 --updater-proxy-network proxy-net'
    '--updater-transport proxy --updater-https-proxy http://proxy.internal:7897 --updater-proxy-network -invalid'
    '--updater-transport direct --updater-transport direct'
    '--updater-transport proxy --updater-https-proxy http://proxy.internal:7897 --updater-https-proxy http://proxy.internal:7897 --updater-proxy-network proxy-net'
    '--updater-transport proxy --updater-https-proxy http://proxy.internal:7897 --updater-proxy-network proxy-net --updater-proxy-network proxy-net'
  )
  for request in "${invalid_deploy_requests[@]}"; do
    IFS=' ' read -r -a request_args <<<"$request"
    if "$repository_root/operations/bin/deploy" \
      "${deploy_args[@]}" "${request_args[@]}" >/dev/null 2>&1; then
      fail "invalid deploy transport request was admitted"
    fi
    cmp -s "$command_root/state/current.env" "$test_root/expected-pre-change.env" ||
      fail "invalid deploy request changed current.env"
    [[ "$(
      find "$command_root/releases" -mindepth 1 -printf '%P|%y|%l\n' |
        LC_ALL=C sort
    )" == "$initial_release_inventory" ]] ||
      fail "invalid deploy request changed the release inventory"
    [[ ! -e "$command_root/state/previous.env" ]] ||
      fail "invalid deploy request created previous.env"
  done
  [[ ! -e "$marker" ]] ||
    fail "invalid deploy transport reached Docker before rejection"
  [[ ! -e "$lock_marker" ]] ||
    fail "invalid deploy transport reached the state lock before rejection"

  if "$repository_root/operations/bin/deploy" \
    "${deploy_args[@]}" --updater-transport direct >/dev/null 2>&1; then
    fail "valid boundary-control deploy unexpectedly passed its fake lock"
  fi
  [[ -e "$lock_marker" ]] ||
    fail "valid root/bundle control did not reach the state lock"
  [[ ! -e "$marker" ]] ||
    fail "direct boundary-control deploy reached Docker before the state lock"
  cmp -s "$command_root/state/current.env" "$test_root/expected-pre-change.env" ||
    fail "boundary-control deploy changed current.env before the lock"
  [[ "$(
    find "$command_root/releases" -mindepth 1 -printf '%P|%y|%l\n' |
      LC_ALL=C sort
  )" == "$initial_release_inventory" ]] ||
    fail "boundary-control deploy changed releases before the lock"
  rm -f -- "$lock_marker"
  unset BGMSS_TEST_DOCKER_MARKER BGMSS_TEST_LOCK_MARKER
  export BGMSS_TEST_FLOCK_FAIL=false

  make_bundle() {
    local destination=$1 revision=$2 source_tree=$3
    mkdir -p \
      "$destination/minimal-archive/versions/$BGMSS_MINIMAL_DATA_VERSION"
    tar -cf "$destination/frontend.tar" -C "$payload_root/frontend" .
    tar -czf "$destination/backend-tools.tar.gz" \
      -C "$payload_root/tools" archive-smoke
    : >"$destination/api.oci.tar"
    : >"$destination/updater.oci.tar"
    : >"$destination/minimal-archive/versions/$BGMSS_MINIMAL_DATA_VERSION/bangumi.sqlite"
    printf '{}\n' \
      >"$destination/minimal-archive/versions/$BGMSS_MINIMAL_DATA_VERSION/manifest.json"
    cp -- "$command_root/data/current.json" \
      "$destination/minimal-archive/current.json"
    cat >"$destination/build.json" <<JSON
{
  "apiImage": "localhost/bgmss-backend-api:${revision}-amd64",
  "applicationVersion": "v0.1.0",
  "platform": "linux/amd64",
  "sourceRevision": "${revision}",
  "sourceTree": "${source_tree}",
  "updaterImage": "localhost/bgmss-updater-artifact:${revision}-amd64"
}
JSON
    (
      cd "$destination"
      find . -type f ! -name SHA256SUMS -print |
        sed 's|^\./||' |
        LC_ALL=C sort |
        xargs sha256sum --
    ) >"$destination/SHA256SUMS"
  }

  run_deploy() {
    local bundle=$1 revision=$2
    shift 2
    "$repository_root/operations/bin/deploy" \
      --root "$command_root" \
      --bundle "$bundle" \
      --version "$revision" \
      --project bgmss-test \
      --api-port 18080 \
      --prometheus-port 19090 \
      --prometheus-image "$BGMSS_PROMETHEUS_IMAGE_PIN" \
      --profile validation \
      "$@" \
      >/dev/null
  }

  revision_1=1111111111111111111111111111111111111111
  revision_2=2222222222222222222222222222222222222222
  revision_3=3333333333333333333333333333333333333333
  revision_4=4444444444444444444444444444444444444444
  bundle_1="$test_root/bundle-r1"
  bundle_2="$test_root/bundle-r2"
  bundle_3="$test_root/bundle-r3"
  bundle_4="$test_root/bundle-r4"
  make_bundle "$bundle_1" "$revision_1" aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  make_bundle "$bundle_2" "$revision_2" bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  make_bundle "$bundle_3" "$revision_3" cccccccccccccccccccccccccccccccccccccccc
  make_bundle "$bundle_4" "$revision_4" dddddddddddddddddddddddddddddddddddddddd

  run_deploy "$bundle_1" "$revision_1"
  [[ "$(release_transport_state "$command_root/state/current.env")" == 'direct||' ]] ||
    fail "pre-change preserve did not activate direct transport"
  cmp -s "$command_root/state/previous.env" "$test_root/expected-pre-change.env" ||
    fail "pre-change preserve did not retain exact previous bytes"
  cp -- "$command_root/state/current.env" "$test_root/revision-1.env"

  run_deploy \
    "$bundle_2" "$revision_2" \
    --updater-transport proxy \
    --updater-https-proxy "$proxy_url" \
    --updater-proxy-network "$proxy_network"
  [[ "$(release_transport_state "$command_root/state/current.env")" == \
    "proxy|$proxy_url|$proxy_network" ]] ||
    fail "explicit proxy deploy did not activate the exact pair"
  cmp -s "$command_root/state/previous.env" "$test_root/revision-1.env" ||
    fail "explicit proxy deploy did not retain revision 1"
  cp -- "$command_root/state/current.env" "$test_root/revision-2.env"

  run_deploy "$bundle_3" "$revision_3"
  [[ "$(release_transport_state "$command_root/state/current.env")" == \
    "proxy|$proxy_url|$proxy_network" ]] ||
    fail "proxy preserve deploy did not retain the exact pair"
  cmp -s "$command_root/state/previous.env" "$test_root/revision-2.env" ||
    fail "proxy preserve deploy did not retain revision 2"
  cp -- "$command_root/state/current.env" "$test_root/revision-3.env"

  run_deploy "$bundle_4" "$revision_4" --updater-transport direct
  [[ "$(release_transport_state "$command_root/state/current.env")" == 'direct||' ]] ||
    fail "explicit direct deploy did not remove the proxy pair"
  cmp -s "$command_root/state/previous.env" "$test_root/revision-3.env" ||
    fail "explicit direct deploy did not retain revision 3"
  cp -- "$command_root/state/current.env" "$test_root/revision-4.env"

  "$repository_root/operations/bin/rollback-app" --root "$command_root" >/dev/null
  cmp -s "$command_root/state/current.env" "$test_root/revision-3.env" ||
    fail "application rollback did not restore exact proxy revision 3"
  cmp -s "$command_root/state/previous.env" "$test_root/revision-4.env" ||
    fail "application rollback did not retain exact direct revision 4"
  [[ "$(release_transport_state "$command_root/state/current.env")" == \
    "proxy|$proxy_url|$proxy_network" ]] ||
    fail "application rollback did not restore proxy transport"
  [[ "$(release_transport_state "$command_root/state/previous.env")" == 'direct||' ]] ||
    fail "application rollback did not retain direct transport as previous"
  [[ "$(readlink "$command_root/current-tools")" == "releases/$revision_3/tools" &&
    "$(readlink "$command_root/previous-tools")" == "releases/$revision_4/tools" &&
    "$(readlink "$command_root/current-frontend")" == "releases/$revision_3/frontend" &&
    "$(readlink "$command_root/previous-frontend")" == "releases/$revision_4/frontend" ]] ||
    fail "application rollback did not restore exact application links"
  [[ "$(grep -Fxc "network inspect $proxy_network" "$BGMSS_DOCKER_CALLS")" -eq 4 ]] ||
    fail "proxy network authority was not limited to exact inspect calls"
)

printf 'updater proxy tests passed\n'
