#!/usr/bin/env bash
set -euo pipefail

script_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
helper_path="$script_root/check-toolchain-mode.sh"

fail() {
  printf '%s\n' "check-toolchain-mode-test: $1" >&2
  exit 1
}

path_present() {
  [[ -e "$1" || -L "$1" ]]
}

snapshot_tree() {
  local root="$1"
  local output="$2"
  if ! path_present "$root"; then
    fail "cannot snapshot absent path: $root"
  fi
  (
    local entry
    local metadata
    local payload
    local checksum
    while IFS= read -r entry; do
      metadata="$(/usr/bin/stat -f '%HT|%d|%i|%Lp|%l|%z' "$entry")"
      payload='-'
      if [[ -L "$entry" ]]; then
        payload="$(/usr/bin/readlink "$entry")"
      elif [[ -f "$entry" ]]; then
        checksum="$(/usr/bin/shasum -a 256 "$entry")"
        payload="${checksum%% *}"
      fi
      printf '%s|%s|%s\n' "${entry#"$root"}" "$metadata" "$payload"
    done < <(/usr/bin/find -P "$root" -print | LC_ALL=C /usr/bin/sort)
  ) >"$output"
}

assert_absent() {
  if path_present "$1"; then
    fail "expected path to be absent: $1"
  fi
}

assert_equal() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: expected '$expected', got '$actual'"
  fi
}

create_fixture() {
  local name="$1"
  case "$name" in
    '' | *'/'* | '.' | '..') fail "unsafe fixture name: $name" ;;
  esac
  fixture_root="$test_root/fixtures/$name"
  fixture_backend="$fixture_root/backend"
  fixture_cache_root="$fixture_backend/.cache"
  fixture_module_root="$fixture_cache_root/go-mod"
  fixture_goroot="$fixture_module_root/golang.org/toolchain@v0.0.1-go1.26.5.darwin-arm64"
  fixture_outside="$fixture_root/outside-sentinel"
  fixture_redirect_root="$fixture_root/redirect-cache"
  mkdir -p \
    "$fixture_goroot/bin" \
    "$fixture_goroot/pkg/tool/darwin_arm64" \
    "$fixture_goroot/src/runtime"
  printf '%s\n' 'seeded' >"$fixture_module_root/.seed-complete"
  printf '%s\n' 'go1.26.5' >"$fixture_goroot/VERSION"
  printf '%s\n' 'compiler' >"$fixture_goroot/pkg/tool/darwin_arm64/compile"
  printf '%s\n' 'runtime' >"$fixture_goroot/src/runtime/runtime.go"
  printf '%s\n' 'outside-must-remain' >"$fixture_outside"
  /bin/chmod 0644 \
    "$fixture_module_root/.seed-complete" \
    "$fixture_goroot/VERSION" \
    "$fixture_goroot/pkg/tool/darwin_arm64/compile" \
    "$fixture_goroot/src/runtime/runtime.go" \
    "$fixture_outside"

  /bin/cat >"$fixture_goroot/bin/go" <<'FAKE_GO'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$#" -eq 2 && "$1" == 'env' && "$2" == 'GOVERSION' ]]; then
  printf '%s\n' "${BGMSS_FAKE_GOVERSION:-go1.26.5}"
  exit 0
fi
if [[ "$#" -eq 2 && "$1" == 'env' && "$2" == 'GOROOT' ]]; then
  printf '%s\n' "${BGMSS_FAKE_GOROOT:-$GOROOT}"
  exit 0
fi
if [[ "$#" -eq 1 && "$1" == 'version' ]]; then
  printf '%s\n' "${BGMSS_FAKE_GO_VERSION:-go version go1.26.5 darwin/arm64}"
  exit 0
fi
exit 93
FAKE_GO
  /bin/cat >"$fixture_goroot/bin/gofmt" <<'FAKE_GOFMT'
