#!/usr/bin/env bash
set -euo pipefail

build_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
backend_root="$(CDPATH= cd -- "$build_root/.." && pwd -P)"
repository_root="$(CDPATH= cd -- "$backend_root/.." && pwd -P)"
generated_root="$build_root/.tmp"
go_image='docker.io/library/golang:1.26.5-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651'

# shellcheck source=path-policy.sh
source "$build_root/path-policy.sh"
# shellcheck source=smoke-resource-policy.sh
source "$build_root/smoke-resource-policy.sh"

artifact_root=''
usage() {
  echo 'usage: ./build/smoke.sh --artifact-root PATH' >&2
}
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --artifact-root)
      [[ "$#" -ge 2 ]] || {
        usage
        exit 2
      }
      artifact_root="$2"
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
if [[ -z "$artifact_root" || ! -d "$artifact_root" ]]; then
  usage
  exit 2
fi
artifact_root="$(CDPATH= cd -- "$artifact_root" && pwd -P)"

for command in docker node shasum tar; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "$command is required" >&2
    exit 1
  fi
done
if [[ "$(node --version)" != 'v24.18.0' ]]; then
  echo "Node 24.18.0 is required for Contracts validation, got $(node --version)" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo 'a running Docker daemon is required' >&2
  exit 1
fi
if ! docker image inspect "$go_image" >/dev/null 2>&1; then
  echo 'the declared pinned Go probe image must already exist locally' >&2
  exit 1
fi

statement_fields="$(
  ARTIFACT_ROOT="$artifact_root" CONTRACTS_ROOT="$repository_root/contracts/artifacts" \
    node --input-type=module <<'NODE'
import { pathToFileURL } from 'node:url';

const validator = await import(
  pathToFileURL(`${process.env.CONTRACTS_ROOT}/lib/validation.mjs`).href
);
const validated = validator.verifyComponentDirectory(process.env.ARTIFACT_ROOT, 'backend');
const images = validated.statement.artifacts.filter((artifact) =>
  artifact.path.endsWith('.oci.tar'),
);
if (images.length !== 1) throw new Error('Backend statement must contain one OCI archive');
process.stdout.write(
  [
    validated.statement.source.revision,
    validated.statement.target.architecture,
    images[0].path,
  ].join('\t'),
);
NODE
)"
IFS=$'\t' read -r source_revision target_architecture oci_relative_path <<<"$statement_fields"
if [[ -z "$source_revision" || -z "$target_architecture" || -z "$oci_relative_path" ]]; then
  echo 'Contracts validator returned incomplete Backend statement fields' >&2
  exit 1
fi
oci_path="$artifact_root/$oci_relative_path"
image_reference="localhost/bgmss-backend-api:${source_revision}-${target_architecture}"
if docker image inspect "$image_reference" >/dev/null 2>&1; then
  echo "refusing to replace an existing local image: $image_reference" >&2
  exit 1
fi

generated_root="$(artifact_prepare_generated_root "$generated_root")"
work_root="$(mktemp -d "$generated_root/backend-smoke.XXXXXX")"
resource_token="${$}-${work_root##*.}"
ownership_label_key='io.bgmss.backend-smoke'
ownership_label="$ownership_label_key=$resource_token"
api_container="bgmss-backend-api-$resource_token"
audit_container="bgmss-backend-audit-$resource_token"
probe_container="bgmss-backend-probe-$resource_token"
smoke_network="bgmss-backend-smoke-$resource_token"
api_container_id=''
audit_container_id=''
probe_container_id=''
smoke_network_id=''
image_id=''

