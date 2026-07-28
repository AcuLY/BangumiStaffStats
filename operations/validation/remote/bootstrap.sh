#!/usr/bin/env bash

set -Eeuo pipefail

umask 077
unset BASH_ENV CDPATH ENV GLOBIGNORE IFS KSH_ENV NODE_OPTIONS NODE_PATH \
  PERL5OPT PS4 PYTHONHOME PYTHONINSPECT PYTHONPATH PYTHONSTARTUP RUBYOPT \
  ZDOTDIR
export LANG="C.UTF-8"
export LC_ALL="C.UTF-8"
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export TZ="UTC"

readonly target_root="/srv/bgmss-ops-validation"
readonly library_base64="__OWNERSHIP_LEDGER_LIBRARY_BASE64__"
readonly agent_base64="__TRANSFER_AGENT_BASE64__"

fail() {
  exit 1
}

[[ "$#" -eq 6 ]] || fail
readonly run_id="$1"
readonly input_digest="$2"
readonly library_digest="$3"
readonly agent_digest="$4"
readonly initial_deadline="$5"
readonly ownership_nonce="$6"
[[ "$run_id" =~ ^run-[0-9a-f]{32}$ ]] || fail
[[ "$input_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail
[[ "$library_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail
[[ "$agent_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail
[[ "$initial_deadline" =~ ^[1-9][0-9]{9}$ ]] || fail
[[ "$ownership_nonce" =~ ^sha256:[0-9a-f]{64}$ ]] || fail
readonly now="$(date +%s)"
(( initial_deadline > now && initial_deadline - now <= 25200 )) || fail
[[ "$(id -u)" == "0" && -d /srv && ! -L /srv ]] || fail
[[ ! -e "$target_root" && ! -L "$target_root" ]] || fail
[[ "$library_base64" != "__OWNERSHIP_LEDGER_LIBRARY_BASE64__" &&
   "$agent_base64" != "__TRANSFER_AGENT_BASE64__" ]] || fail

readonly nonce_hex="${ownership_nonce#sha256:}"
readonly staging="/srv/.bgmss-ops-validation-bootstrap-${run_id}-${nonce_hex}"
readonly bootstrap_lease="${staging}.lease.json"
readonly bootstrap_ready="${staging}.ready.json"
readonly bootstrap_success="${staging}.success.json"
readonly bootstrap_residue="${staging}.residue"
[[ ! -e "$staging" && ! -L "$staging" &&
   ! -e "$bootstrap_lease" && ! -L "$bootstrap_lease" &&
   ! -e "$bootstrap_ready" && ! -L "$bootstrap_ready" &&
   ! -e "$bootstrap_success" && ! -L "$bootstrap_success" &&
   ! -e "$bootstrap_residue" && ! -L "$bootstrap_residue" ]] || fail

root="$staging"
marker="${root}/.validation-owner.json"
ledger="${root}/.ownership-ledger.jsonl"
library="${root}/.ownership-ledger-lib"
agent="${root}/.transfer-agent"
watchdog_record="${root}/.transfer-watchdog.json"
bootstrap_complete="no"
root_published="no"
finalizer_started="no"
signal_name=""
current_head=""

sha_file() {
  printf 'sha256:%s\n' "$(sha256sum -- "$1" | awk '{print $1}')"
}

fsync_directory() {
  local candidate="$1"
  local descriptor state path_state
  [[ -d "$candidate" && ! -L "$candidate" ]] || return 1
  exec {descriptor}<"$candidate" || return
  state="$(stat -Lc '%d:%i:%F' "/proc/self/fd/${descriptor}")" || return
  path_state="$(stat -Lc '%d:%i:%F' "$candidate")" || return
  [[ "$state" == "$path_state" && "$state" == *":directory" ]] || return 1
  sync -f -- "/proc/self/fd/${descriptor}" || return
  exec {descriptor}>&-
}

fsync_parent() {
  local candidate="$1"
  fsync_directory "${candidate%/*}"
}

open_regular_fd() {
  local candidate="$1"
  local access="$2"
  local expected="$3"
  local output_name="$4"
  local descriptor descriptor_state path_state
  [[ "$output_name" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ &&
     -f "$candidate" && ! -L "$candidate" ]] || return 1
  if [[ "$access" == "read-write" ]]; then
    exec {descriptor}<>"$candidate" || return
  else
    [[ "$access" == "read" ]] || return 1
    exec {descriptor}<"$candidate" || return
  fi
  descriptor_state="$(
    stat -Lc '%d:%i:%u:%g:%h:%a:%F' "/proc/self/fd/${descriptor}"
  )" || return
  path_state="$(stat -Lc '%d:%i:%u:%g:%h:%a:%F' "$candidate")" || return
  [[ -f "$candidate" && ! -L "$candidate" &&
     "$descriptor_state" == "$path_state" &&
     "$(stat -Lc '%u:%g:%h:%a' "/proc/self/fd/${descriptor}")" == \
       "$expected" &&
     "$descriptor_state" == *":regular file" ]] || return 1
  printf -v "$output_name" '%s' "$descriptor"
}

process_live() {
  local pid="$1"
  local start="$2"
  local session="$3"
  [[ -r "/proc/${pid}/stat" &&
     "$(awk '{print $22}' "/proc/${pid}/stat")" == "$start" &&
     "$(ps -o sid= -p "$pid" | tr -d '[:space:]')" == "$session" ]]
}

bootstrap_finalizer() {
  set -Eeuo pipefail
  umask 077
  unset BASH_ENV CDPATH ENV GLOBIGNORE IFS KSH_ENV NODE_OPTIONS NODE_PATH \
    PERL5OPT PS4 PYTHONHOME PYTHONINSPECT PYTHONPATH PYTHONSTARTUP RUBYOPT \
    ZDOTDIR
  export LANG="C.UTF-8"
  export LC_ALL="C.UTF-8"
  export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  export TZ="UTC"
  local parent_pid="$1"
  local parent_start="$2"
  local parent_session="$3"
  local root_fd="$4"
  local agent_fd="$5"
  local ledger_fd="$6"
  local run="$7"
  local input="$8"
  local nonce="$9"
  local expected_marker="${10}"
  local staging_path="${11}"
  local target_path="${12}"
  local lease_path="${13}"
  local ready_path="${14}"
  local success_path="${15}"
  local residue_path="${16}"
  local self_start self_session ready parent_alive="yes"
  self_start="$(awk '{print $22}' "/proc/$$/stat")"
  self_session="$(ps -o sid= -p "$$" | tr -d '[:space:]')"
  [[ "$self_session" == "$$" ]]
  ready="$(
    jq -cnS \
      --arg leaseDigest "sha256:$(sha256sum "$lease_path" | awk '{print $1}')" \
      --arg pid "$$" \
      --arg session "$self_session" \
      --arg start "$self_start" \
      '{
        leaseDigest:$leaseDigest,
        pid:$pid,
        schemaVersion:"operations-validation-bootstrap-finalizer-ready-v1",
        session:$session,
        start:$start
      }'
  )"
  (
    set -o noclobber
    printf '%s\n' "$ready" > "$ready_path"
  )
  chmod 0400 "$ready_path"
  chown 0:0 "$ready_path"
  sync -f "$ready_path"
  sync -f /srv
  while process_live "$parent_pid" "$parent_start" "$parent_session"; do
    if [[ -f "$success_path" && ! -L "$success_path" &&
          "$(stat -c '%u:%g:%h:%a' "$success_path")" == "0:0:1:400" ]] &&
      jq -e \
        --arg inputDigest "$input" \
        --arg ownershipNonce "$nonce" \
        --arg runId "$run" '
          type == "object" and
          (keys == [
            "inputDigest","ownershipNonce","runId","schemaVersion"
          ]) and
          .schemaVersion ==
            "operations-validation-bootstrap-finalizer-success-v1" and
          .inputDigest == $inputDigest and
          .ownershipNonce == $ownershipNonce and
          .runId == $runId
        ' "$success_path" >/dev/null; then
      parent_alive="complete"
      break
    fi
    sleep 1
  done
  if [[ "$parent_alive" == "complete" ]]; then
    local candidate descriptor token quarantine
    for candidate in "$success_path" "$ready_path" "$lease_path"; do
      [[ -f "$candidate" && ! -L "$candidate" ]] || exit 1
      exec {descriptor}<"$candidate"
      [[ "$(stat -Lc '%d:%i' "/proc/self/fd/${descriptor}")" == \
           "$(stat -Lc '%d:%i' "$candidate")" ]] || exit 1
      token="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
      quarantine="${candidate}.quarantine-${token}"
      mv -T --no-clobber -- "$candidate" "$quarantine"
      sync -f /srv
      [[ "$(stat -Lc '%d:%i' "/proc/self/fd/${descriptor}")" == \
           "$(stat -Lc '%d:%i' "$quarantine")" ]] || exit 1
      rm -- "$quarantine"
      sync -f /srv
      exec {descriptor}>&-
    done
    exit 0
  fi

  local root_state candidate_state marker_path agent_path ledger_path
  root_state="$(stat -Lc '%d:%i' "/proc/self/fd/${root_fd}")"
  if [[ -d "$target_path" && ! -L "$target_path" &&
        "$(stat -Lc '%d:%i' "$target_path")" == "$root_state" ]]; then
    marker_path="${target_path}/.validation-owner.json"
    agent_path="${target_path}/.transfer-agent"
    ledger_path="${target_path}/.ownership-ledger.jsonl"
    if [[ -f "$marker_path" && ! -L "$marker_path" &&
          "$(sha256sum "$marker_path" | awk '{print "sha256:" $1}')" == \
            "$expected_marker" ]] &&
      jq -e \
        --arg inputDigest "$input" \
        --arg ownershipNonce "$nonce" \
        --arg runId "$run" '
          .inputDigest == $inputDigest and
          .ownershipNonce == $ownershipNonce and
          .runId == $runId
        ' "$marker_path" >/dev/null &&
      [[ -f "$agent_path" && ! -L "$agent_path" &&
         "$(stat -Lc '%d:%i' "/proc/self/fd/${agent_fd}")" == \
           "$(stat -Lc '%d:%i' "$agent_path")" &&
         -f "$ledger_path" && ! -L "$ledger_path" &&
         "$(stat -Lc '%d:%i' "/proc/self/fd/${ledger_fd}")" == \
           "$(stat -Lc '%d:%i' "$ledger_path")" ]]; then
      local observed_head
      observed_head="$(
        jq -rse '.[-1].payloadDigest' "/proc/self/fd/${ledger_fd}"
      )" || true
      if [[ "$observed_head" =~ ^sha256:[0-9a-f]{64}$ ]]; then
        /usr/bin/bash "/proc/self/fd/${agent_fd}" cleanup \
          "$run" "$input" "$expected_marker" "$observed_head" \
          "$observed_head" </dev/null >/dev/null 2>&1 || true
      fi
    fi
  fi
  if [[ -d "$target_path" && ! -L "$target_path" &&
        "$(stat -Lc '%d:%i' "$target_path")" == "$root_state" &&
        ! -e "$residue_path" && ! -L "$residue_path" ]]; then
    mv -T --no-clobber -- "$target_path" "$residue_path" || exit 1
    sync -f /srv
    [[ "$(stat -Lc '%d:%i' "/proc/self/fd/${root_fd}")" == \
         "$(stat -Lc '%d:%i' "$residue_path")" ]] || exit 1
  elif [[ -d "$staging_path" && ! -L "$staging_path" &&
          "$(stat -Lc '%d:%i' "$staging_path")" == "$root_state" &&
          ! -e "$residue_path" && ! -L "$residue_path" ]]; then
    mv -T --no-clobber -- "$staging_path" "$residue_path" || exit 1
    sync -f /srv
    [[ "$(stat -Lc '%d:%i' "/proc/self/fd/${root_fd}")" == \
         "$(stat -Lc '%d:%i' "$residue_path")" ]] || exit 1
  fi
}

cleanup_partial() {
  set +e
  if [[ "$root_published" == "yes" && -n "$current_head" &&
        -f "$marker" && ! -L "$marker" ]]; then
    /usr/bin/bash "/proc/self/fd/${agent_fd}" cleanup \
      "$run_id" "$input_digest" "$(sha_file "$marker")" "$current_head" \
      "$current_head" </dev/null >/dev/null 2>&1
  fi
  # Before publication the random staging directory cannot block another run.
  # Its authenticated detached finalizer atomically moves it to residue.
}

on_signal() {
  [[ -n "$signal_name" ]] || signal_name="$1"
}

abort_if_signaled() {
  [[ -z "$signal_name" ]] && return 0
  cleanup_partial
  trap - ERR EXIT HUP INT TERM
  exit 1
}

on_exit() {
  [[ "$bootstrap_complete" == "yes" && -z "$signal_name" ]] ||
    cleanup_partial
}

trap cleanup_partial ERR
trap on_exit EXIT
trap 'on_signal HUP' HUP
trap 'on_signal INT' INT
trap 'on_signal TERM' TERM

mkdir -m 0700 -- "$staging"
fsync_directory /srv
mkdir -m 0700 -- "${root}/incoming"
fsync_parent "${root}/incoming"
mkdir -m 0700 -- "${root}/incoming/files"
fsync_parent "${root}/incoming/files"

(
  set -o noclobber
  : > "$ledger"
)
chmod 0600 "$ledger"
chown 0:0 "$ledger"
sync -f "$ledger"
fsync_parent "$ledger"

(
  set -o noclobber
  : > "$library"
)
printf '%s' "$library_base64" | base64 -d > "$library"
chmod 0500 "$library"
chown 0:0 "$library"
sync -f "$library"
fsync_parent "$library"
[[ "$(sha_file "$library")" == "$library_digest" ]] || fail

(
  set -o noclobber
  : > "$agent"
)
printf '%s' "$agent_base64" | base64 -d > "$agent"
chmod 0500 "$agent"
chown 0:0 "$agent"
sync -f "$agent"
fsync_parent "$agent"
[[ "$(sha_file "$agent")" == "$agent_digest" ]] || fail

readonly root_device="$(stat -c '%d' -- "$root")"
readonly root_inode="$(stat -c '%i' -- "$root")"
readonly ledger_device="$(stat -c '%d' -- "$ledger")"
readonly ledger_inode="$(stat -c '%i' -- "$ledger")"
(
  set -o noclobber
  jq -cnS \
    --arg agentDigest "$agent_digest" \
    --arg inputDigest "$input_digest" \
    --arg ledgerDevice "$ledger_device" \
    --arg ledgerInode "$ledger_inode" \
    --arg libraryDigest "$library_digest" \
    --arg ownershipNonce "$ownership_nonce" \
    --arg rootDevice "$root_device" \
    --arg rootInode "$root_inode" \
    --arg runId "$run_id" \
    '{
      agentDigest:$agentDigest,
      inputDigest:$inputDigest,
      ledgerDevice:$ledgerDevice,
      ledgerInode:$ledgerInode,
      libraryDigest:$libraryDigest,
      ownershipNonce:$ownershipNonce,
      rootDevice:$rootDevice,
      rootInode:$rootInode,
      runId:$runId,
      schemaVersion:"operations-validation-owner-v2"
    }' > "$marker"
)
chmod 0400 "$marker"
chown 0:0 "$marker"
sync -f "$marker"
fsync_parent "$marker"
readonly marker_digest="$(sha_file "$marker")"

library_fd=""
agent_fd=""
ledger_bootstrap_fd=""
open_regular_fd "$library" read "0:0:1:500" library_fd || fail
open_regular_fd "$agent" read "0:0:1:500" agent_fd || fail
open_regular_fd "$ledger" read-write "0:0:1:600" ledger_bootstrap_fd || fail
exec {root_fd}<"$root" || fail
[[ "$(stat -Lc '%d:%i' "/proc/self/fd/${root_fd}")" == \
     "${root_device}:${root_inode}" ]] || fail

lease="$(
  jq -cnS \
    --arg inputDigest "$input_digest" \
    --arg ownershipNonce "$ownership_nonce" \
    --arg rootDevice "$root_device" \
    --arg rootInode "$root_inode" \
    --arg runId "$run_id" \
    --arg staging "$staging" \
    --arg target "$target_root" \
    '{
      inputDigest:$inputDigest,
      ownershipNonce:$ownershipNonce,
      rootDevice:$rootDevice,
      rootInode:$rootInode,
      runId:$runId,
      schemaVersion:"operations-validation-bootstrap-lease-v1",
      staging:$staging,
      target:$target
    }'
)" || fail
(
  set -o noclobber
  printf '%s\n' "$lease" > "$bootstrap_lease"
)
chmod 0400 "$bootstrap_lease"
chown 0:0 "$bootstrap_lease"
sync -f "$bootstrap_lease"
fsync_directory /srv

