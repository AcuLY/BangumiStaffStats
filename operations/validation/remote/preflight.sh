#!/usr/bin/env bash

set -Eeuo pipefail

umask 077
unset BASH_ENV CDPATH ENV GLOBIGNORE IFS KSH_ENV NODE_OPTIONS NODE_PATH \
  PERL5OPT PS4 PYTHONHOME PYTHONINSPECT PYTHONPATH PYTHONSTARTUP RUBYOPT \
  ZDOTDIR
export LANG="C.UTF-8"
export LC_ALL="C.UTF-8"
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export TZ="UTC"

readonly validation_root="/srv/bgmss-ops-validation"
readonly production_root="/srv/bgmss-v2"
readonly legacy_root="/srv/bgmss"
readonly project="bgmss_ops_validation"
readonly port="19090"
readonly prometheus_ref="prom/prometheus:v3.13.1-distroless@sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80"
readonly prometheus_alias="localhost/bgmss-ops-validation-prometheus:v3.13.1-distroless-amd64"

die() {
  printf '%s\n' '{"code":"VALIDATION_PREFLIGHT_FAILED","status":"failed"}' >&2
  exit 1
}

[[ "$#" -eq 3 ]] || die
readonly product_revision="$1"
readonly required_bytes="$2"
readonly mode="$3"
[[ "$product_revision" =~ ^[0-9a-f]{40}$ ]] || die
[[ "$required_bytes" =~ ^[1-9][0-9]{0,19}$ ]] || die
[[ "$mode" == "admission" || "$mode" == "observation" ]] || die

readonly api_load_ref="localhost/bgmss-backend-api:${product_revision}-amd64"
readonly api_alias="localhost/bgmss-ops-validation-api:${product_revision}-amd64"
readonly updater_load_ref="localhost/bgmss-updater-artifact:${product_revision}-amd64"
readonly updater_alias="localhost/bgmss-ops-validation-updater:${product_revision}-amd64"
readonly -a image_refs=(
  "$api_alias"
  "$api_load_ref"
  "$prometheus_alias"
  "$prometheus_ref"
  "$updater_alias"
  "$updater_load_ref"
)

readonly -a tools=(
  awk
  base64
  bash
  chmod
  chown
  cmp
  cp
  curl
  cut
  date
  dd
  df
  docker
  find
  flock
  grep
  head
  id
  install
  ionice
  jq
  ln
  mkdir
  mv
  nginx
  nice
  od
  ps
  readlink
  renice
  rm
  rmdir
  sed
  setsid
  sha256sum
  sleep
  sort
  ss
  stat
  sync
  systemctl
  tail
  tar
  tee
  timeout
  tr
  uname
  wc
)

for tool in "${tools[@]}"; do
  command -v "$tool" >/dev/null 2>&1 || die
done
[[ "$(id -u)" == "0" ]] || die

readonly architecture="$(uname -m)"
[[ "$architecture" == "x86_64" ]] || die

# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == "centos" && "${VERSION_ID:-}" == "9" &&
   "${PRETTY_NAME:-}" == *"CentOS Stream 9"* ]] || die

readonly docker_version="$(docker version --format '{{.Server.Version}}')"
readonly docker_api_version="$(
  docker version --format '{{.Server.APIVersion}}'
)"
readonly docker_server_platform="$(
  docker version --format '{{.Server.Os}}/{{.Server.Arch}}'
)"
readonly compose_version="$(
  docker compose version --short | sed -E 's/^v//'
)"
[[ "$docker_version" =~ ^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$ &&
   "$docker_api_version" =~ ^[0-9]+\.[0-9]+$ &&
   "$docker_server_platform" == "linux/amd64" &&
   "$compose_version" =~ ^2\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$ ]] || die
docker compose --help 2>&1 |
  grep -Eq '(^|[[:space:]])--profile([=[:space:]]|$)' || die
