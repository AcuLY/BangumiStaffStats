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
readonly project="bgmss_ops_validation"
readonly input="${root}/incoming/validation-input-v1.json"
readonly marker="${root}/.validation-owner.json"
readonly ledger="${root}/.ownership-ledger.jsonl"
readonly library="${root}/.ownership-ledger-lib"
readonly agent="${root}/.transfer-agent"
readonly lock_file="${root}/validation.lock"
readonly state_root="${root}/state"
readonly evidence_root="${root}/evidence"
readonly data_root="${root}/data"
readonly container_records="${state_root}/containers.jsonl"
readonly network_records="${state_root}/networks.jsonl"
readonly image_records="${state_root}/images.jsonl"
readonly command_records="${evidence_root}/commands.jsonl"
readonly residue_records="${evidence_root}/residue.txt"
readonly frontend_listing="${evidence_root}/frontend.list"
readonly frontend_verbose="${evidence_root}/frontend.verbose"
readonly watchdog_record="${state_root}/watchdog.json"
readonly maximum_output=4194304

mode="run"
case "${1:-}" in
  --recover)
    mode="recover"
    shift
    ;;
  --watchdog)
    mode="watchdog"
    shift
    ;;
esac
if [[ "$mode" == "watchdog" ]]; then
  [[ "$#" -eq 8 ]] || exit 64
else
  [[ "$#" -eq 4 ]] || exit 64
fi
readonly run_id="$1"
readonly input_digest="$2"
readonly marker_digest="$3"
readonly expected_ledger_head="$4"
[[ "$run_id" =~ ^run-[0-9a-f]{32}$ ]] || exit 64
[[ "$input_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 64
[[ "$marker_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 64
[[ "$expected_ledger_head" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 64
if [[ "$mode" == "watchdog" ]]; then
  readonly watchdog_main_pid="$5"
  readonly watchdog_main_start="$6"
  readonly watchdog_main_session="$7"
  readonly watchdog_entry_digest="$8"
  [[ "$watchdog_main_pid" =~ ^[1-9][0-9]*$ &&
     "$watchdog_main_start" =~ ^[1-9][0-9]*$ &&
     "$watchdog_main_session" =~ ^[1-9][0-9]*$ &&
     "$watchdog_entry_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 64
else
  readonly watchdog_main_pid=""
  readonly watchdog_main_start=""
  readonly watchdog_main_session=""
  readonly watchdog_entry_digest=""
fi

primary_error=""
declare -a secondary_errors=()
primary_status="failed"
rollback_status="not-needed"
cleanup_status="not-needed"
cleanup_root_absent="false"
cleanup_zero_residue="false"
named_volumes_never_observed="true"
path_cleanup_prepared="false"
cleanup_resuming="false"
cleanup_lock_fd=""
cleanup_lock_held="false"
finishing="no"
watcher_pid=""
watcher_start=""
watcher_session=""
main_start=""
main_session=""
minimal_health="null"
full_health="null"
rolled_back_health="null"
reactivated_health="null"
producer_json="null"
continuous_health_json="null"
continuous_health_unverified_json="null"
security_projection_json="null"
security_projection_digest="null"
recorded_health_json="null"
created_updater_id=""
continuous_sample_count=0
continuous_previous_digest=""
continuous_first_digest=""
continuous_last_digest=""
continuous_started_epoch=""
continuous_started_monotonic=""
continuous_ended_epoch=""
continuous_ended_monotonic=""
archive_corruption_rejected="null"
frontend_rollback="null"
lock_contention_rejected="null"
post_switch_rollback="null"
updater_failure="null"
resources_json=""
commands_json_cache="[]"
residues_json_cache="[]"
resource_cleanup_safe="true"
ledger_current_head="$expected_ledger_head"
ledger_phase="entry-preparing"
candidate_version=""
minimal_data=""
full_data=""
api_load_reference=""
api_validation_alias=""
prometheus_reference=""
prometheus_validation_alias=""
updater_load_reference=""
updater_validation_alias=""
pointer_transaction_armed="false"
pointer_transaction_file="${state_root}/pointer-transaction.json"
library_authority_fd=""
library_fd_path=""
agent_authority_fd=""
agent_fd_path=""
entry_authority_fd=""
entry_fd_path=""

set_primary() {
  local code="$1"
  [[ "$code" =~ ^[A-Z][A-Z0-9_]{1,63}$ ]] || code="VALIDATION_FAILED"
  if [[ -z "$primary_error" ]]; then
    primary_error="$code"
  fi
}

add_secondary() {
  local code="$1"
  [[ "$code" =~ ^[A-Z][A-Z0-9_]{1,63}$ ]] || code="SECONDARY_FAILURE"
  local observed
  for observed in "${secondary_errors[@]:-}"; do
    [[ "$observed" == "$code" ]] && return
  done
  secondary_errors+=("$code")
}

fail() {
  set_primary "$1"
  return 1
}

sha_file() {
  printf 'sha256:%s\n' "$(sha256sum -- "$1" | awk '{print $1}')"
}

open_authority_fd() {
  local candidate="$1"
  local expected_state="$2"
  local expected_digest="$3"
  local output_fd="$4"
  local output_path="$5"
  local descriptor fd_state path_state
  [[ "$output_fd" =~ ^[A-Za-z_][A-Za-z0-9_]*$ &&
     "$output_path" =~ ^[A-Za-z_][A-Za-z0-9_]*$ &&
     -f "$candidate" && ! -L "$candidate" ]] || return 1
  exec {descriptor}<"$candidate" || return
  fd_state="$(
    stat -Lc '%d:%i:%u:%g:%h:%a:%F' "/proc/self/fd/${descriptor}"
  )" || return
  path_state="$(stat -Lc '%d:%i:%u:%g:%h:%a:%F' "$candidate")" || return
  [[ "$fd_state" == "$path_state" &&
     "${fd_state#*:*:}" == "${expected_state}:regular file" &&
     "$(sha_file "/proc/self/fd/${descriptor}")" == "$expected_digest" ]] ||
    return 1
  printf -v "$output_fd" '%s' "$descriptor"
  printf -v "$output_path" '%s' "/proc/self/fd/${descriptor}"
}

verify_owner() {
  [[ "$(id -u)" == "0" && -d "$root" && ! -L "$root" &&
     "$(stat -c '%u:%g:%a' -- "$root")" == "0:0:700" ]] ||
    return 1
  [[ -f "$marker" && ! -L "$marker" &&
     "$(stat -c '%u:%g:%h:%a' -- "$marker")" == "0:0:1:400" &&
     "$(sha_file "$marker")" == "$marker_digest" ]] || return 1
  [[ -f "$library" && ! -L "$library" &&
     "$(stat -c '%u:%g:%h:%a' -- "$library")" == "0:0:1:500" &&
     -f "$agent" && ! -L "$agent" &&
     "$(stat -c '%u:%g:%h:%a' -- "$agent")" == "0:0:1:500" &&
     -f "$ledger" && ! -L "$ledger" &&
     "$(stat -c '%u:%g:%h:%a' -- "$ledger")" == "0:0:1:600" ]] ||
    return 1
  jq -cS . "$marker" | cmp --silent "$marker" - || return 1
  jq -e \
    --arg agentDigest "$(sha_file "$agent")" \
    --arg input "$input_digest" \
    --arg ledgerDevice "$(stat -c '%d' -- "$ledger")" \
    --arg ledgerInode "$(stat -c '%i' -- "$ledger")" \
    --arg libraryDigest "$(sha_file "$library")" \
    --arg run "$run_id" \
    --arg device "$(stat -c '%d' -- "$root")" \
    --arg inode "$(stat -c '%i' -- "$root")" '
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
      .inputDigest == $input and
      .ledgerDevice == $ledgerDevice and
      .ledgerInode == $ledgerInode and
      .libraryDigest == $libraryDigest and
      (.ownershipNonce |
        type == "string" and test("^sha256:[0-9a-f]{64}$")) and
      .runId == $run and
      .rootDevice == $device and
      .rootInode == $inode
    ' "$marker" >/dev/null
}

verify_input() {
  [[ -f "$input" && ! -L "$input" &&
     "$(stat -c '%u:%g:%h:%a' -- "$input")" == "0:0:1:400" &&
     "$(sha_file "$input")" == "$input_digest" ]] || return 1
  jq -cS . "$input" | cmp --silent "$input" - || return 1
  jq -e --arg run "$run_id" '
    .schemaVersion == "operations-validation-input-v1" and
    .runId == $run and
    .remote.root == "/srv/bgmss-ops-validation" and
    .remote.project == "bgmss_ops_validation" and
    .remote.apiBind == "127.0.0.1:19090:8080" and
    .remote.outboundEgress == true and
    .remote.networks == [
      "bgmss_ops_validation_outbound",
      "bgmss_ops_validation_runtime"
    ] and
    .remote.services == ["api","prometheus","updater"] and
    .states == {
      deployed:false,
      productionActivated:false,
      released:false
    } and
    .transfer.fileCount == 18 and
    (.transfer.files | length) == 18
  ' "$input" >/dev/null
}

process_start_time() {
  local pid="$1"
  [[ "$pid" =~ ^[1-9][0-9]*$ && -r "/proc/${pid}/stat" ]] || return 1
  awk '{print $22}' "/proc/${pid}/stat"
}

process_session_id() {
  local pid="$1"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
  ps -o sid= -p "$pid" | tr -d '[:space:]'
}

process_identity_live() {
  local pid="$1"
  local start="$2"
  local session="$3"
  [[ "$pid" =~ ^[1-9][0-9]*$ &&
     "$start" =~ ^[1-9][0-9]*$ &&
     "$session" =~ ^[1-9][0-9]*$ &&
     "$(process_start_time "$pid")" == "$start" &&
     "$(process_session_id "$pid")" == "$session" ]]
}

verify_watchdog_self_record() {
  [[ -f "$watchdog_record" && ! -L "$watchdog_record" &&
     "$(stat -c '%u:%g:%h:%a' -- "$watchdog_record")" == "0:0:1:400" ]] ||
    return 1
  jq -cS . "$watchdog_record" | cmp --silent "$watchdog_record" - || return 1
  jq -e \
    --arg entryDigest "$watchdog_entry_digest" \
    --arg mainPid "$watchdog_main_pid" \
    --arg mainSession "$watchdog_main_session" \
    --arg mainStart "$watchdog_main_start" \
    --arg runId "$run_id" \
    --arg selfPid "$$" \
    --arg selfSession "$(process_session_id "$$")" \
    --arg selfStart "$(process_start_time "$$")" '
      type == "object" and
      (keys == [
        "entryDigest",
        "mainPid",
        "mainSession",
        "mainStart",
        "runId",
        "schemaVersion",
        "watchdogPid",
        "watchdogSession",
        "watchdogStart"
      ]) and
      .schemaVersion == "operations-validation-watchdog-v1" and
      .entryDigest == $entryDigest and
      .mainPid == $mainPid and
      .mainSession == $mainSession and
      .mainStart == $mainStart and
      .runId == $runId and
      .watchdogPid == $selfPid and
      .watchdogSession == $selfSession and
      .watchdogStart == $selfStart and
      .watchdogSession == .watchdogPid and
      .watchdogSession != .mainSession
    ' "$watchdog_record" >/dev/null
}

role_path() {
  local role="$1"
  local identifier
  identifier="$(jq -er --arg role "$role" \
    '.transfer.files[] | select(.role == $role) | .id' "$input")" || return
  [[ "$identifier" =~ ^f[0-9]{4}$ ]] || return
  printf '%s/incoming/files/%s\n' "$root" "$identifier"
}

ledger_append_entry() {
  local event="$1"
  local details="$2"
  ledger_current_head="$(
    ledger_append "$event" "$ledger_phase" "$details" "$ledger_current_head"
  )"
}

runtime_latest_state() {
  local relative="$1"
  jq -cse \
    --arg path "$relative" '
      [
        .[] |
        select(
          .payload.details.identity.path? == $path or
          .payload.details.baseline.path? == $path or
          .payload.details.expected.path? == $path
        )
      ] |
      last
    ' "$ledger_fd_path"
}

runtime_state_identity() {
  local relative="$1"
  local state event
  state="$(runtime_latest_state "$relative")" || return
  event="$(jq -er '.payload.event' <<< "$state")" || return
  case "$event" in
    mutation-opened|object-created)
      jq -ce '.payload.details.baseline' <<< "$state"
      ;;
    bootstrap-closed|cleanup-closed|object-removing|runtime-closed|\
    transfer-aborted|transfer-closed|watchdog-closed)
      jq -ce '.payload.details.identity' <<< "$state"
      ;;
    *)
      return 1
      ;;
  esac
}

runtime_intent() {
  local candidate="$1"
  local type="$2"
  local mode_value="$3"
  local uid="$4"
  local gid="$5"
  [[ ! -e "$candidate" && ! -L "$candidate" ]] || return 1
  local relative parent parent_identity expected details
  local normalized_mode
  normalized_mode="$(printf '%o' "$((8#${mode_value}))")" || return
  relative="$(ledger_relative_path "$candidate")" || return
  parent="${candidate%/*}"
  [[ "$parent" != "$candidate" && -d "$parent" && ! -L "$parent" ]] || return 1
  parent_identity="$(ledger_identity_json "$parent")" || return
  expected="$(
    jq -cnS \
      --arg gid "$gid" \
      --arg mode "$normalized_mode" \
      --arg path "$relative" \
      --arg type "$type" \
      --arg uid "$uid" \
      '{
        digest:null,
        gid:$gid,
        links:null,
        mode:$mode,
        path:$path,
        size:null,
        type:$type,
        uid:$uid
      }'
  )" || return
  details="$(
    jq -cnS \
      --argjson expected "$expected" \
      --argjson parentIdentity "$parent_identity" \
      '{absent:true,expected:$expected,parentIdentity:$parentIdentity}'
  )" || return
  ledger_append_entry object-creating "$details"
}

runtime_register_created() {
  local candidate="$1"
  local relative state expected identity details
  relative="$(ledger_relative_path "$candidate")" || return
  state="$(runtime_latest_state "$relative")" || return
  [[ "$(jq -er '.payload.event' <<< "$state")" == "object-creating" ]] ||
    return 1
  expected="$(jq -ce '.payload.details.expected' <<< "$state")" || return
  identity="$(ledger_identity_json "$candidate")" || return
  jq -e \
    --argjson expected "$expected" \
    --argjson identity "$identity" '
      $identity.gid == $expected.gid and
      $identity.mode == $expected.mode and
      $identity.path == $expected.path and
      $identity.type == $expected.type and
      $identity.uid == $expected.uid
    ' >/dev/null || return
  details="$(
    jq -cnS \
      --argjson baseline "$identity" \
      --argjson expected "$expected" \
      '{baseline:$baseline,expected:$expected}'
  )" || return
  ledger_append_entry object-created "$details" || return
  details="$(ledger_closed_details "$identity")" || return
  ledger_append_entry runtime-closed "$details"
}

runtime_create_directory() {
  local candidate="$1"
  local mode_value="$2"
  local uid="$3"
  local gid="$4"
  runtime_intent "$candidate" directory "$mode_value" "$uid" "$gid" || return
  mkdir -m "${mode_value#0}" -- "$candidate" || return
  chown "${uid}:${gid}" -- "$candidate" || return
  runtime_register_created "$candidate"
}

runtime_create_file() {
  local candidate="$1"
  local mode_value="$2"
  local uid="$3"
  local gid="$4"
  local mutable="${5:-no}"
  runtime_intent "$candidate" file "$mode_value" "$uid" "$gid" || return
  (
    set -o noclobber
    : > "$candidate"
  ) || return
  chmod "${mode_value#0}" -- "$candidate" || return
  chown "${uid}:${gid}" -- "$candidate" || return
  runtime_register_created "$candidate" || return
  [[ "$mutable" == "yes" ]] && runtime_open_mutation "$candidate"
}

runtime_install_file() {
  local source="$1"
  local candidate="$2"
  local mode_value="$3"
  local uid="$4"
  local gid="$5"
  [[ -f "$source" && ! -L "$source" ]] || return 1
  runtime_intent "$candidate" file "$mode_value" "$uid" "$gid" || return
  install -m "${mode_value#0}" -o "$uid" -g "$gid" -- "$source" "$candidate" ||
    return
  runtime_register_created "$candidate"
}

runtime_open_mutation() {
  local candidate="$1"
  local relative baseline details
  relative="$(ledger_relative_path "$candidate")" || return
  baseline="$(runtime_state_identity "$relative")" || return
  ledger_verify_identity "$baseline" || return
  details="$(jq -cnS --argjson baseline "$baseline" '{baseline:$baseline}')" ||
    return
  ledger_append_entry mutation-opened "$details"
}

runtime_close_object() {
  local candidate="$1"
  local relative baseline identity details
  relative="$(ledger_relative_path "$candidate")" || return
  baseline="$(runtime_state_identity "$relative")" || return
  ledger_verify_core "$baseline" || return
  identity="$(ledger_identity_json "$candidate")" || return
  details="$(ledger_closed_details "$identity")" || return
  ledger_append_entry runtime-closed "$details"
}

runtime_change_metadata() {
  local candidate="$1"
  local mode_value="$2"
  local uid="$3"
  local gid="$4"
  local relative before normalized_mode details after type
  relative="$(ledger_relative_path "$candidate")" || return
  before="$(runtime_state_identity "$relative")" || return
  type="$(jq -er '.type' <<< "$before")" || return
  if [[ "$type" == "directory" ]]; then
    ledger_verify_anchor "$before" || return
    before="$(ledger_identity_json "$candidate")" || return
    details="$(ledger_closed_details "$before")" || return
    ledger_append_entry cleanup-closed "$details" || return
  else
    ledger_verify_identity "$before" || return
  fi
  normalized_mode="$(printf '%o' "$((8#${mode_value}))")" || return
  details="$(
    jq -cnS \
      --arg gid "$gid" \
      --arg mode "$normalized_mode" \
      --arg uid "$uid" \
      --argjson before "$before" \
      '{before:$before,expected:{gid:$gid,mode:$mode,uid:$uid}}'
  )" || return
  ledger_append_entry metadata-change-creating "$details" || return
  chmod "${mode_value#0}" -- "$candidate" || return
  chown "${uid}:${gid}" -- "$candidate" || return
  after="$(ledger_identity_json "$candidate")" || return
  jq -e \
    --arg gid "$gid" \
    --arg mode "$normalized_mode" \
    --arg uid "$uid" \
    --argjson after "$after" \
    --argjson before "$before" '
      ($after | {device,inode,links,path,type}) ==
        ($before | {device,inode,links,path,type}) and
      $after.gid == $gid and
      $after.mode == $mode and
      $after.uid == $uid
    ' >/dev/null || return
  details="$(ledger_closed_details "$after")" || return
  ledger_append_entry runtime-closed "$details"
}

runtime_create_symlink() {
  local target="$1"
  local candidate="$2"
  runtime_intent "$candidate" symlink 0777 0 0 || return
  ln -s -- "$target" "$candidate" || return
  runtime_register_created "$candidate"
}

runtime_replace_owned() {
  local source="$1"
  local destination="$2"
  local source_relative destination_relative source_identity
  local details moved_identity
  source_relative="$(ledger_relative_path "$source")" || return
  destination_relative="$(ledger_relative_path "$destination")" || return
  source_identity="$(runtime_state_identity "$source_relative")" || return
  ledger_verify_identity "$source_identity" || return
  if [[ -e "$destination" || -L "$destination" ]]; then
    runtime_remove_owned "$destination" || return
  fi
  [[ ! -e "$destination" && ! -L "$destination" ]] || return 1
  ledger_verify_identity "$source_identity" || return
  details="$(
    jq -cnS \
      --arg destination "$destination_relative" \
      --argjson sourceIdentity "$source_identity" \
      '{
        destination:$destination,
        previousDestination:null,
        sourceIdentity:$sourceIdentity
      }'
  )" || return
  ledger_append_entry path-replace-creating "$details" || return
  ledger_verify_identity "$source_identity" || return
  mv -T --no-clobber -- "$source" "$destination" || return
  ledger_fsync_parent "$destination" || return
  if [[ "${source%/*}" != "${destination%/*}" ]]; then
    ledger_fsync_parent "$source" || return
  fi
  moved_identity="$(ledger_identity_json "$destination")" || return
  jq -e \
    --argjson moved "$moved_identity" \
    --argjson source "$source_identity" '
      ($moved | {device,digest,gid,inode,links,mode,size,type,uid}) ==
      ($source | {device,digest,gid,inode,links,mode,size,type,uid})
    ' >/dev/null || return
  details="$(
    jq -cnS \
      --arg destination "$destination_relative" \
      --argjson movedIdentity "$moved_identity" \
      --argjson sourceIdentity "$source_identity" \
      '{
        destination:$destination,
        movedIdentity:$movedIdentity,
        sourceIdentity:$sourceIdentity
      }'
  )" || return
  ledger_append_entry path-replaced "$details" || return
  details="$(ledger_closed_details "$moved_identity")" || return
  ledger_append_entry runtime-closed "$details"
}

runtime_remove_owned() {
  local candidate="$1"
  local relative identity quarantine quarantine_relative details type
  relative="$(ledger_relative_path "$candidate")" || return
  identity="$(runtime_state_identity "$relative")" || return
  type="$(jq -er '.type' <<< "$identity")" || return
  if [[ "$type" == "directory" ]]; then
    ledger_verify_anchor "$identity" || return
    [[ -z "$(find "$candidate" -mindepth 1 -maxdepth 1 -print -quit)" ]] ||
      return 1
    identity="$(ledger_identity_json "$candidate")" || return
    details="$(ledger_closed_details "$identity")" || return
    ledger_append_entry cleanup-closed "$details" || return
  else
    ledger_verify_identity "$identity" || return
  fi
  ledger_new_quarantine "$candidate" quarantine || return
  quarantine_relative="$(ledger_relative_path "$quarantine")" || return
  details="$(
    jq -cnS \
      --arg quarantine "$quarantine_relative" \
      --argjson identity "$identity" \
      '{identity:$identity,quarantine:$quarantine}'
  )" || return
  ledger_append_entry object-removing "$details" || return
  ledger_quarantine_remove "$candidate" "$quarantine" "$identity" || return
  details="$(
    jq -cnS \
      --arg path "$relative" \
      --arg quarantine "$quarantine_relative" \
      --argjson identity "$identity" \
      '{identity:$identity,path:$path,quarantine:$quarantine}'
  )" || return
  ledger_append_entry object-removed "$details"
}

