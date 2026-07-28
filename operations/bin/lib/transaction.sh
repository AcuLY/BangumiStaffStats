#!/usr/bin/env bash

set -Eeuo pipefail

declare -Ag OPS_MANIFEST=()
OPS_LOCK_FD=""
OPS_FRESH_MASK_DEVICE=""
OPS_FRESH_MASK_INODE=""
OPS_FRESH_MASK_DIGEST=""
OPS_FRESH_MASK_STATE="absent"
OPS_TRANSACTION_ACTIVE="no"
OPS_TRANSACTION_ACTION=""
OPS_TRANSACTION_RUN_ID=""
OPS_TRANSACTION_MODE=""
OPS_TRANSACTION_SIGNAL=""
OPS_TRANSACTION_ERROR_STATUS=""
OPS_TRANSACTION_HANDLER_ACTIVE="no"
OPS_TRANSACTION_HAD_PREVIOUS="no"
OPS_TRANSACTION_PREVIOUS_ENV=""
OPS_TRANSACTION_PREVIOUS_FRONTEND=""
OPS_TRANSACTION_EXPECTED_DATA=""
OPS_TRANSACTION_CANDIDATE_ENV_DIGEST=""
OPS_TRANSACTION_CANDIDATE_FRONTEND=""
OPS_TRANSACTION_OLD_CURRENT=""
OPS_TRANSACTION_APP_ENV_DIGEST=""
OPS_TRANSACTION_APP_FRONTEND=""
OPS_TRANSACTION_FRESH_CURRENT_DEVICE=""
OPS_TRANSACTION_FRESH_CURRENT_INODE=""
OPS_TRANSACTION_FRESH_CURRENT_DIGEST=""
OPS_TRANSACTION_FRESH_ENV=""
OPS_TRANSACTION_ACQUISITION_ROOT=""
OPS_TRANSACTION_ACQUISITION_DEVICE=""
OPS_TRANSACTION_ACQUISITION_INODE=""
OPS_TRANSACTION_ACQUISITION_STATE="absent"
OPS_TRANSACTION_ACQUISITION_TREE_STATE="unsealed"
declare -ag OPS_TRANSACTION_ACQUISITION_PATHS=()
declare -ag OPS_TRANSACTION_ACQUISITION_TYPES=()
declare -ag OPS_TRANSACTION_ACQUISITION_STATES=()
declare -ag OPS_TRANSACTION_ACQUISITION_DEVICES=()
declare -ag OPS_TRANSACTION_ACQUISITION_INODES=()
declare -ag OPS_TRANSACTION_ACQUISITION_OWNERS=()
declare -ag OPS_TRANSACTION_ACQUISITION_MODES=()
declare -ag OPS_TRANSACTION_ACQUISITION_LINKS=()
declare -ag OPS_TRANSACTION_ACQUISITION_SIZES=()
declare -ag OPS_TRANSACTION_ACQUISITION_DIGESTS=()
OPS_TRANSACTION_RUNTIME_STAGE=""
OPS_TRANSACTION_PAYLOAD_STAGE=""
OPS_TRANSACTION_RUNTIME_FINAL=""
OPS_TRANSACTION_PAYLOAD_FINAL=""
OPS_TRANSACTION_RUNTIME_DEVICE=""
OPS_TRANSACTION_RUNTIME_INODE=""
OPS_TRANSACTION_PAYLOAD_DEVICE=""
OPS_TRANSACTION_PAYLOAD_INODE=""
OPS_TRANSACTION_BEFORE_VERSIONS=""
OPS_TRANSACTION_CURRENT_IDENTITY=""
OPS_TRANSACTION_API_IDENTITY=""
OPS_TRANSACTION_SECONDARY_PATH=""
OPS_TRANSACTION_SECONDARY_STATE=""
OPS_TRANSACTION_SECONDARY_COPY=""
OPS_TRANSACTION_SECONDARY_MODE=""
OPS_TRANSACTION_EVIDENCE_PATH=""
OPS_TRANSACTION_EVIDENCE_STATE=""
OPS_TRANSACTION_EVIDENCE_COPY=""
OPS_TRANSACTION_PUBLISHED_DATA=""
OPS_CREATION_GUARD_DEPTH="0"
OPS_CREATION_GUARD_SIGNAL=""
OPS_CREATION_GUARD_STATUS=""
OPS_CREATION_GUARD_RESTORE_MODE="transaction"
declare -ag OPS_TRANSACTION_TEMP_PATHS=()
declare -ag OPS_TRANSACTION_TEMP_DEVICES=()
declare -ag OPS_TRANSACTION_TEMP_INODES=()
declare -ag OPS_TRANSACTION_TEMP_OWNERS=()
declare -ag OPS_TRANSACTION_TEMP_DIGESTS=()
declare -ag OPS_TRANSACTION_TEMP_SYMLINKS=()
declare -ag OPS_TRANSACTION_TEMP_SYMLINK_DEVICES=()
declare -ag OPS_TRANSACTION_TEMP_SYMLINK_INODES=()
declare -ag OPS_TRANSACTION_TEMP_SYMLINK_TARGETS=()
declare -ag OPS_TRANSACTION_UNKNOWN_TEMPORARIES=()
declare -ag OPS_TRANSACTION_REF_KEYS=()
declare -ag OPS_TRANSACTION_REF_PATHS=()
declare -ag OPS_TRANSACTION_REF_TYPES=()
declare -ag OPS_TRANSACTION_REF_MODES=()
declare -ag OPS_TRANSACTION_REF_BEFORE_STATES=()
declare -ag OPS_TRANSACTION_REF_BEFORE_IDENTITIES=()
declare -ag OPS_TRANSACTION_REF_AFTER_STATES=()
declare -ag OPS_TRANSACTION_REF_AFTER_IDENTITIES=()
OPS_TRANSACTION_UPDATER_CONTAINER_STATE="absent"
OPS_TRANSACTION_UPDATER_CONTAINER_ID=""
OPS_TRANSACTION_UPDATER_CONTAINER_NAME=""
OPS_TRANSACTION_UPDATER_CONTAINER_IDENTITY=""

ops_defer_creation_signal() {
  if [[ -z "$OPS_CREATION_GUARD_SIGNAL" ]]; then
    OPS_CREATION_GUARD_SIGNAL="$1"
    OPS_CREATION_GUARD_STATUS="$2"
  fi
  return 0
}

ops_creation_guard_begin() {
  if [[ ! "$OPS_CREATION_GUARD_DEPTH" =~ ^[0-9]+$ ]]; then
    ops_fail "CREATION_GUARD_STATE_INVALID" "transaction"
    return
  fi
  if [[ "$OPS_CREATION_GUARD_DEPTH" -eq 0 ]]; then
    OPS_CREATION_GUARD_SIGNAL=""
    OPS_CREATION_GUARD_STATUS=""
    if [[ "$OPS_TRANSACTION_HANDLER_ACTIVE" == "yes" ]]; then
      OPS_CREATION_GUARD_RESTORE_MODE="clear"
    else
      OPS_CREATION_GUARD_RESTORE_MODE="transaction"
    fi
    trap 'ops_defer_creation_signal HUP 129' HUP
    trap 'ops_defer_creation_signal INT 130' INT
    trap 'ops_defer_creation_signal TERM 143' TERM
  fi
  OPS_CREATION_GUARD_DEPTH="$((OPS_CREATION_GUARD_DEPTH + 1))"
}

ops_creation_guard_end() {
  if [[ ! "$OPS_CREATION_GUARD_DEPTH" =~ ^[1-9][0-9]*$ ]]; then
    ops_fail "CREATION_GUARD_STATE_INVALID" "transaction"
    return
  fi
  OPS_CREATION_GUARD_DEPTH="$((OPS_CREATION_GUARD_DEPTH - 1))"
  if [[ "$OPS_CREATION_GUARD_DEPTH" -ne 0 ]]; then
    return 0
  fi
  if [[ "$OPS_CREATION_GUARD_RESTORE_MODE" == "clear" ]]; then
    trap - HUP INT TERM
  else
    trap 'ops_handle_transaction_signal HUP 129' HUP
    trap 'ops_handle_transaction_signal INT 130' INT
    trap 'ops_handle_transaction_signal TERM 143' TERM
  fi
  local signal="$OPS_CREATION_GUARD_SIGNAL"
  local status="$OPS_CREATION_GUARD_STATUS"
  OPS_CREATION_GUARD_SIGNAL=""
  OPS_CREATION_GUARD_STATUS=""
  if [[ -n "$signal" ]]; then
    ops_handle_transaction_signal "$signal" "$status"
  fi
}

ops_transaction_ref_index() {
  local key="$1"
  local index
  for index in "${!OPS_TRANSACTION_REF_KEYS[@]}"; do
    if [[ "${OPS_TRANSACTION_REF_KEYS[$index]}" == "$key" ]]; then
      printf '%s\n' "$index"
      return 0
    fi
  done
  return 1
}

ops_transaction_ref_identity() {
  local path="$1"
  local type="$2"
  local mode="$3"
  ops_require_below_root "$path" || return
  case "$type" in
    file)
      if [[ ! -f "$path" || -L "$path" ||
            "$(ops_stat_value '%u:%g:%h:%a' "$path")" != \
              "0:0:1:${mode}" ]]; then
        ops_fail "TRANSACTION_REF_FILE_INVALID" "transaction"
        return
      fi
      local device inode owner observed_mode links size digest
      device="$(ops_stat_value '%d' "$path")" || return
      inode="$(ops_stat_value '%i' "$path")" || return
      owner="$(ops_stat_value '%u:%g' "$path")" || return
      observed_mode="$(ops_stat_value '%a' "$path")" || return
      links="$(ops_stat_value '%h' "$path")" || return
      size="$(ops_stat_value '%s' "$path")" || return
      digest="$(ops_sha256_file "$path")" || return
      if [[ "$(ops_stat_value '%d:%i' "$path")" != \
            "${device}:${inode}" ]]; then
        ops_fail "TRANSACTION_REF_FILE_RACED" "transaction"
        return
      fi
      printf 'file\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$device" "$inode" "$owner" "$observed_mode" \
        "$links" "$size" "$digest"
      ;;
    symlink)
      local readlink device inode owner observed_mode links target
      readlink="$(ops_command readlink)" || return
      if [[ ! -L "$path" ||
            "$(ops_lstat_value '%u:%g' "$path")" != "0:0" ||
            "$(ops_lstat_value '%h' "$path")" != "1" ]]; then
        ops_fail "TRANSACTION_REF_SYMLINK_INVALID" "transaction"
        return
      fi
      device="$(ops_lstat_value '%d' "$path")" || return
      inode="$(ops_lstat_value '%i' "$path")" || return
      owner="$(ops_lstat_value '%u:%g' "$path")" || return
      observed_mode="$(ops_lstat_value '%a' "$path")" || return
      links="$(ops_lstat_value '%h' "$path")" || return
      target="$("$readlink" -- "$path")" || return
      if [[ ! "$target" =~ ^releases/v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)/frontend$ ||
            "$(ops_lstat_value '%d:%i' "$path")" != \
              "${device}:${inode}" ]]; then
        ops_fail "TRANSACTION_REF_SYMLINK_RACED" "transaction"
        return
      fi
      printf 'symlink\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$device" "$inode" "$owner" "$observed_mode" \
        "$links" "$target"
      ;;
    *)
      ops_fail "TRANSACTION_REF_TYPE_INVALID" "transaction"
      return
      ;;
  esac
}

ops_transaction_ref_capture() {
  local key="$1"
  local path="$2"
  local type="$3"
  local mode="${4:--}"
  if [[ ! "$key" =~ ^[a-z][a-z0-9-]{0,31}$ ]] ||
    ops_transaction_ref_index "$key" >/dev/null; then
    ops_fail "TRANSACTION_REF_KEY_INVALID" "transaction"
    return
  fi
  ops_require_below_root "$path" || return
  if [[ "$type" == "file" && ! "$mode" =~ ^[0-7]{3,4}$ ]] ||
    [[ "$type" != "file" && "$type" != "symlink" ]]; then
    ops_fail "TRANSACTION_REF_CONTRACT_INVALID" "transaction"
    return
  fi
  local before_state="absent"
  local before_identity=""
  if [[ -e "$path" || -L "$path" ]]; then
    before_identity="$(ops_transaction_ref_identity \
      "$path" "$type" "$mode")" || return
    before_state="present"
  fi
  OPS_TRANSACTION_REF_KEYS+=("$key")
  OPS_TRANSACTION_REF_PATHS+=("$path")
  OPS_TRANSACTION_REF_TYPES+=("$type")
  OPS_TRANSACTION_REF_MODES+=("$mode")
  OPS_TRANSACTION_REF_BEFORE_STATES+=("$before_state")
  OPS_TRANSACTION_REF_BEFORE_IDENTITIES+=("$before_identity")
  OPS_TRANSACTION_REF_AFTER_STATES+=("unsealed")
  OPS_TRANSACTION_REF_AFTER_IDENTITIES+=("")
}

ops_transaction_ref_current_identity() {
  local index="$1"
  ops_transaction_ref_identity \
    "${OPS_TRANSACTION_REF_PATHS[$index]}" \
    "${OPS_TRANSACTION_REF_TYPES[$index]}" \
    "${OPS_TRANSACTION_REF_MODES[$index]}"
}

ops_transaction_ref_matches_before() {
  local index="$1"
  local path="${OPS_TRANSACTION_REF_PATHS[$index]}"
  if [[ "${OPS_TRANSACTION_REF_BEFORE_STATES[$index]}" == "absent" ]]; then
    [[ ! -e "$path" && ! -L "$path" ]]
    return
  fi
  [[ "${OPS_TRANSACTION_REF_BEFORE_STATES[$index]}" == "present" ]] || return 1
  [[ "$(ops_transaction_ref_current_identity "$index")" == \
    "${OPS_TRANSACTION_REF_BEFORE_IDENTITIES[$index]}" ]]
}

ops_transaction_ref_matches_after() {
  local index="$1"
  [[ "${OPS_TRANSACTION_REF_AFTER_STATES[$index]}" == "sealed" ]] || return 1
  [[ "$(ops_transaction_ref_current_identity "$index")" == \
    "${OPS_TRANSACTION_REF_AFTER_IDENTITIES[$index]}" ]]
}

ops_transaction_ref_seal_after() {
  local key="$1"
  local index
  index="$(ops_transaction_ref_index "$key")" || {
    ops_fail "TRANSACTION_REF_NOT_CAPTURED" "transaction"
    return
  }
  OPS_TRANSACTION_REF_AFTER_IDENTITIES[$index]="$(
    ops_transaction_ref_current_identity "$index"
  )" || return
  OPS_TRANSACTION_REF_AFTER_STATES[$index]="sealed"
}

ops_transaction_publish_tracked_file() {
  local key="$1"
  local source="$2"
  local index
  index="$(ops_transaction_ref_index "$key")" || {
    ops_fail "TRANSACTION_REF_NOT_CAPTURED" "transaction"
    return
  }
  if [[ "${OPS_TRANSACTION_REF_TYPES[$index]}" != "file" ]]; then
    ops_fail "TRANSACTION_REF_TYPE_INVALID" "transaction"
    return
  fi
  local result=0
  ops_creation_guard_begin || return
  if [[ "${OPS_TRANSACTION_REF_AFTER_STATES[$index]}" != "unsealed" ]] ||
    ! ops_transaction_ref_matches_before "$index"; then
    ops_fail "TRANSACTION_REF_BEFORE_REPLACED" "transaction"
    result="$OPS_MANUAL_RECOVERY_EXIT"
  else
    ops_atomic_replace_file \
      "$source" \
      "${OPS_TRANSACTION_REF_PATHS[$index]}" \
      "${OPS_TRANSACTION_REF_MODES[$index]}" \
      0 0 || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_transaction_ref_seal_after "$key" || result=$?
  fi
  ops_creation_guard_end
  return "$result"
}

ops_transaction_publish_tracked_symlink() {
  local key="$1"
  local target="$2"
  local index
  index="$(ops_transaction_ref_index "$key")" || {
    ops_fail "TRANSACTION_REF_NOT_CAPTURED" "transaction"
    return
  }
  if [[ "${OPS_TRANSACTION_REF_TYPES[$index]}" != "symlink" ]]; then
    ops_fail "TRANSACTION_REF_TYPE_INVALID" "transaction"
    return
  fi
  local result=0
  ops_creation_guard_begin || return
  if [[ "${OPS_TRANSACTION_REF_AFTER_STATES[$index]}" != "unsealed" ]] ||
    ! ops_transaction_ref_matches_before "$index"; then
    ops_fail "TRANSACTION_REF_BEFORE_REPLACED" "transaction"
    result="$OPS_MANUAL_RECOVERY_EXIT"
  else
    ops_atomic_symlink \
      "$target" "${OPS_TRANSACTION_REF_PATHS[$index]}" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_transaction_ref_seal_after "$key" || result=$?
  fi
  ops_creation_guard_end
  return "$result"
}

ops_transaction_remove_tracked_ref() {
  local key="$1"
  local index
  index="$(ops_transaction_ref_index "$key")" || {
    ops_fail "TRANSACTION_REF_NOT_CAPTURED" "compensation"
    return
  }
  if ops_transaction_ref_matches_before "$index"; then
    return 0
  fi
  if [[ "${OPS_TRANSACTION_REF_BEFORE_STATES[$index]}" != "absent" ]] ||
    ! ops_transaction_ref_matches_after "$index"; then
    ops_fail "TRANSACTION_REF_REPLACED" "compensation"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local unlink dirname parent result=0
  unlink="$(ops_command unlink)" || return
  dirname="$(ops_command dirname)" || return
  parent="$("$dirname" -- "${OPS_TRANSACTION_REF_PATHS[$index]}")" || return
  ops_creation_guard_begin || return
  if ! ops_transaction_ref_matches_after "$index"; then
    result="$OPS_MANUAL_RECOVERY_EXIT"
  else
    "$unlink" -- "${OPS_TRANSACTION_REF_PATHS[$index]}" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_fsync_path "$parent" || result=$?
  fi
  ops_creation_guard_end
  if [[ "$result" -ne 0 ]]; then
    ops_fail "TRANSACTION_REF_REMOVE_FAILED" "compensation"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
}

ops_transaction_restore_tracked_file() {
  local key="$1"
  local source="$2"
  local index
  index="$(ops_transaction_ref_index "$key")" || {
    ops_fail "TRANSACTION_REF_NOT_CAPTURED" "compensation"
    return
  }
  if ops_transaction_ref_matches_before "$index"; then
    return 0
  fi
  if [[ "${OPS_TRANSACTION_REF_BEFORE_STATES[$index]}" != "present" ]] ||
    ! ops_transaction_ref_matches_after "$index"; then
    ops_fail "TRANSACTION_REF_REPLACED" "compensation"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local result=0
  ops_creation_guard_begin || return
  if ! ops_transaction_ref_matches_after "$index"; then
    result="$OPS_MANUAL_RECOVERY_EXIT"
  else
    ops_atomic_replace_file \
      "$source" \
      "${OPS_TRANSACTION_REF_PATHS[$index]}" \
      "${OPS_TRANSACTION_REF_MODES[$index]}" \
      0 0 || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    OPS_TRANSACTION_REF_BEFORE_IDENTITIES[$index]="$(
      ops_transaction_ref_current_identity "$index"
    )" || result=$?
  fi
  ops_creation_guard_end
  return "$result"
}

ops_transaction_restore_tracked_symlink() {
  local key="$1"
  local target="$2"
  local index
  index="$(ops_transaction_ref_index "$key")" || {
    ops_fail "TRANSACTION_REF_NOT_CAPTURED" "compensation"
    return
  }
  if ops_transaction_ref_matches_before "$index"; then
    return 0
  fi
  if [[ "${OPS_TRANSACTION_REF_BEFORE_STATES[$index]}" != "present" ]] ||
    ! ops_transaction_ref_matches_after "$index"; then
    ops_fail "TRANSACTION_REF_REPLACED" "compensation"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local result=0
  ops_creation_guard_begin || return
  if ! ops_transaction_ref_matches_after "$index"; then
    result="$OPS_MANUAL_RECOVERY_EXIT"
  else
    ops_atomic_symlink \
      "$target" "${OPS_TRANSACTION_REF_PATHS[$index]}" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    OPS_TRANSACTION_REF_BEFORE_IDENTITIES[$index]="$(
      ops_transaction_ref_current_identity "$index"
    )" || result=$?
  fi
  ops_creation_guard_end
  return "$result"
}

ops_preserve_unknown_temporary() {
  local candidate="$1"
  [[ -n "$candidate" ]] || return 0
  local observed
  for observed in "${OPS_TRANSACTION_UNKNOWN_TEMPORARIES[@]}"; do
    [[ "$observed" == "$candidate" ]] && return 0
  done
  OPS_TRANSACTION_UNKNOWN_TEMPORARIES+=("$candidate")
}

ops_temporary_path_is_registered() {
  local candidate="$1"
  local index
  for index in "${!OPS_TRANSACTION_TEMP_PATHS[@]}"; do
    [[ "${OPS_TRANSACTION_TEMP_PATHS[$index]}" == "$candidate" ]] &&
      return 0
  done
  return 1
}

ops_register_temporary_path() {
  local candidate="$1"
  local content_policy="${2:-mutable}"
  if [[ "$content_policy" != "mutable" &&
        "$content_policy" != "sealed" ]]; then
    ops_fail "TEMPORARY_CONTENT_POLICY_INVALID" "transaction"
    return
  fi
  case "$candidate" in
    "${OPS_ROOT}/compose/."*|\
    "${OPS_ROOT}/data/."*|\
    "${OPS_ROOT}/recovery/."*) ;;
    *)
      ops_fail "TEMPORARY_PATH_NOT_CLOSED" "transaction"
      return
      ;;
  esac
  if [[ ! -f "$candidate" || -L "$candidate" ||
        "$(ops_stat_value '%h' "$candidate")" != "1" ]]; then
    ops_fail "TEMPORARY_IDENTITY_INVALID" "transaction"
    return
  fi
  local device inode owner digest=""
  device="$(ops_stat_value '%d' "$candidate")" || return
  inode="$(ops_stat_value '%i' "$candidate")" || return
  owner="$(ops_stat_value '%u:%g' "$candidate")" || return
  if [[ "$content_policy" == "sealed" ]]; then
    digest="$(ops_sha256_file "$candidate")" || return
  fi
  local index
  for index in "${!OPS_TRANSACTION_TEMP_PATHS[@]}"; do
    if [[ "${OPS_TRANSACTION_TEMP_PATHS[$index]}" == "$candidate" ]]; then
      OPS_TRANSACTION_TEMP_DEVICES[$index]="$device"
      OPS_TRANSACTION_TEMP_INODES[$index]="$inode"
      OPS_TRANSACTION_TEMP_OWNERS[$index]="$owner"
      OPS_TRANSACTION_TEMP_DIGESTS[$index]="$digest"
      return 0
    fi
  done
  OPS_TRANSACTION_TEMP_PATHS+=("$candidate")
  OPS_TRANSACTION_TEMP_DEVICES+=("$device")
  OPS_TRANSACTION_TEMP_INODES+=("$inode")
  OPS_TRANSACTION_TEMP_OWNERS+=("$owner")
  OPS_TRANSACTION_TEMP_DIGESTS+=("$digest")
}

