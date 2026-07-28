#!/usr/bin/env bash

set -Eeuo pipefail

readonly OPS_CONTROLLER_MANIFEST_NAME="controller-manifest.json"
readonly OPS_CONTROLLER_FILES=(
  "bin/bgmss-ops"
  "bin/lib/common.sh"
  "bin/lib/controller.sh"
  "bin/lib/health.sh"
  "bin/lib/preflight.sh"
  "bin/lib/retention.sh"
  "bin/lib/transaction.sh"
  "compose/compose.yaml"
  "compose/updater-current-deny"
  "observability/prometheus/prometheus.yml"
  "observability/prometheus/rules.yml"
)
OPS_BOOTSTRAP_STAGE_PATH=""
OPS_BOOTSTRAP_STAGE_DEVICE=""
OPS_BOOTSTRAP_STAGE_INODE=""
OPS_BOOTSTRAP_STAGE_STATE="absent"
declare -ag OPS_BOOTSTRAP_OBJECT_PATHS=()
declare -ag OPS_BOOTSTRAP_OBJECT_TYPES=()
declare -ag OPS_BOOTSTRAP_OBJECT_DEVICES=()
declare -ag OPS_BOOTSTRAP_OBJECT_INODES=()
declare -ag OPS_BOOTSTRAP_OBJECT_OWNERS=()
declare -ag OPS_BOOTSTRAP_OBJECT_MODES=()
declare -ag OPS_BOOTSTRAP_OBJECT_LINKS=()
declare -ag OPS_BOOTSTRAP_OBJECT_SIZES=()
declare -ag OPS_BOOTSTRAP_OBJECT_DIGESTS=()

ops_clear_registered_bootstrap_stage() {
  OPS_BOOTSTRAP_STAGE_PATH=""
  OPS_BOOTSTRAP_STAGE_DEVICE=""
  OPS_BOOTSTRAP_STAGE_INODE=""
  OPS_BOOTSTRAP_STAGE_STATE="absent"
  OPS_BOOTSTRAP_OBJECT_PATHS=()
  OPS_BOOTSTRAP_OBJECT_TYPES=()
  OPS_BOOTSTRAP_OBJECT_DEVICES=()
  OPS_BOOTSTRAP_OBJECT_INODES=()
  OPS_BOOTSTRAP_OBJECT_OWNERS=()
  OPS_BOOTSTRAP_OBJECT_MODES=()
  OPS_BOOTSTRAP_OBJECT_LINKS=()
  OPS_BOOTSTRAP_OBJECT_SIZES=()
  OPS_BOOTSTRAP_OBJECT_DIGESTS=()
}

ops_bootstrap_stage_path_valid() {
  [[ "$1" =~ ^/srv/\.bgmss-v2-stage\.[A-Za-z0-9]{8}$ ]]
}

ops_bootstrap_stage_template() {
  printf '%s\n' "/srv/.bgmss-v2-stage.XXXXXXXX"
}

ops_verify_controller_manifest_shape() {
  local manifest="$1"
  local jq
  jq="$(ops_command jq)" || return
  if [[ ! -f "$manifest" || -L "$manifest" ]] ||
    ! "$jq" -e '
      type == "object" and
      (keys == ["bootstrap","controllerRevision","files","schemaVersion"]) and
      .schemaVersion == "controller-manifest-v1" and
      (.controllerRevision | test("^[0-9a-f]{40}$")) and
      (.bootstrap | keys == ["mode","path","sha256","size"]) and
      .bootstrap.path == "bin/bgmss-v2-deploy" and
      (.bootstrap.sha256 | test("^sha256:[0-9a-f]{64}$")) and
      (.bootstrap.mode == "0555") and
      (.bootstrap.size | type == "number" and . > 0) and
      (.files | type == "array" and length == 11) and
      ([.files[].path] == [
        "bin/bgmss-ops",
        "bin/lib/common.sh",
        "bin/lib/controller.sh",
        "bin/lib/health.sh",
        "bin/lib/preflight.sh",
        "bin/lib/retention.sh",
        "bin/lib/transaction.sh",
        "compose/compose.yaml",
        "compose/updater-current-deny",
        "observability/prometheus/prometheus.yml",
        "observability/prometheus/rules.yml"
      ]) and
      all(.files[];
        (keys == ["mode","path","sha256","size"]) and
        (.mode | IN("0000","0444","0555")) and
        (.sha256 | test("^sha256:[0-9a-f]{64}$")) and
        (.size | type == "number" and . > 0)
      )
    ' "$manifest" >/dev/null; then
    ops_fail "CONTROLLER_MANIFEST_INVALID" "controller"
    return
  fi
}

