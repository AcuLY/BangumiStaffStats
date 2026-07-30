#!/usr/bin/env bash
set -euo pipefail

build_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
backend_root="$(CDPATH= cd -- "$build_root/.." && pwd -P)"
temporary_parent="$build_root/.tmp"
# shellcheck source=path-policy.sh
source "$build_root/path-policy.sh"
# shellcheck source=toolchain-policy.sh
source "$build_root/toolchain-policy.sh"
"$build_root/source-policy-test.sh"
temporary_parent="$(artifact_prepare_generated_root "$temporary_parent")"
temporary_root="$(mktemp -d "$temporary_parent/backend-test.XXXXXX")"

cleanup() {
  chmod -R u+w "$temporary_root" 2>/dev/null || true
  rm -rf -- "$temporary_root"
}
trap cleanup EXIT

path_probe_name=".bgmss-artifact-path-policy-${$}"
external_candidate="$backend_root/$path_probe_name"
escape_candidate="$build_root/$path_probe_name"
if [[ -e "$external_candidate" || -L "$external_candidate" ||
  -e "$escape_candidate" || -L "$escape_candidate" ]]; then
  echo 'path-policy probe candidate unexpectedly exists' >&2
  exit 1
fi
if artifact_resolve_child_directory \
  "$temporary_parent" "$external_candidate" 'external absolute probe' \
  >/dev/null 2>&1; then
  echo 'path policy accepted an external absolute root' >&2
  exit 1
fi
if artifact_resolve_child_directory \
  "$temporary_parent" "$temporary_parent/../$path_probe_name" 'dot-dot probe' \
  >/dev/null 2>&1; then
  echo 'path policy accepted a dot-dot escape' >&2
  exit 1
fi

symlink_parent="$temporary_root/symlink-parent"
ln -s "$backend_root" "$symlink_parent"
if artifact_resolve_child_directory \
  "$temporary_parent" "$symlink_parent/$path_probe_name" 'symlink-parent probe' \
  >/dev/null 2>&1; then
  echo 'path policy accepted a symlink parent' >&2
  exit 1
fi
symlink_child="$temporary_root/symlink-child"
ln -s "$backend_root" "$symlink_child"
if artifact_resolve_child_directory \
  "$temporary_parent" "$symlink_child" 'symlink-child probe' \
  >/dev/null 2>&1; then
  echo 'path policy accepted a symlink child' >&2
  exit 1
fi

real_probe_root="$temporary_root/real-root"
linked_probe_root="$temporary_root/linked-root"
mkdir "$real_probe_root"
ln -s "$real_probe_root" "$linked_probe_root"
if artifact_prepare_generated_root "$linked_probe_root" >/dev/null 2>&1; then
  echo 'path policy accepted a symlink generated root' >&2
  exit 1
fi
valid_output_probe="$temporary_root/valid-output"
valid_cache_probe="$temporary_root/valid-cache"
if "$build_root/build.sh" \
  --output-root "$valid_output_probe" \
  --cache-root "$external_candidate" >/dev/null 2>&1; then
  echo 'build.sh accepted an external cache root' >&2
  exit 1
fi
if "$build_root/build.sh" \
  --output-root "$temporary_parent/../$path_probe_name" \
  --cache-root "$valid_cache_probe" >/dev/null 2>&1; then
  echo 'build.sh accepted a dot-dot output escape' >&2
  exit 1
fi
if "$build_root/build.sh" \
  --output-root "$symlink_parent/$path_probe_name" \
  --cache-root "$valid_cache_probe" >/dev/null 2>&1; then
  echo 'build.sh accepted a symlink output parent' >&2
  exit 1
fi
if [[ -n "$(find "$real_probe_root" -mindepth 1 -print -quit)" ||
  -e "$external_candidate" || -L "$external_candidate" ||
  -e "$escape_candidate" || -L "$escape_candidate" ||
  -e "$valid_output_probe" || -L "$valid_output_probe" ||
  -e "$valid_cache_probe" || -L "$valid_cache_probe" ]]; then
  echo 'rejected path-policy probes caused an external write' >&2
  exit 1
fi
for entrypoint in build.sh check.sh smoke.sh test.sh; do
  if ! grep -Fq 'artifact_prepare_generated_root' "$build_root/$entrypoint"; then
    echo "$entrypoint does not protect backend/build/.tmp" >&2
    exit 1
  fi
done

smoke_docker_log="$temporary_root/smoke-docker.log"
touch "$smoke_docker_log"
if (
  export SMOKE_DOCKER_LOG="$smoke_docker_log"
  docker() {
    printf '%s\n' "$*" >>"$SMOKE_DOCKER_LOG"
    if [[ "${1:-}" == 'info' ]]; then
      return 0
    fi
    if [[ "${1:-}" == 'image' && "${2:-}" == 'inspect' ]]; then
      return 1
    fi
    return 88
  }
  node() {
    if [[ "${1:-}" == '--version' ]]; then
      printf '%s\n' 'v24.18.0'
      return 0
    fi
    return 89
  }
  export -f docker node
  "$build_root/smoke.sh" --artifact-root "$temporary_root" >/dev/null 2>&1
); then
  echo 'smoke accepted a missing local probe image' >&2
  exit 1