parent_start="$(awk '{print $22}' "/proc/$$/stat")" || fail
parent_session="$(ps -o sid= -p "$$" | tr -d '[:space:]')" || fail
finalizer_source="$(declare -f process_live bootstrap_finalizer)"
setsid --fork /usr/bin/bash -c \
  "${finalizer_source}"$'\n''bootstrap_finalizer "$@"' -- \
  "$$" "$parent_start" "$parent_session" "$root_fd" "$agent_fd" \
  "$ledger_bootstrap_fd" \
  "$run_id" "$input_digest" "$ownership_nonce" "$marker_digest" \
  "$staging" "$target_root" "$bootstrap_lease" "$bootstrap_ready" \
  "$bootstrap_success" "$bootstrap_residue" \
  </dev/null >/dev/null 2>&1 &
finalizer_launcher="$!"
wait "$finalizer_launcher" || fail
finalizer_started="yes"
ready_started="$(date +%s)"
while [[ ! -f "$bootstrap_ready" || -L "$bootstrap_ready" ]]; do
  (( $(date +%s) - ready_started < 30 )) || fail
  sleep 0.1
done
jq -e \
  --arg leaseDigest "$(sha_file "$bootstrap_lease")" '
    .schemaVersion ==
      "operations-validation-bootstrap-finalizer-ready-v1" and
    .leaseDigest == $leaseDigest and
    .pid == .session and
    (.pid | type == "string" and test("^[1-9][0-9]*$")) and
    (.start | type == "string" and test("^[1-9][0-9]*$"))
  ' "$bootstrap_ready" >/dev/null || fail
