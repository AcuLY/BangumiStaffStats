#!/usr/bin/env bash

set -Eeuo pipefail

ops_verify_fixed_commands() {
  local command
  for command in \
    awk cat chmod chown cmp curl date dd df dirname docker find flock grep \
    install ionice jq ln mkdir mktemp mv nice od readlink rm sha256sum \
    sleep sort stat sync tail tar timeout tr unlink rmdir; do
    ops_command "$command" >/dev/null || return
  done
}

ops_verify_root_topology() {
  ops_require_no_symlink_chain "$OPS_ROOT" || return
  if [[ ! -d "$OPS_ROOT" || -L "$OPS_ROOT" ]]; then
    ops_fail "ROOT_REQUIRED" "preflight"
    return
  fi
  if [[ "$(ops_stat_value '%u' "$OPS_ROOT")" != "0" ]]; then
    ops_fail "ROOT_OWNER_INVALID" "preflight"
    return
  fi
  local root_mode
  root_mode="$(ops_stat_value '%a' "$OPS_ROOT")"
  if (( (8#$root_mode & 0022) != 0 )); then
    ops_fail "ROOT_MODE_INVALID" "preflight"
    return
  fi

  local candidate name
  shopt -s nullglob dotglob
  for candidate in "$OPS_ROOT"/*; do
    name="${candidate##*/}"
    case "$name" in
      bin|compose|controller-manifest.json|current-frontend|data|observability|recovery|releases|secrets) ;;
      *)
        ops_fail "UNKNOWN_ROOT_ENTRY" "preflight"
        return
        ;;
    esac
  done
  shopt -u nullglob dotglob

  ops_require_directory "${OPS_ROOT}/bin" 0 0 755 || return
  ops_require_directory "${OPS_ROOT}/bin/lib" 0 0 755 || return
  ops_require_directory "${OPS_ROOT}/compose" 0 0 755 || return
  ops_require_directory "${OPS_ROOT}/observability" 0 0 755 || return
  ops_require_directory "${OPS_ROOT}/observability/prometheus" 0 0 755 || return
  ops_require_directory "${OPS_ROOT}/releases" 0 0 755 || return
  ops_require_directory "${OPS_ROOT}/recovery" 0 0 700 || return
  ops_require_directory "${OPS_ROOT}/recovery/data" 0 0 700 || return
  ops_require_directory "${OPS_ROOT}/recovery/releases" 0 0 700 || return
  ops_require_directory "${OPS_ROOT}/secrets" 0 0 700 || return
  ops_require_directory "${OPS_ROOT}/data" 0 "$OPS_RUNTIME_GID" 1770 || return
  ops_require_directory "${OPS_ROOT}/data/versions" 0 "$OPS_RUNTIME_GID" 1770 || return
  ops_require_directory \
    "${OPS_ROOT}/observability/prometheus/tsdb" \
    "$OPS_API_UID" "$OPS_RUNTIME_GID" 700 || return
  local lock_file
  lock_file="$(ops_lock_file)" || return
  ops_require_regular_file "$lock_file" 0 0 600 || return
  ops_verify_installed_controller || return
  ops_verify_closed_controller_directories || return
}