docker compose config --help 2>&1 |
  grep -Eq '(^|[[:space:]])--hash([=[:space:]]|$)' || die
docker compose create --help 2>&1 |
  grep -Eq '(^|[[:space:]])--no-build([=[:space:]]|$)' || die
docker compose create --help 2>&1 |
  grep -Eq '(^|[[:space:]])--no-recreate([=[:space:]]|$)' || die
docker image inspect --help >/dev/null 2>&1 || die
docker ps --help 2>&1 |
  grep -Eq '(^|[[:space:]])--filter([=[:space:]]|$)' || die
docker manifest inspect --help 2>&1 |
  grep -Eq '(^|[[:space:]])--verbose([=[:space:]]|$)' || die
docker pull --help 2>&1 |
  grep -Eq '(^|[[:space:]])--platform([=[:space:]]|$)' || die

[[ -d /srv && ! -L /srv ]] || die

root_absent="true"
[[ ! -e "$validation_root" && ! -L "$validation_root" ]] ||
  root_absent="false"
project_absent="true"
[[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=${project}")" ]] ||
  project_absent="false"
named_volumes_absent="true"
[[ -z "$(docker volume ls -q --filter "label=com.docker.compose.project=${project}")" ]] ||
  named_volumes_absent="false"
for network in "${project}_runtime" "${project}_outbound"; do
  if docker network inspect "$network" >/dev/null 2>&1; then
    project_absent="false"
  fi
done
images_absent="true"
for reference in "${image_refs[@]}"; do
  if docker image inspect "$reference" >/dev/null 2>&1; then
    images_absent="false"
  fi
done
port_free="true"
if ss -H -ltn | awk -v port="$port" '
  {
    address=$4
    sub(/%.*/, "", address)
    if (address ~ ("(^|:)" port "$")) found=1
  }
  END { exit(found ? 0 : 1) }
'; then
  port_free="false"
fi

readonly available_kib="$(df -Pk /srv | awk 'NR==2 {print $4}')"
readonly available_inodes="$(df -Pi /srv | awk 'NR==2 {print $4}')"
[[ "$available_kib" =~ ^[0-9]+$ && "$available_inodes" =~ ^[0-9]+$ ]] || die
readonly available_bytes="$((available_kib * 1024))"
capacity_admitted="true"
(( available_bytes >= required_bytes && available_inodes >= 100000 )) ||
  capacity_admitted="false"
if [[ "$mode" == "admission" ]]; then
  [[ "$root_absent" == "true" &&
     "$project_absent" == "true" &&
     "$named_volumes_absent" == "true" &&
     "$images_absent" == "true" &&
     "$port_free" == "true" &&
     "$capacity_admitted" == "true" ]] || die
fi

path_state() {
  local candidate="$1"
  if [[ ! -e "$candidate" && ! -L "$candidate" ]]; then
    jq -cnS '{state:"absent"}'
    return
  fi
  local type
  type="$(stat -c '%F' -- "$candidate")"
  jq -cnS \
    --arg device "$(stat -c '%d' -- "$candidate")" \
    --arg gid "$(stat -c '%g' -- "$candidate")" \
    --arg inode "$(stat -c '%i' -- "$candidate")" \
    --arg mode "$(stat -c '%a' -- "$candidate")" \
    --arg type "$type" \
    --arg uid "$(stat -c '%u' -- "$candidate")" \
    '{
      device:$device,
      gid:$gid,
      inode:$inode,
      mode:$mode,
      state:"present",
      type:$type,
      uid:$uid
    }'
}

