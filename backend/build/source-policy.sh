#!/usr/bin/env bash

artifact_source_revision=''
artifact_source_tree=''
artifact_source_date_epoch=''

artifact_resolve_git_command() {
  local git_command

  if [[ -x /usr/bin/git ]]; then
    git_command='/usr/bin/git'
  elif [[ -x /bin/git ]]; then
    git_command='/bin/git'
  elif ! git_command="$(
    PATH='/usr/bin:/bin:/usr/sbin:/sbin' command -v git
  )" ||
    [[ "$git_command" != /* || ! -x "$git_command" ]]; then
    echo 'git is required for source attestation' >&2
    return 1
  fi
  printf '%s\n' "$git_command"
}

artifact_git_read() {
  local git_command="$1"
  shift

  command env -i \
    PATH='/usr/bin:/bin:/usr/sbin:/sbin' \
    LC_ALL=C \
    HOME=/dev/null \
    XDG_CONFIG_HOME=/dev/null \
    GIT_ATTR_NOSYSTEM=1 \
    GIT_CONFIG_GLOBAL=/dev/null \
    GIT_CONFIG_NOSYSTEM=1 \
    GIT_CONFIG_SYSTEM=/dev/null \
    GIT_NO_LAZY_FETCH=1 \
    GIT_NO_REPLACE_OBJECTS=1 \
    GIT_OPTIONAL_LOCKS=0 \
    GIT_PAGER=cat \
    GIT_TERMINAL_PROMPT=0 \
    "$git_command" \
      -c feature.manyFiles=false \
      -c core.fsmonitor=false \
      -c core.untrackedCache=false \
      -c core.useBuiltinFSMonitor=false \
      -c core.quotePath=true \
      "$@"
}

artifact_worktree_file_mode() {
  local path="$1"
  local mode

  if [[ -x /usr/bin/stat ]] &&
    mode="$(/usr/bin/stat -f '%Lp' -- "$path" 2>/dev/null)" &&
    [[ "$mode" =~ ^[0-7]{3,4}$ ]]; then
    printf '%s\n' "$mode"
    return 0
  fi
  if [[ -x /usr/bin/stat ]] &&
    mode="$(/usr/bin/stat -c '%a' -- "$path" 2>/dev/null)" &&
    [[ "$mode" =~ ^[0-7]{3,4}$ ]]; then
    printf '%s\n' "$mode"
    return 0
  fi
  echo "unable to read raw worktree mode: $path" >&2
  return 1
}

artifact_require_real_parent_chain() {
  local root="$1"
  local relative_path="$2"
  local remaining
  local segment
  local current="$root"

  remaining="${relative_path%/*}"
  if [[ "$remaining" == "$relative_path" ]]; then
    return 0
  fi
  while [[ -n "$remaining" ]]; do
    if [[ "$remaining" == */* ]]; then
      segment="${remaining%%/*}"
      remaining="${remaining#*/}"
    else
      segment="$remaining"
      remaining=''
    fi
    if [[ -z "$segment" || "$segment" == '.' || "$segment" == '..' ]]; then
      echo "HEAD tree contains an unsafe path: $relative_path" >&2
      return 1
    fi
    current="$current/$segment"
    if [[ ! -d "$current" || -L "$current" ]]; then
      echo "tracked source parent is missing, non-directory, or symlinked: $relative_path" >&2
      return 1
    fi
  done
}

