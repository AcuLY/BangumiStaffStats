#!/usr/bin/env bash

set -Eeuo pipefail

umask 077
unset BASH_ENV CDPATH ENV GLOBIGNORE IFS KSH_ENV NODE_OPTIONS NODE_PATH \
  PERL5OPT PS4 PYTHONHOME PYTHONINSPECT PYTHONPATH PYTHONSTARTUP RUBYOPT \
  ZDOTDIR
while IFS= read -r inherited_name; do
  case "$inherited_name" in
    DOCKER_* | COMPOSE_*)
      unset "$inherited_name" || exit 1
      ;;
  esac
done < <(compgen -e)
unset inherited_name
export LANG="C.UTF-8"
export LC_ALL="C.UTF-8"
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export TZ="UTC"

readonly docker_endpoint="unix:///var/run/docker.sock"
readonly docker_config="/run/bgmss-docker-config-absent"
[[ -d /run && ! -L /run &&
   "$(stat -Lc '%u:%g' /run)" == "0:0" ]] || exit 1
docker_config_parent_mode="$(stat -Lc '%a' /run)" || exit 1
[[ "$docker_config_parent_mode" =~ ^[0-7]{3,4}$ ]] || exit 1
(( (8#$docker_config_parent_mode & 0022) == 0 )) || exit 1
unset docker_config_parent_mode
[[ ! -e "$docker_config" && ! -L "$docker_config" ]] || exit 1
export DOCKER_HOST="$docker_endpoint"
export DOCKER_CONFIG="$docker_config"

readonly validation_root="/srv/bgmss-ops-validation"
readonly production_root="/srv/bgmss-v2"
readonly legacy_root="/srv/bgmss"
readonly project="bgmss_ops_validation"
readonly port="19090"
readonly minimum_docker_api_version="1.45"
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

kernel_name="$(uname -s)" || die
readonly kernel_name
kernel_release="$(uname -r)" || die
readonly kernel_release
architecture="$(uname -m)" || die
readonly architecture
[[ "$kernel_name" == "Linux" &&
   "$kernel_release" =~ ^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$ &&
   "$architecture" == "x86_64" ]] || die

# The fixed mutation and cleanup payload uses these non-POSIX Bash, GNU,
# util-linux, findutils, tar, and curl capabilities. Gate the features rather
# than a distribution or unrelated patch version.
bash -c '
  set -Eeuo pipefail
  declare -A associative=([key]=value)
  mapfile -t records < <(printf "%s\n" one two)
  exec {descriptor}</dev/null
  [[ "${associative[key]}" == "value" &&
     "${records[*]}" == "one two" &&
     "$descriptor" =~ ^[0-9]+$ ]]
  exec {descriptor}>&-
' || die
base64 --help 2>&1 | grep -F -- '--decode' >/dev/null || die
cmp --help 2>&1 | grep -F -- '--silent' >/dev/null || die
dd --help 2>&1 | grep -F -- 'iflag=FLAGS' >/dev/null || die
dd --help 2>&1 | grep -F -- 'status=LEVEL' >/dev/null || die
dd --help 2>&1 | grep -F -- 'notrunc' >/dev/null || die
find --help 2>&1 | grep -F -- '-print0' >/dev/null || die
find --help 2>&1 | grep -F -- '-printf' >/dev/null || die
find --help 2>&1 | grep -F -- '-quit' >/dev/null || die
flock --help 2>&1 | grep -F -- '--exclusive' >/dev/null || die
flock --help 2>&1 | grep -F -- '--nonblock' >/dev/null || die
flock --help 2>&1 | grep -F -- '--shared' >/dev/null || die
flock --help 2>&1 | grep -F -- '--timeout' >/dev/null || die
flock --help 2>&1 | grep -F -- '--unlock' >/dev/null || die
install --help 2>&1 | grep -F -- '--group' >/dev/null || die
install --help 2>&1 | grep -F -- '--owner' >/dev/null || die
ionice --help 2>&1 | grep -F -- '--class' >/dev/null || die
mv --help 2>&1 |
  grep -E -- '(^|[[:space:],])-T([,[:space:]]|$)' >/dev/null || die
mv --help 2>&1 | grep -F -- '--no-clobber' >/dev/null || die
nice --help 2>&1 | grep -F -- '--adjustment' >/dev/null || die
readlink --help 2>&1 | grep -F -- '--canonicalize' >/dev/null || die
setsid --help 2>&1 | grep -F -- '--fork' >/dev/null || die
sort --help 2>&1 | grep -F -- '--zero-terminated' >/dev/null || die
stat --help 2>&1 | grep -F -- '--dereference' >/dev/null || die
sync --help 2>&1 | grep -F -- '--file-system' >/dev/null || die
tar --help 2>&1 | grep -F -- '--keep-old-files' >/dev/null || die
tar --help 2>&1 | grep -F -- '--no-same-owner' >/dev/null || die
tar --help 2>&1 | grep -F -- '--no-same-permissions' >/dev/null || die
timeout --help 2>&1 | grep -F -- '--kill-after' >/dev/null || die
timeout --help 2>&1 | grep -F -- '--signal' >/dev/null || die
curl --help all 2>&1 | grep -F -- '--max-filesize' >/dev/null || die
date_milliseconds="$(date +%s%3N)" || die
readonly date_milliseconds
[[ "$date_milliseconds" =~ ^[0-9]{13}$ ]] || die

api_version_at_least() {
  local actual="$1"
  local minimum="$2"
  local actual_major actual_minor minimum_major minimum_minor
  [[ "$actual" =~ ^(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})$ ]] || return 1
  actual_major="${BASH_REMATCH[1]}"
  actual_minor="${BASH_REMATCH[2]}"
  [[ "$minimum" =~ ^(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})$ ]] ||
    return 1
  minimum_major="${BASH_REMATCH[1]}"
  minimum_minor="${BASH_REMATCH[2]}"
  (( 10#${actual_major} > 10#${minimum_major} ||
     (10#${actual_major} == 10#${minimum_major} &&
      10#${actual_minor} >= 10#${minimum_minor}) ))
}

docker_version_json="$(
  docker version --format '{{json .}}' | head -c 65537
)" || die
readonly docker_version_json
docker_version_bytes="$(
  printf '%s' "$docker_version_json" | wc -c | tr -d '[:space:]'
)" || die
readonly docker_version_bytes
[[ "$docker_version_bytes" =~ ^[1-9][0-9]{0,4}$ &&
   "$docker_version_bytes" -le 65536 ]] || die
docker_capability_tsv="$(
  jq -er '
    def api_field:
      [
        to_entries[] |
        select(.key == "ApiVersion" or .key == "APIVersion")
      ] as $matches |
      if ($matches | length) == 1 then
        $matches[0].value
      else
        error("ambiguous Docker API version field")
      end;
    if type != "object" or
       (.Client | type) != "object" or
       (.Server | type) != "object"
    then
      error("Docker version evidence has an invalid root")
    else
      .Client as $client |
      .Server as $server |
      [
        $client.Version,
        ($client | api_field),
        $server.Version,
        ($server | api_field),
        $server.MinAPIVersion,
        $server.Os,
        $server.Arch
      ] |
      if all(.[]; type == "string") then
        @tsv
      else
        error("Docker version evidence has a non-string field")
      end
    end
  ' <<< "$docker_version_json"
)" || die
readonly docker_capability_tsv
IFS=$'\t' read -r \
  docker_client_version \
  docker_negotiated_api_version \
  docker_server_version \
  docker_server_api_version \
  docker_server_minimum_api_version \
  docker_server_os \
  docker_server_architecture \
  docker_version_extra <<< "$docker_capability_tsv" || die
[[ -z "$docker_version_extra" ]] || die
readonly docker_client_version
readonly docker_negotiated_api_version
readonly docker_server_version
readonly docker_server_api_version
readonly docker_server_minimum_api_version
readonly docker_server_os
readonly docker_server_architecture
readonly docker_version_extra
compose_plugins_json="$(
  docker info --format '{{json .ClientInfo.Plugins}}' | head -c 65537
)" || die
readonly compose_plugins_json
compose_plugins_bytes="$(
  printf '%s' "$compose_plugins_json" | wc -c | tr -d '[:space:]'
)" || die
readonly compose_plugins_bytes
[[ "$compose_plugins_bytes" =~ ^[1-9][0-9]{0,4}$ &&
   "$compose_plugins_bytes" -le 65536 ]] || die