#!/usr/bin/env bash
exit 0
FAKE_GOFMT
  /bin/chmod 0755 "$fixture_goroot/bin/go" "$fixture_goroot/bin/gofmt"
}

mutate_fixture() {
  local mutation="$1"
  case "$mutation" in
    none) ;;
    symlink-cache)
      /bin/mv "$fixture_cache_root" "$fixture_root/cache-target"
      /bin/ln -s "$fixture_root/cache-target" "$fixture_cache_root"
      ;;
    symlink-go-mod)
      /bin/mv "$fixture_module_root" "$fixture_root/go-mod-target"
      /bin/ln -s "$fixture_root/go-mod-target" "$fixture_module_root"
      ;;
    symlink-golang)
      /bin/mv "$fixture_module_root/golang.org" "$fixture_root/golang-target"
      /bin/ln -s "$fixture_root/golang-target" "$fixture_module_root/golang.org"
      ;;
    symlink-goroot)
      /bin/mv "$fixture_goroot" "$fixture_root/goroot-target"
      /bin/ln -s "$fixture_root/goroot-target" "$fixture_goroot"
      ;;
    symlink-bin)
      /bin/mv "$fixture_goroot/bin" "$fixture_root/bin-target"
      /bin/ln -s "$fixture_root/bin-target" "$fixture_goroot/bin"
      ;;
    symlink-version)
      /bin/mv "$fixture_goroot/VERSION" "$fixture_root/version-target"
      /bin/ln -s "$fixture_root/version-target" "$fixture_goroot/VERSION"
      ;;
    symlink-go)
      /bin/mv "$fixture_goroot/bin/go" "$fixture_root/go-target"
      /bin/ln -s "$fixture_root/go-target" "$fixture_goroot/bin/go"
      ;;
    missing-marker) /bin/rm "$fixture_module_root/.seed-complete" ;;
    missing-runtime) /bin/rm "$fixture_goroot/src/runtime/runtime.go" ;;
    missing-go) /bin/rm "$fixture_goroot/bin/go" ;;
    missing-gofmt) /bin/rm "$fixture_goroot/bin/gofmt" ;;
    nonexecuting-go) /bin/chmod 0644 "$fixture_goroot/bin/go" ;;
    nonexecuting-gofmt) /bin/chmod 0644 "$fixture_goroot/bin/gofmt" ;;
    hardlinked-go) /bin/ln "$fixture_goroot/bin/go" "$fixture_root/go-hardlink" ;;
    hardlinked-gofmt)
      /bin/ln "$fixture_goroot/bin/gofmt" "$fixture_root/gofmt-hardlink"
      ;;
    stale-go-build) mkdir "$fixture_cache_root/go-build" ;;
    stale-go-path) mkdir "$fixture_cache_root/go-path" ;;
    stale-npm) mkdir "$fixture_cache_root/npm" ;;
    stale-tmp) mkdir "$fixture_backend/.tmp" ;;
    dangling-go-build)
      /bin/ln -s "$fixture_root/absent-go-build" "$fixture_cache_root/go-build"
      ;;
    dangling-go-path)
      /bin/ln -s "$fixture_root/absent-go-path" "$fixture_cache_root/go-path"
      ;;
    dangling-npm)
      /bin/ln -s "$fixture_root/absent-npm" "$fixture_cache_root/npm"
      ;;
    dangling-tmp)
      /bin/ln -s "$fixture_root/absent-tmp" "$fixture_backend/.tmp"
      ;;
    undeclared-cache)
      printf '%s\n' 'escape' >"$fixture_cache_root/undeclared"
      ;;
    *) fail "unknown fixture mutation: $mutation" ;;
  esac
}

