#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

fail() {
  printf 'operations runtime test error: %s\n' "$*" >&2
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
test_root=$(mktemp -d "$temporary_parent/bgmss-operations-runtime-test.XXXXXX")
cleanup() {
  local result=$?
  trap - EXIT HUP INT TERM
  if [[ -d "$test_root" && ! -L "$test_root" &&
    "${test_root%/*}" == "$temporary_parent" &&
    "${test_root##*/}" == bgmss-operations-runtime-test.* ]]; then
    rm -rf -- "$test_root"
  else
    printf 'operations runtime test error: refusing ambiguous cleanup\n' >&2
    result=1
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

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
[[ ! -e "$repository_root/operations/compose.updater-proxy.yaml" &&
  ! -L "$repository_root/operations/compose.updater-proxy.yaml" ]] ||
  fail "repository still contains the retired proxy overlay"

write_env() {
  local destination=$1
  release_env_document \
    "$root" bgmss-runtime-test \
    localhost/bgmss-api:test localhost/bgmss-updater:test \
    "$BGMSS_PROMETHEUS_IMAGE_PIN" 18080 19090 validation >"$destination"
}

write_env "$test_root/release.env"
require_release_proxy_absent "$test_root/release.env"
require_release_topology_unchanged \
  "$test_root/release.env" "$root" bgmss-runtime-test \
  "$BGMSS_PROMETHEUS_IMAGE_PIN" 18080 19090 validation
expected_release_keys=$(
  printf '%s\n' \
    COMPOSE_PROJECT_NAME \
    BGMSS_ROOT \
    BGMSS_API_IMAGE \
    BGMSS_UPDATER_IMAGE \
    BGMSS_PROMETHEUS_IMAGE \
    BGMSS_API_PORT \
    BGMSS_PROMETHEUS_PORT \
    BGMSS_API_MEM_LIMIT \
    BGMSS_API_GOMEMLIMIT \
    BGMSS_PROMETHEUS_MEM_LIMIT \
    BGMSS_UPDATER_MEM_LIMIT |
    LC_ALL=C sort
)
actual_release_keys=$(
  sed -n 's/^\([^=]*\)=.*/\1/p' "$test_root/release.env" |
    LC_ALL=C sort
)
[[ "$actual_release_keys" == "$expected_release_keys" ]] ||
  fail "release env inventory is not the exact project topology"

proxy_assignments=(
  'BGMSS_UPDATER_TRANSPORT=direct'
  'BGMSS_UPDATER_HTTPS_PROXY=http://proxy.internal:7897'
  'BGMSS_UPDATER_PROXY_NETWORK=proxy-net'
  'BGMSS_HTTPS_PROXY=http://proxy.internal:7897'
  'BGMSS_IMAGE_HTTPS_PROXY=http://proxy.internal:7897'
  'HTTP_PROXY=http://proxy.internal:7897'
  'https_proxy=http://proxy.internal:7897'
  ' BGMSS_UPDATER_TRANSPORT=proxy'
  'export HTTPS_PROXY=http://proxy.internal:7897'
  'BGMSS_UPDATER_PROXY_NETWORK: proxy-net'
)
for assignment in "${proxy_assignments[@]}"; do
  cp -- "$test_root/release.env" "$test_root/invalid.env"
  printf '%s\n' "$assignment" >>"$test_root/invalid.env"
  if (require_release_proxy_absent "$test_root/invalid.env" >/dev/null 2>&1); then
    fail "release proxy state was admitted"
  fi
done
cp -- "$test_root/release.env" "$test_root/extra.env"
printf 'UNOWNED_TOPOLOGY_KEY=1\n' >>"$test_root/extra.env"
if (require_release_topology_unchanged \
  "$test_root/extra.env" "$root" bgmss-runtime-test \
  "$BGMSS_PROMETHEUS_IMAGE_PIN" 18080 19090 validation >/dev/null 2>&1); then
  fail "release env accepted an unowned topology key"
fi

system_path=$PATH
real_docker=$(command -v docker)
mkdir -p "$test_root/fake-bin"
cat >"$test_root/fake-bin/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
for key in \
  BGMSS_UPDATER_TRANSPORT \
  BGMSS_UPDATER_HTTPS_PROXY \
  BGMSS_UPDATER_PROXY_NETWORK \
  BGMSS_HTTPS_PROXY \
  BGMSS_IMAGE_HTTPS_PROXY \
  HTTP_PROXY \
  HTTPS_PROXY \
  ALL_PROXY \
  NO_PROXY \
  http_proxy \
  https_proxy \
  all_proxy \
  no_proxy; do
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
export BGMSS_HTTPS_PROXY=http://ambient-updater.invalid:1
export BGMSS_IMAGE_HTTPS_PROXY=http://ambient-image.invalid:1
export HTTP_PROXY=http://ambient-http.invalid:1
export HTTPS_PROXY=http://ambient-https.invalid:1
export ALL_PROXY=http://ambient-all.invalid:1
export NO_PROXY='*'
export http_proxy=http://ambient-http-lower.invalid:1
export https_proxy=http://ambient-https-lower.invalid:1
export all_proxy=http://ambient-all-lower.invalid:1
export no_proxy='*'

cp -- "$test_root/release.env" "$root/state/current.env"
compose "$root" config --format json >"$test_root/runtime.json"
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
  and ((.networks | keys) == ["backend"])
  and ((.networks.backend.external // false) == false)
' "$test_root/runtime.json" >/dev/null ||
  fail "base Compose projection is not closed"
[[ "$(wc -l <"$BGMSS_DOCKER_CALLS" | tr -d ' ')" == 1 ]] ||
  fail "base Compose render made an unexpected Docker call"
grep -Fq -- "--file $root/compose/compose.yaml config --format json" \
  "$BGMSS_DOCKER_CALLS" ||
  fail "Compose wrapper did not use only the base topology"

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
  export BGMSS_TEST_PROM_IMAGE=$BGMSS_PROMETHEUS_IMAGE_PIN
  export BGMSS_TEST_BASE_COMPOSE="$command_root/compose/compose.yaml"
  export BGMSS_TEST_LEGACY_COMPOSE="$command_root/compose/compose.updater-proxy.yaml"
  export BGMSS_TEST_BUNDLE_PARENT=$test_root
  export BGMSS_DOCKER_CALLS="$test_root/transaction-docker.calls"
  export BGMSS_READY_CALLS="$test_root/transaction-ready.calls"

  touch "$command_root/data/operations.lock"
  chmod 0600 "$command_root/data/operations.lock"
  printf '{"pointerSchemaVersion":1,"dataVersion":"%s","manifestDigest":"sha256:%s"}\n' \
    "$BGMSS_MINIMAL_DATA_VERSION" "$(printf 'd%.0s' {1..64})" \
    >"$command_root/data/current.json"
  chmod 0640 "$command_root/data/current.json"
  cp -- "$repository_root/operations/compose.yaml" \
    "$command_root/compose/compose.yaml"
  cat >"$command_root/compose/compose.updater-proxy.yaml" <<'YAML'
services:
  api:
    environment:
      BGMSS_IMAGE_HTTPS_PROXY: ${BGMSS_UPDATER_HTTPS_PROXY}
    networks:
      - backend
      - updater_proxy

  updater:
    environment:
      BGMSS_HTTPS_PROXY: ${BGMSS_UPDATER_HTTPS_PROXY}
    networks:
      - backend
      - updater_proxy

networks:
  updater_proxy:
    name: ${BGMSS_UPDATER_PROXY_NETWORK}
    external: true
YAML
  cp -- "$command_root/compose/compose.updater-proxy.yaml" \
    "$test_root/expected-legacy-overlay.yaml"
  printf '<!doctype html><title>runtime test</title>\n' \
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
env_file="$BGMSS_TEST_ROOT/state/current.env"
image=$(sed -n 's/^BGMSS_API_IMAGE=//p' "$env_file")
if grep -Fqx 'BGMSS_UPDATER_TRANSPORT=proxy' "$env_file"; then
  state=legacy
else
  state=clean
fi
printf '%s|%s\n' "$state" "$image" >>"$BGMSS_READY_CALLS"
if [[ "${BGMSS_TEST_FAIL_CLEAN_OLD:-false}" == true &&
  "$state" == clean && "$image" == "$BGMSS_TEST_OLD_IMAGE" ]]; then
  exit 22
fi
if [[ -n "${BGMSS_TEST_FAIL_IMAGE:-}" &&
  "$image" == "$BGMSS_TEST_FAIL_IMAGE" ]]; then
  exit 22
fi
printf '{"meta":{"dataVersion":"%s"}}\n' "$BGMSS_TEST_DATA_VERSION"
SH
  cat >"$transaction_fake_bin/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ -z "${BGMSS_TEST_DOCKER_MARKER:-}" ]] || touch "$BGMSS_TEST_DOCKER_MARKER"
printf '%s\n' "$*" >>"$BGMSS_DOCKER_CALLS"
case "${1:-}" in
  network)
    [[ $# -eq 3 && "$2" == inspect && "$3" == proxy-net ]] || exit 98
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
      BGMSS_UPDATER_PROXY_NETWORK \
      BGMSS_HTTPS_PROXY \
      BGMSS_IMAGE_HTTPS_PROXY \
      HTTP_PROXY \
      HTTPS_PROXY \
      ALL_PROXY \
      NO_PROXY \
      http_proxy \
      https_proxy \
      all_proxy \
      no_proxy; do
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
      "${files[0]:-}" == "$BGMSS_TEST_BASE_COMPOSE" ]] || exit 98
    if [[ "$env_file" != "$BGMSS_TEST_ROOT/state/current.env" ]]; then
      [[ "$*" == "config --quiet" &&
        "$env_file" == "$BGMSS_TEST_ROOT"/state/.legacy-normalization.??????/normalized.env ]] ||
        exit 98
    fi
    if grep -Fqx 'BGMSS_UPDATER_TRANSPORT=proxy' "$env_file"; then
      [[ ${#files[@]} -eq 2 &&
        "${files[1]}" == "$BGMSS_TEST_LEGACY_COMPOSE" &&
        "$(grep -Fxc 'BGMSS_UPDATER_TRANSPORT=proxy' "$env_file")" -eq 1 &&
        "$(grep -Fxc 'BGMSS_UPDATER_HTTPS_PROXY=http://proxy.internal:7897' "$env_file")" -eq 1 &&
        "$(grep -Fxc 'BGMSS_UPDATER_PROXY_NETWORK=proxy-net' "$env_file")" -eq 1 ]] ||
        exit 98
    else
      [[ ${#files[@]} -eq 1 ]] || exit 98
      if grep -Eiq \
        '^(BGMSS_(UPDATER_(TRANSPORT|HTTPS_PROXY|PROXY_NETWORK)|HTTPS_PROXY|IMAGE_HTTPS_PROXY)|(HTTP|HTTPS|ALL|NO)_PROXY|(http|https|all|no)_proxy)=' \
        "$env_file"; then
        exit 98
      fi
    fi
    [[ "$*" == "config --quiet" ||
      "$*" == "up --detach api prometheus" ||
      "$*" == "up --detach --force-recreate api prometheus" ||
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
  export BGMSS_TEST_OLD_IMAGE="localhost/bgmss-backend-api:${old_revision}-amd64"
  cat >"$test_root/expected-legacy.env" <<EOF
COMPOSE_PROJECT_NAME=bgmss-test
BGMSS_ROOT=$command_root
BGMSS_API_IMAGE=localhost/bgmss-backend-api:${old_revision}-amd64
BGMSS_UPDATER_IMAGE=localhost/bgmss-updater-artifact:${old_revision}-amd64
BGMSS_PROMETHEUS_IMAGE=$BGMSS_PROMETHEUS_IMAGE_PIN
BGMSS_API_PORT=18080
BGMSS_PROMETHEUS_PORT=19090
BGMSS_UPDATER_TRANSPORT=proxy
BGMSS_UPDATER_HTTPS_PROXY=http://proxy.internal:7897
BGMSS_UPDATER_PROXY_NETWORK=proxy-net
BGMSS_API_MEM_LIMIT=768m
BGMSS_API_GOMEMLIMIT=512MiB
BGMSS_PROMETHEUS_MEM_LIMIT=192m
BGMSS_UPDATER_MEM_LIMIT=512m
EOF
  sed \
    '/^BGMSS_UPDATER_TRANSPORT=/d
     /^BGMSS_UPDATER_HTTPS_PROXY=/d
     /^BGMSS_UPDATER_PROXY_NETWORK=/d' \
    "$test_root/expected-legacy.env" >"$test_root/expected-clean-old.env"
  cp -- "$test_root/expected-legacy.env" "$command_root/state/current.env"
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
    '--updater-transport preserve'
    '--updater-transport direct'
    '--updater-transport proxy'
    '--updater-https-proxy http://proxy.internal:7897'
    '--updater-proxy-network proxy-net'
    '--updater-transport proxy --updater-https-proxy http://proxy.internal:7897'
    '--unknown-operations-option value'
  )
  for request in "${invalid_deploy_requests[@]}"; do
    IFS=' ' read -r -a request_args <<<"$request"
    if "$repository_root/operations/bin/deploy" \
      "${deploy_args[@]}" "${request_args[@]}" >/dev/null 2>&1; then
      fail "obsolete or unknown deploy argument was admitted"
    fi
    cmp -s "$command_root/state/current.env" "$test_root/expected-legacy.env" ||
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
    fail "obsolete or unknown deploy argument reached Docker before rejection"
  [[ ! -e "$lock_marker" ]] ||
    fail "obsolete or unknown deploy argument reached the state lock before rejection"

  malformed_legacy_cases=(
    missing-url
    duplicate-mode
    invalid-mode
    credentialed-url
    invalid-network
    generic-proxy
    unowned-key
    extra-blank-line
  )
  for invalid_case in "${malformed_legacy_cases[@]}"; do
    cp -- "$test_root/expected-legacy.env" "$command_root/state/current.env"
    case "$invalid_case" in
      missing-url)
        sed -i.bak '/^BGMSS_UPDATER_HTTPS_PROXY=/d' "$command_root/state/current.env"
        rm -f -- "$command_root/state/current.env.bak"
        ;;
      duplicate-mode)
        printf 'BGMSS_UPDATER_TRANSPORT=proxy\n' >>"$command_root/state/current.env"
        ;;
      invalid-mode)
        sed -i.bak 's/^BGMSS_UPDATER_TRANSPORT=proxy$/BGMSS_UPDATER_TRANSPORT=direct/' \
          "$command_root/state/current.env"
        rm -f -- "$command_root/state/current.env.bak"
        ;;
      credentialed-url)
        sed -i.bak \
          's|^BGMSS_UPDATER_HTTPS_PROXY=.*$|BGMSS_UPDATER_HTTPS_PROXY=http://user@proxy.internal:7897|' \
          "$command_root/state/current.env"
        rm -f -- "$command_root/state/current.env.bak"
        ;;
      invalid-network)
        sed -i.bak \
          's/^BGMSS_UPDATER_PROXY_NETWORK=.*$/BGMSS_UPDATER_PROXY_NETWORK=-invalid/' \
          "$command_root/state/current.env"
        rm -f -- "$command_root/state/current.env.bak"
        ;;
      generic-proxy)
        printf 'HTTPS_PROXY=http://ambient.invalid:1\n' >>"$command_root/state/current.env"
        ;;
      unowned-key)
        printf 'UNOWNED_TOPOLOGY_KEY=1\n' >>"$command_root/state/current.env"
        ;;
      extra-blank-line)
        printf '\n' >>"$command_root/state/current.env"
        ;;
    esac
    if "$repository_root/operations/bin/deploy" \
      "${deploy_args[@]}" >/dev/null 2>&1; then
      fail "malformed legacy release env was admitted: $invalid_case"
    fi
    [[ ! -e "$marker" && ! -e "$lock_marker" ]] ||
      fail "malformed legacy release reached Docker or the state lock: $invalid_case"
  done
  cp -- "$test_root/expected-legacy.env" "$command_root/state/current.env"

  boundary_error="$test_root/boundary-control.error"
  if "$repository_root/operations/bin/deploy" \
    "${deploy_args[@]}" >/dev/null 2>"$boundary_error"; then
    fail "valid boundary-control deploy unexpectedly passed its fake lock"
  fi
  if [[ ! -e "$lock_marker" ]]; then
    sed -n '1,20p' "$boundary_error" >&2
    fail "valid root/bundle control did not reach the state lock"
  fi
  [[ ! -e "$marker" ]] ||
    fail "direct boundary-control deploy reached Docker before the state lock"
  cmp -s "$command_root/state/current.env" "$test_root/expected-legacy.env" ||
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
  bundle_1="$test_root/bundle-r1"
  bundle_2="$test_root/bundle-r2"
  make_bundle "$bundle_1" "$revision_1" aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  make_bundle "$bundle_2" "$revision_2" bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

  reset_legacy_state() {
    rm -f -- \
      "$command_root/state/current.env" \
      "$command_root/state/previous.env" \
      "$command_root/current-frontend" \
      "$command_root/current-tools" \
      "$command_root/previous-frontend" \
      "$command_root/previous-tools"
    rm -rf -- \
      "$command_root/releases/$revision_1" \
      "$command_root/releases/$revision_2"
    cp -- "$test_root/expected-legacy.env" "$command_root/state/current.env"
    cp -- "$test_root/expected-legacy-overlay.yaml" \
      "$command_root/compose/compose.updater-proxy.yaml"
    ln -s releases/old/frontend "$command_root/current-frontend"
    ln -s releases/old/tools "$command_root/current-tools"
    : >"$BGMSS_DOCKER_CALLS"
    : >"$BGMSS_READY_CALLS"
    unset BGMSS_TEST_FAIL_CLEAN_OLD BGMSS_TEST_FAIL_IMAGE
  }

  require_only_legacy_config_validation() {
    local calls
    calls=$(grep -F 'compose.updater-proxy.yaml' "$BGMSS_DOCKER_CALLS" || true)
    [[ "$(grep -Fc 'compose.updater-proxy.yaml' "$BGMSS_DOCKER_CALLS")" -eq 1 &&
      "$calls" == *" config --quiet" ]] ||
      fail "retired overlay was used after its one pre-mutation validation"
  }

  reset_legacy_state
  export BGMSS_TEST_FAIL_CLEAN_OLD=true
  export BGMSS_READY_ATTEMPTS=1
  if run_deploy "$bundle_1" "$revision_1"; then
    fail "legacy normalization failure unexpectedly deployed a candidate"
  fi
  unset BGMSS_TEST_FAIL_CLEAN_OLD
  cmp -s "$command_root/state/current.env" "$test_root/expected-legacy.env" ||
    fail "normalization failure did not restore exact legacy current.env"
  cmp -s \
    "$command_root/compose/compose.updater-proxy.yaml" \
    "$test_root/expected-legacy-overlay.yaml" ||
    fail "normalization failure changed the exact legacy overlay"
  [[ ! -e "$command_root/state/previous.env" &&
    ! -e "$command_root/previous-tools" &&
    ! -e "$command_root/previous-frontend" ]] ||
    fail "normalization failure created rollback state"
  [[ "$(cat "$BGMSS_READY_CALLS")" == \
    $'clean|localhost/bgmss-backend-api:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee-amd64\nlegacy|localhost/bgmss-backend-api:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee-amd64' ]] ||
    fail "normalization failure did not prove clean failure then exact legacy recovery"
  [[ ! -e "$command_root/releases/$revision_1" ]] ||
    fail "normalization failure left a candidate release"

  reset_legacy_state
  export BGMSS_TEST_FAIL_IMAGE="localhost/bgmss-backend-api:${revision_1}-amd64"
  if run_deploy "$bundle_1" "$revision_1"; then
    fail "candidate readiness failure unexpectedly succeeded"
  fi
  unset BGMSS_TEST_FAIL_IMAGE
  cmp -s "$command_root/state/current.env" "$test_root/expected-clean-old.env" ||
    fail "candidate failure did not restore verified clean old current.env"
  cmp -s "$command_root/state/previous.env" "$test_root/expected-clean-old.env" ||
    fail "candidate failure left a proxy-capable previous.env"
  [[ ! -e "$command_root/compose/compose.updater-proxy.yaml" ]] ||
    fail "candidate failure restored the retired overlay after normalization"
  [[ "$(readlink "$command_root/current-tools")" == "releases/old/tools" &&
    "$(readlink "$command_root/previous-tools")" == "releases/old/tools" &&
    "$(readlink "$command_root/current-frontend")" == "releases/old/frontend" &&
    "$(readlink "$command_root/previous-frontend")" == "releases/old/frontend" ]] ||
    fail "candidate failure did not retain the clean old rollback baseline"
  [[ ! -e "$command_root/releases/$revision_1" ]] ||
    fail "candidate failure left its inactive release"
  require_only_legacy_config_validation

  reset_legacy_state
  run_deploy "$bundle_2" "$revision_2"
  require_release_proxy_absent "$command_root/state/current.env"
  cmp -s "$command_root/state/previous.env" "$test_root/expected-clean-old.env" ||
    fail "successful migration did not retain clean old previous.env"
  cp -- "$command_root/state/current.env" "$test_root/revision-2.env"
  [[ ! -e "$command_root/compose/compose.updater-proxy.yaml" ]] ||
    fail "successful migration retained the retired overlay"
  [[ "$(readlink "$command_root/current-tools")" == "releases/$revision_2/tools" &&
    "$(readlink "$command_root/previous-tools")" == "releases/old/tools" &&
    "$(readlink "$command_root/current-frontend")" == "releases/$revision_2/frontend" &&
    "$(readlink "$command_root/previous-frontend")" == "releases/old/frontend" ]] ||
    fail "successful migration did not retain exact clean old links"

  "$repository_root/operations/bin/rollback-app" --root "$command_root" >/dev/null
  cmp -s "$command_root/state/current.env" "$test_root/expected-clean-old.env" ||
    fail "application rollback did not restore clean old current.env"
  cmp -s "$command_root/state/previous.env" "$test_root/revision-2.env" ||
    fail "application rollback did not retain the clean candidate as previous"
  require_release_proxy_absent "$command_root/state/current.env"
  require_release_proxy_absent "$command_root/state/previous.env"
  [[ "$(readlink "$command_root/current-tools")" == "releases/old/tools" &&
    "$(readlink "$command_root/previous-tools")" == "releases/$revision_2/tools" &&
    "$(readlink "$command_root/current-frontend")" == "releases/old/frontend" &&
    "$(readlink "$command_root/previous-frontend")" == "releases/$revision_2/frontend" ]] ||
    fail "application rollback did not restore exact clean application links"
  [[ "$(grep -Fxc 'network inspect proxy-net' "$BGMSS_DOCKER_CALLS")" -eq 1 ]] ||
    fail "legacy migration did not limit network authority to one exact inspect"
  ! grep -Eq '^network (create|rm|connect|disconnect)[[:space:]]' \
    "$BGMSS_DOCKER_CALLS" ||
    fail "legacy migration managed the external proxy network"
  require_only_legacy_config_validation
  unset BGMSS_READY_ATTEMPTS
)

printf 'operations runtime tests passed\n'