artifact_verify_source_snapshot() {
  local git_command="$1"
  local canonical_root="$2"
  local tree="$3"
  local expected_index
  local actual_index
  local index_flags
  local record
  local metadata
  local mode
  local type
  local object
  local path
  local absolute_path
  local actual_mode
  local tracked_count=0
  local path_list=''
  local expected_objects=''
  local actual_objects
  local untracked_ignore_rule
  local tree_stream_complete=0
  local untracked_ignore_stream_complete=0
  local untracked

  if ! expected_index="$(
    artifact_git_read "$git_command" -C "$canonical_root" \
      ls-tree -r --full-tree \
      --format='%(objectmode) %(objectname) 0%x09%(path)' "$tree"
  )" ||
    ! actual_index="$(
      artifact_git_read "$git_command" -C "$canonical_root" ls-files --stage
    )"; then
    echo 'unable to compare the raw HEAD tree and index' >&2
    return 1
  fi
  if [[ "$actual_index" != "$expected_index" ]]; then
    echo 'source index entries do not exactly match HEAD tree' >&2
    return 1
  fi
  if ! index_flags="$(
    artifact_git_read "$git_command" -C "$canonical_root" ls-files -v
  )"; then
    echo 'unable to inspect source index flags' >&2
    return 1
  fi
  while IFS= read -r record; do
    if [[ -n "$record" && "${record:0:2}" != 'H ' ]]; then
      echo 'source index contains assume-unchanged or skip-worktree entries' >&2
      return 1
    fi
  done <<<"$index_flags"
  if ! index_flags="$(
    artifact_git_read "$git_command" -C "$canonical_root" ls-files -f
  )"; then
    echo 'unable to inspect source index fsmonitor flags' >&2
    return 1
  fi
  while IFS= read -r record; do
    if [[ -n "$record" && "${record:0:2}" != 'H ' ]]; then
      echo 'source index contains fsmonitor-valid or skip-worktree entries' >&2
      return 1
    fi
  done <<<"$index_flags"

  while IFS= read -r -d '' record; do
    if [[ "$record" == '__BGMSS_VERIFY_TREE_STREAM_COMPLETE__' ]]; then
      tree_stream_complete=1
      continue
    fi
    if [[ "$tree_stream_complete" -ne 0 ]]; then
      echo 'source tree stream contained data after its terminator' >&2
      return 1
    fi
    metadata="${record%%$'\t'*}"
    path="${record#*$'\t'}"
    read -r mode type object <<<"$metadata"
    if [[ "$metadata" == "$path" || -z "$path" || "$path" == /* ||
      "$path" == *$'\n'* || "$path" == *$'\r'* ]]; then
      echo 'HEAD tree contains an unsafe or malformed path' >&2
      return 1
    fi
    if [[ "$type" != 'blob' || ("$mode" != '100644' && "$mode" != '100755') ]]; then
      echo "HEAD tree contains an unsupported non-regular mode: $path" >&2
      return 1
    fi
    if [[ ! "$object" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]]; then
      echo "HEAD tree contains a non-canonical object ID: $path" >&2
      return 1
    fi
    if ! artifact_require_real_parent_chain "$canonical_root" "$path"; then
      return 1
    fi
    absolute_path="$canonical_root/$path"
    if [[ ! -f "$absolute_path" || -L "$absolute_path" ]]; then
      echo "tracked source is missing, non-regular, or symlinked: $path" >&2
      return 1
    fi
    if ! actual_mode="$(artifact_worktree_file_mode "$absolute_path")"; then
      return 1
    fi
    if [[ "$actual_mode" != "${mode#100}" ]]; then
      echo "tracked source mode differs from HEAD tree: $path" >&2
      return 1
    fi
    path_list+="$path"$'\n'
    expected_objects+="$object"$'\n'
    tracked_count=$((tracked_count + 1))
  done < <(
    if artifact_git_read "$git_command" -C "$canonical_root" \
      ls-tree -r -z --full-tree "$tree"; then
      printf '%s\0' '__BGMSS_VERIFY_TREE_STREAM_COMPLETE__'
    fi
  )
  if [[ "$tree_stream_complete" -ne 1 ]]; then
    echo 'unable to read the complete raw source tree' >&2
    return 1
  fi
  if [[ "$tracked_count" -eq 0 ]]; then
    echo 'HEAD tree contains no tracked regular files' >&2
    return 1
  fi
  if ! actual_objects="$(
    printf '%s' "$path_list" |
      artifact_git_read "$git_command" -C "$canonical_root" \
        hash-object --no-filters --stdin-paths
  )"; then
    echo 'unable to hash raw tracked source bytes' >&2
    return 1
  fi
  if [[ "$actual_objects" != "${expected_objects%$'\n'}" ]]; then
    echo 'tracked source bytes differ from HEAD tree' >&2
    return 1
  fi

  if ! artifact_git_read "$git_command" -C "$canonical_root" \
    ls-files --others -- \
    '.gitignore' ':(glob)**/.gitignore' >/dev/null; then
    echo 'unable to inspect untracked ignore rules' >&2
    return 1
  fi
  while IFS= read -r -d '' untracked_ignore_rule; do
    if [[ "$untracked_ignore_rule" == '__BGMSS_IGNORE_LIST_STREAM_COMPLETE__' ]]; then
      untracked_ignore_stream_complete=1
      continue
    fi
    if [[ "$untracked_ignore_stream_complete" -ne 0 ]]; then
      echo 'untracked ignore-rule stream contained data after its terminator' >&2
      return 1
    fi
    if ! artifact_untracked_ignore_has_trusted_parent_rule \
      "$git_command" "$canonical_root" "$untracked_ignore_rule"; then
      echo "untracked .gitignore parent is not ignored by a tracked parent rule: $untracked_ignore_rule" >&2
      return 1
    fi
  done < <(
    if artifact_git_read "$git_command" -C "$canonical_root" \
      ls-files --others -z -- \
      '.gitignore' ':(glob)**/.gitignore'; then
      printf '%s\0' '__BGMSS_IGNORE_LIST_STREAM_COMPLETE__'
    fi
  )
  if [[ "$untracked_ignore_stream_complete" -ne 1 ]]; then
    echo 'unable to read the complete untracked ignore-rule set' >&2
    return 1
  fi

  if ! untracked="$(
    artifact_git_read "$git_command" -C "$canonical_root" \
      ls-files --others --exclude-per-directory=.gitignore
  )"; then
    echo 'unable to inspect untracked source paths' >&2
    return 1
  fi
  if [[ -n "$untracked" ]]; then
    echo 'source worktree contains untracked non-ignored paths' >&2
    return 1
  fi
}

