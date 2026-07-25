#!/usr/bin/env bash

artifact_prepare_generated_root() {
  local candidate="$1"
  local parent
  local physical

  if [[ "$candidate" != /* ]]; then
    echo "generated root must be absolute: $candidate" >&2
    return 1
  fi
  if [[ -L "$candidate" ]]; then
    echo "generated root must not be a symlink: $candidate" >&2
    return 1
  fi
  if [[ -e "$candidate" && ! -d "$candidate" ]]; then
    echo "generated root must be a directory: $candidate" >&2
    return 1
  fi
  parent="${candidate%/*}"
  if [[ ! -d "$parent" || -L "$parent" ]]; then
    echo "generated-root parent must be an existing real directory: $parent" >&2
    return 1
  fi
  physical="$(CDPATH= cd -- "$parent" && pwd -P)"
  if [[ "$physical" != "$parent" ]]; then
    echo "generated-root parent contains a symlink: $parent" >&2
    return 1
  fi
  if [[ ! -e "$candidate" ]]; then
    mkdir -- "$candidate"
  fi
  physical="$(CDPATH= cd -- "$candidate" && pwd -P)"
  if [[ "$physical" != "$candidate" || -L "$candidate" ]]; then
    echo "generated root did not resolve to its declared path: $candidate" >&2
    return 1
  fi
  printf '%s\n' "$physical"
}

artifact_resolve_child_directory() {
  local generated_root="$1"
  local requested="$2"
  local label="$3"
  local lexical
  local parent
  local physical_parent
  local without_leading
  local segment
  local segments

  if [[ -z "$requested" || "$requested" == */ || "$requested" == *'//'*
    || "$requested" == *$'\n'* || "$requested" == *$'\r'* ]]; then
    echo "$label is not a normalized path: $requested" >&2
    return 1
  fi
  without_leading="${requested#/}"
  IFS='/' read -r -a segments <<<"$without_leading"
  for segment in "${segments[@]}"; do
    if [[ ! "$segment" =~ ^[A-Za-z0-9._-]+$ || "$segment" == '.' || "$segment" == '..' ]]; then
      echo "$label contains an unsafe path segment: $requested" >&2
      return 1
    fi
  done

  if [[ "$requested" == /* ]]; then
    lexical="$requested"
  else
    lexical="$(pwd -P)/$requested"
  fi
  case "$lexical" in
    "$generated_root"/*) ;;
    *)
      echo "$label escapes backend/build/.tmp: $requested" >&2
      return 1
      ;;
  esac

  parent="${lexical%/*}"
  if [[ ! -d "$parent" ]]; then
    echo "$label parent must already exist: $parent" >&2
    return 1
  fi
  physical_parent="$(CDPATH= cd -- "$parent" && pwd -P)"
  if [[ "$physical_parent" != "$parent" ]]; then
    echo "$label parent contains a symlink: $parent" >&2
    return 1
  fi
  if [[ -L "$lexical" ]]; then
    echo "$label must not be a symlink: $lexical" >&2
    return 1
  fi
  if [[ -e "$lexical" && ! -d "$lexical" ]]; then
    echo "$label must be a directory: $lexical" >&2
    return 1
  fi
  printf '%s\n' "$lexical"
}

artifact_create_child_directory() {
  local candidate="$1"
  local physical

  if [[ ! -e "$candidate" ]]; then
    mkdir -- "$candidate"
  fi
  if [[ -L "$candidate" || ! -d "$candidate" ]]; then
    echo "generated child is not a real directory: $candidate" >&2
    return 1
  fi
  physical="$(CDPATH= cd -- "$candidate" && pwd -P)"
  if [[ "$physical" != "$candidate" ]]; then
    echo "generated child resolved outside its declared path: $candidate" >&2
    return 1
  fi
}