ops_make_temporary_file() {
  local variable="$1"
  local template="$2"
  if [[ ! "$variable" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    ops_fail "TEMPORARY_VARIABLE_INVALID" "transaction"
    return
  fi
  local mktemp candidate="" result=0
  mktemp="$(ops_command mktemp)" || return
  ops_creation_guard_begin || return
  candidate="$("$mktemp" "$template")" || result=$?
  if [[ "$result" -eq 0 ]]; then
    ops_register_temporary_path "$candidate" || result=$?
  fi
  if [[ "$result" -ne 0 && ( -e "$candidate" || -L "$candidate" ) ]]; then
    ops_preserve_unknown_temporary "$candidate"
  fi
  ops_creation_guard_end
  if [[ "$result" -ne 0 ]]; then
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  printf -v "$variable" '%s' "$candidate"
}

ops_register_temporary_symlink() {
  local candidate="$1"
  if [[ "$candidate" != "${OPS_ROOT}/current-frontend.bgmss-new" ||
        ! -L "$candidate" ||
        "$(ops_lstat_value '%u:%g' "$candidate")" != "0:0" ]]; then
    ops_fail "TEMPORARY_SYMLINK_INVALID" "transaction"
    return
  fi
  local readlink device inode target
  readlink="$(ops_command readlink)" || return
  device="$(ops_lstat_value '%d' "$candidate")" || return
  inode="$(ops_lstat_value '%i' "$candidate")" || return
  target="$("$readlink" -- "$candidate")" || return
  local index
  for index in "${!OPS_TRANSACTION_TEMP_SYMLINKS[@]}"; do
    if [[ "${OPS_TRANSACTION_TEMP_SYMLINKS[$index]}" == "$candidate" ]]; then
      OPS_TRANSACTION_TEMP_SYMLINK_DEVICES[$index]="$device"
      OPS_TRANSACTION_TEMP_SYMLINK_INODES[$index]="$inode"
      OPS_TRANSACTION_TEMP_SYMLINK_TARGETS[$index]="$target"
      return 0
    fi
  done
  OPS_TRANSACTION_TEMP_SYMLINKS+=("$candidate")
  OPS_TRANSACTION_TEMP_SYMLINK_DEVICES+=("$device")
  OPS_TRANSACTION_TEMP_SYMLINK_INODES+=("$inode")
  OPS_TRANSACTION_TEMP_SYMLINK_TARGETS+=("$target")
}

ops_cleanup_registered_temporary_path() {
  local candidate="$1"
  [[ -n "$candidate" ]] || return 0
  local index=""
  local observed
  for observed in "${!OPS_TRANSACTION_TEMP_PATHS[@]}"; do
    if [[ "${OPS_TRANSACTION_TEMP_PATHS[$observed]}" == "$candidate" ]]; then
      index="$observed"
      break
    fi
  done
  if [[ -z "$index" ]]; then
    if [[ -e "$candidate" || -L "$candidate" ]]; then
      ops_emit_failure "TEMPORARY_NOT_REGISTERED" \
        "manual-recovery" || true
      return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    return 0
  fi
  if [[ ! -e "$candidate" && ! -L "$candidate" ]]; then
    unset 'OPS_TRANSACTION_TEMP_PATHS[index]'
    unset 'OPS_TRANSACTION_TEMP_DEVICES[index]'
    unset 'OPS_TRANSACTION_TEMP_INODES[index]'
    unset 'OPS_TRANSACTION_TEMP_OWNERS[index]'
    unset 'OPS_TRANSACTION_TEMP_DIGESTS[index]'
    return 0
  fi
  if [[ ! -f "$candidate" || -L "$candidate" ||
        "$(ops_stat_value '%h' "$candidate")" != "1" ||
        "$(ops_stat_value '%d' "$candidate")" != \
          "${OPS_TRANSACTION_TEMP_DEVICES[$index]}" ||
        "$(ops_stat_value '%i' "$candidate")" != \
          "${OPS_TRANSACTION_TEMP_INODES[$index]}" ||
        "$(ops_stat_value '%u:%g' "$candidate")" != \
          "${OPS_TRANSACTION_TEMP_OWNERS[$index]}" ||
        ( -n "${OPS_TRANSACTION_TEMP_DIGESTS[$index]}" &&
          "$(ops_sha256_file "$candidate")" != \
            "${OPS_TRANSACTION_TEMP_DIGESTS[$index]}" ) ]]; then
    ops_emit_failure "TEMPORARY_IDENTITY_CHANGED" \
      "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local unlink
  unlink="$(ops_command unlink)" || return
  "$unlink" -- "$candidate" || return "$OPS_MANUAL_RECOVERY_EXIT"
  unset 'OPS_TRANSACTION_TEMP_PATHS[index]'
  unset 'OPS_TRANSACTION_TEMP_DEVICES[index]'
  unset 'OPS_TRANSACTION_TEMP_INODES[index]'
  unset 'OPS_TRANSACTION_TEMP_OWNERS[index]'
  unset 'OPS_TRANSACTION_TEMP_DIGESTS[index]'
}

ops_cleanup_registered_temporary_symlink() {
  local candidate="$1"
  [[ -n "$candidate" ]] || return 0
  local index=""
  local observed
  for observed in "${!OPS_TRANSACTION_TEMP_SYMLINKS[@]}"; do
    if [[ "${OPS_TRANSACTION_TEMP_SYMLINKS[$observed]}" == "$candidate" ]]; then
      index="$observed"
      break
    fi
  done
  if [[ -z "$index" ]]; then
    if [[ -e "$candidate" || -L "$candidate" ]]; then
      ops_emit_failure "TEMPORARY_SYMLINK_NOT_REGISTERED" \
        "manual-recovery" || true
      return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    return 0
  fi
  if [[ ! -e "$candidate" && ! -L "$candidate" ]]; then
    unset 'OPS_TRANSACTION_TEMP_SYMLINKS[index]'
    unset 'OPS_TRANSACTION_TEMP_SYMLINK_DEVICES[index]'
    unset 'OPS_TRANSACTION_TEMP_SYMLINK_INODES[index]'
    unset 'OPS_TRANSACTION_TEMP_SYMLINK_TARGETS[index]'
    return 0
  fi
  local readlink
  readlink="$(ops_command readlink)" || return
  if [[ ! -L "$candidate" ||
        "$(ops_lstat_value '%h' "$candidate")" != "1" ||
        "$(ops_lstat_value '%u:%g' "$candidate")" != "0:0" ||
        "$(ops_lstat_value '%d' "$candidate")" != \
          "${OPS_TRANSACTION_TEMP_SYMLINK_DEVICES[$index]}" ||
        "$(ops_lstat_value '%i' "$candidate")" != \
          "${OPS_TRANSACTION_TEMP_SYMLINK_INODES[$index]}" ||
        "$("$readlink" -- "$candidate")" != \
          "${OPS_TRANSACTION_TEMP_SYMLINK_TARGETS[$index]}" ]]; then
    ops_emit_failure "TEMPORARY_SYMLINK_IDENTITY_CHANGED" \
      "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local unlink
  unlink="$(ops_command unlink)" || return
  "$unlink" -- "$candidate" || return "$OPS_MANUAL_RECOVERY_EXIT"
  unset 'OPS_TRANSACTION_TEMP_SYMLINKS[index]'
  unset 'OPS_TRANSACTION_TEMP_SYMLINK_DEVICES[index]'
  unset 'OPS_TRANSACTION_TEMP_SYMLINK_INODES[index]'
  unset 'OPS_TRANSACTION_TEMP_SYMLINK_TARGETS[index]'
}

ops_cleanup_temporary_paths() {
  local result=0 candidate
  for candidate in "$@"; do
    ops_cleanup_registered_temporary_path "$candidate" || result=$?
  done
  return "$result"
}

ops_dispose_temporary_paths() {
  if ! ops_cleanup_temporary_paths "$@"; then
    ops_emit_failure "TEMPORARY_CLEANUP_FAILED" \
      "manual-recovery" || true
    exit "$OPS_MANUAL_RECOVERY_EXIT"
  fi
}

ops_cleanup_registered_temporaries() {
  local result=0 candidate
  local -a paths=("${OPS_TRANSACTION_TEMP_PATHS[@]}")
  local -a symlinks=("${OPS_TRANSACTION_TEMP_SYMLINKS[@]}")
  for candidate in "${paths[@]}"; do
    ops_cleanup_registered_temporary_path "$candidate" || result=$?
  done
  for candidate in "${symlinks[@]}"; do
    ops_cleanup_registered_temporary_symlink "$candidate" || result=$?
  done
  for candidate in "${OPS_TRANSACTION_UNKNOWN_TEMPORARIES[@]}"; do
    if [[ -e "$candidate" || -L "$candidate" ]]; then
      ops_emit_failure "UNKNOWN_TEMPORARY_PRESERVED" \
        "manual-recovery" || true
      result="$OPS_MANUAL_RECOVERY_EXIT"
    fi
  done
  return "$result"
}

ops_transaction_reset() {
  OPS_TRANSACTION_ACTIVE="no"
  OPS_TRANSACTION_ACTION=""
  OPS_TRANSACTION_RUN_ID=""
  OPS_TRANSACTION_MODE=""
  OPS_TRANSACTION_HAD_PREVIOUS="no"
  OPS_TRANSACTION_PREVIOUS_ENV=""
  OPS_TRANSACTION_PREVIOUS_FRONTEND=""
  OPS_TRANSACTION_EXPECTED_DATA=""
  OPS_TRANSACTION_CANDIDATE_ENV_DIGEST=""
  OPS_TRANSACTION_CANDIDATE_FRONTEND=""
  OPS_TRANSACTION_OLD_CURRENT=""
  OPS_TRANSACTION_APP_ENV_DIGEST=""
  OPS_TRANSACTION_APP_FRONTEND=""
  OPS_TRANSACTION_FRESH_CURRENT_DEVICE=""
  OPS_TRANSACTION_FRESH_CURRENT_INODE=""
  OPS_TRANSACTION_FRESH_CURRENT_DIGEST=""
  OPS_TRANSACTION_FRESH_ENV=""
  OPS_TRANSACTION_ACQUISITION_ROOT=""
  OPS_TRANSACTION_ACQUISITION_DEVICE=""
  OPS_TRANSACTION_ACQUISITION_INODE=""
  OPS_TRANSACTION_ACQUISITION_STATE="absent"
  OPS_TRANSACTION_ACQUISITION_TREE_STATE="unsealed"
  OPS_TRANSACTION_ACQUISITION_PATHS=()
  OPS_TRANSACTION_ACQUISITION_TYPES=()
  OPS_TRANSACTION_ACQUISITION_STATES=()
  OPS_TRANSACTION_ACQUISITION_DEVICES=()
  OPS_TRANSACTION_ACQUISITION_INODES=()
  OPS_TRANSACTION_ACQUISITION_OWNERS=()
  OPS_TRANSACTION_ACQUISITION_MODES=()
  OPS_TRANSACTION_ACQUISITION_LINKS=()
  OPS_TRANSACTION_ACQUISITION_SIZES=()
  OPS_TRANSACTION_ACQUISITION_DIGESTS=()
  OPS_TRANSACTION_RUNTIME_STAGE=""
  OPS_TRANSACTION_PAYLOAD_STAGE=""
  OPS_TRANSACTION_RUNTIME_FINAL=""
  OPS_TRANSACTION_PAYLOAD_FINAL=""
  OPS_TRANSACTION_RUNTIME_DEVICE=""
  OPS_TRANSACTION_RUNTIME_INODE=""
  OPS_TRANSACTION_PAYLOAD_DEVICE=""
  OPS_TRANSACTION_PAYLOAD_INODE=""
  OPS_TRANSACTION_BEFORE_VERSIONS=""
  OPS_TRANSACTION_CURRENT_IDENTITY=""
  OPS_TRANSACTION_API_IDENTITY=""
  OPS_TRANSACTION_SECONDARY_PATH=""
  OPS_TRANSACTION_SECONDARY_STATE=""
  OPS_TRANSACTION_SECONDARY_COPY=""
  OPS_TRANSACTION_SECONDARY_MODE=""
  OPS_TRANSACTION_EVIDENCE_PATH=""
  OPS_TRANSACTION_EVIDENCE_STATE=""
  OPS_TRANSACTION_EVIDENCE_COPY=""
  OPS_TRANSACTION_PUBLISHED_DATA=""
  OPS_TRANSACTION_REF_KEYS=()
  OPS_TRANSACTION_REF_PATHS=()
  OPS_TRANSACTION_REF_TYPES=()
  OPS_TRANSACTION_REF_MODES=()
  OPS_TRANSACTION_REF_BEFORE_STATES=()
  OPS_TRANSACTION_REF_BEFORE_IDENTITIES=()
  OPS_TRANSACTION_REF_AFTER_STATES=()
  OPS_TRANSACTION_REF_AFTER_IDENTITIES=()
  OPS_TRANSACTION_UPDATER_CONTAINER_STATE="absent"
  OPS_TRANSACTION_UPDATER_CONTAINER_ID=""
  OPS_TRANSACTION_UPDATER_CONTAINER_NAME=""
  OPS_TRANSACTION_UPDATER_CONTAINER_IDENTITY=""
}

ops_transaction_arm() {
  local action="$1"
  local run_id="$2"
  local mode="$3"
  if [[ "$OPS_TRANSACTION_ACTIVE" == "yes" ||
        ! "$action" =~ ^[a-z][a-z0-9-]{0,31}$ ||
        ! "$mode" =~ ^[a-z][a-z0-9-]{0,31}$ ]] ||
    ! ops_is_run_id "$run_id"; then
    ops_fail "TRANSACTION_ARM_INVALID" "transaction"
    return
  fi
  OPS_TRANSACTION_ACTION="$action"
  OPS_TRANSACTION_RUN_ID="$run_id"
  OPS_TRANSACTION_MODE="$mode"
  OPS_TRANSACTION_ACTIVE="yes"
}

ops_transaction_disarm() {
  ops_transaction_reset
}

ops_transaction_transition() {
  local mode="$1"
  if [[ "$OPS_TRANSACTION_ACTIVE" != "yes" ||
        ! "$mode" =~ ^[a-z][a-z0-9-]{0,31}$ ]]; then
    ops_fail "TRANSACTION_TRANSITION_INVALID" "transaction"
    return
  fi
  OPS_TRANSACTION_MODE="$mode"
}

ops_transaction_capture_secondary() {
  local path="$1"
  local template="$2"
  local mode="$3"
  OPS_TRANSACTION_SECONDARY_PATH="$path"
  OPS_TRANSACTION_SECONDARY_MODE="$mode"
  ops_transaction_ref_capture secondary "$path" file "$mode" || return
  if [[ -e "$path" || -L "$path" ]]; then
    ops_require_regular_file "$path" 0 0 "$mode" || return
    OPS_TRANSACTION_SECONDARY_STATE="present"
    ops_make_temporary_file \
      OPS_TRANSACTION_SECONDARY_COPY "$template" || return
    ops_copy_temporary "$path" "$OPS_TRANSACTION_SECONDARY_COPY" || return
  else
    OPS_TRANSACTION_SECONDARY_STATE="absent"
  fi
}

ops_transaction_restore_secondary() {
  if [[ -z "$OPS_TRANSACTION_SECONDARY_PATH" ]]; then
    return 0
  fi
  case "$OPS_TRANSACTION_SECONDARY_STATE" in
    present)
      ops_transaction_restore_tracked_file \
        secondary "$OPS_TRANSACTION_SECONDARY_COPY"
      return
      ;;
    absent)
      ops_transaction_remove_tracked_ref secondary
      return
      ;;
    *)
    ops_fail "TRANSACTION_SECONDARY_STATE_INVALID" "compensation"
    return
      ;;
  esac
}

ops_transaction_capture_evidence() {
  OPS_TRANSACTION_EVIDENCE_PATH="${OPS_ROOT}/recovery/rollback-exercised.json"
  ops_transaction_ref_capture \
    evidence "$OPS_TRANSACTION_EVIDENCE_PATH" file 400 || return
  if [[ -e "$OPS_TRANSACTION_EVIDENCE_PATH" ||
        -L "$OPS_TRANSACTION_EVIDENCE_PATH" ]]; then
    ops_require_regular_file "$OPS_TRANSACTION_EVIDENCE_PATH" 0 0 400 || return
    OPS_TRANSACTION_EVIDENCE_STATE="present"
    ops_make_temporary_file \
      OPS_TRANSACTION_EVIDENCE_COPY \
      "${OPS_ROOT}/recovery/.rollback-evidence.XXXXXXXX" || return
    ops_copy_temporary \
      "$OPS_TRANSACTION_EVIDENCE_PATH" \
      "$OPS_TRANSACTION_EVIDENCE_COPY" || return
  else
    OPS_TRANSACTION_EVIDENCE_STATE="absent"
  fi
}

ops_transaction_restore_evidence() {
  if [[ -z "$OPS_TRANSACTION_EVIDENCE_PATH" ]]; then
    return 0
  fi
  case "$OPS_TRANSACTION_EVIDENCE_STATE" in
    present)
      ops_transaction_restore_tracked_file \
        evidence "$OPS_TRANSACTION_EVIDENCE_COPY"
      return
      ;;
    absent)
      ops_transaction_remove_tracked_ref evidence
      return
      ;;
    *)
    ops_fail "TRANSACTION_EVIDENCE_STATE_INVALID" "compensation"
    return
      ;;
  esac
}

ops_transaction_restore_frontend() {
  local target="$1"
  ops_transaction_restore_tracked_symlink app-frontend "$target"
}

ops_transaction_remove_frontend() {
  ops_transaction_remove_tracked_ref app-frontend
}

ops_transaction_compensate_app() {
  if [[ "$OPS_TRANSACTION_HAD_PREVIOUS" == "yes" ]]; then
    ops_transaction_restore_frontend \
      "$OPS_TRANSACTION_PREVIOUS_FRONTEND" || return
    ops_transaction_restore_tracked_file \
      app-environment "$OPS_TRANSACTION_PREVIOUS_ENV" || return
    ops_transaction_restore_secondary || return
    ops_transaction_restore_evidence || return
    ops_restart_api || return
    ops_wait_healthy "$OPS_TRANSACTION_EXPECTED_DATA" || return
    return 0
  fi

  local environment="${OPS_ROOT}/compose/release.env"
  if [[ -e "$environment" || -L "$environment" ]]; then
    local environment_index
    environment_index="$(ops_transaction_ref_index app-environment)" || return
    if ! ops_transaction_ref_matches_after "$environment_index"; then
      ops_fail "TRANSACTION_APP_ENV_REPLACED" "compensation"
      return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    ops_stop_api_with_env "$environment" || return
  fi
  ops_transaction_remove_frontend "$OPS_TRANSACTION_CANDIDATE_FRONTEND" || return
  if [[ -e "$environment" || -L "$environment" ]]; then
    ops_transaction_remove_tracked_ref app-environment || return
  fi
  if ops_transaction_ref_index fresh-current >/dev/null; then
    ops_transaction_remove_tracked_ref fresh-current || return
  fi
}

ops_transaction_compensate_data() {
  ops_transaction_restore_tracked_file \
    data-current "$OPS_TRANSACTION_OLD_CURRENT" || return
  ops_transaction_restore_secondary || return
  ops_transaction_restore_evidence || return
  if [[ "$(ops_sha256_file "${OPS_ROOT}/compose/release.env")" != \
        "$OPS_TRANSACTION_APP_ENV_DIGEST" ||
        "$(ops_readlink_frontend)" != "$OPS_TRANSACTION_APP_FRONTEND" ]]; then
    ops_fail "TRANSACTION_CROSS_DIMENSION_CHANGE" "compensation"
    return
  fi
  ops_restart_api || return
  ops_wait_healthy "$OPS_TRANSACTION_EXPECTED_DATA"
}

ops_transaction_compensate_fresh() {
  if [[ -n "$OPS_TRANSACTION_FRESH_ENV" &&
        -f "$OPS_TRANSACTION_FRESH_ENV" &&
        ! -L "$OPS_TRANSACTION_FRESH_ENV" ]]; then
    ops_stop_fresh_candidate "$OPS_TRANSACTION_FRESH_ENV" || return
  fi
  case "$OPS_FRESH_MASK_STATE" in
    recorded)
      ops_remove_fresh_current_mask || return
      ;;
    absent)
      if [[ -e "${OPS_ROOT}/data/current.json" ||
            -L "${OPS_ROOT}/data/current.json" ]] &&
        [[ -z "$OPS_TRANSACTION_FRESH_CURRENT_DEVICE" ]]; then
        ops_fail "FRESH_CURRENT_FOREIGN_INSERT" "compensation"
        return
      fi
      ;;
    creating)
      if [[ -e "${OPS_ROOT}/data/current.json" ||
            -L "${OPS_ROOT}/data/current.json" ]]; then
        ops_fail "FRESH_CURRENT_CREATION_UNRECORDED" "compensation"
        return
      fi
      ;;
    *)
      ops_fail "FRESH_CURRENT_LEDGER_INVALID" "compensation"
      return
      ;;
  esac
  if ops_transaction_ref_index fresh-current >/dev/null; then
    ops_transaction_remove_tracked_ref fresh-current || return
  fi
  ops_require_strict_fresh_archive_state
}

ops_transaction_compensate_acquisition() {
  if [[ -n "$OPS_TRANSACTION_RUNTIME_STAGE" ]] &&
    { [[ -e "$OPS_TRANSACTION_RUNTIME_FINAL" ]] ||
      [[ -e "$OPS_TRANSACTION_PAYLOAD_FINAL" ]]; }; then
    ops_restore_release_publication_stages \
      "$OPS_TRANSACTION_RUNTIME_STAGE" \
      "$OPS_TRANSACTION_PAYLOAD_STAGE" \
      "$OPS_TRANSACTION_RUNTIME_FINAL" \
      "$OPS_TRANSACTION_PAYLOAD_FINAL" \
      "$OPS_TRANSACTION_RUNTIME_DEVICE" \
      "$OPS_TRANSACTION_RUNTIME_INODE" \
      "$OPS_TRANSACTION_PAYLOAD_DEVICE" \
      "$OPS_TRANSACTION_PAYLOAD_INODE" || return
  fi
  case "$OPS_TRANSACTION_ACQUISITION_STATE" in
    recorded)
      if [[ -e "$OPS_TRANSACTION_ACQUISITION_ROOT" ||
            -L "$OPS_TRANSACTION_ACQUISITION_ROOT" ]]; then
        ops_cleanup_acquisition_root \
          "$OPS_TRANSACTION_ACQUISITION_ROOT" \
          "$OPS_TRANSACTION_ACQUISITION_DEVICE" \
          "$OPS_TRANSACTION_ACQUISITION_INODE" || return
      fi
      ;;
    absent)
      if [[ -n "$OPS_TRANSACTION_ACQUISITION_ROOT" &&
            ( -e "$OPS_TRANSACTION_ACQUISITION_ROOT" ||
              -L "$OPS_TRANSACTION_ACQUISITION_ROOT" ) ]]; then
        ops_fail "ACQUISITION_FOREIGN_INSERT" "compensation"
        return
      fi
      ;;
    creating)
      if [[ -n "$OPS_TRANSACTION_ACQUISITION_ROOT" &&
            ( -e "$OPS_TRANSACTION_ACQUISITION_ROOT" ||
              -L "$OPS_TRANSACTION_ACQUISITION_ROOT" ) ]]; then
        ops_fail "ACQUISITION_CREATION_UNRECORDED" "compensation"
        return
      fi
      ;;
    *)
      ops_fail "ACQUISITION_LEDGER_INVALID" "compensation"
      return
      ;;
  esac
  if [[ -n "$OPS_TRANSACTION_RUNTIME_STAGE" ]] &&
    { [[ -e "$OPS_TRANSACTION_RUNTIME_FINAL" ]] ||
      [[ -L "$OPS_TRANSACTION_RUNTIME_FINAL" ]] ||
      [[ -e "$OPS_TRANSACTION_PAYLOAD_FINAL" ]] ||
      [[ -L "$OPS_TRANSACTION_PAYLOAD_FINAL" ]]; }; then
    ops_fail "ACQUISITION_PUBLICATION_REMAINS" "compensation"
    return
  fi
}

ops_updater_container_identity() {
  local container_id="$1"
  local docker jq inspection
  docker="$(ops_command docker)" || return
  jq="$(ops_command jq)" || return
  inspection="$("$docker" inspect --type container "$container_id")" || return
  "$jq" -cS '
    if length != 1 then error("container identity is not singular") else
      .[0] | {
        Id,
        Image,
        Name,
        Config:{
          Cmd:.Config.Cmd,
          Entrypoint:.Config.Entrypoint,
          Image:.Config.Image,
          Labels:.Config.Labels,
          User:.Config.User
        },
        HostConfig:{
          AutoRemove:.HostConfig.AutoRemove,
          Binds:.HostConfig.Binds,
          CapAdd:.HostConfig.CapAdd,
          CapDrop:.HostConfig.CapDrop,
          Init:.HostConfig.Init,
          LogConfig:.HostConfig.LogConfig,
          Memory:.HostConfig.Memory,
          NanoCpus:.HostConfig.NanoCpus,
          NetworkMode:.HostConfig.NetworkMode,
          PidsLimit:.HostConfig.PidsLimit,
          PortBindings:.HostConfig.PortBindings,
          Privileged:.HostConfig.Privileged,
          PublishAllPorts:.HostConfig.PublishAllPorts,
          ReadonlyRootfs:.HostConfig.ReadonlyRootfs,
          RestartPolicy:.HostConfig.RestartPolicy,
          SecurityOpt:.HostConfig.SecurityOpt,
          Tmpfs:.HostConfig.Tmpfs
        },
        Mounts:.Mounts,
        Networks:(.NetworkSettings.Networks | keys)
      }
    end
  ' <<< "$inspection"
}

ops_seal_updater_container() {
  local container_id="$1"
  local container_name="$2"
  local run_id="$3"
  local docker jq inspection network
  docker="$(ops_command docker)" || return
  jq="$(ops_command jq)" || return
  inspection="$("$docker" inspect --type container "$container_id")" || return
  network="${OPS_PROJECT}_outbound"
  if ! "$jq" -e \
    --arg commonCommit "${OPS_RELEASE_ENV[BGMSS_COMMON_COMMIT]}" \
    --arg containerId "$container_id" \
    --arg containerName "/${container_name}" \
    --arg currentDeny "${OPS_ROOT}/compose/updater-current-deny" \
    --arg dataRoot "${OPS_ROOT}/data" \
    --arg image "${OPS_RELEASE_ENV[BGMSS_UPDATER_IMAGE]}" \
    --arg network "$network" \
    --arg project "$OPS_PROJECT" \
    --arg releaseSmoke \
      "${OPS_RELEASE_ENV[BGMSS_RELEASE_ROOT]}/bin/archive-smoke" \
    --arg runId "$run_id" \
    --arg version "${OPS_RELEASE_ENV[BGMSS_APP_VERSION]}" '
      if length != 1 then false else
      .[0] as $c |
      ($c.Id == $containerId and
      $c.Name == $containerName and
      ($c.Image | test("^sha256:[0-9a-f]{64}$")) and
      $c.Config.Image == $image and
      $c.Config.User == "65532:65532" and
      $c.Config.Cmd == [
        "produce",
        "--output-root", "/var/lib/bgmss/archive",
        "--contracts-root", "/opt/bgmss/producer/contracts",
        "--catalog-config", "/opt/bgmss/producer/catalog/display-v1.yaml",
        "--common-commit", $commonCommit,
        "--archive-smoke", "/opt/bgmss/release/archive-smoke",
        "--status-file", "/var/lib/bgmss/archive/update-status.json"
      ] and
      $c.Config.Labels["com.docker.compose.project"] == $project and
      $c.Config.Labels["com.docker.compose.service"] == "updater" and
      $c.Config.Labels["fun.bgmss.app-version"] == $version and
      $c.Config.Labels["fun.bgmss.role"] == "updater" and
      $c.Config.Labels["fun.bgmss.run-id"] == $runId and
      $c.HostConfig.AutoRemove == false and
      $c.HostConfig.CapAdd == null and
      $c.HostConfig.CapDrop == ["ALL"] and
      $c.HostConfig.Init == true and
      $c.HostConfig.LogConfig.Type == "journald" and
      $c.HostConfig.Memory == 671088640 and
      $c.HostConfig.NanoCpus == 1000000000 and
      $c.HostConfig.NetworkMode == $network and
      $c.HostConfig.PidsLimit == 256 and
      ($c.HostConfig.PortBindings | length) == 0 and
      $c.HostConfig.Privileged == false and
      $c.HostConfig.PublishAllPorts == false and
      $c.HostConfig.ReadonlyRootfs == true and
      $c.HostConfig.RestartPolicy.Name == "no" and
      $c.HostConfig.SecurityOpt == ["no-new-privileges:true"] and
      ($c.HostConfig.Tmpfs | keys | sort) == ["/tmp","/work"] and
      ($c.NetworkSettings.Networks | keys) == [$network] and
      ($c.Mounts | length) == 3 and
      any($c.Mounts[];
        .Type == "bind" and .Source == $dataRoot and
        .Destination == "/var/lib/bgmss/archive" and .RW == true) and
      any($c.Mounts[];
        .Type == "bind" and
        .Source == $currentDeny and
        .Destination == "/var/lib/bgmss/archive/current.json" and
        .RW == false) and
      any($c.Mounts[];
        .Type == "bind" and .Source == $releaseSmoke and
        .Destination == "/opt/bgmss/release/archive-smoke" and
        .RW == false))
      end
    ' <<< "$inspection" >/dev/null; then
    ops_fail "UPDATER_CONTAINER_SECURITY_INVALID" "updater"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  OPS_TRANSACTION_UPDATER_CONTAINER_IDENTITY="$(
    ops_updater_container_identity "$container_id"
  )" || return
  OPS_TRANSACTION_UPDATER_CONTAINER_STATE="sealed"
}

ops_updater_container_matches() {
  [[ "$OPS_TRANSACTION_UPDATER_CONTAINER_STATE" == "sealed" &&
    -n "$OPS_TRANSACTION_UPDATER_CONTAINER_ID" &&
    -n "$OPS_TRANSACTION_UPDATER_CONTAINER_IDENTITY" &&
    "$(ops_updater_container_identity \
      "$OPS_TRANSACTION_UPDATER_CONTAINER_ID")" == \
      "$OPS_TRANSACTION_UPDATER_CONTAINER_IDENTITY" ]]
}

ops_stop_updater_containers() {
  case "$OPS_TRANSACTION_UPDATER_CONTAINER_STATE" in
    absent|removed) return 0 ;;
    sealed) ;;
    *)
      ops_fail "UPDATER_CONTAINER_NOT_SEALED" "compensation"
      return "$OPS_MANUAL_RECOVERY_EXIT"
      ;;
  esac
  local docker running result=0
  docker="$(ops_command docker)" || return
  ops_creation_guard_begin || return
  if ! ops_updater_container_matches; then
    result="$OPS_MANUAL_RECOVERY_EXIT"
  fi
  if [[ "$result" -eq 0 ]]; then
    running="$("$docker" inspect \
      --type container --format '{{.State.Running}}' \
      "$OPS_TRANSACTION_UPDATER_CONTAINER_ID")" || result=$?
  fi
  if [[ "$result" -eq 0 && "$running" == "true" ]]; then
    "$docker" stop --time 30 \
      "$OPS_TRANSACTION_UPDATER_CONTAINER_ID" >/dev/null || result=$?
  elif [[ "$result" -eq 0 && "$running" != "false" ]]; then
    result="$OPS_MANUAL_RECOVERY_EXIT"
  fi
  if [[ "$result" -eq 0 ]] && ! ops_updater_container_matches; then
    result="$OPS_MANUAL_RECOVERY_EXIT"
  fi
  if [[ "$result" -eq 0 ]]; then
    "$docker" rm "$OPS_TRANSACTION_UPDATER_CONTAINER_ID" >/dev/null ||
      result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    OPS_TRANSACTION_UPDATER_CONTAINER_STATE="removed"
  fi
  ops_creation_guard_end
  if [[ "$result" -ne 0 ]]; then
    ops_fail "UPDATER_CONTAINER_CLEANUP_UNSAFE" "compensation"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
}

