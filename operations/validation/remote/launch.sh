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
readonly input="${root}/incoming/validation-input-v1.json"
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

[[ "$#" -eq 5 ]] || fail
readonly run_id="$1"
readonly input_digest="$2"
readonly entry_digest="$3"
readonly marker_digest="$4"
readonly expected_head="$5"
[[ "$run_id" =~ ^run-[0-9a-f]{32}$ ]] || fail
[[ "$input_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail
[[ "$entry_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail
[[ "$marker_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail
[[ "$expected_head" =~ ^sha256:[0-9a-f]{64}$ ]] || fail
[[ "$(id -u)" == "0" && -d "$root" && ! -L "$root" ]] || fail
[[ "$(stat -c '%u:%g:%a' -- "$root")" == "0:0:700" ]] || fail
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
[[ "sha256:$(sha256sum -- "$marker_fd_path" | awk '{print $1}')" == \
     "$marker_digest" ]] || fail
jq -cS . "$marker_fd_path" | cmp --silent "$marker_fd_path" - || fail
jq -e \
  --arg agentDigest "sha256:$(sha256sum -- "$agent_fd_path" | awk '{print $1}')" \
  --arg input "$input_digest" \
  --arg ledgerDevice "$(stat -Lc '%d' -- "$ledger_bootstrap_fd_path")" \
  --arg ledgerInode "$(stat -Lc '%i' -- "$ledger_bootstrap_fd_path")" \
  --arg libraryDigest "sha256:$(sha256sum -- "$library_fd_path" | awk '{print $1}')" \
  --arg run "$run_id" \
  --arg device "$(stat -Lc '%d' -- "/proc/self/fd/${root_fd}")" \
  --arg inode "$(stat -Lc '%i' -- "/proc/self/fd/${root_fd}")" '
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
[[ "$ledger_head" == "$expected_head" ]] || fail

verify_transferred_identity() {
  local relative="$1"
  local identity
  identity="$(
    jq -cse \
      --arg path "$relative" '
        [
          .[] |
          select(.payload.details.identity.path? == $path)
        ] |
        last |
        select(.payload.event == "transfer-closed") |
        .payload.details.identity
      ' "$ledger_fd_path"
  )" || return
  ledger_verify_identity "$identity"
}

input_fd=""
open_regular_fd "$input" read "0:0:1:400" input_fd || fail
readonly input_fd_path="/proc/self/fd/${input_fd}"
[[ "sha256:$(sha256sum -- "$input_fd_path" | awk '{print $1}')" == \
     "$input_digest" ]] || fail
verify_transferred_identity "incoming/validation-input-v1.json" || fail
jq -cS . "$input_fd_path" | cmp --silent "$input_fd_path" - || fail
jq -e --arg run "$run_id" '
  type == "object" and
  .schemaVersion == "operations-validation-input-v1" and
  .runId == $run and
  (.transfer | type == "object") and
  (.transfer.files | type == "array" and length == 18) and
  .transfer.fileCount == 18 and
  ([.transfer.files[].id] | unique | length) == 18 and
  ([.transfer.files[].role] | unique | length) == 18 and
  all(.transfer.files[];
    (keys == ["id","mode","remoteName","role","sha256","size"]) and
    (.id | test("^f[0-9]{4}$")) and
    .remoteName == ("files/" + .id) and
    (.mode | IN("0400","0500")) and
    (.sha256 | test("^sha256:[0-9a-f]{64}$")) and
    (.size | type == "number" and . >= 1 and . <= 8589934592)
  )
' "$input_fd_path" >/dev/null || fail

mapfile -t descriptors < <(
  jq -er '.transfer.files[] | [.id,.mode,.sha256,(.size|tostring)] | @tsv' \
    "$input_fd_path"
)
[[ "${#descriptors[@]}" -eq 18 ]] || fail
declare -A admitted=()
for descriptor in "${descriptors[@]}"; do
  IFS=$'\t' read -r identifier mode digest size <<< "$descriptor"
  [[ "$identifier" =~ ^f[0-9]{4}$ &&
     "$mode" =~ ^0[45]00$ &&
     "$digest" =~ ^sha256:[0-9a-f]{64}$ &&
     "$size" =~ ^[1-9][0-9]{0,18}$ ]] || fail
  candidate="${root}/incoming/files/${identifier}"
  candidate_fd=""
  open_regular_fd \
    "$candidate" read "0:0:1:${mode#0}" candidate_fd || fail
  [[ "$(stat -Lc '%s' "/proc/self/fd/${candidate_fd}")" == "$size" &&
     "sha256:$(sha256sum "/proc/self/fd/${candidate_fd}" | awk '{print $1}')" == \
       "$digest" ]] || fail
  verify_transferred_identity "incoming/files/${identifier}" || fail
  admitted["$identifier"]=1
  exec {candidate_fd}>&-
done

actual_count=0
while IFS= read -r -d '' candidate; do
  identifier="${candidate##*/}"
  [[ -n "${admitted[$identifier]+present}" ]] || fail
  actual_count=$((actual_count + 1))
done < <(find "${root}/incoming/files" -mindepth 1 -maxdepth 1 -print0)
[[ "$actual_count" -eq 18 ]] || fail

readonly entry_id="$(jq -er '.runtime.remoteEntryFileId' "$input_fd_path")"
readonly entry="${root}/incoming/files/${entry_id}"
entry_fd=""
open_regular_fd "$entry" read "0:0:1:500" entry_fd || fail
[[ "sha256:$(sha256sum "/proc/self/fd/${entry_fd}" | awk '{print $1}')" == \
     "$entry_digest" ]] || fail
exec /usr/bin/bash "/proc/self/fd/${entry_fd}" \
  "$run_id" "$input_digest" "$marker_digest" "$expected_head"