finalizer_pid="$(jq -er '.pid' "$bootstrap_ready")"
finalizer_start="$(jq -er '.start' "$bootstrap_ready")"
finalizer_session="$(jq -er '.session' "$bootstrap_ready")"
process_live "$finalizer_pid" "$finalizer_start" "$finalizer_session" || fail

mv -T --no-clobber -- "$staging" "$target_root"
fsync_directory /srv
[[ "$(stat -Lc '%d:%i' "/proc/self/fd/${root_fd}")" == \
     "$(stat -Lc '%d:%i' "$target_root")" ]] || fail
root="$target_root"
marker="${root}/.validation-owner.json"
ledger="${root}/.ownership-ledger.jsonl"
library="${root}/.ownership-ledger-lib"
agent="${root}/.transfer-agent"
watchdog_record="${root}/.transfer-watchdog.json"
root_published="yes"

# shellcheck source=/dev/null
source "/proc/self/fd/${library_fd}"
readonly ledger_run_id="$run_id"
readonly ledger_input_digest="$input_digest"
ledger_adopt_authority \
  "$ledger_bootstrap_fd" "$ledger_device" "$ledger_inode" || fail

append_closed() {
  local candidate="$1"
  local identity details
  identity="$(ledger_identity_json "$candidate")" || return
  details="$(ledger_closed_details "$identity")" || return
  current_head="$(
    ledger_append bootstrap-closed bootstrap "$details" "$current_head"
  )" || return
}

