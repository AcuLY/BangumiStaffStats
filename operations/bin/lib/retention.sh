#!/usr/bin/env bash

set -Eeuo pipefail

ops_require_cleanup_gate() {
  local marker="${OPS_ROOT}/recovery/rollback-exercised.json"
  local jq
  jq="$(ops_command jq)" || return
  if [[ ! -f "$marker" || -L "$marker" ]] ||
    ! ops_require_regular_file "$marker" 0 0 400 ||
    ! ops_require_canonical_json "$marker" "cleanup" ||
    ! "$jq" -e '
      type == "object" and
      (keys == ["kind","runId","status"]) and
      (.kind | IN("application","data")) and
      (.runId | test("^run-[0-9a-f]{32}$")) and
      .status == "succeeded"
    ' "$marker" >/dev/null; then
    ops_fail "ROLLBACK_EXERCISE_REQUIRED" "cleanup"
    return
  fi
  ops_run_checks
}

ops_remove_closed_tree() {
  local root="$1"
  ops_require_below_root "$root" || return
  if [[ ! -d "$root" || -L "$root" ]]; then
    ops_fail "CLEANUP_TARGET_INVALID" "cleanup"
    return
  fi
  local device owner
  device="$(ops_stat_value '%d' "$root")" || return
  owner="$(ops_stat_value '%u' "$root")" || return
  if [[ "$owner" != "0" && "$owner" != "$OPS_UPDATER_UID" ]]; then
    ops_fail "CLEANUP_OWNER_INVALID" "cleanup"
    return
  fi
  local find grep unlink rmdir
  find="$(ops_command find)" || return
  grep="$(ops_command grep)" || return
  unlink="$(ops_command unlink)" || return
  rmdir="$(ops_command rmdir)" || return
  if "$find" "$root" -xdev \( -type l -o ! -type d ! -type f \) -print -quit |
    "$grep" -q .; then
    ops_fail "CLEANUP_SPECIAL_ENTRY" "cleanup"
    return
  fi
  if "$find" "$root" -xdev -type f -links +1 -print -quit |
    "$grep" -q .; then
    ops_fail "CLEANUP_HARDLINK_INVALID" "cleanup"
    return
  fi
  local candidate candidate_device candidate_inode
  local -a files=()
  local -a file_devices=()
  local -a file_inodes=()
  local -a file_owners=()
  local -a file_modes=()
  local -a file_links=()
  local -a file_sizes=()
  local -a file_digests=()
  local -a directories=()
  local -a directory_devices=()
  local -a directory_inodes=()
  local -a directory_owners=()
  local -a directory_modes=()
  while IFS= read -r -d '' candidate; do
    candidate_device="$(ops_stat_value '%d' "$candidate")" || return
    candidate_inode="$(ops_stat_value '%i' "$candidate")" || return
    if [[ "$candidate_device" != "$device" ||
          "$(ops_stat_value '%u' "$candidate")" != "$owner" ]]; then
      ops_fail "CLEANUP_DEVICE_CHANGED" "cleanup"
      return
    fi
    if [[ -f "$candidate" ]]; then
      files+=("$candidate")
      file_devices+=("$candidate_device")
      file_inodes+=("$candidate_inode")
      file_owners+=("$(ops_stat_value '%u:%g' "$candidate")") || return
      file_modes+=("$(ops_stat_value '%a' "$candidate")") || return
      file_links+=("$(ops_stat_value '%h' "$candidate")") || return
      file_sizes+=("$(ops_stat_value '%s' "$candidate")") || return
      file_digests+=("$(ops_sha256_file "$candidate")") || return
    fi
  done < <("$find" "$root" -xdev -print0)
  while IFS= read -r -d '' candidate; do
    directories+=("$candidate")
    directory_devices+=("$(ops_stat_value '%d' "$candidate")") || return
    directory_inodes+=("$(ops_stat_value '%i' "$candidate")") || return
    directory_owners+=("$(ops_stat_value '%u:%g' "$candidate")") || return
    directory_modes+=("$(ops_stat_value '%a' "$candidate")") || return
  done < <("$find" "$root" -xdev -depth -type d -print0)
  local index
  for index in "${!files[@]}"; do
    candidate="${files[$index]}"
    if [[ ! -f "$candidate" || -L "$candidate" ||
          "$(ops_stat_value '%d' "$candidate")" != "${file_devices[$index]}" ||
          "$(ops_stat_value '%i' "$candidate")" != "${file_inodes[$index]}" ||
          "$(ops_stat_value '%u:%g' "$candidate")" != "${file_owners[$index]}" ||
          "$(ops_stat_value '%a' "$candidate")" != "${file_modes[$index]}" ||
          "$(ops_stat_value '%h' "$candidate")" != "${file_links[$index]}" ||
          "$(ops_stat_value '%s' "$candidate")" != "${file_sizes[$index]}" ||
          "$(ops_sha256_file "$candidate")" != "${file_digests[$index]}" ]]; then
      ops_fail "CLEANUP_FILE_REPLACED" "cleanup"
      return
    fi
    "$unlink" -- "$candidate" || {
      ops_fail "CLEANUP_FILE_REMOVE_FAILED" "cleanup"
      return
    }
  done
  for index in "${!directories[@]}"; do
    candidate="${directories[$index]}"
    if [[ ! -d "$candidate" || -L "$candidate" ||
          "$(ops_stat_value '%d' "$candidate")" != \
            "${directory_devices[$index]}" ||
          "$(ops_stat_value '%i' "$candidate")" != \
            "${directory_inodes[$index]}" ||
          "$(ops_stat_value '%u:%g' "$candidate")" != \
            "${directory_owners[$index]}" ||
          "$(ops_stat_value '%a' "$candidate")" != \
            "${directory_modes[$index]}" ||
          "$("$find" "$candidate" -mindepth 1 -maxdepth 1 -print -quit)" != \
            "" ]]; then
      ops_fail "CLEANUP_DIRECTORY_REPLACED" "cleanup"
      return
    fi
    "$rmdir" -- "$candidate" || {
      ops_fail "CLEANUP_DIRECTORY_REMOVE_FAILED" "cleanup"
      return
    }
  done
}