run_lifecycle_runner() {
  local backend_root="$1"
  local mode="$2"
  local outside_sentinel="$3"
  local redirect_root="$4"
  local fixture_container
  local preserved_cache
  local target_pid

  # shellcheck source=check-toolchain-mode.sh
  source "$helper_path"
  unset GO_BOOTSTRAP
  unset BGMSS_FAKE_GOVERSION BGMSS_FAKE_GOROOT BGMSS_FAKE_GO_VERSION
  export BGMSS_ACCEPTANCE_GOROOT="$backend_root/.cache/go-mod/golang.org/toolchain@v0.0.1-go1.26.5.darwin-arm64"
  bgmss_select_check_toolchain_mode "$backend_root"
  bgmss_install_check_traps
  mkdir -p \
    "$backend_root/.cache/go-build/nested" \
    "$backend_root/.cache/go-path" \
    "$backend_root/.cache/npm" \
    "$backend_root/.tmp"
  printf '%s\n' 'disposable' >"$backend_root/.cache/go-build/nested/file"
  /bin/ln -s "$outside_sentinel" "$backend_root/.cache/go-build/outside-link"

  case "$mode" in
    failure) exit 37 ;;
    leaf-types)
      /bin/rm -- \
        "$backend_root/.cache/go-build/nested/file" \
        "$backend_root/.cache/go-build/outside-link"
      /bin/rmdir \
        "$backend_root/.cache/go-build/nested" \
        "$backend_root/.cache/go-build" \
        "$backend_root/.cache/go-path"
      /bin/ln -s "$outside_sentinel" "$backend_root/.cache/go-build"
      printf '%s\n' 'non-directory-leaf' >"$backend_root/.cache/go-path"
      exit 37
      ;;
    term | int)
      target_pid="$$"
      (
        /bin/sleep 0.1
        if [[ "$mode" == 'term' ]]; then
          /bin/kill -TERM "$target_pid"
        else
          /bin/kill -INT "$target_pid"
        fi
      ) &
      while :; do
        /bin/sleep 1
      done
      ;;
    ancestor-cleanup | ancestor-failure | ancestor-term | ancestor-int | ancestor-directory)
      fixture_container="$(CDPATH= cd -- "$backend_root/.." && pwd -P)"
      preserved_cache="$fixture_container/preserved-cache"
      /bin/mv "$backend_root/.cache" "$preserved_cache"
      if [[ "$mode" == 'ancestor-directory' ]]; then
        /bin/mv "$redirect_root" "$backend_root/.cache"
      else
        /bin/ln -s "$redirect_root" "$backend_root/.cache"
      fi
      case "$mode" in
        ancestor-failure) exit 37 ;;
        ancestor-term | ancestor-int)
          target_pid="$$"
          (
            /bin/sleep 0.1
            if [[ "$mode" == 'ancestor-term' ]]; then
              /bin/kill -TERM "$target_pid"
            else
              /bin/kill -INT "$target_pid"
            fi
          ) &
          while :; do
            /bin/sleep 1
          done
          ;;
        ancestor-cleanup | ancestor-directory) ;;
      esac
      ;;
    *) fail "unknown lifecycle runner mode: $mode" ;;
  esac
}

if [[ "${1:-}" == '--lifecycle-runner' ]]; then
  if [[ "$#" -ne 5 ]]; then
    fail 'lifecycle runner requires backend, mode, and outside roots'
  fi
  run_lifecycle_runner "$2" "$3" "$4" "$5"
  exit 0
fi

test_parent="$(CDPATH= cd -- "${TMPDIR:-/tmp}" && pwd -P)" ||
  fail 'temporary parent physical path is unavailable'
test_root="$(/usr/bin/mktemp -d "$test_parent/bgmss-toolchain-mode.XXXXXX")"
test_root="$(CDPATH= cd -- "$test_root" && pwd -P)" ||
  fail 'test root physical path is unavailable'
case "$test_root" in
  "$test_parent"/bgmss-toolchain-mode.*) ;;
  *) fail "unexpected test root: $test_root" ;;