ops_verify_controller_file() {
  local manifest="$1"
  local base="$2"
  local relative="$3"
  local jq
  jq="$(ops_command jq)" || return
  local expected_digest expected_mode expected_size
  expected_digest="$("$jq" -er --arg path "$relative" \
    '.files[] | select(.path == $path) | .sha256' "$manifest")" || return
  expected_mode="$("$jq" -er --arg path "$relative" \
    '.files[] | select(.path == $path) | .mode' "$manifest")" || return
  expected_size="$("$jq" -er --arg path "$relative" \
    '.files[] | select(.path == $path) | .size' "$manifest")" || return
  local candidate="${base}/${relative}"
  local actual_mode
  actual_mode="$(ops_stat_value '%a' "$candidate")" || return
  if [[ ! -f "$candidate" || -L "$candidate" ||
        "$(ops_stat_value '%u' "$candidate")" != "0" ||
        "$(ops_stat_value '%g' "$candidate")" != "0" ||
        ( "$expected_mode" == "0000" && "$actual_mode" != "0" ) ||
        ( "$expected_mode" != "0000" && "0${actual_mode}" != "$expected_mode" ) ||
        "$(ops_stat_value '%s' "$candidate")" != "$expected_size" ||
        "$(ops_sha256_file "$candidate")" != "$expected_digest" ]]; then
    ops_fail "CONTROLLER_FILE_MISMATCH" "controller"
    return
  fi
}

ops_verify_controller_at() {
  local manifest="$1"
  local base="$2"
  ops_verify_controller_manifest_shape "$manifest" || return
  local relative
  for relative in "${OPS_CONTROLLER_FILES[@]}"; do
    ops_verify_controller_file "$manifest" "$base" "$relative" || return
  done
}

ops_verify_installed_controller() {
  local manifest="${OPS_ROOT}/${OPS_CONTROLLER_MANIFEST_NAME}"
  ops_require_regular_file "$manifest" 0 0 400 || return
  ops_verify_controller_at "$manifest" "$OPS_ROOT"
}

ops_bootstrap_object_path_expected() {
  case "$1" in
    .|bin|bin/bgmss-ops|bin/lib|bin/lib/common.sh|bin/lib/controller.sh|\
    bin/lib/health.sh|bin/lib/preflight.sh|bin/lib/retention.sh|\
    bin/lib/transaction.sh|compose|compose/compose.yaml|\
    compose/updater-current-deny|\
    controller-manifest.json|data|data/versions|observability|\
    observability/prometheus|observability/prometheus/prometheus.yml|\
    observability/prometheus/rules.yml|observability/prometheus/tsdb|\
    recovery|recovery/data|recovery/releases|releases|secrets)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

