#!/usr/bin/env bash

# This file is sourced only through an already-open descriptor after its bytes
# and descriptor identity have been authenticated by the immutable marker.

readonly ledger_root="/srv/bgmss-ops-validation"
readonly ledger_path="${ledger_root}/.ownership-ledger.jsonl"
readonly ledger_marker="${ledger_root}/.validation-owner.json"
readonly ledger_agent="${ledger_root}/.transfer-agent"
readonly ledger_library="${ledger_root}/.ownership-ledger-lib"
readonly ledger_lease="${ledger_root}/.transfer-lease.json"

ledger_head=""
ledger_sequence="-1"
ledger_transaction_active="no"
ledger_transaction_fd=""
ledger_authority_fd=""
ledger_fd_path=""

ledger_sha_file() {
  printf 'sha256:%s\n' "$(sha256sum -- "$1" | awk '{print $1}')"
}

ledger_sha_fd() {
  local descriptor="$1"
  [[ "$descriptor" =~ ^[0-9]+$ && -e "/proc/self/fd/${descriptor}" ]] ||
    return 1
  ledger_sha_file "/proc/self/fd/${descriptor}"
}

ledger_open_regular_nofollow() {
  local candidate="$1"
  local access="$2"
  local expected="$3"
  local output_name="$4"
  local descriptor descriptor_state path_state
  [[ "$output_name" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ &&
     -f "$candidate" && ! -L "$candidate" ]] || return 1
  case "$access" in
    read)
      exec {descriptor}<"$candidate" || return
      ;;
    read-write)
      exec {descriptor}<>"$candidate" || return
      ;;
    *)
      return 1
      ;;
  esac
  [[ -f "$candidate" && ! -L "$candidate" ]] || {
    exec {descriptor}>&-
    return 1
  }
  descriptor_state="$(
    stat -Lc '%d:%i:%u:%g:%h:%a:%F' -- "/proc/self/fd/${descriptor}"
  )" || {
    exec {descriptor}>&-
    return 1
  }
  path_state="$(stat -Lc '%d:%i:%u:%g:%h:%a:%F' -- "$candidate")" || {
    exec {descriptor}>&-
    return 1
  }
  [[ "$descriptor_state" == "$path_state" &&
     "$(stat -Lc '%u:%g:%h:%a' "/proc/self/fd/${descriptor}")" == \
       "$expected" &&
     "$descriptor_state" == *":regular file" ]] || {
    exec {descriptor}>&-
    return 1
  }
  printf -v "$output_name" '%s' "$descriptor"
}

ledger_assert_fd_path() {
  local descriptor="$1"
  local candidate="$2"
  local expected="$3"
  local descriptor_state path_state
  [[ "$descriptor" =~ ^[0-9]+$ && -f "$candidate" && ! -L "$candidate" ]] ||
    return 1
  descriptor_state="$(
    stat -Lc '%d:%i:%u:%g:%h:%a:%F' -- "/proc/self/fd/${descriptor}"
  )" || return
  path_state="$(stat -Lc '%d:%i:%u:%g:%h:%a:%F' -- "$candidate")" || return
  [[ "$descriptor_state" == "$path_state" &&
     "$(stat -Lc '%u:%g:%h:%a' "/proc/self/fd/${descriptor}")" == \
       "$expected" &&
     "$descriptor_state" == *":regular file" ]]
}

ledger_open_authority() {
  local expected_device="$1"
  local expected_inode="$2"
  [[ "$expected_device" =~ ^[0-9]+$ && "$expected_inode" =~ ^[0-9]+$ &&
     -z "$ledger_authority_fd" ]] || return 1
  ledger_open_regular_nofollow \
    "$ledger_path" read-write "0:0:1:600" ledger_authority_fd || return
  ledger_fd_path="/proc/self/fd/${ledger_authority_fd}"
  [[ "$(stat -Lc '%d' -- "$ledger_fd_path")" == "$expected_device" &&
     "$(stat -Lc '%i' -- "$ledger_fd_path")" == "$expected_inode" ]] || {
    exec {ledger_authority_fd}>&-
    ledger_authority_fd=""
    ledger_fd_path=""
    return 1
  }
}

ledger_adopt_authority() {
  local descriptor="$1"
  local expected_device="$2"
  local expected_inode="$3"
  [[ "$descriptor" =~ ^[0-9]+$ &&
     "$expected_device" =~ ^[0-9]+$ &&
     "$expected_inode" =~ ^[0-9]+$ &&
     -z "$ledger_authority_fd" ]] || return 1
  ledger_assert_fd_path "$descriptor" "$ledger_path" "0:0:1:600" || return
  [[ "$(stat -Lc '%d' -- "/proc/self/fd/${descriptor}")" == \
       "$expected_device" &&
     "$(stat -Lc '%i' -- "/proc/self/fd/${descriptor}")" == \
       "$expected_inode" ]] || return 1
  ledger_authority_fd="$descriptor"
  ledger_fd_path="/proc/self/fd/${ledger_authority_fd}"
}

ledger_assert_path_binding() {
  [[ "$ledger_authority_fd" =~ ^[0-9]+$ ]] || return 1
  ledger_assert_fd_path "$ledger_authority_fd" "$ledger_path" "0:0:1:600"
}

