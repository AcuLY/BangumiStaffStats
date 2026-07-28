#!/usr/bin/env bash

set -Eeuo pipefail

readonly OPS_PRODUCTION_ROOT="/srv/bgmss-v2"
readonly OPS_PRODUCTION_PROJECT="bgmss_v2"
readonly OPS_PRODUCTION_PORT="18080"
readonly OPS_VALIDATION_ROOT="/srv/bgmss-ops-validation"
readonly OPS_VALIDATION_PROJECT="bgmss_ops_validation"
readonly OPS_VALIDATION_PORT="19090"
readonly OPS_API_TARGET_PORT="8080"
readonly OPS_API_UID="65532"
readonly OPS_UPDATER_UID="65532"
readonly OPS_RUNTIME_GID="65532"
readonly OPS_ROOT_UID="0"
readonly OPS_LOCK_BUSY_EXIT="75"
readonly OPS_MANUAL_RECOVERY_EXIT="78"
readonly OPS_READY_TIMEOUT_SECONDS="60"
readonly OPS_UPDATE_TIMEOUT_SECONDS="21000"
readonly OPS_API_RSS_LIMIT_KIB="1258291"
readonly OPS_ARCHIVE_STALE_SECONDS="777600"
readonly OPS_MIN_FREE_KIB="1048576"
readonly OPS_PRODUCTION_LOCK_FILE="/run/bgmss-v2.lock"
readonly OPS_RELEASE_MANIFEST_MAX_BYTES="1048576"
readonly OPS_RELEASE_FILE_MAX_BYTES="1073741824"
readonly OPS_RELEASE_TOTAL_MAX_BYTES="1610612736"
readonly OPS_FRONTEND_MEMBER_MAX_BYTES="268435456"
readonly OPS_FRONTEND_EXPANDED_MAX_BYTES="1073741824"
readonly OPS_FRONTEND_MEMBER_MAX_COUNT="20000"
readonly OPS_UPDATER_OUTPUT_MAX_BYTES="1048576"

OPS_ROOT=""
OPS_PROJECT=""
OPS_PORT=""
OPS_PROFILE=""
OPS_COMMAND_DIR=""

ops_sanitize_process() {
  umask 077
  unset BASH_ENV CDPATH ENV GLOBIGNORE IFS KSH_ENV NODE_OPTIONS NODE_PATH \
    PERL5OPT PS4 PYTHONHOME PYTHONINSPECT PYTHONPATH PYTHONSTARTUP RUBYOPT \
    ZDOTDIR
  export LANG="C.UTF-8"
  export LC_ALL="C.UTF-8"
  export PATH="/usr/sbin:/usr/bin:/sbin:/bin"
  export TZ="UTC"
}