esac
test_ownership_marker="$test_root/.bgmss-toolchain-mode-test-owned"
test_ownership_token="bgmss-toolchain-mode-test:$$:$test_root"
printf '%s\n' "$test_ownership_token" >"$test_ownership_marker"
cleanup_test_root() {
  local marker_value=''
  case "$test_root" in
    "$test_parent"/bgmss-toolchain-mode.*) ;;
    *)
      printf '%s\n' \
        "check-toolchain-mode-test: refusing unsafe cleanup root: $test_root" \
        >&2
      return 1
      ;;
  esac
  if [[ -L "$test_root" || ! -d "$test_root" ||
    -L "$test_ownership_marker" || ! -f "$test_ownership_marker" ]]; then
    printf '%s\n' \
      "check-toolchain-mode-test: refusing unowned cleanup root: $test_root" \
      >&2
    return 1
  fi
  marker_value="$(/bin/cat "$test_ownership_marker")"
  if [[ "$marker_value" != "$test_ownership_token" ]]; then
    printf '%s\n' \
      "check-toolchain-mode-test: refusing mismatched cleanup root: $test_root" \
      >&2
    return 1
  fi
  /usr/bin/find -P "$test_root" -depth -type d \
    -exec /bin/chmod u+rwx {} + 2>/dev/null || true
  /bin/rm -rf -- "$test_root"
  if path_present "$test_root"; then
    printf '%s\n' \
      "check-toolchain-mode-test: cleanup did not remove: $test_root" >&2
    return 1
  fi
}
trap cleanup_test_root EXIT
mkdir -p "$test_root/fixtures" "$test_root/results"
passed=0

run_ordinary_cleanup_test() {
  local backend="$test_root/ordinary/backend"
  mkdir -p "$backend/.cache/go-mod" "$backend/.tmp"
  printf '%s\n' 'ordinary' >"$backend/.cache/go-mod/state"
  # shellcheck source=check-toolchain-mode.sh
  source "$helper_path"
  unset BGMSS_ACCEPTANCE_GOROOT
  bgmss_select_check_toolchain_mode "$backend"
  assert_equal "$BGMSS_CHECK_TOOLCHAIN_MODE" 'ordinary' 'ordinary mode'
  bgmss_cleanup_check_state
  assert_absent "$backend/.cache"
  assert_absent "$backend/.tmp"
  passed=$((passed + 1))
}

run_acceptance_success_test() {
  create_fixture 'acceptance-success'
  snapshot_tree "$fixture_root" "$test_root/results/success.before"
  (
    set -euo pipefail
    unset GO_BOOTSTRAP
    unset BGMSS_FAKE_GOVERSION BGMSS_FAKE_GOROOT BGMSS_FAKE_GO_VERSION
    export BGMSS_ACCEPTANCE_GOROOT="$fixture_goroot"
    # shellcheck source=check-toolchain-mode.sh
    source "$helper_path"
    bgmss_select_check_toolchain_mode "$fixture_backend"
    assert_equal "$BGMSS_CHECK_TOOLCHAIN_MODE" 'acceptance' 'acceptance mode'
    assert_equal "$BGMSS_CHECK_GO_COMMAND" "$fixture_goroot/bin/go" 'admitted go'
    assert_equal "$BGMSS_CHECK_GOFMT_COMMAND" "$fixture_goroot/bin/gofmt" 'admitted gofmt'
    assert_equal "$GO_BOOTSTRAP" "$fixture_goroot/bin/go" 'exported bootstrap'
    assert_equal "$GOROOT" "$fixture_goroot" 'exported GOROOT'
    assert_equal "$GOMODCACHE" "$fixture_module_root" 'exported module cache'
    assert_equal "$GOENV" 'off' 'GOENV'
    assert_equal "$GOWORK" 'off' 'GOWORK'
    assert_equal "$GOTOOLCHAIN" 'local' 'GOTOOLCHAIN'
  )
  snapshot_tree "$fixture_root" "$test_root/results/success.after"
  /usr/bin/cmp -s \
    "$test_root/results/success.before" \
    "$test_root/results/success.after" ||
    fail 'acceptance admission changed its fixture'
  passed=$((passed + 1))
}

