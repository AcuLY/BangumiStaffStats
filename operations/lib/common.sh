#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly BGMSS_COMMON_COMMIT="6a8442c17143a870357a5ff812362e8b5cfe9f9d"
readonly BGMSS_MINIMAL_DATA_VERSION="dv1-0a1fa3e9acdb06be34e3535b3c68e322e7d3f4cd87ac30cd4b608b2276ba3ca1"
readonly BGMSS_PROMETHEUS_IMAGE_PIN="prom/prometheus:v3.13.1-distroless@sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80"
readonly BGMSS_OPERATIONS_PREVIEW_CALLER=$'  operations-preview:\n    if: github.event_name == '\''workflow_dispatch'\''\n    needs: verify\n    permissions:\n      contents: read\n    uses: ./.github/workflows/operations-preview.yml'

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

log() {
  printf '%s\n' "$*" >&2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

require_root_user() {
  [[ $(id -u) -eq 0 ]] || die "state-changing commands must run as root"
}

require_absolute_path() {
  local value=$1 label=$2
  [[ "$value" == /* && "$value" != "/" && "$value" != *$'\n'* ]] ||
    die "$label must be an absolute non-root path"
}

require_existing_directory() {
  local value=$1 label=$2 resolved
  require_absolute_path "$value" "$label"
  [[ -d "$value" && ! -L "$value" ]] || die "$label is not a real directory: $value"
  resolved=$(realpath "$value")
  [[ "$resolved" == "$value" ]] || die "$label must be canonical: $value"
}

require_safe_name() {
  local value=$1 label=$2
  [[ "$value" =~ ^[a-z0-9][a-z0-9_-]{2,62}$ ]] ||
    die "$label must match [a-z0-9][a-z0-9_-]{2,62}"
}

require_version() {
  local value=$1
  [[ "$value" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] ||
    die "version has an unsafe form"
}

require_port() {
  local value=$1 label=$2
  [[ "$value" =~ ^[0-9]+$ ]] || die "$label must be numeric"
  (( value >= 1024 && value <= 65535 )) || die "$label must be in 1024..65535"
}

require_image() {
  local value=$1 label=$2
  [[ ${#value} -ge 2 && ${#value} -le 512 &&
    "$value" =~ ^[A-Za-z0-9][A-Za-z0-9._/:@+-]+$ ]] ||
    die "$label has an unsafe image reference"
  [[ "$value" != "latest" && "$value" != *":latest" ]] ||
    die "$label must not use latest"
}

require_legacy_proxy_url() {
  local value=$1 authority host port label_part
  local LC_ALL=C
  local -a labels
  [[ -n "$value" && ${#value} -le 320 &&
    "$value" =~ ^http://([a-z0-9.-]+):([1-9][0-9]{0,4})$ ]] ||
    die "legacy updater proxy URL is invalid"
  authority=${value#http://}
  host=${authority%:*}
  port=${authority##*:}
  [[ ${#host} -le 253 && "$host" != .* && "$host" != *. ]] ||
    die "legacy updater proxy host is invalid"
  IFS=. read -r -a labels <<<"$host"
  ((${#labels[@]} >= 1)) || die "legacy updater proxy host is invalid"
  for label_part in "${labels[@]}"; do
    [[ ${#label_part} -ge 1 && ${#label_part} -le 63 &&
      "$label_part" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]] ||
      die "legacy updater proxy host is invalid"
  done
  ((10#$port >= 1 && 10#$port <= 65535)) ||
    die "legacy updater proxy port is invalid"
}

require_legacy_proxy_network() {
  local value=$1
  local LC_ALL=C
  [[ ${#value} -ge 1 && ${#value} -le 128 &&
    "$value" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] ||
    die "legacy updater proxy network is invalid"
}

proxy_environment_keys() {
  printf '%s\n' \
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
    no_proxy
}

require_release_proxy_absent() {
  local file=$1 key
  [[ -f "$file" && ! -L "$file" ]] || die "env file is invalid: $file"
  while IFS= read -r key; do
    if grep -Eq \
      "^[[:space:]]*(export[[:space:]]+)?${key}([[:space:]]|=|:|$)" \
      "$file"; then
      die "release env must not contain proxy state: $key"
    fi
  done < <(proxy_environment_keys)
}

release_proxy_assignment_present() {
  local file=$1 key
  [[ -f "$file" && ! -L "$file" ]] || die "env file is invalid: $file"
  while IFS= read -r key; do
    if grep -Eq \
      "^[[:space:]]*(export[[:space:]]+)?${key}([[:space:]]|=|:|$)" \
      "$file"; then
      return 0
    fi
  done < <(proxy_environment_keys)
  return 1
}

legacy_proxy_state() {
  local file=$1 key broad_count canonical_count
  local mode_count url_count network_count mode url network
  [[ -f "$file" && ! -L "$file" ]] || die "env file is invalid: $file"
  mode_count=$(grep -c '^BGMSS_UPDATER_TRANSPORT=' "$file" || true)
  url_count=$(grep -c '^BGMSS_UPDATER_HTTPS_PROXY=' "$file" || true)
  network_count=$(grep -c '^BGMSS_UPDATER_PROXY_NETWORK=' "$file" || true)
  [[ "$mode_count" -eq 1 && "$url_count" -eq 1 && "$network_count" -eq 1 ]] ||
    die "legacy proxy release env must contain one exact transport trio"
  while IFS= read -r key; do
    broad_count=$(
      grep -Ec \
        "^[[:space:]]*(export[[:space:]]+)?${key}([[:space:]]|=|:|$)" \
        "$file" || true
    )
    case "$key" in
      BGMSS_UPDATER_TRANSPORT | BGMSS_UPDATER_HTTPS_PROXY | BGMSS_UPDATER_PROXY_NETWORK)
        canonical_count=$(grep -c "^${key}=" "$file" || true)
        [[ "$broad_count" -eq 1 && "$canonical_count" -eq 1 ]] ||
          die "legacy proxy release env contains an ambiguous transport assignment"
        ;;
      *)
        [[ "$broad_count" -eq 0 ]] ||
          die "legacy proxy release env contains unapproved proxy state"
        ;;
    esac
  done < <(proxy_environment_keys)
  mode=$(env_value "$file" BGMSS_UPDATER_TRANSPORT)
  url=$(env_value "$file" BGMSS_UPDATER_HTTPS_PROXY)
  network=$(env_value "$file" BGMSS_UPDATER_PROXY_NETWORK)
  [[ "$mode" == proxy ]] || die "legacy updater transport must be proxy"
  require_legacy_proxy_url "$url"
  require_legacy_proxy_network "$network"
  printf '%s|%s\n' "$url" "$network"
}

legacy_proxy_overlay_document() {
  cat <<'EOF'
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
EOF
}

require_legacy_proxy_overlay() {
  local root=$1 overlay
  overlay="$root/compose/compose.updater-proxy.yaml"
  [[ -f "$overlay" && ! -L "$overlay" ]] ||
    die "legacy proxy overlay is missing or invalid"
  cmp -s <(legacy_proxy_overlay_document) "$overlay" ||
    die "legacy proxy overlay differs from the exact retired topology"
}

require_root_layout() {
  local root=$1 pointer
  require_existing_directory "$root" root
  require_command stat
  for directory in data releases state compose config/prometheus prometheus; do
    [[ -d "$root/$directory" && ! -L "$root/$directory" ]] ||
      die "missing real root directory: $root/$directory"
  done
  [[ "$(stat -c '%u:%g:%a' -- "$root/data")" == "0:65532:1770" ]] ||
    die "data root must be root:65532 mode 1770"
  [[ -d "$root/data/versions" && ! -L "$root/data/versions" ]] ||
    die "Archive versions root must be a real directory"
  [[ "$(stat -c '%u:%g:%a' -- "$root/data/versions")" == "0:65532:1770" ]] ||
    die "Archive versions root must be root:65532 mode 1770"
  [[ -f "$root/data/operations.lock" && ! -L "$root/data/operations.lock" ]] ||
    die "state lock must be a pre-created regular file"
  [[ "$(stat -c '%u:%g:%a' -- "$root/data/operations.lock")" == "0:0:600" ]] ||
    die "state lock must be root:root mode 0600"
  for pointer in current.json previous.json; do
    if [[ -e "$root/data/$pointer" || -L "$root/data/$pointer" ]]; then
      [[ -f "$root/data/$pointer" && ! -L "$root/data/$pointer" ]] ||
        die "data pointer must be a regular file: $pointer"
      [[ "$(stat -c '%u:%g:%a' -- "$root/data/$pointer")" == "0:65532:640" ]] ||
        die "data pointer must be root:65532 mode 0640: $pointer"
    fi
  done
  [[ -f "$root/data/current.json" && ! -L "$root/data/current.json" ]] ||
    die "current data pointer is required"
}

acquire_state_lock() {
  local root=$1
  require_command flock
  local lock_path="$root/data/operations.lock"
  [[ -f "$lock_path" && ! -L "$lock_path" ]] ||
    die "state lock must be a pre-created regular file"
  [[ "$(stat -c '%u:%g:%a' -- "$lock_path")" == "0:0:600" ]] ||
    die "state lock must be root:root mode 0600"
  exec {BGMSS_LOCK_FD}<>"$lock_path"
  flock -n "$BGMSS_LOCK_FD" || die "another state-changing operation owns $lock_path"
  readonly BGMSS_LOCK_FD
}

atomic_copy() {
  local source=$1 destination=$2 temporary
  [[ -f "$source" && ! -L "$source" ]] || die "atomic copy source is not a regular file: $source"
  [[ -d "$(dirname "$destination")" && ! -L "$(dirname "$destination")" ]] ||
    die "atomic copy destination parent is invalid"
  temporary=$(mktemp "$(dirname "$destination")/.bgmss-copy.XXXXXX")
  cp --preserve=mode,ownership -- "$source" "$temporary"
  chmod 0640 "$temporary"
  mv -fT -- "$temporary" "$destination"
}

atomic_write() {
  local destination=$1 mode=$2 temporary
  [[ -d "$(dirname "$destination")" && ! -L "$(dirname "$destination")" ]] ||
    die "atomic write destination parent is invalid"
  temporary=$(mktemp "$(dirname "$destination")/.bgmss-write.XXXXXX")
  cat >"$temporary"
  chmod "$mode" "$temporary"
  mv -fT -- "$temporary" "$destination"
}

atomic_symlink() {
  local target=$1 destination=$2 temporary
  [[ "$target" != /* && "$target" != *".."* && "$target" != *$'\n'* ]] ||
    die "symlink target must be a safe relative path"
  temporary="$(dirname "$destination")/.bgmss-link.$$"
  [[ ! -e "$temporary" && ! -L "$temporary" ]] || die "temporary symlink already exists"
  ln -s -- "$target" "$temporary"
  mv -fT -- "$temporary" "$destination"
}

restore_optional_file() {
  local snapshot=$1 destination=$2
  if [[ -n "$snapshot" ]]; then
    atomic_copy "$snapshot" "$destination"
  elif [[ -f "$destination" && ! -L "$destination" ]]; then
    rm -f -- "$destination"
  elif [[ -e "$destination" || -L "$destination" ]]; then
    die "cannot restore absent file over an invalid path: $destination"
  fi
  return 0
}

restore_optional_symlink() {
  local target=$1 destination=$2
  if [[ -n "$target" ]]; then
    atomic_symlink "$target" "$destination"
  elif [[ -L "$destination" ]]; then
    rm -f -- "$destination"
  elif [[ -e "$destination" ]]; then
    die "cannot restore absent symlink over an invalid path: $destination"
  fi
  return 0
}

read_link_or_empty() {
  local path=$1
  if [[ -L "$path" ]]; then
    readlink "$path"
  elif [[ -e "$path" ]]; then
    die "expected a symlink: $path"
  fi
}

base_compose() {
  local root=$1 env_file=$2 key
  local -a unset_proxy_environment=()
  shift 2
  [[ -f "$root/compose/compose.yaml" && ! -L "$root/compose/compose.yaml" ]] ||
    die "base Compose file is missing or invalid"
  require_release_proxy_absent "$env_file"
  while IFS= read -r key; do
    unset_proxy_environment+=(-u "$key")
  done < <(proxy_environment_keys)
  env "${unset_proxy_environment[@]}" \
    docker compose \
    --project-name "$(env_value "$env_file" COMPOSE_PROJECT_NAME)" \
    --env-file "$env_file" \
    --file "$root/compose/compose.yaml" \
    "$@"
}

compose() {
  local root=$1
  shift
  base_compose "$root" "$root/state/current.env" "$@"
}

legacy_compose() {
  local root=$1 env_file=$2 key
  local -a unset_proxy_environment=()
  shift 2
  [[ -f "$root/compose/compose.yaml" && ! -L "$root/compose/compose.yaml" ]] ||
    die "base Compose file is missing or invalid"
  legacy_proxy_state "$env_file" >/dev/null
  require_legacy_proxy_overlay "$root"
  while IFS= read -r key; do
    unset_proxy_environment+=(-u "$key")
  done < <(proxy_environment_keys)
  env "${unset_proxy_environment[@]}" \
    docker compose \
    --project-name "$(env_value "$env_file" COMPOSE_PROJECT_NAME)" \
    --env-file "$env_file" \
    --file "$root/compose/compose.yaml" \
    --file "$root/compose/compose.updater-proxy.yaml" \
    "$@"
}

env_value() {
  local file=$1 key=$2
  [[ -f "$file" && ! -L "$file" ]] || die "env file is invalid: $file"
  local value
  value=$(sed -n "s/^${key}=//p" "$file")
  [[ -n "$value" && "$(grep -c "^${key}=" "$file")" -eq 1 ]] ||
    die "env file must contain exactly one $key"
  printf '%s\n' "$value"
}

_development_workflow_caller_line() {
  local file=$1 required=$2 label=$3 record line
  record=$(grep -n -x '  operations-preview:' "$file" || true)
  if [[ -z "$record" && "$required" == false ]]; then
    printf '0\n'
    return
  fi
  line=${record%%:*}
  [[ "$record" == "$line:  operations-preview:" &&
    "$line" =~ ^[1-9][0-9]*$ && "$line" -gt 1 ]] ||
    die "$label workflow must contain exactly one locatable operations caller"
  [[ -z "$(sed -n "$((line - 1))p" "$file")" ]] ||
    die "$label workflow caller is not separated by one blank line"
  [[ "$(tail -n "+$line" "$file")" == "$BGMSS_OPERATIONS_PREVIEW_CALLER" ]] ||
    die "$label workflow operations caller differs from the fixed policy"
  printf '%s\n' "$line"
}

_development_workflow_product_prefix() {
  local file=$1 caller_line=$2
  if [[ "$caller_line" -eq 0 ]]; then
    cat -- "$file"
  else
    head -n "$((caller_line - 2))" "$file"
  fi
}

development_workflow_prefix_lines() {
  local accepted_ci=$1 current_ci=$2 accepted_line current_line
  [[ -f "$accepted_ci" && ! -L "$accepted_ci" &&
    -f "$current_ci" && ! -L "$current_ci" ]] ||
    die "Development workflow inputs must be regular files"
  accepted_line=$(
    _development_workflow_caller_line "$accepted_ci" false accepted
  )
  current_line=$(
    _development_workflow_caller_line "$current_ci" true current
  )
  printf '%s|%s\n' "$accepted_line" "$current_line"
}

wait_ready() {
  local root=$1 expected_data=${2:-} attempts=${BGMSS_READY_ATTEMPTS:-30}
  local port body attempt data_version
  port=$(env_value "$root/state/current.env" BGMSS_API_PORT)
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if body=$(curl --fail --silent --show-error --max-time 2 \
      "http://127.0.0.1:${port}/readyz" 2>/dev/null); then
      data_version=$(jq -er '.meta.dataVersion | select(type == "string")' <<<"$body") ||
        data_version=
      if [[ -z "$expected_data" || "$data_version" == "$expected_data" ]]; then
        return 0
      fi
    fi
    sleep 2
  done
  return 1
}

restart_and_wait() {
  local root=$1 expected_data=${2:-}
  compose "$root" up --detach --no-deps --force-recreate api
  wait_ready "$root" "$expected_data"
}

pointer_data_version() {
  jq -er '
    select(type == "object" and keys == ["dataVersion","manifestDigest","pointerSchemaVersion"])
    | select(.pointerSchemaVersion == 1)
    | .dataVersion
    | select(test("^dv1-[0-9a-f]{64}$"))
  ' "$1"
}

freeze_archive_version() {
  local root=$1 data_version=$2 version_root special invalid
  [[ "$data_version" =~ ^dv1-[0-9a-f]{64}$ ]] ||
    die "cannot freeze an invalid Archive data version"
  version_root="$root/data/versions/$data_version"
  [[ -d "$version_root" && ! -L "$version_root" ]] ||
    die "published Archive version is not a real directory"
  [[ "$(realpath "$version_root")" == "$version_root" &&
    "$(realpath "$root/data/versions")" == "${version_root%/*}" ]] ||
    die "published Archive version escaped the versions root"
  special=$(find "$version_root" ! -type d ! -type f -print -quit)
  [[ -z "$special" ]] ||
    die "published Archive version contains a symlink or special file: $special"
  chown -R 0:65532 -- "$version_root"
  find "$version_root" -type d -exec chmod 0550 -- {} +
  find "$version_root" -type f -exec chmod 0440 -- {} +
  invalid=$(find "$version_root" \( ! -uid 0 -o ! -gid 65532 \) -print -quit)
  [[ -z "$invalid" ]] ||
    die "published Archive version ownership was not frozen: $invalid"
  invalid=$(find "$version_root" -type d ! -perm 0550 -print -quit)
  [[ -z "$invalid" ]] ||
    die "published Archive directory mode was not frozen: $invalid"
  invalid=$(find "$version_root" -type f ! -perm 0440 -print -quit)
  [[ -z "$invalid" ]] ||
    die "published Archive file mode was not frozen: $invalid"
}

verify_bundle() {
  local bundle=$1 inventory file checksum name actual_files declared_files duplicates special
  require_existing_directory "$bundle" bundle
  inventory="$bundle/SHA256SUMS"
  [[ -f "$inventory" && ! -L "$inventory" ]] || die "bundle SHA256SUMS is missing"
  special=$(find "$bundle" -mindepth 1 ! -type d ! -type f -print -quit)
  [[ -z "$special" ]] || die "bundle contains a symlink or special file: $special"
  actual_files=$(
    cd "$bundle"
    find . -type f ! -path './SHA256SUMS' -print |
      sed 's|^\./||' |
      LC_ALL=C sort
  )
  declared_files=$(sed -n 's/^[0-9a-f]\{64\}  //p' "$inventory" | LC_ALL=C sort)
  duplicates=$(sed -n 's/^[0-9a-f]\{64\}  //p' "$inventory" | LC_ALL=C sort | uniq -d)
  [[ -z "$duplicates" ]] || die "SHA256SUMS contains duplicate members"
  [[ "$actual_files" == "$declared_files" ]] ||
    die "bundle ordinary-file inventory is not closed"
  while IFS= read -r line; do
    [[ "$line" =~ ^([0-9a-f]{64})[[:space:]][[:space:]](.+)$ ]] ||
      die "invalid SHA256SUMS line"
    checksum=${BASH_REMATCH[1]}
    name=${BASH_REMATCH[2]}
    [[ "$name" != /* && "$name" != *".."* && "$name" != *$'\n'* ]] ||
      die "unsafe checksum member: $name"
    file="$bundle/$name"
    [[ -f "$file" && ! -L "$file" ]] || die "checksum member is not a regular file: $name"
    [[ "$(sha256sum "$file" | awk '{print $1}')" == "$checksum" ]] ||
      die "checksum mismatch: $name"
  done <"$inventory"
  (
    cd "$bundle"
    sha256sum --check --strict SHA256SUMS >/dev/null
  )
  for required in api.oci.tar updater.oci.tar backend-tools.tar.gz frontend.tar \
    build.json minimal-archive/current.json \
    "minimal-archive/versions/$BGMSS_MINIMAL_DATA_VERSION/manifest.json" \
    "minimal-archive/versions/$BGMSS_MINIMAL_DATA_VERSION/bangumi.sqlite"; do
    [[ -f "$bundle/$required" && ! -L "$bundle/$required" ]] ||
      die "required bundle member is missing: $required"
    grep -Fq "  $required" "$inventory" ||
      die "required bundle member is not checksummed: $required"
  done
}

build_field() {
  local build_json=$1 field=$2
  jq -er --arg field "$field" '
    select(type == "object")
    | select(keys == [
        "apiImage",
        "applicationVersion",
        "platform",
        "sourceRevision",
        "sourceTree",
        "updaterImage"
      ])
    | .[$field]
    | select(type == "string" and length > 0)
  ' "$build_json"
}

verify_build_metadata() {
  local build_json=$1 revision api_image updater_image
  revision=$(build_field "$build_json" sourceRevision)
  [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || die "invalid sourceRevision"
  [[ "$(build_field "$build_json" sourceTree)" =~ ^[0-9a-f]{40}$ ]] ||
    die "invalid sourceTree"
  [[ "$(build_field "$build_json" platform)" == "linux/amd64" ]] ||
    die "bundle platform must be linux/amd64"
  [[ "$(build_field "$build_json" applicationVersion)" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
    die "invalid applicationVersion"
  api_image=$(build_field "$build_json" apiImage)
  updater_image=$(build_field "$build_json" updaterImage)
  [[ "$api_image" == "localhost/bgmss-backend-api:${revision}-amd64" ]] ||
    die "apiImage does not match sourceRevision"
  [[ "$updater_image" == "localhost/bgmss-updater-artifact:${revision}-amd64" ]] ||
    die "updaterImage does not match sourceRevision"
  require_image "$api_image" apiImage
  require_image "$updater_image" updaterImage
}

safe_extract_tar() {
  local archive=$1 destination=$2 mode=${3:-plain} listing verbose type member invalid=
  [[ -f "$archive" && ! -L "$archive" ]] || die "archive is not a regular file: $archive"
  [[ -d "$destination" && ! -L "$destination" ]] || die "extract destination is invalid"
  listing=$(mktemp)
  verbose=$(mktemp)
  if [[ "$mode" == gzip ]]; then
    if ! tar -tzf "$archive" >"$listing" ||
      ! tar -tvzf "$archive" >"$verbose"; then
      rm -f -- "$listing" "$verbose"
      die "unable to inspect gzip archive"
    fi
  else
    if ! tar -tf "$archive" >"$listing" ||
      ! tar -tvf "$archive" >"$verbose"; then
      rm -f -- "$listing" "$verbose"
      die "unable to inspect tar archive"
    fi
  fi
  while IFS= read -r member; do
    if [[ -z "$member" || "$member" == /* || "$member" == *".."* ||
      "$member" == *$'\n'* ]]; then
      invalid="unsafe archive member"
      break
    fi
  done <"$listing"
  if [[ -z "$invalid" ]]; then
    while IFS= read -r member; do
      type=${member:0:1}
      if [[ "$type" != "-" && "$type" != "d" ]]; then
        invalid="archive contains a non-regular member"
        break
      fi
    done <"$verbose"
  fi
  rm -f -- "$listing" "$verbose"
  [[ -z "$invalid" ]] || die "$invalid"
  if [[ "$mode" == gzip ]]; then
    tar --extract --gzip --file "$archive" --directory "$destination" --no-same-owner --no-same-permissions
  else
    tar --extract --file "$archive" --directory "$destination" --no-same-owner --no-same-permissions
  fi
  if find "$destination" -type l -print -quit | grep -q .; then
    die "archive contains a symlink"
  fi
}

install_tools() {
  local archive=$1 destination=$2 found count
  safe_extract_tar "$archive" "$destination" gzip
  count=$(find "$destination" -type f -name archive-smoke | wc -l | tr -d ' ')
  [[ "$count" == 1 ]] || die "backend tools must contain exactly one archive-smoke"
  found=$(find "$destination" -type f -name archive-smoke -print)
  if [[ "$found" == "$destination/archive-smoke" ]]; then
    chmod 0555 "$found"
  else
    install -m 0555 "$found" "$destination/archive-smoke"
  fi
}

release_env_document() {
  local root=$1 project=$2 api_image=$3 updater_image=$4 prom_image=$5 api_port=$6 prom_port=$7
  local profile=${8:-production}
  printf 'COMPOSE_PROJECT_NAME=%s\n' "$project"
  printf 'BGMSS_ROOT=%s\n' "$root"
  printf 'BGMSS_API_IMAGE=%s\n' "$api_image"
  printf 'BGMSS_UPDATER_IMAGE=%s\n' "$updater_image"
  printf 'BGMSS_PROMETHEUS_IMAGE=%s\n' "$prom_image"
  printf 'BGMSS_API_PORT=%s\n' "$api_port"
  printf 'BGMSS_PROMETHEUS_PORT=%s\n' "$prom_port"
  if [[ "$profile" == validation ]]; then
    printf 'BGMSS_API_MEM_LIMIT=768m\n'
    printf 'BGMSS_API_GOMEMLIMIT=512MiB\n'
    printf 'BGMSS_PROMETHEUS_MEM_LIMIT=192m\n'
    printf 'BGMSS_UPDATER_MEM_LIMIT=512m\n'
  elif [[ "$profile" != production ]]; then
    die "unknown resource profile: $profile"
  fi
}

legacy_release_env_document() {
  local root=$1 project=$2 api_image=$3 updater_image=$4 prom_image=$5
  local api_port=$6 prom_port=$7 profile=$8 proxy_url=$9 proxy_network=${10}
  require_legacy_proxy_url "$proxy_url"
  require_legacy_proxy_network "$proxy_network"
  while IFS= read -r line; do
    printf '%s\n' "$line"
    if [[ "$line" == BGMSS_PROMETHEUS_PORT=* ]]; then
      printf 'BGMSS_UPDATER_TRANSPORT=proxy\n'
      printf 'BGMSS_UPDATER_HTTPS_PROXY=%s\n' "$proxy_url"
      printf 'BGMSS_UPDATER_PROXY_NETWORK=%s\n' "$proxy_network"
    fi
  done < <(
    release_env_document \
      "$root" "$project" "$api_image" "$updater_image" "$prom_image" \
      "$api_port" "$prom_port" "$profile"
  )
}

release_topology_state() {
  local file=$1 root=$2 project=$3 prom_image=$4 api_port=$5 prom_port=$6 profile=$7
  local current_api current_updater legacy state proxy_url proxy_network
  current_api=$(env_value "$file" BGMSS_API_IMAGE)
  current_updater=$(env_value "$file" BGMSS_UPDATER_IMAGE)
  if ! release_proxy_assignment_present "$file"; then
    require_release_proxy_absent "$file"
    cmp -s \
      <(
        release_env_document \
          "$root" "$project" "$current_api" "$current_updater" \
          "$prom_image" "$api_port" "$prom_port" "$profile"
      ) \
      "$file" ||
      die "existing deployment topology/profile differs; deploy may only change images"
    state=clean
  else
    legacy=$(legacy_proxy_state "$file")
    IFS='|' read -r proxy_url proxy_network <<<"$legacy"
    cmp -s \
      <(
        legacy_release_env_document \
          "$root" "$project" "$current_api" "$current_updater" \
          "$prom_image" "$api_port" "$prom_port" "$profile" \
          "$proxy_url" "$proxy_network"
      ) \
      "$file" ||
      die "existing deployment topology/profile differs; deploy may only change images"
    state="legacy|$proxy_url|$proxy_network"
  fi
  printf '%s\n' "$state"
}

require_release_topology_unchanged() {
  release_topology_state "$@" >/dev/null
}

write_release_env() {
  local destination=$1
  shift
  release_env_document "$@" | atomic_write "$destination" 0640
}