compose_plugin_path="$(
  jq -er '
    if type != "array" then
      error("Docker client plugin evidence is not an array")
    else
      [
        .[] |
        select(type == "object" and .Name? == "compose")
      ] as $matches |
      if ($matches | length) == 1 and
         ($matches[0].Path | type) == "string"
      then
        $matches[0].Path
      else
        error("Docker Compose client plugin selection is not unique")
      end
    end
  ' <<< "$compose_plugins_json"
)" || die
readonly compose_plugin_path
[[ "$compose_plugin_path" =~ ^/usr/(local/)?lib(exec)?/docker/cli-plugins/docker-compose$ ]] ||
  die
compose_plugin_canonical="$(readlink -f -- "$compose_plugin_path")" || die
readonly compose_plugin_canonical
[[ "$compose_plugin_canonical" == "$compose_plugin_path" &&
   -f "$compose_plugin_canonical" && ! -L "$compose_plugin_canonical" ]] ||
  die
compose_plugin_metadata="$(
  stat -Lc $'%d\t%i\t%a\t%u\t%g\t%s\t%h\t%Y' -- \
    "$compose_plugin_canonical"
)" || die
readonly compose_plugin_metadata
IFS=$'\t' read -r \
  compose_plugin_device \
  compose_plugin_inode \
  compose_plugin_mode \
  compose_plugin_uid \
  compose_plugin_gid \
  compose_plugin_size \
  compose_plugin_links \
  compose_plugin_mtime \
  compose_plugin_extra <<< "$compose_plugin_metadata" || die