ops_verify_closed_controller_directories() {
  local candidate name
  shopt -s nullglob dotglob
  for candidate in "${OPS_ROOT}/bin"/*; do
    name="${candidate##*/}"
    case "$name" in
      bgmss-ops|lib) ;;
      *)
        ops_fail "UNKNOWN_BIN_ENTRY" "preflight"
        return
        ;;
    esac
  done
  for candidate in "${OPS_ROOT}/bin/lib"/*; do
    name="${candidate##*/}"
    case "$name" in
      common.sh|controller.sh|health.sh|preflight.sh|retention.sh|transaction.sh) ;;
      *)
        ops_fail "UNKNOWN_BIN_LIB_ENTRY" "preflight"
        return
        ;;
    esac
  done
  for candidate in "${OPS_ROOT}/compose"/*; do
    name="${candidate##*/}"
    case "$name" in
      compose.yaml|previous-app.json|release.env|updater-current-deny) ;;
      *)
        ops_fail "UNKNOWN_COMPOSE_ENTRY" "preflight"
        return
        ;;
    esac
  done
  for candidate in "${OPS_ROOT}/observability/prometheus"/*; do
    name="${candidate##*/}"
    case "$name" in
      prometheus.yml|rules.yml|tsdb) ;;
      *)
        ops_fail "UNKNOWN_OBSERVABILITY_ENTRY" "preflight"
        return
        ;;
    esac
  done
  if compgen -G "${OPS_ROOT}/secrets/*" >/dev/null ||
    compgen -G "${OPS_ROOT}/secrets/.[!.]*" >/dev/null; then
    ops_fail "UNDECLARED_SECRET_FILE" "preflight"
    return
  fi
  for candidate in "${OPS_ROOT}/recovery"/*; do
    name="${candidate##*/}"
    case "$name" in
      data|releases) ;;
      rollback-exercised.json)
        ops_require_regular_file "$candidate" 0 0 400 || return
        ops_require_canonical_json "$candidate" "preflight" || return
        local jq
        jq="$(ops_command jq)" || return
        if ! "$jq" -e '
          type == "object" and
          (keys == ["kind","runId","status"]) and
          (.kind | IN("application","data")) and
          (.runId | test("^run-[0-9a-f]{32}$")) and
          .status == "succeeded"
        ' "$candidate" >/dev/null; then
          ops_fail "ROLLBACK_EVIDENCE_INVALID" "preflight"
          return
        fi
        ;;
      manual-run-*.json)
        if [[ ! "$name" =~ ^manual-run-[0-9a-f]{32}\.json$ ]]; then
          ops_fail "UNKNOWN_RECOVERY_ENTRY" "preflight"
          return
        fi
        ops_require_regular_file "$candidate" 0 0 400 || return
        ;;
      *)
        ops_fail "UNKNOWN_RECOVERY_ENTRY" "preflight"
        return
        ;;
    esac
  done
  for candidate in "${OPS_ROOT}/recovery/data"/*; do
    name="${candidate##*/}"
    if [[ ! "$name" =~ ^dv1-[0-9a-f]{64}\.json$ ]]; then
      ops_fail "UNKNOWN_DATA_RECOVERY_ENTRY" "preflight"
      return
    fi
    ops_require_regular_file "$candidate" 0 0 400 || return
    ops_verify_managed_data_version "${name%.json}" || return
  done
  for candidate in "${OPS_ROOT}/recovery/releases"/*; do
    name="${candidate##*/}"
    if ! ops_is_version "$name" || [[ ! -d "$candidate" || -L "$candidate" ]]; then
      ops_fail "UNKNOWN_RELEASE_RECOVERY_ENTRY" "preflight"
      return
    fi
    ops_verify_managed_release "$name" || return
  done
  for candidate in "${OPS_ROOT}/releases"/*; do
    name="${candidate##*/}"
    if ! ops_is_version "$name" || [[ ! -d "$candidate" || -L "$candidate" ]]; then
      ops_fail "UNKNOWN_RELEASE_ENTRY" "preflight"
      return
    fi
    if [[ ! -d "${OPS_ROOT}/recovery/releases/${name}" ]]; then
      ops_fail "UNMANAGED_RELEASE_ENTRY" "preflight"
      return
    fi
  done
  shopt -u nullglob dotglob
}

ops_verify_active_runtime_layout() {
  ops_require_regular_file "${OPS_ROOT}/data/current.json" 0 0 644 || return
  ops_require_regular_file "${OPS_ROOT}/compose/release.env" 0 0 600 || return
  if [[ -e "${OPS_ROOT}/data/previous.json" ]]; then
    ops_require_regular_file "${OPS_ROOT}/data/previous.json" 0 0 600 || return
  fi
  if [[ -e "${OPS_ROOT}/data/update-status.json" ]]; then
    ops_require_regular_file \
      "${OPS_ROOT}/data/update-status.json" \
      "$OPS_UPDATER_UID" "$OPS_RUNTIME_GID" 600 || return
  fi
  if [[ -e "${OPS_ROOT}/compose/previous-app.json" ]]; then
    ops_require_regular_file \
      "${OPS_ROOT}/compose/previous-app.json" 0 0 600 || return
    ops_read_previous_frontend >/dev/null || return
  fi
  ops_readlink_frontend >/dev/null || return
}

ops_verify_install_runtime_layout() {
  ops_require_regular_file "${OPS_ROOT}/data/current.json" 0 0 644 || return
  local has_env="no"
  local has_frontend="no"
  [[ -f "${OPS_ROOT}/compose/release.env" &&
     ! -L "${OPS_ROOT}/compose/release.env" ]] && has_env="yes"
  [[ -L "${OPS_ROOT}/current-frontend" ]] && has_frontend="yes"
  if [[ "$has_env" != "$has_frontend" ]]; then
    ops_fail "PARTIAL_ACTIVE_APP_STATE" "preflight"
    return
  fi
  if [[ "$has_env" == "yes" ]]; then
    ops_require_regular_file "${OPS_ROOT}/compose/release.env" 0 0 600 || return
    ops_readlink_frontend >/dev/null || return
  fi
  if [[ -e "${OPS_ROOT}/compose/previous-app.json" ]]; then
    ops_require_regular_file \
      "${OPS_ROOT}/compose/previous-app.json" 0 0 600 || return
    ops_read_previous_frontend >/dev/null || return
  fi
}

