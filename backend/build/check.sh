#!/usr/bin/env bash
set -euo pipefail

build_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
backend_root="$(CDPATH= cd -- "$build_root/.." && pwd -P)"
repository_root="$(CDPATH= cd -- "$backend_root/.." && pwd -P)"
generated_root="$build_root/.tmp"

# shellcheck source=path-policy.sh
source "$build_root/path-policy.sh"
# shellcheck source=source-policy.sh
source "$build_root/source-policy.sh"
# shellcheck source=toolchain-policy.sh
source "$build_root/toolchain-policy.sh"

target_architecture=''
usage() {
  echo 'usage: ./build/check.sh [--target-arch amd64|arm64]' >&2
}
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --target-arch)
      [[ "$#" -ge 2 ]] || {
        usage
        exit 2
      }
      target_architecture="$2"
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
if [[ -z "$target_architecture" ]]; then
  case "$(uname -m)" in
    arm64|aarch64) target_architecture='arm64' ;;
    x86_64|amd64) target_architecture='amd64' ;;
    *)
      echo 'unable to infer a supported target architecture' >&2
      exit 1
      ;;
  esac
fi
if [[ "$target_architecture" != 'amd64' && "$target_architecture" != 'arm64' ]]; then
  echo "unsupported target architecture: $target_architecture" >&2
  exit 1
fi

artifact_attest_source "$repository_root"

artifact_require_container_toolchain
"$build_root/test.sh"

generated_root="$(artifact_prepare_generated_root "$generated_root")"
check_root="$(mktemp -d "$generated_root/backend-check.XXXXXX")"
cleanup() {
  chmod -R u+w "$check_root" 2>/dev/null || true
  rm -rf -- "$check_root"
}
trap cleanup EXIT

first_root="$(
  "$build_root/build.sh" \
    --target-arch "$target_architecture" \
    --output-root "$check_root/output-one" \
    --cache-root "$check_root/cache-one"
)"
second_root="$(
  "$build_root/build.sh" \
    --target-arch "$target_architecture" \
    --output-root "$check_root/output-two" \
    --cache-root "$check_root/cache-two"
)"

if [[ "$(basename "$first_root")" != "$(basename "$second_root")" ]]; then
  echo 'fresh Backend builds produced different content addresses' >&2
  exit 1
fi
if ! diff -qr "$first_root" "$second_root" >/dev/null; then
  echo 'fresh Backend builds are not byte-identical:' >&2
  diff -qr "$first_root" "$second_root" >&2 || true
  exit 1
fi

mkdir -p \
  "$check_root/publish-cache/go-build" \
  "$check_root/publish-cache/go-mod" \
  "$check_root/publish-cache/go-path"
export GOCACHE="$check_root/publish-cache/go-build"
export GOMODCACHE="$check_root/publish-cache/go-mod"
export GOPATH="$check_root/publish-cache/go-path"
export GOENV=off
export GOWORK=off
export GOTOOLCHAIN=go1.26.5+auto
helper="$check_root/backend-artifact"
(
  cd "$backend_root"
  CGO_ENABLED=0 go build -tags artifacts -buildvcs=false -trimpath -ldflags='-buildid= -s -w' \
    -o "$helper" ./build
)
stable_root="$(
  "$helper" publish \
    --artifact-root "$first_root" \
    --destination-root "$generated_root/artifacts"
)"
"$build_root/smoke.sh" --artifact-root "$stable_root"

echo "BACKEND_ARTIFACT_ROOT=$stable_root"