ops_transaction_compensate_updater() {
  ops_stop_updater_containers || return
  ops_verify_updater_unchanged \
    "$OPS_TRANSACTION_BEFORE_VERSIONS" \
    "$OPS_TRANSACTION_CURRENT_IDENTITY" \
    "$OPS_TRANSACTION_API_IDENTITY" \
    "$OPS_TRANSACTION_EXPECTED_DATA" || return
  if [[ "$(ops_sha256_file "${OPS_ROOT}/compose/release.env")" != \
        "$OPS_TRANSACTION_APP_ENV_DIGEST" ||
        "$(ops_readlink_frontend)" != "$OPS_TRANSACTION_APP_FRONTEND" ]]; then
    ops_fail "UPDATER_CROSS_DIMENSION_CHANGE" "compensation"
    return
  fi
}

ops_transaction_compensate_published() {
  ops_stop_updater_containers || return
  if [[ "$(ops_stat_value '%d:%i' "${OPS_ROOT}/data/current.json"):$(ops_sha256_file \
      "${OPS_ROOT}/data/current.json")" != \
        "$OPS_TRANSACTION_CURRENT_IDENTITY" ||
        "$(ops_current_api_identity)" != "$OPS_TRANSACTION_API_IDENTITY" ||
        "$(ops_sha256_file "${OPS_ROOT}/compose/release.env")" != \
          "$OPS_TRANSACTION_APP_ENV_DIGEST" ||
        "$(ops_readlink_frontend)" != "$OPS_TRANSACTION_APP_FRONTEND" ]]; then
    ops_fail "PUBLISHED_STATE_DRIFT" "compensation"
    return
  fi
  ops_require_no_updater_stage || return
  ops_verify_managed_data_version "$OPS_TRANSACTION_PUBLISHED_DATA" || return
  ops_verify_archive_version "$OPS_TRANSACTION_PUBLISHED_DATA" >/dev/null || return
  ops_verify_data_inventory || return
  ops_wait_healthy "$OPS_TRANSACTION_EXPECTED_DATA"
}

ops_transaction_compensate_publishing() {
  if [[ ! -f "${OPS_ROOT}/recovery/data/${OPS_TRANSACTION_PUBLISHED_DATA}.json" ||
        -L "${OPS_ROOT}/recovery/data/${OPS_TRANSACTION_PUBLISHED_DATA}.json" ]]; then
    ops_fail "PUBLISHED_CANDIDATE_NOT_SEALED" "compensation"
    return
  fi
  ops_transaction_compensate_published
}

ops_transaction_compensate() {
  case "$OPS_TRANSACTION_MODE" in
    acquisition) ops_transaction_compensate_acquisition ;;
    app) ops_transaction_compensate_app ;;
    data) ops_transaction_compensate_data ;;
    fresh) ops_transaction_compensate_fresh ;;
    published) ops_transaction_compensate_published ;;
    publishing) ops_transaction_compensate_publishing ;;
    updater) ops_transaction_compensate_updater ;;
    *)
      ops_fail "TRANSACTION_MODE_INVALID" "compensation"
      return
      ;;
  esac
}

ops_transaction_compensate_now() {
  local primary="$1"
  local secondary="$2"
  if ops_transaction_compensate; then
    ops_transaction_disarm
    return 0
  fi
  ops_record_manual_recovery \
    "$OPS_TRANSACTION_RUN_ID" \
    "$OPS_TRANSACTION_ACTION" \
    "$primary" \
    "$secondary" || true
  ops_transaction_disarm
  return "$OPS_MANUAL_RECOVERY_EXIT"
}

ops_note_transaction_error() {
  OPS_TRANSACTION_ERROR_STATUS="$1"
  return 0
}

ops_handle_transaction_signal() {
  OPS_TRANSACTION_SIGNAL="$1"
  trap - HUP INT TERM
  exit "$2"
}

ops_handle_transaction_exit() {
  local original_status="$1"
  if [[ "$OPS_TRANSACTION_HANDLER_ACTIVE" == "yes" ]]; then
    return
  fi
  OPS_TRANSACTION_HANDLER_ACTIVE="yes"
  trap - EXIT ERR HUP INT TERM
  set +e
  local final_status="$original_status"
  local exit_action="${OPS_TRANSACTION_ACTION:-transaction}"
  local exit_run_id="${OPS_TRANSACTION_RUN_ID:-}"
  if [[ "$OPS_TRANSACTION_ACTIVE" == "yes" ]]; then
    if ! ops_transaction_compensate; then
      ops_record_manual_recovery \
        "$exit_run_id" "$exit_action" \
        "INTERRUPTED_TRANSACTION" "COMPENSATION_FAILED" || true
      final_status="$OPS_MANUAL_RECOVERY_EXIT"
    elif [[ -n "$OPS_TRANSACTION_SIGNAL" ]]; then
      ops_emit_failure "TRANSACTION_INTERRUPTED" "compensation" || true
    fi
    ops_transaction_disarm
  fi
  if ! ops_cleanup_registered_bootstrap_stage; then
    final_status="$OPS_MANUAL_RECOVERY_EXIT"
  fi
  if ! ops_cleanup_registered_temporaries; then
    if ops_is_run_id "$exit_run_id"; then
      ops_record_manual_recovery \
        "$exit_run_id" \
        "$exit_action" \
        "TEMPORARY_CLEANUP_FAILED" "IDENTITY_DRIFT" || true
    fi
    final_status="$OPS_MANUAL_RECOVERY_EXIT"
  fi
  ops_release_lock || final_status="$OPS_MANUAL_RECOVERY_EXIT"
  exit "$final_status"
}

ops_install_transaction_traps() {
  trap 'ops_note_transaction_error "$?"' ERR
  trap 'ops_handle_transaction_signal HUP 129' HUP
  trap 'ops_handle_transaction_signal INT 130' INT
  trap 'ops_handle_transaction_signal TERM 143' TERM
  trap 'ops_handle_transaction_exit "$?"' EXIT
}

ops_acquire_lock() {
  local action="$1"
  if [[ ! "$action" =~ ^[a-z][a-z0-9-]{0,31}$ ]]; then
    ops_fail "LOCK_ACTION_INVALID" "lock"
    return
  fi
  if [[ -n "${OPS_LOCK_FD:-}" ]]; then
    ops_fail "LOCK_ALREADY_HELD" "lock"
    return
  fi
  local lock_file
  lock_file="$(ops_lock_file)" || return
  ops_require_regular_file "$lock_file" 0 0 600 || return
  local flock
  flock="$(ops_command flock)" || return
  exec {OPS_LOCK_FD}>"$lock_file"
  if ! "$flock" -n "$OPS_LOCK_FD"; then
    ops_emit_failure "LOCK_BUSY" "lock" || true
    return "$OPS_LOCK_BUSY_EXIT"
  fi
}

ops_release_lock() {
  if [[ -n "${OPS_LOCK_FD:-}" ]]; then
    local flock
    flock="$(ops_command flock)" || return
    "$flock" -u "$OPS_LOCK_FD" || true
    exec {OPS_LOCK_FD}>&-
    OPS_LOCK_FD=""
  fi
}

ops_manifest_value() {
  local manifest="$1"
  local expression="$2"
  local jq
  jq="$(ops_command jq)" || return
  "$jq" -er "$expression" "$manifest"
}

ops_validate_release_manifest() {
  local version="$1"
  local expected_digest="$2"
  local manifest_override="${3:-}"
  ops_is_version "$version" || {
    ops_fail "VERSION_INVALID" "manifest"
    return
  }
  ops_is_sha256 "$expected_digest" || {
    ops_fail "MANIFEST_DIGEST_INVALID" "manifest"
    return
  }
  local release_root="${OPS_ROOT}/releases/${version}"
  local manifest="${manifest_override:-${release_root}/release-manifest.json}"
  if [[ ! -f "$manifest" || -L "$manifest" ||
        "$(ops_sha256_file "$manifest")" != "$expected_digest" ]]; then
    ops_fail "MANIFEST_DIGEST_MISMATCH" "manifest"
    return
  fi
  local jq
  jq="$(ops_command jq)" || return
  local controller_revision
  controller_revision="$(ops_manifest_value \
    "${OPS_ROOT}/controller-manifest.json" '.controllerRevision')" || return
  if ! "$jq" -e \
    --arg controllerRevision "$controller_revision" \
    --arg version "$version" '
    type == "object" and
    (keys == [
      "acceptedDevelopment",
      "assets",
      "compatibility",
      "images",
      "publicationState",
      "release",
      "schemaVersion",
      "source",
      "target"
    ]) and
    .schemaVersion == "operations-release-manifest-v1" and
    .publicationState == "published" and
    (.acceptedDevelopment | keys == ["frozenProduct","receiptDigest"]) and
    (.acceptedDevelopment.receiptDigest | test("^sha256:[0-9a-f]{64}$")) and
    .acceptedDevelopment.receiptDigest ==
      "sha256:17145d4869050dc2ff347e4dbfb60a5a6369d32890f0abc3e8f766b8ea28a80a" and
    (.acceptedDevelopment.frozenProduct | keys == ["revision","tree"]) and
    (.acceptedDevelopment.frozenProduct.revision | test("^[0-9a-f]{40}$")) and
    (.acceptedDevelopment.frozenProduct.tree | test("^[0-9a-f]{40}$")) and
    .acceptedDevelopment.frozenProduct.revision ==
      "3f585cfe0a0dd61fe783a839528fef25470a58db" and
    .acceptedDevelopment.frozenProduct.tree ==
      "93e29a0c51c0305db8a43e7d029b8eaa3014a1b8" and
    .release.version == $version and
    .release.tag == $version and
    (.release | keys == ["tag","version"]) and
    .target.os == "linux" and
    .target.architecture == "amd64" and
    (.target | keys == ["architecture","os"]) and
    (.source | keys == ["operationsController","release"]) and
    (.source.operationsController | keys == ["revision","tree"]) and
    (.source.operationsController.revision | test("^[0-9a-f]{40}$")) and
    (.source.operationsController.tree | test("^[0-9a-f]{40}$")) and
    (.source.release | keys == ["revision","tree"]) and
    (.source.release.revision | test("^[0-9a-f]{40}$")) and
    (.source.release.tree | test("^[0-9a-f]{40}$")) and
    .source.operationsController == .source.release and
    .source.operationsController.revision == $controllerRevision and
    (.compatibility | keys == ["archive","openapiDigest"]) and
    (.compatibility.archive | keys == [
      "castRulesVersion",
      "commonCommit",
      "compatibilityMatrixDigest",
      "domainRulesVersion",
      "manifestSchemaDigest",
      "schemaSqlDigest"
    ]) and
    .compatibility.archive.castRulesVersion == "cast-exact-v1" and
    (.compatibility.archive.commonCommit | test("^[0-9a-f]{40}$")) and
    .compatibility.archive.commonCommit ==
      "6a8442c17143a870357a5ff812362e8b5cfe9f9d" and
    .compatibility.archive.compatibilityMatrixDigest ==
      "sha256:659121caac966df42a6201dcfb539ac1cd0f7f6a4e452495707833f7c8b889ac" and
    .compatibility.archive.domainRulesVersion == "domain-raw-v1" and
    .compatibility.archive.manifestSchemaDigest ==
      "sha256:5a2b0cd7294312e9dcbdd413a1b01c4218652c4c39fd7472b74e40622e7a3e73" and
    .compatibility.archive.schemaSqlDigest ==
      "sha256:3cce7ce75fb4a7d2943ee8b9fb7c5df2639fae8fa0a2e07bddb3e1519ffdc8e0" and
    .compatibility.openapiDigest ==
      "sha256:e7aba7c34b0d6f74e533e8e9fd31c8f0aa40ed15c440669ec87a7204c963cf11" and
    (.images | keys == ["api","prometheus","updater"]) and
    all([.images.api,.images.updater][];
      (keys == ["config","immutableReference","layers","manifest"]) and
      (.immutableReference | test("^ghcr\\.io/aculy/bangumi-staff-stats-(api|updater)@sha256:[0-9a-f]{64}$")) and
      (.manifest | keys == ["digest","mediaType","size"]) and
      (.manifest.digest | test("^sha256:[0-9a-f]{64}$")) and
      (.manifest.mediaType | type == "string" and length > 0) and
      (.manifest.size | type == "number" and . >= 0) and
      (.config | keys == ["digest","mediaType","size"]) and
      (.config.digest | test("^sha256:[0-9a-f]{64}$")) and
      (.config.mediaType | type == "string" and length > 0) and
      (.config.size | type == "number" and . >= 0) and
      (.layers | type == "array" and length > 0) and
      all(.layers[];
        (keys == ["digest","mediaType","size"]) and
        (.digest | test("^sha256:[0-9a-f]{64}$")) and
        (.mediaType | type == "string" and length > 0) and
        (.size | type == "number" and . >= 0)
      )
    ) and
    (.images.api.immutableReference |
      test("^ghcr\\.io/aculy/bangumi-staff-stats-api@sha256:[0-9a-f]{64}$")) and
    .images.api.immutableReference ==
      ("ghcr.io/aculy/bangumi-staff-stats-api@" + .images.api.manifest.digest) and
    (.images.updater.immutableReference |
      test("^ghcr\\.io/aculy/bangumi-staff-stats-updater@sha256:[0-9a-f]{64}$")) and
    .images.updater.immutableReference ==
      ("ghcr.io/aculy/bangumi-staff-stats-updater@" + .images.updater.manifest.digest) and
    (.images.prometheus | keys == [
      "amd64ManifestDigest",
      "amd64ManifestSize",
      "indexDigest",
      "reference",
      "runtimeGid",
      "runtimeUid"
    ]) and
    .images.prometheus.reference ==
      "prom/prometheus:v3.13.1-distroless@sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80" and
    .images.prometheus.indexDigest ==
      "sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80" and
    .images.prometheus.amd64ManifestDigest ==
      "sha256:335b5796a6e4355530475575253f84de20b8ad07bf899f65ed218451ce4c60b4" and
    .images.prometheus.amd64ManifestSize == 4067 and
    .images.prometheus.runtimeUid == 65532 and
    .images.prometheus.runtimeGid == 65532 and
    (.assets | keys == [
      "archiveSmoke",
      "compatibilityManifest",
      "frontend",
      "payloadChecksums",
      "provenance"
    ]) and
    all([
      .assets.archiveSmoke,
      .assets.compatibilityManifest,
      .assets.frontend,
      .assets.payloadChecksums
    ][];
      (keys == ["mode","path","sha256","size"]) and
      (.sha256 | test("^sha256:[0-9a-f]{64}$")) and
      (.size | type == "number" and . >= 0)
    ) and
    .assets.archiveSmoke.path == "archive-smoke" and
    .assets.archiveSmoke.mode == "0555" and
    (.assets.archiveSmoke.sha256 | test("^sha256:[0-9a-f]{64}$")) and
    .assets.frontend.path == "frontend-static-linux-amd64.tar" and
    .assets.frontend.mode == "0444" and
    .assets.compatibilityManifest.path == "compatibility-manifest.json" and
    .assets.compatibilityManifest.mode == "0444" and
    .assets.payloadChecksums.path == "payload-checksums.sha256" and
    .assets.payloadChecksums.mode == "0444" and
    (.assets.provenance | length == 6) and
    ([.assets.provenance[].path] == [
      "backend-component-statement.json",
      "backend.spdx.json",
      "frontend-component-statement.json",
      "frontend.spdx.json",
      "updater-component-statement.json",
      "updater.spdx.json"
    ]) and
    all(.assets.provenance[];
      (keys == ["mode","path","sha256","size"]) and
      .mode == "0444" and
      (.sha256 | test("^sha256:[0-9a-f]{64}$")) and
      (.size | type == "number" and . >= 0)
    )
  ' "$manifest" >/dev/null; then
    ops_fail "MANIFEST_CONTRACT_INVALID" "manifest"
    return
  fi

  OPS_MANIFEST=(
    [apiImage]="$(ops_manifest_value "$manifest" '.images.api.immutableReference')"
    [appRevision]="$(ops_manifest_value "$manifest" '.source.release.revision')"
    [appVersion]="$version"
    [archiveSmokeDigest]="$(ops_manifest_value "$manifest" '.assets.archiveSmoke.sha256')"
    [commonCommit]="$(ops_manifest_value "$manifest" '.compatibility.archive.commonCommit')"
    [manifestDigest]="$expected_digest"
    [releaseRoot]="$release_root"
    [updaterImage]="$(ops_manifest_value "$manifest" '.images.updater.immutableReference')"
  )
  ops_is_digest_image "${OPS_MANIFEST[apiImage]}" || {
    ops_fail "API_IMAGE_INVALID" "manifest"
    return
  }
  ops_is_digest_image "${OPS_MANIFEST[updaterImage]}" || {
    ops_fail "UPDATER_IMAGE_INVALID" "manifest"
    return
  }
}

readonly OPS_RELEASE_ASSETS=(
  "archive-smoke"
  "backend-component-statement.json"
  "backend.spdx.json"
  "compatibility-manifest.json"
  "frontend-component-statement.json"
  "frontend-static-linux-amd64.tar"
  "frontend.spdx.json"
  "updater-component-statement.json"
  "updater.spdx.json"
)

ops_verify_payload_checksums() {
  local payload_root="$1"
  local inventory="$2"
  if [[ ! -f "$inventory" || -L "$inventory" ]]; then
    ops_fail "CHECKSUMS_REQUIRED" "checksums"
    return
  fi
  local line digest relative count=0 previous=""
  declare -A observed=()
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ ! "$line" =~ ^([0-9a-f]{64})\ [\ \*]([A-Za-z0-9][A-Za-z0-9._-]{0,254})$ ]]; then
      ops_fail "CHECKSUM_LINE_INVALID" "checksums"
      return
    fi
    digest="${BASH_REMATCH[1]}"
    relative="${BASH_REMATCH[2]}"
    if [[ -v "observed[$relative]" || ( -n "$previous" && "$relative" < "$previous" ) ]]; then
      ops_fail "CHECKSUM_PATH_INVALID" "checksums"
      return
    fi
    if [[ "$relative" != "${OPS_RELEASE_ASSETS[$count]:-}" ]]; then
      ops_fail "CHECKSUM_INVENTORY_NOT_CLOSED" "checksums"
      return
    fi
    if [[ ! -f "${payload_root}/${relative}" ||
          -L "${payload_root}/${relative}" ||
          "$(ops_sha256_file "${payload_root}/${relative}")" != "sha256:${digest}" ]]; then
      ops_fail "CHECKSUM_MISMATCH" "checksums"
      return
    fi
    observed["$relative"]=1
    previous="$relative"
    count=$((count + 1))
  done < "$inventory"
  if [[ "$count" -ne "${#OPS_RELEASE_ASSETS[@]}" ]]; then
    ops_fail "CHECKSUM_INVENTORY_INCOMPLETE" "checksums"
    return
  fi
  local candidate name
  shopt -s nullglob dotglob
  for candidate in "$payload_root"/*; do
    name="${candidate##*/}"
    if [[ ! -f "$candidate" || -L "$candidate" ]]; then
      ops_fail "PAYLOAD_ENTRY_INVALID" "checksums"
      return
    fi
    case "$name" in
      managed-release.json|payload-checksums.sha256|release-manifest.json|runtime-inventory.sha256) ;;
      *)
        if [[ ! -v "observed[$name]" ]]; then
          ops_fail "UNLISTED_PAYLOAD_FILE" "checksums"
          return
        fi
        ;;
    esac
  done
  shopt -u nullglob dotglob
}

