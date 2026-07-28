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
readonly library="${root}/.ownership-ledger-lib"
readonly agent="${root}/.transfer-agent"
readonly ledger="${root}/.ownership-ledger.jsonl"

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

[[ "$#" -ge 5 ]] || fail
readonly operation="$1"
shift
readonly run_id="$1"
readonly input_digest="$2"
readonly marker_digest="$3"
readonly expected_head="$4"
shift 4
[[ "$operation" =~ ^[a-z][a-z0-9-]{1,31}$ &&
   "$run_id" =~ ^run-[0-9a-f]{32}$ &&
   "$input_digest" =~ ^sha256:[0-9a-f]{64}$ &&
   "$marker_digest" =~ ^sha256:[0-9a-f]{64}$ &&
   "$expected_head" =~ ^sha256:[0-9a-f]{64}$ ]] || fail
library_fd=""
marker_fd=""
agent_fd=""
ledger_bootstrap_fd=""
open_regular_fd "$marker" read "0:0:1:400" marker_fd || fail
readonly marker_fd_path="/proc/self/fd/${marker_fd}"
[[ "sha256:$(sha256sum "$marker_fd_path" | awk '{print $1}')" == \
     "$marker_digest" ]] || fail
jq -cS . "$marker_fd_path" | cmp --silent "$marker_fd_path" - || fail
open_regular_fd "$library" read "0:0:1:500" library_fd || fail
open_regular_fd "$agent" read "0:0:1:500" agent_fd || fail
open_regular_fd "$ledger" read-write "0:0:1:600" ledger_bootstrap_fd || fail
readonly library_fd_path="/proc/self/fd/${library_fd}"
readonly agent_fd_path="/proc/self/fd/${agent_fd}"
readonly ledger_bootstrap_fd_path="/proc/self/fd/${ledger_bootstrap_fd}"
expected_library_digest="$(
  jq -er '.libraryDigest' "$marker_fd_path"
)" || fail
readonly expected_library_digest
expected_agent_digest="$(jq -er '.agentDigest' "$marker_fd_path")" || fail
readonly expected_agent_digest
[[ "sha256:$(sha256sum "$library_fd_path" | awk '{print $1}')" == \
     "$expected_library_digest" &&
   "sha256:$(sha256sum "$agent_fd_path" | awk '{print $1}')" == \
     "$expected_agent_digest" ]] || fail

# shellcheck source=/dev/null
source "$library_fd_path"
readonly ledger_run_id="$run_id"
readonly ledger_input_digest="$input_digest"
expected_ledger_device="$(jq -er '.ledgerDevice' "$marker_fd_path")" || fail
readonly expected_ledger_device
expected_ledger_inode="$(jq -er '.ledgerInode' "$marker_fd_path")" || fail
readonly expected_ledger_inode
ledger_adopt_authority \
  "$ledger_bootstrap_fd" "$expected_ledger_device" "$expected_ledger_inode" ||
  fail

verify_authority() {
  [[ "$(id -u)" == "0" && -d "$root" && ! -L "$root" &&
     "$(stat -c '%u:%g:%a' -- "$root")" == "0:0:700" ]] || return 1
  ledger_assert_fd_path "$marker_fd" "$marker" "0:0:1:400" || return
  ledger_assert_fd_path "$library_fd" "$library" "0:0:1:500" || return
  ledger_assert_fd_path "$agent_fd" "$agent" "0:0:1:500" || return
  ledger_assert_path_binding || return
  [[ "$(ledger_sha_fd "$marker_fd")" == "$marker_digest" ]] || return 1
  jq -cS . "$marker_fd_path" | cmp --silent "$marker_fd_path" - || return 1
  jq -e \
    --arg agentDigest "$(ledger_sha_fd "$agent_fd")" \
    --arg inputDigest "$input_digest" \
    --arg ledgerDevice "$(stat -Lc '%d' -- "$ledger_fd_path")" \
    --arg ledgerInode "$(stat -Lc '%i' -- "$ledger_fd_path")" \
    --arg libraryDigest "$(ledger_sha_fd "$library_fd")" \
    --arg rootDevice "$(stat -c '%d' -- "$root")" \
    --arg rootInode "$(stat -c '%i' -- "$root")" \
    --arg runId "$run_id" '
      type == "object" and
      (keys == [
        "agentDigest",
        "inputDigest",
        "ledgerDevice",
        "ledgerInode",
        "libraryDigest",
        "ownershipNonce",
        "rootDevice",
        "rootInode",
        "runId",
        "schemaVersion"
      ]) and
      .schemaVersion == "operations-validation-owner-v2" and
      .agentDigest == $agentDigest and
      .inputDigest == $inputDigest and
      .ledgerDevice == $ledgerDevice and
      .ledgerInode == $ledgerInode and
      .libraryDigest == $libraryDigest and
      (.ownershipNonce |
        type == "string" and test("^sha256:[0-9a-f]{64}$")) and
      .rootDevice == $rootDevice and
      .rootInode == $rootInode and
      .runId == $runId
    ' "$marker_fd_path" >/dev/null
}

verify_head() {
  ledger_verify_chain &&
    [[ "$ledger_head" == "$1" ]]
}

append_event() {
  local event="$1"
  local phase="$2"
  local details="$3"
  local head="$4"
  if [[ "$ledger_transaction_active" == "yes" ]]; then
    ledger_append_transaction "$event" "$phase" "$details" "$head"
  else
    ledger_append "$event" "$phase" "$details" "$head"
  fi
}

