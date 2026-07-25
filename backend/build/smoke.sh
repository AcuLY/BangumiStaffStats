#!/usr/bin/env bash
set -euo pipefail

build_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
backend_root="$(CDPATH= cd -- "$build_root/.." && pwd -P)"
repository_root="$(CDPATH= cd -- "$backend_root/.." && pwd -P)"
generated_root="$build_root/.tmp"
go_image='docker.io/library/golang:1.26.5-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651'

# shellcheck source=path-policy.sh
source "$build_root/path-policy.sh"

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
api_container="bgmss-backend-api-${$}"
audit_container="bgmss-backend-audit-${$}"
image_loaded=0

cleanup() {
  docker rm -f "$api_container" "$audit_container" >/dev/null 2>&1 || true
  if [[ "$image_loaded" == '1' ]]; then
    docker image rm -f "$image_reference" >/dev/null 2>&1 || true
  fi
  chmod -R u+w "$work_root" 2>/dev/null || true
  rm -rf -- "$work_root"
}
trap cleanup EXIT

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
image_loaded=1
if ! docker image inspect "$image_reference" >/dev/null 2>&1; then
  echo "OCI archive did not load the declared local image: $image_reference" >&2
  exit 1
fi
image_shape="$(
  docker image inspect \
    --format '{{json .Config.User}} {{json .Config.Entrypoint}}' \
    "$image_reference"
)"
if [[ "$image_shape" != '"65532:65532" ["/usr/local/bin/bgmss-api"]' ]]; then
  echo "unexpected Backend image user/entrypoint: $image_shape" >&2
  exit 1
fi

docker create --name "$audit_container" "$image_reference" -archive-root /archive >/dev/null
rootfs_inventory="$work_root/rootfs.txt"
docker export "$audit_container" | tar -tf - | LC_ALL=C sort >"$rootfs_inventory"
docker rm "$audit_container" >/dev/null
if ! grep -Fxq 'usr/local/bin/bgmss-api' "$rootfs_inventory"; then
  echo 'runtime image omits the API executable' >&2
  exit 1
fi
if grep -Ev '/$' "$rootfs_inventory" |
  grep -E '(^|/)(src|go|go-build|pkg/mod)(/|$)|\\.go$|(^|/)(gcc|cc|make|git|sh|bash)$' \
    >/dev/null; then
  echo 'runtime image contains source, module cache, compiler, or build tools' >&2
  exit 1
fi

docker run -d \
  --pull never \
  --name "$api_container" \
  --network none \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --mount "type=bind,src=$archive_root,dst=/archive,readonly" \
  "$image_reference" \
  -archive-root /archive >/dev/null

if ! docker run --rm \
  --pull never \
  --network "container:$api_container" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --entrypoint /bin/bash \
  "$go_image" \
  -ceu '
request() {
  endpoint="$1"
  expected="$2"
  exec 3<>/dev/tcp/127.0.0.1/8080 || return 1
  printf "GET %s HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n" "$endpoint" >&3
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
'; then
  docker logs "$api_container" >&2 || true
  echo 'Backend artifact health/readiness/metrics probe failed' >&2
  exit 1
fi

if [[ "$(docker inspect --format '{{.State.Running}} {{.Config.User}}' "$api_container")" != \
  'true 65532:65532' ]]; then
  echo 'Backend artifact did not remain running as non-root during smoke' >&2
  exit 1
fi
docker stop --time 5 "$api_container" >/dev/null
docker wait "$api_container" >/dev/null
docker rm "$api_container" >/dev/null

snapshot_directory "$archive_root" >"$work_root/archive.after"
snapshot_directory "$artifact_root" >"$work_root/artifact.after"
cmp "$archive_before" "$work_root/archive.after"
cmp "$artifact_before" "$work_root/artifact.after"
if docker ps -a --format '{{.Names}}' | grep -Fxq "$api_container"; then
  echo 'Backend smoke left a residual API container' >&2
  exit 1
fi

docker image rm -f "$image_reference" >/dev/null
image_loaded=0
echo 'backend artifact smoke passed'