[[ -z "$compose_plugin_extra" &&
   "$compose_plugin_device" =~ ^[0-9]+$ &&
   "$compose_plugin_inode" =~ ^[1-9][0-9]*$ &&
   "$compose_plugin_mode" =~ ^[0-7]{3,4}$ &&
   "$compose_plugin_uid" == "0" &&
   "$compose_plugin_gid" == "0" &&
   "$compose_plugin_size" =~ ^[1-9][0-9]*$ &&
   "$compose_plugin_links" == "1" &&
   "$compose_plugin_mtime" =~ ^[0-9]+$ ]] || die
(( (8#$compose_plugin_mode & 0111) != 0 &&
   (8#$compose_plugin_mode & 0022) == 0 )) || die
readonly compose_plugin_device
readonly compose_plugin_inode
readonly compose_plugin_mode
readonly compose_plugin_uid
readonly compose_plugin_gid
readonly compose_plugin_size
readonly compose_plugin_links
readonly compose_plugin_mtime
readonly compose_plugin_extra
compose_plugin_digest="$(
  sha256sum -- "$compose_plugin_canonical" | cut -d' ' -f1
)" || die
readonly compose_plugin_digest
[[ "$compose_plugin_digest" =~ ^[0-9a-f]{64}$ ]] || die
compose_version="$(
  docker compose version --short | sed -E 's/^v//'
)" || die
readonly compose_version
[[ "$docker_client_version" =~ ^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$ &&
   "$docker_server_version" =~ ^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$ &&
   "$docker_server_os" == "linux" &&
   "$docker_server_architecture" == "amd64" &&
   "$compose_version" =~ ^2\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$ ]] || die
api_version_at_least \
  "$docker_negotiated_api_version" "$minimum_docker_api_version" || die
api_version_at_least \
  "$docker_negotiated_api_version" "$docker_server_minimum_api_version" || die
api_version_at_least \
  "$docker_server_api_version" "$docker_negotiated_api_version" || die
compose_help="$(docker compose --help 2>&1)" || die
readonly compose_help
compose_config_help="$(docker compose config --help 2>&1)" || die
readonly compose_config_help
compose_create_help="$(docker compose create --help 2>&1)" || die
readonly compose_create_help
grep -E '(^|[[:space:]])--profile([=[:space:]]|$)' \
  <<< "$compose_help" >/dev/null || die
grep -E '(^|[[:space:]])--project-name([=[:space:]]|$)' \
  <<< "$compose_help" >/dev/null || die
grep -E '(^|[[:space:]])--file([=[:space:]]|$)' \
  <<< "$compose_help" >/dev/null || die
grep -E '(^|[[:space:]])--env-file([=[:space:]]|$)' \
  <<< "$compose_help" >/dev/null || die
grep -E '(^|[[:space:]])--hash([=[:space:]]|$)' \
  <<< "$compose_config_help" >/dev/null || die
grep -E '(^|[[:space:]])--quiet([=[:space:]]|$)' \
  <<< "$compose_config_help" >/dev/null || die
grep -E '(^|[[:space:]])--no-build([=[:space:]]|$)' \
  <<< "$compose_create_help" >/dev/null || die
grep -E '(^|[[:space:]])--no-recreate([=[:space:]]|$)' \
  <<< "$compose_create_help" >/dev/null || die
docker image inspect --help >/dev/null 2>&1 || die
docker ps --help 2>&1 |
  grep -E '(^|[[:space:]])--filter([=[:space:]]|$)' >/dev/null || die
docker manifest inspect --help 2>&1 |
  grep -E '(^|[[:space:]])--verbose([=[:space:]]|$)' >/dev/null || die
docker pull --help 2>&1 |
  grep -E '(^|[[:space:]])--platform([=[:space:]]|$)' >/dev/null || die

[[ -d /srv && ! -L /srv ]] || die

root_absent="true"
[[ ! -e "$validation_root" && ! -L "$validation_root" ]] ||
  root_absent="false"
project_containers="$(
  docker ps -aq --filter "label=com.docker.compose.project=${project}"
)" || die
readonly project_containers
project_absent="true"
[[ -z "$project_containers" ]] ||
  project_absent="false"
project_named_volumes="$(
  docker volume ls -q --filter "label=com.docker.compose.project=${project}"
)" || die
readonly project_named_volumes
named_volumes_absent="true"
[[ -z "$project_named_volumes" ]] ||
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

