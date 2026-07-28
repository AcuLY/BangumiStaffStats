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

readonly root="/srv/bgmss-ops-validation"
readonly marker="${root}/.validation-owner.json"
readonly ledger="${root}/.ownership-ledger.jsonl"
readonly library="${root}/.ownership-ledger-lib"
readonly agent="${root}/.transfer-agent"

fail() {
  exit 1
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

process_identity_live() {
  local pid="$1"
  local start="$2"
  local session="$3"
  [[ "$pid" =~ ^[1-9][0-9]*$ &&
     "$start" =~ ^[1-9][0-9]*$ &&
     "$session" =~ ^[1-9][0-9]*$ &&
     -r "/proc/${pid}/stat" &&
     "$(awk '{print $22}' "/proc/${pid}/stat")" == "$start" &&
     "$(ps -o sid= -p "$pid" | tr -d '[:space:]')" == "$session" ]]
}

remove_external_regular() {
  local candidate="$1"
  local expected_digest="$2"
  local descriptor="" token quarantine
  open_regular_fd "$candidate" read "0:0:1:400" descriptor || return
  [[ "sha256:$(sha256sum "/proc/self/fd/${descriptor}" | awk '{print $1}')" == \
       "$expected_digest" ]] || return 1
  token="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')" || return
  quarantine="${candidate}.quarantine-${token}"
  [[ ! -e "$quarantine" && ! -L "$quarantine" ]] || return 1
  mv -T --no-clobber -- "$candidate" "$quarantine" || return
  fsync_directory /srv || return
  [[ "$(stat -Lc '%d:%i' "/proc/self/fd/${descriptor}")" == \
       "$(stat -Lc '%d:%i' "$quarantine")" ]] || return 1
  rm -- "$quarantine" || return
  fsync_directory /srv || return
  exec {descriptor}>&-
}

[[ "$#" -eq 6 ]] || fail
readonly run_id="$1"
readonly input_digest="$2"
readonly entry_digest="$3"
readonly ownership_nonce="$4"
readonly marker_selector="$5"
readonly head_selector="$6"
[[ "$run_id" =~ ^run-[0-9a-f]{32}$ ]] || fail
[[ "$input_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail
[[ "$entry_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail
[[ "$ownership_nonce" =~ ^sha256:[0-9a-f]{64}$ ]] || fail
[[ "$marker_selector" == "discover" ||
   "$marker_selector" =~ ^sha256:[0-9a-f]{64}$ ]] || fail
[[ "$head_selector" == "discover" ||
   "$head_selector" =~ ^sha256:[0-9a-f]{64}$ ]] || fail

readonly nonce_hex="${ownership_nonce#sha256:}"
readonly bootstrap_staging="/srv/.bgmss-ops-validation-bootstrap-${run_id}-${nonce_hex}"
readonly bootstrap_lease="${bootstrap_staging}.lease.json"
readonly bootstrap_ready="${bootstrap_staging}.ready.json"
readonly bootstrap_success="${bootstrap_staging}.success.json"
readonly bootstrap_residue="${bootstrap_staging}.residue"
readonly finalizer_lease="/srv/.bgmss-ops-validation-final-${run_id}-${nonce_hex}.json"
readonly finalizer_ready="/srv/.bgmss-ops-validation-final-${run_id}-${nonce_hex}.ready"
readonly finalizer_tombstone="/srv/.bgmss-ops-validation-final-${run_id}-${nonce_hex}"

recover_finalizer_tombstone() {
  [[ -f "$finalizer_lease" && ! -L "$finalizer_lease" &&
     "$(stat -c '%u:%g:%h:%a' "$finalizer_lease")" == "0:0:1:400" ]] ||
    return 1
  local lease_fd="" lease_digest
  open_regular_fd "$finalizer_lease" read "0:0:1:400" lease_fd || return
  lease_digest="sha256:$(
    sha256sum "/proc/self/fd/${lease_fd}" | awk '{print $1}'
  )"
  jq -cS . "/proc/self/fd/${lease_fd}" |
    cmp --silent "/proc/self/fd/${lease_fd}" - || return
  jq -e \
    --arg inputDigest "$input_digest" \
    --arg ownershipNonce "$ownership_nonce" \
    --arg runId "$run_id" \
    --arg tombstone "$finalizer_tombstone" '
      type == "object" and
      (keys == [
        "coreIdentities","inputDigest","ledgerDevice","ledgerInode",
        "ownershipNonce","rootIdentity","runId","schemaVersion","tombstone"
      ]) and
      .schemaVersion == "operations-validation-finalizer-v1" and
      .inputDigest == $inputDigest and
      .ownershipNonce == $ownershipNonce and
      .runId == $runId and
      .tombstone == $tombstone and
      (.ledgerDevice | type == "string" and test("^[0-9]+$")) and
      (.ledgerInode | type == "string" and test("^[0-9]+$"))
    ' "/proc/self/fd/${lease_fd}" >/dev/null || return
  if [[ -d "$finalizer_tombstone" && ! -L "$finalizer_tombstone" ]]; then
    local root_fd root_state expected_state
    exec {root_fd}<"$finalizer_tombstone" || return
    root_state="$(stat -Lc '%d:%i' "/proc/self/fd/${root_fd}")" || return
    expected_state="$(
      jq -er '.rootIdentity.device + ":" + .rootIdentity.inode' \
        "/proc/self/fd/${lease_fd}"
    )" || return
    [[ "$root_state" == "$expected_state" ]] || return 1
    mapfile -t residue_entries < <(
      find "$finalizer_tombstone" -mindepth 1 -maxdepth 1 -printf '%f\n'
    )
    (( ${#residue_entries[@]} <= 4 )) || return 1
    local name candidate_fd expected_identity expected_device expected_inode
    local expected_spec expected_digest token quarantine match_count
    for name in "${residue_entries[@]}"; do
      case "$name" in
        .ownership-ledger.jsonl)
          expected_device="$(jq -er '.ledgerDevice' \
            "/proc/self/fd/${lease_fd}")" || return
          expected_inode="$(jq -er '.ledgerInode' \
            "/proc/self/fd/${lease_fd}")" || return
          expected_spec="0:0:1:600"
          expected_digest=""
          ;;
        .ownership-ledger-lib|.transfer-agent|.validation-owner.json)
          expected_identity="$(
            jq -ce --arg path "$name" '
              [
                .coreIdentities[] |
                select(.path == $path)
              ] |
              if length == 1 then .[0]
              else error("core identity missing") end
            ' "/proc/self/fd/${lease_fd}"
          )" || return
          expected_device="$(jq -er '.device' <<< "$expected_identity")"
          expected_inode="$(jq -er '.inode' <<< "$expected_identity")"
          expected_spec="$(
            jq -er '.uid + ":" + .gid + ":" + .links + ":" + .mode' \
              <<< "$expected_identity"
          )"
          expected_digest="$(jq -er '.digest' <<< "$expected_identity")"
          ;;
        .validation-quarantine-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]*)
          [[ "$name" =~ ^\.validation-quarantine-[0-9a-f]{32}$ ]] || return 1
          expected_device="$(stat -Lc '%d' \
            "${finalizer_tombstone}/${name}")" || return
          expected_inode="$(stat -Lc '%i' \
            "${finalizer_tombstone}/${name}")" || return
          match_count="$(
            jq -r \
              --arg device "$expected_device" \
              --arg inode "$expected_inode" '
                [
                  .coreIdentities[] |
                  select(.device == $device and .inode == $inode)
                ] | length
              ' "/proc/self/fd/${lease_fd}"
          )" || return
          if [[ "$expected_device" == \
                  "$(jq -er '.ledgerDevice' "/proc/self/fd/${lease_fd}")" &&
                "$expected_inode" == \
                  "$(jq -er '.ledgerInode' "/proc/self/fd/${lease_fd}")" ]]; then
            match_count="$((match_count + 1))"
            expected_spec="0:0:1:600"
            expected_digest=""
          elif [[ "$match_count" == "1" ]]; then
            expected_identity="$(
              jq -ce \
                --arg device "$expected_device" \
                --arg inode "$expected_inode" '
                  .coreIdentities[] |
                  select(.device == $device and .inode == $inode)
                ' "/proc/self/fd/${lease_fd}"
            )" || return
            expected_spec="$(
              jq -er '.uid + ":" + .gid + ":" + .links + ":" + .mode' \
                <<< "$expected_identity"
            )"
            expected_digest="$(jq -er '.digest' <<< "$expected_identity")"
          fi
          [[ "$match_count" == "1" ]] || return 1
          ;;
        *)
          return 1
          ;;
      esac
      candidate_fd=""
      open_regular_fd \
        "${finalizer_tombstone}/${name}" read-write "$expected_spec" \
        candidate_fd || return
      [[ "$(stat -Lc '%d' "/proc/self/fd/${candidate_fd}")" == \
           "$expected_device" &&
         "$(stat -Lc '%i' "/proc/self/fd/${candidate_fd}")" == \
           "$expected_inode" ]] || return 1
      [[ -z "$expected_digest" ||
         "sha256:$(sha256sum "/proc/self/fd/${candidate_fd}" | awk '{print $1}')" == \
           "$expected_digest" ]] || return 1
      token="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')" || return
      quarantine="${finalizer_tombstone}/.validation-quarantine-${token}"
      [[ ! -e "$quarantine" && ! -L "$quarantine" ]] || return 1
      mv -T --no-clobber -- \
        "${finalizer_tombstone}/${name}" "$quarantine" || return
      fsync_directory "$finalizer_tombstone" || return
      [[ "$(stat -Lc '%d:%i' "/proc/self/fd/${candidate_fd}")" == \
           "$(stat -Lc '%d:%i' "$quarantine")" ]] || return 1
      rm -- "$quarantine" || return
      fsync_directory "$finalizer_tombstone" || return
      exec {candidate_fd}>&-
    done
    rmdir -- "$finalizer_tombstone" || return
    fsync_directory /srv || return
    exec {root_fd}>&-
  fi
  if [[ -f "$finalizer_ready" && ! -L "$finalizer_ready" ]]; then
    jq -e \
      --arg leaseDigest "$lease_digest" '
        type == "object" and
        (keys == ["leaseDigest","pid","schemaVersion","session","start"]) and
        .schemaVersion == "operations-validation-finalizer-ready-v1" and
        .leaseDigest == $leaseDigest
      ' "$finalizer_ready" >/dev/null || return
    remove_external_regular \
      "$finalizer_ready" \
      "sha256:$(sha256sum "$finalizer_ready" | awk '{print $1}')" || return
  fi
  remove_external_regular "$finalizer_lease" "$lease_digest" || return
  exec {lease_fd}>&-
}

