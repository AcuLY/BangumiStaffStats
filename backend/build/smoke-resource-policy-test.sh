#!/usr/bin/env bash
set -euo pipefail

if [[ "${BGMSS_SMOKE_FAKE_DOCKER:-}" == '1' ]]; then
  printf '%s\n' "$*" >>"$BGMSS_SMOKE_FAKE_LOG"
  target="${*: -1}"
  case "${1:-} ${2:-}" in
    'container inspect')
      if [[ "$target" == "$BGMSS_SMOKE_FAKE_CONTAINER_ID" &&
        "${BGMSS_SMOKE_FAKE_FAIL_CONTAINER_ID_INSPECT:-}" == '1' ]]; then
        exit 71
      fi
      if [[ "$target" == "$BGMSS_SMOKE_FAKE_CONTAINER_ID" ]]; then
        printf '%s\n' "$BGMSS_SMOKE_FAKE_CONTAINER_SHAPE"
      else
        printf '%s\n' "$BGMSS_SMOKE_FAKE_CONTAINER_NAME_ID"
      fi
      ;;
    'network inspect')
      if [[ "$target" == "$BGMSS_SMOKE_FAKE_NETWORK_ID" &&
        "${BGMSS_SMOKE_FAKE_FAIL_NETWORK_ID_INSPECT:-}" == '1' ]]; then
        exit 72
      fi
      if [[ "$target" == "$BGMSS_SMOKE_FAKE_NETWORK_ID" ]]; then
        printf '%s\n' "$BGMSS_SMOKE_FAKE_NETWORK_SHAPE"
      else
        printf '%s\n' "$BGMSS_SMOKE_FAKE_NETWORK_NAME_ID"
      fi
      ;;
    'image inspect')
      if [[ "$target" == "$BGMSS_SMOKE_FAKE_IMAGE_ID" &&
        "${BGMSS_SMOKE_FAKE_FAIL_IMAGE_ID_INSPECT:-}" == '1' ]]; then
        exit 73
      fi
      if [[ "$target" == "$BGMSS_SMOKE_FAKE_IMAGE_ID" ]]; then
        printf '%s\n' "$BGMSS_SMOKE_FAKE_IMAGE_ID_RESULT"
      else
        printf '%s\n' "$BGMSS_SMOKE_FAKE_IMAGE_TAG_ID"
      fi
      ;;
    'rm -f')
      [[ "${BGMSS_SMOKE_FAKE_FAIL_CONTAINER_REMOVE:-}" != '1' ]] || exit 74
      ;;
    'network rm')
      [[ "${BGMSS_SMOKE_FAKE_FAIL_NETWORK_REMOVE:-}" != '1' ]] || exit 75
      ;;
    'image rm')
      [[ "${BGMSS_SMOKE_FAKE_FAIL_IMAGE_REMOVE:-}" != '1' ]] || exit 76
      ;;
    *)
      echo "unexpected fake Docker invocation: $*" >&2
      exit 90
      ;;
  esac
  exit 0
fi

build_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
temporary_parent="$build_root/.tmp"
# shellcheck source=path-policy.sh
source "$build_root/path-policy.sh"
# shellcheck source=smoke-resource-policy.sh
source "$build_root/smoke-resource-policy.sh"

temporary_parent="$(artifact_prepare_generated_root "$temporary_parent")"
temporary_root="$(mktemp -d "$temporary_parent/backend-smoke-resource-test.XXXXXX")"
cleanup() {
  chmod -R u+w "$temporary_root" 2>/dev/null || true
  rm -rf -- "$temporary_root"
}
trap cleanup EXIT

fake_bin="$temporary_root/bin"
mkdir "$fake_bin"
ln -s "$build_root/smoke-resource-policy-test.sh" "$fake_bin/docker"
export PATH="$fake_bin:$PATH"
export BGMSS_SMOKE_FAKE_DOCKER=1
export BGMSS_SMOKE_FAKE_LOG="$temporary_root/docker.log"

container_id='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
replacement_container_id='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
network_id='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
replacement_network_id='dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
image_id='sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
replacement_image_id='sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
container_name='bgmss-test-container'
network_name='bgmss-test-network'
owner_key='io.bgmss.backend-smoke'
owner_value='test-owner'

export BGMSS_SMOKE_FAKE_CONTAINER_ID="$container_id"
export BGMSS_SMOKE_FAKE_CONTAINER_SHAPE="$container_id|/$container_name|$owner_value"
export BGMSS_SMOKE_FAKE_CONTAINER_NAME_ID="$container_id"
export BGMSS_SMOKE_FAKE_NETWORK_ID="$network_id"
export BGMSS_SMOKE_FAKE_NETWORK_SHAPE="$network_id|$network_name|$owner_value"
export BGMSS_SMOKE_FAKE_NETWORK_NAME_ID="$network_id"
export BGMSS_SMOKE_FAKE_IMAGE_ID="$image_id"
export BGMSS_SMOKE_FAKE_IMAGE_ID_RESULT="$image_id"
export BGMSS_SMOKE_FAKE_IMAGE_TAG_ID="$image_id"