cleanup() {
  local primary_status="$?"
  local cleanup_status=0
  trap - EXIT INT TERM
  set +e
  if [[ -n "$probe_container_id" ]]; then
    smoke_remove_owned_container \
      "$probe_container" "$probe_container_id" \
      "$ownership_label_key" "$resource_token" || cleanup_status=1
  fi
  if [[ -n "$audit_container_id" ]]; then
    smoke_remove_owned_container \
      "$audit_container" "$audit_container_id" \
      "$ownership_label_key" "$resource_token" || cleanup_status=1
  fi
  if [[ -n "$api_container_id" ]]; then
    smoke_remove_owned_container \
      "$api_container" "$api_container_id" \
      "$ownership_label_key" "$resource_token" || cleanup_status=1
  fi
  if [[ -n "$smoke_network_id" ]]; then
    smoke_remove_owned_network \
      "$smoke_network" "$smoke_network_id" \
      "$ownership_label_key" "$resource_token" || cleanup_status=1
  fi
  if [[ -n "$image_id" ]]; then
    smoke_remove_loaded_image "$image_reference" "$image_id" || cleanup_status=1
  fi
  chmod -R u+w "$work_root" 2>/dev/null || cleanup_status=1
  rm -rf -- "$work_root" || cleanup_status=1
  if [[ "$cleanup_status" != '0' ]]; then
    echo "Backend smoke cleanup also failed with status $cleanup_status" >&2
  fi
  smoke_cleanup_exit_status "$primary_status" "$cleanup_status"
  exit "$?"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for container_name in "$api_container" "$audit_container" "$probe_container"; do
  if docker container inspect "$container_name" >/dev/null 2>&1; then
    echo "refusing to replace an existing smoke container: $container_name" >&2
    exit 1
  fi
done
if docker network inspect "$smoke_network" >/dev/null 2>&1; then
  echo "refusing to replace an existing smoke network: $smoke_network" >&2
  exit 1
fi

snapshot_directory() {
  local root="$1"
  (
    cd "$root"
    find . -type f -print |
      LC_ALL=C sort |
      while IFS= read -r relative_path; do
        shasum -a 256 -- "$relative_path"
      done
  )
}

artifact_before="$work_root/artifact.before"
snapshot_directory "$artifact_root" >"$artifact_before"

fixture_source="$repository_root/contracts/goldens/archive/valid/minimal"
data_version="$(
  POINTER_PATH="$fixture_source/current-pointer.json" node --input-type=module <<'NODE'
import fs from 'node:fs';

const pointer = JSON.parse(fs.readFileSync(process.env.POINTER_PATH, 'utf8'));
if (typeof pointer.dataVersion !== 'string' || !pointer.dataVersion) {
  throw new Error('accepted Archive pointer has no dataVersion');
}
process.stdout.write(pointer.dataVersion);
NODE
)"
archive_root="$work_root/archive"
version_root="$archive_root/versions/$data_version"
mkdir -p "$version_root"
cp "$fixture_source/current-pointer.json" "$archive_root/current.json"
cp "$fixture_source/archive-manifest.json" "$version_root/manifest.json"
cp "$fixture_source/bangumi.sqlite" "$version_root/bangumi.sqlite"
chmod 0444 "$archive_root/current.json" "$version_root/manifest.json" "$version_root/bangumi.sqlite"
chmod 0555 "$archive_root" "$archive_root/versions" "$version_root"
archive_before="$work_root/archive.before"
snapshot_directory "$archive_root" >"$archive_before"

docker load --input "$oci_path" >&2
if ! image_id="$(
  docker image inspect --format '{{.Id}}' "$image_reference"
)"; then
  echo "OCI archive did not load the declared local image: $image_reference" >&2
  exit 1
fi
if ! smoke_valid_image_id "$image_id"; then
  echo "OCI archive returned an invalid image ID: $image_reference" >&2
  exit 1
fi
image_shape="$(
  docker image inspect \
    --format '{{json .Config.User}} {{json .Config.Entrypoint}}' \
    "$image_id"
)"
if [[ "$image_shape" != '"65532:65532" ["/usr/local/bin/bgmss-api"]' ]]; then
  echo "unexpected Backend image user/entrypoint: $image_shape" >&2
  exit 1
fi

if ! audit_container_id="$(
  docker create \
    --pull never \
    --name "$audit_container" \
    --label "$ownership_label" \
    --network none \
    "$image_id" \
    -archive-root /archive
)"; then
  echo 'failed to create the Backend rootfs-audit container' >&2
  exit 1
fi
if ! smoke_valid_object_id "$audit_container_id"; then
  echo 'Docker returned an invalid Backend rootfs-audit container ID' >&2
  exit 1
fi
rootfs_inventory="$work_root/rootfs.txt"
docker export "$audit_container_id" | tar -tf - | LC_ALL=C sort >"$rootfs_inventory"
smoke_remove_owned_container \
  "$audit_container" "$audit_container_id" \
  "$ownership_label_key" "$resource_token"
audit_container_id=''
if ! grep -Fxq 'usr/local/bin/bgmss-api' "$rootfs_inventory"; then
  echo 'runtime image omits the API executable' >&2
  exit 1
fi
if grep -E '(^|/)archive-smoke$' "$rootfs_inventory" >/dev/null; then
  echo 'runtime image contains the bundle-only Archive smoke executable' >&2
  exit 1
fi
if grep -Ev '/$' "$rootfs_inventory" |
  grep -E '(^|/)(src|go|go-build|pkg/mod)(/|$)|\\.go$|(^|/)(gcc|cc|make|git|sh|bash)$' \
    >/dev/null; then
  echo 'runtime image contains source, module cache, compiler, or build tools' >&2
  exit 1
fi

if ! smoke_network_id="$(
  docker network create \
    --driver bridge \
    --internal \
    --label "$ownership_label" \
    "$smoke_network"
)"; then
  echo 'failed to create the Backend smoke network' >&2
  exit 1
fi
if ! smoke_valid_object_id "$smoke_network_id"; then
  echo 'Docker returned an invalid Backend smoke network ID' >&2
  exit 1
fi
network_shape="$(
  docker network inspect \
    --format "{{.Internal}} {{index .Labels \"$ownership_label_key\"}}" \
    "$smoke_network_id"
)"
if [[ "$network_shape" != "true $resource_token" ]]; then
  echo "unexpected Backend smoke network policy: $network_shape" >&2
  exit 1