restore_bootstrap_residue() {
  [[ -f "$bootstrap_lease" && ! -L "$bootstrap_lease" &&
     "$(stat -c '%u:%g:%h:%a' "$bootstrap_lease")" == "0:0:1:400" ]] ||
    return 1
  local lease_fd=""
  open_regular_fd "$bootstrap_lease" read "0:0:1:400" lease_fd || return
  jq -cS . "/proc/self/fd/${lease_fd}" |
    cmp --silent "/proc/self/fd/${lease_fd}" - || return
  jq -e \
    --arg inputDigest "$input_digest" \
    --arg ownershipNonce "$ownership_nonce" \
    --arg runId "$run_id" \
    --arg staging "$bootstrap_staging" \
    --arg target "$root" '
      type == "object" and
      (keys == [
        "inputDigest","ownershipNonce","rootDevice","rootInode","runId",
        "schemaVersion","staging","target"
      ]) and
      .schemaVersion == "operations-validation-bootstrap-lease-v1" and
      .inputDigest == $inputDigest and
      .ownershipNonce == $ownershipNonce and
      .runId == $runId and
      .staging == $staging and
      .target == $target
    ' "/proc/self/fd/${lease_fd}" >/dev/null || return
  local candidate=""
  if [[ -d "$bootstrap_residue" && ! -L "$bootstrap_residue" ]]; then
    candidate="$bootstrap_residue"
  elif [[ -d "$bootstrap_staging" && ! -L "$bootstrap_staging" ]]; then
    candidate="$bootstrap_staging"
  else
    return 1
  fi
  [[ ! -e "$root" && ! -L "$root" ]] || return 1
  local candidate_fd
  exec {candidate_fd}<"$candidate" || return
  [[ "$(stat -Lc '%d' "/proc/self/fd/${candidate_fd}")" == \
       "$(jq -er '.rootDevice' "/proc/self/fd/${lease_fd}")" &&
     "$(stat -Lc '%i' "/proc/self/fd/${candidate_fd}")" == \
       "$(jq -er '.rootInode' "/proc/self/fd/${lease_fd}")" ]] || return 1
  mv -T --no-clobber -- "$candidate" "$root" || return
  fsync_directory /srv || return
  [[ "$(stat -Lc '%d:%i' "/proc/self/fd/${candidate_fd}")" == \
       "$(stat -Lc '%d:%i' "$root")" ]] || return 1
  exec {candidate_fd}>&-
  exec {lease_fd}>&-
}