ops_cleanup() {
  local mode="$1"
  local run_id="$2"
  if [[ "$mode" != "dry-run" && "$mode" != "apply" ]]; then
    ops_fail "CLEANUP_MODE_INVALID" "cleanup"
    return
  fi
  ops_require_cleanup_gate || return
  ops_load_release_env "${OPS_ROOT}/compose/release.env" || return
  local current_app="${OPS_RELEASE_ENV[BGMSS_APP_VERSION]}"
  local previous_app=""
  if [[ -f "${OPS_ROOT}/compose/previous-app.json" ]]; then
    local jq
    jq="$(ops_command jq)" || return
    previous_app="$("$jq" -er \
      '.releaseEnvironment.BGMSS_APP_VERSION' \
      "${OPS_ROOT}/compose/previous-app.json")" || return
    ops_is_version "$previous_app" || {
      ops_fail "PREVIOUS_APP_STATE_INVALID" "cleanup"
      return
    }
  fi
  local current_data previous_data=""
  current_data="$(ops_read_current_field "${OPS_ROOT}/data/current.json" dataVersion)" || return
  if [[ -f "${OPS_ROOT}/data/previous.json" ]]; then
    previous_data="$(ops_read_current_field "${OPS_ROOT}/data/previous.json" dataVersion)" || return
  fi

  local candidate name
  shopt -s nullglob dotglob
  for candidate in "${OPS_ROOT}/data"/.bgmss-stage-*; do
    ops_emit_failure "UNKNOWN_STAGE_PRESERVED" "cleanup" || true
    shopt -u nullglob dotglob
    return 1
  done
  for candidate in "${OPS_ROOT}/releases"/*; do
    name="${candidate##*/}"
    if ! ops_is_version "$name" || [[ -L "$candidate" ]]; then
      ops_fail "FOREIGN_RELEASE_PRESERVED" "cleanup"
      return
    fi
    if [[ "$name" != "$current_app" && "$name" != "$previous_app" ]]; then
      ops_verify_managed_release "$name" || return
      printf 'cleanup-candidate release %s\n' "$name"
      if [[ "$mode" == "apply" ]]; then
        ops_remove_closed_tree "$candidate" || return
        ops_remove_closed_tree \
          "${OPS_ROOT}/recovery/releases/${name}" || return
      fi
    fi
  done
  for candidate in "${OPS_ROOT}/data/versions"/*; do
    name="${candidate##*/}"
    ops_verify_version_directory "$candidate" || return
    if [[ "$name" != "$current_data" && "$name" != "$previous_data" ]]; then
      ops_verify_managed_data_version "$name" || return
      printf 'cleanup-candidate data %s\n' "$name"
      if [[ "$mode" == "apply" ]]; then
        local marker="${OPS_ROOT}/recovery/data/${name}.json"
        ops_require_regular_file "$marker" 0 0 400 || return
        local marker_device marker_inode marker_digest marker_size marker_links
        marker_device="$(ops_stat_value '%d' "$marker")" || return
        marker_inode="$(ops_stat_value '%i' "$marker")" || return
        marker_digest="$(ops_sha256_file "$marker")" || return
        marker_size="$(ops_stat_value '%s' "$marker")" || return
        marker_links="$(ops_stat_value '%h' "$marker")" || return
        if [[ "$marker_links" != "1" ]]; then
          ops_fail "DATA_MARKER_IDENTITY_INVALID" "cleanup"
          return
        fi
        ops_remove_closed_tree "$candidate" || return
        if [[ ! -f "$marker" || -L "$marker" ||
              "$(ops_stat_value '%d' "$marker")" != "$marker_device" ||
              "$(ops_stat_value '%i' "$marker")" != "$marker_inode" ||
              "$(ops_stat_value '%u:%g:%a' "$marker")" != "0:0:400" ||
              "$(ops_stat_value '%h' "$marker")" != "$marker_links" ||
              "$(ops_stat_value '%s' "$marker")" != "$marker_size" ||
              "$(ops_sha256_file "$marker")" != "$marker_digest" ]]; then
          ops_emit_failure "DATA_MARKER_REPLACED" \
            "manual-recovery" || true
          return "$OPS_MANUAL_RECOVERY_EXIT"
        fi
        local unlink
        unlink="$(ops_command unlink)" || return
        "$unlink" -- "$marker" || return
        ops_fsync_path "${OPS_ROOT}/recovery/data" || return
      fi
    fi
  done
  shopt -u nullglob dotglob
  ops_log_result "cleanup" "$run_id" "succeeded" 0
}