available_kib="$(df -Pk /srv | awk 'NR==2 {print $4}')" || die
readonly available_kib
available_inodes="$(df -Pi /srv | awk 'NR==2 {print $4}')" || die
readonly available_inodes
[[ "$available_kib" =~ ^[0-9]+$ && "$available_inodes" =~ ^[0-9]+$ ]] || die
available_bytes="$((available_kib * 1024))"
readonly available_bytes
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
    exec 3>&1
    "$@" |
      awk '
        BEGIN { maximum_lines=100000; maximum_bytes=16777216 }
        {
          bytes += length($0) + 1
          if (NR > maximum_lines || bytes > maximum_bytes) exit 97
          print
        }
        END { print "count=" NR > "/dev/fd/3" }
      ' |
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
  local tool candidate canonical metadata digest
  for tool in "${tools[@]}"; do
    candidate="$(command -v "$tool")" || return
    canonical="$(readlink -f -- "$candidate")" || return
    [[ -f "$canonical" && ! -L "$canonical" ]] || return
    metadata="$(
      stat -c $'%d\t%i\t%a\t%u\t%g\t%s\t%h\t%Y' -- "$canonical"
    )" || return
    digest="$(sha256sum -- "$canonical" | cut -d' ' -f1)" || return
    printf '%s\t%s\t%s\t%s\n' \
      "$tool" \
      "$canonical" \
      "$metadata" \
      "$digest"
  done
  metadata="$(
    stat -Lc $'%d\t%i\t%a\t%u\t%g\t%s\t%h\t%Y' -- \
      "$compose_plugin_canonical"
  )" || return
  digest="$(
    sha256sum -- "$compose_plugin_canonical" | cut -d' ' -f1
  )" || return
  [[ "$metadata" == "$compose_plugin_metadata" &&
     "$digest" == "$compose_plugin_digest" &&
     "$(readlink -f -- "$compose_plugin_canonical")" == \
       "$compose_plugin_canonical" &&
     -f "$compose_plugin_canonical" && ! -L "$compose_plugin_canonical" ]] ||
    return
  printf '%s\t%s\t%s\t%s\n' \
    "docker-compose-plugin" \
    "$compose_plugin_canonical" \
    "$metadata" \
    "$digest"
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