ops_verify_free_space() {
  local required_kib="${1:-$OPS_MIN_FREE_KIB}"
  if [[ ! "$required_kib" =~ ^[1-9][0-9]*$ ]]; then
    ops_fail "SPACE_ARGUMENT_INVALID" "preflight"
    return
  fi
  local df awk available
  df="$(ops_command df)" || return
  awk="$(ops_command awk)" || return
  available="$("$df" -Pk -- "$OPS_ROOT" | "$awk" 'NR == 2 { print $4 }')"
  if [[ ! "$available" =~ ^[0-9]+$ || "$available" -lt "$required_kib" ]]; then
    ops_fail "INSUFFICIENT_SPACE" "preflight"
    return
  fi
}

ops_verify_version_directory() {
  local directory="$1"
  local data_version="${directory##*/}"
  if ! ops_is_data_version "$data_version"; then
    ops_fail "DATA_VERSION_NAME_INVALID" "inventory"
    return
  fi
  if [[ ! -d "$directory" || -L "$directory" ||
        "$(ops_stat_value '%u' "$directory")" != "$OPS_ROOT_UID" ||
        "$(ops_stat_value '%g' "$directory")" != "$OPS_RUNTIME_GID" ||
        "$(ops_stat_value '%a' "$directory")" != "550" ]]; then
    ops_fail "DATA_VERSION_OWNER_INVALID" "inventory"
    return
  fi
  local candidate name count=0
  shopt -s nullglob dotglob
  for candidate in "$directory"/*; do
    name="${candidate##*/}"
    case "$name" in
      bangumi.sqlite|manifest.json) ;;
      *)
        ops_fail "DATA_VERSION_ENTRY_INVALID" "inventory"
        return
        ;;
    esac
    if [[ ! -f "$candidate" || -L "$candidate" ||
          "$(ops_stat_value '%h' "$candidate")" != "1" ||
          "$(ops_stat_value '%u' "$candidate")" != "$OPS_ROOT_UID" ||
          "$(ops_stat_value '%g' "$candidate")" != "$OPS_RUNTIME_GID" ||
          "$(ops_stat_value '%a' "$candidate")" != "440" ||
          "$(ops_stat_value '%d' "$candidate")" != \
            "$(ops_stat_value '%d' "$directory")" ]]; then
      ops_fail "DATA_VERSION_FILE_INVALID" "inventory"
      return
    fi
    count=$((count + 1))
  done
  shopt -u nullglob dotglob
  if [[ "$count" -ne 2 ]]; then
    ops_fail "DATA_VERSION_INCOMPLETE" "inventory"
    return
  fi
}

ops_verify_data_inventory() {
  local candidate name
  shopt -s nullglob dotglob
  for candidate in "${OPS_ROOT}/data"/*; do
    name="${candidate##*/}"
    case "$name" in
      current.json|previous.json|update-status.json) ;;
      versions)
        if [[ ! -d "$candidate" || -L "$candidate" ]]; then
          ops_fail "VERSIONS_DIRECTORY_INVALID" "inventory"
          return
        fi
        local version_directory
        for version_directory in "$candidate"/*; do
          [[ -e "$version_directory" ]] || continue
          ops_verify_version_directory "$version_directory" || return
        done
        ;;
      .bgmss-stage-*)
        if [[ ! -d "$candidate" || -L "$candidate" ||
              "$(ops_stat_value '%u' "$candidate")" != "$OPS_UPDATER_UID" ||
              "$(ops_stat_value '%g' "$candidate")" != "$OPS_RUNTIME_GID" ]]; then
          ops_fail "UPDATER_STAGE_INVALID" "inventory"
          return
        fi
        ;;
      *)
        ops_fail "UNKNOWN_DATA_ENTRY" "inventory"
        return
        ;;
    esac
  done
  shopt -u nullglob dotglob
}

ops_preflight() {
  ops_verify_fixed_commands || return
  ops_verify_root_topology || return
  ops_verify_active_runtime_layout || return
  ops_verify_data_inventory || return
  ops_verify_free_space "$OPS_MIN_FREE_KIB"
}

ops_preflight_controller_only() {
  ops_verify_fixed_commands || return
  ops_verify_root_topology || return
  ops_verify_data_inventory || return
  ops_verify_free_space "$OPS_MIN_FREE_KIB"
}

ops_preflight_for_install() {
  ops_verify_fixed_commands || return
  ops_verify_root_topology || return
  ops_verify_install_runtime_layout || return
  ops_verify_data_inventory || return
  ops_verify_free_space "$OPS_MIN_FREE_KIB"
}