ops_verify_release_tree() {
  local release_root="${OPS_MANIFEST[releaseRoot]}"
  if [[ ! -d "$release_root" || -L "$release_root" ||
        "$(ops_stat_value '%u' "$release_root")" != "0" ]]; then
    ops_fail "RELEASE_ROOT_INVALID" "release"
    return
  fi
  local find grep
  find="$(ops_command find)" || return
  grep="$(ops_command grep)" || return
  if "$find" "$release_root" -xdev \( -type l -o ! -type d ! -type f \) -print -quit |
    "$grep" -q .; then
    ops_fail "RELEASE_SPECIAL_ENTRY" "release"
    return
  fi
  if "$find" "$release_root" -xdev -type f -links +1 -print -quit |
    "$grep" -q .; then
    ops_fail "RELEASE_HARDLINK_INVALID" "release"
    return
  fi
  local candidate mode
  while IFS= read -r -d '' candidate; do
    if [[ "$(ops_stat_value '%u' "$candidate")" != "0" ]]; then
      ops_fail "RELEASE_OWNER_INVALID" "release"
      return
    fi
    mode="$(ops_stat_value '%a' "$candidate")"
    if (( (8#$mode & 0022) != 0 )); then
      ops_fail "RELEASE_WRITABLE" "release"
      return
    fi
  done < <("$find" "$release_root" -xdev -print0)
  local smoke="${release_root}/bin/archive-smoke"
  if [[ ! -f "$smoke" || -L "$smoke" || ! -x "$smoke" ||
        "$(ops_sha256_file "$smoke")" != "${OPS_MANIFEST[archiveSmokeDigest]}" ||
        ! -f "${release_root}/frontend/index.html" ]]; then
    ops_fail "RELEASE_RUNTIME_ASSET_INVALID" "release"
    return
  fi
  ops_verify_managed_release "${OPS_MANIFEST[appVersion]}"
}

ops_verify_runtime_inventory() {
  local release_root="$1"
  local inventory="$2"
  if [[ ! -f "$inventory" || -L "$inventory" ]]; then
    ops_fail "RUNTIME_INVENTORY_REQUIRED" "release"
    return
  fi
  local line digest relative previous="" count=0
  declare -A listed=()
  declare -A listed_directories=(
    [bin]=1
    [frontend]=1
  )
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ ! "$line" =~ ^([0-9a-f]{64})\ \ ([A-Za-z0-9][A-Za-z0-9._/-]{0,4095})$ ]]; then
      ops_fail "RUNTIME_INVENTORY_SYNTAX" "release"
      return
    fi
    digest="${BASH_REMATCH[1]}"
    relative="${BASH_REMATCH[2]}"
    if [[ "$relative" == /* || "$relative" =~ (^|/)\.\.?(/|$) ||
          -v "listed[$relative]" ||
          ( -n "$previous" && "$relative" < "$previous" ) ]]; then
      ops_fail "RUNTIME_INVENTORY_PATH" "release"
      return
    fi
    case "$relative" in
      bin/archive-smoke|checksums.txt|release-manifest.json|frontend/*) ;;
      *)
        ops_fail "RUNTIME_INVENTORY_PATH" "release"
        return
        ;;
    esac
    if [[ ! -f "${release_root}/${relative}" ||
          -L "${release_root}/${relative}" ||
          "$(ops_sha256_file "${release_root}/${relative}")" != "sha256:${digest}" ]]; then
      ops_fail "RUNTIME_INVENTORY_MISMATCH" "release"
      return
    fi
    listed["$relative"]=1
    previous="$relative"
    local parent="${relative%/*}"
    while [[ "$parent" != "$relative" && "$parent" != "." ]]; do
      listed_directories["$parent"]=1
      [[ "$parent" == "${parent%/*}" ]] && break
      parent="${parent%/*}"
    done
    count=$((count + 1))
  done < "$inventory"
  if [[ "$count" -lt 4 ||
        ! -v "listed[bin/archive-smoke]" ||
        ! -v "listed[checksums.txt]" ||
        ! -v "listed[frontend/index.html]" ||
        ! -v "listed[release-manifest.json]" ]]; then
    ops_fail "RUNTIME_INVENTORY_INCOMPLETE" "release"
    return
  fi
  local find candidate relative_path actual_count=0
  find="$(ops_command find)" || return
  while IFS= read -r -d '' candidate; do
    relative_path="${candidate#${release_root}/}"
    if [[ ! -v "listed[$relative_path]" ]]; then
      ops_fail "UNLISTED_RUNTIME_FILE" "release"
      return
    fi
    actual_count=$((actual_count + 1))
  done < <("$find" "$release_root" -xdev -type f -print0)
  if [[ "$actual_count" -ne "$count" ]]; then
    ops_fail "RUNTIME_INVENTORY_COUNT" "release"
    return
  fi
  while IFS= read -r -d '' candidate; do
    [[ "$candidate" == "$release_root" ]] && continue
    relative_path="${candidate#${release_root}/}"
    if [[ ! -v "listed_directories[$relative_path]" ]]; then
      ops_fail "UNLISTED_RUNTIME_DIRECTORY" "release"
      return
    fi
  done < <("$find" "$release_root" -xdev -type d -print0)
}

ops_verify_managed_release() {
  local version="$1"
  ops_verify_managed_release_at \
    "$version" \
    "${OPS_ROOT}/releases/${version}" \
    "${OPS_ROOT}/recovery/releases/${version}"
}

ops_verify_managed_release_at() {
  local version="$1"
  local release_root="$2"
  local payload_root="$3"
  if ! ops_is_version "$version"; then
    ops_fail "MANAGED_RELEASE_VERSION_INVALID" "release"
    return
  fi
  local marker="${payload_root}/managed-release.json"
  local inventory="${payload_root}/runtime-inventory.sha256"
  if [[ ! -d "$release_root" || -L "$release_root" ||
        ! -d "$payload_root" || -L "$payload_root" ||
        "$(ops_stat_value '%u:%g:%a' "$release_root")" != "0:0:555" ||
        "$(ops_stat_value '%u:%g:%a' "$payload_root")" != "0:0:700" ]]; then
    ops_fail "MANAGED_RELEASE_ROOT_INVALID" "release"
    return
  fi
  local jq
  jq="$(ops_command jq)" || return
  if [[ ! -f "$marker" || -L "$marker" ||
        "$(ops_stat_value '%u:%g:%h:%a' "$marker")" != "0:0:1:400" ]] ||
    ! "$jq" -e --arg version "$version" '
      type == "object" and
      (keys == [
        "controllerRevision",
        "manifestDigest",
        "payloadChecksumsDigest",
        "payloadRootDevice",
        "payloadRootInode",
        "releaseRootDevice",
        "releaseRootInode",
        "runtimeInventoryDigest",
        "schemaVersion",
        "version"
      ]) and
      .schemaVersion == "managed-release-v1" and
      .version == $version and
      (.controllerRevision | test("^[0-9a-f]{40}$")) and
      (.manifestDigest | test("^sha256:[0-9a-f]{64}$")) and
      (.payloadChecksumsDigest | test("^sha256:[0-9a-f]{64}$")) and
      (.runtimeInventoryDigest | test("^sha256:[0-9a-f]{64}$")) and
      (.payloadRootDevice | test("^[0-9]+$")) and
      (.payloadRootInode | test("^[0-9]+$")) and
      (.releaseRootDevice | test("^[0-9]+$")) and
      (.releaseRootInode | test("^[0-9]+$"))
    ' "$marker" >/dev/null; then
    ops_fail "MANAGED_RELEASE_MARKER_INVALID" "release"
    return
  fi
  local manifest_digest
  manifest_digest="$(ops_manifest_value "$marker" '.manifestDigest')" || return
  local controller_revision
  controller_revision="$(ops_manifest_value \
    "${OPS_ROOT}/controller-manifest.json" '.controllerRevision')" || return
  if [[ "$(ops_stat_value '%d' "$payload_root")" != \
          "$(ops_manifest_value "$marker" '.payloadRootDevice')" ||
        "$(ops_stat_value '%i' "$payload_root")" != \
          "$(ops_manifest_value "$marker" '.payloadRootInode')" ||
        "$(ops_stat_value '%d' "$release_root")" != \
          "$(ops_manifest_value "$marker" '.releaseRootDevice')" ||
        "$(ops_stat_value '%i' "$release_root")" != \
          "$(ops_manifest_value "$marker" '.releaseRootInode')" ||
        "$(ops_sha256_file "${release_root}/release-manifest.json")" != \
          "$(ops_manifest_value "$marker" '.manifestDigest')" ||
        "$(ops_sha256_file "${payload_root}/release-manifest.json")" != \
          "$(ops_manifest_value "$marker" '.manifestDigest')" ||
        "$(ops_sha256_file "${payload_root}/payload-checksums.sha256")" != \
          "$(ops_manifest_value "$marker" '.payloadChecksumsDigest')" ||
        "$(ops_sha256_file "${release_root}/checksums.txt")" != \
          "$(ops_manifest_value "$marker" '.payloadChecksumsDigest')" ||
        "$(ops_sha256_file "$inventory")" != \
          "$(ops_manifest_value "$marker" '.runtimeInventoryDigest')" ||
        "$(ops_manifest_value "$marker" '.controllerRevision')" != \
          "$controller_revision" ]]; then
    ops_fail "MANAGED_RELEASE_IDENTITY_CHANGED" "release"
    return
  fi
  local find grep candidate mode
  find="$(ops_command find)" || return
  grep="$(ops_command grep)" || return
  if "$find" "$release_root" "$payload_root" -xdev \
      \( -type l -o ! -type d ! -type f \) -print -quit |
      "$grep" -q . ||
    "$find" "$release_root" "$payload_root" -xdev -type f -links +1 \
      -print -quit | "$grep" -q .; then
    ops_fail "MANAGED_RELEASE_SPECIAL_ENTRY" "release"
    return
  fi
  while IFS= read -r -d '' candidate; do
    if [[ "$(ops_stat_value '%u:%g' "$candidate")" != "0:0" ]]; then
      ops_fail "MANAGED_RELEASE_OWNER_INVALID" "release"
      return
    fi
    mode="$(ops_stat_value '%a' "$candidate")"
    if [[ -d "$candidate" ]]; then
      if [[ "$candidate" == "$payload_root" ]]; then
        [[ "$mode" == "700" ]] || {
          ops_fail "MANAGED_RELEASE_MODE_INVALID" "release"
          return
        }
      elif [[ "$candidate" == "$release_root" ||
              "$candidate" == "$release_root/"* ]]; then
        [[ "$mode" == "555" ]] || {
          ops_fail "MANAGED_RELEASE_MODE_INVALID" "release"
          return
        }
      else
        ops_fail "MANAGED_RELEASE_DIRECTORY_INVALID" "release"
        return
      fi
    elif [[ "$candidate" == "${release_root}/bin/archive-smoke" ]]; then
      [[ "$mode" == "555" ]] || {
        ops_fail "MANAGED_RELEASE_MODE_INVALID" "release"
        return
      }
    elif [[ "$candidate" == "$release_root/"* ]]; then
      [[ "$mode" == "444" ]] || {
        ops_fail "MANAGED_RELEASE_MODE_INVALID" "release"
        return
      }
    elif [[ "${candidate##*/}" == "archive-smoke" ]]; then
      [[ "$mode" == "500" ]] || {
        ops_fail "MANAGED_RELEASE_MODE_INVALID" "release"
        return
      }
    else
      [[ "$mode" == "400" ]] || {
        ops_fail "MANAGED_RELEASE_MODE_INVALID" "release"
        return
      }
    fi
  done < <("$find" "$release_root" "$payload_root" -xdev -print0)
  ops_validate_release_manifest \
    "$version" "$manifest_digest" "${release_root}/release-manifest.json" ||
    return
  ops_verify_payload_checksums \
    "$payload_root" \
    "${payload_root}/payload-checksums.sha256" || return
  ops_verify_runtime_inventory "$release_root" "$inventory"
}

ops_build_release_env() {
  local destination="$1"
  if [[ "$destination" != "${OPS_ROOT}/compose/"* ]]; then
    ops_fail "RELEASE_ENV_DESTINATION" "release-env"
    return
  fi
  local api_image="${OPS_MANIFEST[apiImage]}"
  local updater_image="${OPS_MANIFEST[updaterImage]}"
  if [[ "$OPS_PROFILE" == "validation" ]]; then
    api_image="localhost/bgmss-ops-validation-api:${OPS_MANIFEST[appRevision]}-amd64"
    updater_image="localhost/bgmss-ops-validation-updater:${OPS_MANIFEST[appRevision]}-amd64"
  fi
  if ! {
    printf 'BGMSS_API_IMAGE=%s\n' "$api_image"
    printf 'BGMSS_APP_REVISION=%s\n' "${OPS_MANIFEST[appRevision]}"
    printf 'BGMSS_APP_VERSION=%s\n' "${OPS_MANIFEST[appVersion]}"
    printf 'BGMSS_COMMON_COMMIT=%s\n' "${OPS_MANIFEST[commonCommit]}"
    printf 'BGMSS_RELEASE_MANIFEST_DIGEST=%s\n' "${OPS_MANIFEST[manifestDigest]}"
    printf 'BGMSS_RELEASE_ROOT=%s\n' "${OPS_MANIFEST[releaseRoot]}"
    printf 'BGMSS_UPDATER_IMAGE=%s\n' "$updater_image"
  } > "$destination"; then
    ops_dispose_temporary_paths "$destination"
    ops_fail "RELEASE_ENV_BUILD_FAILED" "release-env"
    return
  fi
  chmod 600 "$destination" || return
  chown 0:0 "$destination" || return
  ops_fsync_path "$destination" || return
  ops_load_release_env "$destination"
}

ops_verify_archive_version() {
  local data_version="$1"
  ops_is_data_version "$data_version" || {
    ops_fail "DATA_VERSION_INVALID" "archive-smoke"
    return
  }
  local smoke="${OPS_MANIFEST[releaseRoot]}/bin/archive-smoke"
  local output
  output="$("$smoke" \
    -archive-root "${OPS_ROOT}/data" \
    -data-version "$data_version")" || {
      ops_fail "ARCHIVE_SMOKE_FAILED" "archive-smoke"
      return
    }
  local jq
  jq="$(ops_command jq)" || return
  if ! "$jq" -e --arg data "$data_version" '
    type == "object" and
    .ok == true and
    .dataVersion == $data and
    (.manifestDigest | test("^sha256:[0-9a-f]{64}$")) and
    (.sqliteDigest | test("^sha256:[0-9a-f]{64}$"))
  ' <<< "$output" >/dev/null; then
    ops_fail "ARCHIVE_SMOKE_OUTPUT_INVALID" "archive-smoke"
    return
  fi
  "$jq" -er '.manifestDigest' <<< "$output"
}

ops_restart_api() {
  ops_compose up -d --no-deps --force-recreate api
}

ops_restart_api_with_env() {
  local environment_file="$1"
  ops_compose_with_env "$environment_file" \
    up -d --no-deps --force-recreate api
}

ops_stop_api_with_env() {
  local environment_file="$1"
  ops_compose_with_env "$environment_file" stop --timeout 30 api
}

ops_download_release_file() {
  local version="$1"
  local asset="$2"
  local destination="$3"
  local maximum_size="$4"
  if ! ops_is_version "$version" ||
    [[ ! "$asset" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$ ||
       "$destination" != "${OPS_ROOT}/recovery/"* ||
       -e "$destination" || -L "$destination" ||
       ! "$maximum_size" =~ ^[1-9][0-9]*$ ||
       "$maximum_size" -gt "$OPS_RELEASE_FILE_MAX_BYTES" ]]; then
    ops_fail "DOWNLOAD_ARGUMENT_INVALID" "acquisition"
    return
  fi
  local curl
  curl="$(ops_command curl)" || return
  ops_create_acquisition_file "$destination" 0600 0 0 || return
  local download_result=0
  "$curl" \
    --proto '=https' \
    --proto-redir '=https' \
    --tlsv1.2 \
    --location \
    --fail \
    --silent \
    --show-error \
    --retry 3 \
    --retry-delay 2 \
    --connect-timeout 15 \
    --max-time 1800 \
    --max-filesize "$maximum_size" \
    --output "$destination" \
    "https://github.com/AcuLY/BangumiStaffStats/releases/download/${version}/${asset}" ||
    download_result=$?
  local index
  index="$(ops_acquisition_index "$destination")" || return "$OPS_MANUAL_RECOVERY_EXIT"
  if [[ "$download_result" -ne 0 ]] ||
    ! ops_acquisition_object_matches "$index" ||
    [[ ! -f "$destination" || -L "$destination" ||
        "$(ops_stat_value '%s' "$destination")" -gt "$maximum_size" ]]; then
    ops_fail "DOWNLOAD_FAILED" "acquisition"
    [[ "$download_result" -ne 0 ]] && return "$download_result"
    return 1
  fi
  chmod 600 "$destination" || return
  chown 0:0 "$destination" || return
  ops_fsync_path "$destination" || return
  ops_close_acquisition_file "$destination"
}

ops_release_asset_size() {
  local manifest="$1"
  local asset="$2"
  local jq
  jq="$(ops_command jq)" || return
  "$jq" -er --arg asset "$asset" '
    [
      .assets.archiveSmoke,
      .assets.compatibilityManifest,
      .assets.frontend,
      .assets.payloadChecksums,
      .assets.provenance[]
    ] |
    map(select(.path == $asset)) |
    if length == 1 and
      (.[0].size | type == "number" and . > 0 and . <= 1073741824)
    then .[0].size
    else error("asset size is not closed")
    end
  ' "$manifest"
}

ops_verify_canonical_manifest() {
  local manifest="$1"
  ops_require_canonical_json "$manifest" "manifest"
}

ops_verify_asset_descriptor() {
  local manifest="$1"
  local selector="$2"
  local expected_name="$3"
  local asset_root="$4"
  local jq
  jq="$(ops_command jq)" || return
  local name digest size
  name="$("$jq" -er "${selector}.path" "$manifest")" || return
  digest="$("$jq" -er "${selector}.sha256" "$manifest")" || return
  size="$("$jq" -er "${selector}.size" "$manifest")" || return
  if [[ "$name" != "$expected_name" ||
        ! "$digest" =~ ^sha256:[0-9a-f]{64}$ ||
        ! "$size" =~ ^[1-9][0-9]*$ ||
        ! -f "${asset_root}/${name}" ||
        -L "${asset_root}/${name}" ||
        "$(ops_stat_value '%s' "${asset_root}/${name}")" != "$size" ||
        "$(ops_sha256_file "${asset_root}/${name}")" != "$digest" ]]; then
    ops_fail "RELEASE_ASSET_MISMATCH" "acquisition"
    return
  fi
}

ops_verify_downloaded_release() {
  local version="$1"
  local manifest_digest="$2"
  local payload_root="$3"
  local manifest="${payload_root}/release-manifest.json"
  ops_verify_canonical_manifest "$manifest" || return
  ops_validate_release_manifest "$version" "$manifest_digest" "$manifest" || return
  ops_verify_asset_descriptor \
    "$manifest" '.assets.archiveSmoke' 'archive-smoke' "$payload_root" || return
  ops_verify_asset_descriptor \
    "$manifest" '.assets.compatibilityManifest' \
    'compatibility-manifest.json' "$payload_root" || return
  ops_verify_asset_descriptor \
    "$manifest" '.assets.frontend' \
    'frontend-static-linux-amd64.tar' "$payload_root" || return
  ops_verify_asset_descriptor \
    "$manifest" '.assets.payloadChecksums' \
    'payload-checksums.sha256' "$payload_root" || return
  local -a provenance_names=(
    "backend-component-statement.json"
    "backend.spdx.json"
    "frontend-component-statement.json"
    "frontend.spdx.json"
    "updater-component-statement.json"
    "updater.spdx.json"
  )
  local index
  for index in "${!provenance_names[@]}"; do
    ops_verify_asset_descriptor \
      "$manifest" ".assets.provenance[${index}]" \
      "${provenance_names[$index]}" "$payload_root" || return
  done
  ops_verify_payload_checksums \
    "$payload_root" \
    "${payload_root}/payload-checksums.sha256"
}

ops_verify_frontend_tar_headers() {
  local archive="$1"
  local archive_size
  archive_size="$(ops_stat_value '%s' "$archive")" || return
  if [[ "$archive_size" -lt 1024 ||
        $((archive_size % 512)) -ne 0 ]]; then
    ops_fail "FRONTEND_TAR_SIZE_INVALID" "acquisition"
    return
  fi
  local dd od tr awk
  dd="$(ops_command dd)" || return
  od="$(ops_command od)" || return
  tr="$(ops_command tr)" || return
  awk="$(ops_command awk)" || return
  local offset=0 count=0 expanded=0 raw_name type_hex size_text size
  while (( offset + 512 <= archive_size )); do
    raw_name="$("$dd" if="$archive" bs=1 skip="$offset" count=100 \
      status=none | "$tr" -d '\000')" || return
    if [[ -z "$raw_name" ]]; then
      break
    fi
    type_hex="$("$od" -An -tx1 -j "$((offset + 156))" -N 1 "$archive" |
      "$tr" -d ' \n')" || return
    case "$type_hex" in
      00|30|35) ;;
      *)
        ops_fail "FRONTEND_TAR_HEADER_TYPE" "acquisition"
        return
        ;;
    esac
    size_text="$("$dd" if="$archive" bs=1 skip="$((offset + 124))" \
      count=12 status=none | "$tr" -d '\000 ')" || return
    if [[ ! "$size_text" =~ ^[0-7]{1,11}$ ]]; then
      ops_fail "FRONTEND_TAR_SIZE_ENCODING" "acquisition"
      return
    fi
    size=$((8#$size_text))
    if [[ "$type_hex" == "35" && "$size" -ne 0 ]] ||
      [[ "$type_hex" != "35" &&
         "$size" -gt "$OPS_FRONTEND_MEMBER_MAX_BYTES" ]]; then
      ops_fail "FRONTEND_TAR_MEMBER_SIZE" "acquisition"
      return
    fi
    count=$((count + 1))
    expanded=$((expanded + size))
    if [[ "$count" -gt "$OPS_FRONTEND_MEMBER_MAX_COUNT" ||
          "$expanded" -gt "$OPS_FRONTEND_EXPANDED_MAX_BYTES" ]]; then
      ops_fail "FRONTEND_TAR_EXPANSION_LIMIT" "acquisition"
      return
    fi
    offset=$((offset + 512 + ((size + 511) / 512) * 512))
  done
  if [[ "$count" -lt 2 || $((archive_size - offset)) -lt 1024 ]] ||
    ! "$od" -An -v -tu1 -j "$offset" "$archive" |
      "$awk" '{ for (i = 1; i <= NF; i += 1) if ($i != 0) exit 1 }'; then
    ops_fail "FRONTEND_TAR_TRAILER_INVALID" "acquisition"
    return
  fi
}

ops_verify_frontend_tar() {
  local archive="$1"
  local listing="$2"
  local verbose="$3"
  local tar
  tar="$(ops_command tar)" || return
  ops_verify_frontend_tar_headers "$archive" || return
  "$tar" -tf "$archive" > "$listing" || {
    ops_fail "FRONTEND_TAR_INVALID" "acquisition"
    return
  }
  "$tar" -tvf "$archive" > "$verbose" || {
    ops_fail "FRONTEND_TAR_INVALID" "acquisition"
    return
  }
  local line normalized
  declare -A observed=()
  local count=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    normalized="${line%/}"
    if [[ "$normalized" != "frontend" &&
          ! "$normalized" =~ ^frontend(/[A-Za-z0-9][A-Za-z0-9._-]{0,254})+$ ]] ||
      [[ "$normalized" =~ (^|/)\.\.?(/|$) ||
         -v "observed[$normalized]" ]]; then
      ops_fail "FRONTEND_TAR_PATH_INVALID" "acquisition"
      return
    fi
    observed["$normalized"]=1
    count=$((count + 1))
  done < "$listing"
  if [[ "$count" -lt 2 || ! -v "observed[frontend/index.html]" ]]; then
    ops_fail "FRONTEND_TAR_INCOMPLETE" "acquisition"
    return
  fi
  local awk
  awk="$(ops_command awk)" || return
  if ! "$awk" \
    -v max_count="$OPS_FRONTEND_MEMBER_MAX_COUNT" \
    -v max_member="$OPS_FRONTEND_MEMBER_MAX_BYTES" \
    -v max_total="$OPS_FRONTEND_EXPANDED_MAX_BYTES" '
      $1 !~ /^[d-]/ { exit 1 }
      $1 ~ /^d/ && $3 != 0 { exit 1 }
      $1 ~ /^-/ && ($3 !~ /^[0-9]+$/ || $3 > max_member) { exit 1 }
      {
        count += 1
        total += $3
        if (count > max_count || total > max_total) exit 1
      }
    ' "$verbose"; then
    ops_fail "FRONTEND_TAR_SPECIAL_ENTRY" "acquisition"
    return
  fi
}

ops_ensure_acquisition_directory() {
  local candidate="$1"
  local mode="$2"
  local uid="$3"
  local gid="$4"
  local index=""
  if index="$(ops_acquisition_index "$candidate")"; then
    if [[ "${OPS_TRANSACTION_ACQUISITION_TYPES[$index]}" != "directory" ]] ||
      ! ops_acquisition_object_matches "$index"; then
      ops_fail "ACQUISITION_DIRECTORY_COLLISION" "acquisition"
      return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    return 0
  fi
  local dirname parent
  dirname="$(ops_command dirname)" || return
  parent="$("$dirname" -- "$candidate")" || return
  if [[ "$parent" != "$OPS_TRANSACTION_ACQUISITION_ROOT" ]]; then
    ops_ensure_acquisition_directory "$parent" "$mode" "$uid" "$gid" || return
  fi
  ops_create_acquisition_directory "$candidate" "$mode" "$uid" "$gid"
}

ops_extract_frontend_tree() {
  local archive="$1"
  local listing="$2"
  local extract_root="$3"
  local tar dirname
  tar="$(ops_command tar)" || return
  dirname="$(ops_command dirname)" || return
  local line normalized destination parent index
  local count=0 bytes=0 size=0 result=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    normalized="${line%/}"
    destination="${extract_root}/${normalized}"
    parent="$("$dirname" -- "$destination")" || return
    ops_ensure_acquisition_directory "$parent" 0700 0 0 || return
    if [[ "$line" == */ ]]; then
      ops_ensure_acquisition_directory "$destination" 0700 0 0 || return
    else
      ops_create_acquisition_file "$destination" 0600 0 0 || return
      ops_creation_guard_begin || return
      "$tar" \
        --extract \
        --to-stdout \
        --file "$archive" \
        -- "$normalized" > "$destination" || result=$?
      if [[ "$result" -eq 0 ]]; then
        index="$(ops_acquisition_index "$destination")" ||
          result="$OPS_MANUAL_RECOVERY_EXIT"
      fi
      if [[ "$result" -eq 0 ]] &&
        ! ops_acquisition_object_matches "$index"; then
        result="$OPS_MANUAL_RECOVERY_EXIT"
      fi
      if [[ "$result" -eq 0 ]]; then
        size="$(ops_stat_value '%s' "$destination")" || result=$?
      fi
      if [[ "$result" -eq 0 &&
            "$size" -gt "$OPS_FRONTEND_MEMBER_MAX_BYTES" ]]; then
        result="$OPS_MANUAL_RECOVERY_EXIT"
      fi
      if [[ "$result" -eq 0 ]]; then
        ops_fsync_path "$destination" || result=$?
      fi
      if [[ "$result" -eq 0 ]]; then
        ops_close_acquisition_file "$destination" || result=$?
      fi
      ops_creation_guard_end
      if [[ "$result" -ne 0 ]]; then
        ops_fail "FRONTEND_EXTRACTION_FAILED" "publication"
        return "$result"
      fi
      bytes=$((bytes + size))
    fi
    count=$((count + 1))
    if [[ "$count" -gt "$OPS_FRONTEND_MEMBER_MAX_COUNT" ||
          "$bytes" -gt "$OPS_FRONTEND_EXPANDED_MAX_BYTES" ]]; then
      ops_fail "FRONTEND_EXTRACTED_LIMIT" "publication"
      return
    fi
  done < "$listing"
}

ops_install_frontend_tree() {
  local source_root="$1"
  local destination_root="$2"
  local index candidate relative destination
  local source_seen=0
  for index in "${!OPS_TRANSACTION_ACQUISITION_PATHS[@]}"; do
    candidate="${OPS_TRANSACTION_ACQUISITION_PATHS[$index]}"
    case "$candidate" in
      "$source_root")
        source_seen=1
        ops_acquisition_object_matches "$index" ||
          return "$OPS_MANUAL_RECOVERY_EXIT"
        ;;
      "$source_root"/*)
        ops_acquisition_object_matches "$index" ||
          return "$OPS_MANUAL_RECOVERY_EXIT"
        relative="${candidate#${source_root}/}"
        destination="${destination_root}/${relative}"
        case "${OPS_TRANSACTION_ACQUISITION_TYPES[$index]}" in
          directory)
            ops_create_acquisition_directory \
              "$destination" 0755 0 0 || return
            ;;
          file)
            [[ "${OPS_TRANSACTION_ACQUISITION_STATES[$index]}" == "closed" ]] ||
              return "$OPS_MANUAL_RECOVERY_EXIT"
            ops_copy_acquisition_file \
              "$candidate" "$destination" 0444 0 0 || return
            ;;
          *)
            ops_fail "FRONTEND_LEDGER_TYPE_INVALID" "publication"
            return "$OPS_MANUAL_RECOVERY_EXIT"
            ;;
        esac
        ;;
    esac
  done
  [[ "$source_seen" -eq 1 ]] || {
    ops_fail "FRONTEND_LEDGER_ROOT_MISSING" "publication"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  }
  for index in "${!OPS_TRANSACTION_ACQUISITION_PATHS[@]}"; do
    candidate="${OPS_TRANSACTION_ACQUISITION_PATHS[$index]}"
    if [[ "${OPS_TRANSACTION_ACQUISITION_TYPES[$index]}" == "directory" ]] &&
      { [[ "$candidate" == "$destination_root" ]] ||
        [[ "$candidate" == "$destination_root/"* ]]; }; then
      ops_update_acquisition_directory "$candidate" 0555 0 0 || return
    fi
  done
}

ops_generate_runtime_inventory() {
  local release_root="$1"
  local destination="$2"
  local sort
  sort="$(ops_command sort)" || return
  ops_create_acquisition_file "$destination" 0600 0 0 || return
  local index candidate relative digest result=0
  local -a inventory_lines=()
  for index in "${!OPS_TRANSACTION_ACQUISITION_PATHS[@]}"; do
    candidate="${OPS_TRANSACTION_ACQUISITION_PATHS[$index]}"
    if [[ "${OPS_TRANSACTION_ACQUISITION_TYPES[$index]}" == "file" &&
          "$candidate" == "$release_root/"* ]]; then
      [[ "${OPS_TRANSACTION_ACQUISITION_STATES[$index]}" == "closed" ]] ||
        return "$OPS_MANUAL_RECOVERY_EXIT"
      ops_acquisition_object_matches "$index" ||
        return "$OPS_MANUAL_RECOVERY_EXIT"
      relative="${candidate#${release_root}/}"
      digest="${OPS_TRANSACTION_ACQUISITION_DIGESTS[$index]}"
      inventory_lines+=("${digest#sha256:}  ${relative}")
    fi
  done
  [[ "${#inventory_lines[@]}" -gt 0 ]] || {
    ops_fail "RUNTIME_INVENTORY_EMPTY" "publication"
    return
  }
  ops_creation_guard_begin || return
  printf '%s\n' "${inventory_lines[@]}" |
    LC_ALL=C "$sort" > "$destination" || result=$?
  if [[ "$result" -eq 0 ]]; then
    chmod 0400 "$destination" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    chown 0:0 "$destination" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_fsync_path "$destination" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_close_acquisition_file "$destination" || result=$?
  fi
  ops_creation_guard_end
  return "$result"
}

ops_restore_release_publication_stages() {
  local runtime_stage="$1"
  local payload_stage="$2"
  local runtime_final="$3"
  local payload_final="$4"
  local runtime_device="$5"
  local runtime_inode="$6"
  local payload_device="$7"
  local payload_inode="$8"
  local mv
  mv="$(ops_command mv)" || return
  if [[ -d "$runtime_final" && ! -L "$runtime_final" ]]; then
    if [[ "$(ops_stat_value '%d' "$runtime_final")" != "$runtime_device" ||
          "$(ops_stat_value '%i' "$runtime_final")" != "$runtime_inode" ||
          -e "$runtime_stage" || -L "$runtime_stage" ]]; then
      ops_emit_failure "RUNTIME_PUBLICATION_ROLLBACK_UNSAFE" \
        "manual-recovery" || true
      return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    "$mv" -Tn -- "$runtime_final" "$runtime_stage" || return
  fi
  if [[ -d "$payload_final" && ! -L "$payload_final" ]]; then
    if [[ "$(ops_stat_value '%d' "$payload_final")" != "$payload_device" ||
          "$(ops_stat_value '%i' "$payload_final")" != "$payload_inode" ||
          -e "$payload_stage" || -L "$payload_stage" ]]; then
      ops_emit_failure "PAYLOAD_PUBLICATION_ROLLBACK_UNSAFE" \
        "manual-recovery" || true
      return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    "$mv" -Tn -- "$payload_final" "$payload_stage" || return
  fi
  if [[ ! -d "$runtime_stage" || -L "$runtime_stage" ||
        "$(ops_stat_value '%d' "$runtime_stage")" != "$runtime_device" ||
        "$(ops_stat_value '%i' "$runtime_stage")" != "$runtime_inode" ||
        ! -d "$payload_stage" || -L "$payload_stage" ||
        "$(ops_stat_value '%d' "$payload_stage")" != "$payload_device" ||
        "$(ops_stat_value '%i' "$payload_stage")" != "$payload_inode" ]]; then
    ops_emit_failure "RELEASE_PUBLICATION_ROLLBACK_FAILED" \
      "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
}

ops_publish_downloaded_release() {
  local version="$1"
  local manifest_digest="$2"
  local run_id="$3"
  local acquisition_root="$4"
  local payload_source="${acquisition_root}/payload"
  local extract_root="${acquisition_root}/extract"
  local runtime_stage="${acquisition_root}/runtime-stage"
  local payload_stage="${acquisition_root}/payload-stage"
  local runtime_final="${OPS_ROOT}/releases/${version}"
  local payload_final="${OPS_ROOT}/recovery/releases/${version}"
  if [[ -e "$runtime_stage" || -L "$runtime_stage" ||
        -e "$payload_stage" || -L "$payload_stage" ||
        -e "$runtime_final" || -L "$runtime_final" ||
        -e "$payload_final" || -L "$payload_final" ]]; then
    ops_fail "RELEASE_PUBLICATION_COLLISION" "publication"
    return
  fi
  ops_create_acquisition_directory "$extract_root" 0700 0 0 || return
  ops_create_acquisition_directory "$runtime_stage" 0700 0 0 || return
  ops_create_acquisition_directory "$payload_stage" 0700 0 0 || return
  local listing="${acquisition_root}/frontend.list"
  local verbose="${acquisition_root}/frontend.verbose"
  ops_create_acquisition_file "$listing" 0600 0 0 || return
  ops_create_acquisition_file "$verbose" 0600 0 0 || return
  ops_verify_frontend_tar \
    "${payload_source}/frontend-static-linux-amd64.tar" \
    "$listing" "$verbose" || return
  ops_close_acquisition_file "$listing" || return
  ops_close_acquisition_file "$verbose" || return
  ops_extract_frontend_tree \
    "${payload_source}/frontend-static-linux-amd64.tar" \
    "$listing" "$extract_root" || return

  ops_create_acquisition_directory \
    "${runtime_stage}/bin" 0755 0 0 || return
  ops_create_acquisition_directory \
    "${runtime_stage}/frontend" 0755 0 0 || return
  ops_copy_acquisition_file \
    "${payload_source}/release-manifest.json" \
    "${runtime_stage}/release-manifest.json" 0444 0 0 || return
  ops_copy_acquisition_file \
    "${payload_source}/payload-checksums.sha256" \
    "${runtime_stage}/checksums.txt" 0444 0 0 || return
  ops_copy_acquisition_file \
    "${payload_source}/archive-smoke" \
    "${runtime_stage}/bin/archive-smoke" 0555 0 0 || return
  ops_install_frontend_tree \
    "${extract_root}/frontend" \
    "${runtime_stage}/frontend" || return
  ops_update_acquisition_directory "$runtime_stage" 0555 0 0 || return
  ops_update_acquisition_directory "${runtime_stage}/bin" 0555 0 0 || return

  local asset mode
  ops_copy_acquisition_file \
    "${payload_source}/release-manifest.json" \
    "${payload_stage}/release-manifest.json" 0400 0 0 || return
  ops_copy_acquisition_file \
    "${payload_source}/payload-checksums.sha256" \
    "${payload_stage}/payload-checksums.sha256" 0400 0 0 || return
  for asset in "${OPS_RELEASE_ASSETS[@]}"; do
    mode="0400"
    [[ "$asset" == "archive-smoke" ]] && mode="0500"
    ops_copy_acquisition_file \
      "${payload_source}/${asset}" "${payload_stage}/${asset}" \
      "$mode" 0 0 || return
  done
  ops_generate_runtime_inventory \
    "$runtime_stage" "${payload_stage}/runtime-inventory.sha256" || return

  local jq marker controller_revision
  jq="$(ops_command jq)" || return
  controller_revision="$(ops_manifest_value \
    "${OPS_ROOT}/controller-manifest.json" '.controllerRevision')" || return
  marker="${payload_stage}/managed-release.json"
  ops_create_acquisition_file "$marker" 0600 0 0 || return
  local marker_result=0
  ops_creation_guard_begin || return
  "$jq" -cnS \
    --arg controllerRevision "$controller_revision" \
    --arg manifestDigest "$manifest_digest" \
    --arg payloadChecksumsDigest "$(
      ops_sha256_file "${payload_stage}/payload-checksums.sha256"
    )" \
    --arg payloadRootDevice "$(ops_stat_value '%d' "$payload_stage")" \
    --arg payloadRootInode "$(ops_stat_value '%i' "$payload_stage")" \
    --arg releaseRootDevice "$(ops_stat_value '%d' "$runtime_stage")" \
    --arg releaseRootInode "$(ops_stat_value '%i' "$runtime_stage")" \
    --arg runtimeInventoryDigest "$(
      ops_sha256_file "${payload_stage}/runtime-inventory.sha256"
    )" \
    --arg version "$version" \
    '{
      controllerRevision:$controllerRevision,
      manifestDigest:$manifestDigest,
      payloadChecksumsDigest:$payloadChecksumsDigest,
      payloadRootDevice:$payloadRootDevice,
      payloadRootInode:$payloadRootInode,
      releaseRootDevice:$releaseRootDevice,
      releaseRootInode:$releaseRootInode,
      runtimeInventoryDigest:$runtimeInventoryDigest,
      schemaVersion:"managed-release-v1",
      version:$version
    }' > "$marker" || marker_result=$?
  if [[ "$marker_result" -eq 0 ]]; then
    chmod 0400 "$marker" || marker_result=$?
  fi
  if [[ "$marker_result" -eq 0 ]]; then
    chown 0:0 "$marker" || marker_result=$?
  fi
  if [[ "$marker_result" -eq 0 ]]; then
    ops_fsync_path "$marker" || marker_result=$?
  fi
  if [[ "$marker_result" -eq 0 ]]; then
    ops_close_acquisition_file "$marker" || marker_result=$?
  fi
  ops_creation_guard_end
  [[ "$marker_result" -eq 0 ]] || return "$marker_result"
  ops_verify_managed_release_at \
    "$version" "$runtime_stage" "$payload_stage" || return

  local runtime_device runtime_inode payload_device payload_inode mv result=0
  runtime_device="$(ops_stat_value '%d' "$runtime_stage")" || return
  runtime_inode="$(ops_stat_value '%i' "$runtime_stage")" || return
  payload_device="$(ops_stat_value '%d' "$payload_stage")" || return
  payload_inode="$(ops_stat_value '%i' "$payload_stage")" || return
  OPS_TRANSACTION_RUNTIME_STAGE="$runtime_stage"
  OPS_TRANSACTION_PAYLOAD_STAGE="$payload_stage"
  OPS_TRANSACTION_RUNTIME_FINAL="$runtime_final"
  OPS_TRANSACTION_PAYLOAD_FINAL="$payload_final"
  OPS_TRANSACTION_RUNTIME_DEVICE="$runtime_device"
  OPS_TRANSACTION_RUNTIME_INODE="$runtime_inode"
  OPS_TRANSACTION_PAYLOAD_DEVICE="$payload_device"
  OPS_TRANSACTION_PAYLOAD_INODE="$payload_inode"
  mv="$(ops_command mv)" || return
  "$mv" -Tn -- "$payload_stage" "$payload_final" || result=$?
  if [[ "$result" -eq 0 &&
        ( ! -d "$payload_final" || -L "$payload_final" ||
          "$(ops_stat_value '%d' "$payload_final")" != "$payload_device" ||
          "$(ops_stat_value '%i' "$payload_final")" != "$payload_inode" ) ]]; then
    result=1
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_fsync_path "${OPS_ROOT}/recovery/releases" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    "$mv" -Tn -- "$runtime_stage" "$runtime_final" || result=$?
  fi
  if [[ "$result" -eq 0 &&
        ( ! -d "$runtime_final" || -L "$runtime_final" ||
          "$(ops_stat_value '%d' "$runtime_final")" != "$runtime_device" ||
          "$(ops_stat_value '%i' "$runtime_final")" != "$runtime_inode" ) ]]; then
    result=1
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_fsync_path "${OPS_ROOT}/releases" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_verify_managed_release_at \
      "$version" "$runtime_final" "$payload_final" || result=$?
  fi
  if [[ "$result" -ne 0 ]]; then
    ops_restore_release_publication_stages \
      "$runtime_stage" "$payload_stage" "$runtime_final" "$payload_final" \
      "$runtime_device" "$runtime_inode" "$payload_device" "$payload_inode" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    ops_emit_failure "RELEASE_PUBLICATION_REVERSED" "publication" || true
    return 1
  fi
  OPS_MANIFEST[releaseRoot]="$runtime_final"
  ops_verify_managed_release "$version"
}

ops_acquire_release_into() {
  local version="$1"
  local manifest_digest="$2"
  local run_id="$3"
  local acquisition_root="$4"
  local payload_root="${acquisition_root}/payload"
  ops_download_release_file \
    "$version" "release-manifest.json" \
    "${payload_root}/release-manifest.json" \
    "$OPS_RELEASE_MANIFEST_MAX_BYTES" || return
  ops_verify_canonical_manifest "${payload_root}/release-manifest.json" || return
  ops_validate_release_manifest \
    "$version" "$manifest_digest" "${payload_root}/release-manifest.json" || return
  local manifest="${payload_root}/release-manifest.json"
  local payload_size total_size
  payload_size="$(ops_release_asset_size \
    "$manifest" "payload-checksums.sha256")" || return
  total_size="$(ops_stat_value '%s' "$manifest")" || return
  total_size=$((total_size + payload_size))
  local asset asset_size
  for asset in "${OPS_RELEASE_ASSETS[@]}"; do
    asset_size="$(ops_release_asset_size "$manifest" "$asset")" || return
    total_size=$((total_size + asset_size))
  done
  if [[ "$total_size" -gt "$OPS_RELEASE_TOTAL_MAX_BYTES" ]]; then
    ops_fail "RELEASE_TOTAL_SIZE_EXCEEDED" "acquisition"
    return
  fi
  local required_kib=$(((total_size * 4 + 1023) / 1024))
  if [[ "$required_kib" -lt "$OPS_MIN_FREE_KIB" ]]; then
    required_kib="$OPS_MIN_FREE_KIB"
  fi
  ops_verify_free_space "$required_kib" || return
  ops_download_release_file \
    "$version" "payload-checksums.sha256" \
    "${payload_root}/payload-checksums.sha256" "$payload_size" || return
  for asset in "${OPS_RELEASE_ASSETS[@]}"; do
    asset_size="$(ops_release_asset_size "$manifest" "$asset")" || return
    ops_download_release_file \
      "$version" "$asset" "${payload_root}/${asset}" "$asset_size" || return
  done
  ops_verify_downloaded_release \
    "$version" "$manifest_digest" "$payload_root" || return
  ops_publish_downloaded_release \
    "$version" "$manifest_digest" "$run_id" "$acquisition_root"
}

ops_acquisition_index() {
  local candidate="$1"
  local index
  for index in "${!OPS_TRANSACTION_ACQUISITION_PATHS[@]}"; do
    if [[ "${OPS_TRANSACTION_ACQUISITION_PATHS[$index]}" == "$candidate" ]]; then
      printf '%s\n' "$index"
      return 0
    fi
  done
  return 1
}

ops_acquisition_intent() {
  local candidate="$1"
  local type="$2"
  ops_require_below_root "$candidate" || return
  if [[ -z "$OPS_TRANSACTION_ACQUISITION_ROOT" ||
        ( "$candidate" != "$OPS_TRANSACTION_ACQUISITION_ROOT" &&
          "$candidate" != "${OPS_TRANSACTION_ACQUISITION_ROOT}/"* ) ||
        ( "$type" != "file" && "$type" != "directory" ) ]] ||
    ops_acquisition_index "$candidate" >/dev/null; then
    ops_fail "ACQUISITION_INTENT_INVALID" "acquisition"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  if [[ -e "$candidate" || -L "$candidate" ]]; then
    ops_emit_failure "ACQUISITION_FOREIGN_OBJECT_PRESERVED" \
      "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  OPS_TRANSACTION_ACQUISITION_PATHS+=("$candidate")
  OPS_TRANSACTION_ACQUISITION_TYPES+=("$type")
  OPS_TRANSACTION_ACQUISITION_STATES+=("intent")
  OPS_TRANSACTION_ACQUISITION_DEVICES+=("")
  OPS_TRANSACTION_ACQUISITION_INODES+=("")
  OPS_TRANSACTION_ACQUISITION_OWNERS+=("")
  OPS_TRANSACTION_ACQUISITION_MODES+=("")
  OPS_TRANSACTION_ACQUISITION_LINKS+=("")
  OPS_TRANSACTION_ACQUISITION_SIZES+=("")
  OPS_TRANSACTION_ACQUISITION_DIGESTS+=("")
  OPS_TRANSACTION_ACQUISITION_TREE_STATE="open"
}

ops_record_acquisition_object() {
  local candidate="$1"
  local content_policy="${2:-closed}"
  local index
  index="$(ops_acquisition_index "$candidate")" || {
    ops_fail "ACQUISITION_OBJECT_NOT_INTENDED" "acquisition"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  }
  if [[ "$content_policy" != "mutable" && "$content_policy" != "closed" ]]; then
    ops_fail "ACQUISITION_CONTENT_POLICY_INVALID" "acquisition"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local type="${OPS_TRANSACTION_ACQUISITION_TYPES[$index]}"
  local prior_state="${OPS_TRANSACTION_ACQUISITION_STATES[$index]}"
  local device inode owner mode links="" size="" digest=""
  if [[ "$type" == "file" ]]; then
    if [[ ! -f "$candidate" || -L "$candidate" ]]; then
      ops_fail "ACQUISITION_FILE_INVALID" "acquisition"
      return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    links="$(ops_stat_value '%h' "$candidate")" || return
    if [[ "$links" != "1" ]]; then
      ops_fail "ACQUISITION_FILE_LINK_INVALID" "acquisition"
      return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    size="$(ops_stat_value '%s' "$candidate")" || return
    if [[ "$content_policy" == "closed" ]]; then
      digest="$(ops_sha256_file "$candidate")" || return
    fi
  elif [[ ! -d "$candidate" || -L "$candidate" ]]; then
    ops_fail "ACQUISITION_DIRECTORY_INVALID" "acquisition"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  device="$(ops_stat_value '%d' "$candidate")" || return
  inode="$(ops_stat_value '%i' "$candidate")" || return
  owner="$(ops_stat_value '%u:%g' "$candidate")" || return
  mode="$(ops_stat_value '%a' "$candidate")" || return
  if [[ -z "$OPS_TRANSACTION_ACQUISITION_DEVICE" ]]; then
    if [[ "$candidate" != "$OPS_TRANSACTION_ACQUISITION_ROOT" ]]; then
      ops_fail "ACQUISITION_ROOT_NOT_RECORDED" "acquisition"
      return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    OPS_TRANSACTION_ACQUISITION_DEVICE="$device"
    OPS_TRANSACTION_ACQUISITION_INODE="$inode"
  elif [[ "$device" != "$OPS_TRANSACTION_ACQUISITION_DEVICE" ]]; then
    ops_fail "ACQUISITION_DEVICE_INVALID" "acquisition"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  if [[ "$prior_state" != "intent" && "$prior_state" != "creating" &&
        "$prior_state" != "mutable" && "$prior_state" != "closed" &&
        "$prior_state" != "recorded" ]]; then
    ops_fail "ACQUISITION_LEDGER_STATE_INVALID" "acquisition"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  if [[ "$prior_state" == "mutable" || "$prior_state" == "closed" ||
        "$prior_state" == "recorded" ]] &&
    [[ "$device" != "${OPS_TRANSACTION_ACQUISITION_DEVICES[$index]}" ||
       "$inode" != "${OPS_TRANSACTION_ACQUISITION_INODES[$index]}" ]]; then
    ops_emit_failure "ACQUISITION_OBJECT_REPLACED" \
      "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  OPS_TRANSACTION_ACQUISITION_STATES[$index]="$(
    if [[ "$type" == "directory" ]]; then
      printf '%s\n' recorded
    else
      printf '%s\n' "$content_policy"
    fi
  )"
  OPS_TRANSACTION_ACQUISITION_DEVICES[$index]="$device"
  OPS_TRANSACTION_ACQUISITION_INODES[$index]="$inode"
  OPS_TRANSACTION_ACQUISITION_OWNERS[$index]="$owner"
  OPS_TRANSACTION_ACQUISITION_MODES[$index]="$mode"
  OPS_TRANSACTION_ACQUISITION_LINKS[$index]="$links"
  OPS_TRANSACTION_ACQUISITION_SIZES[$index]="$size"
  OPS_TRANSACTION_ACQUISITION_DIGESTS[$index]="$digest"
}

ops_create_acquisition_directory() {
  local candidate="$1"
  local mode="$2"
  local uid="$3"
  local gid="$4"
  local mkdir chown chmod result=0 index=""
  mkdir="$(ops_command mkdir)" || return
  chown="$(ops_command chown)" || return
  chmod="$(ops_command chmod)" || return
  ops_creation_guard_begin || return
  ops_acquisition_intent "$candidate" directory || result=$?
  if [[ "$result" -eq 0 ]]; then
    index="$(ops_acquisition_index "$candidate")" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    OPS_TRANSACTION_ACQUISITION_STATES[$index]="creating"
    "$mkdir" -m "$mode" -- "$candidate" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    "$chown" "$uid:$gid" "$candidate" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    "$chmod" "$mode" "$candidate" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_record_acquisition_object "$candidate" || result=$?
  fi
  if [[ "$result" -ne 0 && -n "$index" &&
        ! -e "$candidate" && ! -L "$candidate" ]]; then
    OPS_TRANSACTION_ACQUISITION_STATES[$index]="absent"
  fi
  ops_creation_guard_end
  if [[ "$result" -ne 0 ]]; then
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
}

ops_create_acquisition_file() {
  local candidate="$1"
  local mode="$2"
  local uid="$3"
  local gid="$4"
  local chown chmod result=0 index=""
  chown="$(ops_command chown)" || return
  chmod="$(ops_command chmod)" || return
  ops_creation_guard_begin || return
  ops_acquisition_intent "$candidate" file || result=$?
  if [[ "$result" -eq 0 ]]; then
    index="$(ops_acquisition_index "$candidate")" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    OPS_TRANSACTION_ACQUISITION_STATES[$index]="creating"
    ( set -o noclobber; : > "$candidate" ) || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    "$chown" "$uid:$gid" "$candidate" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    "$chmod" "$mode" "$candidate" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_record_acquisition_object "$candidate" mutable || result=$?
  fi
  if [[ "$result" -ne 0 && -n "$index" &&
        ! -e "$candidate" && ! -L "$candidate" ]]; then
    OPS_TRANSACTION_ACQUISITION_STATES[$index]="absent"
  fi
  ops_creation_guard_end
  if [[ "$result" -ne 0 ]]; then
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
}

ops_close_acquisition_file() {
  local candidate="$1"
  local result=0
  ops_creation_guard_begin || return
  ops_record_acquisition_object "$candidate" closed || result=$?
  ops_creation_guard_end
  if [[ "$result" -ne 0 ]]; then
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
}

ops_update_acquisition_directory() {
  local candidate="$1"
  local mode="$2"
  local uid="$3"
  local gid="$4"
  local index
  index="$(ops_acquisition_index "$candidate")" || return "$OPS_MANUAL_RECOVERY_EXIT"
  local chown chmod result=0
  chown="$(ops_command chown)" || return
  chmod="$(ops_command chmod)" || return
  ops_creation_guard_begin || return
  ops_acquisition_object_matches "$index" || result="$OPS_MANUAL_RECOVERY_EXIT"
  if [[ "$result" -eq 0 ]]; then
    "$chown" "$uid:$gid" "$candidate" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    "$chmod" "$mode" "$candidate" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_record_acquisition_object "$candidate" || result=$?
  fi
  ops_creation_guard_end
  return "$result"
}

ops_copy_acquisition_file() {
  local source="$1"
  local destination="$2"
  local mode="$3"
  local uid="$4"
  local gid="$5"
  ops_create_acquisition_file "$destination" 0600 "$uid" "$gid" || return
  local dd chown chmod result=0
  dd="$(ops_command dd)" || return
  chown="$(ops_command chown)" || return
  chmod="$(ops_command chmod)" || return
  ops_creation_guard_begin || return
  "$dd" if="$source" of="$destination" conv=notrunc status=none || result=$?
  if [[ "$result" -eq 0 ]]; then
    "$chown" "$uid:$gid" "$destination" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    "$chmod" "$mode" "$destination" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_fsync_path "$destination" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_close_acquisition_file "$destination" || result=$?
  fi
  ops_creation_guard_end
  return "$result"
}

ops_acquisition_object_matches() {
  local index="$1"
  local candidate="${OPS_TRANSACTION_ACQUISITION_PATHS[$index]}"
  local state="${OPS_TRANSACTION_ACQUISITION_STATES[$index]}"
  if [[ "$state" == "absent" || "$state" == "relinquished" ]]; then
    [[ ! -e "$candidate" && ! -L "$candidate" ]]
    return
  fi
  if [[ "$state" == "intent" || "$state" == "creating" ]]; then
    return 1
  fi
  if [[ "${OPS_TRANSACTION_ACQUISITION_TYPES[$index]}" == "file" ]]; then
    [[ ( "$state" == "mutable" || "$state" == "closed" ) &&
      -f "$candidate" && ! -L "$candidate" &&
      "$(ops_stat_value '%h' "$candidate")" == \
        "${OPS_TRANSACTION_ACQUISITION_LINKS[$index]}" ]] || return 1
    if [[ "$state" == "closed" ]] &&
      [[ "$(ops_stat_value '%s' "$candidate")" != \
            "${OPS_TRANSACTION_ACQUISITION_SIZES[$index]}" ||
         "$(ops_sha256_file "$candidate")" != \
            "${OPS_TRANSACTION_ACQUISITION_DIGESTS[$index]}" ]]; then
      return 1
    fi
  else
    [[ "$state" == "recorded" &&
      -d "$candidate" && ! -L "$candidate" ]] || return 1
  fi
  [[ "$(ops_stat_value '%d' "$candidate")" == \
      "${OPS_TRANSACTION_ACQUISITION_DEVICES[$index]}" &&
    "$(ops_stat_value '%i' "$candidate")" == \
      "${OPS_TRANSACTION_ACQUISITION_INODES[$index]}" &&
    "$(ops_stat_value '%u:%g' "$candidate")" == \
      "${OPS_TRANSACTION_ACQUISITION_OWNERS[$index]}" &&
    "$(ops_stat_value '%a' "$candidate")" == \
      "${OPS_TRANSACTION_ACQUISITION_MODES[$index]}" ]]
}

ops_verify_acquisition_tree_ledger() {
  if [[ "$OPS_TRANSACTION_ACQUISITION_STATE" != "recorded" ||
        "${#OPS_TRANSACTION_ACQUISITION_PATHS[@]}" -eq 0 ]]; then
    ops_fail "ACQUISITION_TREE_NOT_RECORDED" "compensation"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local index expected_count=0
  for index in "${!OPS_TRANSACTION_ACQUISITION_PATHS[@]}"; do
    ops_acquisition_object_matches "$index" || {
      ops_emit_failure "ACQUISITION_OBJECT_REPLACED" \
        "manual-recovery" || true
      return "$OPS_MANUAL_RECOVERY_EXIT"
    }
    case "${OPS_TRANSACTION_ACQUISITION_STATES[$index]}" in
      recorded|mutable|closed) expected_count=$((expected_count + 1)) ;;
    esac
  done
  local find awk actual_count
  find="$(ops_command find)" || return
  awk="$(ops_command awk)" || return
  actual_count="$(
    "$find" "$OPS_TRANSACTION_ACQUISITION_ROOT" \
      -xdev -printf '1\n' |
      "$awk" 'END { print NR }'
  )" || return "$OPS_MANUAL_RECOVERY_EXIT"
  if [[ ! "$actual_count" =~ ^[0-9]+$ ||
        "$actual_count" -ne "$expected_count" ]]; then
    ops_emit_failure "ACQUISITION_FOREIGN_OBJECT_PRESERVED" \
      "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
}

ops_seal_acquisition_tree() {
  local result=0
  ops_creation_guard_begin || return
  ops_verify_acquisition_tree_ledger || result=$?
  if [[ "$result" -eq 0 ]]; then
    OPS_TRANSACTION_ACQUISITION_TREE_STATE="sealed"
  fi
  ops_creation_guard_end
  if [[ "$result" -ne 0 ]]; then
    OPS_TRANSACTION_ACQUISITION_TREE_STATE="open"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
}

ops_relinquish_acquisition_subtree() {
  local stage="$1"
  local final="$2"
  local expected_device="$3"
  local expected_inode="$4"
  if [[ -e "$stage" || -L "$stage" ||
        ! -d "$final" || -L "$final" ||
        "$(ops_stat_value '%d' "$final")" != "$expected_device" ||
        "$(ops_stat_value '%i' "$final")" != "$expected_inode" ]]; then
    ops_fail "ACQUISITION_RELINQUISH_INVALID" "publication"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local index matched=0
  for index in "${!OPS_TRANSACTION_ACQUISITION_PATHS[@]}"; do
    case "${OPS_TRANSACTION_ACQUISITION_PATHS[$index]}" in
      "$stage"|"$stage"/*)
        case "${OPS_TRANSACTION_ACQUISITION_STATES[$index]}" in
          recorded|mutable|closed)
            OPS_TRANSACTION_ACQUISITION_STATES[$index]="relinquished"
            matched=$((matched + 1))
            ;;
          *)
            ops_fail "ACQUISITION_RELINQUISH_STATE_INVALID" "publication"
            return "$OPS_MANUAL_RECOVERY_EXIT"
            ;;
        esac
        ;;
    esac
  done
  if [[ "$matched" -eq 0 ]]; then
    ops_fail "ACQUISITION_RELINQUISH_EMPTY" "publication"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
}

ops_cleanup_acquisition_root() {
  local acquisition_root="$1"
  local expected_device="$2"
  local expected_inode="$3"
  if [[ ! "$acquisition_root" =~ ^${OPS_ROOT}/recovery/\.acquire-run-[0-9a-f]{32}$ ||
        "$acquisition_root" != "$OPS_TRANSACTION_ACQUISITION_ROOT" ||
        "$expected_device" != "$OPS_TRANSACTION_ACQUISITION_DEVICE" ||
        "$expected_inode" != "$OPS_TRANSACTION_ACQUISITION_INODE" ||
        ! -d "$acquisition_root" || -L "$acquisition_root" ||
        "$(ops_stat_value '%d' "$acquisition_root")" != "$expected_device" ||
        "$(ops_stat_value '%i' "$acquisition_root")" != "$expected_inode" ||
        "$(ops_stat_value '%u:%g:%a' "$acquisition_root")" != "0:0:700" ]]; then
    ops_emit_failure "ACQUISITION_CLEANUP_UNSAFE" "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  ops_verify_acquisition_tree_ledger || return
  local unlink rmdir
  unlink="$(ops_command unlink)" || return
  rmdir="$(ops_command rmdir)" || return
  local index candidate result=0
  ops_creation_guard_begin || return
  for index in "${!OPS_TRANSACTION_ACQUISITION_PATHS[@]}"; do
    [[ "${OPS_TRANSACTION_ACQUISITION_TYPES[$index]}" == "file" &&
      ( "${OPS_TRANSACTION_ACQUISITION_STATES[$index]}" == "mutable" ||
        "${OPS_TRANSACTION_ACQUISITION_STATES[$index]}" == "closed" ) ]] ||
      continue
    ops_acquisition_object_matches "$index" || {
      result="$OPS_MANUAL_RECOVERY_EXIT"
      break
    }
    candidate="${OPS_TRANSACTION_ACQUISITION_PATHS[$index]}"
    "$unlink" -- "$candidate" || {
      result="$OPS_MANUAL_RECOVERY_EXIT"
      break
    }
    OPS_TRANSACTION_ACQUISITION_STATES[$index]="absent"
  done
  for ((index=${#OPS_TRANSACTION_ACQUISITION_PATHS[@]} - 1;
       result == 0 && index >= 0;
       index--)); do
    [[ "${OPS_TRANSACTION_ACQUISITION_TYPES[$index]}" == "directory" &&
      "${OPS_TRANSACTION_ACQUISITION_STATES[$index]}" == "recorded" ]] ||
      continue
    ops_acquisition_object_matches "$index" || {
      result="$OPS_MANUAL_RECOVERY_EXIT"
      break
    }
    candidate="${OPS_TRANSACTION_ACQUISITION_PATHS[$index]}"
    "$rmdir" -- "$candidate" || {
      result="$OPS_MANUAL_RECOVERY_EXIT"
      break
    }
    OPS_TRANSACTION_ACQUISITION_STATES[$index]="absent"
  done
  ops_creation_guard_end
  if [[ "$result" -ne 0 ]]; then
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  OPS_TRANSACTION_ACQUISITION_STATE="absent"
  OPS_TRANSACTION_ACQUISITION_TREE_STATE="unsealed"
}

ops_acquire_release() {
  local version="$1"
  local manifest_digest="$2"
  local run_id="$3"
  local runtime_final="${OPS_ROOT}/releases/${version}"
  local payload_final="${OPS_ROOT}/recovery/releases/${version}"
  if [[ -e "$runtime_final" || -L "$runtime_final" ||
        -e "$payload_final" || -L "$payload_final" ]]; then
    if [[ -d "$runtime_final" && -d "$payload_final" &&
          ! -L "$runtime_final" && ! -L "$payload_final" ]]; then
      ops_validate_release_manifest "$version" "$manifest_digest" || return
      ops_verify_release_tree || return
      ops_transaction_disarm
      return
    fi
    ops_fail "RELEASE_IDENTITY_COLLISION" "acquisition"
    return
  fi

  local acquisition_root="${OPS_ROOT}/recovery/.acquire-${run_id}"
  OPS_TRANSACTION_ACQUISITION_ROOT="$acquisition_root"
  OPS_TRANSACTION_ACQUISITION_STATE="absent"
  local payload_root="${acquisition_root}/payload"
  if [[ -e "$acquisition_root" || -L "$acquisition_root" ]]; then
    ops_fail "ACQUISITION_ROOT_COLLISION" "acquisition"
    return
  fi
  local acquisition_device="" acquisition_inode="" creation_result=0
  ops_creation_guard_begin || return
  OPS_TRANSACTION_ACQUISITION_STATE="creating"
  ops_create_acquisition_directory \
    "$acquisition_root" 0700 0 0 || creation_result=$?
  if [[ "$creation_result" -eq 0 ]]; then
    acquisition_device="$OPS_TRANSACTION_ACQUISITION_DEVICE"
    acquisition_inode="$OPS_TRANSACTION_ACQUISITION_INODE"
  fi
  if [[ "$creation_result" -eq 0 ]]; then
    OPS_TRANSACTION_ACQUISITION_STATE="recorded"
    ops_seal_acquisition_tree || creation_result=$?
  elif [[ ! -e "$acquisition_root" && ! -L "$acquisition_root" ]]; then
    OPS_TRANSACTION_ACQUISITION_STATE="absent"
  fi
  ops_creation_guard_end
  if [[ "$creation_result" -ne 0 ||
        "$OPS_TRANSACTION_ACQUISITION_STATE" != "recorded" ]]; then
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  if ! ops_create_acquisition_directory "$payload_root" 0700 0 0; then
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local result=0
  OPS_TRANSACTION_ACQUISITION_TREE_STATE="open"
  ops_acquire_release_into \
    "$version" "$manifest_digest" "$run_id" "$acquisition_root" || result=$?
  if [[ "$result" -eq 0 ]]; then
    ops_creation_guard_begin || return
    ops_relinquish_acquisition_subtree \
      "$OPS_TRANSACTION_RUNTIME_STAGE" \
      "$OPS_TRANSACTION_RUNTIME_FINAL" \
      "$OPS_TRANSACTION_RUNTIME_DEVICE" \
      "$OPS_TRANSACTION_RUNTIME_INODE" || result=$?
    if [[ "$result" -eq 0 ]]; then
      ops_relinquish_acquisition_subtree \
        "$OPS_TRANSACTION_PAYLOAD_STAGE" \
        "$OPS_TRANSACTION_PAYLOAD_FINAL" \
        "$OPS_TRANSACTION_PAYLOAD_DEVICE" \
        "$OPS_TRANSACTION_PAYLOAD_INODE" || result=$?
    fi
    if [[ "$result" -eq 0 ]]; then
      ops_seal_acquisition_tree || result=$?
    fi
    if [[ "$result" -eq 0 ]]; then
      # Publication has been verified at its immutable final names. Make the
      # accepted pair non-compensating in the same signal guard that seals the
      # remaining private acquisition tree.
      OPS_TRANSACTION_RUNTIME_STAGE=""
      OPS_TRANSACTION_PAYLOAD_STAGE=""
      OPS_TRANSACTION_RUNTIME_FINAL=""
      OPS_TRANSACTION_PAYLOAD_FINAL=""
      OPS_TRANSACTION_RUNTIME_DEVICE=""
      OPS_TRANSACTION_RUNTIME_INODE=""
      OPS_TRANSACTION_PAYLOAD_DEVICE=""
      OPS_TRANSACTION_PAYLOAD_INODE=""
    fi
    ops_creation_guard_end
  fi
  if [[ "$result" -ne 0 ]]; then
    local compensation_result=0
    ops_transaction_compensate_now \
      "RELEASE_ACQUISITION_FAILED" "ACQUISITION_CLEANUP_FAILED" ||
      compensation_result=$?
    if [[ "$compensation_result" -ne 0 ]]; then
      return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    return "$result"
  fi
  if ! ops_cleanup_acquisition_root \
    "$acquisition_root" "$acquisition_device" "$acquisition_inode"; then
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_transaction_disarm
  fi
  return "$result"
}

ops_require_fresh_app_state() {
  local candidate
  for candidate in \
    "${OPS_ROOT}/compose/release.env" \
    "${OPS_ROOT}/compose/previous-app.json" \
    "${OPS_ROOT}/current-frontend" \
    "${OPS_ROOT}/data/current.json" \
    "${OPS_ROOT}/data/previous.json"; do
    if [[ -e "$candidate" || -L "$candidate" ]]; then
      ops_fail "FRESH_APP_STATE_COLLISION" "bootstrap-archive"
      return
    fi
  done
  ops_require_no_updater_stage
}

ops_require_empty_versions() {
  local candidate
  shopt -s nullglob dotglob
  for candidate in "${OPS_ROOT}/data/versions"/*; do
    shopt -u nullglob dotglob
    ops_emit_failure "INITIAL_VERSION_PRESERVED" "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  done
  shopt -u nullglob dotglob
}

ops_require_strict_fresh_archive_state() {
  ops_require_fresh_app_state || return
  ops_verify_data_inventory || return
  ops_require_empty_versions || return
  if [[ -e "${OPS_ROOT}/data/update-status.json" ||
        -L "${OPS_ROOT}/data/update-status.json" ]]; then
    ops_fail "INITIAL_STATUS_COLLISION" "bootstrap-archive"
    return
  fi
}

ops_create_fresh_current_mask() {
  local source="${OPS_ROOT}/compose/updater-current-deny"
  local destination="${OPS_ROOT}/data/current.json"
  ops_require_regular_file "$source" 0 0 0 || return
  if [[ -e "$destination" || -L "$destination" ]]; then
    ops_fail "FRESH_CURRENT_MASK_COLLISION" "bootstrap-archive"
    return
  fi
  local creation_result=0 device="" inode="" digest=""
  ops_creation_guard_begin || return
  OPS_FRESH_MASK_STATE="creating"
  ops_atomic_replace_file "$source" "$destination" 0 0 0 ||
    creation_result=$?
  if [[ "$creation_result" -eq 0 ]]; then
    device="$(ops_stat_value '%d' "$destination")" || creation_result=$?
    inode="$(ops_stat_value '%i' "$destination")" || creation_result=$?
    digest="$(ops_sha256_file "$destination")" || creation_result=$?
  fi
  if [[ "$creation_result" -eq 0 ]]; then
    OPS_FRESH_MASK_DEVICE="$device"
    OPS_FRESH_MASK_INODE="$inode"
    OPS_FRESH_MASK_DIGEST="$digest"
    OPS_FRESH_MASK_STATE="recorded"
  elif [[ ! -e "$destination" && ! -L "$destination" ]]; then
    OPS_FRESH_MASK_STATE="absent"
  fi
  ops_creation_guard_end
  if [[ "$creation_result" -ne 0 ||
        "$OPS_FRESH_MASK_STATE" != "recorded" ]]; then
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
}

ops_remove_fresh_current_mask() {
  local destination="${OPS_ROOT}/data/current.json"
  if [[ "$OPS_FRESH_MASK_STATE" != "recorded" ||
        -z "$OPS_FRESH_MASK_DEVICE" ||
        -z "$OPS_FRESH_MASK_INODE" ||
        -z "$OPS_FRESH_MASK_DIGEST" ||
        ! -f "$destination" ||
        -L "$destination" ||
        "$(ops_stat_value '%u:%g:%h:%a' "$destination")" != "0:0:1:0" ||
        "$(ops_stat_value '%d' "$destination")" != "$OPS_FRESH_MASK_DEVICE" ||
        "$(ops_stat_value '%i' "$destination")" != "$OPS_FRESH_MASK_INODE" ||
        "$(ops_sha256_file "$destination")" != "$OPS_FRESH_MASK_DIGEST" ]]; then
    ops_emit_failure "FRESH_CURRENT_MASK_REPLACED" \
      "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local unlink
  unlink="$(ops_command unlink)" || return
  local result=0
  ops_creation_guard_begin || return
  "$unlink" -- "$destination" || result=$?
  if [[ "$result" -eq 0 ]]; then
    ops_fsync_path "${OPS_ROOT}/data" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    OPS_FRESH_MASK_DEVICE=""
    OPS_FRESH_MASK_INODE=""
    OPS_FRESH_MASK_DIGEST=""
    OPS_FRESH_MASK_STATE="absent"
  fi
  ops_creation_guard_end
  if [[ "$result" -ne 0 ]]; then
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
}

ops_publish_fresh_current() {
  local source="$1"
  local destination="${OPS_ROOT}/data/current.json"
  local result=0
  ops_creation_guard_begin || return
  if [[ -e "$destination" || -L "$destination" ]]; then
    ops_fail "FRESH_CURRENT_FOREIGN_INSERT" "bootstrap-archive"
    result="$OPS_MANUAL_RECOVERY_EXIT"
  else
    ops_transaction_ref_capture \
      fresh-current "$destination" file 644 || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_transaction_publish_tracked_file \
      fresh-current "$source" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    OPS_TRANSACTION_FRESH_CURRENT_DEVICE="$(
      ops_stat_value '%d' "$destination"
    )" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    OPS_TRANSACTION_FRESH_CURRENT_INODE="$(
      ops_stat_value '%i' "$destination"
    )" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    OPS_TRANSACTION_FRESH_CURRENT_DIGEST="$(
      ops_sha256_file "$destination"
    )" || result=$?
  fi
  ops_creation_guard_end
  return "$result"
}

ops_stop_fresh_candidate() {
  ops_stop_updater_containers
}

ops_bootstrap_initial_archive() {
  local run_id="$1"
  ops_require_strict_fresh_archive_state || return

  local candidate_env output
  ops_make_temporary_file \
    candidate_env "${OPS_ROOT}/compose/.initial-release.XXXXXXXX"
  ops_make_temporary_file \
    output "${OPS_ROOT}/recovery/.initial-updater.XXXXXXXX" || {
    ops_dispose_temporary_paths "$candidate_env"
    return 1
  }
  ops_build_release_env "$candidate_env" || {
    ops_dispose_temporary_paths "$candidate_env" "$output"
    return 1
  }
  ops_compose_with_env "$candidate_env" config --quiet || {
    ops_dispose_temporary_paths "$candidate_env" "$output"
    ops_fail "INITIAL_COMPOSE_INVALID" "bootstrap-archive"
    return
  }
  local existing
  existing="$(ops_compose_with_env "$candidate_env" \
    --profile oneshot ps -q)" || {
    ops_dispose_temporary_paths "$candidate_env" "$output"
    return 1
  }
  if [[ -n "$existing" ]]; then
    ops_dispose_temporary_paths "$candidate_env" "$output"
    ops_fail "INITIAL_PROJECT_NOT_EMPTY" "bootstrap-archive"
    return
  fi
  ops_compose_with_env "$candidate_env" pull updater || {
    ops_dispose_temporary_paths "$candidate_env" "$output"
    ops_fail "INITIAL_UPDATER_PULL_FAILED" "bootstrap-archive"
    return
  }
  OPS_TRANSACTION_FRESH_ENV="$candidate_env"
  ops_transaction_arm "install" "$run_id" "fresh" || {
    ops_dispose_temporary_paths "$candidate_env" "$output"
    return 1
  }
  ops_create_fresh_current_mask || {
    ops_dispose_temporary_paths "$candidate_env" "$output"
    return 1
  }

  local updater_result=0 cleanup_result=0
  ops_run_updater "$output" "$candidate_env" "$run_id" || updater_result=$?
  ops_stop_fresh_candidate "$candidate_env" || cleanup_result=$?
  ops_dispose_temporary_paths "$output"
  if [[ "$cleanup_result" -ne 0 ]]; then
    ops_dispose_temporary_paths "$candidate_env"
    ops_emit_failure "INITIAL_CANDIDATE_STOP_FAILED" \
      "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  ops_remove_fresh_current_mask || {
    ops_dispose_temporary_paths "$candidate_env"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  }
  if [[ "$updater_result" -ne 0 ]]; then
    ops_dispose_temporary_paths "$candidate_env"
    ops_require_fresh_app_state || return "$OPS_MANUAL_RECOVERY_EXIT"
    ops_require_empty_versions || return "$OPS_MANUAL_RECOVERY_EXIT"
    ops_emit_failure "INITIAL_UPDATER_FAILED" "bootstrap-archive" || true
    return 1
  fi

  local status data_version
  status="$(ops_updater_status status)" || {
    ops_dispose_temporary_paths "$candidate_env"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  }
  data_version="$(ops_updater_status dataVersion)" || {
    ops_dispose_temporary_paths "$candidate_env"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  }
  local empty_inventory
  ops_make_temporary_file \
    empty_inventory "${OPS_ROOT}/recovery/.initial-versions.XXXXXXXX" || {
    ops_dispose_temporary_paths "$candidate_env"
    return 1
  }
  : > "$empty_inventory" || {
    ops_dispose_temporary_paths "$candidate_env" "$empty_inventory"
    return 1
  }
  if [[ "$status" != "published" ]] ||
    ! ops_verify_published_version_delta "$empty_inventory" "$data_version"; then
    ops_dispose_temporary_paths "$empty_inventory"
    ops_dispose_temporary_paths "$candidate_env"
    ops_fail "INITIAL_ARCHIVE_NOT_PUBLISHED" "bootstrap-archive"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  ops_dispose_temporary_paths "$empty_inventory"
  local manifest_digest
  manifest_digest="$(ops_verify_archive_version "$data_version")" || {
    ops_dispose_temporary_paths "$candidate_env"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  }
  ops_record_managed_data_version \
    "$data_version" "$manifest_digest" "$run_id" || {
    ops_dispose_temporary_paths "$candidate_env"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  }
  ops_verify_data_inventory || {
    ops_dispose_temporary_paths "$candidate_env"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  }
  local current_candidate
  ops_make_temporary_file \
    current_candidate "${OPS_ROOT}/recovery/.initial-current.XXXXXXXX"
  ops_write_current_candidate \
    "$current_candidate" "$data_version" "$manifest_digest" || {
    ops_dispose_temporary_paths "$candidate_env" "$current_candidate"
    return 1
  }
  ops_publish_fresh_current "$current_candidate" || {
    ops_dispose_temporary_paths "$candidate_env" "$current_candidate"
    return 1
    }
  ops_dispose_temporary_paths "$candidate_env" "$current_candidate"
  ops_read_current_field "${OPS_ROOT}/data/current.json" dataVersion >/dev/null
}

ops_acquire_and_install_release() {
  local version="$1"
  local manifest_digest="$2"
  local run_id="$3"
  local fresh_requested="no"
  if [[ -e "${OPS_ROOT}/data/current.json" ||
        -L "${OPS_ROOT}/data/current.json" ]]; then
    ops_preflight || return
  else
    ops_require_strict_fresh_archive_state || return
    fresh_requested="yes"
  fi
  ops_transaction_arm "install" "$run_id" "acquisition" || return
  local acquisition_result=0
  ops_acquire_release "$version" "$manifest_digest" "$run_id" ||
    acquisition_result=$?
  if [[ "$acquisition_result" -ne 0 ]]; then
    if [[ "$OPS_TRANSACTION_ACTIVE" == "yes" ]]; then
      ops_transaction_compensate_now \
        "RELEASE_ACQUISITION_FAILED" "ACQUISITION_CLEANUP_FAILED" ||
        return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    return "$acquisition_result"
  fi
  local fresh_current="no"
  local fresh_current_device=""
  local fresh_current_inode=""
  local fresh_current_digest=""
  if [[ "$fresh_requested" == "yes" ]]; then
    ops_bootstrap_initial_archive "$run_id" || return
    fresh_current="yes"
    fresh_current_device="$OPS_TRANSACTION_FRESH_CURRENT_DEVICE"
    fresh_current_inode="$OPS_TRANSACTION_FRESH_CURRENT_INODE"
    fresh_current_digest="$OPS_TRANSACTION_FRESH_CURRENT_DIGEST"
  fi
  local result=0
  ops_preflight_for_install || result=$?
  if [[ "$result" -eq 0 ]]; then
    ops_install_release "$version" "$manifest_digest" "$run_id" || result=$?
  fi
  if [[ "$result" -ne 0 && "$fresh_current" == "yes" ]]; then
    if [[ "$OPS_TRANSACTION_ACTIVE" == "yes" ]]; then
      ops_transaction_compensate_now \
        "FRESH_INSTALL_FAILED" "FRESH_COMPENSATION_FAILED" ||
        return "$OPS_MANUAL_RECOVERY_EXIT"
    else
      ops_remove_failed_fresh_current \
        "$fresh_current_device" \
        "$fresh_current_inode" \
        "$fresh_current_digest" || return "$OPS_MANUAL_RECOVERY_EXIT"
      if ! ops_require_strict_fresh_archive_state; then
        ops_record_manual_recovery \
          "$run_id" "install" "FRESH_INSTALL_FAILED" \
          "FRESH_ARCHIVE_RESIDUE" || true
        return "$OPS_MANUAL_RECOVERY_EXIT"
      fi
    fi
  fi
  return "$result"
}

ops_remove_failed_fresh_current() {
  local expected_device="$1"
  local expected_inode="$2"
  local expected_digest="$3"
  local current="${OPS_ROOT}/data/current.json"
  if [[ -e "${OPS_ROOT}/compose/release.env" ||
        -L "${OPS_ROOT}/compose/release.env" ||
        -e "${OPS_ROOT}/current-frontend" ||
        -L "${OPS_ROOT}/current-frontend" ||
        -e "${OPS_ROOT}/data/previous.json" ||
        -L "${OPS_ROOT}/data/previous.json" ||
        ! -f "$current" ||
        -L "$current" ||
        "$(ops_stat_value '%u:%g:%h:%a' "$current")" != "0:0:1:644" ||
        "$(ops_stat_value '%d' "$current")" != "$expected_device" ||
        "$(ops_stat_value '%i' "$current")" != "$expected_inode" ||
        "$(ops_sha256_file "$current")" != "$expected_digest" ]]; then
    ops_emit_failure "FRESH_CURRENT_CLEANUP_UNSAFE" \
      "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local unlink
  unlink="$(ops_command unlink)" || return
  local result=0
  ops_creation_guard_begin || return
  "$unlink" -- "$current" || result=$?
  if [[ "$result" -eq 0 ]]; then
    ops_fsync_path "${OPS_ROOT}/data" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    OPS_TRANSACTION_FRESH_CURRENT_DEVICE=""
    OPS_TRANSACTION_FRESH_CURRENT_INODE=""
    OPS_TRANSACTION_FRESH_CURRENT_DIGEST=""
  fi
  ops_creation_guard_end
  if [[ "$result" -ne 0 ]]; then
    ops_emit_failure "FRESH_CURRENT_CLEANUP_FAILED" \
      "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
}

ops_copy_temporary() {
  local source="$1"
  local destination="$2"
  if ! ops_temporary_path_is_registered "$destination"; then
    ops_fail "TEMPORARY_COPY_NOT_REGISTERED" "recovery"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local install
  install="$(ops_command install)" || return
  local result=0
  ops_creation_guard_begin || return
  "$install" -m 600 -- "$source" "$destination" || result=$?
  if [[ "$result" -eq 0 ]]; then
    ops_register_temporary_path "$destination" sealed || result=$?
  fi
  ops_creation_guard_end
  return "$result"
}

ops_persist_previous_app() {
  local environment_file="$1"
  local frontend_target="$2"
  ops_load_release_env "$environment_file" || return
  if [[ ! "$frontend_target" =~ ^releases/v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)/frontend$ ]]; then
    ops_fail "PREVIOUS_FRONTEND_INVALID" "commit"
    return
  fi
  local jq temporary
  jq="$(ops_command jq)" || return
  ops_make_temporary_file \
    temporary "${OPS_ROOT}/recovery/.previous-app.XXXXXXXX" || return
  "$jq" -cnS \
    --arg apiImage "${OPS_RELEASE_ENV[BGMSS_API_IMAGE]}" \
    --arg appRevision "${OPS_RELEASE_ENV[BGMSS_APP_REVISION]}" \
    --arg appVersion "${OPS_RELEASE_ENV[BGMSS_APP_VERSION]}" \
    --arg commonCommit "${OPS_RELEASE_ENV[BGMSS_COMMON_COMMIT]}" \
    --arg frontendTarget "$frontend_target" \
    --arg manifestDigest "${OPS_RELEASE_ENV[BGMSS_RELEASE_MANIFEST_DIGEST]}" \
    --arg releaseRoot "${OPS_RELEASE_ENV[BGMSS_RELEASE_ROOT]}" \
    --arg updaterImage "${OPS_RELEASE_ENV[BGMSS_UPDATER_IMAGE]}" \
    '{
      frontendTarget:$frontendTarget,
      releaseEnvironment:{
        BGMSS_API_IMAGE:$apiImage,
        BGMSS_APP_REVISION:$appRevision,
        BGMSS_APP_VERSION:$appVersion,
        BGMSS_COMMON_COMMIT:$commonCommit,
        BGMSS_RELEASE_MANIFEST_DIGEST:$manifestDigest,
        BGMSS_RELEASE_ROOT:$releaseRoot,
        BGMSS_UPDATER_IMAGE:$updaterImage
      },
      schemaVersion:"previous-app-v1"
    }' > "$temporary" || {
      ops_dispose_temporary_paths "$temporary"
      ops_fail "PREVIOUS_APP_STATE_BUILD_FAILED" "commit"
      return
    }
  local result=0
  ops_transaction_publish_tracked_file secondary "$temporary" || result=$?
  ops_dispose_temporary_paths "$temporary"
  return "$result"
}

ops_restore_app_refs() {
  local previous_env="$1"
  local previous_frontend="$2"
  local expected_data="$3"
  local frontend_was_switched="$4"
  local secondary=0
  if [[ "$frontend_was_switched" == "yes" ]]; then
    ops_transaction_restore_tracked_symlink \
      app-frontend "$previous_frontend" ||
      secondary=1
  fi
  ops_transaction_restore_tracked_file \
    app-environment "$previous_env" || secondary=1
  if ! ops_restart_api || ! ops_wait_healthy "$expected_data"; then
    secondary=1
  fi
  return "$secondary"
}

ops_remove_first_install_environment() {
  if [[ -e "${OPS_ROOT}/current-frontend" ||
        -L "${OPS_ROOT}/current-frontend" ]]; then
    ops_emit_failure "INITIAL_APP_STATE_PRESERVED" \
      "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  ops_transaction_remove_tracked_ref app-environment
}

ops_install_release() {
  local version="$1"
  local manifest_digest="$2"
  local run_id="$3"
  local started
  started="$(ops_now_seconds)" || return
  ops_validate_release_manifest "$version" "$manifest_digest" || return
  ops_verify_release_tree || return
  ops_verify_free_space "$OPS_MIN_FREE_KIB" || return
  local current_data
  current_data="$(ops_read_current_field "${OPS_ROOT}/data/current.json" dataVersion)" || return
  ops_verify_archive_version "$current_data" >/dev/null || return

  local candidate_env
  ops_make_temporary_file \
    candidate_env "${OPS_ROOT}/compose/.release-candidate.XXXXXXXX"
  ops_build_release_env "$candidate_env" || {
    ops_dispose_temporary_paths "$candidate_env"
    return 1
  }
  ops_compose_with_env "$candidate_env" config --quiet || {
    ops_dispose_temporary_paths "$candidate_env"
    ops_fail "COMPOSE_CONFIG_INVALID" "pre-switch"
    return
  }
  if [[ "$OPS_PROFILE" == "production" ]]; then
    ops_compose_with_env "$candidate_env" pull api updater prometheus || {
      ops_dispose_temporary_paths "$candidate_env"
      ops_fail "IMAGE_PULL_FAILED" "pre-switch"
      return
    }
  fi
  local candidate_env_digest
  candidate_env_digest="$(ops_sha256_file "$candidate_env")" || {
    ops_dispose_temporary_paths "$candidate_env"
    return 1
  }

  local had_previous="no"
  local previous_env previous_frontend
  ops_make_temporary_file \
    previous_env "${OPS_ROOT}/recovery/.release-previous.XXXXXXXX"
  if [[ -f "${OPS_ROOT}/compose/release.env" &&
        ! -L "${OPS_ROOT}/compose/release.env" ]]; then
    had_previous="yes"
    ops_copy_temporary "${OPS_ROOT}/compose/release.env" "$previous_env" || {
      ops_dispose_temporary_paths "$candidate_env" "$previous_env"
      return 1
    }
    previous_frontend="$(ops_readlink_frontend)" || {
      ops_dispose_temporary_paths "$candidate_env" "$previous_env"
      return 1
    }
  fi

  local candidate_frontend="releases/${version}/frontend"
  OPS_TRANSACTION_HAD_PREVIOUS="$had_previous"
  OPS_TRANSACTION_PREVIOUS_ENV="$previous_env"
  OPS_TRANSACTION_PREVIOUS_FRONTEND="${previous_frontend:-}"
  OPS_TRANSACTION_EXPECTED_DATA="$current_data"
  OPS_TRANSACTION_CANDIDATE_ENV_DIGEST="$candidate_env_digest"
  OPS_TRANSACTION_CANDIDATE_FRONTEND="$candidate_frontend"
  ops_transaction_ref_capture \
    app-environment "${OPS_ROOT}/compose/release.env" file 600 || return
  ops_transaction_ref_capture \
    app-frontend "${OPS_ROOT}/current-frontend" symlink || return
  if [[ "$had_previous" == "yes" ]]; then
    ops_transaction_capture_secondary \
      "${OPS_ROOT}/compose/previous-app.json" \
      "${OPS_ROOT}/recovery/.previous-app-before.XXXXXXXX" \
      600 || return
  fi
  if [[ "$OPS_TRANSACTION_ACTIVE" == "yes" ]]; then
    ops_transaction_transition "app" || return
  else
    ops_transaction_arm "install" "$run_id" "app" || return
  fi
  ops_transaction_publish_tracked_file app-environment "$candidate_env" || {
      local switch_result=1
      ops_transaction_compensate_now \
        "APP_SWITCH_FAILED" "APP_COMPENSATION_FAILED" ||
        switch_result="$OPS_MANUAL_RECOVERY_EXIT"
      ops_dispose_temporary_paths "$candidate_env" "$previous_env"
      return "$switch_result"
    }
  ops_dispose_temporary_paths "$candidate_env"
  if ! ops_restart_api || ! ops_wait_healthy "$current_data"; then
    if [[ "$had_previous" == "yes" ]] &&
      ops_restore_app_refs "$previous_env" "$previous_frontend" "$current_data" "no"; then
      ops_transaction_disarm
      ops_dispose_temporary_paths "$previous_env"
      ops_emit_failure "APP_ACTIVATION_FAILED" "readiness" || true
      return 1
    fi
    if ! ops_stop_api_with_env "${OPS_ROOT}/compose/release.env" &&
      [[ "$had_previous" == "no" ]]; then
      ops_dispose_temporary_paths "$previous_env"
      ops_record_manual_recovery \
        "$run_id" "install" "APP_ACTIVATION_FAILED" \
        "CANDIDATE_STOP_FAILED" || true
      ops_transaction_disarm
      return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    if [[ "$had_previous" == "no" ]]; then
      ops_remove_first_install_environment "$candidate_env_digest" || {
        ops_transaction_disarm
        ops_dispose_temporary_paths "$previous_env"
        return "$OPS_MANUAL_RECOVERY_EXIT"
      }
      ops_transaction_disarm
      ops_dispose_temporary_paths "$previous_env"
      ops_emit_failure "APP_ACTIVATION_FAILED" "readiness" || true
      return 1
    fi
    ops_dispose_temporary_paths "$previous_env"
    ops_record_manual_recovery \
      "$run_id" "install" "APP_ACTIVATION_FAILED" \
      "APP_ROLLBACK_FAILED" || true
    ops_transaction_disarm
    ops_emit_failure "APP_AND_ROLLBACK_FAILED" "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi

  if ! ops_transaction_publish_tracked_symlink \
    app-frontend "$candidate_frontend"; then
    local frontend_result=1
    ops_transaction_compensate_now \
      "FRONTEND_SWITCH_FAILED" "APP_COMPENSATION_FAILED" ||
      frontend_result="$OPS_MANUAL_RECOVERY_EXIT"
    ops_dispose_temporary_paths "$previous_env"
    if [[ "$frontend_result" -eq 1 ]]; then
      ops_emit_failure "FRONTEND_SWITCH_FAILED" "frontend" || true
    fi
    return "$frontend_result"
  fi
  if [[ "$had_previous" == "yes" ]]; then
    ops_persist_previous_app "$previous_env" "$previous_frontend" || {
      if ops_restore_app_refs \
        "$previous_env" "$previous_frontend" "$current_data" "yes" &&
        ops_transaction_restore_secondary; then
        ops_transaction_disarm
        ops_dispose_temporary_paths "$previous_env"
        ops_emit_failure "RECOVERY_STATE_FAILED" "commit" || true
        return 1
      fi
      ops_dispose_temporary_paths "$previous_env"
      ops_record_manual_recovery \
        "$run_id" "install" "RECOVERY_STATE_FAILED" \
        "APP_ROLLBACK_FAILED" || true
      ops_transaction_disarm
      ops_emit_failure "RECOVERY_AND_ROLLBACK_FAILED" "manual-recovery" || true
      return "$OPS_MANUAL_RECOVERY_EXIT"
    }
  fi
  if ! ops_compose up -d --no-deps prometheus; then
    ops_emit_failure "PROMETHEUS_START_FAILED" "monitoring" || true
  fi
  local ended
  ended="$(ops_now_seconds)" || return
  ops_log_result "install" "$run_id" "succeeded" "$((ended - started))" || return
  ops_transaction_disarm
  ops_dispose_temporary_paths "$previous_env"
}

ops_updater_status() {
  local field="$1"
  local jq
  jq="$(ops_command jq)" || return
  local status="${OPS_ROOT}/data/update-status.json"
  ops_require_canonical_json "$status" "updater" || return
  if ! "$jq" -e '
    def timestamp:
      type == "string" and
      test("^(?!0000)[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{1,6})?Z$");
    def data_version:
      . == null or
      (type == "string" and test("^dv1-[0-9a-f]{64}$"));
    def phase:
      IN("preflight","acquisition","identity","build","manifest","smoke","publication","complete");
    def base_record:
      type == "object" and
      (keys == [
        "dataVersion",
        "duration_seconds",
        "error_code",
        "phase",
        "status",
        "time"
      ]) and
      (.time | timestamp) and
      (.phase | phase) and
      (.duration_seconds | type == "number" and . >= 0) and
      (.dataVersion | data_version) and
      (.status | IN("canceled","failed","no-change","published")) and
      (
        if .status == "canceled" then .error_code == "CANCELED"
        elif .status == "failed" then
          (.error_code | type == "string" and
            test("^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$") and
            . != "CANCELED")
        else .error_code == null
        end
      );
    def success_record:
      base_record and
      (.status | IN("no-change","published")) and
      .error_code == null;
    type == "object" and
    (keys == ["last_attempt","last_success"]) and
    (.last_attempt | base_record) and
    (.last_success == null or (.last_success | success_record))
  ' "$status" >/dev/null; then
    ops_fail "UPDATE_STATUS_INVALID" "updater"
    return
  fi
  case "$field" in
    status) "$jq" -er '.last_attempt.status' "$status" ;;
    dataVersion) "$jq" -er '.last_attempt.dataVersion' "$status" ;;
    *)
      ops_fail "UPDATE_STATUS_FIELD_INVALID" "updater"
      return
      ;;
  esac
}

ops_run_updater() {
  local output="$1"
  local environment_file="${2:-${OPS_ROOT}/compose/release.env}"
  local run_id="${3:-$OPS_TRANSACTION_RUN_ID}"
  if ! ops_is_run_id "$run_id"; then
    ops_fail "UPDATER_RUN_ID_INVALID" "updater"
    return
  fi
  ops_load_release_env "$environment_file" || return
  local timeout nice ionice docker
  timeout="$(ops_command timeout)" || return
  nice="$(ops_command nice)" || return
  ionice="$(ops_command ionice)" || return
  docker="$(ops_command docker)" || return
  local container_name="${OPS_PROJECT}-updater-${run_id}"
  if [[ ! "$container_name" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]]; then
    ops_fail "UPDATER_CONTAINER_NAME_INVALID" "updater"
    return
  fi
  local collisions name_collisions
  collisions="$("$docker" ps -aq \
    --filter "label=com.docker.compose.project=${OPS_PROJECT}" \
    --filter "label=com.docker.compose.service=updater")" || return
  name_collisions="$("$docker" ps -aq \
    --filter "name=^/${container_name}$")" || return
  if [[ -n "$collisions" || -n "$name_collisions" ]]; then
    ops_fail "UPDATER_CONTAINER_COLLISION" "updater"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local container_id="" creation_result=0
  ops_creation_guard_begin || return
  OPS_TRANSACTION_UPDATER_CONTAINER_STATE="intent"
  OPS_TRANSACTION_UPDATER_CONTAINER_NAME="$container_name"
  container_id="$(
    "$docker" compose \
      --project-name "$OPS_PROJECT" \
      --file "${OPS_ROOT}/compose/compose.yaml" \
      --env-file "$environment_file" \
      --profile oneshot \
      run --detach --no-deps \
      --name "$container_name" \
      --label "fun.bgmss.run-id=${run_id}" \
      updater
  )" || creation_result=$?
  if [[ "$creation_result" -eq 0 &&
        ! "$container_id" =~ ^[0-9a-f]{64}$ ]]; then
    creation_result="$OPS_MANUAL_RECOVERY_EXIT"
  fi
  if [[ "$creation_result" -eq 0 ]]; then
    OPS_TRANSACTION_UPDATER_CONTAINER_ID="$container_id"
    ops_seal_updater_container \
      "$container_id" "$container_name" "$run_id" || creation_result=$?
  fi
  ops_creation_guard_end
  if [[ "$creation_result" -ne 0 ]]; then
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi

  local result=0 wait_status=""
  wait_status="$(
    "$timeout" --signal=TERM --kill-after=30s "$OPS_UPDATE_TIMEOUT_SECONDS" \
      "$nice" -n 10 \
      "$ionice" -c 2 -n 7 \
      "$docker" wait "$container_id"
  )" || result=$?
  if [[ "$result" -eq 0 ]]; then
    if [[ "$wait_status" =~ ^(0|[1-9][0-9]{0,2})$ &&
          "$wait_status" -le 255 ]]; then
      result="$wait_status"
    else
      result=1
    fi
  fi
  local logs_result=0 cleanup_result=0
  (
    ulimit -f 2048
    "$docker" logs "$container_id"
  ) > "$output" 2>&1 || logs_result=$?
  ops_stop_updater_containers || cleanup_result=$?
  if [[ ! -f "$output" || -L "$output" ||
        "$(ops_stat_value '%s' "$output")" -gt \
          "$OPS_UPDATER_OUTPUT_MAX_BYTES" ]]; then
    ops_fail "UPDATER_OUTPUT_LIMIT" "updater"
    return 1
  fi
  if [[ "$cleanup_result" -ne 0 ]]; then
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  if [[ "$logs_result" -ne 0 && "$result" -eq 0 ]]; then
    result="$logs_result"
  fi
  return "$result"
}

ops_write_current_candidate() {
  local destination="$1"
  local data_version="$2"
  local manifest_digest="$3"
  local jq
  jq="$(ops_command jq)" || return
  "$jq" -cnS \
    --arg dataVersion "$data_version" \
    --arg manifestDigest "$manifest_digest" \
    '{
      dataVersion:$dataVersion,
      manifestDigest:$manifestDigest,
      pointerSchemaVersion:1
    }' > "$destination" || {
      ops_dispose_temporary_paths "$destination"
      ops_fail "CURRENT_CANDIDATE_BUILD_FAILED" "switch"
      return
    }
  chmod 600 "$destination" || return
}

ops_emit_update_activated() {
  local run_id="$1"
  local app_version="$2"
  local old_data="$3"
  local new_data="$4"
  local duration="$5"
  local jq
  jq="$(ops_command jq)" || return
  "$jq" -cnS \
    --arg app_version "$app_version" \
    --arg event "update_activated" \
    --arg new_data_version "$new_data" \
    --arg old_data_version "$old_data" \
    --arg run_id "$run_id" \
    --argjson duration_seconds "$duration" \
    '{
      app_version:$app_version,
      duration_seconds:$duration_seconds,
      event:$event,
      new_data_version:$new_data_version,
      old_data_version:$old_data_version,
      run_id:$run_id
    }'
}

ops_verify_candidate_version_directory() {
  local directory="$1"
  local data_version="${directory##*/}"
  if ! ops_is_data_version "$data_version" ||
    [[ ! -d "$directory" || -L "$directory" ||
       "$(ops_stat_value '%u:%g' "$directory")" != \
         "${OPS_UPDATER_UID}:${OPS_RUNTIME_GID}" ]]; then
    ops_fail "CANDIDATE_DATA_VERSION_INVALID" "activation"
    return
  fi
  local directory_mode
  directory_mode="$(ops_stat_value '%a' "$directory")" || return
  if (( (8#$directory_mode & 0022) != 0 )); then
    ops_fail "CANDIDATE_DATA_VERSION_MODE" "activation"
    return
  fi
  local candidate name count=0 mode
  shopt -s nullglob dotglob
  for candidate in "$directory"/*; do
    name="${candidate##*/}"
    case "$name" in
      bangumi.sqlite|manifest.json) ;;
      *)
        shopt -u nullglob dotglob
        ops_fail "CANDIDATE_DATA_VERSION_ENTRY" "activation"
        return
        ;;
    esac
    if [[ ! -f "$candidate" || -L "$candidate" ||
          "$(ops_stat_value '%u:%g:%h:%d' "$candidate")" != \
            "${OPS_UPDATER_UID}:${OPS_RUNTIME_GID}:1:$(ops_stat_value '%d' "$directory")" ]]; then
      shopt -u nullglob dotglob
      ops_fail "CANDIDATE_DATA_VERSION_FILE" "activation"
      return
    fi
    mode="$(ops_stat_value '%a' "$candidate")" || return
    if (( (8#$mode & 0022) != 0 )); then
      shopt -u nullglob dotglob
      ops_fail "CANDIDATE_DATA_VERSION_FILE_MODE" "activation"
      return
    fi
    count=$((count + 1))
  done
  shopt -u nullglob dotglob
  if [[ "$count" -ne 2 ]]; then
    ops_fail "CANDIDATE_DATA_VERSION_INCOMPLETE" "activation"
    return
  fi
}

ops_freeze_version_directory() {
  local data_version="$1"
  local directory="${OPS_ROOT}/data/versions/${data_version}"
  ops_verify_candidate_version_directory "$directory" || return
  local chmod chown sync
  chmod="$(ops_command chmod)" || return
  chown="$(ops_command chown)" || return
  sync="$(ops_command sync)" || return
  "$chmod" 0440 \
    "${directory}/bangumi.sqlite" \
    "${directory}/manifest.json" || {
      ops_fail "DATA_VERSION_FREEZE_FAILED" "activation"
      return
    }
  "$chmod" 0550 "$directory" || {
    ops_fail "DATA_VERSION_FREEZE_FAILED" "activation"
    return
  }
  "$chown" \
    "${OPS_ROOT_UID}:${OPS_RUNTIME_GID}" \
    "${directory}/bangumi.sqlite" \
    "${directory}/manifest.json" \
    "$directory" || {
      ops_fail "DATA_VERSION_FREEZE_FAILED" "activation"
      return
    }
  "$sync" -f -- "${directory}/bangumi.sqlite" || return
  "$sync" -f -- "${directory}/manifest.json" || return
  "$sync" -f -- "$directory" || return
  ops_verify_version_directory "$directory"
}

ops_record_managed_data_version() {
  local data_version="$1"
  local manifest_digest="$2"
  local run_id="$3"
  local directory="${OPS_ROOT}/data/versions/${data_version}"
  local marker="${OPS_ROOT}/recovery/data/${data_version}.json"
  if [[ -e "$marker" || -L "$marker" ]]; then
    ops_fail "DATA_OWNERSHIP_COLLISION" "activation"
    return
  fi
  ops_freeze_version_directory "$data_version" || return
  local sqlite_digest
  sqlite_digest="$(ops_sha256_file "${directory}/bangumi.sqlite")" || return
  local jq temporary
  jq="$(ops_command jq)" || return
  ops_make_temporary_file \
    temporary "${OPS_ROOT}/recovery/.managed-data-${run_id}.XXXXXXXX" || return
  "$jq" -cnS \
    --arg dataVersion "$data_version" \
    --arg directoryDevice "$(ops_stat_value '%d' "$directory")" \
    --arg directoryInode "$(ops_stat_value '%i' "$directory")" \
    --arg directoryMode "$(ops_stat_value '%a' "$directory")" \
    --arg directoryOwner "$(ops_stat_value '%u:%g' "$directory")" \
    --arg manifestDevice "$(ops_stat_value '%d' "${directory}/manifest.json")" \
    --arg manifestDigest "$manifest_digest" \
    --arg manifestInode "$(ops_stat_value '%i' "${directory}/manifest.json")" \
    --arg manifestMode "$(ops_stat_value '%a' "${directory}/manifest.json")" \
    --arg manifestOwner "$(ops_stat_value '%u:%g' "${directory}/manifest.json")" \
    --arg manifestSize "$(ops_stat_value '%s' "${directory}/manifest.json")" \
    --arg runId "$run_id" \
    --arg sqliteDevice "$(ops_stat_value '%d' "${directory}/bangumi.sqlite")" \
    --arg sqliteDigest "$sqlite_digest" \
    --arg sqliteInode "$(ops_stat_value '%i' "${directory}/bangumi.sqlite")" \
    --arg sqliteMode "$(ops_stat_value '%a' "${directory}/bangumi.sqlite")" \
    --arg sqliteOwner "$(ops_stat_value '%u:%g' "${directory}/bangumi.sqlite")" \
    --arg sqliteSize "$(ops_stat_value '%s' "${directory}/bangumi.sqlite")" \
    '{
      dataVersion:$dataVersion,
      directoryDevice:$directoryDevice,
      directoryInode:$directoryInode,
      directoryMode:$directoryMode,
      directoryOwner:$directoryOwner,
      manifestDevice:$manifestDevice,
      manifestDigest:$manifestDigest,
      manifestInode:$manifestInode,
      manifestMode:$manifestMode,
      manifestOwner:$manifestOwner,
      manifestSize:$manifestSize,
      runId:$runId,
      schemaVersion:"managed-data-version-v1",
      sqliteDevice:$sqliteDevice,
      sqliteDigest:$sqliteDigest,
      sqliteInode:$sqliteInode,
      sqliteMode:$sqliteMode,
      sqliteOwner:$sqliteOwner,
      sqliteSize:$sqliteSize
    }' > "$temporary" || {
      ops_dispose_temporary_paths "$temporary"
      ops_fail "DATA_OWNERSHIP_MARKER_BUILD_FAILED" "activation"
      return
    }
  local result=0
  ops_atomic_replace_file "$temporary" "$marker" 400 0 0 || result=$?
  ops_dispose_temporary_paths "$temporary"
  return "$result"
}