fi
if ! grep -Fxq 'info' "$smoke_docker_log" ||
  ! grep -Fq 'image inspect docker.io/library/golang:1.26.5-bookworm@sha256:' \
    "$smoke_docker_log" ||
  grep -E '(^| )(pull|run|load)( |$)' "$smoke_docker_log" >/dev/null; then
  echo 'smoke did not fail closed before network-capable Docker actions' >&2
  exit 1
fi
"$build_root/smoke-resource-policy-test.sh"

artifact_require_container_toolchain

mkdir -p \
  "$temporary_root/go-build" \
  "$temporary_root/go-mod" \
  "$temporary_root/go-path"
export GOCACHE="$temporary_root/go-build"
export GOMODCACHE="$temporary_root/go-mod"
export GOPATH="$temporary_root/go-path"
export GOENV=off
export GOWORK=off
export GOTOOLCHAIN=go1.26.5+auto

if [[ "$(go env GOVERSION)" != 'go1.26.5' ]]; then
  echo "Go 1.26.5 is required, got $(go env GOVERSION)" >&2
  exit 1
fi
pinned_gofmt="$(go env GOROOT)/bin/gofmt"
unformatted="$("$pinned_gofmt" -l "$build_root"/*.go)"
if [[ -n "$unformatted" ]]; then
  echo 'unformatted Backend build helper files:' >&2
  echo "$unformatted" >&2
  exit 1
fi

(
  cd "$backend_root"
  go test -tags artifacts ./build
)

dockerfile="$backend_root/Dockerfile"
if [[ "$(grep -c '^FROM ' "$dockerfile")" != '3' ]] ||
  ! grep -Fxq \
    'FROM --platform=$BUILDPLATFORM docker.io/library/golang:1.26.5-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651 AS build' \
    "$dockerfile" ||
  ! grep -Fxq \
    'FROM gcr.io/distroless/static-debian13:nonroot@sha256:f7f8f729987ad0fdf6b05eeeae94b26e6a0f613bdf46feea7fc40f7bd72953e6 AS runtime' \
    "$dockerfile" ||
  ! grep -Fxq 'FROM scratch AS binary' "$dockerfile"; then
  echo 'Backend Dockerfile stages are not the reviewed literal digest-pinned shape' >&2
  exit 1
fi
if grep -Eq '^ARG[[:space:]]+(GO_IMAGE|RUNTIME_IMAGE)(=|[[:space:]]|$)' "$dockerfile" ||
  grep -Eq '^FROM .*\$\{?(GO_IMAGE|RUNTIME_IMAGE)' "$dockerfile" ||
  grep -Eq -- '--build-arg[[:space:]]+"?(GO_IMAGE|RUNTIME_IMAGE)=' \
    "$build_root/build.sh"; then
  echo 'Backend base images must not be exposed as build-arg overrides' >&2
  exit 1
fi
if ! grep -Fq \
  'type=docker,dest=$raw_image_archive,tar=true,oci-mediatypes=true,rewrite-timestamp=true,name=$image_name' \
  "$build_root/build.sh" ||
  ! grep -Fq -- '--image-archive "$raw_image_archive"' "$build_root/build.sh" ||
  grep -Fq 'type=oci' "$build_root/build.sh" ||
  ! grep -Fq 'func admitImageArchive(' "$build_root/artifact.go" ||
  ! grep -Fq 'header.Format != tar.FormatUSTAR' "$build_root/artifact.go" ||
  ! grep -Fq 'func validateClosedImageLayout(' "$build_root/artifact.go" ||
  ! grep -Fq 'func validateDockerCompatibilityManifest(' "$build_root/artifact.go"; then
  echo 'Backend image build does not enforce the reviewed Docker-exporter OCI compatibility shape' >&2
  exit 1
fi
if grep -Eq 'tar[[:space:]]+(-[^[:space:]]*x|--extract)' \
  "$build_root/build.sh" \
  "$build_root/check.sh" \
  "$build_root/smoke.sh"; then
  echo 'Backend artifact pipeline must not generically extract the exporter archive' >&2
  exit 1
fi
if ! grep -Fxq 'USER 65532:65532' "$dockerfile" ||
  ! grep -Fxq 'ENTRYPOINT ["/usr/local/bin/bgmss-api"]' "$dockerfile"; then
  echo 'Backend Dockerfile does not enforce the reviewed non-root API entrypoint' >&2
  exit 1