for candidate in \
  "$root" \
  "$library" \
  "$agent" \
  "$marker" \
  "${root}/incoming" \
  "${root}/incoming/files"; do
  append_closed "$candidate"
done
deadline_details="$(
  jq -cnS --arg deadline "$initial_deadline" '{deadline:$deadline}'
)"
current_head="$(
  ledger_append phase-open transfer "$deadline_details" "$current_head"
)"
ledger_fsync_directory "$root"
abort_if_signaled

setsid --fork /usr/bin/bash "/proc/self/fd/${agent_fd}" watchdog \
  "$run_id" "$input_digest" "$marker_digest" "$current_head" \
  </dev/null >/dev/null 2>&1 &
watchdog_launcher="$!"
wait "$watchdog_launcher" || fail
watchdog_started="$(date +%s)"
while true; do
  (( $(date +%s) - watchdog_started < 30 )) || fail
  ledger_verify_chain || fail
  current_head="$ledger_head"
  watchdog_tail="$(tail -n 1 "$ledger_fd_path")" || fail
  watchdog_event="$(jq -er '.payload.event' <<< "$watchdog_tail")" || fail
  case "$watchdog_event" in
    phase-open)
      ;;
    object-creating)
      [[ "$(jq -er '.payload.details.expected.path' \
          <<< "$watchdog_tail")" == ".transfer-watchdog.json" ]] || fail
      ;;
    object-created)
      [[ "$(jq -er '.payload.details.baseline.path' \
          <<< "$watchdog_tail")" == ".transfer-watchdog.json" ]] || fail
      ;;
    watchdog-closed)
      [[ -f "$watchdog_record" && ! -L "$watchdog_record" &&
         "$(stat -c '%u:%g:%h:%a' "$watchdog_record")" == "0:0:1:400" ]] ||
        fail
      jq -cS . "$watchdog_record" |
        cmp --silent "$watchdog_record" - || fail
      watchdog_identity="$(ledger_identity_json "$watchdog_record")" || fail
      jq -e \
        --argjson identity "$watchdog_identity" \
        --arg head "$current_head" '
          .payloadDigest == $head and
          .payload.phase == "transfer" and
          .payload.details == {identity:$identity}
        ' <<< "$watchdog_tail" >/dev/null || fail
      watchdog_pid="$(jq -er '.watchdogPid' "$watchdog_record")" || fail
      watchdog_start="$(jq -er '.watchdogStart' "$watchdog_record")" || fail
      watchdog_session="$(jq -er '.watchdogSession' "$watchdog_record")" ||
        fail
      process_live "$watchdog_pid" "$watchdog_start" "$watchdog_session" ||
        fail
      break
      ;;
    *)
      fail
      ;;
  esac
  sleep 0.1