cleanup_bootstrap_metadata() {
  local lease_fd="" lease_digest
  open_regular_fd "$bootstrap_lease" read "0:0:1:400" lease_fd || return
  jq -e \
    --arg inputDigest "$input_digest" \
    --arg ownershipNonce "$ownership_nonce" \
    --arg runId "$run_id" '
      .schemaVersion == "operations-validation-bootstrap-lease-v1" and
      .inputDigest == $inputDigest and
      .ownershipNonce == $ownershipNonce and
      .runId == $runId
    ' "/proc/self/fd/${lease_fd}" >/dev/null || return
  lease_digest="sha256:$(
    sha256sum "/proc/self/fd/${lease_fd}" | awk '{print $1}'
  )"
  if [[ -f "$bootstrap_success" && ! -L "$bootstrap_success" ]]; then
    jq -e \
      --arg inputDigest "$input_digest" \
      --arg ownershipNonce "$ownership_nonce" \
      --arg runId "$run_id" '
        .schemaVersion ==
          "operations-validation-bootstrap-finalizer-success-v1" and
        .inputDigest == $inputDigest and
        .ownershipNonce == $ownershipNonce and
        .runId == $runId
      ' "$bootstrap_success" >/dev/null || return
    remove_external_regular \
      "$bootstrap_success" \
      "sha256:$(sha256sum "$bootstrap_success" | awk '{print $1}')" || return
  fi
  if [[ -f "$bootstrap_ready" && ! -L "$bootstrap_ready" ]]; then
    jq -e \
      --arg leaseDigest "$lease_digest" '
        .schemaVersion ==
          "operations-validation-bootstrap-finalizer-ready-v1" and
        .leaseDigest == $leaseDigest
      ' "$bootstrap_ready" >/dev/null || return
    remove_external_regular \
      "$bootstrap_ready" \
      "sha256:$(sha256sum "$bootstrap_ready" | awk '{print $1}')" || return
  fi
  remove_external_regular "$bootstrap_lease" "$lease_digest" || return
  exec {lease_fd}>&-
}