ops_verify_managed_data_version() {
  local data_version="$1"
  local directory="${OPS_ROOT}/data/versions/${data_version}"
  local marker="${OPS_ROOT}/recovery/data/${data_version}.json"
  local jq
  jq="$(ops_command jq)" || return
  ops_require_regular_file "$marker" 0 0 400 || return
  ops_require_canonical_json "$marker" "cleanup" || return
  if
    ! "$jq" -e --arg data "$data_version" '
      type == "object" and
      (keys == [
        "dataVersion",
        "directoryDevice",
        "directoryInode",
        "directoryMode",
        "directoryOwner",
        "manifestDevice",
        "manifestDigest",
        "manifestInode",
        "manifestMode",
        "manifestOwner",
        "manifestSize",
        "runId",
        "schemaVersion",
        "sqliteDevice",
        "sqliteDigest",
        "sqliteInode",
        "sqliteMode",
        "sqliteOwner",
        "sqliteSize"
      ]) and
      .schemaVersion == "managed-data-version-v1" and
      .dataVersion == $data and
      (.directoryDevice | test("^[0-9]+$")) and
      (.directoryInode | test("^[0-9]+$")) and
      .directoryMode == "550" and
      .directoryOwner == "0:65532" and
      (.manifestDevice | test("^[0-9]+$")) and
      (.manifestDigest | test("^sha256:[0-9a-f]{64}$")) and
      (.manifestInode | test("^[0-9]+$")) and
      .manifestMode == "440" and
      .manifestOwner == "0:65532" and
      (.manifestSize | test("^[0-9]+$")) and
      (.sqliteDevice | test("^[0-9]+$")) and
      (.sqliteDigest | test("^sha256:[0-9a-f]{64}$")) and
      (.sqliteInode | test("^[0-9]+$")) and
      .sqliteMode == "440" and
      .sqliteOwner == "0:65532" and
      (.sqliteSize | test("^[0-9]+$")) and
      (.runId | test("^run-[0-9a-f]{32}$"))
    ' "$marker" >/dev/null; then
    ops_fail "DATA_OWNERSHIP_MARKER_INVALID" "cleanup"
    return
  fi
  ops_verify_version_directory "$directory" || return
  if [[ "$(ops_stat_value '%d' "$directory")" != \
          "$(ops_manifest_value "$marker" '.directoryDevice')" ||
        "$(ops_stat_value '%i' "$directory")" != \
          "$(ops_manifest_value "$marker" '.directoryInode')" ||
        "$(ops_stat_value '%a' "$directory")" != \
          "$(ops_manifest_value "$marker" '.directoryMode')" ||
        "$(ops_stat_value '%u:%g' "$directory")" != \
          "$(ops_manifest_value "$marker" '.directoryOwner')" ||
        "$(ops_stat_value '%d' "${directory}/manifest.json")" != \
          "$(ops_manifest_value "$marker" '.manifestDevice')" ||
        "$(ops_stat_value '%i' "${directory}/manifest.json")" != \
          "$(ops_manifest_value "$marker" '.manifestInode')" ||
        "$(ops_stat_value '%a' "${directory}/manifest.json")" != \
          "$(ops_manifest_value "$marker" '.manifestMode')" ||
        "$(ops_stat_value '%u:%g' "${directory}/manifest.json")" != \
          "$(ops_manifest_value "$marker" '.manifestOwner')" ||
        "$(ops_stat_value '%s' "${directory}/manifest.json")" != \
          "$(ops_manifest_value "$marker" '.manifestSize')" ||
        "$(ops_sha256_file "${directory}/manifest.json")" != \
          "$(ops_manifest_value "$marker" '.manifestDigest')" ||
        "$(ops_stat_value '%d' "${directory}/bangumi.sqlite")" != \
          "$(ops_manifest_value "$marker" '.sqliteDevice')" ||
        "$(ops_stat_value '%i' "${directory}/bangumi.sqlite")" != \
          "$(ops_manifest_value "$marker" '.sqliteInode')" ||
        "$(ops_stat_value '%a' "${directory}/bangumi.sqlite")" != \
          "$(ops_manifest_value "$marker" '.sqliteMode')" ||
        "$(ops_stat_value '%u:%g' "${directory}/bangumi.sqlite")" != \
          "$(ops_manifest_value "$marker" '.sqliteOwner')" ||
        "$(ops_stat_value '%s' "${directory}/bangumi.sqlite")" != \
          "$(ops_manifest_value "$marker" '.sqliteSize')" ||
        "$(ops_sha256_file "${directory}/bangumi.sqlite")" != \
          "$(ops_manifest_value "$marker" '.sqliteDigest')" ]]; then
    ops_fail "DATA_OWNERSHIP_IDENTITY_CHANGED" "cleanup"
    return
  fi
}