ops_init_context() {
  if [[ "$#" -ne 4 ]]; then
    printf '%s\n' "runtime context requires root, project, port, and command directory" >&2
    return 64
  fi
  local root="$1"
  local project="$2"
  local port="$3"
  local command_dir="$4"
  if [[ "$root" == "$OPS_PRODUCTION_ROOT" &&
        "$project" == "$OPS_PRODUCTION_PROJECT" &&
        "$port" == "$OPS_PRODUCTION_PORT" ]]; then
    OPS_PROFILE="production"
  elif [[ "$root" == "$OPS_VALIDATION_ROOT" &&
          "$project" == "$OPS_VALIDATION_PROJECT" &&
          "$port" == "$OPS_VALIDATION_PORT" ]]; then
    OPS_PROFILE="validation"
  else
    printf '%s\n' "runtime tuple is not admitted" >&2
    return 64
  fi
  if [[ "$command_dir" != /* || "$command_dir" == *".."* ||
        ! -d "$command_dir" || -L "$command_dir" ]]; then
    printf '%s\n' "runtime command directory is not canonical" >&2
    return 64
  fi
  OPS_ROOT="$root"
  OPS_PROJECT="$project"
  OPS_PORT="$port"
  OPS_COMMAND_DIR="$command_dir"
  export OPS_ROOT OPS_PROJECT OPS_PORT OPS_PROFILE OPS_COMMAND_DIR
}

ops_command() {
  if [[ "$#" -ne 1 || ! "$1" =~ ^[a-z][a-z0-9-]{0,31}$ ]]; then
    printf '%s\n' "invalid fixed command name" >&2
    return 64
  fi
  local candidate="${OPS_COMMAND_DIR}/$1"
  if [[ ! -f "$candidate" || -L "$candidate" || ! -x "$candidate" ]]; then
    printf '%s\n' "required fixed command is unavailable: $1" >&2
    return 69
  fi
  printf '%s\n' "$candidate"
}

ops_emit_failure() {
  if [[ "$#" -ne 2 || ! "$1" =~ ^[A-Z][A-Z0-9_]{0,63}$ ||
        ! "$2" =~ ^[a-z][a-z0-9-]{0,63}$ ]]; then
    printf '%s\n' '{"code":"INTERNAL_FAILURE","event":"operation_failed","phase":"internal"}' >&2
    return 1
  fi
  local jq
  jq="$(ops_command jq)" || return
  "$jq" -cnS \
    --arg code "$1" \
    --arg phase "$2" \
    '{code:$code,event:"operation_failed",phase:$phase}' >&2
}

ops_fail() {
  local code="$1"
  local phase="$2"
  ops_emit_failure "$code" "$phase" || true
  return 1
}

ops_require_root() {
  if [[ "$EUID" -ne 0 ]]; then
    ops_fail "ROOT_REQUIRED" "admission"
    return
  fi
}

ops_is_version() {
  [[ "$1" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]
}

ops_is_git_oid() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]]
}

ops_is_sha256() {
  [[ "$1" =~ ^sha256:[0-9a-f]{64}$ ]]
}

ops_is_data_version() {
  [[ "$1" =~ ^dv1-[0-9a-f]{64}$ ]]
}

ops_is_run_id() {
  [[ "$1" =~ ^run-[0-9a-f]{32}$ ]]
}

ops_is_digest_image() {
  [[ "$1" =~ ^[a-z0-9][a-z0-9._:/-]{0,254}@sha256:[0-9a-f]{64}$ ]]
}

ops_new_run_id() {
  local od tr
  od="$(ops_command od)" || return
  tr="$(ops_command tr)" || return
  local random_hex
  random_hex="$("$od" -An -N16 -tx1 /dev/urandom | "$tr" -d ' \n')"
  if [[ ! "$random_hex" =~ ^[0-9a-f]{32}$ ]]; then
    ops_fail "RUN_ID_FAILED" "admission"
    return
  fi
  printf 'run-%s\n' "$random_hex"
}

ops_now_seconds() {
  local date
  date="$(ops_command date)" || return
  "$date" +%s
}

ops_lock_file() {
  if [[ "$OPS_PROFILE" == "production" ]]; then
    printf '%s\n' "$OPS_PRODUCTION_LOCK_FILE"
  else
    printf '%s\n' "${OPS_ROOT}/data/updater.lock"
  fi
}

ops_require_absolute_closed_path() {
  local candidate="$1"
  if [[ "$candidate" != /* || "$candidate" == "/" || "$candidate" == *"//"* ||
        "$candidate" == */ || "$candidate" =~ (^|/)\.\.?(/|$) ||
        "$candidate" == *$'\n'* || "$candidate" == *$'\r'* ]]; then
    ops_fail "PATH_NOT_CLOSED" "path"
    return
  fi
}