bounded_seal() {
  local id="$1"
  local coverage="$2"
  shift 2
  local summary digest count
  summary="$(
    "$@" |
      awk '
        BEGIN { maximum_lines=100000; maximum_bytes=16777216 }
        {
          bytes += length($0) + 1
          if (NR > maximum_lines || bytes > maximum_bytes) exit 97
          print
        }
      ' |
      tee >(wc -l | awk '{print "count=" $1}') |
      sha256sum |
      awk '{print "digest=" $1}'
  )" || die
  digest="$(printf '%s\n' "$summary" | awk -F= '$1=="digest" {print $2}')"
  count="$(printf '%s\n' "$summary" | awk -F= '$1=="count" {print $2}')"
  [[ "$digest" =~ ^[0-9a-f]{64}$ && "$count" =~ ^[0-9]+$ ]] || die
  jq -cnS \
    --arg coverage "$coverage" \
    --arg digest "sha256:${digest}" \
    --arg id "$id" \
    --argjson count "$count" \
    '{count:$count,coverage:$coverage,digest:$digest,id:$id}'
}

tree_records() {
  local root="$1"
  local maximum_count="$2"
  local content_limit="$3"
  local timeout_seconds="$4"
  local regular_mode="${5:-content}"
  [[ "$regular_mode" == "content" || "$regular_mode" == "metadata" ]] ||
    return 97
  if [[ ! -e "$root" && ! -L "$root" ]]; then
    printf '%s\n' "absent"
    return
  fi
  local started="$SECONDS"
  find "$root" -xdev -print0 |
    sort -z |
    (
      local consumed=0 count=0 file_count=0 candidate relative metadata type size digest target
      while IFS= read -r -d '' candidate; do
        count=$((count + 1))
        (( count <= maximum_count * 4 )) || exit 97
        (( SECONDS - started < timeout_seconds )) || exit 97
        relative="${candidate#"$root"}"
        [[ -n "$relative" ]] || relative="/"
        if [[ "$relative" == *$'\n'* || "$relative" == *$'\r'* ||
              "$relative" == *$'\t'* ]]; then
          exit 97
        fi
        metadata="$(stat -c '%d	%i	%F	%a	%u	%g	%s	%h	%Y	%Z' -- "$candidate")" ||
          exit
        type="$(stat -c '%F' -- "$candidate")" || exit
        size="$(stat -c '%s' -- "$candidate")" || exit
        digest="-"
        if [[ "$type" == "regular file" && "$regular_mode" == "content" ]]; then
          file_count=$((file_count + 1))
          (( file_count <= maximum_count )) || exit 97
          consumed=$((consumed + size))
          (( consumed <= content_limit )) || exit 97
          remaining=$((timeout_seconds - (SECONDS - started)))
          (( remaining > 0 )) || exit 97
          digest="$(
            timeout --signal=TERM --kill-after=5s "$remaining" \
              nice -n 10 ionice -c 3 \
              sha256sum -- "$candidate" |
              cut -d' ' -f1
          )" || exit
        elif [[ "$type" == "symbolic link" ]]; then
          target="$(readlink -- "$candidate")" || exit
          digest="$(
            printf '%s' "$target" |
              sha256sum |
              cut -d' ' -f1
          )" || exit
        fi
        printf '%s\t%s\t%s\n' "$relative" "$metadata" "$digest"
      done
    )
}

tool_records() {
  local tool candidate canonical
  for tool in "${tools[@]}"; do
    candidate="$(command -v "$tool")" || return
    canonical="$(readlink -f -- "$candidate")" || return
    [[ -f "$canonical" && ! -L "$canonical" ]] || return
    printf '%s\t%s\t%s\n' \
      "$tool" \
      "$(stat -c '%d	%i	%a	%u	%g	%s	%h	%Y' -- "$canonical")" \
      "$(sha256sum -- "$canonical" | cut -d' ' -f1)"
  done
}

container_records() {
  docker ps -a --no-trunc --format \
    '{{.ID}}	{{.Image}}	{{.Names}}	{{.State}}' |
    sort
}

image_records() {
  docker image ls --no-trunc --digests --format \
    '{{.ID}}	{{.Repository}}	{{.Tag}}	{{.Digest}}' |
    sort
}