external_finalizer_live() {
  local ready="$1"
  local lease="$2"
  local schema="$3"
  local ready_fd="" lease_fd="" lease_digest pid start session
  open_regular_fd "$ready" read "0:0:1:400" ready_fd || return
  open_regular_fd "$lease" read "0:0:1:400" lease_fd || return
  lease_digest="sha256:$(
    sha256sum "/proc/self/fd/${lease_fd}" | awk '{print $1}'
  )"
  jq -e \
    --arg leaseDigest "$lease_digest" \
    --arg schema "$schema" '
      type == "object" and
      (keys == ["leaseDigest","pid","schemaVersion","session","start"]) and
      .schemaVersion == $schema and
      .leaseDigest == $leaseDigest and
      (.pid | type == "string" and test("^[1-9][0-9]*$")) and
      (.session | type == "string" and test("^[1-9][0-9]*$")) and
      (.start | type == "string" and test("^[1-9][0-9]*$")) and
      .pid == .session
    ' "/proc/self/fd/${ready_fd}" >/dev/null || return
  pid="$(jq -er '.pid' "/proc/self/fd/${ready_fd}")" || return
  start="$(jq -er '.start' "/proc/self/fd/${ready_fd}")" || return
  session="$(jq -er '.session' "/proc/self/fd/${ready_fd}")" || return
  process_identity_live "$pid" "$start" "$session" && return 0
  return 2
}

finalizer_lease_matches_tombstone() {
  local lease_fd="" expected_state
  open_regular_fd "$finalizer_lease" read "0:0:1:400" lease_fd || return
  jq -cS . "/proc/self/fd/${lease_fd}" |
    cmp --silent "/proc/self/fd/${lease_fd}" - || return
  jq -e \
    --arg inputDigest "$input_digest" \
    --arg ownershipNonce "$ownership_nonce" \
    --arg runId "$run_id" \
    --arg tombstone "$finalizer_tombstone" '
      def identity:
        type == "object" and
        (keys == [
          "ctime","device","digest","gid","inode","links","mode","mtime",
          "path","size","type","uid"
        ]) and
        all(.[]; type == "string") and
        (.digest | test("^sha256:[0-9a-f]{64}$"));
      type == "object" and
      (keys == [
        "coreIdentities","inputDigest","ledgerDevice","ledgerInode",
        "ownershipNonce","rootIdentity","runId","schemaVersion","tombstone"
      ]) and
      .schemaVersion == "operations-validation-finalizer-v1" and
      .inputDigest == $inputDigest and
      .ownershipNonce == $ownershipNonce and
      .runId == $runId and
      .tombstone == $tombstone and
      (.ledgerDevice | type == "string" and test("^[0-9]+$")) and
      (.ledgerInode | type == "string" and test("^[0-9]+$")) and
      (.rootIdentity | identity) and
      .rootIdentity.path == "." and
      .rootIdentity.type == "directory" and
      .rootIdentity.uid == "0" and
      .rootIdentity.gid == "0" and
      .rootIdentity.mode == "700" and
      (.coreIdentities | keys == ["agent","library","marker"]) and
      all(.coreIdentities[]; identity) and
      .coreIdentities.agent.path == ".transfer-agent" and
      .coreIdentities.library.path == ".ownership-ledger-lib" and
      .coreIdentities.marker.path == ".validation-owner.json"
    ' "/proc/self/fd/${lease_fd}" >/dev/null || return
  if [[ -e "$finalizer_tombstone" || -L "$finalizer_tombstone" ]]; then
    [[ -d "$finalizer_tombstone" && ! -L "$finalizer_tombstone" ]] || return 1
    expected_state="$(
      jq -er '.rootIdentity.device + ":" + .rootIdentity.inode' \
        "/proc/self/fd/${lease_fd}"
    )" || return
    [[ "$(stat -Lc '%d:%i' "$finalizer_tombstone")" == "$expected_state" ]] ||
      return 1
  fi
  exec {lease_fd}>&-
}