fi
if [[ "$(grep -c 'internal/releaseinfo.Version=${APPLICATION_VERSION}' "$dockerfile")" != '2' ]] ||
  [[ "$(grep -c 'internal/releaseinfo.Commit=${SOURCE_REVISION}' "$dockerfile")" != '2' ]] ||
  ! grep -Fq 'org.opencontainers.image.version="${APPLICATION_VERSION}"' "$dockerfile" ||
  ! grep -Fq 'org.opencontainers.image.revision="${SOURCE_REVISION}"' "$dockerfile"; then
  echo 'Backend Dockerfile does not bind both binaries and OCI metadata to release identity' >&2
  exit 1
fi
for required_release_input in \
  "'VERSION'" \
  "'contracts/schemas/archive/compatibility-matrix.json'" \
  '--application-version "$application_version"' \
  '--archive-domain-rules-version "$accepted_domain_rules_version"' \
  '--archive-cast-rules-version "$accepted_cast_rules_version"' \
  '--archive-compatibility-matrix-sha256 "$compatibility_matrix_digest"'; do
  if ! grep -Fq -- "$required_release_input" "$build_root/build.sh"; then
    echo "Backend build omits release authority: $required_release_input" >&2
    exit 1
  fi
done
if ! grep -Fq -- '--build-info' "$build_root/build.sh" ||
  ! grep -Fq 'BGMSS_APPLICATION_VERSION=$application_version' "$build_root/smoke.sh" ||
  ! grep -Fq 'BGMSS_SOURCE_REVISION=$source_revision' "$build_root/smoke.sh"; then
  echo 'Backend artifact pipeline does not inspect both binary release identities' >&2
  exit 1
fi
if ! grep -Fq -- '-o /out/archive-smoke' "$dockerfile" ||
  ! grep -Fxq 'COPY --from=build /out/archive-smoke /archive-smoke' "$dockerfile" ||
  grep -Eq '^COPY .*archive-smoke .*/usr/local/' "$dockerfile"; then
  echo 'Backend Dockerfile does not export Archive smoke exclusively through the binary stage' >&2
  exit 1
fi
if ! grep -Fq 'docker image inspect "$go_image"' "$build_root/smoke.sh" ||
  [[ "$(grep -c -- '--pull never' "$build_root/smoke.sh")" != '3' ]]; then
  echo 'Backend smoke does not forbid implicit image pulls' >&2
  exit 1
fi
if ! grep -Fq 'docker network create' "$build_root/smoke.sh" ||
  ! grep -Fq -- '--internal' "$build_root/smoke.sh" ||
  ! grep -Fq -- '-listen-address 0.0.0.0:8080' "$build_root/smoke.sh" ||
  ! grep -Fq 'BGMSS_API_HOST=$api_container' "$build_root/smoke.sh" ||
  ! grep -Fq 'archive-smoke$' "$build_root/smoke.sh" ||
  grep -Fq -- '--network "container:' "$build_root/smoke.sh" ||
  grep -Eq -- '^[[:space:]]+(-p|-P)([=[:space:]]|$)|--publish([=[:space:]]|$)' \
    "$build_root/smoke.sh"; then
  echo 'Backend smoke does not enforce the reviewed internal-bridge/no-publish shape' >&2
  exit 1
fi
for ownership_marker in \
  "ownership_label_key='io.bgmss.backend-smoke'" \
  'refusing to replace an existing smoke container' \
  'refusing to replace an existing smoke network' \
  "api_container_id=''" \
  "audit_container_id=''" \
  "probe_container_id=''" \
  "smoke_network_id=''" \
  "image_id=''" \
  'smoke_remove_owned_container' \
  'smoke_remove_owned_network' \
  'smoke_remove_loaded_image'; do
  if ! grep -Fq "$ownership_marker" "$build_root/smoke.sh"; then
    echo "Backend smoke omits ownership marker: $ownership_marker" >&2
    exit 1
  fi
done
if grep -Fq 'docker image rm -f' \
  "$build_root/smoke.sh" \
  "$build_root/smoke-resource-policy.sh" ||
  [[ "$(
    awk '
      /docker load --input/ { after_load = 1; next }
      after_load && /docker / { print; exit }
    ' "$build_root/smoke.sh"
  )" != *"docker image inspect --format '{{.Id}}' \"\$image_reference\""* ]]; then
  echo 'Backend smoke does not immediately capture and safely remove the immutable image ID' >&2
  exit 1
fi
if grep -Ein '(apt-get|apk add|dnf |yum |curl |wget |git clone|docker push|buildx imagetools create)' \
  "$dockerfile" \
  "$build_root/build.sh" \
  "$build_root/check.sh" \
  "$build_root/smoke.sh" >/dev/null; then
  echo 'Backend build definitions contain a forbidden install/publication command' >&2
  exit 1
fi

for script in "$build_root"/*.sh; do
  bash -n "$script"
done

echo 'backend artifact helper tests passed'