ledger_close_authority() {
  [[ "$ledger_transaction_active" == "no" ]] || return 1
  if [[ "$ledger_authority_fd" =~ ^[0-9]+$ ]]; then
    exec {ledger_authority_fd}>&-
  fi
  ledger_authority_fd=""
  ledger_fd_path=""
}

ledger_fsync_directory() {
  local candidate="$1"
  local descriptor descriptor_state path_state
  [[ -d "$candidate" && ! -L "$candidate" ]] || return 1
  exec {descriptor}<"$candidate" || return
  descriptor_state="$(stat -Lc '%d:%i:%F' "/proc/self/fd/${descriptor}")" || {
    exec {descriptor}>&-
    return 1
  }
  path_state="$(stat -Lc '%d:%i:%F' "$candidate")" || {
    exec {descriptor}>&-
    return 1
  }
  [[ "$descriptor_state" == "$path_state" &&
     "$descriptor_state" == *":directory" ]] || {
    exec {descriptor}>&-
    return 1
  }
  sync -f -- "/proc/self/fd/${descriptor}" || {
    exec {descriptor}>&-
    return 1
  }
  exec {descriptor}>&-
}

ledger_fsync_parent() {
  local candidate="$1"
  local parent="${candidate%/*}"
  [[ -n "$parent" && "$parent" != "$candidate" ]] || return 1
  ledger_fsync_directory "$parent"
}

ledger_relative_path() {
  local candidate="$1"
  if [[ "$candidate" == "$ledger_root" ]]; then
    printf '.\n'
    return
  fi
  case "$candidate" in
    "$ledger_root"/*)
      candidate="${candidate#${ledger_root}/}"
      ;;
    *)
      return 1
      ;;
  esac
  [[ -n "$candidate" && "$candidate" != */ && "$candidate" != *"//"* &&
     ! "$candidate" =~ (^|/)\.\.?(/|$) &&
     "$candidate" != *$'\n'* && "$candidate" != *$'\r'* &&
     "$candidate" != *$'\t'* ]] || return 1
  printf '%s\n' "$candidate"
}

ledger_directory_digest_fd() {
  local descriptor="$1"
  (
    cd "/proc/self/fd/${descriptor}" || exit
    find . -mindepth 1 -maxdepth 1 -printf '%P\t%y\n' |
      sort |
      sha256sum |
      awk '{print "sha256:" $1}'
  )
}

ledger_identity_json() {
  local candidate="$1"
  local relative type digest metadata target descriptor=""
  relative="$(ledger_relative_path "$candidate")" || return
  [[ -e "$candidate" || -L "$candidate" ]] || return 1
  if [[ -L "$candidate" ]]; then
    local before after
    before="$(stat -c '%d:%i:%a:%u:%g:%h:%s:%Y:%Z' -- "$candidate")" ||
      return
    target="$(readlink -- "$candidate")" || return
    after="$(stat -c '%d:%i:%a:%u:%g:%h:%s:%Y:%Z' -- "$candidate")" ||
      return
    [[ "$before" == "$after" && -L "$candidate" ]] || return 1
    type="symlink"
    metadata="${before//:/$'\t'}"
    digest="sha256:$(printf '%s' "$target" | sha256sum | awk '{print $1}')"
  else
    [[ ( -f "$candidate" || -d "$candidate" ) && ! -L "$candidate" ]] ||
      return 1
    exec {descriptor}<"$candidate" || return
    [[ ! -L "$candidate" &&
       "$(stat -Lc '%d:%i' "/proc/self/fd/${descriptor}")" == \
         "$(stat -Lc '%d:%i' "$candidate")" ]] || {
      exec {descriptor}>&-
      return 1
    }
    if [[ -f "/proc/self/fd/${descriptor}" ]]; then
      type="file"
      digest="$(ledger_sha_fd "$descriptor")" || {
        exec {descriptor}>&-
        return 1
      }
    elif [[ -d "/proc/self/fd/${descriptor}" ]]; then
      type="directory"
      digest="$(ledger_directory_digest_fd "$descriptor")" || {
        exec {descriptor}>&-
        return 1
      }
    else
      exec {descriptor}>&-
      return 1
    fi
    metadata="$(
      stat -Lc '%d	%i	%a	%u	%g	%h	%s	%Y	%Z' \
        "/proc/self/fd/${descriptor}"
    )" || {
      exec {descriptor}>&-
      return 1
    }
    [[ ! -L "$candidate" &&
       "$(stat -Lc '%d:%i' "/proc/self/fd/${descriptor}")" == \
         "$(stat -Lc '%d:%i' "$candidate")" ]] || {
      exec {descriptor}>&-
      return 1
    }
    exec {descriptor}>&-
  fi
  local device inode mode uid gid links size mtime ctime
  IFS=$'\t' read -r device inode mode uid gid links size mtime ctime \
    <<< "$metadata"
  jq -cnS \
    --arg ctime "$ctime" \
    --arg device "$device" \
    --arg digest "$digest" \
    --arg gid "$gid" \
    --arg inode "$inode" \
    --arg links "$links" \
    --arg mode "$mode" \
    --arg mtime "$mtime" \
    --arg path "$relative" \
    --arg size "$size" \
    --arg type "$type" \
    --arg uid "$uid" \
    '{
      ctime:$ctime,
      device:$device,
      digest:$digest,
      gid:$gid,
      inode:$inode,
      links:$links,
      mode:$mode,
      mtime:$mtime,
      path:$path,
      size:$size,
      type:$type,
      uid:$uid
    }'
}