if [[ ! -e "$root" && ! -L "$root" ]]; then
  if [[ -e "$finalizer_lease" || -L "$finalizer_lease" ]]; then
    finalizer_lease_matches_tombstone || fail
    finalizer_wait_started="$(date +%s)"
    if [[ -e "$finalizer_ready" || -L "$finalizer_ready" ]]; then
      while true; do
        if external_finalizer_live \
          "$finalizer_ready" "$finalizer_lease" \
          operations-validation-finalizer-ready-v1; then
          (( $(date +%s) - finalizer_wait_started < 30 )) || fail
          sleep 1
          continue
        fi
        finalizer_status="$?"
        if [[ ! -e "$finalizer_tombstone" &&
              ! -L "$finalizer_tombstone" &&
              ( ! -e "$finalizer_ready" || -L "$finalizer_ready" ) ]]; then
          while [[ -e "$finalizer_lease" || -L "$finalizer_lease" ]]; do
            (( $(date +%s) - finalizer_wait_started < 30 )) || fail
            sleep 1
          done
          break
        fi
        [[ "$finalizer_status" == "2" ]] || fail
        break
      done
    elif [[ -e "$finalizer_tombstone" || -L "$finalizer_tombstone" ]]; then
      # A tombstone can only be published after the authenticated ready record.
      # Without that capability the finalizer death cannot be established.
      fail
    else
      while [[ -e "$finalizer_lease" || -L "$finalizer_lease" ]]; do
        (( $(date +%s) - finalizer_wait_started < 30 )) || fail
        sleep 1
      done
    fi
    if [[ -e "$finalizer_lease" || -L "$finalizer_lease" ]]; then
      finalizer_lease_matches_tombstone || fail
      recover_finalizer_tombstone || fail
    fi
  fi
  if [[ ! -e "$root" && ! -L "$root" &&
        ( -e "$bootstrap_lease" || -L "$bootstrap_lease" ) ]]; then
    if [[ -e "$bootstrap_residue" || -L "$bootstrap_residue" ||
          -e "$bootstrap_staging" || -L "$bootstrap_staging" ]]; then
      restore_bootstrap_residue || fail
    else
      cleanup_bootstrap_metadata || fail
    fi
  fi
fi
if [[ ! -e "$root" && ! -L "$root" ]]; then
  jq -cnS '{rootAbsent:true,status:"not-needed"}'
  exit 0
fi

for finalizer_descriptor in \
  "${bootstrap_ready}|${bootstrap_lease}|operations-validation-bootstrap-finalizer-ready-v1" \
  "${finalizer_ready}|${finalizer_lease}|operations-validation-finalizer-ready-v1"; do
  IFS='|' read -r observed_ready observed_lease observed_schema \
    <<< "$finalizer_descriptor"
  finalizer_wait_started="$(date +%s)"
  while external_finalizer_live \
    "$observed_ready" "$observed_lease" "$observed_schema"; do
    if [[ ! -e "$root" && ! -L "$root" ]]; then
      jq -cnS '{rootAbsent:true,status:"succeeded"}'
      exit 0
    fi
    (( $(date +%s) - finalizer_wait_started < 30 )) || fail
    sleep 1
  done
done

[[ "$(id -u)" == "0" && -d "$root" && ! -L "$root" &&
   "$(stat -c '%u:%g:%a' "$root")" == "0:0:700" ]] || fail
exec {root_fd}<"$root" || fail
[[ "$(stat -Lc '%d:%i:%u:%g:%a:%F' "/proc/self/fd/${root_fd}")" == \
     "$(stat -Lc '%d:%i:%u:%g:%a:%F' "$root")" ]] || fail

marker_fd=""
library_fd=""
agent_fd=""
ledger_bootstrap_fd=""
open_regular_fd "$marker" read "0:0:1:400" marker_fd || fail
open_regular_fd "$library" read "0:0:1:500" library_fd || fail
open_regular_fd "$agent" read "0:0:1:500" agent_fd || fail
open_regular_fd "$ledger" read-write "0:0:1:600" ledger_bootstrap_fd || fail
readonly marker_fd_path="/proc/self/fd/${marker_fd}"
readonly library_fd_path="/proc/self/fd/${library_fd}"
readonly agent_fd_path="/proc/self/fd/${agent_fd}"
readonly ledger_bootstrap_fd_path="/proc/self/fd/${ledger_bootstrap_fd}"
jq -cS . "$marker_fd_path" | cmp --silent "$marker_fd_path" - || fail
observed_marker_digest="sha256:$(
  sha256sum "$marker_fd_path" | awk '{print $1}'
)" || fail
readonly observed_marker_digest
[[ "$marker_selector" == "discover" ||
   "$marker_selector" == "$observed_marker_digest" ]] || fail
