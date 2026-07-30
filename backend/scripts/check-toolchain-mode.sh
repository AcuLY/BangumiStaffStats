#!/usr/bin/env bash

# Shared by check.sh and its focused contract test. The caller owns `set -e`.

bgmss_toolchain_error() {
  printf '%s\n' "backend toolchain mode error: $1" >&2
  return 1
}

bgmss_path_present() {
  [[ -e "$1" || -L "$1" ]]
}

bgmss_require_real_directory() {
  local candidate="$1"
  local label="$2"
  if [[ -L "$candidate" || ! -d "$candidate" ]]; then
    bgmss_toolchain_error "$label must be an existing real directory"
    return 1
  fi
}

bgmss_require_regular_file() {
  local candidate="$1"
  local label="$2"
  if [[ -L "$candidate" || ! -f "$candidate" ]]; then
    bgmss_toolchain_error "$label must be an existing regular non-symlink file"
    return 1
  fi
}

bgmss_require_single_link_executable() {
  local candidate="$1"
  local label="$2"
  local links
  bgmss_require_regular_file "$candidate" "$label" || return 1
  if [[ ! -x "$candidate" ]]; then
    bgmss_toolchain_error "$label must be executable"
    return 1
  fi
  links="$(/usr/bin/stat -f '%l' "$candidate" 2>/dev/null)" || {
    bgmss_toolchain_error "$label link count is unavailable"
    return 1
  }
  if [[ "$links" != "1" ]]; then
    bgmss_toolchain_error "$label must have exactly one hard link"
    return 1
  fi
}

bgmss_directory_identity() {
  /usr/bin/stat -f '%d:%i' "$1" 2>/dev/null
}

bgmss_require_preserved_directory_identity() {
  local candidate="$1"
  local expected="$2"
  local label="$3"
  local current
  bgmss_require_real_directory "$candidate" "$label" || return 1
  current="$(bgmss_directory_identity "$candidate")" || {
    bgmss_toolchain_error "$label identity is unavailable"
    return 1
  }
  if [[ "$current" != "$expected" ]]; then
    bgmss_toolchain_error "$label identity changed after admission"
    return 1
  fi
}

bgmss_require_acceptance_writable_roots_absent() {
  local candidate
  for candidate in \
    "$BGMSS_CHECK_CACHE_ROOT/go-build" \
    "$BGMSS_CHECK_CACHE_ROOT/go-path" \
    "$BGMSS_CHECK_CACHE_ROOT/npm" \
    "$BGMSS_CHECK_TEMPORARY_ROOT"; do
    if bgmss_path_present "$candidate"; then
      bgmss_toolchain_error "acceptance writable root must be absent at entry: $candidate"
      return 1
    fi
  done

  local entry
  while IFS= read -r entry; do
    if [[ "$entry" != "$BGMSS_CHECK_CACHE_ROOT/go-mod" ]]; then
      bgmss_toolchain_error "undeclared acceptance cache entry is present: $entry"
      return 1
    fi
  done < <(/usr/bin/find "$BGMSS_CHECK_CACHE_ROOT" -mindepth 1 -maxdepth 1 -print)
}

