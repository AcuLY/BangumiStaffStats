#!/usr/bin/env bash
set -euo pipefail

build_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
backend_root="$(CDPATH= cd -- "$build_root/.." && pwd -P)"
generated_root="$build_root/.tmp"

# shellcheck source=path-policy.sh
source "$build_root/path-policy.sh"
# shellcheck source=source-policy.sh
source "$build_root/source-policy.sh"

generated_root="$(artifact_prepare_generated_root "$generated_root")"
temporary_root="$(mktemp -d "$generated_root/source-policy-test.XXXXXX")"
cleanup() {
  chmod -R u+w "$temporary_root" 2>/dev/null || true
  rm -rf -- "$temporary_root"
}
trap cleanup EXIT
mkdir "$temporary_root/logs"

create_fixture() {
  local name="$1"
  local fixture="$temporary_root/$name"

  mkdir -p "$fixture/backend/build"
  cp \
    "$build_root/build.sh" \
    "$build_root/check.sh" \
    "$build_root/path-policy.sh" \
    "$build_root/source-policy.sh" \
    "$build_root/toolchain-policy.sh" \
    "$fixture/backend/build/"
  printf '%s\n' '/backend/build/.tmp/' >"$fixture/.gitignore"
  printf '%s\n' 'committed source outside Backend' >"$fixture/tracked.txt"
  git -C "$fixture" init --quiet
  git -C "$fixture" config user.name 'Backend source policy test'
  git -C "$fixture" config user.email 'backend-source-policy@example.invalid'
  git -C "$fixture" add -- .
  GIT_AUTHOR_DATE='2001-01-01T00:00:00Z' \
    GIT_COMMITTER_DATE='2001-01-01T00:00:00Z' \
    git -C "$fixture" -c commit.gpgsign=false commit --quiet -m fixture
  printf '%s\n' "$fixture"
}

assert_no_entrypoint_output() {
  local fixture="$1"
  local label="$2"

  if [[ -e "$fixture/backend/build/.tmp" ||
    -L "$fixture/backend/build/.tmp" ]]; then
    echo "$label created backend/build/.tmp before rejecting source drift" >&2
    exit 1
  fi
}

assert_entrypoints_reject() {
  local fixture="$1"
  local label="$2"
  local expected_message="$3"
  shift 3
  local overrides=("$@")
  local entrypoint
  local log

  for entrypoint in build check; do
    log="$temporary_root/logs/$label-$entrypoint.log"
    if [[ "${#overrides[@]}" -gt 0 ]]; then
      if [[ "$entrypoint" == 'build' ]]; then
        if env "${overrides[@]}" \
          "$fixture/backend/build/build.sh" \
          --target-arch arm64 \
          --output-root "$fixture/backend/build/.tmp/sentinel-output" \
          --cache-root "$fixture/backend/build/.tmp/sentinel-cache" \
          >"$log" 2>&1; then
          echo "$entrypoint.sh accepted $label" >&2
          exit 1
        fi
      elif env "${overrides[@]}" \
        "$fixture/backend/build/check.sh" --target-arch arm64 \
        >"$log" 2>&1; then
        echo "$entrypoint.sh accepted $label" >&2
        exit 1
      fi
    elif [[ "$entrypoint" == 'build' ]]; then
      if "$fixture/backend/build/build.sh" \
        --target-arch arm64 \
        --output-root "$fixture/backend/build/.tmp/sentinel-output" \
        --cache-root "$fixture/backend/build/.tmp/sentinel-cache" \
        >"$log" 2>&1; then
        echo "$entrypoint.sh accepted $label" >&2
        exit 1
      fi
    elif "$fixture/backend/build/check.sh" --target-arch arm64 \
      >"$log" 2>&1; then
      echo "$entrypoint.sh accepted $label" >&2
      exit 1
    fi
    if ! grep -Fq "$expected_message" "$log"; then
      echo "$entrypoint.sh rejected $label for the wrong reason:" >&2
      sed -n '1,20p' "$log" >&2
      exit 1
    fi
    assert_no_entrypoint_output "$fixture" "$entrypoint.sh $label"
  done
}

staged_fixture="$(create_fixture staged)"
printf '%s\n' 'staged drift' >>"$staged_fixture/tracked.txt"
git -C "$staged_fixture" add -- tracked.txt
assert_entrypoints_reject \
  "$staged_fixture" 'staged-drift' \
  'source index entries do not exactly match HEAD tree'

unstaged_fixture="$(create_fixture unstaged)"
printf '%s\n' 'tracked unstaged drift' >>"$unstaged_fixture/tracked.txt"
assert_entrypoints_reject \
  "$unstaged_fixture" 'tracked-unstaged-drift' \
  'tracked source bytes differ from HEAD tree'