jq -e \
  --arg agentDigest "sha256:$(sha256sum "$agent_fd_path" | awk '{print $1}')" \
  --arg inputDigest "$input_digest" \
  --arg ledgerDevice "$(stat -Lc '%d' "$ledger_bootstrap_fd_path")" \
  --arg ledgerInode "$(stat -Lc '%i' "$ledger_bootstrap_fd_path")" \
  --arg libraryDigest "sha256:$(sha256sum "$library_fd_path" | awk '{print $1}')" \
  --arg ownershipNonce "$ownership_nonce" \
  --arg rootDevice "$(stat -Lc '%d' "/proc/self/fd/${root_fd}")" \
  --arg rootInode "$(stat -Lc '%i' "/proc/self/fd/${root_fd}")" \
  --arg runId "$run_id" '
    type == "object" and
    (keys == [
      "agentDigest","inputDigest","ledgerDevice","ledgerInode",
      "libraryDigest","ownershipNonce","rootDevice","rootInode","runId",
      "schemaVersion"
    ]) and
    .schemaVersion == "operations-validation-owner-v2" and
    .agentDigest == $agentDigest and
    .inputDigest == $inputDigest and
    .ledgerDevice == $ledgerDevice and
    .ledgerInode == $ledgerInode and
    .libraryDigest == $libraryDigest and
    .ownershipNonce == $ownershipNonce and
    .rootDevice == $rootDevice and
    .rootInode == $rootInode and
    .runId == $runId
  ' "$marker_fd_path" >/dev/null || fail

# shellcheck source=/dev/null
source "$library_fd_path"
readonly ledger_run_id="$run_id"
readonly ledger_input_digest="$input_digest"
ledger_adopt_authority \
  "$ledger_bootstrap_fd" \
  "$(jq -er '.ledgerDevice' "$marker_fd_path")" \
  "$(jq -er '.ledgerInode' "$marker_fd_path")" || fail
ledger_verify_chain || fail
observed_head="$ledger_head"
[[ "$head_selector" == "discover" ||
   "$head_selector" == "$observed_head" ]] || fail

readonly recovery_lock="/srv/.bgmss-ops-validation-recover-${run_id}-${nonce_hex}.lock"
acquire_recovery_lock() {
  local expected temporary token
  expected="$(
    jq -cnS \
      --arg inputDigest "$input_digest" \
      --arg ownershipNonce "$ownership_nonce" \
      --arg runId "$run_id" \
      '{
        inputDigest:$inputDigest,
        ownershipNonce:$ownershipNonce,
        runId:$runId,
        schemaVersion:"operations-validation-recovery-lock-v1"
      }'
  )" || return
  if [[ ! -e "$recovery_lock" && ! -L "$recovery_lock" ]]; then
    token="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')" || return
    temporary="${recovery_lock}.creating-${token}"
    (
      set -o noclobber
      printf '%s\n' "$expected" > "$temporary"
    ) || return
    chmod 0600 "$temporary" || return
    chown 0:0 "$temporary" || return
    sync -f "$temporary" || return
    mv -T --no-clobber -- "$temporary" "$recovery_lock" || return
    fsync_directory /srv || return
  fi
  open_regular_fd "$recovery_lock" read-write "0:0:1:600" recovery_lock_fd ||
    return
  jq -cS . "/proc/self/fd/${recovery_lock_fd}" |
    cmp --silent "/proc/self/fd/${recovery_lock_fd}" - || return
  [[ "$(jq -cS . "/proc/self/fd/${recovery_lock_fd}")" == "$expected" ]] ||
    return 1
  flock -n "$recovery_lock_fd"
}

release_recovery_lock() {
  local token quarantine
  token="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')" || return
  quarantine="${recovery_lock}.quarantine-${token}"
  [[ "$(stat -Lc '%d:%i' "/proc/self/fd/${recovery_lock_fd}")" == \
       "$(stat -Lc '%d:%i' "$recovery_lock")" ]] || return 1
  mv -T --no-clobber -- "$recovery_lock" "$quarantine" || return
  fsync_directory /srv || return
  [[ "$(stat -Lc '%d:%i' "/proc/self/fd/${recovery_lock_fd}")" == \
       "$(stat -Lc '%d:%i' "$quarantine")" ]] || return 1
  rm -- "$quarantine" || return
  fsync_directory /srv || return
  flock -u "$recovery_lock_fd"
  exec {recovery_lock_fd}>&-
}