bgmss_select_check_toolchain_mode() {
  local backend_root="$1"
  local expected_goroot
  local module_root
  local physical_backend_root
  local physical_goroot
  local go_command
  local gofmt_command
  local reported

  BGMSS_CHECK_TOOLCHAIN_MODE='ordinary'
  BGMSS_CHECK_BACKEND_ROOT="$backend_root"
  BGMSS_CHECK_CACHE_ROOT="$backend_root/.cache"
  BGMSS_CHECK_TEMPORARY_ROOT="$backend_root/.tmp"
  BGMSS_CHECK_GO_COMMAND=''
  BGMSS_CHECK_GOFMT_COMMAND=''
  BGMSS_CHECK_BACKEND_IDENTITY=''
  BGMSS_CHECK_CACHE_IDENTITY=''

  if [[ "${BGMSS_ACCEPTANCE_GOROOT+x}" != "x" ]]; then
    export BGMSS_CHECK_TOOLCHAIN_MODE
    return 0
  fi
  BGMSS_CHECK_TOOLCHAIN_MODE='acceptance'

  if [[ "${GO_BOOTSTRAP+x}" == "x" ]]; then
    bgmss_toolchain_error "GO_BOOTSTRAP must be unset in acceptance mode"
    return 1
  fi

  physical_backend_root="$(CDPATH= cd -- "$backend_root" && pwd -P)" || {
    bgmss_toolchain_error "backend root physical path is unavailable"
    return 1
  }
  if [[ "$physical_backend_root" != "$backend_root" ]]; then
    bgmss_toolchain_error "backend root is not its exact physical path"
    return 1
  fi

  module_root="$BGMSS_CHECK_CACHE_ROOT/go-mod"
  expected_goroot="$module_root/golang.org/toolchain@v0.0.1-go1.26.5.darwin-arm64"
  if [[ -z "$BGMSS_ACCEPTANCE_GOROOT" ||
    "$BGMSS_ACCEPTANCE_GOROOT" != "$expected_goroot" ]]; then
    bgmss_toolchain_error "BGMSS_ACCEPTANCE_GOROOT must equal the exact fixed Go 1.26.5 path"
    return 1
  fi

  bgmss_require_real_directory "$BGMSS_CHECK_CACHE_ROOT" '.cache' || return 1
  bgmss_require_real_directory "$module_root" 'go-mod' || return 1
  bgmss_require_real_directory "$module_root/golang.org" 'golang.org' || return 1
  bgmss_require_real_directory "$expected_goroot" 'acceptance GOROOT' || return 1
  bgmss_require_real_directory "$expected_goroot/bin" 'acceptance GOROOT bin' ||
    return 1
  bgmss_require_real_directory "$expected_goroot/pkg" 'acceptance GOROOT pkg' ||
    return 1
  bgmss_require_real_directory \
    "$expected_goroot/pkg/tool" \
    'acceptance GOROOT pkg/tool' || return 1
  bgmss_require_real_directory \
    "$expected_goroot/pkg/tool/darwin_arm64" \
    'acceptance GOROOT pkg/tool/darwin_arm64' || return 1
  bgmss_require_real_directory "$expected_goroot/src" 'acceptance GOROOT src' ||
    return 1
  bgmss_require_real_directory \
    "$expected_goroot/src/runtime" \
    'acceptance GOROOT src/runtime' || return 1

  physical_goroot="$(CDPATH= cd -- "$expected_goroot" && pwd -P)" || {
    bgmss_toolchain_error "acceptance GOROOT physical path is unavailable"
    return 1
  }
  if [[ "$physical_goroot" != "$expected_goroot" ]]; then
    bgmss_toolchain_error "acceptance GOROOT is not its exact physical path"
    return 1
  fi

  bgmss_require_regular_file "$module_root/.seed-complete" \
    'module-cache completion marker' || return 1
  bgmss_require_regular_file "$expected_goroot/VERSION" 'GOROOT VERSION' ||
    return 1
  bgmss_require_regular_file \
    "$expected_goroot/pkg/tool/darwin_arm64/compile" \
    'GOROOT compiler' || return 1
  bgmss_require_regular_file \
    "$expected_goroot/src/runtime/runtime.go" \
    'GOROOT runtime source' || return 1

  go_command="$expected_goroot/bin/go"
  gofmt_command="$expected_goroot/bin/gofmt"
  bgmss_require_single_link_executable "$go_command" 'GOROOT go' || return 1
  bgmss_require_single_link_executable "$gofmt_command" 'GOROOT gofmt' ||
    return 1

  bgmss_require_acceptance_writable_roots_absent || return 1
  BGMSS_CHECK_BACKEND_IDENTITY="$(
    bgmss_directory_identity "$BGMSS_CHECK_BACKEND_ROOT"
  )" || {
    bgmss_toolchain_error "backend root identity is unavailable"
    return 1
  }
  BGMSS_CHECK_CACHE_IDENTITY="$(
    bgmss_directory_identity "$BGMSS_CHECK_CACHE_ROOT"
  )" || {
    bgmss_toolchain_error ".cache identity is unavailable"
    return 1
  }

  reported="$(
    /usr/bin/env \
      GOENV=off \
      GOMODCACHE="$module_root" \
      GOROOT="$expected_goroot" \
      GOTOOLCHAIN=local \
      GOWORK=off \
      "$go_command" env GOVERSION
  )" || {
    bgmss_toolchain_error "admitted Go GOVERSION probe failed"
    return 1
  }
  if [[ "$reported" != 'go1.26.5' ]]; then
    bgmss_toolchain_error "admitted Go must report GOVERSION go1.26.5"
    return 1
  fi
  reported="$(
    /usr/bin/env \
      GOENV=off \
      GOMODCACHE="$module_root" \
      GOROOT="$expected_goroot" \
      GOTOOLCHAIN=local \
      GOWORK=off \
      "$go_command" env GOROOT
  )" || {
    bgmss_toolchain_error "admitted Go GOROOT probe failed"
    return 1
  }
  if [[ "$reported" != "$expected_goroot" ]]; then
    bgmss_toolchain_error "admitted Go reported an unexpected GOROOT"
    return 1
  fi
  reported="$(
    /usr/bin/env \
      GOENV=off \
      GOMODCACHE="$module_root" \
      GOROOT="$expected_goroot" \
      GOTOOLCHAIN=local \
      GOWORK=off \
      "$go_command" version
  )" || {
    bgmss_toolchain_error "admitted Go version probe failed"
    return 1
  }
  if [[ "$reported" != 'go version go1.26.5 darwin/arm64' ]]; then
    bgmss_toolchain_error "admitted Go must report go1.26.5 darwin/arm64"
    return 1
  fi

  BGMSS_CHECK_GO_COMMAND="$go_command"
  BGMSS_CHECK_GOFMT_COMMAND="$gofmt_command"
  export BGMSS_CHECK_TOOLCHAIN_MODE
  export GOENV=off
  export GOMODCACHE="$module_root"
  export GOROOT="$expected_goroot"
  export GOTOOLCHAIN=local
  export GOWORK=off
  export GO_BOOTSTRAP="$go_command"
}