ops_record_manual_recovery() {
  local run_id="$1"
  local action="$2"
  local primary="$3"
  local secondary="$4"
  local jq
  jq="$(ops_command jq)" || return
  local temporary
  ops_make_temporary_file \
    temporary "${OPS_ROOT}/recovery/.manual-${run_id}.XXXXXXXX" || return
  "$jq" -cnS \
    --arg action "$action" \
    --arg primary "$primary" \
    --arg runId "$run_id" \
    --arg secondary "$secondary" \
    '{
      action:$action,
      event:"manual_recovery_required",
      primaryCode:$primary,
      runId:$runId,
      secondaryCode:$secondary
    }' > "$temporary" || {
      ops_dispose_temporary_paths "$temporary"
      ops_fail "MANUAL_RECOVERY_BUILD_FAILED" "manual-recovery"
      return
    }
  local result=0
  ops_atomic_replace_file \
    "$temporary" \
    "${OPS_ROOT}/recovery/manual-${run_id}.json" \
    400 0 0 || result=$?
  ops_dispose_temporary_paths "$temporary"
  return "$result"
}

ops_write_version_identity() {
  local destination="$1"
  local find sort
  find="$(ops_command find)" || return
  sort="$(ops_command sort)" || return
  : > "$destination" || return
  local candidate relative kind digest
  while IFS= read -r -d '' candidate; do
    relative="${candidate#${OPS_ROOT}/data/versions/}"
    if [[ -d "$candidate" && ! -L "$candidate" ]]; then
      kind="directory"
      digest="-"
    elif [[ -f "$candidate" && ! -L "$candidate" ]]; then
      kind="file"
      digest="$(ops_sha256_file "$candidate")" || return
    else
      ops_fail "VERSION_IDENTITY_ENTRY_INVALID" "updater"
      return
    fi
    printf '%s|%s|%s|%s|%s|%s|%s|%s\n' \
      "$relative" \
      "$kind" \
      "$(ops_stat_value '%d' "$candidate")" \
      "$(ops_stat_value '%i' "$candidate")" \
      "$(ops_stat_value '%u:%g' "$candidate")" \
      "$(ops_stat_value '%a' "$candidate")" \
      "$(ops_stat_value '%h:%s' "$candidate")" \
      "$digest" >> "$destination" || return
  done < <("$find" "${OPS_ROOT}/data/versions" -mindepth 1 -xdev -print0 |
    "$sort" -z)
}

