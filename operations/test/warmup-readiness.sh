#!/usr/bin/env bash
# Exercise only wait_ready with local stubs: no network, service, or real sleep.
set -euo pipefail
repository_root=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
# shellcheck source=../lib/common.sh
source "$repository_root/operations/lib/common.sh"

test_root=$(mktemp -d "${TMPDIR:-/tmp}/bgmss-warmup-readiness.XXXXXX")
cleanup() {
  rm -f -- "$test_root/count" "$test_root/sleeps"
  rmdir -- "$test_root"
}
trap cleanup EXIT

fail() {
  printf 'warmup readiness test failure: %s\n' "$*" >&2
  exit 1
}

root="$test_root/root"
expected_version="dv1-$(printf 'a%.0s' {1..64})"
returned_version="$expected_version"
ready_on=0
passed=0

env_value() {
  [[ $# == 2 && $1 == "$root/state/current.env" && $2 == BGMSS_API_PORT ]] || return 90
  printf '18081\n'
}

curl() {
  local expected=(--fail --silent --show-error --max-time 2 'http://127.0.0.1:18081/readyz')
  [[ "$*" == "${expected[*]}" ]] || return 91
  local count
  read -r count <"$test_root/count"
  count=$((count + 1))
  printf '%s\n' "$count" >"$test_root/count"
  if (( ready_on > 0 && count >= ready_on )); then
    printf '{"data":{"status":"ready"},"meta":{"requestId":"qa-ready","dataVersion":"%s"}}\n' "$returned_version"
    return 0
  fi
  return 22
}

sleep() {
  [[ $# == 1 && $1 == 2 ]] || return 92
  local count
  read -r count <"$test_root/sleeps"
  printf '%s\n' "$((count + 1))" >"$test_root/sleeps"
}

reset_case() {
  printf '0\n' >"$test_root/count"
  printf '0\n' >"$test_root/sleeps"
  returned_version="$expected_version"
  unset BGMSS_READY_ATTEMPTS
}

assert_counts() {
  local calls sleeps
  read -r calls <"$test_root/count"
  read -r sleeps <"$test_root/sleeps"
  [[ $calls == "$1" && $sleeps == "$2" ]] ||
    fail "got calls=$calls sleeps=$sleeps; expected calls=$1 sleeps=$2"
  passed=$((passed + 1))
}

reset_case
ready_on=31
wait_ready "$root" "$expected_version" || fail 'default gave up before readiness at attempt 31'
assert_counts "$ready_on" "$((ready_on - 1))"

reset_case
ready_on=75
wait_ready "$root" "$expected_version" || fail 'default rejected readiness at its final attempt'
assert_counts "$ready_on" "$((ready_on - 1))"

reset_case
ready_on=0
if wait_ready "$root" "$expected_version"; then
  fail 'default accepted an API that never became ready'
fi
assert_counts 75 75

reset_case
ready_on=3
BGMSS_READY_ATTEMPTS=2
if wait_ready "$root" "$expected_version"; then
  fail 'explicit shorter attempt limit was ignored'
fi
assert_counts "$BGMSS_READY_ATTEMPTS" "$BGMSS_READY_ATTEMPTS"

reset_case
ready_on=1
returned_version="dv1-$(printf 'b%.0s' {1..64})"
BGMSS_READY_ATTEMPTS=3
if wait_ready "$root" "$expected_version"; then
  fail 'mismatched dataVersion was accepted'
fi
assert_counts "$BGMSS_READY_ATTEMPTS" "$BGMSS_READY_ATTEMPTS"

printf 'warmup readiness: %s cases passed (stubbed; no network or sleeps)\n' "$passed"