bgmss_cleanup_ordinary_check_state() {
  if [[ -d "$BGMSS_CHECK_CACHE_ROOT" ]]; then
    chmod -R u+w "$BGMSS_CHECK_CACHE_ROOT" 2>/dev/null || true
  fi
  rm -rf -- "$BGMSS_CHECK_CACHE_ROOT" "$BGMSS_CHECK_TEMPORARY_ROOT"
}

bgmss_remove_acceptance_owned_root() {
  local candidate="$1"
  if [[ -L "$candidate" ]]; then
    /bin/rm -- "$candidate"
  elif [[ ! -e "$candidate" ]]; then
    return 0
  elif [[ ! -d "$candidate" ]]; then
    /bin/rm -- "$candidate"
  else
    /usr/bin/find -P "$candidate" -depth -type d \
      -exec /bin/chmod u+rwx {} + 2>/dev/null || true
    /bin/rm -rf -- "$candidate"
  fi
  if bgmss_path_present "$candidate"; then
    bgmss_toolchain_error "acceptance root cleanup did not remove: $candidate"
    return 1
  fi
}

bgmss_require_acceptance_cleanup_parents() {
  bgmss_require_preserved_directory_identity \
    "$BGMSS_CHECK_BACKEND_ROOT" \
    "$BGMSS_CHECK_BACKEND_IDENTITY" \
    'admitted backend root' || return 1
  bgmss_require_preserved_directory_identity \
    "$BGMSS_CHECK_CACHE_ROOT" \
    "$BGMSS_CHECK_CACHE_IDENTITY" \
    'admitted .cache' || return 1
}

bgmss_cleanup_acceptance_check_state() {
  local result=0
  local candidate
  bgmss_require_acceptance_cleanup_parents || return 1
  for candidate in \
    "$BGMSS_CHECK_CACHE_ROOT/go-build" \
    "$BGMSS_CHECK_CACHE_ROOT/go-path" \
    "$BGMSS_CHECK_CACHE_ROOT/npm" \
    "$BGMSS_CHECK_TEMPORARY_ROOT"; do
    bgmss_require_acceptance_cleanup_parents || return 1
    bgmss_remove_acceptance_owned_root "$candidate" || result=1
  done
  bgmss_require_acceptance_cleanup_parents || return 1
  return "$result"
}

bgmss_cleanup_check_state() {
  if [[ "$BGMSS_CHECK_TOOLCHAIN_MODE" == 'acceptance' ]]; then
    bgmss_cleanup_acceptance_check_state
  else
    bgmss_cleanup_ordinary_check_state
  fi
}

bgmss_acceptance_disposable_roots_absent() {
  local candidate
  for candidate in \
    "$BGMSS_CHECK_CACHE_ROOT/go-build" \
    "$BGMSS_CHECK_CACHE_ROOT/go-path" \
    "$BGMSS_CHECK_CACHE_ROOT/npm" \
    "$BGMSS_CHECK_TEMPORARY_ROOT"; do
    if bgmss_path_present "$candidate"; then
      bgmss_toolchain_error "backend disposable state remains: $candidate"
      return 1
    fi
  done
}

bgmss_finish_check() {
  local incoming_status="$1"
  local cleanup_status=0
  trap - EXIT INT TERM
  bgmss_cleanup_check_state || cleanup_status=$?
  if [[ "$incoming_status" -ne 0 ]]; then
    exit "$incoming_status"
  fi
  exit "$cleanup_status"
}

bgmss_install_check_traps() {
  trap 'bgmss_finish_check "$?"' EXIT
  if [[ "$BGMSS_CHECK_TOOLCHAIN_MODE" == 'acceptance' ]]; then
    trap 'exit 130' INT
    trap 'exit 143' TERM
  fi
}