ledger_verify_identity() {
  local expected="$1"
  local relative candidate actual
  relative="$(jq -er '.path' <<< "$expected")" || return
  if [[ "$relative" == "." ]]; then
    candidate="$ledger_root"
  else
    ledger_relative_path "${ledger_root}/${relative}" >/dev/null || return
    candidate="${ledger_root}/${relative}"
  fi
  actual="$(ledger_identity_json "$candidate")" || return
  [[ "$(jq -cS . <<< "$actual")" == "$(jq -cS . <<< "$expected")" ]]
}

ledger_verify_core() {
  local expected="$1"
  local relative candidate actual
  relative="$(jq -er '.path' <<< "$expected")" || return
  if [[ "$relative" == "." ]]; then
    candidate="$ledger_root"
  else
    ledger_relative_path "${ledger_root}/${relative}" >/dev/null || return
    candidate="${ledger_root}/${relative}"
  fi
  actual="$(ledger_identity_json "$candidate")" || return
  jq -e \
    --argjson actual "$actual" \
    --argjson expected "$expected" '
      ($actual | {device,gid,inode,links,mode,path,type,uid}) ==
      ($expected | {device,gid,inode,links,mode,path,type,uid})
    ' >/dev/null
}

ledger_verify_anchor() {
  local expected="$1"
  local relative candidate actual
  relative="$(jq -er '.path' <<< "$expected")" || return
  if [[ "$relative" == "." ]]; then
    candidate="$ledger_root"
  else
    ledger_relative_path "${ledger_root}/${relative}" >/dev/null || return
    candidate="${ledger_root}/${relative}"
  fi
  actual="$(ledger_identity_json "$candidate")" || return
  jq -e \
    --argjson actual "$actual" \
    --argjson expected "$expected" '
      ($actual | {device,gid,inode,mode,path,type,uid}) ==
      ($expected | {device,gid,inode,mode,path,type,uid})
    ' >/dev/null
}

ledger_verify_creation_identity() {
  local expected="$1"
  local relative candidate actual
  relative="$(jq -er '.path' <<< "$expected")" || return
  if [[ "$relative" == "." ]]; then
    candidate="$ledger_root"
  else
    ledger_relative_path "${ledger_root}/${relative}" >/dev/null || return
    candidate="${ledger_root}/${relative}"
  fi
  actual="$(ledger_identity_json "$candidate")" || return
  jq -e \
    --argjson actual "$actual" \
    --argjson expected "$expected" '
      ($actual | {device,inode,path,type}) ==
      ($expected | {device,inode,path,type})
    ' >/dev/null
}

ledger_same_object() {
  local expected="$1"
  local observed="$2"
  jq -e \
    --argjson expected "$expected" \
    --argjson observed "$observed" '
      ($observed | {device,digest,gid,inode,links,mode,size,type,uid}) ==
      ($expected | {device,digest,gid,inode,links,mode,size,type,uid})
    ' >/dev/null
}