untracked_fixture="$(create_fixture untracked)"
printf '%s\n' 'untracked drift' >"$untracked_fixture/non-ignored.txt"
assert_entrypoints_reject \
  "$untracked_fixture" 'untracked-drift' \
  'source worktree contains untracked non-ignored paths'

assume_fixture="$(create_fixture assume-unchanged)"
printf '%s\n' 'drift hidden by assume-unchanged' >>"$assume_fixture/tracked.txt"
git -C "$assume_fixture" update-index --assume-unchanged -- tracked.txt
assert_entrypoints_reject \
  "$assume_fixture" 'assume-unchanged-drift' \
  'source index contains assume-unchanged or skip-worktree entries'

skip_fixture="$(create_fixture skip-worktree)"
git -C "$skip_fixture" update-index --skip-worktree -- tracked.txt
printf '%s\n' 'drift hidden by skip-worktree' >>"$skip_fixture/tracked.txt"
assert_entrypoints_reject \
  "$skip_fixture" 'skip-worktree-drift' \
  'source index contains assume-unchanged or skip-worktree entries'

intent_fixture="$(create_fixture intent-to-add)"
printf '%s\n' 'intent-to-add stage anomaly' >"$intent_fixture/intent.txt"
git -C "$intent_fixture" add --intent-to-add -- intent.txt
assert_entrypoints_reject \
  "$intent_fixture" 'intent-to-add-stage-anomaly' \
  'source index entries do not exactly match HEAD tree'

mode_fixture="$(create_fixture raw-mode)"
git -C "$mode_fixture" config core.fileMode false
chmod +x "$mode_fixture/tracked.txt"
assert_entrypoints_reject \
  "$mode_fixture" 'raw-mode-drift' \
  'tracked source mode differs from HEAD tree'

filter_fixture="$(create_fixture hostile-filter)"
filter_sentinel="$temporary_root/hostile-filter-executed"
filter_script="$filter_fixture/.git/hostile-filter.sh"
printf '%s\n' \
  '#!/bin/sh' \
  "touch '$filter_sentinel'" \
  'cat >/dev/null' \
  "printf '%s\\n' 'committed source outside Backend'" \
  >"$filter_script"
chmod +x "$filter_script"
git -C "$filter_fixture" config filter.hide-drift.clean "$filter_script"
printf '%s\n' 'tracked.txt filter=hide-drift' \
  >"$filter_fixture/.git/info/attributes"
printf '%s\n' 'drift hidden by a local clean filter' \
  >>"$filter_fixture/tracked.txt"
assert_entrypoints_reject \
  "$filter_fixture" 'hostile-local-filter' \
  'tracked source bytes differ from HEAD tree'
if [[ -e "$filter_sentinel" || -L "$filter_sentinel" ]]; then
  echo 'source attestation executed a repository-local clean filter' >&2
  exit 1
fi

exclude_fixture="$(create_fixture hostile-info-exclude)"
printf '%s\n' '*' >"$exclude_fixture/.git/info/exclude"
printf '%s\n' 'hidden by info/exclude' >"$exclude_fixture/hidden.txt"
assert_entrypoints_reject \
  "$exclude_fixture" 'hostile-info-exclude' \
  'source worktree contains untracked non-ignored paths'

nested_ignore_fixture="$(create_fixture untracked-nested-ignore)"
mkdir "$nested_ignore_fixture/hidden"
printf '%s\n' '*' >"$nested_ignore_fixture/hidden/.gitignore"
printf '%s\n' 'hidden by an untracked nested rule' \
  >"$nested_ignore_fixture/hidden/value.txt"
assert_entrypoints_reject \
  "$nested_ignore_fixture" 'untracked-nested-ignore' \
  'untracked .gitignore parent is not ignored by a tracked parent rule'

trusted_nested_ignore_fixture="$(create_fixture trusted-nested-ignore)"
printf '%s\n' '/updater/.venv/' \
  >>"$trusted_nested_ignore_fixture/.gitignore"
git -C "$trusted_nested_ignore_fixture" add -- .gitignore
GIT_AUTHOR_DATE='2001-01-02T00:00:00Z' \
  GIT_COMMITTER_DATE='2001-01-02T00:00:00Z' \
  git -C "$trusted_nested_ignore_fixture" -c commit.gpgsign=false \
    commit --quiet -m 'trust generated root'
mkdir -p "$trusted_nested_ignore_fixture/updater/.venv/cache"
printf '%s\n' '*' \
  >"$trusted_nested_ignore_fixture/updater/.venv/.gitignore"
