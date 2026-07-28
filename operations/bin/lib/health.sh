#!/usr/bin/env bash

set -Eeuo pipefail

declare -Ag OPS_RELEASE_ENV=()

ops_load_release_env() {
  local source="${1:-${OPS_ROOT}/compose/release.env}"
  if [[ ! -f "$source" || -L "$source" ]]; then
    ops_fail "RELEASE_ENV_REQUIRED" "identity"
    return
  fi
  OPS_RELEASE_ENV=()
  local line name value
  local -a observed_order=()
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ ! "$line" =~ ^(BGMSS_[A-Z_]+)=([A-Za-z0-9._:/@+-]+)$ ]]; then
      ops_fail "RELEASE_ENV_SYNTAX" "identity"
      return
    fi
    name="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    if [[ -v "OPS_RELEASE_ENV[$name]" ]]; then
      ops_fail "RELEASE_ENV_DUPLICATE" "identity"
      return
    fi
    OPS_RELEASE_ENV["$name"]="$value"
    observed_order+=("$name")
  done < "$source"
  local expected=(
    BGMSS_API_IMAGE
    BGMSS_APP_REVISION
    BGMSS_APP_VERSION
    BGMSS_COMMON_COMMIT
    BGMSS_RELEASE_MANIFEST_DIGEST
    BGMSS_RELEASE_ROOT
    BGMSS_UPDATER_IMAGE
  )
  if [[ "${#OPS_RELEASE_ENV[@]}" -ne "${#expected[@]}" ]]; then
    ops_fail "RELEASE_ENV_FIELD_SET" "identity"
    return
  fi
  if [[ "${observed_order[*]}" != "${expected[*]}" ]]; then
    ops_fail "RELEASE_ENV_ORDER" "identity"
    return
  fi
  local tail od tr final_byte
  tail="$(ops_command tail)" || return
  od="$(ops_command od)" || return
  tr="$(ops_command tr)" || return
  final_byte="$("$tail" -c 1 -- "$source" | "$od" -An -tx1 |
    "$tr" -d ' \n')" || return
  if [[ "$final_byte" != "0a" ]]; then
    ops_fail "RELEASE_ENV_TERMINATOR" "identity"
    return
  fi
  for name in "${expected[@]}"; do
    if [[ ! -v "OPS_RELEASE_ENV[$name]" ]]; then
      ops_fail "RELEASE_ENV_FIELD_SET" "identity"
      return
    fi
  done
  ops_is_git_oid "${OPS_RELEASE_ENV[BGMSS_APP_REVISION]}" || {
    ops_fail "APP_REVISION_INVALID" "identity"
    return
  }
  ops_is_git_oid "${OPS_RELEASE_ENV[BGMSS_COMMON_COMMIT]}" || {
    ops_fail "COMMON_COMMIT_INVALID" "identity"
    return
  }
  ops_is_version "${OPS_RELEASE_ENV[BGMSS_APP_VERSION]}" || {
    ops_fail "APP_VERSION_INVALID" "identity"
    return
  }
  ops_is_sha256 "${OPS_RELEASE_ENV[BGMSS_RELEASE_MANIFEST_DIGEST]}" || {
    ops_fail "MANIFEST_DIGEST_INVALID" "identity"
    return
  }
  if [[ "${OPS_RELEASE_ENV[BGMSS_RELEASE_ROOT]}" !=
        "${OPS_ROOT}/releases/${OPS_RELEASE_ENV[BGMSS_APP_VERSION]}" ]]; then
    ops_fail "RELEASE_ROOT_INVALID" "identity"
    return
  fi
  if [[ "$OPS_PROFILE" == "production" ]]; then
    ops_is_digest_image "${OPS_RELEASE_ENV[BGMSS_API_IMAGE]}" || {
      ops_fail "API_IMAGE_INVALID" "identity"
      return
    }
    ops_is_digest_image "${OPS_RELEASE_ENV[BGMSS_UPDATER_IMAGE]}" || {
      ops_fail "UPDATER_IMAGE_INVALID" "identity"
      return
    }
  elif [[ "${OPS_RELEASE_ENV[BGMSS_API_IMAGE]}" !=
          "localhost/bgmss-ops-validation-api:${OPS_RELEASE_ENV[BGMSS_APP_REVISION]}-amd64" ||
          "${OPS_RELEASE_ENV[BGMSS_UPDATER_IMAGE]}" !=
          "localhost/bgmss-ops-validation-updater:${OPS_RELEASE_ENV[BGMSS_APP_REVISION]}-amd64" ]]; then
    ops_fail "VALIDATION_IMAGE_ALIAS_INVALID" "identity"
    return
  fi
}