ops_register_bootstrap_object() {
  local candidate="$1"
  local relative="."
  if [[ "$candidate" != "$OPS_BOOTSTRAP_STAGE_PATH" ]]; then
    case "$candidate" in
      "${OPS_BOOTSTRAP_STAGE_PATH}/"*)
        relative="${candidate#${OPS_BOOTSTRAP_STAGE_PATH}/}"
        ;;
      *)
        ops_fail "BOOTSTRAP_LEDGER_PATH_INVALID" "bootstrap"
        return
        ;;
    esac
  fi
  ops_bootstrap_object_path_expected "$relative" || {
    ops_fail "BOOTSTRAP_LEDGER_PATH_INVALID" "bootstrap"
    return
  }
  if [[ ( ! -d "$candidate" && ! -f "$candidate" ) ||
        -L "$candidate" ]]; then
    ops_fail "BOOTSTRAP_LEDGER_OBJECT_INVALID" "bootstrap"
    return
  fi
  local type="directory"
  local links="" size="" digest=""
  if [[ -f "$candidate" ]]; then
    type="file"
    links="$(ops_stat_value '%h' "$candidate")" || return
    if [[ "$links" != "1" ]]; then
      ops_fail "BOOTSTRAP_LEDGER_LINK_INVALID" "bootstrap"
      return
    fi
    size="$(ops_stat_value '%s' "$candidate")" || return
    digest="$(ops_sha256_file "$candidate")" || return
  fi
  local device inode owner mode
  device="$(ops_stat_value '%d' "$candidate")" || return
  inode="$(ops_stat_value '%i' "$candidate")" || return
  owner="$(ops_stat_value '%u:%g' "$candidate")" || return
  mode="$(ops_stat_value '%a' "$candidate")" || return
  if [[ "$relative" == "." ]]; then
    OPS_BOOTSTRAP_STAGE_DEVICE="$device"
    OPS_BOOTSTRAP_STAGE_INODE="$inode"
    OPS_BOOTSTRAP_STAGE_STATE="recorded"
  elif [[ "$OPS_BOOTSTRAP_STAGE_STATE" != "recorded" ||
          "$device" != "$OPS_BOOTSTRAP_STAGE_DEVICE" ]]; then
    ops_fail "BOOTSTRAP_LEDGER_DEVICE_INVALID" "bootstrap"
    return
  fi
  local index
  for index in "${!OPS_BOOTSTRAP_OBJECT_PATHS[@]}"; do
    if [[ "${OPS_BOOTSTRAP_OBJECT_PATHS[$index]}" == "$candidate" ]]; then
      OPS_BOOTSTRAP_OBJECT_TYPES[$index]="$type"
      OPS_BOOTSTRAP_OBJECT_DEVICES[$index]="$device"
      OPS_BOOTSTRAP_OBJECT_INODES[$index]="$inode"
      OPS_BOOTSTRAP_OBJECT_OWNERS[$index]="$owner"
      OPS_BOOTSTRAP_OBJECT_MODES[$index]="$mode"
      OPS_BOOTSTRAP_OBJECT_LINKS[$index]="$links"
      OPS_BOOTSTRAP_OBJECT_SIZES[$index]="$size"
      OPS_BOOTSTRAP_OBJECT_DIGESTS[$index]="$digest"
      return 0
    fi
  done
  OPS_BOOTSTRAP_OBJECT_PATHS+=("$candidate")
  OPS_BOOTSTRAP_OBJECT_TYPES+=("$type")
  OPS_BOOTSTRAP_OBJECT_DEVICES+=("$device")
  OPS_BOOTSTRAP_OBJECT_INODES+=("$inode")
  OPS_BOOTSTRAP_OBJECT_OWNERS+=("$owner")
  OPS_BOOTSTRAP_OBJECT_MODES+=("$mode")
  OPS_BOOTSTRAP_OBJECT_LINKS+=("$links")
  OPS_BOOTSTRAP_OBJECT_SIZES+=("$size")
  OPS_BOOTSTRAP_OBJECT_DIGESTS+=("$digest")
}

ops_bootstrap_actual_object_path() {
  local ledger_path="$1"
  local actual_root="$2"
  if [[ "$ledger_path" == "$OPS_BOOTSTRAP_STAGE_PATH" ]]; then
    printf '%s\n' "$actual_root"
  else
    printf '%s%s\n' \
      "$actual_root" "${ledger_path#${OPS_BOOTSTRAP_STAGE_PATH}}"
  fi
}