printf '%s\n' 'legitimate ignored tool state' \
  >"$trusted_nested_ignore_fixture/updater/.venv/cache/value"
if ! git -C "$trusted_nested_ignore_fixture" \
  ls-files --others -- \
  ':(glob)**/.gitignore' |
  grep -Fxq 'updater/.venv/.gitignore'; then
  echo 'trusted nested ignore fixture did not expose its untracked rule' >&2
  exit 1
fi
artifact_attest_source "$trusted_nested_ignore_fixture"

symlink_fixture="$(create_fixture tracked-symlink)"
ln -s tracked.txt "$symlink_fixture/tracked-link"
git -C "$symlink_fixture" add -- tracked-link
git -C "$symlink_fixture" -c commit.gpgsign=false commit --quiet -m symlink
assert_entrypoints_reject \
  "$symlink_fixture" 'tracked-symlink-policy' \
  'HEAD tree contains an unsupported non-regular mode'

alternate_index_fixture="$(create_fixture alternate-index)"
alternate_index="$temporary_root/clean-alternate-index"
cp "$alternate_index_fixture/.git/index" "$alternate_index"
printf '%s\n' 'staged drift hidden by caller index' \
  >>"$alternate_index_fixture/tracked.txt"
git -C "$alternate_index_fixture" add -- tracked.txt
assert_entrypoints_reject \
  "$alternate_index_fixture" 'alternate-index-injection' \
  'source index entries do not exactly match HEAD tree' \
  "GIT_INDEX_FILE=$alternate_index"

alternate_worktree_fixture="$(create_fixture alternate-worktree)"
clean_worktree_fixture="$(create_fixture clean-worktree)"
printf '%s\n' 'unstaged drift hidden by caller worktree' \
  >>"$alternate_worktree_fixture/tracked.txt"
assert_entrypoints_reject \
  "$alternate_worktree_fixture" 'alternate-worktree-injection' \
  'tracked source bytes differ from HEAD tree' \
  "GIT_WORK_TREE=$clean_worktree_fixture"

git_dir_fixture="$(create_fixture git-dir)"
clean_git_dir_fixture="$(create_fixture clean-git-dir)"
printf '%s\n' 'staged drift hidden by caller Git directory' \
  >>"$git_dir_fixture/tracked.txt"
git -C "$git_dir_fixture" add -- tracked.txt
assert_entrypoints_reject \
  "$git_dir_fixture" 'git-dir-injection' \
  'source index entries do not exactly match HEAD tree' \
  "GIT_DIR=$clean_git_dir_fixture/.git"

config_fixture="$(create_fixture config-env)"
printf '%s\n' 'untracked drift with hostile config environment' \
  >"$config_fixture/non-ignored.txt"
assert_entrypoints_reject \
  "$config_fixture" 'config-environment-injection' \
  'source worktree contains untracked non-ignored paths' \
  'GIT_CONFIG_COUNT=1' \
  'GIT_CONFIG_KEY_0=invalid key with spaces' \
  'GIT_CONFIG_VALUE_0=value'

override_fixture="$(create_fixture override)"
assert_entrypoints_reject \
  "$override_fixture" 'revision-override-drift' \
  'SOURCE_REVISION does not exactly restate the derived HEAD revision' \
  'SOURCE_REVISION=0000000000000000000000000000000000000000'
assert_entrypoints_reject \
  "$override_fixture" 'tree-override-drift' \
  'SOURCE_TREE does not exactly restate the derived HEAD tree' \
  'SOURCE_TREE=ffffffffffffffffffffffffffffffffffffffff'
derived_epoch="$(git -C "$override_fixture" show -s --format=%ct HEAD)"
assert_entrypoints_reject \
  "$override_fixture" 'epoch-override-drift' \
  'SOURCE_DATE_EPOCH does not exactly restate the derived HEAD epoch' \
  "SOURCE_DATE_EPOCH=$((derived_epoch + 1))"
assert_entrypoints_reject \
  "$override_fixture" 'empty-revision-override' \
  'SOURCE_REVISION does not exactly restate the derived HEAD revision' \
  'SOURCE_REVISION='

ignored_fixture="$(create_fixture ignored)"
mkdir -p "$ignored_fixture/backend/build/.tmp/cache"
printf '%s\n' 'ignored generated data' \
  >"$ignored_fixture/backend/build/.tmp/cache/value"