artifact_create_snapshot_parent_chain() {
  local root="$1"
  local relative_path="$2"
  local remaining
  local segment
  local current="$root"

  remaining="${relative_path%/*}"
  if [[ "$remaining" == "$relative_path" ]]; then
    return 0
  fi
  while [[ -n "$remaining" ]]; do
    if [[ "$remaining" == */* ]]; then
      segment="${remaining%%/*}"
      remaining="${remaining#*/}"
    else
      segment="$remaining"
      remaining=''
    fi
    if [[ -z "$segment" || "$segment" == '.' || "$segment" == '..' ]]; then
      echo "HEAD tree contains an unsafe path: $relative_path" >&2
      return 1
    fi
    current="$current/$segment"
    if [[ -e "$current" || -L "$current" ]]; then
      if [[ ! -d "$current" || -L "$current" ]]; then
        echo "source snapshot parent collides with a non-directory: $relative_path" >&2
        return 1
      fi
    else
      if ! mkdir -- "$current" || ! chmod 755 "$current"; then
        echo "unable to create source snapshot parent: $relative_path" >&2
        return 1
      fi
    fi
  done
}

artifact_untracked_ignore_has_trusted_parent_rule() {
  local git_command="$1"
  local canonical_root="$2"
  local untracked_ignore_rule="$3"
  local ignored_parent
  local rule_source
  local rule_line
  local rule_pattern
  local matched_path
  local rule_directory
  local record_count=0
  local stream_complete=0
  local trusted_rule=0

  ignored_parent="${untracked_ignore_rule%/*}"
  if [[ "$ignored_parent" == "$untracked_ignore_rule" ||
    -z "$ignored_parent" || "$ignored_parent" == '.' ||
    "$ignored_parent" == '..' ]]; then
    return 1
  fi

  while IFS= read -r -d '' rule_source; do
    if ! IFS= read -r -d '' rule_line ||
      ! IFS= read -r -d '' rule_pattern ||
      ! IFS= read -r -d '' matched_path; then
      return 1
    fi
    if [[ "$rule_source" == '__BGMSS_IGNORE_STREAM_COMPLETE__' ]]; then
      stream_complete=1
      continue
    fi
    if [[ "$stream_complete" -ne 0 ]]; then
      return 1
    fi
    record_count=$((record_count + 1))
    if [[ "$record_count" -ne 1 ||
      ("$matched_path" != "$ignored_parent" &&
        "$matched_path" != "$ignored_parent/") ||
      ! "$rule_line" =~ ^[1-9][0-9]*$ ||
      -z "$rule_pattern" ]]; then
      return 1
    fi
    case "$rule_source" in
      .gitignore)
        rule_directory=''
        ;;
      */.gitignore)
        rule_directory="${rule_source%/.gitignore}"
        ;;
      *)
        return 1
        ;;
    esac
    if [[ -n "$rule_directory" &&
      "$ignored_parent" != "$rule_directory/"* ]]; then
      return 1
    fi
    if ! artifact_git_read "$git_command" -C "$canonical_root" \
      ls-files --error-unmatch -- "$rule_source" >/dev/null 2>&1; then
      return 1
    fi
    trusted_rule=1
  done < <(
    if printf '%s\0' "$ignored_parent/" |
      artifact_git_read "$git_command" -C "$canonical_root" \
        check-ignore -z -v --no-index --stdin; then
      printf '%s\0\0\0\0' '__BGMSS_IGNORE_STREAM_COMPLETE__'
    fi
  )
  [[ "$stream_complete" -eq 1 && "$record_count" -eq 1 &&
    "$trusted_rule" -eq 1 ]]
}