ops_require_no_updater_stage() {
  local candidate
  shopt -s nullglob dotglob
  for candidate in "${OPS_ROOT}/data"/.bgmss-stage-*; do
    shopt -u nullglob dotglob
    ops_emit_failure "UPDATER_STAGE_PRESERVED" "residue" || true
    return 1
  done
  shopt -u nullglob dotglob
}

ops_current_api_identity() {
  local container_id
  container_id="$(ops_compose ps -q api)" || return
  if [[ ! "$container_id" =~ ^[0-9a-f]{12,64}$ ]]; then
    ops_fail "API_CONTAINER_ID_INVALID" "updater"
    return
  fi
  printf '%s\n' "$container_id"
}

ops_verify_updater_unchanged() {
  local before_versions="$1"
  local expected_current="$2"
  local expected_api="$3"
  local expected_data="$4"
  local after_versions cmp
  cmp="$(ops_command cmp)" || return
  ops_make_temporary_file \
    after_versions "${OPS_ROOT}/recovery/.versions-after.XXXXXXXX" || return
  ops_write_version_identity "$after_versions" || return
  local result=0
  if [[ "$(ops_stat_value '%d:%i' "${OPS_ROOT}/data/current.json"):$(ops_sha256_file "${OPS_ROOT}/data/current.json")" != \
        "$expected_current" ]] ||
    ! "$cmp" --silent "$before_versions" "$after_versions" ||
    [[ "$(ops_current_api_identity)" != "$expected_api" ]] ||
    ! ops_require_no_updater_stage ||
    ! ops_wait_healthy "$expected_data"; then
    result=1
  fi
  ops_dispose_temporary_paths "$after_versions"
  if [[ "$result" -ne 0 ]]; then
    ops_emit_failure "UPDATER_STATE_DRIFT" "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
}

ops_verify_published_version_delta() {
  local before_versions="$1"
  local new_data="$2"
  local after_versions
  ops_make_temporary_file \
    after_versions "${OPS_ROOT}/recovery/.versions-after.XXXXXXXX" || return
  ops_write_version_identity "$after_versions" || return
  local grep
  grep="$(ops_command grep)" || return
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    if ! "$grep" -Fqx -- "$line" "$after_versions"; then
      ops_dispose_temporary_paths "$after_versions"
      ops_fail "EXISTING_DATA_VERSION_CHANGED" "activation"
      return
    fi
  done < "$before_versions"
  local candidate name added=0
  shopt -s nullglob dotglob
  for candidate in "${OPS_ROOT}/data/versions"/*; do
    name="${candidate##*/}"
    if [[ "$name" == "$new_data" ]]; then
      ops_verify_candidate_version_directory "$candidate" || {
        shopt -u nullglob dotglob
        ops_dispose_temporary_paths "$after_versions"
        return 1
      }
      added=$((added + 1))
    else
      ops_verify_version_directory "$candidate" || {
        shopt -u nullglob dotglob
        ops_dispose_temporary_paths "$after_versions"
        return 1
      }
    fi
  done
  shopt -u nullglob dotglob
  ops_dispose_temporary_paths "$after_versions"
  if [[ "$added" -ne 1 ]] || ! ops_require_no_updater_stage; then
    ops_fail "PUBLISHED_VERSION_DELTA_INVALID" "activation"
    return
  fi
}