runtime_tree_intent() {
  local archive="$1"
  local tree_root="$2"
  local listing="$3"
  [[ -f "$archive" && ! -L "$archive" &&
     -f "$listing" && ! -L "$listing" &&
     ! -e "$tree_root" && ! -L "$tree_root" ]] || return 1
  local parent_identity archive_identity details
  parent_identity="$(ledger_identity_json "${tree_root%/*}")" || return
  archive_identity="$(ledger_identity_json "$archive")" || return
  ledger_verify_identity "$archive_identity" || return
  details="$(
    jq -cnS \
      --arg memberInventoryDigest "$(ledger_sha_file "$listing")" \
      --arg treeRoot "$(ledger_relative_path "$tree_root")" \
      --argjson archiveIdentity "$archive_identity" \
      --argjson parentIdentity "$parent_identity" \
      '{
        archiveIdentity:$archiveIdentity,
        memberInventoryDigest:$memberInventoryDigest,
        parentIdentity:$parentIdentity,
        treeRoot:$treeRoot
      }'
  )" || return
  ledger_append_entry tree-creating "$details"
}

runtime_register_tree() {
  local tree_root="$1"
  [[ -d "$tree_root" && ! -L "$tree_root" ]] || return 1
  local candidate identity details
  while IFS= read -r -d '' candidate; do
    identity="$(ledger_identity_json "$candidate")" || return
    details="$(
      jq -cnS \
        --argjson baseline "$identity" \
        '{baseline:$baseline,treeCreation:true}'
    )" || return
    ledger_append_entry object-created "$details" || return
    details="$(ledger_closed_details "$identity")" || return
    ledger_append_entry runtime-closed "$details" || return
  done < <(
    {
      printf '%s\0' "$tree_root"
      find "$tree_root" -mindepth 1 -print0
    } | sort -z
  )
}

runtime_namespace_intent() {
  local name="$1"
  local candidate="$2"
  local actor="$3"
  local identity details
  identity="$(ledger_identity_json "$candidate")" || return
  details="$(
    jq -cnS \
      --arg name "$name" \
      --argjson actor "$actor" \
      --argjson namespaceIdentity "$identity" \
      '{actor:$actor,name:$name,namespaceIdentity:$namespaceIdentity}'
  )" || return
  ledger_append_entry namespace-creating "$details"
}

runtime_register_namespace_object() {
  local name="$1"
  local candidate="$2"
  local identity details
  identity="$(ledger_identity_json "$candidate")" || return
  details="$(
    jq -cnS \
      --arg namespace "$name" \
      --argjson baseline "$identity" \
      '{baseline:$baseline,namespace:$namespace}'
  )" || return
  ledger_append_entry object-created "$details" || return
  details="$(ledger_closed_details "$identity")" || return
  ledger_append_entry runtime-closed "$details"
}

runtime_close_namespace_tree() {
  local name="$1"
  local tree_root="$2"
  jq -se \
    --arg name "$name" '
      any(.[];
        .payload.event == "namespace-creating" and
        .payload.details.name? == $name
      )
    ' "$ledger_fd_path" >/dev/null || return
  local candidate relative identity
  while IFS= read -r -d '' candidate; do
    [[ ( -f "$candidate" && ! -L "$candidate" &&
         "$(stat -c '%h' -- "$candidate")" == "1" ) ||
       ( -d "$candidate" && ! -L "$candidate" ) ]] || return 1
    relative="$(ledger_relative_path "$candidate")" || return
    if identity="$(runtime_state_identity "$relative" 2>/dev/null)"; then
      ledger_verify_core "$identity" || return
      continue
    fi
    runtime_register_namespace_object "$name" "$candidate" || return
  done < <(find "$tree_root" -mindepth 1 -print0 | sort -z)
}

ledger_resource_event() {
  local event="$1"
  local kind="$2"
  local identity="$3"
  local details
  details="$(
    jq -cnS \
      --arg kind "$kind" \
      --argjson resourceIdentity "$identity" \
      '{kind:$kind,resourceIdentity:$resourceIdentity}'
  )" || return
  ledger_append_entry "$event" "$details"
}

ledger_resource_state() {
  local kind="$1"
  local identity="$2"
  jq -rse \
    --arg kind "$kind" \
    --argjson identity "$identity" '
      [
        .[] |
        select(
          .payload.details.kind? == $kind and
          .payload.details.resourceIdentity? == $identity
        )
      ] |
      last |
      .payload.event
    ' "$ledger_fd_path"
}

argv_json() {
  local result="[]" argument
  for argument in "$@"; do
    result="$(
      jq -cnS \
        --arg value "$argument" \
        --argjson result "$result" \
        '$result + [$value]'
    )" || return
  done
  printf '%s\n' "$result"
}

validate_command_invocation() {
  local id="$1"
  shift
  local -a actual=("$@")
  local -a expected_actual=()
  local -a expected_logical=()
  local minimal_manifest=""
  case "$id" in
    image-load-api)
      expected_actual=(docker load --input "$(role_path api-image)")
      expected_logical=(docker load --input '@api-oci')
      ;;
    image-load-updater)
      expected_actual=(docker load --input "$(role_path updater-image)")
      expected_logical=(docker load --input '@updater-oci')
      ;;
    image-pull-prometheus)
      expected_actual=(
        docker pull --platform linux/amd64 "$prometheus_ref"
      )
      expected_logical=(
        docker pull --platform linux/amd64 '@prometheus-reference'
      )
      ;;
    compose-config)
      expected_actual=("${compose[@]}" config --quiet)
      expected_logical=(
        docker compose '@sealed-compose' config --quiet
      )
      ;;
    compose-create)
      expected_actual=(
        "${compose[@]}" --profile oneshot create --no-build --no-recreate
        api prometheus
      )
      expected_logical=(
        docker compose '@sealed-compose' --profile oneshot create
        --no-build --no-recreate api prometheus
      )
      ;;
    compose-start-api)
      expected_actual=("${compose[@]}" start api)
      expected_logical=(docker compose '@sealed-compose' start api)
      ;;
    compose-start-prometheus)
      expected_actual=("${compose[@]}" start prometheus)
      expected_logical=(docker compose '@sealed-compose' start prometheus)
      ;;
    frontend-install)
      expected_actual=(frontend_install_command)
      expected_logical=(
        internal frontend-install '@frontend-archive' '@release-root'
      )
      ;;
    frontend-hash)
      expected_actual=(frontend_hash_command)
      expected_logical=(
        internal frontend-tree-hash '@frontend-root'
      )
      ;;
    frontend-rollback)
      expected_actual=(frontend_rollback_command)
      expected_logical=(
        internal frontend-switch-failure-rollback '@frontend-link'
      )
      ;;
    minimal-health)
      minimal_manifest="$(jq -er '.minimalArchive.manifestDigest' "$input")" ||
        return
      expected_actual=(
        health_state_command "$minimal_data" "$minimal_manifest" minimal
      )
      expected_logical=(
        internal capture-health-state '@minimal-data-version'
      )
      ;;
    updater-doctor)
      expected_actual=(docker start --attach "$doctor_id")
      expected_logical=(
        docker start --attach '@updater-doctor-container'
      )
      ;;
    updater-contract)
      expected_actual=(docker start --attach "$contract_id")
      expected_logical=(
        docker start --attach '@updater-contract-container'
      )
      ;;
    updater-intentional-failure)
      expected_actual=(docker start --attach "$bad_id")
      expected_logical=(
        docker start --attach '@updater-failure-container'
      )
      ;;
    updater-produce)
      expected_actual=(
        timeout --signal=TERM --kill-after=30s 21600
        nice -n 10 ionice -c 3 docker start --attach "$produce_id"
      )
      expected_logical=(
        timeout --signal=TERM --kill-after=30s 21600
        nice -n 10 ionice -c 3 docker start --attach
        '@updater-produce-container'
      )
      ;;
    producer-minimal-health)
      expected_actual=(verify_continuous_health_command)
      expected_logical=(
        internal verify-continuous-health-chain '@producer-window'
      )
      ;;
    archive-smoke-full)
      expected_actual=(
        "$smoke_path" -archive-root "$data_root"
        -data-version "$full_data"
      )
      expected_logical=(
        '@archive-smoke' -archive-root '@data-root'
        -data-version '@full-data-version'
      )
      ;;
    archive-corruption)
      expected_actual=(
        "$smoke_path" -archive-root "$fault_root"
        -data-version "$full_data"
      )
      expected_logical=(
        '@archive-smoke' -archive-root '@fault-root'
        -data-version '@full-data-version'
      )
      ;;
    full-switch)
      expected_actual=(
        pointer_switch_command "$full_data" "$full_manifest_digest"
      )
      expected_logical=(
        internal pointer-switch '@full-data-version'
      )
      ;;
    full-health)
      expected_actual=(
        health_state_command "$full_data" "$full_manifest_digest" full
      )
      expected_logical=(
        internal capture-health-state '@full-data-version'
      )
      ;;
    rollback-switch)
      expected_actual=(pointer_rollback_command)
      expected_logical=(
        internal pointer-rollback '@minimal-data-version'
      )
      ;;
    rollback-health)
      minimal_manifest="$(jq -er '.minimalArchive.manifestDigest' "$input")" ||
        return
      expected_actual=(
        health_state_command "$minimal_data" "$minimal_manifest" rolled-back
      )
      expected_logical=(
        internal capture-health-state '@minimal-data-version'
      )
      ;;
    post-switch-failure)
      expected_actual=(pointer_failure_command)
      expected_logical=(
        internal pointer-invalid-switch-exercise
      )
      ;;
    post-switch-recovery)
      expected_actual=(pointer_rollback_command)
      expected_logical=(
        internal pointer-automatic-rollback '@minimal-data-version'
      )
      ;;
    lock-contention)
      expected_actual=(flock -n "$lock_file" true)
      expected_logical=(
        internal cleanup-lock-contention-exercise
      )
      ;;
    reactivate-switch)
      expected_actual=(
        pointer_switch_command "$full_data" "$full_manifest_digest"
      )
      expected_logical=(
        internal pointer-reactivate '@full-data-version'
      )
      ;;
    reactivated-health)
      expected_actual=(
        health_state_command "$full_data" "$full_manifest_digest" reactivated
      )
      expected_logical=(
        internal capture-health-state '@full-data-version'
      )
      ;;
    cleanup-resources)
      expected_actual=(cleanup_resources_command)
      expected_logical=(
        internal cleanup-run-owned-resources
      )
      ;;
    *)
      return 1
      ;;
  esac
  [[ "${#actual[@]}" -eq "${#expected_actual[@]}" ]] || return 1
  local index
  for ((index=0; index < ${#expected_actual[@]}; index+=1)); do
    [[ "${actual[$index]}" == "${expected_actual[$index]}" ]] || return 1
  done
  local contract_argv logical_argv
  contract_argv="$(
    jq -ceS --arg id "$id" '
      [
        .authority.commands.records[] |
        select(.id == $id)
      ] |
      if length == 1 then .[0].argv else error("command authority") end
    ' "$input"
  )" || return
  logical_argv="$(argv_json "${expected_logical[@]}")" || return
  [[ "$logical_argv" == "$contract_argv" ]] || return 1
  printf '%s\n' "$contract_argv" |
    sha256sum |
    awk '{print "sha256:" $1}'
}

append_command() {
  local id="$1"
  local duration="$2"
  local exit_code="$3"
  local outcome="$4"
  local digest="$5"
  local started_epoch="$6"
  local ended_epoch="$7"
  local started_monotonic="$8"
  local ended_monotonic="$9"
  local argv_digest="${10}"
  local contract proof spec_digest expected_exit expected_outcome maximum
  local expected_argv_digest
  contract="$(
    jq -ceS --arg id "$id" '
      [
        .authority.commands.records[] |
        select(.id == $id)
      ] |
      if length == 1 then .[0] else error("command authority") end
    ' "$input"
  )" || return
  proof="$(jq -er '.proof' <<< "$contract")" || return
  spec_digest="$(jq -er '.specDigest' <<< "$contract")" || return
  expected_exit="$(jq -er '.expectedExitCode' <<< "$contract")" || return
  expected_outcome="$(jq -er '.expectedOutcome' <<< "$contract")" || return
  maximum="$(jq -er '.maximumDurationMs' <<< "$contract")" || return
  expected_argv_digest="$(
    jq -cS '.argv' <<< "$contract" |
      sha256sum |
      awk '{print "sha256:" $1}'
  )" || return
  [[ "$spec_digest" == "sha256:$(
       jq -cS 'del(.specDigest)' <<< "$contract" |
         sha256sum | awk '{print $1}'
     )" &&
     "$argv_digest" == "$expected_argv_digest" &&
     "$exit_code" -eq "$expected_exit" &&
     "$outcome" == "$expected_outcome" &&
     "$duration" -le "$maximum" &&
     "$started_epoch" =~ ^[1-9][0-9]{12}$ &&
     "$ended_epoch" =~ ^[1-9][0-9]{12}$ &&
     "$started_monotonic" =~ ^[1-9][0-9]{6,20}$ &&
     "$ended_monotonic" =~ ^[1-9][0-9]{6,20}$ &&
     "$ended_epoch" -ge "$started_epoch" &&
     "$ended_monotonic" -ge "$started_monotonic" ]] || return 1
  jq -cnS \
    --arg argvDigest "$argv_digest" \
    --arg endedMonotonicNs "$ended_monotonic" \
    --arg id "$id" \
    --arg outcome "$outcome" \
    --arg outputDigest "$digest" \
    --arg proof "$proof" \
    --arg specDigest "$spec_digest" \
    --arg startedMonotonicNs "$started_monotonic" \
    --argjson durationMs "$duration" \
    --argjson endedEpochMs "$ended_epoch" \
    --argjson exitCode "$exit_code" \
    --argjson startedEpochMs "$started_epoch" \
    '{
      argvDigest:$argvDigest,
      durationMs:$durationMs,
      endedEpochMs:$endedEpochMs,
      endedMonotonicNs:$endedMonotonicNs,
      exitCode:$exitCode,
      id:$id,
      outcome:$outcome,
      outputDigest:$outputDigest,
      proof:$proof,
      specDigest:$specDigest,
      startedEpochMs:$startedEpochMs,
      startedMonotonicNs:$startedMonotonicNs
    }' >> "$command_records"
  sync -f -- "$command_records"
}

monotonic_ns() {
  local uptime seconds fraction
  read -r uptime _ < /proc/uptime || return
  seconds="${uptime%%.*}"
  fraction="${uptime#*.}000000000"
  fraction="${fraction:0:9}"
  [[ "$seconds" =~ ^[0-9]+$ && "$fraction" =~ ^[0-9]{9}$ ]] || return 1
  printf '%s%09d\n' "$seconds" "$((10#${fraction}))"
}

command_proof() {
  local id="$1"
  jq -cse --arg id "$id" '
    [
      .[] |
      select(.id == $id)
    ] |
    if length == 1 then
      {
        passed:true,
        proofCommandId:.[0].id,
        proofDigest:.[0].outputDigest
      }
    else error("command proof") end
  ' "$command_records"
}

run_recorded() {
  local id="$1"
  local expectation="$2"
  shift 2
  [[ "$id" =~ ^[a-z][a-z0-9-]{1,63}$ ]] || return 1
  local output="${evidence_root}/command-${id}.log"
  local started_epoch ended_epoch started_monotonic ended_monotonic
  local duration status=0 outcome expected_exit expected_outcome
  local argv_digest contract original_file_limit
  argv_digest="$(validate_command_invocation "$id" "$@")" || return
  contract="$(
    jq -ceS --arg id "$id" '
      [.authority.commands.records[] | select(.id == $id)] |
      if length == 1 then .[0] else error("command authority") end
    ' "$input"
  )" || return
  expected_exit="$(jq -er '.expectedExitCode' <<< "$contract")" || return
  expected_outcome="$(jq -er '.expectedOutcome' <<< "$contract")" || return
  [[ ( "$expectation" == "success" &&
       "$expected_exit" -eq 0 &&
       "$expected_outcome" == "succeeded" ) ||
     ( "$expectation" == "failure" &&
       "$expected_exit" -eq 1 &&
       "$expected_outcome" == "expected-failure" ) ]] || return 1
  runtime_create_file "$output" 0600 0 0 yes || return
  started_epoch="$(date +%s%3N)"
  started_monotonic="$(monotonic_ns)"
  original_file_limit="$(ulimit -f)" || return
  set +e
  ulimit -f 8192 || {
    set -e
    return 1
  }
  "$@" > "$output" 2>&1
  status=$?
  ulimit -f "$original_file_limit" || {
    set -e
    return 1
  }
  set -e
  ended_monotonic="$(monotonic_ns)"
  ended_epoch="$(date +%s%3N)"
  duration="$(((ended_monotonic - started_monotonic) / 1000000))"
  [[ -f "$output" && ! -L "$output" &&
     "$(stat -c '%s' -- "$output")" -le "$maximum_output" ]] ||
    return 1
  runtime_close_object "$output" || return
  if [[ "$status" -eq "$expected_exit" &&
        "$expected_outcome" == "succeeded" ]]; then
    outcome="succeeded"
  elif [[ "$status" -eq "$expected_exit" &&
          "$expected_outcome" == "expected-failure" ]]; then
    outcome="expected-failure"
  else
    return 1
  fi
  append_command "$id" "$duration" "$status" \
    "$outcome" "$(sha_file "$output")" \
    "$started_epoch" "$ended_epoch" "$started_monotonic" "$ended_monotonic" \
    "$argv_digest"
}

container_raw_security_digest() {
  docker inspect "$1" |
    jq -cS '.[0] | {
      Config:{
        Entrypoint:.Config.Entrypoint,
        Image:.Config.Image,
        Labels:.Config.Labels,
        User:.Config.User
      },
      HostConfig:{
        CapDrop:.HostConfig.CapDrop,
        CpuQuota:.HostConfig.CpuQuota,
        CpuShares:.HostConfig.CpuShares,
        Memory:.HostConfig.Memory,
        NetworkMode:.HostConfig.NetworkMode,
        PidsLimit:.HostConfig.PidsLimit,
        PortBindings:.HostConfig.PortBindings,
        Privileged:.HostConfig.Privileged,
        ReadonlyRootfs:.HostConfig.ReadonlyRootfs,
        SecurityOpt:.HostConfig.SecurityOpt
      },
      Mounts:[.Mounts[]? | {
        Destination,Mode,Propagation,RW,Source,Type
      }],
      Networks:(.NetworkSettings.Networks | keys)
    }' |
    sha256sum |
    awk '{print "sha256:" $1}'
}

container_security_projection() {
  local identifier="$1"
  local service="$2"
  docker inspect "$identifier" |
    jq -ceS --arg service "$service" '
      def env_map:
        (. // []) as $raw |
        [
          $raw[] |
          capture("^(?<key>[A-Z][A-Z0-9_]{0,63})=(?<value>.*)$")
        ] as $entries |
        if ($entries | length) !=
           ($entries | map(.key) | unique | length)
        then error("duplicate environment key")
        else reduce $entries[] as $entry
          ({}; .[$entry.key] = $entry.value)
        end;
      def normalized_security_option:
        if . == "no-new-privileges"
        then "no-new-privileges:true"
        else .
        end;
      def normalized_tmpfs_value:
        split(",") as $parts |
        ($parts | map(select(startswith("size=")))) as $sizes |
        if ($sizes | length) == 1 and
           ($sizes[0] | test("^size=[1-9][0-9]*$")) and
           ((($sizes[0] | sub("^size=";"") | tonumber) % 1048576) == 0) and
           (($parts - ["rw","noexec","nosuid","nodev",$sizes[0]]) |
             length) == 0
        then
          "rw,noexec,nosuid,nodev,size=" +
          ((($sizes[0] | sub("^size=";"") | tonumber) / 1048576 |
            floor | tostring)) + "m"
        else $parts | join(",")
        end;
      if length != 1 then error("container inspect cardinality") else .[0] end |
      . as $container |
      {
        capAdd:(.HostConfig.CapAdd // [] | sort),
        capDrop:(.HostConfig.CapDrop // [] | sort),
        command:(.Config.Cmd // []),
        entrypoint:(.Config.Entrypoint // []),
        environment:(.Config.Env | env_map),
        image:.Config.Image,
        init:.HostConfig.Init,
        labels:(.Config.Labels // {}),
        logging:{
          driver:.HostConfig.LogConfig.Type,
          options:(.HostConfig.LogConfig.Config // {})
        },
        maximumProcesses:.HostConfig.PidsLimit,
        memoryBytes:.HostConfig.Memory,
        mounts:(
          [
            .Mounts[]? |
            {
              bindCreateHostPath:false,
              propagation:(.Propagation // "rprivate"),
              readOnly:(.RW | not),
              source:.Source,
              target:.Destination,
              type:.Type
            }
          ] |
          sort_by(.target)
        ),
        nanoCpus:.HostConfig.NanoCpus,
        networks:(.NetworkSettings.Networks // {} | keys | sort),
        ports:(
          [
            (.HostConfig.PortBindings // {}) |
            to_entries[] |
            .key as $containerPort |
            (.value // [])[] |
            ($containerPort |
              capture("^(?<target>[1-9][0-9]*)/(?<protocol>tcp|udp)$")) as
              $parsed |
            {
              hostIp:.HostIp,
              protocol:$parsed.protocol,
              published:(.HostPort | tonumber),
              target:($parsed.target | tonumber)
            }
          ] |
          sort_by(.target,.protocol,.hostIp,.published)
        ),
        privileged:.HostConfig.Privileged,
        readOnlyRootFilesystem:.HostConfig.ReadonlyRootfs,
        restart:.HostConfig.RestartPolicy.Name,
        securityOptions:(
          [.HostConfig.SecurityOpt[]? | normalized_security_option] | sort
        ),
        service:$service,
        stopGracePeriodSeconds:.Config.StopTimeout,
        tmpfs:(
          [
            (.HostConfig.Tmpfs // {}) |
            to_entries[] |
            "\(.key):\(.value | normalized_tmpfs_value)"
          ] |
          sort
        ),
        user:.Config.User
      }
    '
}

container_security_digest() {
  local identifier="$1"
  local name service projection
  name="$(docker inspect --format '{{.Name}}' "$identifier")" || return
  service="$(
    docker inspect --format \
      '{{index .Config.Labels "com.docker.compose.service"}}' "$identifier"
  )" || return
  case "$name" in
    "/${project}-api-1"|"/${project}-prometheus-1"|"/${project}-updater-produce")
      projection="$(container_security_projection "$identifier" "$service")" ||
        return
      printf '%s\n' "$projection" | sha256sum |
        awk '{print "sha256:" $1}'
      ;;
    *)
      container_raw_security_digest "$identifier"
      ;;
  esac
}

record_container() {
  local id="$1"
  local service="$2"
  local name security record
  [[ "$id" =~ ^[0-9a-f]{64}$ ]] || return 1
  name="$(docker inspect --format '{{.Name}}' "$id")" || return
  security="$(container_security_digest "$id")" || return
  [[ "$name" =~ ^/bgmss_ops_validation[-_][A-Za-z0-9_.-]+$ ]] || return 1
  record="$(
    jq -cnS \
    --arg id "$id" \
    --arg name "$name" \
    --arg project "$project" \
    --arg runId "$run_id" \
    --arg securityDigest "$security" \
    --arg service "$service" \
    '{
      id:$id,
      name:$name,
      project:$project,
      runId:$runId,
      securityDigest:$securityDigest,
      service:$service
    }'
  )" || return
  printf '%s\n' "$record" >> "$container_records" || return
  sync -f -- "$container_records" || return
  ledger_resource_event resource-closed container "$record"
}

record_network() {
  local name="$1"
  local id internal record
  id="$(docker network inspect --format '{{.Id}}' "$name")" || return
  internal="$(docker network inspect --format '{{.Internal}}' "$name")" || return
  [[ "$id" =~ ^[0-9a-f]{64}$ && ( "$internal" == "true" || "$internal" == "false" ) ]] ||
    return 1
  record="$(
    jq -cnS \
    --arg id "$id" \
    --arg name "$name" \
    --arg project "$project" \
    --arg runId "$run_id" \
    --argjson internal "$internal" \
    '{
      id:$id,
      internal:$internal,
      name:$name,
      project:$project,
      runId:$runId
    }'
  )" || return
  printf '%s\n' "$record" >> "$network_records" || return
  sync -f -- "$network_records" || return
  ledger_resource_event resource-closed network "$record"
}

oci_archive_graph_identity() {
  local archive="$1"
  local declared="$2"
  local expected_manifest="$3"
  local expected_config="$4"
  [[ -f "$archive" && ! -L "$archive" &&
     "$expected_manifest" =~ ^sha256:[0-9a-f]{64}$ &&
     "$expected_config" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  local layout index manifest_path manifest_json config_path config_json
  local docker_manifest layer_paths actual_members expected_members
  layout="$(tar -xOf "$archive" oci-layout)" || return
  index="$(tar -xOf "$archive" index.json)" || return
  docker_manifest="$(tar -xOf "$archive" manifest.json)" || return
  [[ "${#layout}" -le 1024 && "${#index}" -le 1048576 &&
     "${#docker_manifest}" -le 1048576 ]] || return 1
  jq -e '
    type == "object" and
    keys == ["imageLayoutVersion"] and
    .imageLayoutVersion == "1.0.0"
  ' <<< "$layout" >/dev/null || return
  jq -e \
    --arg declared "$declared" \
    --arg manifest "$expected_manifest" '
      type == "object" and
      (keys | sort) == ["manifests","mediaType","schemaVersion"] and
      .schemaVersion == 2 and
      .mediaType == "application/vnd.oci.image.index.v1+json" and
      (.manifests | type == "array" and length == 1) and
      .manifests[0].digest == $manifest and
      .manifests[0].mediaType ==
        "application/vnd.oci.image.manifest.v1+json" and
      (.manifests[0].size | type == "number" and . > 0) and
      .manifests[0].platform == {architecture:"amd64",os:"linux"} and
      .manifests[0].annotations["io.containerd.image.name"] == $declared and
      .manifests[0].annotations["org.opencontainers.image.ref.name"] ==
        ($declared | split(":") | last)
    ' <<< "$index" >/dev/null || return
  manifest_path="blobs/sha256/${expected_manifest#sha256:}"
  [[ "$(tar -xOf "$archive" "$manifest_path" | sha256sum |
          awk '{print "sha256:" $1}')" == "$expected_manifest" ]] || return
  manifest_json="$(tar -xOf "$archive" "$manifest_path")" || return
  [[ "${#manifest_json}" -le 1048576 ]] || return 1
  jq -e \
    --arg config "$expected_config" '
      type == "object" and
      (keys - ["annotations","artifactType","subject"] | sort) ==
        ["config","layers","mediaType","schemaVersion"] and
      .schemaVersion == 2 and
      .mediaType == "application/vnd.oci.image.manifest.v1+json" and
      .config.digest == $config and
      .config.mediaType == "application/vnd.oci.image.config.v1+json" and
      (.config.size | type == "number" and . > 0) and
      (.layers | type == "array" and length > 0) and
      all(.layers[];
        .mediaType == "application/vnd.oci.image.layer.v1.tar+gzip" and
        (.digest | test("^sha256:[0-9a-f]{64}$")) and
        (.size | type == "number" and . > 0)
      )
    ' <<< "$manifest_json" >/dev/null || return
  config_path="blobs/sha256/${expected_config#sha256:}"
  [[ "$(tar -xOf "$archive" "$config_path" | sha256sum |
          awk '{print "sha256:" $1}')" == "$expected_config" ]] || return
  config_json="$(tar -xOf "$archive" "$config_path")" || return
  [[ "${#config_json}" -le 4194304 ]] || return 1
  jq -e '
    type == "object" and
    .architecture == "amd64" and
    .os == "linux" and
    .rootfs.type == "layers" and
    (.rootfs.diff_ids | type == "array")
  ' <<< "$config_json" >/dev/null || return
  while IFS=$'\t' read -r digest size media_type; do
    [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ &&
       "$size" =~ ^[1-9][0-9]*$ &&
       "$media_type" == "application/vnd.oci.image.layer.v1.tar+gzip" ]] ||
      return 1
    local member="blobs/sha256/${digest#sha256:}"
    [[ "$(tar -xOf "$archive" "$member" | wc -c | tr -d '[:space:]')" == \
         "$size" &&
       "$(tar -xOf "$archive" "$member" | sha256sum |
          awk '{print "sha256:" $1}')" == "$digest" ]] || return
  done < <(
    jq -r '.layers[] | [.digest,(.size|tostring),.mediaType] | @tsv' \
      <<< "$manifest_json"
  )
  layer_paths="$(
    jq -c '[.layers[].digest | sub("^sha256:";"blobs/sha256/")]' \
      <<< "$manifest_json"
  )" || return
  jq -e \
    --arg config "$config_path" \
    --arg declared "$declared" \
    --argjson layers "$layer_paths" '
      type == "array" and
      length == 1 and
      .[0] == {Config:$config,Layers:$layers,RepoTags:[$declared]}
    ' <<< "$docker_manifest" >/dev/null || return
  actual_members="$(tar -tf "$archive" | sort)" || return
  expected_members="$(
    {
      printf '%s\n' index.json manifest.json oci-layout "$manifest_path" \
        "$config_path"
      jq -r '.[]' <<< "$layer_paths"
    } | sort
  )" || return
  [[ "$actual_members" == "$expected_members" ]] || return 1
  jq -cnS \
    --arg declared "$declared" \
    --arg indexDigest "$(printf '%s' "$index" | sha256sum |
      awk '{print "sha256:" $1}')" \
    --arg manifestDigest "$expected_manifest" \
    --arg configDigest "$expected_config" \
    --argjson layers "$(jq -cS '.layers' <<< "$manifest_json")" \
    '{
      configDigest:$configDigest,
      declaredReference:$declared,
      indexDigest:$indexDigest,
      layers:$layers,
      manifestDigest:$manifestDigest
    }' |
    sha256sum |
    awk '{print "sha256:" $1}'
}

prometheus_graph_identity() {
  local evidence="$1"
  local index_digest="$2"
  local manifest_digest="$3"
  local config_digest="$4"
  local manifest_size="$5"
  [[ -f "$evidence" && ! -L "$evidence" &&
     "$index_digest" =~ ^sha256:[0-9a-f]{64}$ &&
     "$manifest_digest" =~ ^sha256:[0-9a-f]{64}$ &&
     "$config_digest" =~ ^sha256:[0-9a-f]{64}$ &&
     "$manifest_size" =~ ^[1-9][0-9]*$ &&
     "$(stat -c '%s' "$evidence")" -le "$maximum_output" ]] || return 1
  local selected
  selected="$(
    jq -ceS \
      --arg config "$config_digest" \
      --arg manifest "$manifest_digest" \
      --argjson manifestSize "$manifest_size" '
        [
          .[] |
          select(
            .Descriptor.digest == $manifest and
            .Descriptor.platform == {architecture:"amd64",os:"linux"}
          )
        ] |
        if length == 1 then .[0] else error("manifest selection") end |
        select(
          .Descriptor.mediaType ==
            "application/vnd.docker.distribution.manifest.v2+json" and
          .Descriptor.size == $manifestSize and
          .SchemaV2Manifest.schemaVersion == 2 and
          .SchemaV2Manifest.config.digest == $config and
          (.SchemaV2Manifest.config.size | type == "number" and . > 0) and
          (.SchemaV2Manifest.layers | type == "array" and length > 0) and
          all(.SchemaV2Manifest.layers[];
            (.digest | test("^sha256:[0-9a-f]{64}$")) and
            (.size | type == "number" and . > 0)
          )
        )
      ' "$evidence"
  )" || return
  jq -cnS \
    --arg indexDigest "$index_digest" \
    --argjson selected "$selected" \
    '{indexDigest:$indexDigest,selected:$selected}' |
    sha256sum |
    awk '{print "sha256:" $1}'
}

record_image() {
  local role="$1"
  local manifest="$2"
  local config="$3"
  local runtime="$4"
  local first="$5"
  local second="$6"
  local graph="$7"
  local rootfs="$8"
  local record
  record="$(
    jq -cnS \
    --arg configDigest "$config" \
    --arg graphDigest "$graph" \
    --arg manifestDigest "$manifest" \
    --arg first "$first" \
    --arg role "$role" \
    --arg runtimeId "$runtime" \
    --arg second "$second" \
    --argjson rootfsDiffIds "$rootfs" \
    '{
      configDigest:$configDigest,
      graphDigest:$graphDigest,
      manifestDigest:$manifestDigest,
      references:([$first,$second] | sort),
      role:$role,
      rootfsDiffIds:$rootfsDiffIds,
      runtimeId:$runtimeId
    }'
  )" || return
  printf '%s\n' "$record" >> "$image_records" || return
  sync -f -- "$image_records" || return
  ledger_resource_event resource-closed image "$record"
}

image_rootfs_diff_ids() {
  docker image inspect "$1" |
    jq -ceS '
      if length == 1 and
         (.[0].RootFS.Layers | type == "array" and length > 0) and
         all(.[0].RootFS.Layers[];
           type == "string" and test("^sha256:[0-9a-f]{64}$")
         )
      then .[0].RootFS.Layers
      else error("runtime rootfs identity")
      end
    '
}

image_runtime_graph_digest() {
  local config="$1"
  local rootfs="$2"
  jq -cnS \
    --arg configDigest "$config" \
    --argjson rootfsDiffIds "$rootfs" \
    '{configDigest:$configDigest,rootfsDiffIds:$rootfsDiffIds}' |
    sha256sum |
    awk '{print "sha256:" $1}'
}

verify_image_graph_record() {
  local record="$1"
  local reference="$2"
  local role manifest config runtime graph expected_manifest expected_config
  local expected_graph first expected_references rootfs expected_rootfs
  role="$(jq -er '.role' <<< "$record")" || return
  manifest="$(jq -er '.manifestDigest' <<< "$record")" || return
  config="$(jq -er '.configDigest' <<< "$record")" || return
  runtime="$(jq -er '.runtimeId' <<< "$record")" || return
  graph="$(jq -er '.graphDigest' <<< "$record")" || return
  rootfs="$(jq -ceS '.rootfsDiffIds' <<< "$record")" || return
  [[ "$manifest" =~ ^sha256:[0-9a-f]{64}$ &&
     "$config" =~ ^sha256:[0-9a-f]{64}$ &&
     "$runtime" =~ ^sha256:[0-9a-f]{64}$ &&
     "$graph" =~ ^sha256:[0-9a-f]{64}$ &&
     "$runtime" == "$config" ]] || return 1
  case "$role" in
    api|updater)
      first="$(jq -er --arg role "$role" \
        '.images[$role].declaredLoadReference' "$input")" || return
      expected_manifest="$(jq -er --arg role "$role" \
        '.images[$role].manifest.digest' "$input")" || return
      expected_config="$(jq -er --arg role "$role" \
        '.images[$role].config.digest' "$input")" || return
      expected_rootfs="$(jq -ceS --arg role "$role" \
        '.images[$role].rootfsDiffIds' "$input")" || return
      expected_references="$(
        jq -cS --arg role "$role" \
          '[.images[$role].declaredLoadReference,
            .images[$role].validationAlias] | sort' "$input"
      )" || return
      oci_archive_graph_identity "$(role_path "${role}-image")" "$first" \
        "$expected_manifest" "$expected_config" >/dev/null || return
      expected_graph="$(jq -er --arg role "$role" \
        '.images[$role].graphDigest' "$input")" || return
      ;;
    prometheus)
      first="$(jq -er '.images.prometheus.reference' "$input")" || return
      expected_manifest="$(
        jq -er '.images.prometheus.amd64ManifestDigest' "$input"
      )" || return
      expected_config="$runtime"
      expected_rootfs="$(image_rootfs_diff_ids "$reference")" || return
      expected_references="$(
        jq -cS '[
          .images.prometheus.reference,
          .images.prometheus.validationAlias
        ] | sort' "$input"
      )" || return
      prometheus_graph_identity \
        "${evidence_root}/prometheus-manifest.json" \
        "$(jq -er '.images.prometheus.indexDigest' "$input")" \
        "$expected_manifest" "$expected_config" \
        "$(jq -er '.images.prometheus.amd64ManifestSize' "$input")" \
        >/dev/null || return
      expected_graph="$(
        image_runtime_graph_digest "$expected_config" "$expected_rootfs"
      )" || return
      ;;
    *)
      return 1
      ;;
  esac
  [[ "$manifest" == "$expected_manifest" &&
     "$config" == "$expected_config" &&
     "$graph" == "$expected_graph" &&
     "$rootfs" == "$expected_rootfs" &&
     "$(image_rootfs_diff_ids "$reference")" == "$rootfs" &&
     "$(image_runtime_graph_digest "$config" "$rootfs")" == "$graph" &&
     "$(jq -cS '.references' <<< "$record")" == "$expected_references" &&
     "$(docker image inspect --format '{{.Id}}' "$reference" 2>/dev/null)" == \
       "$runtime" ]] || return 1
  if [[ "$role" == "prometheus" && "$reference" == "$first" ]]; then
    local repository="${first%@sha256:*}"
    repository="${repository%:*}"
    local repo_digest="${repository}@$(jq -er \
      '.images.prometheus.indexDigest' "$input")"
    docker image inspect "$reference" |
      jq -e --arg exact "$reference" --arg repo "$repo_digest" '
        .[0].RepoDigests | any(. == $exact or . == $repo)
      ' >/dev/null || return
  fi
}

append_residue() {
  local value="$1"
  [[ "$value" =~ ^[A-Za-z0-9._:/@+-]{1,255}$ ]] || value="unsafe-residue"
  printf '%s\n' "$value" >> "$residue_records"
  sync -f -- "$residue_records"
}

verify_container_record() {
  local record="$1"
  local id service name security
  id="$(jq -r '.id' <<< "$record")"
  service="$(jq -r '.service' <<< "$record")"
  name="$(jq -r '.name' <<< "$record")"
  security="$(jq -r '.securityDigest' <<< "$record")"
  docker inspect "$id" >/dev/null 2>&1 || return 1
  [[ "$(docker inspect --format '{{.Name}}' "$id")" == "$name" ]] || return 1
  [[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$id")" == "$project" ]] ||
    return 1
  [[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$id")" == "$service" ]] ||
    return 1
  [[ "$(docker inspect --format '{{index .Config.Labels "fun.bgmss.validation-run"}}' "$id")" == "$run_id" ]] ||
    return 1
  [[ "$(container_security_digest "$id")" == "$security" ]]
}

cleanup_containers() {
  [[ -f "$container_records" && ! -L "$container_records" ]] || return 0
  mapfile -t records < "$container_records"
  local index record id running ledger_state
  for ((index=${#records[@]} - 1; index >= 0; index-=1)); do
    record="${records[$index]}"
    ledger_state="$(ledger_resource_state container "$record")" || {
      resource_cleanup_safe="false"
      add_secondary "CONTAINER_LEDGER_INVALID"
      continue
    }
    id="$(jq -r '.id' <<< "$record")"
    if [[ "$ledger_state" == "resource-removed" ]]; then
      if docker inspect "$id" >/dev/null 2>&1; then
        resource_cleanup_safe="false"
        add_secondary "CONTAINER_REAPPEARED"
      fi
      continue
    fi
    [[ "$ledger_state" == "resource-closed" ]] || {
      resource_cleanup_safe="false"
      add_secondary "CONTAINER_LEDGER_INVALID"
      continue
    }
    if ! docker inspect "$id" >/dev/null 2>&1 &&
      [[ "$cleanup_resuming" == "true" ]]; then
      ledger_resource_event resource-removed container "$record" || {
        resource_cleanup_safe="false"
        add_secondary "CONTAINER_LEDGER_CLOSE_FAILED"
      }
      continue
    fi
    if ! verify_container_record "$record"; then
      resource_cleanup_safe="false"
      append_residue "container:${id}"
      add_secondary "CONTAINER_IDENTITY_CHANGED"
      continue
    fi
    running="$(docker inspect --format '{{.State.Running}}' "$id")"
    if [[ "$running" == "true" ]]; then
      docker stop --time 30 "$id" >/dev/null 2>&1 || {
        resource_cleanup_safe="false"
        append_residue "container:${id}"
        add_secondary "CONTAINER_STOP_FAILED"
        continue
      }
    fi
    docker rm "$id" >/dev/null 2>&1 || {
      resource_cleanup_safe="false"
      append_residue "container:${id}"
      add_secondary "CONTAINER_REMOVE_FAILED"
      continue
    }
    ledger_resource_event resource-removed container "$record" || {
      resource_cleanup_safe="false"
      add_secondary "CONTAINER_LEDGER_CLOSE_FAILED"
    }
  done
}

cleanup_networks() {
  [[ -f "$network_records" && ! -L "$network_records" ]] || return 0
  mapfile -t records < "$network_records"
  local index record id name expected_internal actual ledger_state
  for ((index=${#records[@]} - 1; index >= 0; index-=1)); do
    record="${records[$index]}"
    ledger_state="$(ledger_resource_state network "$record")" || {
      resource_cleanup_safe="false"
      add_secondary "NETWORK_LEDGER_INVALID"
      continue
    }
    id="$(jq -r '.id' <<< "$record")"
    name="$(jq -r '.name' <<< "$record")"
    if [[ "$ledger_state" == "resource-removed" ]]; then
      if docker network inspect "$name" >/dev/null 2>&1; then
        resource_cleanup_safe="false"
        add_secondary "NETWORK_REAPPEARED"
      fi
      continue
    fi
    [[ "$ledger_state" == "resource-closed" ]] || {
      resource_cleanup_safe="false"
      add_secondary "NETWORK_LEDGER_INVALID"
      continue
    }
    expected_internal="$(jq -r '.internal' <<< "$record")"
    actual="$(docker network inspect "$name" 2>/dev/null)" || {
      if [[ "$cleanup_resuming" == "true" ]]; then
        ledger_resource_event resource-removed network "$record" || {
          resource_cleanup_safe="false"
          add_secondary "NETWORK_LEDGER_CLOSE_FAILED"
        }
        continue
      fi
      resource_cleanup_safe="false"
      append_residue "network:${name}"
      add_secondary "NETWORK_MISSING"
      continue
    }
    if [[ "$(jq -r '.[0].Id' <<< "$actual")" != "$id" ||
          "$(jq -r '.[0].Internal' <<< "$actual")" != "$expected_internal" ||
          "$(jq -r '.[0].Labels["com.docker.compose.project"]' <<< "$actual")" != "$project" ||
          "$(jq -r '.[0].Labels["fun.bgmss.validation-run"]' <<< "$actual")" != "$run_id" ]]; then
      resource_cleanup_safe="false"
      append_residue "network:${name}"
      add_secondary "NETWORK_IDENTITY_CHANGED"
      continue
    fi
    docker network rm "$id" >/dev/null 2>&1 || {
      resource_cleanup_safe="false"
      append_residue "network:${name}"
      add_secondary "NETWORK_REMOVE_FAILED"
      continue
    }
    ledger_resource_event resource-removed network "$record" || {
      resource_cleanup_safe="false"
      add_secondary "NETWORK_LEDGER_CLOSE_FAILED"
    }
  done
}

cleanup_images() {
  [[ -f "$image_records" && ! -L "$image_records" ]] || return 0
  mapfile -t records < "$image_records"
  local index record runtime reference actual consumers safe present ledger_state
  for ((index=${#records[@]} - 1; index >= 0; index-=1)); do
    record="${records[$index]}"
    ledger_state="$(ledger_resource_state image "$record")" || {
      resource_cleanup_safe="false"
      add_secondary "IMAGE_LEDGER_INVALID"
      continue
    }
    runtime="$(jq -r '.runtimeId' <<< "$record")"
    if [[ "$ledger_state" == "resource-removed" ]]; then
      present=0
      while IFS= read -r reference; do
        docker image inspect "$reference" >/dev/null 2>&1 &&
          present=$((present + 1))
      done < <(jq -r '.references[]' <<< "$record")
      if [[ "$present" -ne 0 ]]; then
        resource_cleanup_safe="false"
        add_secondary "IMAGE_REAPPEARED"
      fi
      continue
    fi
    [[ "$ledger_state" == "resource-closed" ]] || {
      resource_cleanup_safe="false"
      add_secondary "IMAGE_LEDGER_INVALID"
      continue
    }
    present=0
    while IFS= read -r reference; do
      docker image inspect "$reference" >/dev/null 2>&1 &&
        present=$((present + 1))
    done < <(jq -r '.references[]' <<< "$record")
    if [[ "$present" -eq 0 && "$cleanup_resuming" == "true" ]]; then
      ledger_resource_event resource-removed image "$record" || {
        resource_cleanup_safe="false"
        add_secondary "IMAGE_LEDGER_CLOSE_FAILED"
      }
      continue
    fi
    consumers="$(docker ps -aq --filter "ancestor=${runtime}")"
    if [[ -n "$consumers" ]]; then
      resource_cleanup_safe="false"
      append_residue "image:${runtime}"
      add_secondary "IMAGE_FOREIGN_CONSUMER"
      continue
    fi
    safe="yes"
    local removed_all="yes"
    while IFS= read -r reference; do
      actual=""
      actual="$(docker image inspect --format '{{.Id}}' "$reference" 2>/dev/null)" || {
        [[ "$cleanup_resuming" == "true" ]] && continue
        safe="no"
      }
      [[ -z "$actual" ]] && continue
      [[ "$actual" == "$runtime" ]] || safe="no"
      verify_image_graph_record "$record" "$reference" || safe="no"
    done < <(jq -r '.references[]' <<< "$record")
    if [[ "$safe" != "yes" ]]; then
      resource_cleanup_safe="false"
      append_residue "image:${runtime}"
      add_secondary "IMAGE_IDENTITY_CHANGED"
      continue
    fi
    while IFS= read -r reference; do
      if ! docker image inspect "$reference" >/dev/null 2>&1 &&
        [[ "$cleanup_resuming" == "true" ]]; then
        continue
      fi
      verify_image_graph_record "$record" "$reference" || {
        resource_cleanup_safe="false"
        removed_all="no"
        append_residue "image-ref:${reference}"
        add_secondary "IMAGE_IDENTITY_CHANGED"
        break
      }
      docker image rm "$reference" >/dev/null 2>&1 || {
        resource_cleanup_safe="false"
        removed_all="no"
        append_residue "image-ref:${reference}"
        add_secondary "IMAGE_REMOVE_FAILED"
        break
      }
    done < <(jq -r '.references | reverse[]' <<< "$record")
    if [[ "$removed_all" == "yes" ]]; then
      ledger_resource_event resource-removed image "$record" || {
        resource_cleanup_safe="false"
        add_secondary "IMAGE_LEDGER_CLOSE_FAILED"
      }
    fi
  done
}

verify_no_run_resources() {
  [[ -z "$(docker ps -aq \
      --filter "label=com.docker.compose.project=${project}" \
      --filter "label=fun.bgmss.validation-run=${run_id}")" ]] || return 1
  local name reference
  for name in "${project}_outbound" "${project}_runtime"; do
    docker network inspect "$name" >/dev/null 2>&1 && return 1
  done
  local -a references=()
  if [[ -f "$input" && ! -L "$input" ]]; then
    mapfile -t references < <(
      jq -r '[
        .images.api.declaredLoadReference,
        .images.api.validationAlias,
        .images.prometheus.reference,
        .images.prometheus.validationAlias,
        .images.updater.declaredLoadReference,
        .images.updater.validationAlias
      ] | .[]' "$input"
    )
  else
    references=(
      "$api_load_reference"
      "$api_validation_alias"
      "$prometheus_reference"
      "$prometheus_validation_alias"
      "$updater_load_reference"
      "$updater_validation_alias"
    )
  fi
  [[ "${#references[@]}" -eq 6 &&
     "${references[*]}" != *"  "* ]] || return 1
  for reference in "${references[@]}"; do
    [[ -n "$reference" ]] || return 1
    docker image inspect "$reference" >/dev/null 2>&1 && return 1
  done
}

close_runtime_ledgers() {
  local candidate
  for candidate in \
    "$container_records" \
    "$network_records" \
    "$image_records" \
    "$command_records" \
    "$residue_records"; do
    [[ -e "$candidate" || -L "$candidate" ]] || continue
    runtime_close_object "$candidate" || return
  done
}

acquire_cleanup_lock() {
  [[ "$cleanup_lock_held" == "true" ]] && return 0
  [[ -e "$root" || -L "$root" ]] || return 10
  ledger_verify_chain || return 1
  ledger_current_head="$ledger_head"
  if [[ "$mode" == "run" && ! -e "$lock_file" && ! -L "$lock_file" ]]; then
    jq -se '
      (.[-1].payload.phase == "entry-preparing") and
      (all(.[];
        .payload.event != "resource-creating" and
        .payload.event != "resource-closed" and
        .payload.event != "resource-removed"
      ))
    ' "$ledger_fd_path" >/dev/null || return 1
    return 0
  fi
  local relative identity expected_device expected_inode
  relative="$(ledger_relative_path "$lock_file")" || return
  identity="$(runtime_state_identity "$relative")" || return
  ledger_verify_identity "$identity" || return
  expected_device="$(jq -er '.device' <<< "$identity")" || return
  expected_inode="$(jq -er '.inode' <<< "$identity")" || return
  exec {cleanup_lock_fd}<"$lock_file" || {
    [[ ! -e "$root" && ! -L "$root" ]] && return 10
    return 1
  }
  flock -w 180 "$cleanup_lock_fd" || {
    exec {cleanup_lock_fd}>&-
    cleanup_lock_fd=""
    return 1
  }
  cleanup_lock_held="true"
  if [[ ! -e "$root" && ! -L "$root" ]]; then
    return 10
  fi
  [[ "$(stat -Lc '%d:%i' -- "/proc/self/fd/${cleanup_lock_fd}")" == \
     "${expected_device}:${expected_inode}" ]] || return 1
  verify_owner || return 1
  ledger_verify_chain || return 1
  ledger_current_head="$ledger_head"
}

cleanup_paths() {
  verify_owner || {
    add_secondary "PATH_ROOT_IDENTITY_CHANGED"
    return 1
  }
  ledger_verify_chain || {
    add_secondary "OWNERSHIP_LEDGER_INVALID"
    return 1
  }
  [[ "$ledger_head" == "$ledger_current_head" ]] || {
    add_secondary "OWNERSHIP_LEDGER_HEAD_CHANGED"
    return 1
  }
  close_runtime_ledgers || {
    add_secondary "OWNERSHIP_LEDGER_CLOSE_FAILED"
    return 1
  }
  local response
  response="$(
    /usr/bin/bash "$agent_fd_path" cleanup \
      "$run_id" "$input_digest" "$marker_digest" "$ledger_current_head" \
      "$ledger_current_head" </dev/null
  )" || {
    add_secondary "OWNERSHIP_LEDGER_CLEANUP_FAILED"
    return 1
  }
  jq -e '.rootAbsent == true and .status == "succeeded"' <<< "$response" \
    >/dev/null || {
    add_secondary "OWNERSHIP_LEDGER_CLEANUP_FAILED"
    return 1
  }
  path_cleanup_prepared="true"
  cleanup_root_absent="true"
  cleanup_zero_residue="true"
}

finalize_cleanup_root() {
  [[ "$path_cleanup_prepared" == "true" &&
     ! -e "$root" && ! -L "$root" ]]
}

build_resource_evidence() {
  local containers="[]" networks="[]" images="[]" path_value="null"
  local named_volume_observed="false"
  [[ "$named_volumes_never_observed" == "true" ]] ||
    named_volume_observed="true"
  if [[ -s "$container_records" ]]; then
    containers="$(
      jq -scS --arg project "$project" '
        [
          .[] |
          select(
            (.service == "api" and .name == ("/" + $project + "-api-1")) or
            (.service == "prometheus" and
              .name == ("/" + $project + "-prometheus-1")) or
            (.service == "updater" and
              .name == ("/" + $project + "-updater-produce"))
          )
        ] |
        sort_by(.service)
      ' "$container_records"
    )"
  fi
  [[ -s "$network_records" ]] && networks="$(jq -scS . "$network_records")"
  [[ -s "$image_records" ]] && images="$(jq -scS . "$image_records")"
  if [[ -r "$ledger_fd_path" ]]; then
    local directories files
    directories="$(
      jq -cs '
        [
          .[].payload.details.identity? |
          select(.type? == "directory")
        ] |
        unique_by(.path) |
        length
      ' "$ledger_fd_path"
    )"
    files="$(
      jq -cs '
        [
          .[].payload.details.identity? |
          select(.type? == "file" or .type? == "symlink")
        ] |
        unique_by(.path) |
        length
      ' "$ledger_fd_path"
    )"
    path_value="$(
      jq -cnS \
        --arg device "$(stat -c '%d' -- "$root")" \
        --arg inventoryDigest "$ledger_current_head" \
        --arg markerDigest "$marker_digest" \
        --arg rootInode "$(stat -c '%i' -- "$root")" \
        --argjson directoryCount "$directories" \
        --argjson fileCount "$files" \
        '{
          device:$device,
          directoryCount:$directoryCount,
          fileCount:$fileCount,
          inventoryDigest:$inventoryDigest,
          markerDigest:$markerDigest,
          rootInode:$rootInode
        }'
    )"
  fi
  resources_json="$(
    jq -cnS \
      --arg project "$project" \
      --arg runId "$run_id" \
      --arg securityProjectionDigest "$security_projection_digest" \
      --argjson containers "$containers" \
      --argjson images "$images" \
      --argjson namedVolumeObserved "$named_volume_observed" \
      --argjson networks "$networks" \
      --argjson pathManifest "$path_value" \
      --argjson securityProjection "$security_projection_json" \
      '{
        containers:$containers,
        images:$images,
        namedVolumeObserved:$namedVolumeObserved,
        networks:$networks,
        pathManifest:$pathManifest,
        port:{hostIp:"127.0.0.1",published:19090,target:8080},
        project:$project,
        runId:$runId,
        schemaVersion:"operations-validation-resources-v1",
        securityProjection:$securityProjection,
        securityProjectionDigest:(
          if $securityProjection == null
          then null
          else $securityProjectionDigest
          end
        )
      }'
  )"
}

capture_security_projection() {
  local api_identifier prometheus_identifier updater_identifier
  local api_projection prometheus_projection updater_projection
  api_identifier="$(docker inspect --format '{{.Id}}' "${project}-api-1")" ||
    return
  prometheus_identifier="$(
    docker inspect --format '{{.Id}}' "${project}-prometheus-1"
  )" || return
  updater_identifier="$(
    docker inspect --format '{{.Id}}' "${project}-updater-produce"
  )" || return
  api_projection="$(container_security_projection "$api_identifier" api)" ||
    return
  prometheus_projection="$(
    container_security_projection "$prometheus_identifier" prometheus
  )" || return
  updater_projection="$(
    container_security_projection "$updater_identifier" updater
  )" || return
  security_projection_json="$(
    jq -cnS \
      --argjson api "$api_projection" \
      --argjson prometheus "$prometheus_projection" \
      --argjson updater "$updater_projection" \
      '{
        schemaVersion:"operations-validation-security-projection-v1",
        services:([$api,$prometheus,$updater] | sort_by(.service))
      }'
  )" || return
  security_projection_digest="$(
    printf '%s\n' "$security_projection_json" |
      sha256sum |
      awk '{print "sha256:" $1}'
  )"
}

write_pointer_atomic() {
  local version="$1"
  local digest="$2"
  local temporary="${data_root}/.current-${run_id}"
  [[ "$version" =~ ^dv1-[0-9a-f]{64}$ &&
     "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  runtime_create_file "$temporary" 0644 0 0 yes || return
  jq -cnS \
    --arg dataVersion "$version" \
    --arg manifestDigest "$digest" \
    '{dataVersion:$dataVersion,manifestDigest:$manifestDigest,pointerSchemaVersion:1}' \
    > "$temporary" || return
  chmod 0644 "$temporary" && chown 0:0 "$temporary" || return
  sync -f -- "$temporary" || return
  runtime_close_object "$temporary" || return
  runtime_replace_owned "$temporary" "${data_root}/current.json" || return
  sync -f -- "$data_root"
}

pointer_transaction_update() {
  local state="$1"
  local updated
  [[ -f "$pointer_transaction_file" &&
     ! -L "$pointer_transaction_file" ]] || return 1
  runtime_open_mutation "$pointer_transaction_file" || return
  updated="$(
    jq -cS \
    --arg state "$state" \
    --argjson observedEpochMs "$(date +%s%3N)" \
    '.state=$state | .observedEpochMs=$observedEpochMs' \
    "$pointer_transaction_file"
  )" || return
  printf '%s\n' "$updated" > "$pointer_transaction_file" || return
  chmod 0600 "$pointer_transaction_file" &&
    chown 0:0 "$pointer_transaction_file" || return
  sync -f -- "$pointer_transaction_file" || return
  runtime_close_object "$pointer_transaction_file"
}

arm_pointer_transaction() {
  local target_version="$1"
  local target_manifest="$2"
  local minimal_manifest
  [[ "$pointer_transaction_armed" == "false" ]] || return 1
  minimal_manifest="$(jq -er '.minimalArchive.manifestDigest' "$input")" ||
    return
  if [[ -e "$pointer_transaction_file" ||
        -L "$pointer_transaction_file" ]]; then
    runtime_open_mutation "$pointer_transaction_file" || return
  else
    runtime_create_file "$pointer_transaction_file" 0600 0 0 yes || return
  fi
  jq -cnS \
    --arg minimalDataVersion "$minimal_data" \
    --arg minimalManifestDigest "$minimal_manifest" \
    --arg runId "$run_id" \
    --arg targetDataVersion "$target_version" \
    --arg targetManifestDigest "$target_manifest" \
    --argjson observedEpochMs "$(date +%s%3N)" \
    '{
      minimal:{
        dataVersion:$minimalDataVersion,
        manifestDigest:$minimalManifestDigest
      },
      observedEpochMs:$observedEpochMs,
      runId:$runId,
      schemaVersion:"operations-validation-pointer-transaction-v1",
      state:"armed",
      target:{
        dataVersion:$targetDataVersion,
        manifestDigest:$targetManifestDigest
      }
    }' > "$pointer_transaction_file" || return
  chmod 0600 "$pointer_transaction_file" &&
    chown 0:0 "$pointer_transaction_file" || return
  sync -f -- "$pointer_transaction_file" || return
  runtime_close_object "$pointer_transaction_file" || return
  pointer_transaction_armed="true"
}

verify_minimal_pointer_ready() {
  local response started
  [[ "$(jq -er '.dataVersion' "${data_root}/current.json")" == \
       "$minimal_data" &&
     "$(jq -er '.manifestDigest' "${data_root}/current.json")" == \
       "$(jq -er '.minimalArchive.manifestDigest' "$input")" &&
     "$(stat -c '%u:%g:%a' "${data_root}/current.json")" == "0:0:644" ]] ||
    return 1
  started="$(date +%s)"
  while true; do
    response="$(
      curl --fail --silent --show-error --max-time 5 \
        --max-filesize 1048576 http://127.0.0.1:19090/readyz 2>/dev/null
    )" || response=""
    if jq -e --arg data "$minimal_data" \
      '.meta.dataVersion == $data' <<< "$response" >/dev/null 2>&1; then
      return 0
    fi
    (( $(date +%s) - started < 60 )) || return 1
    sleep 1
  done
}

rollback_pointer_transaction() {
  [[ "$pointer_transaction_armed" == "true" ]] || {
    if [[ -f "$pointer_transaction_file" && ! -L "$pointer_transaction_file" &&
          "$(jq -er '.state' "$pointer_transaction_file" 2>/dev/null || true)" == \
            "armed" ]]; then
      pointer_transaction_armed="true"
    else
      return 0
    fi
  }
  local rollback_version rollback_manifest
  rollback_version="$(
    jq -er '.minimal.dataVersion' "$pointer_transaction_file"
  )" || return
  rollback_manifest="$(
    jq -er '.minimal.manifestDigest' "$pointer_transaction_file"
  )" || return
  [[ "$rollback_version" == "$minimal_data" &&
     "$rollback_manifest" == \
       "$(jq -er '.minimalArchive.manifestDigest' "$input")" ]] || return 1
  write_pointer_atomic "$rollback_version" "$rollback_manifest" || return
  docker restart "${project}-api-1" >/dev/null || return
  verify_minimal_pointer_ready || return
  pointer_transaction_update rolled-back || return
  pointer_transaction_armed="false"
  rollback_status="succeeded"
}

commit_pointer_transaction() {
  [[ "$pointer_transaction_armed" == "true" ]] || return 1
  pointer_transaction_update committed || return
  pointer_transaction_armed="false"
}

cleanup_resources_command() {
  cleanup_containers
  if jq -se '
      any(.[];
        .payload.event == "namespace-creating" and
        .payload.details.name? == "prometheus-tsdb"
      )
    ' "$ledger_fd_path" >/dev/null 2>&1; then
    runtime_close_namespace_tree prometheus-tsdb \
      "${root}/observability/prometheus/tsdb" || {
      add_secondary "PROMETHEUS_NAMESPACE_LEDGER_CLOSE_FAILED"
      resource_cleanup_safe="false"
    }
  fi
  cleanup_networks
  cleanup_images
  if docker volume ls -q --filter "label=com.docker.compose.project=${project}" |
    grep -q .; then
    named_volumes_never_observed="false"
    resource_cleanup_safe="false"
    append_residue "named-volume:${project}"
    add_secondary "NAMED_VOLUME_OBSERVED"
  fi
  verify_no_run_resources || {
    add_secondary "RUN_RESOURCE_RESIDUE"
    resource_cleanup_safe="false"
  }
  [[ "$resource_cleanup_safe" == "true" ]] || return 1
  printf 'cleanup-complete:%s\n' "$run_id"
}

cleanup_all() {
  set +e
  local lock_status=0
  acquire_cleanup_lock || lock_status=$?
  if [[ "$lock_status" -eq 10 ]]; then
    path_cleanup_prepared="true"
    cleanup_root_absent="true"
    cleanup_zero_residue="true"
    set -e
    return 0
  fi
  if [[ "$lock_status" -ne 0 ]]; then
    add_secondary "CLEANUP_LOCK_UNAVAILABLE"
    cleanup_status="failed"
    cleanup_zero_residue="false"
    set -e
    return 0
  fi
  if [[ "$mode" == "run" && "$primary_status" == "succeeded" ]]; then
    run_recorded cleanup-resources success cleanup_resources_command || {
      add_secondary "CLEANUP_COMMAND_PROOF_FAILED"
      resource_cleanup_safe="false"
    }
  else
    cleanup_resources_command >/dev/null 2>&1 || true
  fi
  set +e
  if [[ -s "$command_records" ]]; then
    commands_json_cache="$(jq -scS . "$command_records")"
  fi
  if [[ -s "$residue_records" ]]; then
    residues_json_cache="$(
      sort -u "$residue_records" |
        jq -Rsc 'split("\n") | map(select(length > 0))'
    )"
  fi
  build_resource_evidence || {
    add_secondary "RESOURCE_EVIDENCE_FAILED"
    resource_cleanup_safe="false"
  }
  if [[ "$resource_cleanup_safe" != "true" ]] || ! cleanup_paths; then
    cleanup_status="failed"
    cleanup_zero_residue="false"
  fi
  set -e
}

emit_envelope() {
  local commands="$commands_json_cache" residues="$residues_json_cache" secondary="[]"
  if [[ "${#secondary_errors[@]}" -gt 0 ]]; then
    secondary="$(printf '%s\n' "${secondary_errors[@]}" | sort -u |
      jq -Rsc 'split("\n") | map(select(length > 0))')"
  fi
  local primary_json="null"
  [[ -n "$primary_error" ]] && primary_json="$(jq -cn --arg value "$primary_error" '$value')"
  [[ -n "$resources_json" ]] || resources_json="$(
    jq -cnS --arg project "$project" --arg runId "$run_id" '{
      containers:[],
      images:[],
      namedVolumeObserved:false,
      networks:[],
      pathManifest:null,
      port:{hostIp:"127.0.0.1",published:19090,target:8080},
      project:$project,
      runId:$runId,
      schemaVersion:"operations-validation-resources-v1",
      securityProjection:null,
      securityProjectionDigest:null
    }'
  )"
  jq -cnS \
    --arg inputDigest "$input_digest" \
    --arg primaryStatus "$primary_status" \
    --arg rollbackStatus "$rollback_status" \
    --arg cleanupStatus "$cleanup_status" \
    --arg runId "$run_id" \
    --argjson archiveCorruptionRejected "$archive_corruption_rejected" \
    --argjson cleanupRootAbsent "$cleanup_root_absent" \
    --argjson cleanupZeroResidue "$cleanup_zero_residue" \
    --argjson commands "$commands" \
    --argjson continuousHealth "$continuous_health_json" \
    --argjson frontendRollback "$frontend_rollback" \
    --argjson fullHealth "$full_health" \
    --argjson lockContentionRejected "$lock_contention_rejected" \
    --argjson minimalHealth "$minimal_health" \
    --argjson namedVolumesNeverObserved "$named_volumes_never_observed" \
    --argjson postSwitchRollback "$post_switch_rollback" \
    --argjson primaryError "$primary_json" \
    --argjson producer "$producer_json" \
    --argjson reactivatedHealth "$reactivated_health" \
    --argjson residues "$residues" \
    --argjson resources "$resources_json" \
    --argjson rolledBackHealth "$rolled_back_health" \
    --argjson secondaryErrors "$secondary" \
    --argjson updaterFailure "$updater_failure" \
    '{
      inputDigest:$inputDigest,
      outcome:{
        cleanup:{
          namedVolumesNeverObserved:$namedVolumesNeverObserved,
          residue:$residues,
          rootAbsent:$cleanupRootAbsent,
          status:$cleanupStatus,
          zeroResidue:$cleanupZeroResidue
        },
        commands:$commands,
        continuousHealth:$continuousHealth,
        errors:{primary:$primaryError,secondary:$secondaryErrors},
        exercises:{
          remoteExercises:{
            archiveCorruptionRejected:$archiveCorruptionRejected,
            frontendRollback:$frontendRollback,
            lockContentionRejected:$lockContentionRejected,
            postSwitchRollback:$postSwitchRollback,
            updaterFailure:$updaterFailure
          }
        },
        health:{
          full:$fullHealth,
          minimal:$minimalHealth,
          reactivated:$reactivatedHealth,
          rolledBack:$rolledBackHealth
        },
        producer:$producer,
        statuses:{
          cleanup:$cleanupStatus,
          primary:$primaryStatus,
          rollback:$rollbackStatus
        }
      },
      resources:$resources,
      runId:$runId,
      schemaVersion:"operations-validation-remote-v1"
    }'
}


run_watchdog() {
  trap '' HUP
  trap 'exit 0' INT TERM
  verify_owner && verify_input || exit 1
  candidate_version="$(jq -er '.candidate.applicationVersion' "$input")" ||
    exit 1
  [[ "$candidate_version" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] ||
    exit 1
  minimal_data="$(jq -er '.minimalArchive.dataVersion' "$input")" || exit 1
  api_load_reference="$(jq -er '.images.api.declaredLoadReference' "$input")" ||
    exit 1
  api_validation_alias="$(jq -er '.images.api.validationAlias' "$input")" ||
    exit 1
  prometheus_reference="$(jq -er '.images.prometheus.reference' "$input")" ||
    exit 1
  prometheus_validation_alias="$(
    jq -er '.images.prometheus.validationAlias' "$input"
  )" || exit 1
  updater_load_reference="$(
    jq -er '.images.updater.declaredLoadReference' "$input"
  )" || exit 1
  updater_validation_alias="$(
    jq -er '.images.updater.validationAlias' "$input"
  )" || exit 1
  [[ -d "$state_root" && ! -L "$state_root" &&
     "$(stat -c '%u:%g:%a' -- "$state_root")" == "0:0:700" ]] || exit 1
  local sealed_entry self_start self_session observed_main_start observed_main_session
  sealed_entry="$(role_path remote-entry)" || exit 1
  [[ -f "$sealed_entry" && ! -L "$sealed_entry" &&
     "$(sha_file "$sealed_entry")" == "$watchdog_entry_digest" ]] || exit 1
  self_start="$(process_start_time "$$")" || exit 1
  self_session="$(process_session_id "$$")" || exit 1
  observed_main_start="$(process_start_time "$watchdog_main_pid")" || exit 1
  observed_main_session="$(process_session_id "$watchdog_main_pid")" || exit 1
  [[ "$self_session" == "$$" &&
     "$self_session" != "$watchdog_main_session" &&
     "$observed_main_start" == "$watchdog_main_start" &&
     "$observed_main_session" == "$watchdog_main_session" ]] || exit 1
  [[ -f "$watchdog_record" && ! -L "$watchdog_record" &&
     "$(stat -c '%u:%g:%h:%a' -- "$watchdog_record")" == "0:0:1:400" ]] ||
    exit 1
  jq -cnS \
      --arg entryDigest "$watchdog_entry_digest" \
      --arg mainPid "$watchdog_main_pid" \
      --arg mainSession "$watchdog_main_session" \
      --arg mainStart "$watchdog_main_start" \
      --arg runId "$run_id" \
      --arg watchdogPid "$$" \
      --arg watchdogSession "$self_session" \
      --arg watchdogStart "$self_start" \
      '{
        entryDigest:$entryDigest,
        mainPid:$mainPid,
        mainSession:$mainSession,
        mainStart:$mainStart,
        runId:$runId,
        schemaVersion:"operations-validation-watchdog-v1",
        watchdogPid:$watchdogPid,
        watchdogSession:$watchdogSession,
        watchdogStart:$watchdogStart
      }' > "$watchdog_record" || exit 1
  chmod 0400 "$watchdog_record"
  chown 0:0 "$watchdog_record"
  verify_watchdog_self_record || exit 1
  while [[ "$(process_start_time "$watchdog_main_pid" 2>/dev/null || true)" == \
             "$watchdog_main_start" &&
           "$(process_session_id "$watchdog_main_pid" 2>/dev/null || true)" == \
             "$watchdog_main_session" ]]; do
    sleep 2
  done
  [[ ! -e "$root" && ! -L "$root" ]] && exit 0
  ledger_verify_chain || exit 1
  ledger_current_head="$ledger_head"
  [[ "$(jq -rs '.[-1].payload.phase' "$ledger_fd_path")" == "run-owned" ]] ||
    exit 0
  ledger_phase="run-owned"
  if [[ -f "${root}/data/update-status.json" &&
        ! -L "${root}/data/update-status.json" ]]; then
    jq -cS . "${root}/data/update-status.json" |
      cmp --silent "${root}/data/update-status.json" - || exit 1
    full_data="$(jq -er '
      if (
      type == "object" and
      (keys == ["last_attempt","last_success"]) and
      (.last_attempt | type == "object") and
      (.last_attempt | keys == [
        "dataVersion",
        "duration_seconds",
        "error_code",
        "phase",
        "status",
        "time"
      ]) and
      .last_attempt.status == "published" and
      .last_attempt.phase == "complete" and
      .last_attempt.error_code == null and
      (.last_attempt.dataVersion |
        type == "string" and test("^dv1-[0-9a-f]{64}$")) and
      .last_success == .last_attempt
      ) then .last_attempt.dataVersion else empty end
    ' "${root}/data/update-status.json" 2>/dev/null || true)"
    [[ -z "$full_data" ||
       "$full_data" =~ ^dv1-[0-9a-f]{64}$ ]] || exit 1
  fi
  if verify_owner && verify_watchdog_self_record; then
    cleanup_resuming="true"
    rollback_pointer_transaction || exit 1
    cleanup_all
    if [[ "$path_cleanup_prepared" == "true" ]] &&
      finalize_cleanup_root; then
      exit 0
    fi
    exit 1
  fi
  exit 1
}

load_watchdog_identity() {
  local entry_digest="$1"
  [[ -f "$watchdog_record" && ! -L "$watchdog_record" &&
     "$(stat -c '%u:%g:%h:%a' -- "$watchdog_record")" == "0:0:1:400" ]] ||
    return 1
  jq -cS . "$watchdog_record" | cmp --silent "$watchdog_record" - || return 1
  jq -e \
    --arg entryDigest "$entry_digest" \
    --arg mainPid "$$" \
    --arg mainSession "$main_session" \
    --arg mainStart "$main_start" \
    --arg runId "$run_id" '
      type == "object" and
      (keys == [
        "entryDigest",
        "mainPid",
        "mainSession",
        "mainStart",
        "runId",
        "schemaVersion",
        "watchdogPid",
        "watchdogSession",
        "watchdogStart"
      ]) and
      .schemaVersion == "operations-validation-watchdog-v1" and
      .entryDigest == $entryDigest and
      .mainPid == $mainPid and
      .mainSession == $mainSession and
      .mainStart == $mainStart and
      .runId == $runId and
      .watchdogPid == .watchdogSession and
      .watchdogSession != .mainSession and
      (.watchdogPid | test("^[1-9][0-9]*$")) and
      (.watchdogStart | test("^[1-9][0-9]*$"))
    ' "$watchdog_record" >/dev/null || return 1
  watcher_pid="$(jq -er '.watchdogPid' "$watchdog_record")"
  watcher_start="$(jq -er '.watchdogStart' "$watchdog_record")"
  watcher_session="$(jq -er '.watchdogSession' "$watchdog_record")"
  [[ "$(process_start_time "$watcher_pid")" == "$watcher_start" &&
     "$(process_session_id "$watcher_pid")" == "$watcher_session" ]]
}

stop_watchdog() {
  [[ -n "$watcher_pid" ]] || return 0
  [[ "$(process_start_time "$watcher_pid" 2>/dev/null || true)" == \
       "$watcher_start" &&
     "$(process_session_id "$watcher_pid" 2>/dev/null || true)" == \
       "$watcher_session" ]] || {
    add_secondary "WATCHDOG_IDENTITY_CHANGED"
    return 1
  }
  kill -TERM "$watcher_pid" >/dev/null 2>&1 || return 0
  local attempts=0
  while [[ "$(process_start_time "$watcher_pid" 2>/dev/null || true)" == \
             "$watcher_start" ]]; do
    attempts=$((attempts + 1))
    if (( attempts >= 50 )); then
      [[ "$(process_session_id "$watcher_pid" 2>/dev/null || true)" == \
           "$watcher_session" ]] || {
        add_secondary "WATCHDOG_IDENTITY_CHANGED"
        return 1
      }
      kill -KILL "$watcher_pid" >/dev/null 2>&1 || true
      break
    fi
    sleep 0.1
  done
}

finish() {
  local status="$1"
  [[ "$finishing" == "no" ]] || return
  finishing="yes"
  trap - ERR EXIT HUP INT TERM
  set +e
  if [[ "$status" -ne 0 && -z "$primary_error" ]]; then
    set_primary "REMOTE_COMMAND_FAILED"
  fi
  if [[ "$pointer_transaction_armed" == "true" ]] ||
    [[ -f "$pointer_transaction_file" &&
       ! -L "$pointer_transaction_file" &&
       "$(jq -er '.state' "$pointer_transaction_file" 2>/dev/null || true)" == \
         "armed" ]]; then
    rollback_pointer_transaction ||
      add_secondary "POINTER_TRANSACTION_ROLLBACK_FAILED"
  fi
  stop_watchdog || add_secondary "WATCHDOG_STOP_FAILED"
  cleanup_all
  if [[ "$path_cleanup_prepared" == "true" ]]; then
    if finalize_cleanup_root; then
      cleanup_status="succeeded"
    else
      cleanup_status="failed"
      cleanup_zero_residue="false"
    fi
  fi
  if [[ -n "$primary_error" || "$cleanup_status" != "succeeded" ]]; then
    primary_status="failed"
    [[ -n "$primary_error" ]] || set_primary "CLEANUP_FAILED"
  fi
  emit_envelope
  exit 0
}

on_error() {
  set_primary "REMOTE_COMMAND_FAILED"
}

on_signal() {
  set_primary "REMOTE_SIGNALLED"
  exit 143
}

verify_owner || {
  [[ "$mode" == "watchdog" ]] && exit 1
  set_primary "OWNER_SEAL_INVALID"
  exit 1
}
open_authority_fd "$library" "0:0:1:500" \
  "$(jq -er '.libraryDigest' "$marker")" \
  library_authority_fd library_fd_path || {
  [[ "$mode" == "watchdog" ]] && exit 1
  set_primary "LEDGER_LIBRARY_AUTHORITY_INVALID"
  exit 1
}
open_authority_fd "$agent" "0:0:1:500" \
  "$(jq -er '.agentDigest' "$marker")" \
  agent_authority_fd agent_fd_path || {
  [[ "$mode" == "watchdog" ]] && exit 1
  set_primary "TRANSFER_AGENT_AUTHORITY_INVALID"
  exit 1
}
# shellcheck source=/dev/null
source "$library_fd_path"
readonly ledger_run_id="$run_id"
readonly ledger_input_digest="$input_digest"
ledger_open_authority \
  "$(jq -er '.ledgerDevice' "$marker")" \
  "$(jq -er '.ledgerInode' "$marker")" || {
  [[ "$mode" == "watchdog" ]] && exit 1
  set_primary "OWNERSHIP_LEDGER_AUTHORITY_INVALID"
  exit 1
}
ledger_assert_path_binding || {
  [[ "$mode" == "watchdog" ]] && exit 1
  set_primary "OWNERSHIP_LEDGER_PATH_CHANGED"
  exit 1
}
ledger_verify_chain || {
  [[ "$mode" == "watchdog" ]] && exit 1
  set_primary "OWNERSHIP_LEDGER_INVALID"
  exit 1
}
[[ "$ledger_head" == "$expected_ledger_head" ]] || {
  [[ "$mode" == "watchdog" ]] && exit 1
  set_primary "OWNERSHIP_LEDGER_HEAD_CHANGED"
  exit 1
}
ledger_current_head="$ledger_head"

if [[ "$mode" == "watchdog" ]]; then
  inherited_lock_identity="$(
    runtime_state_identity "$(ledger_relative_path "$lock_file")"
  )" || exit 1
  ledger_verify_identity "$inherited_lock_identity" || exit 1
  [[ -r /proc/self/fd/8 &&
     "$(stat -Lc '%d:%i' -- /proc/self/fd/8)" == \
       "$(jq -r '[.device,.inode] | join(":")' \
          <<< "$inherited_lock_identity")" ]] || exit 1
  flock -n 8 || exit 1
  cleanup_lock_fd="8"
  cleanup_lock_held="true"
  run_watchdog
  exit 1
fi

trap on_error ERR
trap 'finish "$?"' EXIT
trap on_signal HUP INT TERM

verify_input || {
  set_primary "INPUT_SEAL_INVALID"
  exit 1
}
candidate_version="$(jq -er '.candidate.applicationVersion' "$input")"
[[ "$candidate_version" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] ||
  fail "APPLICATION_VERSION_INVALID"
minimal_data="$(jq -er '.minimalArchive.dataVersion' "$input")" ||
  fail "MINIMAL_ARCHIVE_IDENTITY_INVALID"

if [[ "$mode" == "recover" ]]; then
  trap - ERR EXIT HUP INT TERM
  [[ "$(jq -rs '.[-1].payload.phase' "$ledger_fd_path")" == "run-owned" ]] ||
    exit 1
  ledger_phase="run-owned"
  cleanup_resuming="true"
  rollback_pointer_transaction || exit 1
  cleanup_all || cleanup_status="failed"
  if [[ "$path_cleanup_prepared" == "true" ]] &&
    finalize_cleanup_root; then
    cleanup_status="succeeded"
  else
    cleanup_status="failed"
  fi
  [[ "$cleanup_status" == "succeeded" ]] || exit 1
  jq -cnS '{rootAbsent:true,status:"succeeded"}'
  exit 0
fi

runtime_create_directory "$state_root" 0700 0 0 ||
  fail "STATE_LEDGER_CREATE_FAILED"
runtime_create_directory "$evidence_root" 0700 0 0 ||
  fail "EVIDENCE_LEDGER_CREATE_FAILED"
for candidate in \
  "$container_records" \
  "$network_records" \
  "$image_records" \
  "$command_records" \
  "$residue_records"; do
  runtime_create_file "$candidate" 0600 0 0 yes ||
    fail "RUNTIME_LEDGER_CREATE_FAILED"
done
runtime_create_file "$watchdog_record" 0400 0 0 yes ||
  fail "WATCHDOG_LEDGER_CREATE_FAILED"
runtime_create_file "$lock_file" 0600 0 0 no ||
  fail "LOCK_LEDGER_CREATE_FAILED"
exec 8<"$lock_file"
flock -n 8 || fail "LOCK_ACQUIRE_FAILED"
cleanup_lock_fd="8"
cleanup_lock_held="true"

# A HUP-immune, new-session watchdog invokes the same sealed entry in recovery
# mode if the SSH-owned main process disappears without reaching its EXIT trap.
readonly entry_path="$(role_path remote-entry)"
readonly entry_expected="$(jq -er \
  '.transfer.files[] | select(.role == "remote-entry") | .sha256' "$input")"
[[ -f "$entry_path" && ! -L "$entry_path" &&
   "$(sha_file "$entry_path")" == "$entry_expected" ]] ||
  fail "WATCHDOG_ENTRY_INVALID"
open_authority_fd "$entry_path" "0:0:1:500" "$entry_expected" \
  entry_authority_fd entry_fd_path ||
  fail "WATCHDOG_ENTRY_AUTHORITY_INVALID"
main_start="$(process_start_time "$$")"
main_session="$(process_session_id "$$")"
[[ "$main_start" =~ ^[1-9][0-9]*$ && "$main_session" =~ ^[1-9][0-9]*$ ]] ||
  fail "WATCHDOG_MAIN_IDENTITY_INVALID"
setsid --fork /usr/bin/bash "$entry_fd_path" \
  --watchdog "$run_id" "$input_digest" "$marker_digest" "$ledger_current_head" \
  "$$" "$main_start" "$main_session" "$entry_expected" \
  </dev/null >/dev/null 2>&1 &
watchdog_launcher="$!"
wait "$watchdog_launcher" || fail "WATCHDOG_LAUNCH_FAILED"
watchdog_started="$(date +%s)"
until load_watchdog_identity "$entry_expected"; do
  (( $(date +%s) - watchdog_started < 30 )) ||
    fail "WATCHDOG_REGISTRATION_FAILED"
  sleep 0.1
done
runtime_close_object "$watchdog_record" ||
  fail "WATCHDOG_LEDGER_CLOSE_FAILED"
successor_identity="$(
  runtime_state_identity "$(ledger_relative_path "$watchdog_record")"
)" || fail "WATCHDOG_SUCCESSOR_IDENTITY_INVALID"
ledger_verify_identity "$successor_identity" ||
  fail "WATCHDOG_SUCCESSOR_IDENTITY_INVALID"
predecessor_head="$ledger_current_head"
successor_details="$(
  jq -cnS \
    --arg mainPid "$$" \
    --arg mainSession "$main_session" \
    --arg mainStart "$main_start" \
    --arg predecessorHead "$predecessor_head" \
    --arg watchdogPid "$watcher_pid" \
    --arg watchdogSession "$watcher_session" \
    --arg watchdogStart "$watcher_start" \
    --argjson identity "$successor_identity" \
    '{
      identity:$identity,
      mainPid:$mainPid,
      mainSession:$mainSession,
      mainStart:$mainStart,
      predecessorHead:$predecessorHead,
      watchdogPid:$watchdogPid,
      watchdogSession:$watchdogSession,
      watchdogStart:$watchdogStart
    }'
)" || fail "WATCHDOG_SUCCESSOR_ACK_FAILED"
ledger_append_entry successor-lease-closed "$successor_details" ||
  fail "WATCHDOG_SUCCESSOR_ACK_FAILED"
ack_head="$ledger_current_head"
process_identity_live "$$" "$main_start" "$main_session" &&
  process_identity_live \
    "$watcher_pid" "$watcher_start" "$watcher_session" ||
  fail "WATCHDOG_SUCCESSOR_NOT_LIVE"
handoff_deadline="$(( $(date +%s) + 25200 ))"
handoff_response="$(
  /usr/bin/bash "$agent_fd_path" handoff \
    "$run_id" "$input_digest" "$marker_digest" "$ack_head" \
    "$handoff_deadline" "$successor_identity" \
    "$$" "$main_start" "$main_session" \
    "$watcher_pid" "$watcher_start" "$watcher_session" \
    "$ack_head" </dev/null
)" || fail "WATCHDOG_HANDOFF_FAILED"
ledger_current_head="$(jq -er '.ledgerHead' <<< "$handoff_response")" ||
  fail "WATCHDOG_HANDOFF_FAILED"
ledger_verify_chain &&
  [[ "$ledger_head" == "$ledger_current_head" ]] ||
  fail "WATCHDOG_HANDOFF_FAILED"
ledger_phase="run-owned"

run_recorded lock-contention failure \
  flock -n "$lock_file" true ||
  fail "LOCK_CONTENTION_NOT_REJECTED"
lock_contention_rejected="$(command_proof lock-contention)" ||
  fail "LOCK_CONTENTION_PROOF_FAILED"

readonly compose_path="${root}/compose/compose.yaml"
readonly overlay_path="${root}/compose/run-overlay.yaml"
readonly environment_path="${root}/compose/release.env"
readonly release_root="${root}/releases/${candidate_version}"
readonly smoke_path="${release_root}/bin/archive-smoke"
readonly prometheus_root="${root}/observability/prometheus"
readonly updater_current_mask="${root}/compose/updater-current-deny"
runtime_create_directory "${root}/compose" 0755 0 0 ||
  fail "COMPOSE_ROOT_LEDGER_CREATE_FAILED"
runtime_create_directory "${root}/releases" 0755 0 0 ||
  fail "RELEASES_ROOT_LEDGER_CREATE_FAILED"
runtime_create_directory "$release_root" 0755 0 0 ||
  fail "RELEASE_ROOT_LEDGER_CREATE_FAILED"
runtime_create_directory "${release_root}/bin" 0755 0 0 ||
  fail "RELEASE_BIN_LEDGER_CREATE_FAILED"
runtime_create_directory "${root}/observability" 0755 0 0 ||
  fail "OBSERVABILITY_ROOT_LEDGER_CREATE_FAILED"
runtime_create_directory "$prometheus_root" 0755 0 0 ||
  fail "PROMETHEUS_ROOT_LEDGER_CREATE_FAILED"
runtime_create_directory "$data_root" 1770 0 65532 ||
  fail "DATA_ROOT_LEDGER_CREATE_FAILED"
runtime_create_directory "${data_root}/versions" 1770 0 65532 ||
  fail "DATA_VERSIONS_LEDGER_CREATE_FAILED"
runtime_create_directory "${prometheus_root}/tsdb" 0700 65532 65532 ||
  fail "PROMETHEUS_TSDB_LEDGER_CREATE_FAILED"
runtime_install_file "$(role_path compose)" "$compose_path" 0444 0 0 ||
  fail "COMPOSE_FILE_LEDGER_CREATE_FAILED"
runtime_install_file "$(role_path run-overlay)" "$overlay_path" 0444 0 0 ||
  fail "OVERLAY_FILE_LEDGER_CREATE_FAILED"
runtime_install_file "$(role_path release-environment)" "$environment_path" \
  0600 0 0 || fail "ENVIRONMENT_FILE_LEDGER_CREATE_FAILED"
runtime_install_file "$(role_path prometheus-config)" \
  "${prometheus_root}/prometheus.yml" 0444 0 0 ||
  fail "PROMETHEUS_CONFIG_LEDGER_CREATE_FAILED"
runtime_install_file "$(role_path prometheus-rules)" \
  "${prometheus_root}/rules.yml" 0444 0 0 ||
  fail "PROMETHEUS_RULES_LEDGER_CREATE_FAILED"
runtime_install_file "$(role_path archive-smoke)" "$smoke_path" 0555 0 0 ||
  fail "ARCHIVE_SMOKE_LEDGER_CREATE_FAILED"
runtime_create_file "$updater_current_mask" 0000 0 0 yes ||
  fail "UPDATER_MASK_LEDGER_CREATE_FAILED"
printf '%s\n' 'validation updater current pointer deny mask' > "$updater_current_mask"
chmod 0000 "$updater_current_mask"
chown 0:0 "$updater_current_mask"
runtime_close_object "$updater_current_mask" ||
  fail "UPDATER_MASK_LEDGER_CLOSE_FAILED"

readonly frontend_archive="$(role_path frontend)"
frontend_install_command() {
  runtime_create_file "$frontend_listing" 0600 0 0 yes || return
  runtime_create_file "$frontend_verbose" 0600 0 0 yes || return
  tar -tf "$frontend_archive" > "$frontend_listing" || return
  tar -tvf "$frontend_archive" > "$frontend_verbose" || return
  runtime_close_object "$frontend_listing" || return
  runtime_close_object "$frontend_verbose" || return
  awk '
    {
      path=$0
      sub(/\/$/, "", path)
      if (path !~ /^frontend(\/[A-Za-z0-9][A-Za-z0-9._-]{0,254})+$/) exit 1
      if (seen[path]++) exit 1
      count++
    }
    END { if (count < 2 || !seen["frontend/index.html"]) exit 1 }
  ' "$frontend_listing" || return
  awk '
    $1 !~ /^-/ { exit 1 }
    $3 !~ /^[0-9]+$/ || $3 > 67108864 { exit 1 }
    { count++; total += $3 }
    END { if (count > 8192 || total > 536870912) exit 1 }
  ' "$frontend_verbose" || return
  runtime_tree_intent "$frontend_archive" "${release_root}/frontend" \
    "$frontend_listing" || return
  tar --extract --file "$frontend_archive" --directory "$release_root" \
    --no-same-owner --no-same-permissions --keep-old-files || return
  while IFS= read -r -d '' candidate; do
    chmod 0444 "$candidate" && chown 0:0 "$candidate" || return
  done < <(find "${release_root}/frontend" -type f -print0)
  while IFS= read -r -d '' candidate; do
    chmod 0555 "$candidate" && chown 0:0 "$candidate" || return
  done < <(find "${release_root}/frontend" -type d -print0)
  runtime_change_metadata "$release_root" 0555 0 0 || return
  runtime_change_metadata "${release_root}/bin" 0555 0 0 || return
  runtime_register_tree "${release_root}/frontend" || return
  printf 'frontend-installed\n'
}

frontend_hash_command() {
  runtime_create_symlink "releases/${candidate_version}/frontend" \
    "${root}/.frontend-link" || return
  runtime_replace_owned "${root}/.frontend-link" "${root}/current-frontend" ||
    return
  find "${release_root}/frontend" -type f -print0 |
    sort -z |
    while IFS= read -r -d '' candidate; do
      printf '%s\t%s\n' \
        "${candidate#${release_root}/frontend/}" "$(sha_file "$candidate")"
    done |
    sha256sum |
    awk '{print "sha256:" $1}'
}

frontend_rollback_command() {
  runtime_create_symlink "releases/${candidate_version}/missing" \
    "${root}/.frontend-link" || return
  runtime_replace_owned "${root}/.frontend-link" "${root}/current-frontend" ||
    return
  [[ ! -e "${root}/current-frontend/index.html" ]] || return 1
  runtime_create_symlink "releases/${candidate_version}/frontend" \
    "${root}/.frontend-link" || return
  runtime_replace_owned "${root}/.frontend-link" "${root}/current-frontend" ||
    return
  local observed
  observed="$(
    find "${release_root}/frontend" -type f -print0 |
      sort -z |
      while IFS= read -r -d '' candidate; do
        printf '%s\t%s\n' \
          "${candidate#${release_root}/frontend/}" "$(sha_file "$candidate")"
      done |
      sha256sum |
      awk '{print "sha256:" $1}'
  )" || return
  [[ -f "${root}/current-frontend/index.html" &&
     "$frontend_tree_digest" == "$observed" ]] || return 1
  printf 'frontend-rollback:%s\n' "$observed"
}

run_recorded frontend-install success frontend_install_command ||
  fail "FRONTEND_INSTALL_FAILED"
run_recorded frontend-hash success frontend_hash_command ||
  fail "FRONTEND_HASH_FAILED"
frontend_tree_digest="$(tail -n 1 "${evidence_root}/command-frontend-hash.log")"
readonly frontend_tree_digest
[[ "$frontend_tree_digest" =~ ^sha256:[0-9a-f]{64}$ ]] ||
  fail "FRONTEND_TREE_DIGEST_INVALID"
run_recorded frontend-rollback success frontend_rollback_command ||
  fail "FRONTEND_ROLLBACK_FAILED"
frontend_rollback="$(command_proof frontend-rollback)" ||
  fail "FRONTEND_ROLLBACK_PROOF_FAILED"

minimal_data="$(jq -er '.minimalArchive.dataVersion' "$input")"
readonly minimal_version="${data_root}/versions/${minimal_data}"
runtime_create_directory "$minimal_version" 0550 0 65532 ||
  fail "MINIMAL_VERSION_LEDGER_CREATE_FAILED"
runtime_install_file "$(role_path minimal-manifest)" \
  "${minimal_version}/manifest.json" 0440 0 65532 ||
  fail "MINIMAL_MANIFEST_LEDGER_CREATE_FAILED"
runtime_install_file "$(role_path minimal-sqlite)" \
  "${minimal_version}/bangumi.sqlite" 0440 0 65532 ||
  fail "MINIMAL_SQLITE_LEDGER_CREATE_FAILED"
runtime_create_file "${data_root}/current.json" 0644 0 0 yes ||
  fail "CURRENT_POINTER_LEDGER_CREATE_FAILED"
jq -cnS \
  --arg dataVersion "$minimal_data" \
  --arg manifestDigest "$(sha_file "${minimal_version}/manifest.json")" \
  '{dataVersion:$dataVersion,manifestDigest:$manifestDigest,pointerSchemaVersion:1}' \
  > "${data_root}/current.json"
chmod 0644 "${data_root}/current.json"
chown 0:0 "${data_root}/current.json"
runtime_close_object "${data_root}/current.json" ||
  fail "CURRENT_POINTER_LEDGER_CLOSE_FAILED"

readonly api_load_ref="$(jq -er '.images.api.declaredLoadReference' "$input")"
readonly updater_load_ref="$(jq -er '.images.updater.declaredLoadReference' "$input")"
readonly api_alias="$(jq -er '.images.api.validationAlias' "$input")"
readonly updater_alias="$(jq -er '.images.updater.validationAlias' "$input")"
readonly prometheus_ref="$(jq -er '.images.prometheus.reference' "$input")"
readonly prometheus_alias="$(jq -er '.images.prometheus.validationAlias' "$input")"
api_image_intent="$(
  jq -cnS \
    --arg configDigest "$(jq -er '.images.api.config.digest' "$input")" \
    --arg manifestDigest "$(jq -er '.images.api.manifest.digest' "$input")" \
    --arg first "$api_load_ref" \
    --arg second "$api_alias" \
    '{
      configDigest:$configDigest,
      manifestDigest:$manifestDigest,
      references:([$first,$second] | sort),
      role:"api"
    }'
)"
ledger_resource_event resource-creating image "$api_image_intent" ||
  fail "API_IMAGE_LEDGER_INTENT_FAILED"
run_recorded image-load-api success docker load --input "$(role_path api-image)" ||
  fail "API_IMAGE_LOAD_FAILED"
readonly api_runtime="$(docker image inspect --format '{{.Id}}' "$api_load_ref")"
[[ "$api_runtime" == "$(jq -er '.images.api.config.digest' "$input")" ]] ||
  fail "API_IMAGE_CONFIG_MISMATCH"
docker tag "$api_load_ref" "$api_alias"
oci_archive_graph_identity "$(role_path api-image)" "$api_load_ref" \
  "$(jq -er '.images.api.manifest.digest' "$input")" \
  "$(jq -er '.images.api.config.digest' "$input")" >/dev/null ||
  fail "API_IMAGE_ARCHIVE_GRAPH_MISMATCH"
api_rootfs="$(image_rootfs_diff_ids "$api_load_ref")" ||
  fail "API_IMAGE_ROOTFS_MISMATCH"
readonly api_rootfs
[[ "$api_rootfs" == "$(jq -ceS '.images.api.rootfsDiffIds' "$input")" ]] ||
  fail "API_IMAGE_ROOTFS_MISMATCH"
api_graph="$(image_runtime_graph_digest "$api_runtime" "$api_rootfs")" ||
  fail "API_IMAGE_GRAPH_MISMATCH"
readonly api_graph
[[ "$api_graph" == "$(jq -er '.images.api.graphDigest' "$input")" ]] ||
  fail "API_IMAGE_GRAPH_MISMATCH"
record_image api \
  "$(jq -er '.images.api.manifest.digest' "$input")" \
  "$(jq -er '.images.api.config.digest' "$input")" \
  "$api_runtime" "$api_load_ref" "$api_alias" "$api_graph" "$api_rootfs"

updater_image_intent="$(
  jq -cnS \
    --arg configDigest "$(jq -er '.images.updater.config.digest' "$input")" \
    --arg manifestDigest "$(jq -er '.images.updater.manifest.digest' "$input")" \
    --arg first "$updater_load_ref" \
    --arg second "$updater_alias" \
    '{
      configDigest:$configDigest,
      manifestDigest:$manifestDigest,
      references:([$first,$second] | sort),
      role:"updater"
    }'
)"
ledger_resource_event resource-creating image "$updater_image_intent" ||
  fail "UPDATER_IMAGE_LEDGER_INTENT_FAILED"
run_recorded image-load-updater success docker load --input "$(role_path updater-image)" ||
  fail "UPDATER_IMAGE_LOAD_FAILED"
readonly updater_runtime="$(docker image inspect --format '{{.Id}}' "$updater_load_ref")"
[[ "$updater_runtime" == "$(jq -er '.images.updater.config.digest' "$input")" ]] ||
  fail "UPDATER_IMAGE_CONFIG_MISMATCH"
docker tag "$updater_load_ref" "$updater_alias"
oci_archive_graph_identity "$(role_path updater-image)" "$updater_load_ref" \
  "$(jq -er '.images.updater.manifest.digest' "$input")" \
  "$(jq -er '.images.updater.config.digest' "$input")" >/dev/null ||
  fail "UPDATER_IMAGE_ARCHIVE_GRAPH_MISMATCH"
updater_rootfs="$(image_rootfs_diff_ids "$updater_load_ref")" ||
  fail "UPDATER_IMAGE_ROOTFS_MISMATCH"
readonly updater_rootfs
[[ "$updater_rootfs" == \
   "$(jq -ceS '.images.updater.rootfsDiffIds' "$input")" ]] ||
  fail "UPDATER_IMAGE_ROOTFS_MISMATCH"
updater_graph="$(
  image_runtime_graph_digest "$updater_runtime" "$updater_rootfs"
)" || fail "UPDATER_IMAGE_GRAPH_MISMATCH"
readonly updater_graph
[[ "$updater_graph" == "$(jq -er '.images.updater.graphDigest' "$input")" ]] ||
  fail "UPDATER_IMAGE_GRAPH_MISMATCH"
record_image updater \
  "$(jq -er '.images.updater.manifest.digest' "$input")" \
  "$(jq -er '.images.updater.config.digest' "$input")" \
  "$updater_runtime" "$updater_load_ref" "$updater_alias" "$updater_graph" \
  "$updater_rootfs"

readonly manifest_inspect="${evidence_root}/prometheus-manifest.json"
runtime_create_file "$manifest_inspect" 0600 0 0 yes ||
  fail "PROMETHEUS_MANIFEST_LEDGER_CREATE_FAILED"
docker manifest inspect --verbose "$prometheus_ref" > "$manifest_inspect"
runtime_close_object "$manifest_inspect" ||
  fail "PROMETHEUS_MANIFEST_LEDGER_CLOSE_FAILED"
[[ "$(stat -c '%s' "$manifest_inspect")" -le "$maximum_output" ]] ||
  fail "PROMETHEUS_MANIFEST_OUTPUT_LIMIT"
jq -e \
  --arg digest "$(jq -er '.images.prometheus.amd64ManifestDigest' "$input")" \
  --argjson size "$(jq -er '.images.prometheus.amd64ManifestSize' "$input")" '
    if type == "array" then
      any(.[];
        .Descriptor.digest == $digest and
        .Descriptor.size == $size and
        .Descriptor.platform.os == "linux" and
        .Descriptor.platform.architecture == "amd64"
      )
    else false
    end
  ' "$manifest_inspect" >/dev/null || fail "PROMETHEUS_PLATFORM_MISMATCH"
readonly prometheus_config="$(
  jq -er \
    --arg digest "$(jq -er '.images.prometheus.amd64ManifestDigest' "$input")" '
      .[] |
      select(.Descriptor.digest == $digest) |
      .SchemaV2Manifest.config.digest
    ' "$manifest_inspect"
)"
[[ "$prometheus_config" =~ ^sha256:[0-9a-f]{64}$ ]] ||
  fail "PROMETHEUS_CONFIG_IDENTITY_INVALID"
prometheus_image_intent="$(
  jq -cnS \
    --arg configDigest "$prometheus_config" \
    --arg manifestDigest "$(jq -er \
      '.images.prometheus.amd64ManifestDigest' "$input")" \
    --arg first "$prometheus_ref" \
    --arg second "$prometheus_alias" \
    '{
      configDigest:$configDigest,
      manifestDigest:$manifestDigest,
      references:([$first,$second] | sort),
      role:"prometheus"
    }'
)"
ledger_resource_event resource-creating image "$prometheus_image_intent" ||
  fail "PROMETHEUS_IMAGE_LEDGER_INTENT_FAILED"
run_recorded image-pull-prometheus success \
  docker pull --platform linux/amd64 "$prometheus_ref" ||
  fail "PROMETHEUS_PULL_FAILED"
readonly prometheus_runtime="$(docker image inspect --format '{{.Id}}' "$prometheus_ref")"
[[ "$prometheus_runtime" == "$prometheus_config" &&
   "$(docker image inspect --format '{{.Architecture}}/{{.Os}}' "$prometheus_ref")" == "amd64/linux" &&
   "$(docker image inspect --format '{{.Config.User}}' "$prometheus_ref")" == "65532" ]] ||
  fail "PROMETHEUS_RUNTIME_POLICY_MISMATCH"
if docker image inspect "$prometheus_ref" |
  jq -e '.[0].Config.Entrypoint + (.[0].Config.Cmd // []) |
    any(.[]; test("(^|/)(sh|bash)$"))' >/dev/null; then
  fail "PROMETHEUS_SHELL_DEPENDENCY"
fi
docker tag "$prometheus_ref" "$prometheus_alias"
prometheus_graph_identity "$manifest_inspect" \
  "$(jq -er '.images.prometheus.indexDigest' "$input")" \
  "$(jq -er '.images.prometheus.amd64ManifestDigest' "$input")" \
  "$prometheus_config" \
  "$(jq -er '.images.prometheus.amd64ManifestSize' "$input")" >/dev/null ||
  fail "PROMETHEUS_IMAGE_MANIFEST_GRAPH_MISMATCH"
prometheus_rootfs="$(image_rootfs_diff_ids "$prometheus_ref")" ||
  fail "PROMETHEUS_IMAGE_ROOTFS_MISMATCH"
readonly prometheus_rootfs
prometheus_graph="$(
  image_runtime_graph_digest "$prometheus_config" "$prometheus_rootfs"
)" || fail "PROMETHEUS_IMAGE_GRAPH_MISMATCH"
readonly prometheus_graph
record_image prometheus \
  "$(jq -er '.images.prometheus.amd64ManifestDigest' "$input")" \
  "$prometheus_config" "$prometheus_runtime" "$prometheus_ref" \
  "$prometheus_alias" "$prometheus_graph" "$prometheus_rootfs"

declare -a compose=(
  docker compose
  --project-name "$project"
  --file "$compose_path"
  --file "$overlay_path"
  --env-file "$environment_path"
)
run_recorded compose-config success "${compose[@]}" config --quiet ||
  fail "COMPOSE_CONFIG_FAILED"
for name in "${project}_outbound" "${project}_runtime"; do
  network_intent="$(
    jq -cnS \
      --arg name "$name" \
      --arg project "$project" \
      --arg runId "$run_id" \
      '{name:$name,project:$project,runId:$runId}'
  )"
  ledger_resource_event resource-creating network "$network_intent" ||
    fail "NETWORK_LEDGER_INTENT_FAILED"
done
for service in api prometheus; do
  container_intent="$(
    jq -cnS \
      --arg name "${project}-${service}-1" \
      --arg project "$project" \
      --arg runId "$run_id" \
      --arg service "$service" \
      '{name:$name,project:$project,runId:$runId,service:$service}'
  )"
  ledger_resource_event resource-creating container "$container_intent" ||
    fail "CONTAINER_LEDGER_INTENT_FAILED"
done
run_recorded compose-create success "${compose[@]}" --profile oneshot \
  create --no-build --no-recreate api prometheus ||
  fail "COMPOSE_CREATE_FAILED"
for name in "${project}-api-1" "${project}-prometheus-1"; do
  identifier="$(docker inspect --format '{{.Id}}' "$name")" ||
    fail "COMPOSE_CONTAINER_MISSING"
  service="$(docker inspect --format \
    '{{index .Config.Labels "com.docker.compose.service"}}' "$identifier")"
  record_container "$identifier" "$service"
done
record_network "${project}_outbound"
record_network "${project}_runtime"
[[ "$(docker network inspect --format '{{.Internal}}' "${project}_runtime")" == "true" &&
   "$(docker network inspect --format '{{.Internal}}' "${project}_outbound")" == "false" ]] ||
  fail "NETWORK_ISOLATION_MISMATCH"
docker inspect "${project}-api-1" |
  jq -e \
    --arg appVersion "$candidate_version" \
    --arg data "$data_root" \
    --arg revision "$(jq -er '.source.product.revision' "$input")" \
    --arg run "$run_id" '
      .[0] |
      .Config.User == "65532:65532" and
      .Config.Labels["fun.bgmss.role"] == "api" and
      .Config.Labels["fun.bgmss.app-version"] == $appVersion and
      .Config.Labels["fun.bgmss.validation-run"] == $run and
      .Config.Labels["fun.bgmss.app-revision"] == $revision and
      .HostConfig.Init == true and
      .HostConfig.ReadonlyRootfs == true and
      .HostConfig.Privileged == false and
      .HostConfig.CapDrop == ["ALL"] and
      (.HostConfig.SecurityOpt | index("no-new-privileges:true") != null) and
      .HostConfig.Memory == 1610612736 and
      .HostConfig.NanoCpus == 1500000000 and
      .HostConfig.PidsLimit == 256 and
      .HostConfig.RestartPolicy.Name == "unless-stopped" and
      .HostConfig.LogConfig.Type == "journald" and
      .HostConfig.LogConfig.Config.tag == "bgmss_ops_validation-api" and
      .HostConfig.PortBindings["8080/tcp"] == [{
        HostIp:"127.0.0.1",
        HostPort:"19090"
      }] and
      ([.Mounts[] | select(.Destination == "/var/lib/bgmss/archive")] |
        length == 1 and .[0].Source == $data and .[0].RW == false) and
      (.NetworkSettings.Networks | keys | sort) ==
        ["bgmss_ops_validation_outbound","bgmss_ops_validation_runtime"]
    ' >/dev/null || fail "API_RUNTIME_POLICY_MISMATCH"
docker inspect "${project}-prometheus-1" |
  jq -e \
    --arg config "${prometheus_root}/prometheus.yml" \
    --arg rules "${prometheus_root}/rules.yml" \
    --arg run "$run_id" \
    --arg tsdb "${prometheus_root}/tsdb" '
      .[0] |
      .Config.User == "65532:65532" and
      .Config.Labels["fun.bgmss.role"] == "prometheus" and
      .Config.Labels["fun.bgmss.validation-run"] == $run and
      .HostConfig.Init == true and
      .HostConfig.ReadonlyRootfs == true and
      .HostConfig.Privileged == false and
      .HostConfig.CapDrop == ["ALL"] and
      (.HostConfig.SecurityOpt | index("no-new-privileges:true") != null) and
      .HostConfig.Memory == 536870912 and
      .HostConfig.NanoCpus == 500000000 and
      .HostConfig.PidsLimit == 128 and
      .HostConfig.RestartPolicy.Name == "unless-stopped" and
      .HostConfig.LogConfig.Type == "journald" and
      .HostConfig.LogConfig.Config.tag == "bgmss_ops_validation-prometheus" and
      ([.Mounts[] | select(.Destination == "/etc/prometheus/prometheus.yml")] |
        length == 1 and .[0].Source == $config and .[0].RW == false) and
      ([.Mounts[] | select(.Destination == "/etc/prometheus/rules.yml")] |
        length == 1 and .[0].Source == $rules and .[0].RW == false) and
      ([.Mounts[] | select(.Destination == "/prometheus")] |
        length == 1 and .[0].Source == $tsdb and .[0].RW == true) and
      (.NetworkSettings.Networks | keys) == ["bgmss_ops_validation_runtime"]
    ' >/dev/null || fail "PROMETHEUS_CONTAINER_POLICY_MISMATCH"
prometheus_actor="$(
  jq -cse '
    map(select(.service == "prometheus")) |
    if length == 1 then .[0] else error("prometheus identity") end
  ' "$container_records"
)" || fail "PROMETHEUS_RESOURCE_LEDGER_INVALID"
runtime_namespace_intent prometheus-tsdb "${prometheus_root}/tsdb" \
  "$prometheus_actor" || fail "PROMETHEUS_NAMESPACE_LEDGER_INTENT_FAILED"

health_state_command() {
  local expected="$1"
  local expected_manifest="$2"
  local label="$3"
  local reuse="${4:-no}"
  local live="${evidence_root}/${label}-live"
  local ready="${evidence_root}/${label}-ready"
  local metrics="${evidence_root}/${label}-metrics"
  local catalog="${evidence_root}/${label}-catalog"
  local query_request="${evidence_root}/${label}-rankings-request"
  local query_response="${evidence_root}/${label}-rankings-response"
  local query_projection="${evidence_root}/${label}-rankings-projection"
  local prometheus_output="${evidence_root}/${label}-prometheus-query"
  local prometheus_projection="${evidence_root}/${label}-prometheus-projection"
  local output
  for output in \
    "$live" \
    "$ready" \
    "$metrics" \
    "$catalog" \
    "$query_request" \
    "$query_response" \
    "$query_projection" \
    "$prometheus_output" \
    "$prometheus_projection"; do
    if [[ "$reuse" == "yes" ]]; then
      runtime_open_mutation "$output" || return
    else
      runtime_create_file "$output" 0600 0 0 yes || return
    fi
  done
  local started
  started="$(date +%s)"
  while true; do
    if curl --fail --silent --show-error --max-time 5 --max-filesize 1048576 \
      http://127.0.0.1:19090/livez > "$live" 2>/dev/null &&
      curl --fail --silent --show-error --max-time 5 --max-filesize 1048576 \
        http://127.0.0.1:19090/readyz > "$ready" 2>/dev/null &&
      jq -e --arg data "$expected" '.meta.dataVersion == $data' "$ready" >/dev/null; then
      break
    fi
    (( $(date +%s) - started < 60 )) || return 1
    sleep 1
  done
  curl --fail --silent --show-error --max-time 5 --max-filesize 1048576 \
    http://127.0.0.1:19090/metrics > "$metrics" || return
  curl --fail --silent --show-error --max-time 10 --max-filesize 1048576 \
    http://127.0.0.1:19090/api/v1/catalog > "$catalog" || return
  jq -e --arg data "$expected" '.meta.dataVersion == $data' "$catalog" \
    >/dev/null || return
  local position_key subject_type
  position_key="$(jq -er '
    .data.positions |
    map(select(
      .status == "selectable" and
      (.capabilities | index("rankings")) != null
    )) |
    sort_by(.displayOrder, .key) |
    .[0].key
  ' "$catalog")" || return 1
  subject_type="$(jq -er --arg key "$position_key" '
    .data.positions[] |
    select(.key == $key) |
    .subjectType
  ' "$catalog")" || return 1
  jq -cnS \
    --arg key "$position_key" \
    --arg subjectType "$subject_type" \
    '{
      query:{
        positionKeys:[$key],
        scope:"global",
        subjectType:$subjectType
      },
      view:{page:1,pageSize:5}
    }' > "$query_request" || return
  curl --fail --silent --show-error --max-time 30 --max-filesize 1048576 \
    --header 'Content-Type: application/json' \
    --data-binary "@${query_request}" \
    http://127.0.0.1:19090/api/v1/rankings > "$query_response" || return
  jq -e --arg data "$expected" '
    .meta.dataVersion == $data and
    .meta.pagination.page == 1 and
    .meta.pagination.pageSize == 5 and
    (.data.items | type == "array") and
    (.data.items | length <= 5)
  ' "$query_response" >/dev/null || return
  jq -cS '{
    data:.data,
    meta:{
      dataVersion:.meta.dataVersion,
      pagination:.meta.pagination
    }
  }' "$query_response" > "$query_projection" || return
  local app_version app_revision
  app_version="$(jq -er '.candidate.applicationVersion' "$input")" || return
  app_revision="$(jq -er '.source.product.revision' "$input")" || return
  awk -v version="$app_version" -v revision="$app_revision" -v data="$expected" '
    /^bgmss_build_info\{/ &&
      index($1, "version=\"" version "\"") &&
      index($1, "commit=\"" revision "\"") && $2 == "1" { build=1 }
    /^bgmss_current_snapshot_info\{/ &&
      index($1, "data_version=\"" data "\"") && $2 == "1" { snapshot=1 }
    END { exit !(build && snapshot) }
  ' "$metrics" || return
  local prometheus_identifier started
  prometheus_identifier="$(
    docker inspect --format '{{.Id}}' "${project}-prometheus-1"
  )" || return
  started="$(date +%s)"
  while true; do
    if docker exec "$prometheus_identifier" /bin/promtool query instant \
      http://127.0.0.1:9090 'up{job="bgmss-api"}' \
      > "$prometheus_output" 2>/dev/null &&
      [[ "$(stat -c '%s' "$prometheus_output")" -le 1048576 ]] &&
      grep -q '=> 1' "$prometheus_output"; then
      break
    fi
    (( $(date +%s) - started < 90 )) || return 1
    sleep 2
  done
  sed -E 's/[[:space:]]+@\[[^]]+\]$//' "$prometheus_output" |
    sort > "$prometheus_projection" || return
  grep -q '=> 1' "$prometheus_projection" || return 1
  for output in \
    "$live" \
    "$ready" \
    "$metrics" \
    "$catalog" \
    "$query_request" \
    "$query_response" \
    "$query_projection" \
    "$prometheus_output" \
    "$prometheus_projection"; do
    runtime_close_object "$output" || return
  done
  local api_inspect prometheus_inspect pointer_mode
  local build_digest ready_digest metrics_digest typed_digest prometheus_digest
  local query_result_digest prometheus_scrape_digest
  local api_security prometheus_security api_started prometheus_started
  query_result_digest="$(sha_file "$query_projection")" || return
  prometheus_scrape_digest="$(sha_file "$prometheus_projection")" || return
  api_inspect="$(docker inspect "${project}-api-1")" || return
  prometheus_inspect="$(docker inspect "${project}-prometheus-1")" || return
  api_security="$(
    container_security_digest "$(jq -er '.[0].Id' <<< "$api_inspect")"
  )" || return
  prometheus_security="$(
    container_security_digest \
      "$(jq -er '.[0].Id' <<< "$prometheus_inspect")"
  )" || return
  api_started="$(
    printf '%s\n' "$(jq -er '.[0].State.StartedAt' <<< "$api_inspect")" |
      sha256sum | awk '{print "sha256:" $1}'
  )" || return
  prometheus_started="$(
    printf '%s\n' \
      "$(jq -er '.[0].State.StartedAt' <<< "$prometheus_inspect")" |
      sha256sum | awk '{print "sha256:" $1}'
  )" || return
  pointer_mode="0$(stat -c '%a' -- "${data_root}/current.json")" || return
  jq -cS . "${data_root}/current.json" |
    cmp --silent "${data_root}/current.json" - || return
  [[ "$pointer_mode" == "0644" &&
     "$(jq -er '.dataVersion' "${data_root}/current.json")" == "$expected" &&
     "$(jq -er '.manifestDigest' "${data_root}/current.json")" == \
       "$expected_manifest" ]] || return 1
  build_digest="$(
    jq -cnS --arg revision "$app_revision" --arg version "$app_version" \
      '{revision:$revision,version:$version}' |
      sha256sum | awk '{print "sha256:" $1}'
  )" || return
  ready_digest="$(
    jq -cnS --arg dataVersion "$expected" \
      '{dataVersion:$dataVersion,ready:true}' |
      sha256sum | awk '{print "sha256:" $1}'
  )" || return
  metrics_digest="$(
    jq -cnS \
      --arg dataVersion "$expected" \
      --arg revision "$app_revision" \
      --arg version "$app_version" \
      '{
        build:{revision:$revision,version:$version},
        snapshot:{dataVersion:$dataVersion}
      }' |
      sha256sum | awk '{print "sha256:" $1}'
  )" || return
  typed_digest="$(
    jq -cnS --arg dataVersion "$expected" \
      '{dataVersion:$dataVersion,page:1,pageSize:5,typed:true}' |
      sha256sum | awk '{print "sha256:" $1}'
  )" || return
  prometheus_digest="$(
    jq -cnS '{job:"bgmss-api",up:1}' |
      sha256sum | awk '{print "sha256:" $1}'
  )" || return
  jq -cnS \
    --arg apiRevision "$app_revision" \
    --arg apiVersion "$app_version" \
    --arg dataVersion "$expected" \
    --arg pointerDigest "$(sha_file "${data_root}/current.json")" \
    --arg pointerInode "$(stat -c '%i' -- "${data_root}/current.json")" \
    --arg pointerMode "$pointer_mode" \
    --arg buildDigest "$build_digest" \
    --arg metricsDigest "$metrics_digest" \
    --arg prometheusDigest "$prometheus_digest" \
    --arg prometheusScrapeDigest "$prometheus_scrape_digest" \
    --arg queryResultDigest "$query_result_digest" \
    --arg readyDigest "$ready_digest" \
    --arg typedQueryDigest "$typed_digest" \
    --arg apiContainerId "$(jq -er '.[0].Id' <<< "$api_inspect")" \
    --arg apiImage "$(jq -er '.[0].Config.Image' <<< "$api_inspect")" \
    --arg apiImageRuntimeId "$(jq -er '.[0].Image' <<< "$api_inspect")" \
    --arg apiSecurityDigest "$api_security" \
    --arg apiStartDigest "$api_started" \
    --arg prometheusContainerId \
      "$(jq -er '.[0].Id' <<< "$prometheus_inspect")" \
    --arg prometheusImage \
      "$(jq -er '.[0].Config.Image' <<< "$prometheus_inspect")" \
    --arg prometheusImageRuntimeId \
      "$(jq -er '.[0].Image' <<< "$prometheus_inspect")" \
    --arg prometheusSecurityDigest "$prometheus_security" \
    --arg prometheusStartDigest "$prometheus_started" \
    --argjson apiRestartCount \
      "$(jq -er '.[0].RestartCount' <<< "$api_inspect")" \
    --argjson apiRunning "$(jq -er '.[0].State.Running' <<< "$api_inspect")" \
    --argjson prometheusRestartCount \
      "$(jq -er '.[0].RestartCount' <<< "$prometheus_inspect")" \
    --argjson prometheusRunning \
      "$(jq -er '.[0].State.Running' <<< "$prometheus_inspect")" \
    '{
      api:{
        containerId:$apiContainerId,
        imageReference:$apiImage,
        imageRuntimeId:$apiImageRuntimeId,
        restartCount:$apiRestartCount,
        running:$apiRunning,
        securityDigest:$apiSecurityDigest,
        startDigest:$apiStartDigest
      },
      apiRevision:$apiRevision,
      apiVersion:$apiVersion,
      dataVersion:$dataVersion,
      failureCode:null,
      pointer:{
        digest:$pointerDigest,
        inode:$pointerInode,
        mode:$pointerMode
      },
      projections:{
        buildDigest:$buildDigest,
        metricsDigest:$metricsDigest,
        prometheusDigest:$prometheusDigest,
        prometheusScrapeDigest:$prometheusScrapeDigest,
        queryResultDigest:$queryResultDigest,
        readyDigest:$readyDigest,
        typedQueryDigest:$typedQueryDigest
      },
      prometheus:{
        containerId:$prometheusContainerId,
        imageReference:$prometheusImage,
        imageRuntimeId:$prometheusImageRuntimeId,
        restartCount:$prometheusRestartCount,
        running:$prometheusRunning,
        securityDigest:$prometheusSecurityDigest,
        startDigest:$prometheusStartDigest
      }
    }'
}

record_health_state() {
  local command_id="$1"
  local expected="$2"
  local expected_manifest="$3"
  local label="$4"
  local output state state_digest proof_digest
  run_recorded "$command_id" success \
    health_state_command "$expected" "$expected_manifest" "$label" || return
  output="${evidence_root}/command-${command_id}.log"
  state="$(jq -ceS . "$output")" || return
  state_digest="$(sha_file "$output")" || return
  proof_digest="$(
    jq -er --arg id "$command_id" '
      .[] | select(.id == $id) | .outputDigest
    ' "$command_records"
  )" || return
  [[ "$state_digest" == "$proof_digest" ]] || return 1
  recorded_health_json="$(
    jq -cnS \
    --arg proofCommandId "$command_id" \
    --arg proofDigest "$proof_digest" \
    --arg stateDigest "$state_digest" \
    --argjson state "$state" \
    '{
      proofCommandId:$proofCommandId,
      proofDigest:$proofDigest,
      state:$state,
      stateDigest:$stateDigest
    }'
  )" || return
}

capture_continuous_sample() {
  local reuse="$1"
  local state_file="${evidence_root}/continuous-state.json"
  local samples_file="${evidence_root}/continuous-health.jsonl"
  local observed_epoch observed_monotonic state expected_state
  local elapsed state_digest chain_digest previous_json
  local query_projection_digest prometheus_projection_digest
  if [[ "$reuse" == "yes" ]]; then
    runtime_open_mutation "$state_file" || return
  else
    runtime_create_file "$state_file" 0600 0 0 yes || return
  fi
  health_state_command "$minimal_data" \
    "$(jq -er '.minimalArchive.manifestDigest' "$input")" \
    continuous "$reuse" > "$state_file" || return
  query_projection_digest="$(
    sha_file "${evidence_root}/continuous-rankings-projection"
  )" || return
  prometheus_projection_digest="$(
    sha_file "${evidence_root}/continuous-prometheus-projection"
  )" || return
  [[ "$query_projection_digest" == "$minimal_query_digest_before" &&
     "$prometheus_projection_digest" == "$minimal_prometheus_digest_before" ]] ||
    return 1
  observed_monotonic="$(monotonic_ns)" || return
  observed_epoch="$(date +%s%3N)" || return
  kill -0 "$produce_client" >/dev/null 2>&1 || return
  [[ "$(docker inspect --format '{{.State.Running}}' "$produce_id")" == \
       "true" ]] || return
  runtime_close_object "$state_file" || return
  state="$(jq -ceS . "$state_file")" || return
  [[ "$(jq -er '.projections.queryResultDigest' <<< "$state")" == \
       "$query_projection_digest" &&
     "$(jq -er '.projections.prometheusScrapeDigest' <<< "$state")" == \
       "$prometheus_projection_digest" ]] || return 1
  expected_state="$(jq -ceS '.state' <<< "$minimal_health")" || return
  [[ "$state" == "$expected_state" ]] || return 1
  if [[ "$continuous_sample_count" -eq 0 ]]; then
    continuous_started_epoch="$observed_epoch"
    continuous_started_monotonic="$observed_monotonic"
    previous_json="null"
  else
    previous_json="$(
      jq -cn --arg value "$continuous_previous_digest" '$value'
    )" || return
  fi
  elapsed="$(
    printf '%s\n' \
      "$(((observed_monotonic - continuous_started_monotonic) / 1000000))"
  )"
  state_digest="$(sha_file "$state_file")" || return
  chain_digest="$(
    jq -cnS \
      --arg observedMonotonicNs "$observed_monotonic" \
      --arg stateDigest "$state_digest" \
      --argjson elapsedMs "$elapsed" \
      --argjson observedEpochMs "$observed_epoch" \
      --argjson ordinal "$continuous_sample_count" \
      --argjson previousDigest "$previous_json" \
      '{
        elapsedMs:$elapsedMs,
        observedEpochMs:$observedEpochMs,
        observedMonotonicNs:$observedMonotonicNs,
        ordinal:$ordinal,
        previousDigest:$previousDigest,
        stateDigest:$stateDigest
      }' |
      sha256sum |
      awk '{print "sha256:" $1}'
  )" || return
  jq -cnS \
    --arg chainDigest "$chain_digest" \
    --arg observedMonotonicNs "$observed_monotonic" \
    --arg stateDigest "$state_digest" \
    --argjson elapsedMs "$elapsed" \
    --argjson observedEpochMs "$observed_epoch" \
    --argjson ordinal "$continuous_sample_count" \
    --argjson previousDigest "$previous_json" \
    --argjson state "$state" \
    '{
      chainDigest:$chainDigest,
      elapsedMs:$elapsedMs,
      observedEpochMs:$observedEpochMs,
      observedMonotonicNs:$observedMonotonicNs,
      ordinal:$ordinal,
      previousDigest:$previousDigest,
      state:$state,
      stateDigest:$stateDigest
    }' >> "$samples_file" || return
  sync -f -- "$samples_file" || return
  [[ "$continuous_sample_count" -ne 0 ]] ||
    continuous_first_digest="$chain_digest"
  continuous_previous_digest="$chain_digest"
  continuous_last_digest="$chain_digest"
  continuous_ended_epoch="$observed_epoch"
  continuous_ended_monotonic="$observed_monotonic"
  continuous_sample_count=$((continuous_sample_count + 1))
}

build_continuous_health_evidence() {
  local samples_file="${evidence_root}/continuous-health.jsonl"
  local samples before after proof_digest authority_digest
  [[ "$continuous_sample_count" -ge 2 ]] || return 1
  samples="$(jq -scS . "$samples_file")" || return
  before="$(jq -ceS '.[0].state' <<< "$samples")" || return
  after="$(jq -ceS '.[-1].state' <<< "$samples")" || return
  [[ "$before" == "$after" ]] || return 1
  proof_digest="$(
    jq -er '
      .[] | select(.id == "updater-produce") | .outputDigest
    ' "$command_records"
  )" || return
  authority_digest="$(jq -er '.authority.continuousHealth.digest' "$input")" ||
    return
  continuous_health_unverified_json="$(
    jq -cnS \
      --arg authorityDigest "$authority_digest" \
      --arg endedMonotonicNs "$continuous_ended_monotonic" \
      --arg firstDigest "$continuous_first_digest" \
      --arg lastDigest "$continuous_last_digest" \
      --arg proofDigest "$proof_digest" \
      --arg startedMonotonicNs "$continuous_started_monotonic" \
      --argjson after "$after" \
      --argjson before "$before" \
      --argjson count "$continuous_sample_count" \
      --argjson endedEpochMs "$continuous_ended_epoch" \
      --argjson samples "$samples" \
      --argjson startedEpochMs "$continuous_started_epoch" \
      '{
        after:$after,
        authorityDigest:$authorityDigest,
        before:$before,
        count:$count,
        endedEpochMs:$endedEpochMs,
        endedMonotonicNs:$endedMonotonicNs,
        firstDigest:$firstDigest,
        intervalSeconds:30,
        lastDigest:$lastDigest,
        proofCommandId:"updater-produce",
        proofDigest:$proofDigest,
        samples:$samples,
        startedEpochMs:$startedEpochMs,
        startedMonotonicNs:$startedMonotonicNs,
        status:"passed"
      }'
  )" || return
}

verify_continuous_health_command() {
  jq -e \
    --argjson expected "$(jq -cS '.state' <<< "$minimal_health")" '
      .status == "passed" and
      .count == (.samples | length) and
      .count >= 2 and
      all(.samples[]; .state == $expected)
    ' <<< "$continuous_health_unverified_json" >/dev/null || return
  (( ${#continuous_health_unverified_json} + 1 <= maximum_output )) || return 1
  printf '%s\n' "$continuous_health_unverified_json"
}

run_recorded compose-start-api success "${compose[@]}" start api ||
  fail "API_START_FAILED"
run_recorded compose-start-prometheus success "${compose[@]}" start prometheus ||
  fail "PROMETHEUS_START_FAILED"
record_health_state minimal-health "$minimal_data" \
  "$(jq -er '.minimalArchive.manifestDigest' "$input")" minimal ||
  fail "MINIMAL_HEALTH_FAILED"
minimal_health="$recorded_health_json"
minimal_query_digest_before="$(
  jq -er '.state.projections.queryResultDigest' <<< "$minimal_health"
)" || fail "MINIMAL_QUERY_PROJECTION_DIGEST_FAILED"
readonly minimal_query_digest_before
minimal_prometheus_digest_before="$(
  jq -er '.state.projections.prometheusScrapeDigest' <<< "$minimal_health"
)" || fail "MINIMAL_PROMETHEUS_PROJECTION_DIGEST_FAILED"
readonly minimal_prometheus_digest_before
prometheus_id="$(docker inspect --format '{{.Id}}' "${project}-prometheus-1")"
readonly minimal_api_container_id="$(
  docker inspect --format '{{.Id}}' "${project}-api-1"
)"
readonly minimal_prometheus_container_id="$prometheus_id"

create_updater() {
  local suffix="$1"
  local network="$2"
  shift 2
  local name="${project}-updater-${suffix}"
  local -a arguments=(
    docker create
    --name "$name"
    --label "com.docker.compose.project=${project}"
    --label "com.docker.compose.service=updater"
    --label "fun.bgmss.app-version=${candidate_version}"
    --label "fun.bgmss.role=updater"
    --label "fun.bgmss.validation-run=${run_id}"
    --user 65532:65532
    --init
    --read-only
    --cap-drop ALL
    --security-opt no-new-privileges
    --cpus 1
    --memory 640m
    --pids-limit 256
    --stop-timeout 30
    --log-driver journald
    --log-opt "tag=${project}-updater"
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m
    --tmpfs /work:rw,noexec,nosuid,nodev,size=64m
    --network "$network"
  )
  if [[ "$network" == "${project}_outbound" ]]; then
    arguments+=(
      --mount "type=bind,src=${data_root},dst=/var/lib/bgmss/archive,rw"
      --mount "type=bind,src=${updater_current_mask},dst=/var/lib/bgmss/archive/current.json,readonly"
      --mount "type=bind,src=${smoke_path},dst=/opt/bgmss/release/archive-smoke,readonly"
    )
  fi
  arguments+=("$updater_alias" "$@")
  local identifier intent
  intent="$(
    jq -cnS \
      --arg name "$name" \
      --arg project "$project" \
      --arg runId "$run_id" \
      '{name:$name,project:$project,runId:$runId,service:"updater"}'
  )" || return
  ledger_resource_event resource-creating container "$intent" || return
  identifier="$("${arguments[@]}")" || return
  record_container "$identifier" updater || return
  created_updater_id="$identifier"
}

create_updater doctor none doctor || fail "UPDATER_DOCTOR_CREATE_FAILED"
doctor_id="$created_updater_id"
run_recorded updater-doctor success docker start --attach "$doctor_id" ||
  fail "UPDATER_DOCTOR_FAILED"
create_updater contract none \
  contract-check --contracts-root /opt/bgmss/producer/contracts ||
  fail "UPDATER_CONTRACT_CREATE_FAILED"
contract_id="$created_updater_id"
run_recorded updater-contract success docker start --attach "$contract_id" ||
  fail "UPDATER_CONTRACT_FAILED"

create_updater failure none \
  contract-check --contracts-root /not-present ||
  fail "UPDATER_FAILURE_CREATE_FAILED"
bad_id="$created_updater_id"
readonly pointer_before_failure="$(sha_file "${data_root}/current.json")"
run_recorded updater-intentional-failure failure docker start --attach "$bad_id" ||
  fail "UPDATER_FAILURE_NOT_OBSERVED"
[[ "$(sha_file "${data_root}/current.json")" == "$pointer_before_failure" ]] ||
  fail "UPDATER_FAILURE_CHANGED_POINTER"
updater_failure="$(command_proof updater-intentional-failure)" ||
  fail "UPDATER_FAILURE_PROOF_FAILED"

common_value="$(awk -F= '$1=="BGMSS_COMMON_COMMIT" {print $2}' "$environment_path")"
[[ "$common_value" =~ ^[0-9a-f]{40}$ ]] || fail "COMMON_COMMIT_INVALID"
readonly pointer_before_acquisition="$(sha_file "${data_root}/current.json")"
create_updater produce "${project}_outbound" \
  produce \
  --output-root /var/lib/bgmss/archive \
  --contracts-root /opt/bgmss/producer/contracts \
  --catalog-config /opt/bgmss/producer/catalog/display-v1.yaml \
  --common-commit "$common_value" \
  --archive-smoke /opt/bgmss/release/archive-smoke \
  --status-file /var/lib/bgmss/archive/update-status.json ||
  fail "UPDATER_PRODUCE_CREATE_FAILED"
produce_id="$created_updater_id"
docker inspect "$produce_id" |
  jq -e \
    --arg data "$data_root" \
    --arg mask "$updater_current_mask" \
    --arg appVersion "$candidate_version" \
    --arg run "$run_id" \
    --arg smoke "$smoke_path" '
      .[0] |
      .Config.User == "65532:65532" and
      .Config.Labels["fun.bgmss.role"] == "updater" and
      .Config.Labels["fun.bgmss.app-version"] == $appVersion and
      .Config.Labels["fun.bgmss.validation-run"] == $run and
      .HostConfig.Init == true and
      .HostConfig.ReadonlyRootfs == true and
      .HostConfig.Privileged == false and
      .HostConfig.CapDrop == ["ALL"] and
      (.HostConfig.SecurityOpt | index("no-new-privileges") != null) and
      .HostConfig.Memory == 671088640 and
      .HostConfig.NanoCpus == 1000000000 and
      .HostConfig.PidsLimit == 256 and
      .HostConfig.RestartPolicy.Name == "no" and
      .HostConfig.LogConfig.Type == "journald" and
      .HostConfig.LogConfig.Config.tag == "bgmss_ops_validation-updater" and
      ([.Mounts[] | select(.Destination == "/var/lib/bgmss/archive")] |
        length == 1 and .[0].Source == $data and .[0].RW == true) and
      ([.Mounts[] | select(.Destination == "/var/lib/bgmss/archive/current.json")] |
        length == 1 and .[0].Source == $mask and .[0].RW == false) and
      ([.Mounts[] | select(.Destination == "/opt/bgmss/release/archive-smoke")] |
        length == 1 and .[0].Source == $smoke and .[0].RW == false) and
      (.NetworkSettings.Networks | keys) == ["bgmss_ops_validation_outbound"]
    ' >/dev/null || fail "UPDATER_RUNTIME_POLICY_MISMATCH"
capture_security_projection ||
  fail "SECURITY_PROJECTION_CAPTURE_FAILED"

readonly produce_log="${evidence_root}/command-updater-produce.log"
produce_actor="$(
  jq -cse --arg id "$produce_id" '
    map(select(.id == $id)) |
    if length == 1 then .[0] else error("producer identity") end
  ' "$container_records"
)" || fail "UPDATER_RESOURCE_LEDGER_INVALID"
runtime_namespace_intent updater-output "$data_root" "$produce_actor" ||
  fail "UPDATER_NAMESPACE_LEDGER_INTENT_FAILED"
runtime_create_file "$produce_log" 0600 0 0 yes ||
  fail "UPDATER_LOG_LEDGER_CREATE_FAILED"
readonly continuous_samples_file="${evidence_root}/continuous-health.jsonl"
runtime_create_file "$continuous_samples_file" 0600 0 0 yes ||
  fail "CONTINUOUS_HEALTH_LEDGER_CREATE_FAILED"
declare -a produce_command=(
  timeout --signal=TERM --kill-after=30s 21600
  nice -n 10 ionice -c 3 docker start --attach "$produce_id"
)
produce_argv_digest="$(
  validate_command_invocation updater-produce "${produce_command[@]}"
)" || fail "UPDATER_COMMAND_ARGV_INVALID"
produce_started_epoch="$(date +%s%3N)"
produce_started_monotonic="$(monotonic_ns)"
set +e
(
  ulimit -f 8192
  "${produce_command[@]}"
) > "$produce_log" 2>&1 &
produce_client="$!"
set -e
peak_memory=0
kill -0 "$produce_client" >/dev/null 2>&1 ||
  fail "UPDATER_PRODUCER_ENDED_BEFORE_HEALTH_SAMPLE"
capture_continuous_sample no ||
  fail "CONTINUOUS_HEALTH_FIRST_SAMPLE_FAILED"
while kill -0 "$produce_client" >/dev/null 2>&1; do
  container_pid="$(docker inspect --format '{{.State.Pid}}' "$produce_id" 2>/dev/null || true)"
  if [[ "$container_pid" =~ ^[1-9][0-9]*$ && -r "/proc/${container_pid}/cgroup" ]]; then
    cgroup_path=""
    while IFS=: read -r hierarchy controllers candidate_path; do
      if [[ "$hierarchy" == "0" && -z "$controllers" ]]; then
        cgroup_path="$candidate_path"
      fi
    done < "/proc/${container_pid}/cgroup"
    if [[ -n "$cgroup_path" && -r "/sys/fs/cgroup${cgroup_path}/memory.peak" ]]; then
      read -r memory_value < "/sys/fs/cgroup${cgroup_path}/memory.peak" || true
      if [[ "$memory_value" =~ ^[0-9]+$ && "$memory_value" -gt "$peak_memory" ]]; then
        peak_memory="$memory_value"
      fi
    fi
  fi
  current_monotonic="$(monotonic_ns)"
  if (( current_monotonic - continuous_ended_monotonic >= 30000000000 )); then
    capture_continuous_sample yes ||
      fail "CONTINUOUS_HEALTH_SAMPLE_FAILED"
  fi
  sleep 1
done
set +e
wait "$produce_client"
produce_status="$?"
set -e
produce_ended_monotonic="$(monotonic_ns)"
produce_ended_epoch="$(date +%s%3N)"
produce_duration_ms="$(
  printf '%s\n' \
    "$(((produce_ended_monotonic - produce_started_monotonic) / 1000000))"
)"
[[ -f "$produce_log" && ! -L "$produce_log" &&
   "$(stat -c '%s' "$produce_log")" -le "$maximum_output" ]] ||
  fail "UPDATER_OUTPUT_LIMIT"
runtime_close_object "$produce_log" ||
  fail "UPDATER_LOG_LEDGER_CLOSE_FAILED"
[[ "$produce_status" -eq 0 ]] || fail "UPDATER_PRODUCE_FAILED"
append_command updater-produce "$produce_duration_ms" "$produce_status" \
  succeeded "$(sha_file "$produce_log")" \
  "$produce_started_epoch" "$produce_ended_epoch" \
  "$produce_started_monotonic" "$produce_ended_monotonic" \
  "$produce_argv_digest" ||
  fail "UPDATER_COMMAND_PROOF_FAILED"
runtime_close_object "$continuous_samples_file" ||
  fail "CONTINUOUS_HEALTH_LEDGER_CLOSE_FAILED"
build_continuous_health_evidence ||
  fail "CONTINUOUS_HEALTH_EVIDENCE_FAILED"
run_recorded producer-minimal-health success \
  verify_continuous_health_command ||
  fail "CONTINUOUS_HEALTH_PROOF_FAILED"
continuous_verification_proof="$(
  command_proof producer-minimal-health
)" || fail "CONTINUOUS_HEALTH_PROOF_MISSING"
continuous_health_json="$(
  jq -cS \
    --argjson verificationProof "$continuous_verification_proof" \
    '. + {verificationProof:$verificationProof}' \
    <<< "$continuous_health_unverified_json"
)" || fail "CONTINUOUS_HEALTH_PROOF_BINDING_FAILED"
[[ "$(docker inspect --format '{{.State.OOMKilled}}' "$produce_id")" == "false" &&
   "$peak_memory" -gt 0 &&
   "$peak_memory" -le 671088640 ]] || fail "UPDATER_MEMORY_BOUND_EXCEEDED"
[[ "$(sha_file "${data_root}/current.json")" == "$pointer_before_acquisition" &&
   "$(stat -c '%u:%g:%a' "${data_root}/current.json")" == "0:0:644" ]] ||
  fail "UPDATER_CHANGED_CURRENT_POINTER"
[[ "$(docker inspect --format '{{.Id}}' "${project}-api-1")" == \
     "$minimal_api_container_id" &&
   "$(docker inspect --format '{{.State.Running}}' "$minimal_api_container_id")" == \
     "true" &&
   "$(docker inspect --format '{{.Id}}' "${project}-prometheus-1")" == \
     "$minimal_prometheus_container_id" &&
   "$(docker inspect --format '{{.State.Running}}' "$minimal_prometheus_container_id")" == \
     "true" ]] || fail "MINIMAL_RUNTIME_CHANGED_DURING_ACQUISITION"
full_data="$(jq -Rsr '
  split("\n") |
  map(select(length > 0) | fromjson?) |
  map(select(.event == "update_published")) |
  if length == 1 then .[0].dataVersion else error("terminal event") end
' "$produce_log")"
[[ "$full_data" =~ ^dv1-[0-9a-f]{64}$ && "$full_data" != "$minimal_data" ]] ||
  fail "UPDATER_FULL_IDENTITY_INVALID"
readonly full_version="${data_root}/versions/${full_data}"
[[ -d "$full_version" && ! -L "$full_version" &&
   -f "${full_version}/manifest.json" && ! -L "${full_version}/manifest.json" &&
   -f "${full_version}/bangumi.sqlite" && ! -L "${full_version}/bangumi.sqlite" ]] ||
  fail "UPDATER_FULL_LAYOUT_INVALID"
[[ "$(find "$full_version" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort |
  tr '\n' ',')" == "bangumi.sqlite,manifest.json," ]] ||
  fail "UPDATER_FULL_LAYOUT_NOT_CLOSED"
run_recorded archive-smoke-full success \
  "$smoke_path" -archive-root "$data_root" -data-version "$full_data" ||
  fail "FULL_ARCHIVE_SMOKE_FAILED"

readonly full_manifest_digest="$(sha_file "${full_version}/manifest.json")"
readonly full_sqlite_digest="$(sha_file "${full_version}/bangumi.sqlite")"
chmod 0440 "${full_version}/manifest.json" "${full_version}/bangumi.sqlite"
chmod 0550 "$full_version"
chown 0:65532 "$full_version" "${full_version}/manifest.json" \
  "${full_version}/bangumi.sqlite"
actual_data_entries="$(
  find "$data_root" -mindepth 1 -maxdepth 1 -printf '%f\n' |
    sort | tr '\n' ','
)"
actual_versions="$(
  find "${data_root}/versions" -mindepth 1 -maxdepth 1 -printf '%f\n' |
    sort | tr '\n' ','
)"
expected_versions="$(
  printf '%s\n' "$minimal_data" "$full_data" |
    sort | tr '\n' ','
)"
[[ "$actual_data_entries" == "current.json,update-status.json,versions," &&
   "$actual_versions" == "$expected_versions" ]] ||
  fail "UPDATER_NAMESPACE_NOT_CLOSED"
runtime_register_namespace_object updater-output "${data_root}/update-status.json" ||
  fail "UPDATER_STATUS_LEDGER_CLOSE_FAILED"
runtime_register_namespace_object updater-output "$full_version" ||
  fail "UPDATER_VERSION_LEDGER_CLOSE_FAILED"
runtime_register_namespace_object updater-output "${full_version}/manifest.json" ||
  fail "UPDATER_MANIFEST_LEDGER_CLOSE_FAILED"
runtime_register_namespace_object updater-output "${full_version}/bangumi.sqlite" ||
  fail "UPDATER_SQLITE_LEDGER_CLOSE_FAILED"
quality_digest="sha256:$(
  jq -cS '.qualitySummary' "${full_version}/manifest.json" |
    sha256sum |
    awk '{print $1}'
)"
input_rows="$(jq '[.sourceFiles[].recordsTotal] | add' "${full_version}/manifest.json")"
output_rows="$(jq '[.tableCounts[]] | add' "${full_version}/manifest.json")"
upstream_release="$(jq -er '.archiveRelease' "${full_version}/manifest.json")"
upstream_digest="$(jq -er '.archiveDigest' "${full_version}/manifest.json")"
status_digest="$(sha_file "${data_root}/update-status.json")"
duration_seconds="$((produce_duration_ms / 1000))"
producer_proof_digest="$(
  jq -er '
    .[] | select(.id == "updater-produce") | .outputDigest
  ' "$command_records"
)" || fail "UPDATER_PRODUCER_PROOF_MISSING"
producer_json="$(
  jq -cnS \
    --arg dataVersion "$full_data" \
    --arg manifestDigest "$full_manifest_digest" \
    --arg proofDigest "$producer_proof_digest" \
    --arg qualityDigest "$quality_digest" \
    --arg sqliteDigest "$full_sqlite_digest" \
    --arg statusDigest "$status_digest" \
    --arg upstreamDigest "$upstream_digest" \
    --arg upstreamRelease "$upstream_release" \
    --argjson durationSeconds "$duration_seconds" \
    --argjson inputRows "$input_rows" \
    --argjson outputRows "$output_rows" \
    --argjson peakMemoryBytes "$peak_memory" \
    '{
      dataVersion:$dataVersion,
      durationSeconds:$durationSeconds,
      inputRows:$inputRows,
      manifestDigest:$manifestDigest,
      memoryLimitBytes:671088640,
      oomKilled:false,
      outputRows:$outputRows,
      peakMemoryBytes:$peakMemoryBytes,
      proofCommandId:"updater-produce",
      proofDigest:$proofDigest,
      qualityDigest:$qualityDigest,
      sqliteDigest:$sqliteDigest,
      statusDigest:$statusDigest,
      upstreamDigest:$upstreamDigest,
      upstreamRelease:$upstreamRelease
    }'
)"

fault_root="${root}/data-fault"
runtime_create_directory "$fault_root" 0750 65532 65532 ||
  fail "FAULT_ROOT_LEDGER_CREATE_FAILED"
runtime_create_directory "${fault_root}/versions" 0750 65532 65532 ||
  fail "FAULT_VERSIONS_LEDGER_CREATE_FAILED"
runtime_create_directory "${fault_root}/versions/${full_data}" 0750 65532 65532 ||
  fail "FAULT_VERSION_LEDGER_CREATE_FAILED"
runtime_install_file "${full_version}/manifest.json" \
  "${fault_root}/versions/${full_data}/manifest.json" 0440 65532 65532 ||
  fail "FAULT_MANIFEST_LEDGER_CREATE_FAILED"
runtime_install_file "${full_version}/bangumi.sqlite" \
  "${fault_root}/versions/${full_data}/bangumi.sqlite" 0440 65532 65532 ||
  fail "FAULT_SQLITE_LEDGER_CREATE_FAILED"
runtime_open_mutation "${fault_root}/versions/${full_data}/bangumi.sqlite" ||
  fail "FAULT_SQLITE_LEDGER_OPEN_FAILED"
printf 'x' | dd of="${fault_root}/versions/${full_data}/bangumi.sqlite" \
  bs=1 seek=0 conv=notrunc status=none
runtime_close_object "${fault_root}/versions/${full_data}/bangumi.sqlite" ||
  fail "FAULT_SQLITE_LEDGER_CLOSE_FAILED"
run_recorded archive-corruption failure \
  "$smoke_path" -archive-root "$fault_root" -data-version "$full_data" ||
  fail "ARCHIVE_CORRUPTION_NOT_REJECTED"
runtime_remove_owned "${fault_root}/versions/${full_data}/manifest.json" ||
  fail "FAULT_MANIFEST_LEDGER_REMOVE_FAILED"
runtime_remove_owned "${fault_root}/versions/${full_data}/bangumi.sqlite" ||
  fail "FAULT_SQLITE_LEDGER_REMOVE_FAILED"
runtime_remove_owned "${fault_root}/versions/${full_data}" ||
  fail "FAULT_VERSION_LEDGER_REMOVE_FAILED"
runtime_remove_owned "${fault_root}/versions" ||
  fail "FAULT_VERSIONS_LEDGER_REMOVE_FAILED"
runtime_remove_owned "$fault_root" ||
  fail "FAULT_ROOT_LEDGER_REMOVE_FAILED"
archive_corruption_rejected="$(command_proof archive-corruption)" ||
  fail "ARCHIVE_CORRUPTION_PROOF_FAILED"

pointer_switch_command() {
  local version="$1"
  local manifest="$2"
  arm_pointer_transaction "$version" "$manifest" || return
  write_pointer_atomic "$version" "$manifest" || return
  docker restart "${project}-api-1" >/dev/null || return
  printf 'pointer-switched:%s\n' "$version"
}

pointer_rollback_command() {
  rollback_pointer_transaction || return
  printf 'pointer-rolled-back:%s\n' "$minimal_data"
}

pointer_failure_command() {
  local bad_data="dv1-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  local bad_manifest="sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  arm_pointer_transaction "$bad_data" "$bad_manifest" || return
  write_pointer_atomic "$bad_data" "$bad_manifest" || return
  docker restart "${project}-api-1" >/dev/null || return
  sleep 2
  if curl --fail --silent --max-time 3 \
    http://127.0.0.1:19090/readyz >/dev/null 2>&1; then
    return 0
  fi
  printf 'invalid-pointer-readiness-rejected\n'
  return 1
}

run_recorded full-switch success \
  pointer_switch_command "$full_data" "$full_manifest_digest" ||
  fail "FULL_SWITCH_FAILED"
record_health_state full-health "$full_data" "$full_manifest_digest" full ||
  fail "FULL_HEALTH_FAILED"
full_health="$recorded_health_json"

run_recorded rollback-switch success pointer_rollback_command ||
  fail "ROLLBACK_SWITCH_FAILED"
record_health_state rollback-health "$minimal_data" \
  "$(jq -er '.minimalArchive.manifestDigest' "$input")" rolled-back ||
  fail "ROLLBACK_HEALTH_FAILED"
rolled_back_health="$recorded_health_json"
rollback_status="succeeded"

run_recorded post-switch-failure failure pointer_failure_command ||
  fail "POST_SWITCH_FAILURE_NOT_OBSERVED"
run_recorded post-switch-recovery success pointer_rollback_command ||
  fail "POST_SWITCH_ROLLBACK_FAILED"
post_switch_rollback="$(command_proof post-switch-recovery)" ||
  fail "POST_SWITCH_ROLLBACK_PROOF_FAILED"

run_recorded reactivate-switch success \
  pointer_switch_command "$full_data" "$full_manifest_digest" ||
  fail "REACTIVATION_SWITCH_FAILED"
record_health_state reactivated-health "$full_data" "$full_manifest_digest" \
  reactivated || fail "REACTIVATION_HEALTH_FAILED"
reactivated_health="$recorded_health_json"
runtime_create_file "${evidence_root}/update-activated.jsonl" 0600 0 0 yes ||
  fail "ACTIVATION_EVENT_LEDGER_CREATE_FAILED"
jq -cnS \
  --arg app_version "$(jq -er '.candidate.applicationVersion' "$input")" \
  --arg new_data_version "$full_data" \
  --arg old_data_version "$minimal_data" \
  --arg run_id "$run_id" \
  '{
    app_version:$app_version,
    duration_seconds:0,
    event:"update_activated",
    new_data_version:$new_data_version,
    old_data_version:$old_data_version,
    run_id:$run_id
  }' > "${evidence_root}/update-activated.jsonl"
runtime_close_object "${evidence_root}/update-activated.jsonl" ||
  fail "ACTIVATION_EVENT_LEDGER_CLOSE_FAILED"
[[ "$(grep -c '\"event\":\"update_activated\"' \
  "${evidence_root}/update-activated.jsonl")" -eq 1 ]] ||
  fail "ACTIVATION_EVENT_COUNT_INVALID"

commit_pointer_transaction ||
  fail "POINTER_TRANSACTION_COMMIT_FAILED"
primary_status="succeeded"
exit 0