ops_require_below_root() {
  local candidate="$1"
  ops_require_absolute_closed_path "$candidate" || return
  case "$candidate" in
    "$OPS_ROOT"/*) ;;
    *)
      ops_fail "PATH_ESCAPES_ROOT" "path"
      return
      ;;
  esac
}

ops_require_no_symlink_chain() {
  local candidate="$1"
  ops_require_absolute_closed_path "$candidate" || return
  local current="/"
  local remainder="${candidate#/}"
  local segment
  local -a segments=()
  IFS='/' read -r -a segments <<< "$remainder"
  for segment in "${segments[@]}"; do
    current="${current%/}/$segment"
    if [[ -L "$current" ]]; then
      ops_fail "SYMLINK_TRAVERSAL" "path"
      return
    fi
    if [[ ! -e "$current" ]]; then
      return 0
    fi
  done
}

ops_stat_value() {
  local format="$1"
  local candidate="$2"
  local stat
  stat="$(ops_command stat)" || return
  "$stat" -Lc "$format" -- "$candidate"
}

ops_lstat_value() {
  local format="$1"
  local candidate="$2"
  local stat
  stat="$(ops_command stat)" || return
  "$stat" -c "$format" -- "$candidate"
}

ops_require_directory() {
  local candidate="$1"
  local uid="$2"
  local gid="$3"
  local mode="$4"
  ops_require_no_symlink_chain "$candidate" || return
  if [[ ! -d "$candidate" || -L "$candidate" ]]; then
    ops_fail "DIRECTORY_REQUIRED" "path"
    return
  fi
  if [[ "$(ops_stat_value '%u' "$candidate")" != "$uid" ||
        "$(ops_stat_value '%g' "$candidate")" != "$gid" ||
        "$(ops_stat_value '%a' "$candidate")" != "$mode" ]]; then
    ops_fail "DIRECTORY_OWNERSHIP_MODE" "path"
    return
  fi
}

ops_require_regular_file() {
  local candidate="$1"
  local uid="$2"
  local gid="$3"
  local mode="$4"
  ops_require_no_symlink_chain "$candidate" || return
  if [[ ! -f "$candidate" || -L "$candidate" ]]; then
    ops_fail "REGULAR_FILE_REQUIRED" "path"
    return
  fi
  local links
  links="$(ops_stat_value '%h' "$candidate")" || return
  if [[ "$links" != "1" ||
        "$(ops_stat_value '%u' "$candidate")" != "$uid" ||
        "$(ops_stat_value '%g' "$candidate")" != "$gid" ||
        "$(ops_stat_value '%a' "$candidate")" != "$mode" ]]; then
    ops_fail "FILE_OWNERSHIP_MODE" "path"
    return
  fi
}

ops_sha256_file() {
  local candidate="$1"
  local sha256sum
  sha256sum="$(ops_command sha256sum)" || return
  local output digest remainder
  output="$("$sha256sum" -- "$candidate")" || {
    ops_fail "DIGEST_FAILED" "verification"
    return
  }
  read -r digest remainder <<< "$output"
  if [[ ! "$digest" =~ ^[0-9a-f]{64}$ || -z "$remainder" ]]; then
    ops_fail "DIGEST_FAILED" "verification"
    return
  fi
  printf 'sha256:%s\n' "$digest"
}

ops_require_canonical_json() {
  local candidate="$1"
  local phase="$2"
  local jq cmp
  jq="$(ops_command jq)" || return
  cmp="$(ops_command cmp)" || return
  if ! "$jq" -cS . "$candidate" |
    "$cmp" --silent "$candidate" -; then
    ops_fail "JSON_NOT_CANONICAL" "$phase"
    return
  fi
}

ops_fsync_path() {
  local candidate="$1"
  local sync
  sync="$(ops_command sync)" || return
  "$sync" -f -- "$candidate"
}

ops_atomic_replace_file() {
  if [[ "$#" -ne 5 ]]; then
    ops_fail "ATOMIC_ARGUMENTS" "switch"
    return
  fi
  local source="$1"
  local destination="$2"
  local mode="$3"
  local uid="$4"
  local gid="$5"
  ops_require_below_root "$destination" || return
  local dirname
  dirname="$(ops_command dirname)" || return
  local parent
  parent="$("$dirname" -- "$destination")"
  ops_require_no_symlink_chain "$parent" || return
  if [[ ! -d "$parent" || -L "$parent" ]]; then
    ops_fail "ATOMIC_PARENT_INVALID" "switch"
    return
  fi
  if [[ ! -f "$source" || -L "$source" ]]; then
    ops_fail "ATOMIC_SOURCE_INVALID" "switch"
    return
  fi
  local parent_device parent_inode source_device source_inode source_digest
  parent_device="$(ops_stat_value '%d' "$parent")" || return
  parent_inode="$(ops_stat_value '%i' "$parent")" || return
  source_device="$(ops_stat_value '%d' "$source")" || return
  source_inode="$(ops_stat_value '%i' "$source")" || return
  source_digest="$(ops_sha256_file "$source")" || return
  local destination_state="absent"
  local destination_device="" destination_inode="" destination_digest=""
  local destination_owner="" destination_mode="" destination_links=""
  if [[ -e "$destination" || -L "$destination" ]]; then
    if [[ ! -f "$destination" || -L "$destination" ]]; then
      ops_fail "ATOMIC_DESTINATION_INVALID" "switch"
      return
    fi
    destination_state="present"
    destination_device="$(ops_stat_value '%d' "$destination")" || return
    destination_inode="$(ops_stat_value '%i' "$destination")" || return
    destination_digest="$(ops_sha256_file "$destination")" || return
    destination_owner="$(ops_stat_value '%u:%g' "$destination")" || return
    destination_mode="$(ops_stat_value '%a' "$destination")" || return
    destination_links="$(ops_stat_value '%h' "$destination")" || return
    if [[ "$destination_owner" != "${uid}:${gid}" ||
          "$destination_mode" != "$mode" ||
          "$destination_links" != "1" ]]; then
      ops_fail "ATOMIC_DESTINATION_AUTHORITY_INVALID" "switch"
      return
    fi
    if [[ "$destination_digest" == "$source_digest" ]]; then
      ops_fail "ATOMIC_NO_CHANGE" "switch"
      return
    fi
  fi
  if ! declare -F ops_make_temporary_file >/dev/null ||
    ! declare -F ops_cleanup_temporary_paths >/dev/null ||
    ! declare -F ops_creation_guard_begin >/dev/null ||
    ! declare -F ops_creation_guard_end >/dev/null; then
    ops_fail "TEMPORARY_LEDGER_REQUIRED" "switch"
    return
  fi
  local install mv
  install="$(ops_command install)" || return
  mv="$(ops_command mv)" || return
  local temporary
  ops_make_temporary_file \
    temporary "${parent}/.bgmss-atomic.XXXXXXXX" || return
  local stage_result=0
  ops_creation_guard_begin || return
  "$install" -m "$mode" -o "$uid" -g "$gid" -- \
    "$source" "$temporary" || stage_result=$?
  if [[ "$stage_result" -eq 0 ]]; then
    ops_register_temporary_path "$temporary" sealed || stage_result=$?
  fi
  ops_creation_guard_end
  if [[ "$stage_result" -ne 0 ]]; then
    ops_cleanup_temporary_paths "$temporary" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    ops_fail "ATOMIC_STAGE_FAILED" "switch"
    return
  fi
  if ! ops_fsync_path "$temporary"; then
    ops_cleanup_temporary_paths "$temporary" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    return 1
  fi
  local temporary_device temporary_inode
  temporary_device="$(ops_stat_value '%d' "$temporary")" || {
    ops_cleanup_temporary_paths "$temporary" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    return 1
  }
  temporary_inode="$(ops_stat_value '%i' "$temporary")" || {
    ops_cleanup_temporary_paths "$temporary" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    return 1
  }
  if [[ ! -d "$parent" || -L "$parent" ||
        "$(ops_stat_value '%d' "$parent")" != "$parent_device" ||
        "$(ops_stat_value '%i' "$parent")" != "$parent_inode" ||
        ! -f "$source" || -L "$source" ||
        "$(ops_stat_value '%d' "$source")" != "$source_device" ||
        "$(ops_stat_value '%i' "$source")" != "$source_inode" ||
        "$(ops_sha256_file "$source")" != "$source_digest" ]]; then
    ops_cleanup_temporary_paths "$temporary" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    ops_fail "ATOMIC_INPUT_REPLACED" "switch"
    return
  fi
  if [[ "$destination_state" == "absent" ]]; then
    if [[ -e "$destination" || -L "$destination" ]]; then
      ops_cleanup_temporary_paths "$temporary" ||
        return "$OPS_MANUAL_RECOVERY_EXIT"
      ops_fail "ATOMIC_DESTINATION_APPEARED" "switch"
      return
    fi
  elif [[ ! -f "$destination" || -L "$destination" ||
          "$(ops_stat_value '%d' "$destination")" != "$destination_device" ||
          "$(ops_stat_value '%i' "$destination")" != "$destination_inode" ||
          "$(ops_sha256_file "$destination")" != "$destination_digest" ||
          "$(ops_stat_value '%u:%g' "$destination")" != "$destination_owner" ||
          "$(ops_stat_value '%a' "$destination")" != "$destination_mode" ||
          "$(ops_stat_value '%h' "$destination")" != "$destination_links" ]]; then
    ops_cleanup_temporary_paths "$temporary" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    ops_fail "ATOMIC_DESTINATION_REPLACED" "switch"
    return
  fi
  if [[ "$destination_state" == "absent" ]]; then
    if ! "$mv" -Tn -- "$temporary" "$destination" ||
      [[ -e "$temporary" || -L "$temporary" ]]; then
      ops_cleanup_temporary_paths "$temporary" ||
        return "$OPS_MANUAL_RECOVERY_EXIT"
      ops_fail "ATOMIC_NO_CLOBBER_FAILED" "switch"
      return
    fi
  else
    local parent_owner parent_mode
    parent_owner="$(ops_stat_value '%u' "$parent")" || return
    parent_mode="$(ops_stat_value '%a' "$parent")" || return
    if [[ "$parent_owner" != "0" ]] ||
      (( (8#$parent_mode & 0022) != 0 &&
          ((8#$parent_mode & 01000) == 0 || uid != 0) )); then
      ops_cleanup_temporary_paths "$temporary" ||
        return "$OPS_MANUAL_RECOVERY_EXIT"
      ops_fail "ATOMIC_PARENT_AUTHORITY_INVALID" "switch"
      return
    fi
    if ! "$mv" -Tf -- "$temporary" "$destination"; then
      ops_cleanup_temporary_paths "$temporary" ||
        return "$OPS_MANUAL_RECOVERY_EXIT"
      ops_fail "ATOMIC_RENAME_FAILED" "switch"
      return
    fi
  fi
  if [[ ! -f "$destination" || -L "$destination" ||
        "$(ops_stat_value '%d' "$destination")" != "$temporary_device" ||
        "$(ops_stat_value '%i' "$destination")" != "$temporary_inode" ||
        "$(ops_sha256_file "$destination")" != "$source_digest" ||
        "$(ops_stat_value '%u:%g:%a' "$destination")" !=
          "${uid}:${gid}:${mode}" ]]; then
    ops_fail "ATOMIC_RESULT_INVALID" "switch"
    return
  fi
  ops_fsync_path "$parent"
}

ops_atomic_symlink() {
  if [[ "$#" -ne 2 ]]; then
    ops_fail "SYMLINK_ARGUMENTS" "switch"
    return
  fi
  local target="$1"
  local destination="$2"
  if [[ ! "$target" =~ ^releases/v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)/frontend$ ]]; then
    ops_fail "FRONTEND_TARGET_INVALID" "switch"
    return
  fi
  ops_require_below_root "$destination" || return
  if ! declare -F ops_register_temporary_symlink >/dev/null ||
    ! declare -F ops_cleanup_registered_temporary_symlink >/dev/null ||
    ! declare -F ops_preserve_unknown_temporary >/dev/null ||
    ! declare -F ops_creation_guard_begin >/dev/null ||
    ! declare -F ops_creation_guard_end >/dev/null; then
    ops_fail "TEMPORARY_LEDGER_REQUIRED" "switch"
    return
  fi
  local dirname ln mv readlink
  dirname="$(ops_command dirname)" || return
  ln="$(ops_command ln)" || return
  mv="$(ops_command mv)" || return
  readlink="$(ops_command readlink)" || return
  local parent
  parent="$("$dirname" -- "$destination")" || return
  ops_require_no_symlink_chain "$parent" || return
  if [[ ! -d "$parent" || -L "$parent" ]]; then
    ops_fail "ATOMIC_PARENT_INVALID" "switch"
    return
  fi
  local parent_device parent_inode
  parent_device="$(ops_stat_value '%d' "$parent")" || return
  parent_inode="$(ops_stat_value '%i' "$parent")" || return
  local destination_state="absent"
  local destination_device="" destination_inode="" destination_target=""
  local destination_owner=""
  if [[ -e "$destination" || -L "$destination" ]]; then
    if [[ ! -L "$destination" ]]; then
      ops_fail "ATOMIC_SYMLINK_DESTINATION_INVALID" "switch"
      return
    fi
    destination_state="present"
    destination_device="$(ops_lstat_value '%d' "$destination")" || return
    destination_inode="$(ops_lstat_value '%i' "$destination")" || return
    destination_owner="$(ops_lstat_value '%u:%g' "$destination")" || return
    destination_target="$("$readlink" -- "$destination")" || return
    if [[ "$destination_owner" != "0:0" ]]; then
      ops_fail "ATOMIC_SYMLINK_AUTHORITY_INVALID" "switch"
      return
    fi
    if [[ "$destination_target" == "$target" ]]; then
      ops_fail "ATOMIC_NO_CHANGE" "switch"
      return
    fi
  fi
  local temporary="${destination}.bgmss-new"
  if [[ -e "$temporary" || -L "$temporary" ]]; then
    ops_fail "ATOMIC_TEMP_EXISTS" "switch"
    return
  fi
  local stage_result=0
  ops_creation_guard_begin || return
  "$ln" -s -- "$target" "$temporary" || stage_result=$?
  if [[ "$stage_result" -eq 0 ]]; then
    ops_register_temporary_symlink "$temporary" || stage_result=$?
  fi
  if [[ "$stage_result" -ne 0 &&
        ( -e "$temporary" || -L "$temporary" ) ]]; then
    ops_preserve_unknown_temporary "$temporary"
  fi
  ops_creation_guard_end
  if [[ "$stage_result" -ne 0 ]]; then
    ops_fail "ATOMIC_SYMLINK_STAGE_FAILED" "switch"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local temporary_device temporary_inode
  temporary_device="$(ops_lstat_value '%d' "$temporary")" || {
    ops_cleanup_registered_temporary_symlink "$temporary" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    return 1
  }
  temporary_inode="$(ops_lstat_value '%i' "$temporary")" || {
    ops_cleanup_registered_temporary_symlink "$temporary" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    return 1
  }
  if [[ "$("$readlink" -- "$temporary")" != "$target" ||
        ! -d "$parent" || -L "$parent" ||
        "$(ops_stat_value '%d' "$parent")" != "$parent_device" ||
        "$(ops_stat_value '%i' "$parent")" != "$parent_inode" ]]; then
    ops_cleanup_registered_temporary_symlink "$temporary" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    ops_fail "ATOMIC_SYMLINK_INPUT_REPLACED" "switch"
    return
  fi
  if [[ "$destination_state" == "absent" ]]; then
    if [[ -e "$destination" || -L "$destination" ]]; then
      ops_cleanup_registered_temporary_symlink "$temporary" ||
        return "$OPS_MANUAL_RECOVERY_EXIT"
      ops_fail "ATOMIC_DESTINATION_APPEARED" "switch"
      return
    fi
  elif [[ ! -L "$destination" ||
          "$(ops_lstat_value '%d' "$destination")" != "$destination_device" ||
          "$(ops_lstat_value '%i' "$destination")" != "$destination_inode" ||
          "$(ops_lstat_value '%u:%g' "$destination")" != "$destination_owner" ||
          "$("$readlink" -- "$destination")" != "$destination_target" ]]; then
    ops_cleanup_registered_temporary_symlink "$temporary" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    ops_fail "ATOMIC_DESTINATION_REPLACED" "switch"
    return
  fi
  if [[ "$destination_state" == "absent" ]]; then
    if ! "$mv" -Tn -- "$temporary" "$destination" ||
      [[ -e "$temporary" || -L "$temporary" ]]; then
      ops_cleanup_registered_temporary_symlink "$temporary" ||
        return "$OPS_MANUAL_RECOVERY_EXIT"
      ops_fail "ATOMIC_SYMLINK_NO_CLOBBER_FAILED" "switch"
      return
    fi
  else
    local parent_owner parent_mode
    parent_owner="$(ops_stat_value '%u' "$parent")" || return
    parent_mode="$(ops_stat_value '%a' "$parent")" || return
    if [[ "$parent_owner" != "0" ]] ||
      (( (8#$parent_mode & 0022) != 0 )); then
      ops_cleanup_registered_temporary_symlink "$temporary" ||
        return "$OPS_MANUAL_RECOVERY_EXIT"
      ops_fail "ATOMIC_SYMLINK_PARENT_AUTHORITY_INVALID" "switch"
      return
    fi
    if ! "$mv" -Tf -- "$temporary" "$destination"; then
      ops_cleanup_registered_temporary_symlink "$temporary" ||
        return "$OPS_MANUAL_RECOVERY_EXIT"
      ops_fail "ATOMIC_SYMLINK_RENAME_FAILED" "switch"
      return
    fi
  fi
  if [[ ! -L "$destination" ||
        "$(ops_lstat_value '%d' "$destination")" != "$temporary_device" ||
        "$(ops_lstat_value '%i' "$destination")" != "$temporary_inode" ||
        "$("$readlink" -- "$destination")" != "$target" ]]; then
    ops_fail "ATOMIC_SYMLINK_RESULT_INVALID" "switch"
    return
  fi
  ops_fsync_path "$parent"
}

ops_readlink_frontend() {
  local link="${OPS_ROOT}/current-frontend"
  if [[ ! -L "$link" ]]; then
    ops_fail "FRONTEND_LINK_REQUIRED" "verification"
    return
  fi
  local readlink target
  readlink="$(ops_command readlink)" || return
  target="$("$readlink" -- "$link")"
  if [[ ! "$target" =~ ^releases/v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)/frontend$ ||
        ! -d "${OPS_ROOT}/${target}" || -L "${OPS_ROOT}/${target}" ]]; then
    ops_fail "FRONTEND_LINK_INVALID" "verification"
    return
  fi
  printf '%s\n' "$target"
}

ops_copy_closed_file() {
  local source="$1"
  local destination="$2"
  if [[ ! -f "$source" || -L "$source" ]]; then
    ops_fail "COPY_SOURCE_INVALID" "recovery"
    return
  fi
  ops_atomic_replace_file "$source" "$destination" 600 0 0
}

ops_compose() {
  local docker
  docker="$(ops_command docker)" || return
  "$docker" compose \
    --project-name "$OPS_PROJECT" \
    --file "${OPS_ROOT}/compose/compose.yaml" \
    --env-file "${OPS_ROOT}/compose/release.env" \
    "$@"
}

ops_compose_with_env() {
  local environment_file="$1"
  shift
  local docker
  docker="$(ops_command docker)" || return
  "$docker" compose \
    --project-name "$OPS_PROJECT" \
    --file "${OPS_ROOT}/compose/compose.yaml" \
    --env-file "$environment_file" \
    "$@"
}

ops_log_result() {
  if [[ "$#" -ne 4 ]]; then
    ops_fail "RESULT_ARGUMENTS" "result"
    return
  fi
  local action="$1"
  local run_id="$2"
  local status="$3"
  local duration="$4"
  local jq
  jq="$(ops_command jq)" || return
  "$jq" -cnS \
    --arg action "$action" \
    --arg runId "$run_id" \
    --arg status "$status" \
    --argjson durationSeconds "$duration" \
    '{
      action:$action,
      durationSeconds:$durationSeconds,
      event:"operation_terminal",
      runId:$runId,
      status:$status
    }'
}