recovery_lock_fd=""
acquire_recovery_lock || fail

latest_identity_for() {
  local relative="$1"
  local required_event="$2"
  jq -cse \
    --arg event "$required_event" \
    --arg path "$relative" '
      [
        .[] |
        select(.payload.details.identity.path? == $path)
      ] |
      last |
      select(.payload.event == $event) |
      .payload.details.identity
    ' "$ledger_fd_path"
}

watchdog_record_live() {
  local relative="$1"
  local record="${root}/${relative}"
  local identity
  identity="$(
    jq -cse \
      --arg path "$relative" '
        [
          .[] |
          select(
            .payload.details.identity.path? == $path and
            (.payload.event |
              IN("runtime-closed","successor-lease-closed","watchdog-closed"))
          )
        ] |
        last |
        .payload.details.identity
      ' "$ledger_fd_path"
  )" || return
  ledger_verify_identity "$identity" || return
  jq -cS . "$record" | cmp --silent "$record" - || return
  if [[ "$relative" == "state/watchdog.json" ]]; then
    if process_identity_live \
      "$(jq -er '.mainPid' "$record")" \
      "$(jq -er '.mainStart' "$record")" \
      "$(jq -er '.mainSession' "$record")" ||
      process_identity_live \
        "$(jq -er '.watchdogPid' "$record")" \
        "$(jq -er '.watchdogStart' "$record")" \
        "$(jq -er '.watchdogSession' "$record")"; then
      return 0
    fi
  else
    if process_identity_live \
      "$(jq -er '.watchdogPid' "$record")" \
      "$(jq -er '.watchdogStart' "$record")" \
      "$(jq -er '.watchdogSession' "$record")"; then
      return 0
    fi
  fi
  return 2
}

cancel_transfer_watchdog() {
  local record="${root}/.transfer-watchdog.json"
  local identity pid start session tail_record event request_head details
  local cancel_head wait_started
  identity="$(
    latest_identity_for ".transfer-watchdog.json" watchdog-closed
  )" || return
  ledger_verify_identity "$identity" || return
  jq -cS . "$record" | cmp --silent "$record" - || return
  jq -e \
    --arg markerDigest "$observed_marker_digest" \
    --arg runId "$run_id" '
      type == "object" and
      (keys == [
        "deadline","ledgerHead","markerDigest","runId","schemaVersion",
        "watchdogPid","watchdogSession","watchdogStart"
      ]) and
      .schemaVersion == "operations-validation-transfer-watchdog-v1" and
      .markerDigest == $markerDigest and
      .runId == $runId and
      (.deadline | type == "string" and test("^[1-9][0-9]{9}$")) and
      (.ledgerHead |
        type == "string" and test("^sha256:[0-9a-f]{64}$")) and
      (.watchdogPid |
        type == "string" and test("^[1-9][0-9]*$")) and
      (.watchdogSession |
        type == "string" and test("^[1-9][0-9]*$")) and
      (.watchdogStart |
        type == "string" and test("^[1-9][0-9]*$")) and
      .watchdogPid == .watchdogSession
    ' "$record" >/dev/null || return
  pid="$(jq -er '.watchdogPid' "$record")" || return
  start="$(jq -er '.watchdogStart' "$record")" || return
  session="$(jq -er '.watchdogSession' "$record")" || return
  process_identity_live "$pid" "$start" "$session" || return 2

  tail_record="$(tail -n 1 "$ledger_fd_path")" || return
  event="$(jq -er '.payload.event' <<< "$tail_record")" || return
  case "$event" in
    transfer-watchdog-cancel-requested)
      jq -e \
        --arg head "$observed_head" \
        --argjson identity "$identity" '
          .payloadDigest == $head and
          .payload.phase == "transfer" and
          .payload.details == {watchdogIdentity:$identity}
        ' <<< "$tail_record" >/dev/null || return
      request_head="$observed_head"
      ;;
    transfer-watchdog-cancel-closed)
      jq -e \
        --arg head "$observed_head" \
        --argjson identity "$identity" '
          .payloadDigest == $head and
          .payload.phase == "transfer" and
          .payload.details.watchdogIdentity == $identity and
          .payload.details.requestHead == .payload.previous
        ' <<< "$tail_record" >/dev/null || return
      request_head="$(jq -er '.payload.details.requestHead' <<< "$tail_record")" ||
        return
      ;;
    *)
      details="$(
        jq -cnS \
          --argjson watchdogIdentity "$identity" \
          '{watchdogIdentity:$watchdogIdentity}'
      )" || return
      request_head="$(
        ledger_append transfer-watchdog-cancel-requested transfer \
          "$details" "$observed_head"
      )" || return
      observed_head="$request_head"
      ;;
  esac

  wait_started="$(date +%s)"
  while true; do
    ledger_verify_chain || return
    tail_record="$(tail -n 1 "$ledger_fd_path")" || return
    if jq -e \
      --arg requestHead "$request_head" \
      --argjson identity "$identity" '
        .payload.event == "transfer-watchdog-cancel-closed" and
        .payload.phase == "transfer" and
        .payload.previous == $requestHead and
        .payload.details == {
          requestHead:$requestHead,
          watchdogIdentity:$identity
        }
      ' <<< "$tail_record" >/dev/null; then
      observed_head="$ledger_head"
      if ! process_identity_live "$pid" "$start" "$session"; then
        return 0
      fi
    else
      jq -e \
        --arg requestHead "$request_head" \
        --argjson identity "$identity" '
          .payloadDigest == $requestHead and
          .payload.event == "transfer-watchdog-cancel-requested" and
          .payload.phase == "transfer" and
          .payload.details == {watchdogIdentity:$identity}
        ' <<< "$tail_record" >/dev/null || return
      process_identity_live "$pid" "$start" "$session" || return 1
    fi
    (( $(date +%s) - wait_started < 30 )) || return 1
    sleep 0.1
  done
}