run_rejection_test() {
  local name="$1"
  local input_mode="$2"
  local mutation="$3"
  local bootstrap_mode="${4:-unset}"
  local input
  local status
  local fake_goversion=''
  local fake_goroot=''
  local fake_go_version=''

  create_fixture "$name"
  mutate_fixture "$mutation"
  case "$input_mode" in
    exact) input="$fixture_goroot" ;;
    empty) input='' ;;
    partial) input="$fixture_module_root/golang.org" ;;
    relative)
      input='.cache/go-mod/golang.org/toolchain@v0.0.1-go1.26.5.darwin-arm64'
      ;;
    dot)
      input="$fixture_backend/.cache/go-mod/./golang.org/toolchain@v0.0.1-go1.26.5.darwin-arm64"
      ;;
    trailing) input="$fixture_goroot/" ;;
    wrong-name) input="${fixture_goroot}-wrong" ;;
    outside) input="$fixture_root/outside-toolchain" ;;
    wrong-goversion)
      input="$fixture_goroot"
      fake_goversion='go1.26.4'
      ;;
    wrong-goroot)
      input="$fixture_goroot"
      fake_goroot="$fixture_root/wrong-goroot"
      ;;
    wrong-architecture)
      input="$fixture_goroot"
      fake_go_version='go version go1.26.5 linux/arm64'
      ;;
    wrong-go-version)
      input="$fixture_goroot"
      fake_go_version='go version go1.26.4 darwin/arm64'
      ;;
    *) fail "unknown input mode: $input_mode" ;;
  esac

  snapshot_tree "$fixture_root" "$test_root/results/$name.before"
  set +e
  (
    set -euo pipefail
    if [[ "$bootstrap_mode" == 'set-empty' ]]; then
      export GO_BOOTSTRAP=''
    elif [[ "$bootstrap_mode" == 'set-value' ]]; then
      export GO_BOOTSTRAP="$fixture_root/caller-go"
    else
      unset GO_BOOTSTRAP
    fi
    unset BGMSS_FAKE_GOVERSION BGMSS_FAKE_GOROOT BGMSS_FAKE_GO_VERSION
    export BGMSS_ACCEPTANCE_GOROOT="$input"
    if [[ -n "$fake_goversion" ]]; then
      export BGMSS_FAKE_GOVERSION="$fake_goversion"
    fi
    if [[ -n "$fake_goroot" ]]; then
      export BGMSS_FAKE_GOROOT="$fake_goroot"
    fi
    if [[ -n "$fake_go_version" ]]; then
      export BGMSS_FAKE_GO_VERSION="$fake_go_version"
    fi
    # shellcheck source=check-toolchain-mode.sh
    source "$helper_path"
    bgmss_select_check_toolchain_mode "$fixture_backend"
    printf '%s\n' 'product-check-ran' >"$fixture_root/product-check"
  ) >"$test_root/results/$name.log" 2>&1
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    fail "$name unexpectedly succeeded"
  fi
  assert_absent "$fixture_root/product-check"
  snapshot_tree "$fixture_root" "$test_root/results/$name.after"
  /usr/bin/cmp -s \
    "$test_root/results/$name.before" \
    "$test_root/results/$name.after" ||
    fail "$name changed its supplied fixture"
  passed=$((passed + 1))
}