ops_update_archive() {
  local run_id="$1"
  local started
  started="$(ops_now_seconds)" || return
  ops_load_release_env "${OPS_ROOT}/compose/release.env" || return
  OPS_MANIFEST=(
    [appRevision]="${OPS_RELEASE_ENV[BGMSS_APP_REVISION]}"
    [appVersion]="${OPS_RELEASE_ENV[BGMSS_APP_VERSION]}"
    [archiveSmokeDigest]="$(ops_manifest_value \
      "${OPS_RELEASE_ENV[BGMSS_RELEASE_ROOT]}/release-manifest.json" \
      '.assets.archiveSmoke.sha256')"
    [releaseRoot]="${OPS_RELEASE_ENV[BGMSS_RELEASE_ROOT]}"
  )
  ops_verify_data_inventory || return
  local old_current_digest old_data
  old_current_digest="$(ops_sha256_file "${OPS_ROOT}/data/current.json")" || return
  old_data="$(ops_read_current_field "${OPS_ROOT}/data/current.json" dataVersion)" || return
  ops_require_no_updater_stage || return
  local before_versions current_identity api_identity
  local app_env_identity app_front_identity
  app_env_identity="$(ops_sha256_file \
    "${OPS_ROOT}/compose/release.env")" || return
  app_front_identity="$(ops_readlink_frontend)" || return
  ops_make_temporary_file \
    before_versions "${OPS_ROOT}/recovery/.versions-before.XXXXXXXX"
  ops_write_version_identity "$before_versions" || {
    ops_dispose_temporary_paths "$before_versions"
    return 1
  }
  current_identity="$(ops_stat_value '%d:%i' "${OPS_ROOT}/data/current.json"):${old_current_digest}"
  api_identity="$(ops_current_api_identity)" || {
    ops_dispose_temporary_paths "$before_versions"
    return 1
  }

  local output
  ops_make_temporary_file \
    output "${OPS_ROOT}/recovery/.updater-output.XXXXXXXX"
  OPS_TRANSACTION_BEFORE_VERSIONS="$before_versions"
  OPS_TRANSACTION_CURRENT_IDENTITY="$current_identity"
  OPS_TRANSACTION_API_IDENTITY="$api_identity"
  OPS_TRANSACTION_EXPECTED_DATA="$old_data"
  OPS_TRANSACTION_APP_ENV_DIGEST="$app_env_identity"
  OPS_TRANSACTION_APP_FRONTEND="$app_front_identity"
  ops_transaction_arm "update" "$run_id" "updater" || {
    ops_dispose_temporary_paths "$before_versions" "$output"
    return 1
  }
  local updater_result=0
  ops_run_updater \
    "$output" "${OPS_ROOT}/compose/release.env" "$run_id" ||
    updater_result=$?
  if [[ "$updater_result" -ne 0 ]]; then
    ops_dispose_temporary_paths "$output"
    if [[ "$updater_result" -eq "$OPS_MANUAL_RECOVERY_EXIT" ]]; then
      ops_record_manual_recovery \
        "$run_id" "update" "UPDATER_CONTAINER_UNSAFE" \
        "UPDATER_CONTAINER_PRESERVED" || true
      ops_transaction_disarm
      ops_dispose_temporary_paths "$before_versions"
      return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    ops_verify_updater_unchanged \
      "$before_versions" "$current_identity" "$api_identity" "$old_data" || {
      ops_record_manual_recovery \
        "$run_id" "update" "UPDATER_FAILED" "UPDATER_STATE_DRIFT" || true
      ops_transaction_disarm
      ops_dispose_temporary_paths "$before_versions"
      return "$OPS_MANUAL_RECOVERY_EXIT"
    }
    local failed_status="${OPS_ROOT}/data/update-status.json"
    if [[ -e "$failed_status" ]]; then
      ops_require_regular_file \
        "$failed_status" "$OPS_UPDATER_UID" "$OPS_RUNTIME_GID" 600 || {
        ops_transaction_disarm
        ops_dispose_temporary_paths "$before_versions"
        return "$OPS_MANUAL_RECOVERY_EXIT"
      }
      local terminal_status
      terminal_status="$(ops_updater_status status)" || {
        ops_transaction_disarm
        ops_dispose_temporary_paths "$before_versions"
        return "$OPS_MANUAL_RECOVERY_EXIT"
      }
      if [[ "$terminal_status" != "failed" &&
            "$terminal_status" != "canceled" ]]; then
        ops_dispose_temporary_paths "$before_versions"
        ops_emit_failure "UPDATER_FAILURE_STATUS_INVALID" \
          "manual-recovery" || true
        ops_transaction_disarm
        return "$OPS_MANUAL_RECOVERY_EXIT"
      fi
    fi
    ops_transaction_disarm
    ops_dispose_temporary_paths "$before_versions"
    ops_emit_failure "UPDATER_FAILED" "updater" || true
    return 1
  fi
  ops_dispose_temporary_paths "$output"
  if [[ "$(ops_sha256_file "${OPS_ROOT}/data/current.json")" != "$old_current_digest" ]]; then
    ops_record_manual_recovery \
      "$run_id" "update" "UPDATER_CHANGED_CURRENT" \
      "UPDATER_COMPENSATION_REQUIRED" || true
    ops_transaction_disarm
    ops_dispose_temporary_paths "$before_versions"
    ops_emit_failure "UPDATER_CHANGED_CURRENT" "updater" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local status
  status="$(ops_updater_status status)" || {
    return "$OPS_MANUAL_RECOVERY_EXIT"
  }
  if [[ "$status" == "no-change" ]]; then
    ops_verify_updater_unchanged \
      "$before_versions" "$current_identity" "$api_identity" "$old_data" || {
      ops_record_manual_recovery \
        "$run_id" "update" "UPDATER_NO_CHANGE_INVALID" \
        "UPDATER_STATE_DRIFT" || true
      ops_transaction_disarm
      ops_dispose_temporary_paths "$before_versions"
      return "$OPS_MANUAL_RECOVERY_EXIT"
    }
    ops_transaction_disarm
    ops_dispose_temporary_paths "$before_versions"
    local no_change_ended
    no_change_ended="$(ops_now_seconds)" || return
    ops_log_result "update" "$run_id" "no-change" "$((no_change_ended - started))"
    return 0
  fi
  if [[ "$status" != "published" ]]; then
    ops_verify_updater_unchanged \
      "$before_versions" "$current_identity" "$api_identity" "$old_data" || {
      ops_record_manual_recovery \
        "$run_id" "update" "UPDATER_TERMINAL_FAILURE" \
        "UPDATER_STATE_DRIFT" || true
      ops_transaction_disarm
      ops_dispose_temporary_paths "$before_versions"
      return "$OPS_MANUAL_RECOVERY_EXIT"
    }
    ops_transaction_disarm
    ops_dispose_temporary_paths "$before_versions"
    ops_emit_failure "UPDATER_TERMINAL_FAILURE" "updater" || true
    return 1
  fi

  local new_data new_manifest
  new_data="$(ops_updater_status dataVersion)" || {
    return 1
  }
  if ! ops_is_data_version "$new_data" || [[ "$new_data" == "$old_data" ]]; then
    ops_fail "PUBLISHED_DATA_INVALID" "activation"
    return
  fi
  if [[ "$(ops_current_api_identity)" != "$api_identity" ]] ||
    [[ "$(ops_sha256_file "${OPS_ROOT}/compose/release.env")" != \
      "$app_env_identity" ]] ||
    [[ "$(ops_readlink_frontend)" != "$app_front_identity" ]] ||
    [[ "$(ops_stat_value '%d:%i' "${OPS_ROOT}/data/current.json"):$(ops_sha256_file "${OPS_ROOT}/data/current.json")" != \
      "$current_identity" ]] ||
    ! ops_verify_published_version_delta "$before_versions" "$new_data"; then
    ops_emit_failure "PUBLISHED_STATE_DRIFT" "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  new_manifest="$(ops_verify_archive_version "$new_data")" || return
  OPS_TRANSACTION_PUBLISHED_DATA="$new_data"
  ops_transaction_transition "publishing" || return
  ops_record_managed_data_version \
    "$new_data" "$new_manifest" "$run_id" || return
  ops_transaction_transition "published" || return
  ops_verify_data_inventory || return
  ops_verify_free_space "$OPS_MIN_FREE_KIB" || return
  local current_candidate old_copy
  ops_make_temporary_file \
    current_candidate "${OPS_ROOT}/recovery/.current-candidate.XXXXXXXX"
  ops_make_temporary_file \
    old_copy "${OPS_ROOT}/recovery/.current-previous.XXXXXXXX" || {
    ops_dispose_temporary_paths "$current_candidate"
    return 1
  }
  ops_write_current_candidate "$current_candidate" "$new_data" "$new_manifest" || {
    ops_dispose_temporary_paths "$current_candidate" "$old_copy"
    return 1
  }
  ops_copy_temporary "${OPS_ROOT}/data/current.json" "$old_copy" || {
    ops_dispose_temporary_paths "$current_candidate" "$old_copy"
    return 1
  }
  OPS_TRANSACTION_OLD_CURRENT="$old_copy"
  OPS_TRANSACTION_EXPECTED_DATA="$old_data"
  OPS_TRANSACTION_APP_ENV_DIGEST="$app_env_identity"
  OPS_TRANSACTION_APP_FRONTEND="$app_front_identity"
  ops_transaction_ref_capture \
    data-current "${OPS_ROOT}/data/current.json" file 644 || return
  ops_transaction_capture_secondary \
    "${OPS_ROOT}/data/previous.json" \
    "${OPS_ROOT}/recovery/.previous-data-before.XXXXXXXX" \
    600 || return
  ops_transaction_transition "data" || return
  ops_dispose_temporary_paths "$before_versions"
  ops_transaction_publish_tracked_file data-current "$current_candidate" || {
      local switch_result=1
      ops_transaction_compensate_now \
        "DATA_SWITCH_FAILED" "DATA_COMPENSATION_FAILED" ||
        switch_result="$OPS_MANUAL_RECOVERY_EXIT"
      ops_dispose_temporary_paths "$current_candidate" "$old_copy"
      return "$switch_result"
    }

  if ! ops_restart_api || ! ops_wait_healthy "$new_data"; then
    if ops_transaction_restore_tracked_file data-current "$old_copy" &&
      ops_restart_api &&
      ops_wait_healthy "$old_data"; then
      ops_transaction_disarm
      ops_dispose_temporary_paths "$current_candidate" "$old_copy"
      ops_emit_failure "DATA_ACTIVATION_FAILED" "readiness" || true
      return 1
    fi
    ops_record_manual_recovery \
      "$run_id" "update" "DATA_ACTIVATION_FAILED" "DATA_ROLLBACK_FAILED" || true
    ops_transaction_disarm
    ops_dispose_temporary_paths "$current_candidate" "$old_copy"
    ops_emit_failure "DATA_AND_ROLLBACK_FAILED" "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  ops_transaction_publish_tracked_file secondary "$old_copy" || {
      if ops_transaction_restore_tracked_file data-current "$old_copy" &&
        ops_transaction_restore_secondary &&
        ops_restart_api &&
        ops_wait_healthy "$old_data"; then
        ops_transaction_disarm
        ops_dispose_temporary_paths "$current_candidate" "$old_copy"
        ops_emit_failure "DATA_RECOVERY_STATE_FAILED" "commit" || true
        return 1
      fi
      ops_record_manual_recovery \
        "$run_id" "update" "DATA_RECOVERY_STATE_FAILED" "DATA_ROLLBACK_FAILED" || true
      ops_transaction_disarm
      ops_dispose_temporary_paths "$current_candidate" "$old_copy"
      return "$OPS_MANUAL_RECOVERY_EXIT"
    }
  local ended duration
  ended="$(ops_now_seconds)" || return
  duration="$((ended - started))"
  ops_emit_update_activated \
    "$run_id" \
    "${OPS_RELEASE_ENV[BGMSS_APP_VERSION]}" \
    "$old_data" \
    "$new_data" \
    "$duration" || return
  ops_transaction_disarm
  ops_dispose_temporary_paths "$current_candidate" "$old_copy"
}

ops_read_previous_frontend() {
  local file="${OPS_ROOT}/compose/previous-app.json"
  if [[ ! -f "$file" || -L "$file" ]]; then
    ops_fail "PREVIOUS_FRONTEND_MISSING" "rollback"
    return
  fi
  local jq target
  jq="$(ops_command jq)" || return
  ops_require_canonical_json "$file" "rollback" || return
  if ! "$jq" -e --arg root "$OPS_ROOT" --arg profile "$OPS_PROFILE" '
    type == "object" and
    (keys == ["frontendTarget","releaseEnvironment","schemaVersion"]) and
    .schemaVersion == "previous-app-v1" and
    (.releaseEnvironment | keys == [
      "BGMSS_API_IMAGE",
      "BGMSS_APP_REVISION",
      "BGMSS_APP_VERSION",
      "BGMSS_COMMON_COMMIT",
      "BGMSS_RELEASE_MANIFEST_DIGEST",
      "BGMSS_RELEASE_ROOT",
      "BGMSS_UPDATER_IMAGE"
    ]) and
    (.releaseEnvironment.BGMSS_APP_VERSION |
      test("^v(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)$")) and
    (.releaseEnvironment.BGMSS_APP_REVISION |
      test("^[0-9a-f]{40}$")) and
    (.releaseEnvironment.BGMSS_COMMON_COMMIT |
      test("^[0-9a-f]{40}$")) and
    (.releaseEnvironment.BGMSS_RELEASE_MANIFEST_DIGEST |
      test("^sha256:[0-9a-f]{64}$")) and
    .releaseEnvironment.BGMSS_RELEASE_ROOT ==
      ($root + "/releases/" + .releaseEnvironment.BGMSS_APP_VERSION) and
    .frontendTarget ==
      ("releases/" + .releaseEnvironment.BGMSS_APP_VERSION + "/frontend") and
    (
      if $profile == "production" then
        (.releaseEnvironment.BGMSS_API_IMAGE |
          test("^ghcr\\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$")) and
        (.releaseEnvironment.BGMSS_UPDATER_IMAGE |
          test("^ghcr\\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$"))
      else
        .releaseEnvironment.BGMSS_API_IMAGE ==
          ("localhost/bgmss-ops-validation-api:" +
            .releaseEnvironment.BGMSS_APP_REVISION + "-amd64") and
        .releaseEnvironment.BGMSS_UPDATER_IMAGE ==
          ("localhost/bgmss-ops-validation-updater:" +
            .releaseEnvironment.BGMSS_APP_REVISION + "-amd64")
      end
    )
  ' "$file" >/dev/null; then
    ops_fail "PREVIOUS_APP_STATE_INVALID" "rollback"
    return
  fi
  target="$("$jq" -er '.frontendTarget' "$file")" || return
  if [[ ! "$target" =~ ^releases/v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)/frontend$ ||
        ! -d "${OPS_ROOT}/${target}" || -L "${OPS_ROOT}/${target}" ]]; then
    ops_fail "PREVIOUS_FRONTEND_INVALID" "rollback"
    return
  fi
  printf '%s\n' "$target"
}

ops_materialize_previous_env() {
  local destination="$1"
  ops_read_previous_frontend >/dev/null || return
  local jq
  jq="$(ops_command jq)" || return
  "$jq" -r '
    .releaseEnvironment |
    to_entries |
    sort_by(.key)[] |
    "\(.key)=\(.value)"
  ' "${OPS_ROOT}/compose/previous-app.json" > "$destination" || {
    ops_dispose_temporary_paths "$destination"
    ops_fail "PREVIOUS_ENV_BUILD_FAILED" "rollback"
    return
  }
  chmod 600 "$destination" || return
  ops_load_release_env "$destination"
}

ops_rollback_app() {
  local expected_version="$1"
  local run_id="$2"
  ops_load_release_env "${OPS_ROOT}/compose/release.env" || return
  if [[ "${OPS_RELEASE_ENV[BGMSS_APP_VERSION]}" != "$expected_version" ]]; then
    ops_fail "CURRENT_APP_CHANGED" "rollback"
    return
  fi
  local previous_env
  ops_make_temporary_file \
    previous_env "${OPS_ROOT}/recovery/.previous-env.XXXXXXXX"
  ops_materialize_previous_env "$previous_env" || {
    ops_dispose_temporary_paths "$previous_env"
    return 1
  }
  local rollback_version="${OPS_RELEASE_ENV[BGMSS_APP_VERSION]}"
  local rollback_manifest="${OPS_RELEASE_ENV[BGMSS_RELEASE_MANIFEST_DIGEST]}"
  ops_validate_release_manifest "$rollback_version" "$rollback_manifest" || {
    ops_dispose_temporary_paths "$previous_env"
    return 1
  }
  ops_verify_release_tree || {
    ops_dispose_temporary_paths "$previous_env"
    return 1
  }
  local current_data app_env_before app_front_before rollback_front
  local data_identity
  current_data="$(ops_read_current_field "${OPS_ROOT}/data/current.json" dataVersion)" || {
    ops_dispose_temporary_paths "$previous_env"
    return 1
  }
  ops_verify_archive_version "$current_data" >/dev/null || {
    ops_dispose_temporary_paths "$previous_env"
    return 1
  }
  data_identity="$(
    ops_stat_value '%d:%i' "${OPS_ROOT}/data/current.json"
  ):$(ops_sha256_file "${OPS_ROOT}/data/current.json")" || {
    ops_dispose_temporary_paths "$previous_env"
    return 1
  }
  ops_make_temporary_file \
    app_env_before "${OPS_ROOT}/recovery/.app-before-${run_id}.XXXXXXXX" ||
    return
  ops_copy_temporary "${OPS_ROOT}/compose/release.env" "$app_env_before" || {
    ops_dispose_temporary_paths "$previous_env" "$app_env_before"
    return 1
  }
  app_front_before="$(ops_readlink_frontend)" || {
    ops_dispose_temporary_paths "$previous_env" "$app_env_before"
    return 1
  }
  rollback_front="$(ops_read_previous_frontend)" || {
    ops_dispose_temporary_paths "$previous_env" "$app_env_before"
    return 1
  }

  local rollback_env_digest
  rollback_env_digest="$(ops_sha256_file "$previous_env")" || {
    ops_dispose_temporary_paths "$previous_env" "$app_env_before"
    return 1
  }
  OPS_TRANSACTION_HAD_PREVIOUS="yes"
  OPS_TRANSACTION_PREVIOUS_ENV="$app_env_before"
  OPS_TRANSACTION_PREVIOUS_FRONTEND="$app_front_before"
  OPS_TRANSACTION_EXPECTED_DATA="$current_data"
  OPS_TRANSACTION_CANDIDATE_ENV_DIGEST="$rollback_env_digest"
  OPS_TRANSACTION_CANDIDATE_FRONTEND="$rollback_front"
  ops_transaction_ref_capture \
    app-environment "${OPS_ROOT}/compose/release.env" file 600 || return
  ops_transaction_ref_capture \
    app-frontend "${OPS_ROOT}/current-frontend" symlink || return
  ops_transaction_capture_secondary \
    "${OPS_ROOT}/compose/previous-app.json" \
    "${OPS_ROOT}/recovery/.previous-app-before.XXXXXXXX" \
    600 || return
  ops_transaction_capture_evidence || return
  ops_transaction_arm "rollback-app" "$run_id" "app" || {
    ops_dispose_temporary_paths "$previous_env" "$app_env_before"
    return 1
  }
  ops_transaction_publish_tracked_file app-environment "$previous_env" || {
      local switch_result=1
      ops_transaction_compensate_now \
        "APP_ROLLBACK_SWITCH_FAILED" "APP_RESTORE_FAILED" ||
        switch_result="$OPS_MANUAL_RECOVERY_EXIT"
      ops_dispose_temporary_paths "$previous_env" "$app_env_before"
      return "$switch_result"
    }
  if ! ops_restart_api || ! ops_wait_healthy "$current_data"; then
    ops_restore_app_refs "$app_env_before" "$app_front_before" "$current_data" "no" || {
      ops_record_manual_recovery \
        "$run_id" "rollback-app" "APP_ROLLBACK_FAILED" "APP_RESTORE_FAILED" || true
      ops_transaction_disarm
      ops_dispose_temporary_paths "$previous_env" "$app_env_before"
      return "$OPS_MANUAL_RECOVERY_EXIT"
    }
    ops_transaction_disarm
    ops_dispose_temporary_paths "$previous_env" "$app_env_before"
    ops_emit_failure "APP_ROLLBACK_FAILED" "rollback" || true
    return 1
  fi
  if ! ops_transaction_publish_tracked_symlink \
    app-frontend "$rollback_front"; then
    local frontend_result=1
    ops_transaction_compensate_now \
      "FRONTEND_ROLLBACK_FAILED" "APP_RESTORE_FAILED" ||
      frontend_result="$OPS_MANUAL_RECOVERY_EXIT"
    ops_dispose_temporary_paths "$previous_env" "$app_env_before"
    if [[ "$frontend_result" -eq 1 ]]; then
      ops_emit_failure "FRONTEND_ROLLBACK_FAILED" "rollback" || true
    fi
    return "$frontend_result"
  fi
  if [[ "$(ops_stat_value '%d:%i' "${OPS_ROOT}/data/current.json"):$(ops_sha256_file \
      "${OPS_ROOT}/data/current.json")" != "$data_identity" ]] ||
    ! ops_check_bounded_api_logs; then
    if ops_restore_app_refs \
      "$app_env_before" "$app_front_before" "$current_data" "yes"; then
      ops_transaction_disarm
      ops_dispose_temporary_paths "$previous_env" "$app_env_before"
      ops_emit_failure "APP_ROLLBACK_VERIFICATION_FAILED" "rollback" || true
      return 1
    fi
    ops_record_manual_recovery \
      "$run_id" "rollback-app" \
      "APP_ROLLBACK_VERIFICATION_FAILED" "APP_RESTORE_FAILED" || true
    ops_transaction_disarm
    ops_dispose_temporary_paths "$previous_env" "$app_env_before"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  if ! ops_persist_previous_app "$app_env_before" "$app_front_before"; then
    if ops_restore_app_refs \
      "$app_env_before" "$app_front_before" "$current_data" "yes" &&
      ops_transaction_restore_secondary; then
      ops_transaction_disarm
      ops_dispose_temporary_paths "$previous_env" "$app_env_before"
      ops_emit_failure "APP_ROLLBACK_COMMIT_FAILED" "commit" || true
      return 1
    fi
    ops_record_manual_recovery \
      "$run_id" "rollback-app" \
      "APP_ROLLBACK_COMMIT_FAILED" "APP_RESTORE_FAILED" || true
    ops_transaction_disarm
    ops_dispose_temporary_paths "$previous_env" "$app_env_before"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local marker
  ops_make_temporary_file \
    marker "${OPS_ROOT}/recovery/.rollback-${run_id}.XXXXXXXX"
  local jq
  jq="$(ops_command jq)" || return
  "$jq" -cnS \
    --arg runId "$run_id" \
    '{kind:"application",runId:$runId,status:"succeeded"}' > "$marker" || {
    return 1
  }
  if ! ops_transaction_publish_tracked_file evidence "$marker"; then
    local evidence_result=1
    ops_transaction_compensate_now \
      "ROLLBACK_EVIDENCE_FAILED" "APP_RESTORE_FAILED" ||
      evidence_result="$OPS_MANUAL_RECOVERY_EXIT"
    ops_dispose_temporary_paths "$marker" "$app_env_before" "$previous_env"
    return "$evidence_result"
  fi
  ops_log_result "rollback-app" "$run_id" "succeeded" 0 || return
  ops_transaction_disarm
  ops_dispose_temporary_paths "$marker" "$app_env_before" "$previous_env"
}

ops_rollback_data() {
  local expected_data="$1"
  local run_id="$2"
  local current="${OPS_ROOT}/data/current.json"
  local previous="${OPS_ROOT}/data/previous.json"
  local actual_data
  actual_data="$(ops_read_current_field "$current" dataVersion)" || return
  if [[ "$actual_data" != "$expected_data" ]]; then
    ops_fail "CURRENT_DATA_CHANGED" "rollback"
    return
  fi
  local previous_data
  previous_data="$(ops_read_current_field "$previous" dataVersion)" || return
  ops_load_release_env "${OPS_ROOT}/compose/release.env" || return
  OPS_MANIFEST=(
    [appRevision]="${OPS_RELEASE_ENV[BGMSS_APP_REVISION]}"
    [appVersion]="${OPS_RELEASE_ENV[BGMSS_APP_VERSION]}"
    [archiveSmokeDigest]="$(ops_manifest_value \
      "${OPS_RELEASE_ENV[BGMSS_RELEASE_ROOT]}/release-manifest.json" \
      '.assets.archiveSmoke.sha256')"
    [releaseRoot]="${OPS_RELEASE_ENV[BGMSS_RELEASE_ROOT]}"
  )
  ops_verify_archive_version "$previous_data" >/dev/null || return
  local app_identity app_front_identity
  app_identity="$(ops_sha256_file "${OPS_ROOT}/compose/release.env")" || return
  app_front_identity="$(ops_readlink_frontend)" || return
  local old_copy
  ops_make_temporary_file \
    old_copy "${OPS_ROOT}/recovery/.data-before-${run_id}.XXXXXXXX" || return
  ops_copy_temporary "$current" "$old_copy" || {
    ops_dispose_temporary_paths "$old_copy"
    return 1
  }
  if [[ "$(ops_sha256_file "${OPS_ROOT}/compose/release.env")" != \
        "$app_identity" ||
        "$(ops_readlink_frontend)" != "$app_front_identity" ]]; then
    ops_dispose_temporary_paths "$old_copy"
    ops_fail "CROSS_DIMENSION_CHANGE" "rollback"
    return
  fi
  OPS_TRANSACTION_OLD_CURRENT="$old_copy"
  OPS_TRANSACTION_EXPECTED_DATA="$actual_data"
  OPS_TRANSACTION_APP_ENV_DIGEST="$app_identity"
  OPS_TRANSACTION_APP_FRONTEND="$app_front_identity"
  ops_transaction_ref_capture data-current "$current" file 644 || return
  ops_transaction_capture_secondary \
    "$previous" \
    "${OPS_ROOT}/recovery/.previous-data-before.XXXXXXXX" \
    600 || return
  ops_transaction_capture_evidence || return
  ops_transaction_arm "rollback-data" "$run_id" "data" || {
    ops_dispose_temporary_paths "$old_copy"
    return 1
  }
  ops_transaction_publish_tracked_file data-current "$previous" || {
    local switch_result=1
    ops_transaction_compensate_now \
      "DATA_ROLLBACK_SWITCH_FAILED" "DATA_RESTORE_FAILED" ||
      switch_result="$OPS_MANUAL_RECOVERY_EXIT"
    ops_dispose_temporary_paths "$old_copy"
    return "$switch_result"
  }
  if ! ops_restart_api ||
    ! ops_wait_healthy "$previous_data" ||
    ! ops_check_bounded_api_logs; then
    if ops_transaction_restore_tracked_file data-current "$old_copy" &&
      ops_transaction_restore_secondary &&
      ops_restart_api &&
      ops_wait_healthy "$actual_data"; then
      ops_transaction_disarm
      ops_dispose_temporary_paths "$old_copy"
      ops_emit_failure "DATA_ROLLBACK_FAILED" "rollback" || true
      return 1
    fi
    ops_record_manual_recovery \
      "$run_id" "rollback-data" "DATA_ROLLBACK_FAILED" "DATA_RESTORE_FAILED" || true
    ops_transaction_disarm
    ops_dispose_temporary_paths "$old_copy"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  if [[ "$(ops_sha256_file "${OPS_ROOT}/compose/release.env")" != \
        "$app_identity" ||
        "$(ops_readlink_frontend)" != "$app_front_identity" ]]; then
    if ops_transaction_restore_tracked_file data-current "$old_copy" &&
      ops_restart_api &&
      ops_wait_healthy "$actual_data"; then
      ops_transaction_disarm
      ops_dispose_temporary_paths "$old_copy"
      ops_emit_failure "CROSS_DIMENSION_CHANGE" "rollback" || true
      return 1
    fi
    ops_record_manual_recovery \
      "$run_id" "rollback-data" "CROSS_DIMENSION_CHANGE" \
      "DATA_RESTORE_FAILED" || true
    ops_transaction_disarm
    ops_dispose_temporary_paths "$old_copy"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  if ! ops_transaction_publish_tracked_file secondary "$old_copy"; then
    if ops_transaction_restore_tracked_file data-current "$old_copy" &&
      ops_transaction_restore_secondary &&
      ops_restart_api &&
      ops_wait_healthy "$actual_data"; then
      ops_transaction_disarm
      ops_dispose_temporary_paths "$old_copy"
      ops_emit_failure "DATA_ROLLBACK_COMMIT_FAILED" "commit" || true
      return 1
    fi
    ops_record_manual_recovery \
      "$run_id" "rollback-data" \
      "DATA_ROLLBACK_COMMIT_FAILED" "DATA_RESTORE_FAILED" || true
    ops_transaction_disarm
    ops_dispose_temporary_paths "$old_copy"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local marker
  ops_make_temporary_file \
    marker "${OPS_ROOT}/recovery/.rollback-${run_id}.XXXXXXXX"
  local jq
  jq="$(ops_command jq)" || return
  "$jq" -cnS \
    --arg runId "$run_id" \
    '{kind:"data",runId:$runId,status:"succeeded"}' > "$marker" || {
    return 1
  }
  if ! ops_transaction_publish_tracked_file evidence "$marker"; then
    local evidence_result=1
    ops_transaction_compensate_now \
      "ROLLBACK_EVIDENCE_FAILED" "DATA_RESTORE_FAILED" ||
      evidence_result="$OPS_MANUAL_RECOVERY_EXIT"
    ops_dispose_temporary_paths "$marker" "$old_copy"
    return "$evidence_result"
  fi
  ops_log_result "rollback-data" "$run_id" "succeeded" 0 || return
  ops_transaction_disarm
  ops_dispose_temporary_paths "$marker" "$old_copy"
}
