#!/usr/bin/env bash

artifact_buildx_version='0.34.1'
artifact_buildkit_version='0.27.1'
artifact_buildkit_image='docker.io/moby/buildkit:v0.27.1@sha256:1e110c71d389d6d24f67b9438e2f7b8da749a6ff407b22a1631e025c95599368'
artifact_buildkit_image_digest='sha256:1e110c71d389d6d24f67b9438e2f7b8da749a6ff407b22a1631e025c95599368'

artifact_require_container_toolchain() {
  local buildx_output
  local builder_output

  if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    echo 'a running Docker daemon is required' >&2
    return 1
  fi
  buildx_output="$(docker buildx version)"
  if [[ "$buildx_output" != *" v$artifact_buildx_version "* ]]; then
    echo "Docker Buildx $artifact_buildx_version is required, got: $buildx_output" >&2
    return 1
  fi
  builder_output="$(docker buildx inspect)"
  if ! grep -Eq '^Driver:[[:space:]]+docker-container$' <<<"$builder_output" ||
    ! grep -Fq "image=\"$artifact_buildkit_image\"" <<<"$builder_output" ||
    ! grep -Eq "^BuildKit version:[[:space:]]+v$artifact_buildkit_version$" \
      <<<"$builder_output"; then
    echo 'the current builder does not match the pinned BuildKit driver/version/image' >&2
    return 1
  fi
}