network_records() {
  docker network ls --no-trunc --format '{{.ID}}	{{.Name}}	{{.Driver}}' |
    sort
}

volume_records() {
  docker volume ls --format '{{.Name}}	{{.Driver}}' |
    sort
}

listener_records() {
  ss -H -ltnup |
    sort
}

protected_process_records() {
  ps -eo pid=,lstart=,uid=,comm= |
    awk '
      $NF ~ /^(bgmss|containerd|containerd-shim|docker|dockerd|nginx|prometheus)$/ {
        print
      }
    ' |
    sort
}

systemd_records() {
  systemctl list-units --all --no-legend --no-pager |
    awk '
      $1 !~ /^session-[0-9]+[.]scope$/ &&
      $1 !~ /^user@[0-9]+[.]service$/ &&
      $1 !~ /^user-[0-9]+[.]slice$/ {
        print
      }
    ' |
    sort
}

readonly containers="$(
  bounded_seal docker-containers \
    "all Docker container IDs/images/names/states" \
    container_records
)"
readonly images="$(
  bounded_seal docker-images \
    "all Docker runtime IDs/repositories/tags/digests" \
    image_records
)"
readonly networks="$(
  bounded_seal docker-networks \
    "all Docker network IDs/names/drivers" \
    network_records
)"
readonly volumes="$(
  bounded_seal docker-volumes \
    "all Docker volume names/drivers" \
    volume_records
)"
readonly listeners="$(
  bounded_seal listeners \
    "all TCP/UDP listener tuples and bounded process identities" \
    listener_records
)"
readonly processes="$(
  bounded_seal processes \
    "protected runtime and legacy PID/start-time/uid/command identities without arguments" \
    protected_process_records
)"
readonly nginx_state="$(
  bounded_seal nginx-tree \
    "closed /etc/nginx tree; all regular bytes and symlink targets hashed; 10000 files/512MiB/300s bound" \
    tree_records /etc/nginx 10000 536870912 300
)"
readonly systemd_runtime="$(
  bounded_seal systemd-runtime \
    "all active/inactive unit identities without environment or arguments" \
    systemd_records
)"
readonly systemd_etc="$(
  bounded_seal systemd-etc-tree \
    "closed /etc/systemd/system tree; all regular bytes and symlink targets hashed; 10000 files/512MiB/300s bound" \
    tree_records /etc/systemd/system 10000 536870912 300
)"
readonly systemd_vendor="$(
  bounded_seal systemd-vendor-tree \
    "closed /usr/lib/systemd/system tree; all regular bytes and symlink targets hashed; 20000 files/1GiB/300s bound" \
    tree_records /usr/lib/systemd/system 20000 1073741824 300
)"
readonly tls_letsencrypt="$(
  bounded_seal tls-letsencrypt-tree \
    "closed /etc/letsencrypt tree; path/lstat/ctime/symlink-target metadata only; regular secret bytes never read; 10000 files/600s bound" \
    tree_records /etc/letsencrypt 10000 0 600 metadata
)"
readonly tls_pki="$(
  bounded_seal tls-pki-tree \
    "closed /etc/pki/tls tree; path/lstat/ctime/symlink-target metadata only; regular secret bytes never read; 10000 files/600s bound" \
    tree_records /etc/pki/tls 10000 0 600 metadata
)"
readonly legacy_tree="$(
  bounded_seal legacy-bounded-tree \
    "closed legacy root xdev tree; path/lstat/ctime/symlink-target metadata only; live data bytes never read; 4096 files/600s bound" \
    tree_records "$legacy_root" 4096 0 600 metadata
)"
readonly tool_state="$(
  bounded_seal required-tools \
    "exact executable inode/mode/owner/size/mtime and byte digest for every admitted host tool" \
    tool_records
)"
readonly legacy_state="$(path_state "$legacy_root")"
readonly production_state="$(path_state "$production_root")"