run_lifecycle_test() {
  local mode="$1"
  local expected_status="$2"
  local status
  create_fixture "lifecycle-$mode"
  snapshot_tree "$fixture_module_root" "$test_root/results/lifecycle-$mode.closure.before"
  snapshot_tree "$fixture_outside" "$test_root/results/lifecycle-$mode.outside.before"
  set +e
  "$0" --lifecycle-runner \
    "$fixture_backend" \
    "$mode" \
    "$fixture_outside" \
    "$fixture_redirect_root" \
    >"$test_root/results/lifecycle-$mode.log" 2>&1
  status=$?
  set -e
  assert_equal "$status" "$expected_status" "$mode status"
  assert_absent "$fixture_cache_root/go-build"
  assert_absent "$fixture_cache_root/go-path"
  assert_absent "$fixture_cache_root/npm"
  assert_absent "$fixture_backend/.tmp"
  snapshot_tree "$fixture_module_root" "$test_root/results/lifecycle-$mode.closure.after"
  snapshot_tree "$fixture_outside" "$test_root/results/lifecycle-$mode.outside.after"
  /usr/bin/cmp -s \
    "$test_root/results/lifecycle-$mode.closure.before" \
    "$test_root/results/lifecycle-$mode.closure.after" ||
    fail "$mode changed the module/toolchain closure"
  /usr/bin/cmp -s \
    "$test_root/results/lifecycle-$mode.outside.before" \
    "$test_root/results/lifecycle-$mode.outside.after" ||
    fail "$mode changed the outside sentinel"
  passed=$((passed + 1))
}

run_ancestor_swap_test() {
  local mode="$1"
  local expected_status="$2"
  local preserved_cache
  local redirected_after
  local status

  create_fixture "ancestor-$mode"
  preserved_cache="$fixture_root/preserved-cache"
  mkdir -p "$fixture_redirect_root/go-build/nested"
  printf '%s\n' \
    'redirected-outside-must-remain' \
    >"$fixture_redirect_root/go-build/nested/sentinel"
  snapshot_tree \
    "$fixture_module_root" \
    "$test_root/results/ancestor-$mode.closure.before"
  snapshot_tree \
    "$fixture_redirect_root" \
    "$test_root/results/ancestor-$mode.redirect.before"
  set +e
  "$0" --lifecycle-runner \
    "$fixture_backend" \
    "$mode" \
    "$fixture_outside" \
    "$fixture_redirect_root" \
    >"$test_root/results/ancestor-$mode.log" 2>&1
  status=$?
  set -e

  assert_equal "$status" "$expected_status" "$mode status"
  /usr/bin/grep -Fq \
    'backend toolchain mode error: admitted .cache' \
    "$test_root/results/ancestor-$mode.log" ||
    fail "$mode did not report the cleanup parent failure"
  if [[ "$mode" == 'ancestor-directory' ]]; then
    if [[ -L "$fixture_cache_root" || ! -d "$fixture_cache_root" ]]; then
      fail "$mode did not preserve the replacement cache directory"
    fi
    redirected_after="$fixture_cache_root"
  else
    if [[ ! -L "$fixture_cache_root" ]]; then
      fail "$mode did not leave the redirected cache ancestor fail-closed"
    fi
    redirected_after="$fixture_redirect_root"
  fi
  if [[ ! -d "$fixture_backend/.tmp" ]]; then
    fail "$mode unexpectedly cleaned after the cache identity failure"
  fi
  snapshot_tree \
    "$preserved_cache/go-mod" \
    "$test_root/results/ancestor-$mode.closure.after"
  snapshot_tree \
    "$redirected_after" \
    "$test_root/results/ancestor-$mode.redirect.after"
  /usr/bin/cmp -s \
    "$test_root/results/ancestor-$mode.closure.before" \
    "$test_root/results/ancestor-$mode.closure.after" ||
    fail "$mode changed the preserved module/toolchain closure"
  /usr/bin/cmp -s \
    "$test_root/results/ancestor-$mode.redirect.before" \
    "$test_root/results/ancestor-$mode.redirect.after" ||
    fail "$mode changed the redirected outside target"
  passed=$((passed + 1))
}