expected_revision="$(git -C "$ignored_fixture" rev-parse --verify 'HEAD^{commit}')"
expected_tree="$(git -C "$ignored_fixture" rev-parse --verify 'HEAD^{tree}')"
expected_epoch="$(git -C "$ignored_fixture" show -s --format=%ct HEAD)"
(
  export SOURCE_REVISION="$expected_revision"
  export SOURCE_TREE="$expected_tree"
  export SOURCE_DATE_EPOCH="$expected_epoch"
  artifact_attest_source "$ignored_fixture"
  [[ "$artifact_source_revision" == "$expected_revision" ]]
  [[ "$artifact_source_tree" == "$expected_tree" ]]
  [[ "$artifact_source_date_epoch" == "$expected_epoch" ]]
)

context_fixture="$(create_fixture isolated-context)"
printf '%s\n' '/backend/.env' '/backend/cache/' \
  >>"$context_fixture/.gitignore"
git -C "$context_fixture" add -- .gitignore
GIT_AUTHOR_DATE='2001-01-03T00:00:00Z' \
  GIT_COMMITTER_DATE='2001-01-03T00:00:00Z' \
  git -C "$context_fixture" -c commit.gpgsign=false \
    commit --quiet -m 'ignore live Backend state'
mkdir -p "$context_fixture/backend/cache"
printf '%s\n' 'first ignored environment' >"$context_fixture/backend/.env"
printf '%s\n' 'first ignored cache' >"$context_fixture/backend/cache/value"
artifact_attest_source "$context_fixture"
context_tree="$artifact_source_tree"
context_snapshot_one="$temporary_root/context-snapshot-one"
artifact_materialize_source_tree \
  "$context_fixture" "$context_tree" "$context_snapshot_one"
printf '%s\n' 'second ignored environment' >"$context_fixture/backend/.env"
printf '%s\n' 'second ignored cache' >"$context_fixture/backend/cache/value"
artifact_attest_source "$context_fixture"
context_snapshot_two="$temporary_root/context-snapshot-two"
artifact_materialize_source_tree \
  "$context_fixture" "$artifact_source_tree" "$context_snapshot_two"
if [[ "$artifact_source_tree" != "$context_tree" ]] ||
  ! diff -qr "$context_snapshot_one" "$context_snapshot_two" >/dev/null ||
  [[ -e "$context_snapshot_one/backend/.env" ||
    -L "$context_snapshot_one/backend/.env" ||
    -e "$context_snapshot_one/backend/cache" ||
    -L "$context_snapshot_one/backend/cache" ||
    -e "$context_snapshot_two/backend/.env" ||
    -L "$context_snapshot_two/backend/.env" ||
    -e "$context_snapshot_two/backend/cache" ||
    -L "$context_snapshot_two/backend/cache" ]]; then
  echo 'ignored live Backend state influenced the materialized source context' >&2
  exit 1
fi
context_git_command="$(artifact_resolve_git_command)"
if ! artifact_git_read "$context_git_command" -C "$context_fixture" \
  cat-file blob "$context_tree:tracked.txt" |
  cmp - "$context_snapshot_one/tracked.txt" ||
  [[ ! -x "$context_snapshot_one/backend/build/build.sh" ]] ||
  [[ -x "$context_snapshot_one/tracked.txt" ]]; then
  echo 'materialized source context does not preserve raw tracked bytes and modes' >&2
  exit 1
fi

reuse_fixture="$(create_fixture failed-identity-reuse)"
artifact_attest_source "$reuse_fixture"
printf '%s\n' 'later untracked drift' >"$reuse_fixture/non-ignored.txt"
if artifact_attest_source "$reuse_fixture" >/dev/null 2>&1; then
  echo 'source attestation accepted drift after a prior success' >&2
  exit 1
fi
if [[ -n "$artifact_source_revision" || -n "$artifact_source_tree" ||
  -n "$artifact_source_date_epoch" ]]; then
  echo 'failed source attestation retained a previously accepted identity' >&2
  exit 1
fi

nested_fixture="$(create_fixture nested)"
if artifact_attest_source "$nested_fixture/backend" >/dev/null 2>&1; then
  echo 'source attestation accepted a non-top-level repository directory' >&2
  exit 1
fi

line_number() {
  local path="$1"
  local needle="$2"
  awk -v needle="$needle" 'index($0, needle) { print NR; exit }' "$path"
}

assert_precedes() {
  local path="$1"
  local first="$2"
  local second="$3"
  local first_line
  local second_line

  first_line="$(line_number "$path" "$first")"
  second_line="$(line_number "$path" "$second")"
  if [[ -z "$first_line" || -z "$second_line" || "$first_line" -ge "$second_line" ]]; then
    echo "$(basename "$path") must run $first before $second" >&2
    exit 1
  fi
}