receive_file() {
  [[ "$#" -eq 6 ]] || fail
  local kind="$1"
  local identifier="$2"
  local digest="$3"
  local size="$4"
  local mode="$5"
  local deadline="$6"
  [[ ( "$kind" == "input" || "$kind" == "file" ) &&
     "$digest" =~ ^sha256:[0-9a-f]{64}$ &&
     "$size" =~ ^[1-9][0-9]{0,18}$ &&
     ( "$mode" == "0400" || "$mode" == "0500" ) &&
     "$deadline" =~ ^[1-9][0-9]{9}$ ]] || fail
  local relative destination
  if [[ "$kind" == "input" ]]; then
    [[ "$identifier" == "validation-input-v1.json" &&
       "$digest" == "$input_digest" && "$mode" == "0400" ]] || fail
    relative="incoming/validation-input-v1.json"
  else
    [[ "$identifier" =~ ^f[0-9]{4}$ ]] || fail
    relative="incoming/files/${identifier}"
  fi
  destination="${root}/${relative}"
  [[ ! -e "$destination" && ! -L "$destination" ]] || fail
  local now
  now="$(date +%s)"
  (( deadline > now && deadline - now <= 25200 )) || fail

  local current_head="$expected_head"
  local created="no"
  local complete="no"
  local baseline=""
  local signal_name=""

  cleanup_partial() {
    set +e
    [[ "$complete" != "yes" && "$created" == "yes" &&
       -n "$baseline" ]] || return
    ledger_verify_creation_identity "$baseline" || return
    local identity details closed_head removing_head quarantine quarantine_relative
    identity="$(ledger_identity_json "$destination")" || return
    details="$(
      jq -cnS \
        --argjson baseline "$baseline" \
        --argjson identity "$identity" \
        '{baseline:$baseline,identity:$identity}'
    )" || return
    closed_head="$(
      append_event transfer-aborted transfer "$details" "$current_head"
    )" || return
    ledger_verify_identity "$identity" || return
    ledger_new_quarantine "$destination" quarantine || return
    quarantine_relative="$(ledger_relative_path "$quarantine")" || return
    details="$(
      jq -cnS \
        --arg quarantine "$quarantine_relative" \
        --argjson identity "$identity" \
        '{identity:$identity,quarantine:$quarantine}'
    )" || return
    removing_head="$(
      append_event object-removing transfer "$details" "$closed_head"
    )" || return
    ledger_quarantine_remove "$destination" "$quarantine" "$identity" || return
    details="$(
      jq -cnS \
        --arg path "$relative" \
        --arg quarantine "$quarantine_relative" \
        --argjson identity "$identity" \
        '{identity:$identity,path:$path,quarantine:$quarantine}'
    )" || return
    current_head="$(
      append_event object-removed transfer "$details" "$removing_head"
    )" || return
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
    [[ "$complete" == "yes" && -z "$signal_name" ]] || cleanup_partial
  }

  trap cleanup_partial ERR
  trap on_exit EXIT
  trap 'on_signal HUP' HUP
  trap 'on_signal INT' INT
  trap 'on_signal TERM' TERM

  local expected details parent_identity
  parent_identity="$(ledger_identity_json "${destination%/*}")" || fail
  expected="$(
    jq -cnS \
      --arg digest "$digest" \
      --arg mode "${mode#0}" \
      --arg path "$relative" \
      --arg size "$size" \
      '{
        digest:$digest,
        gid:"0",
        links:"1",
        mode:$mode,
        path:$path,
        size:$size,
        type:"file",
        uid:"0"
      }'
  )" || fail
  details="$(
    jq -cnS \
      --argjson expected "$expected" \
      --argjson parentIdentity "$parent_identity" \
      '{absent:true,expected:$expected,parentIdentity:$parentIdentity}'
  )" || fail
  current_head="$(
    append_event object-creating transfer "$details" "$current_head"
  )" || fail
  (
    set -o noclobber
    : > "$destination"
  )
  ledger_fsync_parent "$destination" || fail
  created="yes"
  baseline="$(ledger_identity_json "$destination")"
  details="$(
    jq -cnS \
      --argjson baseline "$baseline" \
      --argjson expected "$expected" \
      '{baseline:$baseline,expected:$expected}'
  )" || fail
  current_head="$(
    append_event object-created transfer "$details" "$current_head"
  )" || fail
  details="$(jq -cnS --argjson baseline "$baseline" '{baseline:$baseline}')"
  current_head="$(
    append_event mutation-opened transfer "$details" "$current_head"
  )" || fail
  abort_if_signaled

  dd iflag=count_bytes count="$size" bs=1048576 of="$destination" status=none
  [[ "$(dd bs=1 count=1 status=none | wc -c)" == "0" ]] || fail
  sync -f -- "$destination"
  [[ "$(stat -c '%s' -- "$destination")" == "$size" &&
     "$(ledger_sha_file "$destination")" == "$digest" ]] || fail
  chmod "${mode#0}" -- "$destination"
  chown 0:0 -- "$destination"
  sync -f -- "$destination"
  ledger_fsync_parent "$destination" || fail
  local identity
  identity="$(ledger_identity_json "$destination")" || fail
  jq -e \
    --argjson expected "$expected" \
    --argjson identity "$identity" '
      ($identity | {
        digest,gid,links,mode,path,size,type,uid
      }) == $expected
    ' >/dev/null || fail
  details="$(
    jq -cnS \
      --arg deadline "$deadline" \
      --argjson identity "$identity" \
      '{deadline:$deadline,identity:$identity}'
  )" || fail
  current_head="$(
    append_event transfer-closed transfer "$details" "$current_head"
  )" || fail
  complete="yes"
  trap - ERR
  abort_if_signaled
  jq -cnS \
    --arg ledgerHead "$current_head" \
    --arg path "$relative" \
    '{ledgerHead:$ledgerHead,path:$path,status:"closed"}'
}

latest_object_states() {
  jq -cs '
    reduce .[] as $record ({};
      if $record.payload.event == "path-replaced" then
        .[$record.payload.details.sourceIdentity.path] = {
          destination:$record.payload.details.destination,
          event:"path-replaced",
          identity:$record.payload.details.sourceIdentity,
          movedIdentity:$record.payload.details.movedIdentity
        } |
        .[$record.payload.details.movedIdentity.path] = {
          event:"path-replaced-destination",
          identity:$record.payload.details.movedIdentity
        }
      elif (
        $record.payload.details.identity.path? |
        type == "string"
      ) then
        .[$record.payload.details.identity.path] = (
          {
            event:$record.payload.event,
            identity:$record.payload.details.identity
          } +
          if ($record.payload.details.quarantine? | type == "string")
          then {quarantine:$record.payload.details.quarantine}
          else {} end
        )
      elif (
        $record.payload.details.baseline.path? |
        type == "string"
      ) then
        .[$record.payload.details.baseline.path] = {
          baseline:$record.payload.details.baseline,
          event:$record.payload.event
        }
      elif (
        $record.payload.details.expected.path? |
        type == "string"
      ) then
        .[$record.payload.details.expected.path] = {
          event:$record.payload.event,
          expected:$record.payload.details.expected
        }
      else . end
    )
  ' "$ledger_fd_path"
}

ownership_nonce_value="$(jq -er '.ownershipNonce' "$marker_fd_path")" || fail
readonly ownership_nonce_value
readonly ownership_nonce_hex="${ownership_nonce_value#sha256:}"
readonly finalizer_lease="/srv/.bgmss-ops-validation-final-${run_id}-${ownership_nonce_hex}.json"
readonly finalizer_ready="/srv/.bgmss-ops-validation-final-${run_id}-${ownership_nonce_hex}.ready"
readonly finalizer_tombstone="/srv/.bgmss-ops-validation-final-${run_id}-${ownership_nonce_hex}"
finalizer_child="no"

prepare_finalizer_lease() {
  local root_identity core_identities expected
  root_identity="$(ledger_identity_json "$root")" || return
  core_identities="$(
    jq -cnS \
      --argjson agent "$(ledger_identity_json "$agent")" \
      --argjson library "$(ledger_identity_json "$library")" \
      --argjson marker "$(ledger_identity_json "$marker")" \
      '{agent:$agent,library:$library,marker:$marker}'
  )" || return
  expected="$(
    jq -cnS \
      --arg inputDigest "$input_digest" \
      --arg ledgerDevice "$(stat -Lc '%d' "$ledger_fd_path")" \
      --arg ledgerInode "$(stat -Lc '%i' "$ledger_fd_path")" \
      --arg ownershipNonce "$ownership_nonce_value" \
      --arg runId "$run_id" \
      --arg tombstone "$finalizer_tombstone" \
      --argjson coreIdentities "$core_identities" \
      --argjson rootIdentity "$root_identity" \
      '{
        coreIdentities:$coreIdentities,
        inputDigest:$inputDigest,
        ledgerDevice:$ledgerDevice,
        ledgerInode:$ledgerInode,
        ownershipNonce:$ownershipNonce,
        rootIdentity:$rootIdentity,
        runId:$runId,
        schemaVersion:"operations-validation-finalizer-v1",
        tombstone:$tombstone
      }'
  )" || return
  if [[ ! -e "$finalizer_lease" && ! -L "$finalizer_lease" ]]; then
    (
      set -o noclobber
      printf '%s\n' "$expected" > "$finalizer_lease"
    ) || return
    chmod 0400 "$finalizer_lease" || return
    chown 0:0 "$finalizer_lease" || return
    sync -f -- "$finalizer_lease" || return
    ledger_fsync_directory /srv || return
  fi
  [[ -f "$finalizer_lease" && ! -L "$finalizer_lease" &&
     "$(stat -c '%u:%g:%h:%a' "$finalizer_lease")" == "0:0:1:400" ]] ||
    return 1
  jq -cS . "$finalizer_lease" | cmp --silent "$finalizer_lease" - || return
  jq -e \
    --arg inputDigest "$input_digest" \
    --arg ledgerDevice "$(stat -Lc '%d' "$ledger_fd_path")" \
    --arg ledgerInode "$(stat -Lc '%i' "$ledger_fd_path")" \
    --arg ownershipNonce "$ownership_nonce_value" \
    --arg runId "$run_id" \
    --arg tombstone "$finalizer_tombstone" \
    --argjson coreIdentities "$core_identities" \
    --argjson observed "$root_identity" '
      type == "object" and
      (keys == [
        "coreIdentities","inputDigest","ledgerDevice","ledgerInode",
        "ownershipNonce","rootIdentity","runId","schemaVersion","tombstone"
      ]) and
      .schemaVersion == "operations-validation-finalizer-v1" and
      .inputDigest == $inputDigest and
      .ledgerDevice == $ledgerDevice and
      .ledgerInode == $ledgerInode and
      .ownershipNonce == $ownershipNonce and
      .runId == $runId and
      .tombstone == $tombstone and
      .coreIdentities == $coreIdentities and
      (.rootIdentity |
        {device,gid,inode,mode,path,type,uid}) ==
      ($observed |
        {device,gid,inode,mode,path,type,uid})
    ' "$finalizer_lease" >/dev/null
}

finalizer_write_ready() {
  local self_start self_session ready
  self_start="$(awk '{print $22}' "/proc/$$/stat")" || return
  self_session="$(ps -o sid= -p "$$" | tr -d '[:space:]')" || return
  [[ "$self_session" == "$$" ]] || return 1
  ready="$(
    jq -cnS \
      --arg leaseDigest "$(ledger_sha_file "$finalizer_lease")" \
      --arg pid "$$" \
      --arg session "$self_session" \
      --arg start "$self_start" \
      '{
        leaseDigest:$leaseDigest,
        pid:$pid,
        schemaVersion:"operations-validation-finalizer-ready-v1",
        session:$session,
        start:$start
      }'
  )" || return
  (
    set -o noclobber
    printf '%s\n' "$ready" > "$finalizer_ready"
  ) || return
  chmod 0400 "$finalizer_ready" || return
  chown 0:0 "$finalizer_ready" || return
  sync -f -- "$finalizer_ready" || return
  ledger_fsync_directory /srv
}

wait_finalizer_ready() {
  local started pid start session
  started="$(date +%s)"
  while [[ ! -f "$finalizer_ready" || -L "$finalizer_ready" ]]; do
    (( $(date +%s) - started < 30 )) || return 1
    sleep 0.1
  done
  [[ "$(stat -c '%u:%g:%h:%a' "$finalizer_ready")" == "0:0:1:400" ]] ||
    return 1
  jq -cS . "$finalizer_ready" | cmp --silent "$finalizer_ready" - || return
  jq -e \
    --arg digest "$(ledger_sha_file "$finalizer_lease")" '
      type == "object" and
      (keys == ["leaseDigest","pid","schemaVersion","session","start"]) and
      .schemaVersion == "operations-validation-finalizer-ready-v1" and
      .leaseDigest == $digest and
      (.pid | type == "string" and test("^[1-9][0-9]*$")) and
      (.session | type == "string" and test("^[1-9][0-9]*$")) and
      (.start | type == "string" and test("^[1-9][0-9]*$")) and
      .pid == .session
    ' "$finalizer_ready" >/dev/null || return
  pid="$(jq -er '.pid' "$finalizer_ready")" || return
  start="$(jq -er '.start' "$finalizer_ready")" || return
  session="$(jq -er '.session' "$finalizer_ready")" || return
  process_identity_live "$pid" "$start" "$session"
}

remove_external_identity() {
  local candidate="$1"
  local expected_digest="$2"
  local descriptor="" quarantine token
  open_regular_fd "$candidate" read "0:0:1:400" descriptor || return
  [[ "$(ledger_sha_fd "$descriptor")" == "$expected_digest" ]] || return 1
  token="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')" || return
  quarantine="${candidate}.quarantine-${token}"
  [[ ! -e "$quarantine" && ! -L "$quarantine" ]] || return 1
  mv -T --no-clobber -- "$candidate" "$quarantine" || return
  ledger_fsync_directory /srv || return
  [[ "$(stat -Lc '%d:%i' "/proc/self/fd/${descriptor}")" == \
       "$(stat -Lc '%d:%i' "$quarantine")" ]] || return 1
  rm -- "$quarantine" || return
  ledger_fsync_directory /srv || return
  exec {descriptor}>&-
}

finalize_root_locked() {
  [[ "$ledger_transaction_active" == "yes" ]] || return 1
  local lease_fd="" lease_digest root_fd root_state tombstone_state
  local ledger_quarantine token
  open_regular_fd "$finalizer_lease" read "0:0:1:400" lease_fd || return
  lease_digest="$(ledger_sha_fd "$lease_fd")" || return
  jq -e \
    --arg inputDigest "$input_digest" \
    --arg ownershipNonce "$ownership_nonce_value" \
    --arg runId "$run_id" \
    --arg tombstone "$finalizer_tombstone" '
      .schemaVersion == "operations-validation-finalizer-v1" and
      .inputDigest == $inputDigest and
      .ownershipNonce == $ownershipNonce and
      .runId == $runId and
      .tombstone == $tombstone
    ' "/proc/self/fd/${lease_fd}" >/dev/null || return
  [[ -d "$root" && ! -L "$root" &&
     ! -e "$finalizer_tombstone" && ! -L "$finalizer_tombstone" &&
     "$(find "$root" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == \
       $'.ownership-ledger-lib\n.ownership-ledger.jsonl\n.transfer-agent\n.validation-owner.json' ]] ||
    return 1
  exec {root_fd}<"$root" || return
  root_state="$(stat -Lc '%d:%i:%u:%g:%a:%F' "/proc/self/fd/${root_fd}")" ||
    return
  jq -e \
    --arg device "$(stat -Lc '%d' "/proc/self/fd/${root_fd}")" \
    --arg inode "$(stat -Lc '%i' "/proc/self/fd/${root_fd}")" '
      .rootIdentity.device == $device and
      .rootIdentity.inode == $inode and
      .rootIdentity.gid == "0" and
      .rootIdentity.mode == "700" and
      .rootIdentity.path == "." and
      .rootIdentity.type == "directory" and
      .rootIdentity.uid == "0"
    ' "/proc/self/fd/${lease_fd}" >/dev/null || return
  mv -T --no-clobber -- "$root" "$finalizer_tombstone" || return
  ledger_fsync_directory /srv || return
  tombstone_state="$(
    stat -Lc '%d:%i:%u:%g:%a:%F' "$finalizer_tombstone"
  )" || return
  [[ "$root_state" == "$tombstone_state" ]] || return 1
  local core_key core_relative core_identity core_candidate core_fd
  while IFS=$'\t' read -r core_key core_relative; do
    case "$core_key:$core_relative" in
      agent:.transfer-agent|library:.ownership-ledger-lib|\
      marker:.validation-owner.json)
        ;;
      *)
        return 1
        ;;
    esac
    core_identity="$(
      jq -ce --arg key "$core_key" '.coreIdentities[$key]' \
        "/proc/self/fd/${lease_fd}"
    )" || return
    core_candidate="${finalizer_tombstone}/${core_relative}"
    core_fd=""
    open_regular_fd \
      "$core_candidate" read \
      "$(jq -er \
        '.uid + \":\" + .gid + \":\" + .links + \":\" + .mode' \
        <<< "$core_identity")" \
      core_fd || return
    [[ "$(stat -Lc '%d' "/proc/self/fd/${core_fd}")" == \
         "$(jq -er '.device' <<< "$core_identity")" &&
       "$(stat -Lc '%i' "/proc/self/fd/${core_fd}")" == \
         "$(jq -er '.inode' <<< "$core_identity")" &&
       "$(ledger_sha_fd "$core_fd")" == \
         "$(jq -er '.digest' <<< "$core_identity")" ]] || return 1
    token="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')" || return
    ledger_quarantine="${finalizer_tombstone}/.validation-quarantine-${token}"
    mv -T --no-clobber -- "$core_candidate" "$ledger_quarantine" || return
    ledger_fsync_directory "$finalizer_tombstone" || return
    [[ "$(stat -Lc '%d:%i' "/proc/self/fd/${core_fd}")" == \
         "$(stat -Lc '%d:%i' "$ledger_quarantine")" ]] || return 1
    rm -- "$ledger_quarantine" || return
    ledger_fsync_directory "$finalizer_tombstone" || return
    exec {core_fd}>&-
  done < <(
    jq -r '.coreIdentities | to_entries[] | [.key,.value.path] | @tsv' \
      "/proc/self/fd/${lease_fd}"
  )
  token="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')" || return
  ledger_quarantine="${finalizer_tombstone}/.validation-quarantine-${token}"
  mv -T --no-clobber -- \
    "${finalizer_tombstone}/.ownership-ledger.jsonl" "$ledger_quarantine" ||
    return
  ledger_fsync_directory "$finalizer_tombstone" || return
  [[ "$(stat -Lc '%d:%i' "$ledger_fd_path")" == \
       "$(stat -Lc '%d:%i' "$ledger_quarantine")" ]] || return 1
  rm -- "$ledger_quarantine" || return
  ledger_fsync_directory "$finalizer_tombstone" || return
  rmdir -- "$finalizer_tombstone" || return
  ledger_fsync_directory /srv || return
  local ready_digest=""
  [[ ! -e "$finalizer_ready" ]] ||
    ready_digest="$(ledger_sha_file "$finalizer_ready")"
  [[ -z "$ready_digest" ]] ||
    remove_external_identity "$finalizer_ready" "$ready_digest" || return
  remove_external_identity "$finalizer_lease" "$lease_digest" || return
  exec {root_fd}>&-
  exec {lease_fd}>&-
}

start_finalizer() {
  [[ "$finalizer_child" == "no" ]] || return
  prepare_finalizer_lease || return
  [[ ! -e "$finalizer_ready" && ! -L "$finalizer_ready" ]] || return 1
  setsid --fork /usr/bin/bash -c '
    inherited_ledger_fd="$1"
    shift
    exec {inherited_ledger_fd}>&-
    exec "$@"
  ' -- "$ledger_authority_fd" \
    /usr/bin/bash "$agent_fd_path" finalizer \
    "$run_id" "$input_digest" "$marker_digest" "$ledger_head" \
    </dev/null >/dev/null 2>&1 &
  local launcher="$!"
  wait "$launcher" || return
  wait_finalizer_ready
}

cleanup_transfer() {
  [[ "$#" -le 2 ]] || fail
  local required_head="${1:-}"
  finalizer_child="${2:-no}"
  [[ "$finalizer_child" == "no" || "$finalizer_child" == "yes" ]] || fail
  ledger_begin_transaction "$required_head" || fail
  verify_authority || fail
  if [[ "$finalizer_child" == "no" ]]; then
    start_finalizer || fail
  else
    prepare_finalizer_lease || fail
  fi
  local observed_phase
  observed_phase="$(jq -rse '.[-1].payload.phase' "$ledger_fd_path")" || fail
  if [[ -z "$required_head" ]]; then
    [[ "$observed_phase" == "bootstrap" ||
       "$observed_phase" == "transfer" ||
       "$observed_phase" == "entry-preparing" ||
       "$observed_phase" == "cleanup" ]] || fail
  fi
  local states required allowed actual candidate relative state event
  local identity baseline quarantine quarantine_relative observed
  states="$(latest_object_states)" || fail
  required="$(
    {
      printf '%s\n' \
        . \
        .ownership-ledger.jsonl
      jq -r '
        to_entries[] |
        select(
          .value.event != "object-removed" and
          .value.event != "object-removing" and
          .value.event != "object-creating" and
          .value.event != "object-create-abandoned" and
          .value.event != "path-replaced"
        ) |
        .key
      ' <<< "$states"
    } | sort -u
  )"
  allowed="$(
    {
      printf '%s\n' \
        . \
        .ownership-ledger.jsonl
      jq -r '
        to_entries[] |
        select(
          .value.event != "object-removed" and
          .value.event != "object-create-abandoned" and
          .value.event != "path-replaced"
        ) |
        .key
      ' <<< "$states"
      jq -r '
        to_entries[] |
        select(.value.event == "object-removing") |
        .value.quarantine
      ' <<< "$states"
    } | sort -u
  )"
  actual="$(
    {
      printf '.\n'
      find "$root" -xdev -mindepth 1 -printf '%P\n'
    } | sort -u
  )"
  [[ -z "$(comm -23 <(printf '%s\n' "$required") \
                    <(printf '%s\n' "$actual"))" &&
     -z "$(comm -13 <(printf '%s\n' "$allowed") \
                    <(printf '%s\n' "$actual"))" ]] || fail

  # Prevalidate the whole universe before the first unlink.
  while IFS= read -r relative; do
    [[ "$relative" != "." && "$relative" != ".ownership-ledger.jsonl" ]] ||
      continue
    state="$(jq -cer --arg path "$relative" '.[$path]' <<< "$states")" || fail
    event="$(jq -r '.event' <<< "$state")"
    case "$event" in
      object-removed)
        [[ ! -e "${root}/${relative}" && ! -L "${root}/${relative}" ]] || fail
        ;;
      object-create-abandoned)
        [[ ! -e "${root}/${relative}" && ! -L "${root}/${relative}" ]] || fail
        ;;
      path-replaced)
        [[ ! -e "${root}/${relative}" && ! -L "${root}/${relative}" ]] || fail
        ;;
      object-creating)
        # Intent alone never authorizes deletion. If the create syscall became
        # visible before SIGKILL, the object is unknown and must be preserved.
        [[ ! -e "${root}/${relative}" && ! -L "${root}/${relative}" ]] || fail
        ;;
      bootstrap-closed|cleanup-closed|path-replaced-destination|\
      runtime-closed|successor-lease-closed|transfer-aborted|transfer-closed|\
      watchdog-closed)
        identity="$(jq -ce '.identity' <<< "$state")" || fail
        if [[ "$(jq -r '.type' <<< "$identity")" == "directory" ]]; then
          ledger_verify_anchor "$identity" || fail
        else
          ledger_verify_identity "$identity" || fail
        fi
        ;;
      mutation-opened|object-created)
        baseline="$(jq -ce '.baseline' <<< "$state")" || fail
        ledger_verify_creation_identity "$baseline" || fail
        ;;
      object-removing)
        identity="$(jq -ce '.identity' <<< "$state")" || fail
        quarantine_relative="$(jq -er '.quarantine' <<< "$state")" || fail
        quarantine="${root}/${quarantine_relative}"
        ledger_relative_path "$quarantine" >/dev/null || fail
        if [[ -e "${root}/${relative}" || -L "${root}/${relative}" ]]; then
          [[ ! -e "$quarantine" && ! -L "$quarantine" ]] || fail
          ledger_verify_identity "$identity" || fail
        elif [[ -e "$quarantine" || -L "$quarantine" ]]; then
          observed="$(ledger_identity_json "$quarantine")" || fail
          ledger_same_object "$identity" "$observed" || fail
        fi
        ;;
      *)
        fail
        ;;
    esac
  done <<< "$allowed"

  mapfile -t paths < <(
    jq -r 'keys[]' <<< "$states" |
      awk '{print gsub("/","/") "\t" $0}' |
      sort -rn -k1,1 -k2,2 |
      cut -f2-
  )
  local current_head="$ledger_head"
  for relative in "${paths[@]}"; do
    [[ "$relative" != "." ]] || continue
    case "$relative" in
      .ownership-ledger-lib|.transfer-agent|.validation-owner.json)
        # The finalizer lease retains these authenticated recovery helpers until
        # after the root has been atomically tombstoned.
        continue
        ;;
    esac
    state="$(jq -cer --arg path "$relative" '.[$path]' <<< "$states")" || fail
    event="$(jq -r '.event' <<< "$state")"
    [[ "$event" != "object-removed" ]] || continue
    candidate="${root}/${relative}"
    if [[ "$event" == "object-create-abandoned" ]]; then
      [[ ! -e "$candidate" && ! -L "$candidate" ]] || fail
      continue
    fi
    if [[ "$event" == "path-replaced" ]]; then
      [[ ! -e "$candidate" && ! -L "$candidate" ]] || fail
      continue
    fi
    if [[ "$event" == "object-creating" ]]; then
      [[ ! -e "$candidate" && ! -L "$candidate" ]] || fail
      details="$(
        jq -cnS \
          --argjson expected "$(jq -ce '.expected' <<< "$state")" \
          '{expected:$expected}'
      )" || fail
      current_head="$(
        append_event object-create-abandoned cleanup "$details" "$current_head"
      )" || fail
      continue
    fi
    if [[ "$event" == "object-removing" ]]; then
      identity="$(jq -ce '.identity' <<< "$state")" || fail
      quarantine_relative="$(jq -er '.quarantine' <<< "$state")" || fail
      quarantine="${root}/${quarantine_relative}"
    elif [[ "$event" == "object-created" || "$event" == "mutation-opened" ]]; then
      baseline="$(jq -ce '.baseline' <<< "$state")" || fail
      ledger_verify_creation_identity "$baseline" || fail
      identity="$(ledger_identity_json "$candidate")" || fail
      details="$(
        jq -cnS \
          --argjson baseline "$baseline" \
          --argjson identity "$identity" \
          '{baseline:$baseline,identity:$identity}'
      )" || fail
      current_head="$(
        append_event transfer-aborted cleanup "$details" "$current_head"
      )" || fail
    else
      identity="$(jq -ce '.identity' <<< "$state")" || fail
    fi
    if [[ "$event" == "path-replaced-destination" ]]; then
      details="$(ledger_closed_details "$identity")" || fail
      current_head="$(
        append_event runtime-closed cleanup "$details" "$current_head"
      )" || fail
    fi
    if [[ -e "$candidate" || -L "$candidate" ]]; then
      if [[ "$(jq -r '.type' <<< "$identity")" == "directory" ]]; then
        ledger_verify_anchor "$identity" || fail
        [[ -z "$(find "$candidate" -mindepth 1 -maxdepth 1 -print -quit)" ]] ||
          fail
        identity="$(ledger_identity_json "$candidate")" || fail
        details="$(ledger_closed_details "$identity")" || fail
        current_head="$(
          append_event cleanup-closed cleanup "$details" "$current_head"
        )" || fail
      else
        ledger_verify_identity "$identity" || fail
      fi
      ledger_new_quarantine "$candidate" quarantine || fail
      quarantine_relative="$(ledger_relative_path "$quarantine")" || fail
      details="$(
        jq -cnS \
          --arg quarantine "$quarantine_relative" \
          --argjson identity "$identity" \
          '{identity:$identity,quarantine:$quarantine}'
      )" || fail
      current_head="$(
        append_event object-removing cleanup "$details" "$current_head"
      )" || fail
    elif [[ "$event" != "object-removing" ]]; then
      fail
    fi
    ledger_quarantine_remove "$candidate" "$quarantine" "$identity" || fail
    details="$(
      jq -cnS \
        --arg path "$relative" \
        --arg quarantine "$quarantine_relative" \
        --argjson identity "$identity" \
        '{identity:$identity,path:$path,quarantine:$quarantine}'
    )" || fail
    current_head="$(
      append_event object-removed cleanup "$details" "$current_head"
    )" || fail
  done
  ledger_verify_chain_unlocked || fail
  [[ "$ledger_head" == "$current_head" ]] || fail
  [[ -d "$root" && ! -L "$root" &&
     "$(find "$root" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == \
       $'.ownership-ledger-lib\n.ownership-ledger.jsonl\n.transfer-agent\n.validation-owner.json' ]] ||
    fail
  ledger_verify_anchor "$(jq -cer '.["."].identity' <<< "$states")" || fail
  ledger_end_transaction
  if [[ "$finalizer_child" == "yes" ]]; then
    ledger_begin_transaction "$current_head" || fail
    finalize_root_locked || fail
    exit 0
  fi
  local finalizer_wait_started
  finalizer_wait_started="$(date +%s)"
  while [[ -e "$root" || -L "$root" ]]; do
    (( $(date +%s) - finalizer_wait_started < 60 )) || fail
    sleep 0.1
  done
}

watch_finalizer() {
  [[ "$#" -eq 0 ]] || fail
  finalizer_child="yes"
  prepare_finalizer_lease || fail
  finalizer_write_ready || fail
  ledger_begin_transaction || fail
  local current_head="$ledger_head"
  if [[ -d "$root" && ! -L "$root" &&
        "$(find "$root" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == \
          $'.ownership-ledger-lib\n.ownership-ledger.jsonl\n.transfer-agent\n.validation-owner.json' ]]; then
    finalize_root_locked || fail
    exit 0
  fi
  ledger_end_transaction || fail
  cleanup_transfer "$current_head" yes
}

entry_identity_live() {
  local record="${root}/state/watchdog.json"
  local identity main_pid main_start main_session
  local watcher_pid watcher_start watcher_session
  identity="$(
    jq -cse '
      [
        .[] |
        select(
          .payload.details.identity.path? == "state/watchdog.json" and
          (.payload.event |
            IN("runtime-closed","successor-lease-closed"))
        )
      ] |
      last |
      .payload.details.identity
    ' "$ledger_fd_path"
  )" || return
  ledger_verify_identity "$identity" || return
  jq -cS . "$record" | cmp --silent "$record" - || return
  main_pid="$(jq -er '.mainPid' "$record")" || return
  main_start="$(jq -er '.mainStart' "$record")" || return
  main_session="$(jq -er '.mainSession' "$record")" || return
  watcher_pid="$(jq -er '.watchdogPid' "$record")" || return
  watcher_start="$(jq -er '.watchdogStart' "$record")" || return
  watcher_session="$(jq -er '.watchdogSession' "$record")" || return
  process_identity_live "$main_pid" "$main_start" "$main_session" ||
    process_identity_live "$watcher_pid" "$watcher_start" "$watcher_session"
}

verify_successor_handoff() {
  local handoff ack successor identity
  handoff="$(jq -cse '.[-1]' "$ledger_fd_path")" || return
  jq -e '
    .payload.event == "phase-handoff" and
    .payload.phase == "run-owned" and
    .payload.previous == .payload.details.ackHead
  ' <<< "$handoff" >/dev/null || return
  ack="$(jq -er '.payload.details.ackHead' <<< "$handoff")" || return
  successor="$(
    jq -cse --arg ack "$ack" '
      [
        .[] |
        select(.payloadDigest == $ack)
      ] |
      if length == 1 then .[0] else error("ambiguous successor ack") end |
      select(
        .payload.event == "successor-lease-closed" and
        .payload.phase == "entry-preparing"
      )
    ' "$ledger_fd_path"
  )" || return
  jq -e \
    --argjson handoff "$handoff" \
    --argjson successor "$successor" '
      ($handoff.payload.details |
        {
          mainPid,mainSession,mainStart,watchdogPid,watchdogSession,
          watchdogStart
        }) ==
      ($successor.payload.details |
        {
          mainPid,mainSession,mainStart,watchdogPid,watchdogSession,
          watchdogStart
        }) and
      $handoff.payload.details.successorIdentity ==
        $successor.payload.details.identity and
      $successor.payload.details.predecessorHead ==
        $successor.payload.previous
    ' >/dev/null || return
  identity="$(jq -ce '.payload.details.identity' <<< "$successor")" || return
  ledger_verify_identity "$identity" || return
  process_identity_live \
    "$(jq -er '.payload.details.mainPid' <<< "$successor")" \
    "$(jq -er '.payload.details.mainStart' <<< "$successor")" \
    "$(jq -er '.payload.details.mainSession' <<< "$successor")" || return
  process_identity_live \
    "$(jq -er '.payload.details.watchdogPid' <<< "$successor")" \
    "$(jq -er '.payload.details.watchdogStart' <<< "$successor")" \
    "$(jq -er '.payload.details.watchdogSession' <<< "$successor")"
}

watch_transfer() {
  [[ "$#" -eq 0 ]] || fail
  local self_start self_session
  self_start="$(awk '{print $22}' "/proc/$$/stat")" || fail
  self_session="$(ps -o sid= -p "$$" | tr -d '[:space:]')" || fail
  [[ "$self_session" == "$$" ]] || fail
  local record="${root}/.transfer-watchdog.json"
  [[ ! -e "$record" && ! -L "$record" ]] || fail
  local current_head="$expected_head"
  local expected details identity deadline
  deadline="$(
    jq -rs '[
      .[].payload.details.deadline? |
      select(type == "string" and test("^[1-9][0-9]{9}$"))
    ] | last // empty' "$ledger_fd_path"
  )" || fail
  [[ "$deadline" =~ ^[1-9][0-9]{9}$ ]] || fail
  expected="$(
    jq -cnS \
      --arg path ".transfer-watchdog.json" \
      '{digest:null,gid:"0",links:"1",mode:"400",path:$path,
        size:null,type:"file",uid:"0"}'
  )"
  local parent_identity baseline
  parent_identity="$(ledger_identity_json "${record%/*}")" || fail
  details="$(
    jq -cnS \
      --argjson expected "$expected" \
      --argjson parentIdentity "$parent_identity" \
      '{absent:true,expected:$expected,parentIdentity:$parentIdentity}'
  )"
  current_head="$(
    append_event object-creating transfer "$details" "$current_head"
  )" || fail
  (
    set -o noclobber
    jq -cnS \
      --arg deadline "$deadline" \
      --arg ledgerHead "$current_head" \
      --arg markerDigest "$marker_digest" \
      --arg runId "$run_id" \
      --arg selfPid "$$" \
      --arg selfSession "$self_session" \
      --arg selfStart "$self_start" \
      '{
        deadline:$deadline,
        ledgerHead:$ledgerHead,
        markerDigest:$markerDigest,
        runId:$runId,
        schemaVersion:"operations-validation-transfer-watchdog-v1",
        watchdogPid:$selfPid,
        watchdogSession:$selfSession,
        watchdogStart:$selfStart
      }' > "$record"
  )
  chmod 0400 "$record"
  chown 0:0 "$record"
  sync -f -- "$record"
  ledger_fsync_parent "$record" || fail
  baseline="$(ledger_identity_json "$record")" || fail
  details="$(
    jq -cnS \
      --argjson baseline "$baseline" \
      --argjson expected "$expected" \
      '{baseline:$baseline,expected:$expected}'
  )" || fail
  current_head="$(
    append_event object-created transfer "$details" "$current_head"
  )" || fail
  identity="$(ledger_identity_json "$record")" || fail
  details="$(ledger_closed_details "$identity")"
  current_head="$(
    append_event watchdog-closed transfer "$details" "$current_head"
  )" || fail
  while true; do
    ledger_verify_chain || exit 1
    local phase deadline tail_record cancel_details cancel_head
    tail_record="$(tail -n 1 "$ledger_fd_path")" || exit 1
    if jq -e \
      --arg head "$ledger_head" \
      --argjson identity "$identity" '
        .payloadDigest == $head and
        .payload.event == "transfer-watchdog-cancel-requested" and
        .payload.phase == "transfer" and
        .payload.details == {watchdogIdentity:$identity}
      ' <<< "$tail_record" >/dev/null; then
      ledger_verify_identity "$identity" || exit 1
      cancel_details="$(
        jq -cnS \
          --arg requestHead "$ledger_head" \
          --argjson watchdogIdentity "$identity" \
          '{
            requestHead:$requestHead,
            watchdogIdentity:$watchdogIdentity
          }'
      )" || exit 1
      cancel_head="$(
        append_event transfer-watchdog-cancel-closed transfer \
          "$cancel_details" "$ledger_head"
      )" || exit 1
      ledger_verify_chain || exit 1
      [[ "$ledger_head" == "$cancel_head" ]] || exit 1
      exit 0
    fi
    phase="$(
      jq -rs '.[-1].payload.phase' "$ledger_fd_path"
    )" || exit 1
    if [[ "$phase" == "run-owned" ]]; then
      verify_successor_handoff || exit 1
      exit 0
    fi
    deadline="$(
      jq -rs '[
        .[].payload.details.deadline? |
        select(type == "string" and test("^[1-9][0-9]{9}$"))
      ] | last // empty' "$ledger_fd_path"
    )" || exit 1
    if [[ -n "$deadline" && "$(date +%s)" -ge "$deadline" ]]; then
      if [[ "$phase" == "entry-preparing" ]] && entry_identity_live; then
        sleep 2
        continue
      fi
      cleanup_transfer
      exit
    fi
    sleep 2
  done
}

handoff_run_owned() {
  [[ "$#" -eq 9 ]] || fail
  local deadline="$1"
  local successor_identity="$2"
  local main_pid="$3"
  local main_start="$4"
  local main_session="$5"
  local watcher_pid="$6"
  local watcher_start="$7"
  local watcher_session="$8"
  local ack_head="$9"
  [[ "$deadline" =~ ^[1-9][0-9]{9}$ &&
     "$main_pid" =~ ^[1-9][0-9]*$ &&
     "$main_start" =~ ^[1-9][0-9]*$ &&
     "$main_session" =~ ^[1-9][0-9]*$ &&
     "$watcher_pid" =~ ^[1-9][0-9]*$ &&
     "$watcher_start" =~ ^[1-9][0-9]*$ &&
     "$watcher_session" =~ ^[1-9][0-9]*$ &&
     "$ack_head" =~ ^sha256:[0-9a-f]{64}$ &&
     "$expected_head" == "$ack_head" ]] || fail
  successor_identity="$(jq -ceS '
    type == "object" and
    .path == "state/watchdog.json"
  ' <<< "$successor_identity")" || fail
  ledger_verify_identity "$successor_identity" || fail
  process_identity_live "$main_pid" "$main_start" "$main_session" || fail
  process_identity_live "$watcher_pid" "$watcher_start" "$watcher_session" ||
    fail
  local successor
  successor="$(jq -cse --arg ack "$ack_head" '[
    .[] | select(.payloadDigest == $ack)
  ] | if length == 1 then .[0] else error("successor ack missing") end' \
    "$ledger_fd_path")" || fail
  jq -e \
    --arg mainPid "$main_pid" \
    --arg mainSession "$main_session" \
    --arg mainStart "$main_start" \
    --arg predecessorHead "$(jq -er '.payload.previous' <<< "$successor")" \
    --arg watchdogPid "$watcher_pid" \
    --arg watchdogSession "$watcher_session" \
    --arg watchdogStart "$watcher_start" \
    --argjson identity "$successor_identity" '
      .payload.event == "successor-lease-closed" and
      .payload.phase == "entry-preparing" and
      .payload.details == {
        identity:$identity,
        mainPid:$mainPid,
        mainSession:$mainSession,
        mainStart:$mainStart,
        predecessorHead:$predecessorHead,
        watchdogPid:$watchdogPid,
        watchdogSession:$watchdogSession,
        watchdogStart:$watchdogStart
      }
    ' <<< "$successor" >/dev/null || fail
  local details current_head
  details="$(
    jq -cnS \
      --arg ackHead "$ack_head" \
      --arg deadline "$deadline" \
      --arg mainPid "$main_pid" \
      --arg mainSession "$main_session" \
      --arg mainStart "$main_start" \
      --arg watchdogPid "$watcher_pid" \
      --arg watchdogSession "$watcher_session" \
      --arg watchdogStart "$watcher_start" \
      --argjson successorIdentity "$successor_identity" \
      '{
        ackHead:$ackHead,
        deadline:$deadline,
        mainPid:$mainPid,
        mainSession:$mainSession,
        mainStart:$mainStart,
        successorIdentity:$successorIdentity,
        watchdogPid:$watchdogPid,
        watchdogSession:$watchdogSession,
        watchdogStart:$watchdogStart
      }'
  )"
  current_head="$(
    append_event phase-handoff run-owned "$details" "$ack_head"
  )" || fail
  jq -cnS --arg ledgerHead "$current_head" \
    '{ledgerHead:$ledgerHead,status:"run-owned"}'
}

verify_authority || fail
if [[ "$operation" != "finalizer" ]]; then
  verify_head "$expected_head" || fail
fi
case "$operation" in
  cleanup)
    cleanup_transfer "$@"
    jq -cnS '{rootAbsent:true,status:"succeeded"}'
    ;;
  handoff)
    handoff_run_owned "$@"
    ;;
  receive)
    receive_file "$@"
    ;;
  watchdog)
    watch_transfer "$@"
    ;;
  finalizer)
    watch_finalizer "$@"
    ;;
  *)
    fail
    ;;
esac