ops_read_current_field() {
  local source="$1"
  local field="$2"
  local jq
  jq="$(ops_command jq)" || return
  ops_require_canonical_json "$source" "identity" || return
  if ! "$jq" -e '
    type == "object" and
    (keys == ["dataVersion","manifestDigest","pointerSchemaVersion"]) and
    .pointerSchemaVersion == 1 and
    (.dataVersion | test("^dv1-[0-9a-f]{64}$")) and
    (.manifestDigest | test("^sha256:[0-9a-f]{64}$"))
  ' "$source" >/dev/null; then
    ops_fail "CURRENT_POINTER_INVALID" "identity"
    return
  fi
  case "$field" in
    dataVersion|manifestDigest)
      "$jq" -er --arg field "$field" '.[$field]' "$source"
      ;;
    *)
      ops_fail "CURRENT_FIELD_INVALID" "identity"
      return
      ;;
  esac
}

ops_metric_identity_matches() {
  local metrics_file="$1"
  local app_version="$2"
  local app_revision="$3"
  local data_version="$4"
  local awk
  awk="$(ops_command awk)" || return
  "$awk" \
    -v version="$app_version" \
    -v revision="$app_revision" \
    -v data="$data_version" '
      /^bgmss_build_info\{/ &&
        index($1, "version=\"" version "\"") &&
        index($1, "commit=\"" revision "\"") &&
        $2 == "1" { build = 1 }
      /^bgmss_current_snapshot_info\{/ &&
        index($1, "data_version=\"" data "\"") &&
        $2 == "1" { snapshot = 1 }
      END { exit !(build && snapshot) }
    ' "$metrics_file"
}

ops_cleanup_health_temporaries() {
  local result=0
  local temporary
  for temporary in "$@"; do
    [[ -n "$temporary" ]] || continue
    ops_cleanup_registered_temporary_path "$temporary" || result=$?
  done
  return "$result"
}

ops_health_once() {
  local expected_data="$1"
  local environment_file="$2"
  ops_load_release_env "$environment_file" || return
  local curl jq
  curl="$(ops_command curl)" || return
  jq="$(ops_command jq)" || return
  local ready="" metrics="" catalog="" query="" query_response=""
  local creation_result
  ops_make_temporary_file \
    ready "${OPS_ROOT}/recovery/.ready.XXXXXXXX" || return
  ops_make_temporary_file \
    metrics "${OPS_ROOT}/recovery/.metrics.XXXXXXXX" || {
    creation_result=$?
    ops_cleanup_health_temporaries "$ready" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    return "$creation_result"
  }
  ops_make_temporary_file \
    catalog "${OPS_ROOT}/recovery/.catalog.XXXXXXXX" || {
    creation_result=$?
    ops_cleanup_health_temporaries "$ready" "$metrics" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    return "$creation_result"
  }
  ops_make_temporary_file \
    query "${OPS_ROOT}/recovery/.query.XXXXXXXX" || {
    creation_result=$?
    ops_cleanup_health_temporaries "$ready" "$metrics" "$catalog" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    return "$creation_result"
  }
  ops_make_temporary_file \
    query_response "${OPS_ROOT}/recovery/.query-response.XXXXXXXX" || {
    creation_result=$?
    ops_cleanup_health_temporaries \
      "$ready" "$metrics" "$catalog" "$query" ||
      return "$OPS_MANUAL_RECOVERY_EXIT"
    return "$creation_result"
  }
  local maximum_response_bytes=1048576
  local result=0
  if ! "$curl" --fail --silent --show-error --max-time 5 \
    --max-filesize "$maximum_response_bytes" \
    "http://127.0.0.1:${OPS_PORT}/readyz" > "$ready"; then
    result=1
  elif ! "$jq" -e --arg data "$expected_data" \
    '.meta.dataVersion == $data' "$ready" >/dev/null; then
    result=1
  elif ! "$curl" --fail --silent --show-error --max-time 5 \
    --max-filesize "$maximum_response_bytes" \
    "http://127.0.0.1:${OPS_PORT}/metrics" > "$metrics"; then
    result=1
  elif ! ops_metric_identity_matches \
    "$metrics" \
    "${OPS_RELEASE_ENV[BGMSS_APP_VERSION]}" \
    "${OPS_RELEASE_ENV[BGMSS_APP_REVISION]}" \
    "$expected_data"; then
    result=1
  elif ! "$curl" --fail --silent --show-error --max-time 10 \
    --max-filesize "$maximum_response_bytes" \
    "http://127.0.0.1:${OPS_PORT}/api/v1/catalog" > "$catalog"; then
    result=1
  elif ! "$jq" -e --arg data "$expected_data" \
    '.meta.dataVersion == $data and (.data.positions | type == "array")' \
    "$catalog" >/dev/null; then
    result=1
  elif ! "$jq" -ceS '
    first(
      .data.positions[] |
      select(
        .status == "selectable" and
        (.capabilities | type == "array" and index("rankings") != null)
      )
    ) |
    select(
      type == "object" and
      (.key | type == "string" and length > 0 and length <= 96) and
      (.subjectType | type == "string" and length > 0 and length <= 32)
    ) |
    {
      query:{
        positionKeys:[.key],
        scope:"global",
        subjectType:.subjectType
      },
      view:{
        order:"desc",
        page:1,
        pageSize:5,
        sort:"count"
      }
    }
  ' "$catalog" > "$query"; then
    result=1
  elif [[ "$(ops_stat_value '%s' "$query")" -gt 4096 ]]; then
    result=1
  elif ! "$curl" --fail --silent --show-error --max-time 30 \
    --max-filesize "$maximum_response_bytes" \
    --header 'Content-Type: application/json' \
    --data-binary "@${query}" \
    "http://127.0.0.1:${OPS_PORT}/api/v1/rankings" > "$query_response"; then
    result=1
  elif ! "$jq" -e --arg data "$expected_data" '
    .meta.dataVersion == $data and
    .meta.pagination.page == 1 and
    .meta.pagination.pageSize == 5 and
    (.data.items | type == "array" and length <= 5)
  ' "$query_response" >/dev/null; then
    result=1
  fi
  ops_cleanup_health_temporaries \
    "$ready" "$metrics" "$catalog" "$query" "$query_response" ||
    return "$OPS_MANUAL_RECOVERY_EXIT"
  return "$result"
}

ops_wait_healthy() {
  local expected_data="$1"
  local environment_file="${2:-${OPS_ROOT}/compose/release.env}"
  local date sleep
  date="$(ops_command date)" || return
  sleep="$(ops_command sleep)" || return
  local start now
  start="$("$date" +%s)"
  while true; do
    if ops_health_once "$expected_data" "$environment_file"; then
      return 0
    fi
    now="$("$date" +%s)"
    if (( now - start >= OPS_READY_TIMEOUT_SECONDS )); then
      ops_fail "READINESS_TIMEOUT" "readiness"
      return
    fi
    "$sleep" 1
  done
}

ops_verify_manifest_identity() {
  ops_load_release_env "${OPS_ROOT}/compose/release.env" || return
  local manifest="${OPS_RELEASE_ENV[BGMSS_RELEASE_ROOT]}/release-manifest.json"
  if [[ ! -f "$manifest" || -L "$manifest" ]]; then
    ops_fail "RELEASE_MANIFEST_MISSING" "check"
    return
  fi
  if [[ "$(ops_sha256_file "$manifest")" !=
        "${OPS_RELEASE_ENV[BGMSS_RELEASE_MANIFEST_DIGEST]}" ]]; then
    ops_fail "RELEASE_MANIFEST_MISMATCH" "check"
    return
  fi
  local data_version data_manifest expected_manifest
  data_version="$(ops_read_current_field "${OPS_ROOT}/data/current.json" dataVersion)" || return
  expected_manifest="$(ops_read_current_field "${OPS_ROOT}/data/current.json" manifestDigest)" || return
  data_manifest="${OPS_ROOT}/data/versions/${data_version}/manifest.json"
  if [[ "$(ops_sha256_file "$data_manifest")" != "$expected_manifest" ]]; then
    ops_fail "DATA_MANIFEST_MISMATCH" "check"
    return
  fi
}

ops_check_rss() {
  local container_id
  container_id="$(ops_compose ps -q api)"
  if [[ ! "$container_id" =~ ^[0-9a-f]{12,64}$ ]]; then
    ops_fail "API_CONTAINER_ID_INVALID" "check"
    return
  fi
  local docker
  docker="$(ops_command docker)" || return
  local pid
  pid="$("$docker" inspect --format '{{.State.Pid}}' "$container_id")"
  if [[ ! "$pid" =~ ^[1-9][0-9]*$ || ! -r "/proc/${pid}/status" ]]; then
    ops_fail "API_PID_INVALID" "check"
    return
  fi
  local awk rss
  awk="$(ops_command awk)" || return
  rss="$("$awk" '/^VmRSS:/ { print $2; found=1 } END { if (!found) exit 1 }' "/proc/${pid}/status")"
  if [[ ! "$rss" =~ ^[0-9]+$ || "$rss" -gt "$OPS_API_RSS_LIMIT_KIB" ]]; then
    ops_fail "API_RSS_EXCEEDED" "check"
    return
  fi
}

ops_check_archive_age() {
  local status="${OPS_ROOT}/data/update-status.json"
  local jq date
  jq="$(ops_command jq)" || return
  date="$(ops_command date)" || return
  ops_require_regular_file \
    "$status" "$OPS_UPDATER_UID" "$OPS_RUNTIME_GID" 600 || return
  ops_updater_status status >/dev/null || return
  local successful
  successful="$("$jq" -er '.last_success.time' "$status")" || {
    ops_fail "ARCHIVE_SUCCESS_MISSING" "check"
    return
  }
  local successful_epoch now
  successful_epoch="$("$date" -u -d "$successful" +%s)" || {
    ops_fail "ARCHIVE_SUCCESS_TIME_INVALID" "check"
    return
  }
  now="$("$date" +%s)"
  if (( now - successful_epoch > OPS_ARCHIVE_STALE_SECONDS )); then
    ops_fail "ARCHIVE_STALE" "check"
    return
  fi
}

ops_check_bounded_api_logs() {
  local docker timeout
  docker="$(ops_command docker)" || return
  timeout="$(ops_command timeout)" || return
  if ! "$timeout" --signal=TERM --kill-after=5s 15s \
    "$docker" compose \
      --project-name "$OPS_PROJECT" \
      --file "${OPS_ROOT}/compose/compose.yaml" \
      --env-file "${OPS_ROOT}/compose/release.env" \
      logs --since 5m --tail 200 --no-color api >/dev/null; then
    ops_fail "API_LOG_CHECK_FAILED" "check"
    return
  fi
}

ops_run_checks() {
  ops_preflight || return
  ops_verify_manifest_identity || return
  local data_version
  data_version="$(ops_read_current_field "${OPS_ROOT}/data/current.json" dataVersion)" || return
  ops_verify_managed_release "${OPS_RELEASE_ENV[BGMSS_APP_VERSION]}" || return
  ops_verify_managed_data_version "$data_version" || return
  OPS_MANIFEST=(
    [appRevision]="${OPS_RELEASE_ENV[BGMSS_APP_REVISION]}"
    [appVersion]="${OPS_RELEASE_ENV[BGMSS_APP_VERSION]}"
    [archiveSmokeDigest]="$(ops_manifest_value \
      "${OPS_RELEASE_ENV[BGMSS_RELEASE_ROOT]}/release-manifest.json" \
      '.assets.archiveSmoke.sha256')"
    [releaseRoot]="${OPS_RELEASE_ENV[BGMSS_RELEASE_ROOT]}"
  )
  ops_verify_archive_version "$data_version" >/dev/null || return
  ops_wait_healthy "$data_version" || return
  ops_check_rss || return
  ops_check_archive_age || return
  ops_check_bounded_api_logs
}