ledger_state_machine_stream() {
  jq -cse '
    def exact_keys($keys): (keys == ($keys | sort));
    def identity:
      type == "object" and
      exact_keys([
        "ctime","device","digest","gid","inode","links","mode","mtime",
        "path","size","type","uid"
      ]) and
      all(.[]; type == "string") and
      (.digest | test("^sha256:[0-9a-f]{64}$")) and
      (.path == "." or
        (.path | test("^[^/[:cntrl:]]+(\\/[^/[:cntrl:]]+)*$") and
          (test("(^|\\/)\\.\\.?($|\\/)") | not))) and
      (.type | IN("directory","file","symlink"));
    def expected:
      type == "object" and
      exact_keys(["digest","gid","links","mode","path","size","type","uid"]) and
      (.path | type == "string") and
      (.type | IN("directory","file","symlink"));
    def same_core($left;$right):
      ($left | {device,gid,inode,links,mode,path,type,uid}) ==
      ($right | {device,gid,inode,links,mode,path,type,uid});
    def same_anchor($left;$right):
      ($left | {device,gid,inode,mode,path,type,uid}) ==
      ($right | {device,gid,inode,mode,path,type,uid});
    def same_creation($left;$right):
      ($left | {device,inode,path,type}) ==
      ($right | {device,inode,path,type});
    def same_identity($left;$right): $left == $right;
    def safe_quarantine($path;$quarantine):
      ($quarantine | type == "string") and
      ($quarantine | test("(^|\\/)\\.validation-quarantine-[0-9a-f]{32}$")) and
      (($path | split("/")[:-1]) == ($quarantine | split("/")[:-1]));
    def resource_key($kind;$identity):
      if $kind == "image" then
        $kind + ":" + ($identity.role // error("image role missing"))
      else
        $kind + ":" +
          (($identity.name // error("resource name missing")) |
            ltrimstr("/"))
      end;
    def phase_ok($before;$after;$event):
      if $before == null then $after == "bootstrap"
      elif $before == $after then true
      elif $before == "bootstrap" and $after == "transfer" then
        $event == "phase-open"
      elif $before == "transfer" and $after == "entry-preparing" then
        $event == "object-creating"
      elif $before == "entry-preparing" and $after == "run-owned" then
        $event == "phase-handoff"
      elif $after == "cleanup" then
        ($before | IN("bootstrap","transfer","entry-preparing","run-owned"))
      else false end;
    def closed_event:
      IN(
        "bootstrap-closed","cleanup-closed","runtime-closed",
        "transfer-closed","watchdog-closed","successor-lease-closed"
      );
    reduce .[] as $record (
      {
        namespaces:{},
        phase:null,
        paths:{},
        replacement:null,
        resources:{},
        transferCancel:null,
        trees:{}
      };
      $record.payload as $payload |
      if (
        .transferCancel != null and
        (
          (
            .transferCancel.acknowledged == false and
            $payload.event != "transfer-watchdog-cancel-closed"
          ) or
          (
            .transferCancel.acknowledged == true and
            $payload.phase != "cleanup"
          )
        )
      ) then error("invalid event after transfer watchdog cancellation")
      else . end |
      if phase_ok(.phase;$payload.phase;$payload.event) then .
      else error("invalid ledger phase transition") end |
      .phase = $payload.phase |
      if $payload.event == "object-creating" then
        if (
          ($payload.details |
            exact_keys(["absent","expected","parentIdentity"])) and
          $payload.details.absent == true and
          ($payload.details.expected | expected) and
          ($payload.details.parentIdentity | identity) and
          ((.paths[$payload.details.expected.path] // null) as $prior |
            $prior == null or $prior.event == "object-removed" or
            $prior.event == "object-create-abandoned" or
            $prior.event == "path-replaced")
        ) then
          .paths[$payload.details.expected.path] = {
            event:$payload.event,
            expected:$payload.details.expected,
            parentIdentity:$payload.details.parentIdentity
          }
        else error("invalid object creation intent") end
      elif $payload.event == "object-created" then
        ($payload.details.baseline.path // "") as $path |
        if (
          ($payload.details.baseline | identity) and
          (
            (
              ($payload.details | exact_keys(["baseline","expected"])) and
              ($payload.details.expected | expected) and
              $payload.details.expected.path == $path and
              (.paths[$path].event? == "object-creating") and
              .paths[$path].expected == $payload.details.expected
            ) or
            (
              ($payload.details |
                exact_keys(["baseline","treeCreation"])) and
              $payload.details.treeCreation == true and
              ([.trees | keys[]?] |
                any(.[] as $tree;
                  $path == $tree or
                  ($path | startswith($tree + "/"))))
            ) or
            (
              ($payload.details | exact_keys(["baseline","namespace"])) and
              ($payload.details.namespace |
                type == "string" and length > 0 and length <= 128) and
              (.namespaces[$payload.details.namespace]? | type == "string")
            )
          )
        ) then
          .paths[$path] = {
            baseline:$payload.details.baseline,
            event:$payload.event
          }
        else error("invalid object-created transition") end
      elif ($payload.event | closed_event) then
        ($payload.details.identity.path // "") as $path |
        (.paths[$path] // null) as $prior |
        if (
          ($payload.details.identity | identity) and
          (
            (
              $payload.event == "bootstrap-closed" and
              ($prior == null or
                ($prior.event == "object-created" and
                  same_core($prior.baseline;$payload.details.identity)))
            ) or
            (
              $payload.event == "transfer-closed" and
              ($payload.details |
                exact_keys(["deadline","identity"])) and
              ($payload.details.deadline |
                type == "string" and test("^[1-9][0-9]{9}$")) and
              ($prior.event | IN("object-created","mutation-opened")) and
              same_creation($prior.baseline;$payload.details.identity)
            ) or
            (
              ($payload.event | IN("runtime-closed","watchdog-closed")) and
              ($payload.details | exact_keys(["identity"])) and
              ($prior.event |
                IN("object-created","mutation-opened",
                   "metadata-change-creating","path-replaced-destination",
                   "runtime-closed")) and
              (
                (
                  ($prior.event |
                    IN(
                      "object-created","mutation-opened",
                      "path-replaced-destination","runtime-closed"
                    )) and
                  same_core(
                    ($prior.identity // $prior.baseline);
                    $payload.details.identity
                  )
                ) or
                (
                  $prior.event == "metadata-change-creating" and
                  same_creation($prior.before;$payload.details.identity) and
                  ($payload.details.identity | {gid,mode,uid}) ==
                    $prior.expected
                )
              )
            ) or
            (
              $payload.event == "cleanup-closed" and
              ($payload.details | exact_keys(["identity"])) and
              ($prior.event | closed_event) and
              same_anchor($prior.identity;$payload.details.identity)
            ) or
            (
              $payload.event == "successor-lease-closed" and
              ($payload.details |
                exact_keys([
                  "identity","mainPid","mainSession","mainStart",
                  "predecessorHead","watchdogPid","watchdogSession",
                  "watchdogStart"
                ])) and
              ($payload.details.predecessorHead |
                type == "string" and test("^sha256:[0-9a-f]{64}$")) and
              all([
                $payload.details.mainPid,$payload.details.mainSession,
                $payload.details.mainStart,$payload.details.watchdogPid,
                $payload.details.watchdogSession,
                $payload.details.watchdogStart
              ][]; type == "string" and test("^[1-9][0-9]*$")) and
              $payload.details.watchdogPid ==
                $payload.details.watchdogSession and
              $prior.event == "runtime-closed" and
              same_identity($prior.identity;$payload.details.identity)
            )
          )
        ) then
          .paths[$path] = {
            event:$payload.event,
            identity:$payload.details.identity
          }
        else error("invalid closed identity transition") end
      elif $payload.event == "mutation-opened" then
        ($payload.details.baseline.path // "") as $path |
        (.paths[$path] // null) as $prior |
        if (
          ($payload.details | exact_keys(["baseline"])) and
          ($payload.details.baseline | identity) and
          (
            (($prior.event | closed_event) and
              same_identity($prior.identity;$payload.details.baseline)) or
            ($prior.event == "object-created" and
              same_identity($prior.baseline;$payload.details.baseline))
          )
        ) then
          .paths[$path] = {
            baseline:$payload.details.baseline,
            event:$payload.event
          }
        else error("invalid mutation transition") end
      elif $payload.event == "metadata-change-creating" then
        ($payload.details.before.path // "") as $path |
        (.paths[$path] // null) as $prior |
        if (
          ($payload.details | exact_keys(["before","expected"])) and
          ($payload.details.before | identity) and
          ($payload.details.expected |
            exact_keys(["gid","mode","uid"])) and
          ($prior.event | closed_event) and
          same_identity($prior.identity;$payload.details.before)
        ) then
          .paths[$path] = {
            before:$payload.details.before,
            event:$payload.event,
            expected:$payload.details.expected
          }
        else error("invalid metadata transition") end
      elif $payload.event == "transfer-aborted" then
        ($payload.details.identity.path // "") as $path |
        (.paths[$path] // null) as $prior |
        if (
          ($payload.details | exact_keys(["baseline","identity"])) and
          ($payload.details.baseline | identity) and
          ($payload.details.identity | identity) and
          ($prior.event | IN("object-created","mutation-opened")) and
          same_creation($payload.details.baseline;$payload.details.identity)
        ) then
          .paths[$path] = {
            event:$payload.event,
            identity:$payload.details.identity
          }
        else error("invalid transfer abort") end
      elif $payload.event == "object-removing" then
        ($payload.details.identity.path // "") as $path |
        (.paths[$path] // null) as $prior |
        if (
          ($payload.details | exact_keys(["identity","quarantine"])) and
          ($payload.details.identity | identity) and
          safe_quarantine($path;$payload.details.quarantine) and
          (
            (($prior.event | closed_event) and
              same_identity($prior.identity;$payload.details.identity)) or
            ($prior.event == "transfer-aborted" and
              same_identity($prior.identity;$payload.details.identity))
          )
        ) then
          .paths[$path] = {
            event:$payload.event,
            identity:$payload.details.identity,
            quarantine:$payload.details.quarantine
          }
        else error("invalid removing transition") end
      elif $payload.event == "object-removed" then
        ($payload.details.path // "") as $path |
        (.paths[$path] // null) as $prior |
        if (
          ($payload.details |
            exact_keys(["identity","path","quarantine"])) and
          ($payload.details.identity | identity) and
          $payload.details.identity.path == $path and
          $prior.event == "object-removing" and
          $prior.identity == $payload.details.identity and
          $prior.quarantine == $payload.details.quarantine
        ) then
          .paths[$path] = {
            event:$payload.event,
            identity:$payload.details.identity,
            quarantine:$payload.details.quarantine
          }
        else error("invalid removed transition") end
      elif $payload.event == "object-create-abandoned" then
        ($payload.details.expected.path // "") as $path |
        if (
          ($payload.details | exact_keys(["expected"])) and
          ($payload.details.expected | expected) and
          .paths[$path].event? == "object-creating" and
          .paths[$path].expected == $payload.details.expected
        ) then
          .paths[$path] = {
            event:$payload.event,
            expected:$payload.details.expected
          }
        else error("invalid abandoned creation") end
      elif $payload.event == "path-replace-creating" then
        ($payload.details.sourceIdentity.path // "") as $source |
        ($payload.details.destination // "") as $destination |
        (.paths[$source] // null) as $sourcePrior |
        (.paths[$destination] // null) as $destinationPrior |
        if (
          .replacement == null and
          ($payload.details |
            exact_keys([
              "destination","previousDestination","sourceIdentity"
            ])) and
          ($payload.details.sourceIdentity | identity) and
          ($destination |
            type == "string" and
            test("^[^/[:cntrl:]]+(\\/[^/[:cntrl:]]+)*$")) and
          ($sourcePrior.event | closed_event) and
          same_identity(
            $sourcePrior.identity;
            $payload.details.sourceIdentity
          ) and
          $payload.details.previousDestination == null and
          (
            $destinationPrior == null or
            ($destinationPrior.event |
              IN("object-removed","object-create-abandoned","path-replaced"))
          )
        ) then
          .replacement = {
            destination:$destination,
            source:$payload.details.sourceIdentity
          }
        else error("invalid path replacement intent") end
      elif $payload.event == "path-replaced" then
        ($payload.details.sourceIdentity.path // "") as $source |
        ($payload.details.destination // "") as $destination |
        if (
          ($payload.details |
            exact_keys(["destination","movedIdentity","sourceIdentity"])) and
          .replacement != null and
          .replacement.destination == $destination and
          .replacement.source == $payload.details.sourceIdentity and
          ($payload.details.movedIdentity | identity) and
          $payload.details.movedIdentity.path == $destination and
          (
            ($payload.details.movedIdentity |
              {device,digest,gid,inode,links,mode,size,type,uid}) ==
            ($payload.details.sourceIdentity |
              {device,digest,gid,inode,links,mode,size,type,uid})
          )
        ) then
          .paths[$source] = {
            destination:$destination,
            event:$payload.event,
            identity:$payload.details.sourceIdentity,
            movedIdentity:$payload.details.movedIdentity
          } |
          .paths[$destination] = {
            event:"path-replaced-destination",
            identity:$payload.details.movedIdentity
          } |
          .replacement = null
        else error("invalid path replacement close") end
      elif $payload.event == "transfer-watchdog-cancel-requested" then
        ($payload.details.watchdogIdentity.path // "") as $path |
        if (
          .transferCancel == null and
          ($payload.details | exact_keys(["watchdogIdentity"])) and
          ($payload.details.watchdogIdentity | identity) and
          $path == ".transfer-watchdog.json" and
          .paths[$path].event? == "watchdog-closed" and
          same_identity(
            .paths[$path].identity;
            $payload.details.watchdogIdentity
          )
        ) then
          .transferCancel = {
            acknowledged:false,
            requestHead:$record.payloadDigest,
            watchdogIdentity:$payload.details.watchdogIdentity
          }
        else error("invalid transfer watchdog cancellation request") end
      elif $payload.event == "transfer-watchdog-cancel-closed" then
        if (
          .transferCancel != null and
          .transferCancel.acknowledged == false and
          ($payload.details |
            exact_keys(["requestHead","watchdogIdentity"])) and
          ($payload.details.watchdogIdentity | identity) and
          $payload.details.requestHead == .transferCancel.requestHead and
          $payload.previous == .transferCancel.requestHead and
          same_identity(
            .transferCancel.watchdogIdentity;
            $payload.details.watchdogIdentity
          )
        ) then
          .transferCancel.acknowledged = true |
          .transferCancel.ackHead = $record.payloadDigest
        else error("invalid transfer watchdog cancellation close") end
      elif $payload.event == "phase-open" then
        if (
          ($payload.details | exact_keys(["deadline"])) and
          ($payload.details.deadline |
            type == "string" and test("^[1-9][0-9]{9}$"))
        ) then . else error("invalid phase open") end
      elif $payload.event == "phase-handoff" then
        if (
          ($payload.details |
            exact_keys([
              "ackHead","deadline","mainPid","mainSession","mainStart",
              "successorIdentity","watchdogPid","watchdogSession",
              "watchdogStart"
            ])) and
          ($payload.details.successorIdentity | identity) and
          ($payload.details.ackHead |
            type == "string" and test("^sha256:[0-9a-f]{64}$")) and
          $payload.previous == $payload.details.ackHead and
          all([
            $payload.details.mainPid,$payload.details.mainSession,
            $payload.details.mainStart,$payload.details.watchdogPid,
            $payload.details.watchdogSession,
            $payload.details.watchdogStart
          ][]; type == "string" and test("^[1-9][0-9]*$"))
        ) then . else error("invalid successor handoff") end
      elif $payload.event == "tree-creating" then
        if (
          ($payload.details |
            exact_keys([
              "archiveIdentity","memberInventoryDigest","parentIdentity",
              "treeRoot"
            ])) and
          ($payload.details.archiveIdentity | identity) and
          ($payload.details.parentIdentity | identity) and
          ($payload.details.memberInventoryDigest |
            type == "string" and test("^sha256:[0-9a-f]{64}$")) and
          ($payload.details.treeRoot |
            type == "string" and
            test("^[^/[:cntrl:]]+(\\/[^/[:cntrl:]]+)*$"))
        ) then
          .trees[$payload.details.treeRoot] = $payload.details.treeRoot
        else error("invalid tree creation intent") end
      elif $payload.event == "namespace-creating" then
        if (
          ($payload.details |
            exact_keys(["actor","name","namespaceIdentity"])) and
          ($payload.details.actor | type == "object") and
          ($payload.details.name |
            type == "string" and length > 0 and length <= 128) and
          ($payload.details.namespaceIdentity | identity)
        ) then
          .namespaces[$payload.details.name] =
            $payload.details.namespaceIdentity.path
        else error("invalid namespace creation intent") end
      elif ($payload.event | IN(
        "resource-creating","resource-closed","resource-removed"
      )) then
        resource_key(
          $payload.details.kind;
          $payload.details.resourceIdentity
        ) as $key |
        (.resources[$key] // null) as $prior |
        if (
          ($payload.details | exact_keys(["kind","resourceIdentity"])) and
          ($payload.details.kind | IN("container","image","network")) and
          (
            ($payload.event == "resource-creating" and $prior == null) or
            ($payload.event == "resource-closed" and
              $prior == "resource-creating") or
            ($payload.event == "resource-removed" and
              $prior == "resource-closed")
          )
        ) then .resources[$key] = $payload.event
        else error("invalid resource transition") end
      else error("unknown ledger event") end
    )
  ' >/dev/null
}

ledger_verify_state_machine_fd() {
  ledger_assert_path_binding || return
  ledger_state_machine_stream < "$ledger_fd_path"
}

ledger_verify_chain_unlocked() {
  ledger_assert_path_binding || return
  local line canonical payload digest previous="" sequence=0 observed_previous
  ledger_head=""
  ledger_sequence="-1"
  while IFS= read -r line; do
    [[ -n "$line" && "${#line}" -le 65536 ]] || return 1
    canonical="$(jq -cS . <<< "$line")" || return
    [[ "$canonical" == "$line" ]] || return 1
    jq -e \
      --arg inputDigest "$ledger_input_digest" \
      --arg runId "$ledger_run_id" '
        type == "object" and
        keys == ["payload","payloadDigest"] and
        (.payload | type == "object") and
        (.payload |
          keys == [
            "details","event","inputDigest","phase","previous","runId",
            "sequence"
          ]) and
        (.payload.details | type == "object") and
        (.payload.event |
          type == "string" and test("^[a-z][a-z0-9-]{1,63}$")) and
        .payload.inputDigest == $inputDigest and
        (.payload.phase |
          type == "string" and test("^[a-z][a-z0-9-]{1,31}$")) and
        (
          .payload.previous == null or
          (.payload.previous |
            type == "string" and test("^sha256:[0-9a-f]{64}$"))
        ) and
        .payload.runId == $runId and
        (.payload.sequence |
          type == "number" and floor == . and . >= 0 and . <= 200000) and
        (.payloadDigest |
          type == "string" and test("^sha256:[0-9a-f]{64}$"))
      ' <<< "$line" >/dev/null || return
    observed_previous="$(jq -r '.payload.previous // ""' <<< "$line")"
    [[ "$observed_previous" == "$previous" &&
       "$(jq -r '.payload.sequence' <<< "$line")" == "$sequence" ]] ||
      return 1
    payload="$(jq -cS '.payload' <<< "$line")" || return
    digest="sha256:$(printf '%s' "$payload" | sha256sum | awk '{print $1}')"
    [[ "$(jq -r '.payloadDigest' <<< "$line")" == "$digest" ]] || return 1
    previous="$digest"
    ledger_head="$digest"
    ledger_sequence="$sequence"
    sequence=$((sequence + 1))
    (( sequence <= 200000 )) || return 1
  done < "$ledger_fd_path"
  [[ -n "$ledger_head" ]] || return 1
  ledger_verify_state_machine_fd
}

ledger_verify_chain() {
  [[ "$ledger_authority_fd" =~ ^[0-9]+$ ]] || return 1
  local status=0
  flock -s "$ledger_authority_fd" || return
  ledger_verify_chain_unlocked || status=$?
  flock -u "$ledger_authority_fd"
  return "$status"
}

ledger_append_record() {
  local event="$1"
  local phase="$2"
  local details="$3"
  local append_fd="$4"
  [[ "$event" =~ ^[a-z][a-z0-9-]{1,63}$ &&
     "$phase" =~ ^[a-z][a-z0-9-]{1,31}$ ]] || return 1
  jq -ceS 'type == "object"' <<< "$details" >/dev/null || return
  local next=$((ledger_sequence + 1))
  local previous_json="null"
  [[ -n "$ledger_head" ]] &&
    previous_json="$(jq -cn --arg value "$ledger_head" '$value')"
  local payload digest record
  payload="$(
    jq -cnS \
      --arg event "$event" \
      --arg inputDigest "$ledger_input_digest" \
      --arg phase "$phase" \
      --arg runId "$ledger_run_id" \
      --argjson details "$details" \
      --argjson previous "$previous_json" \
      --argjson sequence "$next" \
      '{
        details:$details,
        event:$event,
        inputDigest:$inputDigest,
        phase:$phase,
        previous:$previous,
        runId:$runId,
        sequence:$sequence
      }'
  )" || return
  digest="sha256:$(printf '%s' "$payload" | sha256sum | awk '{print $1}')"
  record="$(
    jq -cnS \
      --arg payloadDigest "$digest" \
      --argjson payload "$payload" \
      '{payload:$payload,payloadDigest:$payloadDigest}'
  )" || return
  {
    while IFS= read -r line; do
      printf '%s\n' "$line"
    done < "$ledger_fd_path"
    printf '%s\n' "$record"
  } | ledger_state_machine_stream || return
  printf '%s\n' "$record" >> "/proc/self/fd/${append_fd}" || return
  # The historical path form, sync -f -- "$ledger_path", is forbidden: it can
  # fsync a replacement inode. The descriptor remains the sole authority.
  sync -f -- "/proc/self/fd/${append_fd}" || return
  ledger_assert_path_binding || return
  ledger_head="$digest"
  ledger_sequence="$next"
  printf '%s\n' "$digest"
}

ledger_append() {
  local event="$1"
  local phase="$2"
  local details="$3"
  local expected_head="${4:-}"
  [[ "$ledger_authority_fd" =~ ^[0-9]+$ ]] || return 1
  local status=0
  flock -x "$ledger_authority_fd" || return
  if [[ -s "$ledger_fd_path" ]]; then
    ledger_verify_chain_unlocked || status=$?
  else
    ledger_assert_path_binding || status=$?
    ledger_head=""
    ledger_sequence="-1"
  fi
  if [[ "$status" -eq 0 && -n "$expected_head" &&
        "$ledger_head" != "$expected_head" ]]; then
    status=1
  fi
  if [[ "$status" -eq 0 ]]; then
    ledger_append_record \
      "$event" "$phase" "$details" "$ledger_authority_fd" || status=$?
  fi
  flock -u "$ledger_authority_fd"
  return "$status"
}

ledger_begin_transaction() {
  local expected_head="${1:-}"
  [[ "$ledger_transaction_active" == "no" &&
     "$ledger_authority_fd" =~ ^[0-9]+$ ]] || return 1
  flock -x "$ledger_authority_fd" || return
  ledger_verify_chain_unlocked || {
    flock -u "$ledger_authority_fd"
    return 1
  }
  if [[ -n "$expected_head" && "$ledger_head" != "$expected_head" ]]; then
    flock -u "$ledger_authority_fd"
    return 1
  fi
  ledger_transaction_fd="$ledger_authority_fd"
  ledger_transaction_active="yes"
}

ledger_append_transaction() {
  local event="$1"
  local phase="$2"
  local details="$3"
  local expected_head="${4:-}"
  [[ "$ledger_transaction_active" == "yes" &&
     "$ledger_transaction_fd" == "$ledger_authority_fd" ]] || return 1
  ledger_verify_chain_unlocked || return
  [[ -z "$expected_head" || "$ledger_head" == "$expected_head" ]] || return 1
  ledger_append_record "$event" "$phase" "$details" "$ledger_transaction_fd"
}

ledger_end_transaction() {
  [[ "$ledger_transaction_active" == "yes" &&
     "$ledger_transaction_fd" == "$ledger_authority_fd" ]] || return 1
  flock -u "$ledger_transaction_fd"
  ledger_transaction_fd=""
  ledger_transaction_active="no"
}

ledger_closed_details() {
  local identity="$1"
  jq -cnS --argjson identity "$identity" '{identity:$identity}'
}

ledger_new_quarantine() {
  local candidate="$1"
  local output_name="$2"
  local parent relative token quarantine
  [[ "$output_name" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || return 1
  relative="$(ledger_relative_path "$candidate")" || return
  [[ "$relative" != "." ]] || return 1
  parent="${candidate%/*}"
  token="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')" || return
  [[ "$token" =~ ^[0-9a-f]{32}$ ]] || return 1
  quarantine="${parent}/.validation-quarantine-${token}"
  ledger_relative_path "$quarantine" >/dev/null || return
  [[ ! -e "$quarantine" && ! -L "$quarantine" ]] || return 1
  printf -v "$output_name" '%s' "$quarantine"
}

ledger_restore_quarantine() {
  local candidate="$1"
  local quarantine="$2"
  local expected="$3"
  [[ ! -e "$candidate" && ! -L "$candidate" &&
     ( -e "$quarantine" || -L "$quarantine" ) ]] || return 1
  mv -T --no-clobber -- "$quarantine" "$candidate" || return
  ledger_fsync_parent "$candidate" || return
  [[ ! -e "$quarantine" && ! -L "$quarantine" ]] || return 1
  local restored
  restored="$(ledger_identity_json "$candidate")" || return
  ledger_same_object "$expected" "$restored"
}

ledger_quarantine_remove() {
  local candidate="$1"
  local quarantine="$2"
  local expected="$3"
  local observed type
  ledger_relative_path "$candidate" >/dev/null || return
  ledger_relative_path "$quarantine" >/dev/null || return
  [[ "${candidate%/*}" == "${quarantine%/*}" ]] || return 1
  if [[ -e "$candidate" || -L "$candidate" ]]; then
    [[ ! -e "$quarantine" && ! -L "$quarantine" ]] || return 1
    ledger_verify_identity "$expected" || return
    mv -T --no-clobber -- "$candidate" "$quarantine" || return
    ledger_fsync_parent "$candidate" || return
  fi
  if [[ ! -e "$quarantine" && ! -L "$quarantine" ]]; then
    [[ ! -e "$candidate" && ! -L "$candidate" ]]
    return
  fi
  observed="$(ledger_identity_json "$quarantine")" || return
  if ! ledger_same_object "$expected" "$observed"; then
    ledger_restore_quarantine "$candidate" "$quarantine" "$expected" ||
      return 1
    return 1
  fi
  type="$(jq -er '.type' <<< "$observed")" || return
  if [[ "$type" == "directory" ]]; then
    [[ -z "$(find "$quarantine" -mindepth 1 -maxdepth 1 -print -quit)" ]] ||
      return 1
    rmdir -- "$quarantine" || return
  else
    rm -- "$quarantine" || return
  fi
  ledger_fsync_parent "$quarantine"
}