image_refs_json="$(
  printf '%s\n' "${image_refs[@]}" |
    sort |
    jq -Rsc 'split("\n") | map(select(length > 0))'
)"
tools_json="$(
  printf '%s\n' "${tools[@]}" |
    jq -Rsc 'split("\n") | map(select(length > 0))'
)"

jq -cnS \
  --arg alias "myserver" \
  --arg architecture "$architecture" \
  --arg composeVersion "$compose_version" \
  --arg dockerApiVersion "$docker_api_version" \
  --arg dockerVersion "$docker_version" \
  --arg osId "$ID" \
  --arg osPrettyName "$PRETTY_NAME" \
  --arg osVersionId "$VERSION_ID" \
  --arg conclusion "$([[ "$mode" == "admission" ]] && printf admitted || printf observed)" \
  --argjson namedVolumesAbsent "$named_volumes_absent" \
  --argjson imagesAbsent "$images_absent" \
  --argjson portFree "$port_free" \
  --argjson projectAbsent "$project_absent" \
  --argjson rootAbsent "$root_absent" \
  --argjson availableBytes "$available_bytes" \
  --argjson availableInodes "$available_inodes" \
  --argjson requiredBytes "$required_bytes" \
  --argjson containers "$containers" \
  --argjson images "$images" \
  --argjson networks "$networks" \
  --argjson volumes "$volumes" \
  --argjson listeners "$listeners" \
  --argjson processes "$processes" \
  --argjson nginx "$nginx_state" \
  --argjson systemdRuntime "$systemd_runtime" \
  --argjson systemdEtc "$systemd_etc" \
  --argjson systemdVendor "$systemd_vendor" \
  --argjson tlsLetsencrypt "$tls_letsencrypt" \
  --argjson tlsPki "$tls_pki" \
  --argjson legacyTree "$legacy_tree" \
  --argjson legacyRoot "$legacy_state" \
  --argjson productionRoot "$production_state" \
  --argjson imageRefs "$image_refs_json" \
  --argjson tools "$tools_json" \
  --argjson toolIdentity "$tool_state" \
  '{
    absence:{
      imageReferences:$imageRefs,
      imagesAbsent:$imagesAbsent,
      namedVolumesAbsent:$namedVolumesAbsent,
      portFree:$portFree,
      projectAbsent:$projectAbsent,
      rootAbsent:$rootAbsent
    },
    capacity:{
      availableBytes:$availableBytes,
      availableInodes:$availableInodes,
      requiredBytes:$requiredBytes
    },
    conclusion:$conclusion,
    host:{
      alias:$alias,
      architecture:$architecture,
      composeVersion:$composeVersion,
      containerCapabilities:{
        composeConfigHash:true,
        composeCreateNoBuild:true,
        composeCreateNoRecreate:true,
        composeProfiles:true,
        dockerImageInspect:true,
        dockerLabelFilter:true,
        dockerManifestVerbose:true,
        dockerPlatformPull:true,
        dockerServerLinuxAmd64:true
      },
      dockerApiVersion:$dockerApiVersion,
      dockerVersion:$dockerVersion,
      osId:$osId,
      osPrettyName:$osPrettyName,
      osVersionId:$osVersionId,
      uid:0
    },
    protected:{
      docker:{
        containers:$containers,
        images:$images,
        networks:$networks,
        volumes:$volumes
      },
      legacyRoot:$legacyRoot,
      legacyTree:$legacyTree,
      listeners:$listeners,
      nginx:$nginx,
      processes:$processes,
      productionRoot:$productionRoot,
      systemd:{
        etc:$systemdEtc,
        runtime:$systemdRuntime,
        vendor:$systemdVendor
      },
      tls:{
        letsencrypt:$tlsLetsencrypt,
        pki:$tlsPki
      }
    },
    schemaVersion:"operations-validation-preflight-v1",
    tools:{
      identity:$toolIdentity,
      names:$tools
    }
  }'