ops_bootstrap_object_matches() {
  local index="$1"
  local actual_root="$2"
  local candidate
  candidate="$(ops_bootstrap_actual_object_path \
    "${OPS_BOOTSTRAP_OBJECT_PATHS[$index]}" "$actual_root")" || return
  if [[ "${OPS_BOOTSTRAP_OBJECT_TYPES[$index]}" == "file" ]]; then
    [[ -f "$candidate" && ! -L "$candidate" &&
      "$(ops_stat_value '%h' "$candidate")" ==
        "${OPS_BOOTSTRAP_OBJECT_LINKS[$index]}" &&
      "$(ops_stat_value '%s' "$candidate")" ==
        "${OPS_BOOTSTRAP_OBJECT_SIZES[$index]}" &&
      "$(ops_sha256_file "$candidate")" ==
        "${OPS_BOOTSTRAP_OBJECT_DIGESTS[$index]}" ]] || return 1
  else
    [[ -d "$candidate" && ! -L "$candidate" ]] || return 1
  fi
  [[ "$(ops_stat_value '%d' "$candidate")" ==
      "${OPS_BOOTSTRAP_OBJECT_DEVICES[$index]}" &&
    "$(ops_stat_value '%i' "$candidate")" ==
      "${OPS_BOOTSTRAP_OBJECT_INODES[$index]}" &&
    "$(ops_stat_value '%u:%g' "$candidate")" ==
      "${OPS_BOOTSTRAP_OBJECT_OWNERS[$index]}" &&
    "$(ops_stat_value '%a' "$candidate")" ==
      "${OPS_BOOTSTRAP_OBJECT_MODES[$index]}" ]]
}

ops_verify_bootstrap_ledger_at() {
  local actual_root="$1"
  if [[ "$OPS_BOOTSTRAP_STAGE_STATE" != "recorded" ||
        "${#OPS_BOOTSTRAP_OBJECT_PATHS[@]}" -eq 0 ]]; then
    ops_fail "BOOTSTRAP_LEDGER_NOT_RECORDED" "manual-recovery"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local index
  for index in "${!OPS_BOOTSTRAP_OBJECT_PATHS[@]}"; do
    ops_bootstrap_object_matches "$index" "$actual_root" || {
      ops_emit_failure "BOOTSTRAP_OBJECT_REPLACED" \
        "manual-recovery" || true
      return "$OPS_MANUAL_RECOVERY_EXIT"
    }
  done
  local find awk actual_count
  find="$(ops_command find)" || return
  awk="$(ops_command awk)" || return
  actual_count="$(
    "$find" "$actual_root" -xdev -printf '1\n' |
      "$awk" 'END { print NR }'
  )" || return "$OPS_MANUAL_RECOVERY_EXIT"
  if [[ ! "$actual_count" =~ ^[0-9]+$ ||
        "$actual_count" -ne "${#OPS_BOOTSTRAP_OBJECT_PATHS[@]}" ]]; then
    ops_emit_failure "BOOTSTRAP_FOREIGN_OBJECT_PRESERVED" \
      "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
}