containers="$(
  bounded_seal docker-containers \
    "all Docker container IDs/images/names/states" \
    container_records
)" || die
readonly containers
images="$(
  bounded_seal docker-images \
    "all Docker runtime IDs/repositories/tags/digests" \
    image_records
)" || die
readonly images
networks="$(
  bounded_seal docker-networks \
    "all Docker network IDs/names/drivers" \
    network_records
)" || die
readonly networks
volumes="$(
  bounded_seal docker-volumes \
    "all Docker volume names/drivers" \
    volume_records
)" || die
readonly volumes
listeners="$(
  bounded_seal listeners \
    "all TCP/UDP listener tuples and bounded process identities" \
    listener_records
)" || die
readonly listeners
processes="$(
  bounded_seal processes \
    "protected runtime and legacy PID/start-time/uid/command identities without arguments" \
    protected_process_records
)" || die
readonly processes
nginx_state="$(
  bounded_seal nginx-tree \
    "closed /etc/nginx tree; all regular bytes and symlink targets hashed; 10000 files/512MiB/300s bound" \
    tree_records /etc/nginx 10000 536870912 300
)" || die
readonly nginx_state
systemd_runtime="$(
  bounded_seal systemd-runtime \
    "all active/inactive unit identities without environment or arguments" \
    systemd_records
)" || die
readonly systemd_runtime
systemd_etc="$(
  bounded_seal systemd-etc-tree \
    "closed /etc/systemd/system tree; all regular bytes and symlink targets hashed; 10000 files/512MiB/300s bound" \
    tree_records /etc/systemd/system 10000 536870912 300
)" || die
readonly systemd_etc
systemd_vendor="$(
  bounded_seal systemd-vendor-tree \
    "closed /usr/lib/systemd/system tree; all regular bytes and symlink targets hashed; 20000 files/1GiB/300s bound" \
    tree_records /usr/lib/systemd/system 20000 1073741824 300
)" || die
readonly systemd_vendor
tls_letsencrypt="$(
  bounded_seal tls-letsencrypt-tree \
    "closed /etc/letsencrypt tree; path/lstat/ctime/symlink-target metadata only; regular secret bytes never read; 10000 files/600s bound" \
    tree_records /etc/letsencrypt 10000 0 600 metadata
)" || die
readonly tls_letsencrypt
tls_pki="$(
  bounded_seal tls-pki-tree \
    "closed /etc/pki/tls tree; path/lstat/ctime/symlink-target metadata only; regular secret bytes never read; 10000 files/600s bound" \
    tree_records /etc/pki/tls 10000 0 600 metadata
)" || die
readonly tls_pki
legacy_tree="$(
  bounded_seal legacy-bounded-tree \
    "closed legacy root xdev tree; path/lstat/ctime/symlink-target metadata only; live data bytes never read; 4096 files/600s bound" \
    tree_records "$legacy_root" 4096 0 600 metadata
)" || die
readonly legacy_tree
tool_state="$(
  bounded_seal required-tools \
    "exact path/inode/mode/owner/size/mtime and byte digest for every admitted host tool and selected system Compose plugin" \
    tool_records
)" || die
readonly tool_state
legacy_state="$(path_state "$legacy_root")" || die
readonly legacy_state
production_state="$(path_state "$production_root")" || die
readonly production_state

image_refs_json="$(
  printf '%s\n' "${image_refs[@]}" |
    sort |
    jq -Rsc 'split("\n") | map(select(length > 0))'
)" || die
tools_json="$(
  {
    printf '%s\n' "${tools[@]}"
    printf '%s\n' "docker-compose-plugin"
  } |
    jq -Rsc 'split("\n") | map(select(length > 0))'
)" || die

jq -cnS \
  --arg alias "myserver" \
  --arg architecture "$architecture" \
  --arg composePluginPath "$compose_plugin_path" \
  --arg composeVersion "$compose_version" \
  --arg dockerClientVersion "$docker_client_version" \
  --arg dockerConfig "$docker_config" \
  --arg dockerEndpoint "$docker_endpoint" \
  --arg dockerNegotiatedApiVersion "$docker_negotiated_api_version" \
  --arg dockerServerApiVersion "$docker_server_api_version" \
  --arg dockerServerMinimumApiVersion "$docker_server_minimum_api_version" \
  --arg dockerServerVersion "$docker_server_version" \
  --arg kernelName "$kernel_name" \
  --arg kernelRelease "$kernel_release" \
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
        composeConfigQuiet:true,
        composeCreateNoBuild:true,
        composeCreateNoRecreate:true,
        composeEnvFile:true,
        composeFile:true,
        composeProfiles:true,
        composeProjectName:true,
        dockerImageInspect:true,
        dockerLabelFilter:true,
        dockerManifestVerbose:true,
        dockerPlatformPull:true,
        dockerServerLinuxAmd64:true
      },
      composePluginPath:$composePluginPath,
      dockerClientVersion:$dockerClientVersion,
      dockerConfig:$dockerConfig,
      dockerEndpoint:$dockerEndpoint,
      dockerNegotiatedApiVersion:$dockerNegotiatedApiVersion,
      dockerServerApiVersion:$dockerServerApiVersion,
      dockerServerMinimumApiVersion:$dockerServerMinimumApiVersion,
      dockerServerVersion:$dockerServerVersion,
      hostCapabilities:{
        bashAssociativeArrays:true,
        bashDynamicFileDescriptors:true,
        bashMapfile:true,
        coreutilsDateMilliseconds:true,
        coreutilsMvNoClobber:true,
        coreutilsMvNoTargetDirectory:true,
        coreutilsSyncFileSystem:true,
        curlMaxFilesize:true,
        findutilsPrintf:true,
        utilLinuxSetsidFork:true
      },
      kernelName:$kernelName,
      kernelRelease:$kernelRelease,
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