artifact_materialize_source_tree() {
  local requested_root="${1:-}"
  local tree="${2:-}"
  local destination="${3:-}"
  local git_command
  local physical_root
  local canonical_root
  local destination_parent
  local physical_parent
  local destination_name
  local record
  local metadata
  local mode
  local type
  local object
  local path
  local path_name
  local absolute_path
  local tracked_count=0
  local stream_complete=0

  if ! git_command="$(artifact_resolve_git_command)"; then
    return 1
  fi
  if [[ -z "$requested_root" || "$requested_root" != /* ||
    ! -d "$requested_root" || -L "$requested_root" ]]; then
    echo "source root must be an absolute real directory: $requested_root" >&2
    return 1
  fi
  physical_root="$(CDPATH= cd -- "$requested_root" && pwd -P)"
  if [[ "$physical_root" != "$requested_root" ]]; then
    echo "source root contains a symlink or is not canonical: $requested_root" >&2
    return 1
  fi
  if ! canonical_root="$(
    artifact_git_read "$git_command" -C "$physical_root" \
      rev-parse --show-toplevel 2>/dev/null
  )"; then
    echo "source root is not a Git worktree: $physical_root" >&2
    return 1
  fi
  if [[ ! -d "$canonical_root" || -L "$canonical_root" ]]; then
    echo "Git top-level is not a real directory: $canonical_root" >&2
    return 1
  fi
  canonical_root="$(CDPATH= cd -- "$canonical_root" && pwd -P)"
  if [[ "$canonical_root" != "$physical_root" ]]; then
    echo "source root is not the canonical Git top-level: $physical_root" >&2
    return 1
  fi
  if [[ ! "$tree" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]] ||
    ! artifact_git_read "$git_command" -C "$canonical_root" \
      cat-file -e "$tree^{tree}"; then
    echo 'source snapshot tree is not a canonical readable Git tree' >&2
    return 1
  fi

  if [[ -z "$destination" || "$destination" != /* ||
    "$destination" == *$'\n'* || "$destination" == *$'\r'* ]]; then
    echo "source snapshot destination must be an absolute safe path: $destination" >&2
    return 1
  fi
  destination_name="${destination##*/}"
  destination_parent="${destination%/*}"
  if [[ -z "$destination_parent" ]]; then
    destination_parent='/'
  fi
  if [[ -z "$destination_name" || "$destination_name" == '.' ||
    "$destination_name" == '..' || ! -d "$destination_parent" ||
    -L "$destination_parent" ]]; then
    echo "source snapshot destination parent must be a real directory: $destination" >&2
    return 1
  fi
  physical_parent="$(CDPATH= cd -- "$destination_parent" && pwd -P)"
  if [[ "$physical_parent" != "$destination_parent" ]]; then
    echo "source snapshot destination parent contains a symlink: $destination" >&2
    return 1
  fi
  if [[ -e "$destination" || -L "$destination" ]]; then
    echo "source snapshot destination already exists: $destination" >&2
    return 1
  fi
  if ! mkdir -- "$destination" || ! chmod 755 "$destination"; then
    echo "unable to create source snapshot destination: $destination" >&2
    return 1
  fi

  while IFS= read -r -d '' record; do
    if [[ "$record" == '__BGMSS_ARTIFACT_TREE_STREAM_COMPLETE__' ]]; then
      stream_complete=1
      continue
    fi
    if [[ "$stream_complete" -ne 0 ]]; then
      echo 'source snapshot tree stream contained data after its terminator' >&2
      return 1
    fi
    metadata="${record%%$'\t'*}"
    path="${record#*$'\t'}"
    read -r mode type object <<<"$metadata"
    path_name="${path##*/}"
    if [[ "$metadata" == "$path" || -z "$path" || "$path" == /* ||
      "$path" == *$'\n'* || "$path" == *$'\r'* ||
      -z "$path_name" || "$path_name" == '.' || "$path_name" == '..' ]]; then
      echo 'HEAD tree contains an unsafe or malformed path' >&2
      return 1
    fi
    if [[ "$type" != 'blob' || ("$mode" != '100644' && "$mode" != '100755') ]]; then
      echo "HEAD tree contains an unsupported non-regular mode: $path" >&2
      return 1
    fi
    if [[ ! "$object" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]]; then
      echo "HEAD tree contains a non-canonical object ID: $path" >&2
      return 1
    fi
    if ! artifact_create_snapshot_parent_chain "$destination" "$path"; then
      return 1
    fi
    absolute_path="$destination/$path"
    if [[ -e "$absolute_path" || -L "$absolute_path" ]]; then
      echo "source snapshot path is duplicated or collides: $path" >&2
      return 1
    fi
    if ! artifact_git_read "$git_command" -C "$canonical_root" \
      cat-file blob "$object" >"$absolute_path"; then
      echo "unable to materialize raw source blob: $path" >&2
      return 1
    fi
    if ! chmod "${mode#100}" "$absolute_path"; then
      echo "unable to normalize source snapshot mode: $path" >&2
      return 1
    fi
    tracked_count=$((tracked_count + 1))
  done < <(
    if artifact_git_read "$git_command" -C "$canonical_root" \
      ls-tree -r -z --full-tree "$tree"; then
      printf '%s\0' '__BGMSS_ARTIFACT_TREE_STREAM_COMPLETE__'
    fi
  )
  if [[ "$stream_complete" -ne 1 ]]; then
    echo 'unable to read the complete raw source tree' >&2
    return 1
  fi
  if [[ "$tracked_count" -eq 0 ]]; then
    echo 'source snapshot tree contains no tracked regular files' >&2
    return 1
  fi
}

artifact_attest_source() {
  local requested_root="${1:-}"
  local git_command
  local physical_root
  local canonical_root
  local revision
  local tree
  local epoch
  local final_revision
  local final_tree
  local final_epoch

  artifact_source_revision=''
  artifact_source_tree=''
  artifact_source_date_epoch=''

  if ! git_command="$(artifact_resolve_git_command)"; then
    return 1
  fi
  if [[ -z "$requested_root" || "$requested_root" != /* ||
    ! -d "$requested_root" || -L "$requested_root" ]]; then
    echo "source root must be an absolute real directory: $requested_root" >&2
    return 1
  fi
  physical_root="$(CDPATH= cd -- "$requested_root" && pwd -P)"
  if [[ "$physical_root" != "$requested_root" ]]; then
    echo "source root contains a symlink or is not canonical: $requested_root" >&2
    return 1
  fi
  if ! canonical_root="$(
    artifact_git_read "$git_command" -C "$physical_root" rev-parse --show-toplevel 2>/dev/null
  )"; then
    echo "source root is not a Git worktree: $physical_root" >&2
    return 1
  fi
  if [[ ! -d "$canonical_root" || -L "$canonical_root" ]]; then
    echo "Git top-level is not a real directory: $canonical_root" >&2
    return 1
  fi
  canonical_root="$(CDPATH= cd -- "$canonical_root" && pwd -P)"
  if [[ "$canonical_root" != "$physical_root" ]]; then
    echo "source root is not the canonical Git top-level: $physical_root" >&2
    return 1
  fi
  if [[ "$(
    artifact_git_read "$git_command" -C "$canonical_root" rev-parse --is-inside-work-tree
  )" != 'true' ]]; then
    echo "source root is not inside a Git worktree: $canonical_root" >&2
    return 1
  fi

  if ! revision="$(
    artifact_git_read "$git_command" -C "$canonical_root" \
      rev-parse --verify 'HEAD^{commit}'
  )" ||
    ! tree="$(
      artifact_git_read "$git_command" -C "$canonical_root" \
        rev-parse --verify 'HEAD^{tree}'
    )" ||
    ! epoch="$(
      artifact_git_read "$git_command" -C "$canonical_root" \
        show -s --format=%ct "$revision"
    )"; then
    echo 'source HEAD does not resolve to a committed revision/tree/epoch' >&2
    return 1
  fi
  if [[ ! "$revision" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ||
    ! "$tree" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ||
    ! "$epoch" =~ ^(0|[1-9][0-9]*)$ ]]; then
    echo 'derived source revision/tree/epoch is not canonical' >&2
    return 1
  fi

  if ! artifact_verify_source_snapshot "$git_command" "$canonical_root" "$tree"; then
    return 1
  fi

  if [[ ${SOURCE_REVISION+x} == x && "${SOURCE_REVISION-}" != "$revision" ]]; then
    echo 'SOURCE_REVISION does not exactly restate the derived HEAD revision' >&2
    return 1
  fi
  if [[ ${SOURCE_TREE+x} == x && "${SOURCE_TREE-}" != "$tree" ]]; then
    echo 'SOURCE_TREE does not exactly restate the derived HEAD tree' >&2
    return 1
  fi
  if [[ ${SOURCE_DATE_EPOCH+x} == x && "${SOURCE_DATE_EPOCH-}" != "$epoch" ]]; then
    echo 'SOURCE_DATE_EPOCH does not exactly restate the derived HEAD epoch' >&2
    return 1
  fi

  if ! final_revision="$(
    artifact_git_read "$git_command" -C "$canonical_root" \
      rev-parse --verify 'HEAD^{commit}'
  )" ||
    ! final_tree="$(
      artifact_git_read "$git_command" -C "$canonical_root" \
        rev-parse --verify 'HEAD^{tree}'
    )" ||
    ! final_epoch="$(
      artifact_git_read "$git_command" -C "$canonical_root" \
        show -s --format=%ct "$final_revision"
    )"; then
    echo 'source HEAD changed or became unreadable during attestation' >&2
    return 1
  fi
  if [[ "$final_revision" != "$revision" || "$final_tree" != "$tree" ||
    "$final_epoch" != "$epoch" ]]; then
    echo 'source HEAD revision/tree/epoch changed during attestation' >&2
    return 1
  fi
  if ! artifact_verify_source_snapshot "$git_command" "$canonical_root" "$final_tree"; then
    return 1
  fi

  artifact_source_revision="$revision"
  artifact_source_tree="$tree"
  artifact_source_date_epoch="$epoch"
}