run_generator_binding_test() {
  local generator
  local count=0
  for generator in "$script_root"/generate-*-wire.sh; do
    count=$((count + 1))
    /usr/bin/grep -Fq \
      'go_command="${GO_BOOTSTRAP:-$(command -v go || true)}"' \
      "$generator" || fail "${generator##*/} no longer selects GO_BOOTSTRAP"
    /usr/bin/grep -Fq 'export GOTOOLCHAIN=local' "$generator" ||
      fail "${generator##*/} lacks acceptance-local toolchain mode"
    /usr/bin/grep -Fq 'export GOTOOLCHAIN=go1.26.5+auto' "$generator" ||
      fail "${generator##*/} lacks ordinary automatic toolchain mode"
    /usr/bin/grep -Fq \
      'toolchain@v0.0.1-go1.26.5.darwin-arm64' \
      "$generator" || fail "${generator##*/} lacks the fixed acceptance path"
  done
  assert_equal "$count" '7' 'wire generator count'
  passed=$((passed + 1))
}

run_ordinary_cleanup_test
run_acceptance_success_test
run_rejection_test 'set-empty' empty none
run_rejection_test 'partial' partial none
run_rejection_test 'relative' relative none
run_rejection_test 'dot-segment' dot none
run_rejection_test 'trailing' trailing none
run_rejection_test 'wrong-name' wrong-name none
run_rejection_test 'outside' outside none
run_rejection_test 'symlink-cache' exact symlink-cache
run_rejection_test 'symlink-go-mod' exact symlink-go-mod
run_rejection_test 'symlink-golang' exact symlink-golang
run_rejection_test 'symlink-goroot' exact symlink-goroot
run_rejection_test 'symlink-bin' exact symlink-bin
run_rejection_test 'symlink-version' exact symlink-version
run_rejection_test 'symlink-go' exact symlink-go
run_rejection_test 'missing-marker' exact missing-marker
run_rejection_test 'missing-runtime' exact missing-runtime
run_rejection_test 'missing-go' exact missing-go
run_rejection_test 'missing-gofmt' exact missing-gofmt
run_rejection_test 'nonexecuting-go' exact nonexecuting-go
run_rejection_test 'nonexecuting-gofmt' exact nonexecuting-gofmt
run_rejection_test 'hardlinked-go' exact hardlinked-go
run_rejection_test 'hardlinked-gofmt' exact hardlinked-gofmt
run_rejection_test 'wrong-goversion' wrong-goversion none
run_rejection_test 'wrong-goroot' wrong-goroot none
run_rejection_test 'wrong-go-version' wrong-go-version none
run_rejection_test 'wrong-architecture' wrong-architecture none
run_rejection_test 'bootstrap-set-empty' exact none set-empty
run_rejection_test 'bootstrap-set-value' exact none set-value
run_rejection_test 'stale-go-build' exact stale-go-build
run_rejection_test 'stale-go-path' exact stale-go-path
run_rejection_test 'stale-npm' exact stale-npm
run_rejection_test 'stale-tmp' exact stale-tmp
run_rejection_test 'dangling-go-build' exact dangling-go-build
run_rejection_test 'dangling-go-path' exact dangling-go-path
run_rejection_test 'dangling-npm' exact dangling-npm
run_rejection_test 'dangling-tmp' exact dangling-tmp
run_rejection_test 'undeclared-cache' exact undeclared-cache
run_lifecycle_test failure 37
run_lifecycle_test leaf-types 37
run_lifecycle_test term 143
run_lifecycle_test int 130
run_ancestor_swap_test ancestor-cleanup 1
run_ancestor_swap_test ancestor-failure 37
run_ancestor_swap_test ancestor-term 143
run_ancestor_swap_test ancestor-int 130
run_ancestor_swap_test ancestor-directory 1
run_generator_binding_test

printf 'check-toolchain-mode tests passed (%s cases)\n' "$passed"