for marker in \
  'artifact_prepare_generated_root' \
  'artifact_create_child_directory' \
  'mktemp -d' \
  'artifact_materialize_source_tree' \
  'artifact_require_container_toolchain' \
  'go build -tags artifacts' \
  'docker pull' \
  'docker buildx build'; do
  assert_precedes \
    "$build_root/build.sh" \
    'artifact_attest_source "$repository_root"' \
    "$marker"
done
for marker in \
  'artifact_require_container_toolchain' \
  '"$build_root/test.sh"' \
  'artifact_prepare_generated_root' \
  'mktemp -d'; do
  assert_precedes \
    "$build_root/check.sh" \
    'artifact_attest_source "$repository_root"' \
    "$marker"
done
if ! grep -Fq 'source_revision="$artifact_source_revision"' "$build_root/build.sh" ||
  ! grep -Fq 'source_tree="$artifact_source_tree"' "$build_root/build.sh" ||
  ! grep -Fq 'source_date_epoch="$artifact_source_date_epoch"' "$build_root/build.sh" ||
  ! grep -Fq \
    'artifact_materialize_source_tree "$repository_root" "$source_tree" "$snapshot_root"' \
    "$build_root/build.sh" ||
  ! grep -Fq -- '--build-arg "SOURCE_DATE_EPOCH=$source_date_epoch"' \
    "$build_root/build.sh"; then
  echo 'build.sh does not bind output identity to the attested full Git tree' >&2
  exit 1
fi
if ! grep -Fq 'cd "$snapshot_backend_root"' "$build_root/build.sh" ||
  ! grep -Fq -- '--file "$snapshot_backend_root/Dockerfile"' \
    "$build_root/build.sh" ||
  [[ "$(grep -Fc '  "$snapshot_backend_root" >&2' "$build_root/build.sh")" -ne 2 ]] ||
  ! grep -Fq \
    'sha256_file "$snapshot_root/$relative_path"' "$build_root/build.sh" ||
  ! grep -Fq \
    'CONTRACTS_ROOT="$snapshot_contracts_root/artifacts"' "$build_root/build.sh" ||
  grep -Fq -- '--file "$backend_root/Dockerfile"' "$build_root/build.sh" ||
  grep -Fxq '  "$backend_root" >&2' "$build_root/build.sh"; then
  echo 'build.sh reads a live source path instead of its raw tracked snapshot' >&2
  exit 1
fi
for marker in \
  'command env -i' \
  'GIT_CONFIG_GLOBAL=/dev/null' \
  'GIT_CONFIG_NOSYSTEM=1' \
  'GIT_NO_REPLACE_OBJECTS=1' \
  'GIT_OPTIONAL_LOCKS=0' \
  '-c core.fsmonitor=false' \
  '-c core.untrackedCache=false' \
  'ls-files --stage' \
  'ls-files -v' \
  'ls-files -f' \
  'hash-object --no-filters' \
  'check-ignore -z -v --no-index --stdin' \
  'cat-file blob' \
  'untracked .gitignore parent is not ignored by a tracked parent rule'; do
  if ! grep -Fq -- "$marker" "$build_root/source-policy.sh"; then
    echo "source-policy.sh does not isolate Git reads with $marker" >&2
    exit 1
  fi
done
if grep -Eq '(^|[[:space:]])git[[:space:]]+-C' "$build_root/source-policy.sh"; then
  echo 'source-policy.sh contains a Git read outside artifact_git_read' >&2
  exit 1
fi
dockerfile="$backend_root/Dockerfile"
if ! grep -Fxq \
  'FROM --platform=$BUILDPLATFORM docker.io/library/golang:1.26.5-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651 AS build' \
  "$dockerfile" ||
  ! grep -Fxq \
    'FROM gcr.io/distroless/static-debian13:nonroot@sha256:f7f8f729987ad0fdf6b05eeeae94b26e6a0f613bdf46feea7fc40f7bd72953e6 AS runtime' \
    "$dockerfile" ||
  grep -Eq '^ARG[[:space:]]+(GO_IMAGE|RUNTIME_IMAGE)(=|[[:space:]]|$)' "$dockerfile" ||
  grep -Eq '^FROM .*\$\{?(GO_IMAGE|RUNTIME_IMAGE)' "$dockerfile" ||
  grep -Eq -- '--build-arg[[:space:]]+"?(GO_IMAGE|RUNTIME_IMAGE)=' \
    "$build_root/build.sh"; then
  echo 'Backend base-image digests are exposed to ARG override' >&2
  exit 1
fi

echo 'backend source attestation tests passed'