run_agent_cleanup() {
  /usr/bin/bash "$agent_fd_path" cleanup \
    "$run_id" "$input_digest" "$observed_marker_digest" "$observed_head" \
    "$observed_head"
}

observed_phase="$(jq -rse '.[-1].payload.phase' "$ledger_fd_path")" || fail
readonly observed_phase
case "$observed_phase" in
  bootstrap|transfer)
    if watchdog_record_live ".transfer-watchdog.json"; then
      if [[ "$observed_phase" != "transfer" ]] ||
        ! cancel_transfer_watchdog; then
        release_recovery_lock || fail
        fail
      fi
      status=2
    else
      status="$?"
    fi
    [[ "$status" == "1" || "$status" == "2" ]] || fail
    if [[ "$observed_phase" == "transfer" && "$status" != "2" ]]; then
      release_recovery_lock || fail
      fail
    fi
    if [[ "$status" == "2" ]] &&
      jq -e '
        .payload.event == "transfer-watchdog-cancel-requested"
      ' < <(tail -n 1 "$ledger_fd_path") >/dev/null; then
      release_recovery_lock || fail
      fail
    fi
    if run_agent_cleanup; then
      status=0
    else
      status="$?"
    fi
    release_recovery_lock || fail
    exit "$status"
    ;;
  entry-preparing|cleanup|run-owned)
    # Both exact identities must be dead. A live main or successor watchdog is
    # the current lease owner and recovery must not race it.
    if watchdog_record_live "state/watchdog.json"; then
      release_recovery_lock || fail
      fail
    else
      watchdog_status="$?"
    fi
    if [[ "$observed_phase" != "cleanup" && "$watchdog_status" != "2" ]]; then
      release_recovery_lock || fail
      fail
    fi
    if [[ "$observed_phase" == "run-owned" ]]; then
      input_identity="$(
        latest_identity_for incoming/validation-input-v1.json transfer-closed
      )" || fail
      ledger_verify_identity "$input_identity" || fail
      readonly input="${root}/incoming/validation-input-v1.json"
      input_fd=""
      open_regular_fd "$input" read "0:0:1:400" input_fd || fail
      readonly input_fd_path="/proc/self/fd/${input_fd}"
      jq -cS . "$input_fd_path" | cmp --silent "$input_fd_path" - || fail
      entry_id="$(jq -er '.runtime.remoteEntryFileId' "$input_fd_path")" || fail
      [[ "$entry_id" =~ ^f[0-9]{4}$ ]] || fail
      entry_relative="incoming/files/${entry_id}"
      entry_identity="$(latest_identity_for "$entry_relative" transfer-closed)" ||
        fail
      ledger_verify_identity "$entry_identity" || fail
      readonly entry="${root}/${entry_relative}"
      entry_fd=""
      open_regular_fd "$entry" read "0:0:1:500" entry_fd || fail
      [[ "sha256:$(sha256sum "/proc/self/fd/${entry_fd}" | awk '{print $1}')" == \
           "$entry_digest" ]] || fail
      if /usr/bin/bash "/proc/self/fd/${entry_fd}" --recover \
        "$run_id" "$input_digest" "$observed_marker_digest" "$observed_head"; then
        status=0
      else
        status="$?"
      fi
    else
      if run_agent_cleanup; then
        status=0
      else
        status="$?"
      fi
    fi
    release_recovery_lock || fail
    exit "$status"
    ;;
  *)
    release_recovery_lock || true
    fail
    ;;
esac