fi

if ! api_container_id="$(
  docker create \
    --pull never \
    --name "$api_container" \
    --label "$ownership_label" \
    --network "$smoke_network_id" \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --mount "type=bind,src=$archive_root,dst=/archive,readonly" \
    "$image_id" \
    -listen-address 0.0.0.0:8080 \
    -archive-root /archive
)"; then
  echo 'failed to create the Backend API smoke container' >&2
  exit 1
fi
if ! smoke_valid_object_id "$api_container_id"; then
  echo 'Docker returned an invalid Backend API smoke container ID' >&2
  exit 1
fi
docker start "$api_container_id" >/dev/null

if ! probe_container_id="$(
  docker create \
    --pull never \
    --name "$probe_container" \
    --label "$ownership_label" \
    --network "$smoke_network_id" \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --env "BGMSS_API_HOST=$api_container" \
    --entrypoint /bin/bash \
    "$go_image" \
    -ceu '
request() {
  endpoint="$1"
  expected="$2"
  exec 3<>"/dev/tcp/${BGMSS_API_HOST}/8080" || return 1
  printf "GET %s HTTP/1.0\r\nHost: %s\r\nConnection: close\r\n\r\n" \
    "$endpoint" "$BGMSS_API_HOST" >&3
  response="$(cat <&3)"
  exec 3<&-
  exec 3>&-
  printf "%s" "$response" | grep -q "^HTTP/1\\.[01] 200 " || return 1
  printf "%s" "$response" | grep -Fq "$expected"
}
attempt=0
while [ "$attempt" -lt 200 ]; do
  if request /livez "\"status\":\"live\"" &&
    request /readyz "\"status\":\"ready\"" &&
    request /metrics "bgmss_current_snapshot_info"; then
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 0.1
done
exit 1
'
)"; then
  echo 'failed to create the Backend probe container' >&2
  exit 1
fi
if ! smoke_valid_object_id "$probe_container_id"; then
  echo 'Docker returned an invalid Backend probe container ID' >&2
  exit 1
fi
docker start "$probe_container_id" >/dev/null
probe_status="$(docker wait "$probe_container_id")"
if [[ "$probe_status" != '0' ]]; then
  docker logs "$probe_container_id" >&2 || true
  docker logs "$api_container_id" >&2 || true
  echo 'Backend artifact health/readiness/metrics probe failed' >&2
  exit 1
fi
smoke_remove_owned_container \
  "$probe_container" "$probe_container_id" \
  "$ownership_label_key" "$resource_token"
probe_container_id=''

if [[ "$(docker inspect --format '{{.State.Running}} {{.Config.User}}' "$api_container_id")" != \
  'true 65532:65532' ]]; then
  echo 'Backend artifact did not remain running as non-root during smoke' >&2
  exit 1
fi
published_ports="$(
  docker inspect \
    --format '{{range $port, $_ := .HostConfig.PortBindings}}{{$port}}{{"\n"}}{{end}}' \
    "$api_container_id"
)"
attached_networks="$(
  docker inspect \
    --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' \
    "$api_container_id"
)"
api_owner="$(
  docker inspect \
    --format "{{index .Config.Labels \"$ownership_label_key\"}}" \
    "$api_container_id"
)"
if [[ -n "$published_ports" ]] ||
  [[ "$attached_networks" != "$smoke_network" ]] ||
  [[ "$api_owner" != "$resource_token" ]]; then
  echo 'Backend artifact smoke used an unexpected network or host publication' >&2
  exit 1
fi
docker stop --time 5 "$api_container_id" >/dev/null
docker wait "$api_container_id" >/dev/null
smoke_remove_owned_container \
  "$api_container" "$api_container_id" \
  "$ownership_label_key" "$resource_token"
api_container_id=''
smoke_remove_owned_network \
  "$smoke_network" "$smoke_network_id" \
  "$ownership_label_key" "$resource_token"
smoke_network_id=''

snapshot_directory "$archive_root" >"$work_root/archive.after"
snapshot_directory "$artifact_root" >"$work_root/artifact.after"
cmp "$archive_before" "$work_root/archive.after"
cmp "$artifact_before" "$work_root/artifact.after"
for container_name in "$api_container" "$audit_container" "$probe_container"; do
  if docker container inspect "$container_name" >/dev/null 2>&1; then
    echo "Backend smoke left a residual container: $container_name" >&2
    exit 1
  fi
done
if docker network inspect "$smoke_network" >/dev/null 2>&1; then
  echo "Backend smoke left a residual network: $smoke_network" >&2
  exit 1
fi

smoke_remove_loaded_image "$image_reference" "$image_id"
image_id=''
if docker image inspect "$image_reference" >/dev/null 2>&1; then
  echo "Backend smoke left a residual image: $image_reference" >&2
  exit 1
fi
echo 'backend artifact smoke passed'