reset_fake_failures() {
  unset \
    BGMSS_SMOKE_FAKE_FAIL_CONTAINER_ID_INSPECT \
    BGMSS_SMOKE_FAKE_FAIL_NETWORK_ID_INSPECT \
    BGMSS_SMOKE_FAKE_FAIL_IMAGE_ID_INSPECT \
    BGMSS_SMOKE_FAKE_FAIL_CONTAINER_REMOVE \
    BGMSS_SMOKE_FAKE_FAIL_NETWORK_REMOVE \
    BGMSS_SMOKE_FAKE_FAIL_IMAGE_REMOVE
}

reset_fake_shapes() {
  export BGMSS_SMOKE_FAKE_CONTAINER_SHAPE="$container_id|/$container_name|$owner_value"
  export BGMSS_SMOKE_FAKE_CONTAINER_NAME_ID="$container_id"
  export BGMSS_SMOKE_FAKE_NETWORK_SHAPE="$network_id|$network_name|$owner_value"
  export BGMSS_SMOKE_FAKE_NETWORK_NAME_ID="$network_id"
  export BGMSS_SMOKE_FAKE_IMAGE_ID_RESULT="$image_id"
  export BGMSS_SMOKE_FAKE_IMAGE_TAG_ID="$image_id"
}

assert_no_removal() {
  if grep -E '^(rm -f|network rm|image rm)( |$)' "$BGMSS_SMOKE_FAKE_LOG" >/dev/null; then
    echo 'resource policy removed a resource after an identity mismatch' >&2
    exit 1
  fi
}

reset_fake_failures
reset_fake_shapes
: >"$BGMSS_SMOKE_FAKE_LOG"
export BGMSS_SMOKE_FAKE_CONTAINER_NAME_ID="$replacement_container_id"
if smoke_remove_owned_container \
  "$container_name" "$container_id" "$owner_key" "$owner_value" 2>/dev/null; then
  echo 'container cleanup accepted a foreign name replacement' >&2
  exit 1
fi
assert_no_removal

reset_fake_shapes
: >"$BGMSS_SMOKE_FAKE_LOG"
export BGMSS_SMOKE_FAKE_NETWORK_NAME_ID="$replacement_network_id"
if smoke_remove_owned_network \
  "$network_name" "$network_id" "$owner_key" "$owner_value" 2>/dev/null; then
  echo 'network cleanup accepted a foreign name replacement' >&2
  exit 1
fi
assert_no_removal

reset_fake_shapes
: >"$BGMSS_SMOKE_FAKE_LOG"
export BGMSS_SMOKE_FAKE_CONTAINER_SHAPE="$replacement_container_id|/$container_name|$owner_value"
if smoke_remove_owned_container \
  "$container_name" "$container_id" "$owner_key" "$owner_value" 2>/dev/null; then
  echo 'container cleanup accepted an immutable-ID mismatch' >&2
  exit 1
fi
assert_no_removal

reset_fake_shapes
: >"$BGMSS_SMOKE_FAKE_LOG"
export BGMSS_SMOKE_FAKE_CONTAINER_SHAPE="$container_id|/$container_name|foreign-owner"
if smoke_remove_owned_container \
  "$container_name" "$container_id" "$owner_key" "$owner_value" 2>/dev/null; then
  echo 'container cleanup accepted a foreign ownership label' >&2
  exit 1
fi
assert_no_removal

reset_fake_shapes
: >"$BGMSS_SMOKE_FAKE_LOG"
export BGMSS_SMOKE_FAKE_NETWORK_SHAPE="$replacement_network_id|$network_name|$owner_value"
if smoke_remove_owned_network \
  "$network_name" "$network_id" "$owner_key" "$owner_value" 2>/dev/null; then
  echo 'network cleanup accepted an immutable-ID mismatch' >&2
  exit 1
fi
assert_no_removal

reset_fake_shapes
: >"$BGMSS_SMOKE_FAKE_LOG"
export BGMSS_SMOKE_FAKE_NETWORK_SHAPE="$network_id|$network_name|foreign-owner"
if smoke_remove_owned_network \
  "$network_name" "$network_id" "$owner_key" "$owner_value" 2>/dev/null; then
  echo 'network cleanup accepted a foreign ownership label' >&2
  exit 1
fi
assert_no_removal

reset_fake_shapes
: >"$BGMSS_SMOKE_FAKE_LOG"
export BGMSS_SMOKE_FAKE_IMAGE_TAG_ID="$replacement_image_id"
if smoke_remove_loaded_image "$container_name:latest" "$image_id" 2>/dev/null; then
  echo 'image cleanup accepted a replacement tag' >&2
  exit 1
fi
assert_no_removal