ops_cleanup_bootstrap_ledger_at() {
  local actual_root="$1"
  ops_verify_bootstrap_ledger_at "$actual_root" || return
  local unlink rmdir
  unlink="$(ops_command unlink)" || return
  rmdir="$(ops_command rmdir)" || return
  local index candidate
  for index in "${!OPS_BOOTSTRAP_OBJECT_PATHS[@]}"; do
    [[ "${OPS_BOOTSTRAP_OBJECT_TYPES[$index]}" == "file" ]] || continue
    ops_bootstrap_object_matches "$index" "$actual_root" || {
      ops_emit_failure "BOOTSTRAP_OBJECT_REPLACED" \
        "manual-recovery" || true
      return "$OPS_MANUAL_RECOVERY_EXIT"
    }
    candidate="$(ops_bootstrap_actual_object_path \
      "${OPS_BOOTSTRAP_OBJECT_PATHS[$index]}" "$actual_root")" || return
    "$unlink" -- "$candidate" || return "$OPS_MANUAL_RECOVERY_EXIT"
  done
  for ((index=${#OPS_BOOTSTRAP_OBJECT_PATHS[@]} - 1; index >= 0; index--)); do
    [[ "${OPS_BOOTSTRAP_OBJECT_TYPES[$index]}" == "directory" ]] || continue
    ops_bootstrap_object_matches "$index" "$actual_root" || {
      ops_emit_failure "BOOTSTRAP_OBJECT_REPLACED" \
        "manual-recovery" || true
      return "$OPS_MANUAL_RECOVERY_EXIT"
    }
    candidate="$(ops_bootstrap_actual_object_path \
      "${OPS_BOOTSTRAP_OBJECT_PATHS[$index]}" "$actual_root")" || return
    "$rmdir" -- "$candidate" || return "$OPS_MANUAL_RECOVERY_EXIT"
  done
}

ops_cleanup_registered_bootstrap_stage() {
  if [[ -z "$OPS_BOOTSTRAP_STAGE_PATH" ]]; then
    return 0
  fi
  if [[ "$OPS_BOOTSTRAP_STAGE_STATE" != "recorded" ]]; then
    if [[ -e "$OPS_BOOTSTRAP_STAGE_PATH" ||
          -L "$OPS_BOOTSTRAP_STAGE_PATH" ||
          -e "$OPS_ROOT" ||
          -L "$OPS_ROOT" ]]; then
      ops_emit_failure "BOOTSTRAP_STAGE_CREATION_UNRECORDED" \
        "manual-recovery" || true
      return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    ops_clear_registered_bootstrap_stage
    return 0
  fi
  local actual_root=""
  if [[ -d "$OPS_BOOTSTRAP_STAGE_PATH" &&
        ! -L "$OPS_BOOTSTRAP_STAGE_PATH" &&
        "$(ops_stat_value '%d' "$OPS_BOOTSTRAP_STAGE_PATH")" ==
          "$OPS_BOOTSTRAP_STAGE_DEVICE" &&
        "$(ops_stat_value '%i' "$OPS_BOOTSTRAP_STAGE_PATH")" ==
          "$OPS_BOOTSTRAP_STAGE_INODE" ]]; then
    if [[ -e "$OPS_ROOT" || -L "$OPS_ROOT" ]]; then
      ops_emit_failure "BOOTSTRAP_PUBLICATION_COLLISION" \
        "manual-recovery" || true
      return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    actual_root="$OPS_BOOTSTRAP_STAGE_PATH"
  elif [[ -d "$OPS_ROOT" && ! -L "$OPS_ROOT" &&
          "$(ops_stat_value '%d' "$OPS_ROOT")" ==
            "$OPS_BOOTSTRAP_STAGE_DEVICE" &&
          "$(ops_stat_value '%i' "$OPS_ROOT")" ==
            "$OPS_BOOTSTRAP_STAGE_INODE" ]]; then
    actual_root="$OPS_ROOT"
  else
    ops_emit_failure "BOOTSTRAP_STAGE_STATE_UNKNOWN" \
      "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  local result=0
  ops_creation_guard_begin || return
  if [[ "$actual_root" == "$OPS_ROOT" ]]; then
    ops_verify_bootstrap_ledger_at "$actual_root" || result=$?
    if [[ "$result" -eq 0 ]]; then
      ops_preflight_controller_only || result=$?
    fi
  else
    ops_cleanup_bootstrap_ledger_at "$actual_root" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_clear_registered_bootstrap_stage
  fi
  ops_creation_guard_end
  return "$result"
}

ops_cleanup_bootstrap_stage() {
  local stage="$1"
  local expected_device="$2"
  local expected_inode="$3"
  if [[ "$stage" != "$OPS_BOOTSTRAP_STAGE_PATH" ||
        "$expected_device" != "$OPS_BOOTSTRAP_STAGE_DEVICE" ||
        "$expected_inode" != "$OPS_BOOTSTRAP_STAGE_INODE" ]]; then
    ops_emit_failure "BOOTSTRAP_STAGE_LEDGER_MISMATCH" \
      "manual-recovery" || true
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  ops_cleanup_registered_bootstrap_stage
}

ops_verify_bootstrap_stage() {
  local stage="$1"
  local final_root="$OPS_ROOT"
  OPS_ROOT="$stage"
  export OPS_ROOT
  local result=0
  ops_preflight_controller_only || result=$?
  OPS_ROOT="$final_root"
  export OPS_ROOT
  return "$result"
}

ops_create_bootstrap_stage() {
  local variable="$1"
  local mktemp template stage="" result=0
  mktemp="$(ops_command mktemp)" || return
  template="$(ops_bootstrap_stage_template)" || return
  ops_creation_guard_begin || return
  OPS_BOOTSTRAP_STAGE_STATE="creating"
  stage="$("$mktemp" -d "$template")" || result=$?
  if [[ "$result" -eq 0 ]]; then
    OPS_BOOTSTRAP_STAGE_PATH="$stage"
    if ! ops_bootstrap_stage_path_valid "$stage"; then
      result=1
    else
      ops_register_bootstrap_object "$stage" || result=$?
    fi
  fi
  ops_creation_guard_end
  if [[ "$result" -ne 0 ||
        "$OPS_BOOTSTRAP_STAGE_STATE" != "recorded" ]]; then
    return "$OPS_MANUAL_RECOVERY_EXIT"
  fi
  printf -v "$variable" '%s' "$stage"
}

ops_update_bootstrap_stage_mode() {
  local stage="$1"
  local mode="$2"
  local chmod result=0
  chmod="$(ops_command chmod)" || return
  ops_creation_guard_begin || return
  "$chmod" "$mode" "$stage" || result=$?
  if [[ "$result" -eq 0 ]]; then
    ops_register_bootstrap_object "$stage" || result=$?
  fi
  ops_creation_guard_end
  return "$result"
}

ops_install_bootstrap_directory() {
  local destination="$1"
  local mode="$2"
  local uid="$3"
  local gid="$4"
  local mkdir chown chmod result=0
  mkdir="$(ops_command mkdir)" || return
  chown="$(ops_command chown)" || return
  chmod="$(ops_command chmod)" || return
  ops_creation_guard_begin || return
  if [[ -e "$destination" || -L "$destination" ]]; then
    result="$OPS_MANUAL_RECOVERY_EXIT"
  else
    "$mkdir" -m "$mode" -- "$destination" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    "$chown" "$uid:$gid" "$destination" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    "$chmod" "$mode" "$destination" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_register_bootstrap_object "$destination" || result=$?
  fi
  ops_creation_guard_end
  return "$result"
}

ops_install_bootstrap_file() {
  local source="$1"
  local destination="$2"
  local mode="$3"
  local dd chown chmod result=0
  dd="$(ops_command dd)" || return
  chown="$(ops_command chown)" || return
  chmod="$(ops_command chmod)" || return
  ops_creation_guard_begin || return
  if [[ -e "$destination" || -L "$destination" ]]; then
    result="$OPS_MANUAL_RECOVERY_EXIT"
  elif ! ( set -o noclobber; : > "$destination" ); then
    result="$OPS_MANUAL_RECOVERY_EXIT"
  fi
  if [[ "$result" -eq 0 ]]; then
    "$dd" if="$source" of="$destination" conv=notrunc status=none ||
      result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    "$chown" 0:0 "$destination" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    "$chmod" "$mode" "$destination" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_register_bootstrap_object "$destination" || result=$?
  fi
  ops_creation_guard_end
  return "$result"
}

ops_bootstrap_controller() {
  local package_root="$1"
  local package_manifest="${package_root}/controller-manifest.json"
  if [[ "$package_root" != "/usr/local/libexec/bgmss-v2" ||
        ! -d "$package_root" || -L "$package_root" ]]; then
    ops_fail "CONTROLLER_PACKAGE_ROOT_INVALID" "bootstrap"
    return
  fi
  ops_verify_controller_at "$package_manifest" "${package_root}/payload" || return

  if [[ -e "$OPS_ROOT" || -L "$OPS_ROOT" ]]; then
    if [[ ! -d "$OPS_ROOT" || -L "$OPS_ROOT" ]]; then
      ops_fail "PRODUCTION_ROOT_COLLISION" "bootstrap"
      return
    fi
    ops_preflight_controller_only || return
    if [[ "$(ops_sha256_file "${OPS_ROOT}/${OPS_CONTROLLER_MANIFEST_NAME}")" !=
          "$(ops_sha256_file "$package_manifest")" ]]; then
      ops_fail "CONTROLLER_UPGRADE_NOT_ADMITTED" "bootstrap"
      return
    fi
    ops_verify_installed_controller
    return
  fi
  local parent="${OPS_ROOT%/*}"
  if [[ "$parent" != "/srv" || ! -d "$parent" || -L "$parent" ||
        "$(ops_stat_value '%u' "$parent")" != "0" ]]; then
    ops_fail "PRODUCTION_ROOT_PARENT_INVALID" "bootstrap"
    return
  fi
  local parent_mode
  parent_mode="$(ops_stat_value '%a' "$parent")"
  if (( (8#$parent_mode & 0022) != 0 )); then
    ops_fail "PRODUCTION_ROOT_PARENT_WRITABLE" "bootstrap"
    return
  fi

  local jq mv
  jq="$(ops_command jq)" || return
  mv="$(ops_command mv)" || return
  local stage stage_device stage_inode
  ops_create_bootstrap_stage stage || {
    ops_fail "BOOTSTRAP_STAGE_CREATE_FAILED" "bootstrap"
    return "$OPS_MANUAL_RECOVERY_EXIT"
  }
  stage_device="$OPS_BOOTSTRAP_STAGE_DEVICE"
  stage_inode="$OPS_BOOTSTRAP_STAGE_INODE"
  local result=0
  if [[ "$(ops_stat_value '%u:%g:%a' "$stage")" != "0:0:700" ]]; then
    result=1
  else
    ops_update_bootstrap_stage_mode "$stage" 0755 || result=$?
  fi
  local directory
  if [[ "$result" -eq 0 ]]; then
    for directory in \
      bin \
      bin/lib \
      compose \
      observability \
      observability/prometheus \
      releases; do
      ops_install_bootstrap_directory \
        "${stage}/${directory}" 0755 0 0 || result=$?
      [[ "$result" -eq 0 ]] || break
    done
  fi
  if [[ "$result" -eq 0 ]]; then
    for directory in \
      recovery \
      recovery/data \
      recovery/releases \
      secrets; do
      ops_install_bootstrap_directory \
        "${stage}/${directory}" 0700 0 0 || result=$?
      [[ "$result" -eq 0 ]] || break
    done
  fi
  if [[ "$result" -eq 0 ]]; then
    for directory in data data/versions; do
      ops_install_bootstrap_directory \
        "${stage}/${directory}" 1770 0 "$OPS_RUNTIME_GID" || result=$?
      [[ "$result" -eq 0 ]] || break
    done
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_install_bootstrap_directory \
      "${stage}/observability/prometheus/tsdb" \
      0700 "$OPS_API_UID" "$OPS_RUNTIME_GID" || result=$?
  fi

  local relative source destination mode
  if [[ "$result" -eq 0 ]]; then
    for relative in "${OPS_CONTROLLER_FILES[@]}"; do
      source="${package_root}/payload/${relative}"
      destination="${stage}/${relative}"
      mode="$("$jq" -er --arg path "$relative" \
        '.files[] | select(.path == $path) | .mode' "$package_manifest")" ||
        result=$?
      [[ "$result" -eq 0 ]] || break
      ops_install_bootstrap_file "$source" "$destination" "$mode" ||
        result=$?
      [[ "$result" -eq 0 ]] || break
    done
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_install_bootstrap_file \
      "$package_manifest" \
      "${stage}/${OPS_CONTROLLER_MANIFEST_NAME}" 0400 || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_verify_bootstrap_stage "$stage" || result=$?
  fi
  if [[ "$result" -eq 0 ]]; then
    ops_fsync_path "$stage" || result=$?
  fi
  if [[ "$result" -ne 0 ]]; then
    ops_cleanup_bootstrap_stage "$stage" "$stage_device" "$stage_inode" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    return "$result"
  fi

  "$mv" -Tn -- "$stage" "$OPS_ROOT" || result=$?
  if [[ "$result" -ne 0 || ! -d "$OPS_ROOT" || -L "$OPS_ROOT" ||
        "$(ops_stat_value '%d' "$OPS_ROOT")" != "$stage_device" ||
        "$(ops_stat_value '%i' "$OPS_ROOT")" != "$stage_inode" ]]; then
    if [[ -d "$stage" && ! -L "$stage" ]]; then
      ops_cleanup_bootstrap_stage "$stage" "$stage_device" "$stage_inode" ||
        return "$OPS_MANUAL_RECOVERY_EXIT"
    fi
    ops_fail "PRODUCTION_ROOT_PUBLICATION_COLLISION" "bootstrap"
    return
  fi
  ops_fsync_path "$parent" || return
  ops_verify_bootstrap_ledger_at "$OPS_ROOT" || return
  ops_preflight_controller_only || return
  ops_clear_registered_bootstrap_stage
}