done
abort_if_signaled

response="$(
  jq -cnS \
    --arg ledgerDevice "$ledger_device" \
    --arg ledgerHead "$current_head" \
    --arg ledgerInode "$ledger_inode" \
    --arg markerDigest "$marker_digest" \
    --arg rootDevice "$root_device" \
    --arg rootInode "$root_inode" \
    --arg runId "$run_id" \
    '{
      ledgerDevice:$ledgerDevice,
      ledgerHead:$ledgerHead,
      ledgerInode:$ledgerInode,
      markerDigest:$markerDigest,
      rootDevice:$rootDevice,
      rootInode:$rootInode,
      runId:$runId
    }'
)" || fail
printf '%s\n' "$response"

success="$(
  jq -cnS \
    --arg inputDigest "$input_digest" \
    --arg ownershipNonce "$ownership_nonce" \
    --arg runId "$run_id" \
    '{
      inputDigest:$inputDigest,
      ownershipNonce:$ownershipNonce,
      runId:$runId,
      schemaVersion:"operations-validation-bootstrap-finalizer-success-v1"
    }'
)"
(
  set -o noclobber
  printf '%s\n' "$success" > "$bootstrap_success"
)
chmod 0400 "$bootstrap_success"
chown 0:0 "$bootstrap_success"
sync -f "$bootstrap_success"
fsync_directory /srv
abort_if_signaled
bootstrap_complete="yes"
trap - ERR