for inspect_target in container network image; do
  reset_fake_failures
  reset_fake_shapes
  : >"$BGMSS_SMOKE_FAKE_LOG"
  case "$inspect_target" in
    container)
      export BGMSS_SMOKE_FAKE_FAIL_CONTAINER_ID_INSPECT=1
      if smoke_remove_owned_container \
        "$container_name" "$container_id" "$owner_key" "$owner_value" 2>/dev/null; then
        echo 'container cleanup accepted an immutable-ID inspect failure' >&2
        exit 1
      fi
      ;;
    network)
      export BGMSS_SMOKE_FAKE_FAIL_NETWORK_ID_INSPECT=1
      if smoke_remove_owned_network \
        "$network_name" "$network_id" "$owner_key" "$owner_value" 2>/dev/null; then
        echo 'network cleanup accepted an immutable-ID inspect failure' >&2
        exit 1
      fi
      ;;
    image)
      export BGMSS_SMOKE_FAKE_FAIL_IMAGE_ID_INSPECT=1
      if smoke_remove_loaded_image "$container_name:latest" "$image_id" 2>/dev/null; then
        echo 'image cleanup accepted an immutable-ID inspect failure' >&2
        exit 1
      fi
      ;;
  esac
  assert_no_removal
done

for remove_target in container network image; do
  reset_fake_failures
  reset_fake_shapes
  : >"$BGMSS_SMOKE_FAKE_LOG"
  case "$remove_target" in
    container)
      export BGMSS_SMOKE_FAKE_FAIL_CONTAINER_REMOVE=1
      if smoke_remove_owned_container \
        "$container_name" "$container_id" "$owner_key" "$owner_value" 2>/dev/null; then
        echo 'container cleanup hid an immutable-ID removal failure' >&2
        exit 1
      fi
      grep -Fxq "rm -f -- $container_id" "$BGMSS_SMOKE_FAKE_LOG"
      ;;
    network)
      export BGMSS_SMOKE_FAKE_FAIL_NETWORK_REMOVE=1
      if smoke_remove_owned_network \
        "$network_name" "$network_id" "$owner_key" "$owner_value" 2>/dev/null; then
        echo 'network cleanup hid an immutable-ID removal failure' >&2
        exit 1
      fi
      grep -Fxq "network rm $network_id" "$BGMSS_SMOKE_FAKE_LOG"
      ;;
    image)
      export BGMSS_SMOKE_FAKE_FAIL_IMAGE_REMOVE=1
      if smoke_remove_loaded_image "$container_name:latest" "$image_id" 2>/dev/null; then
        echo 'image cleanup hid an immutable-ID removal failure' >&2
        exit 1
      fi
      grep -Fxq "image rm $image_id" "$BGMSS_SMOKE_FAKE_LOG"
      ;;
  esac
done

reset_fake_failures
reset_fake_shapes
: >"$BGMSS_SMOKE_FAKE_LOG"
smoke_remove_owned_container \
  "$container_name" "$container_id" "$owner_key" "$owner_value"
smoke_remove_owned_network \
  "$network_name" "$network_id" "$owner_key" "$owner_value"
smoke_remove_loaded_image "$container_name:latest" "$image_id"
if ! grep -Fxq "rm -f -- $container_id" "$BGMSS_SMOKE_FAKE_LOG" ||
  ! grep -Fxq "network rm $network_id" "$BGMSS_SMOKE_FAKE_LOG" ||
  ! grep -Fxq "image rm $image_id" "$BGMSS_SMOKE_FAKE_LOG" ||
  grep -Eq '^image rm .* -f|^image rm -f' "$BGMSS_SMOKE_FAKE_LOG"; then
  echo 'resource policy did not remove normal resources by immutable ID' >&2
  exit 1
fi

reset_fake_failures
reset_fake_shapes
export BGMSS_SMOKE_FAKE_FAIL_CONTAINER_REMOVE=1
: >"$BGMSS_SMOKE_FAKE_LOG"
trap_stdout="$temporary_root/trap.stdout"
trap_stderr="$temporary_root/trap.stderr"
set +e
(
  set -euo pipefail
  cleanup_container_id="$container_id"
  cleanup() {
    local primary_status="$?"
    local cleanup_status=0
    trap - EXIT
    set +e
    smoke_remove_owned_container \
      "$container_name" "$cleanup_container_id" \
      "$owner_key" "$owner_value" || cleanup_status=1
    if [[ "$cleanup_status" != '0' ]]; then
      echo "Backend smoke cleanup also failed with status $cleanup_status" >&2
    fi
    smoke_cleanup_exit_status "$primary_status" "$cleanup_status"
    exit "$?"
  }
  trap cleanup EXIT
  exit 37
) >"$trap_stdout" 2>"$trap_stderr"
trap_status="$?"
set -e
if [[ "$trap_status" != '37' ]] ||
  [[ -s "$trap_stdout" ]] ||
  ! grep -Fxq 'Backend smoke cleanup also failed with status 1' "$trap_stderr" ||
  ! grep -Fxq "rm -f -- $container_id" "$BGMSS_SMOKE_FAKE_LOG"; then
  echo 'EXIT cleanup harness did not preserve primary failure with secondary evidence' >&2
  exit 1
fi

echo 'backend smoke resource policy tests passed'
