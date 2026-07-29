#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'operations bundle error: %s\n' "$*" >&2
  exit 1
}

require_regular_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] || fail "expected one regular file: $path"
}

require_exact_inventory() {
  local root="$1"
  local expected="$2"
  local actual

  [[ -d "$root" && ! -L "$root" ]] || fail "expected one real directory: $root"
  actual="$(
    find "$root" -mindepth 1 -maxdepth 1 -printf '%f\n' |
      LC_ALL=C sort
  )"
  [[ "$actual" == "$expected" ]] ||
    fail "unexpected inventory below $root"
}

repository_root="$(
  CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P
)"
# shellcheck source=../lib/common.sh
source "$repository_root/operations/lib/common.sh"
accepted_product_revision='fd4ff7339ff09bdb94e36a66f075629b4ab75e89'
accepted_ci_policy_sha256='0260babc76f71b1fb0730bb84894ce0f3c41c9df93591910f05ac9352ee98176'
data_version='dv1-0a1fa3e9acdb06be34e3535b3c68e322e7d3f4cd87ac30cd4b608b2276ba3ca1'

[[ -n "${GITHUB_SHA:-}" ]] || fail 'GITHUB_SHA is required'
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'GITHUB_SHA must be one lowercase commit ID'
[[ -n "${RUNNER_TEMP:-}" && "$RUNNER_TEMP" == /* ]] ||
  fail 'RUNNER_TEMP must be one absolute runner-owned directory'
[[ -d "$RUNNER_TEMP" && ! -L "$RUNNER_TEMP" ]] ||
  fail 'RUNNER_TEMP must be one real directory'

source_revision="$(git -C "$repository_root" rev-parse --verify HEAD)"
source_tree="$(git -C "$repository_root" rev-parse --verify 'HEAD^{tree}')"
[[ "$source_revision" == "$GITHUB_SHA" ]] ||
  fail 'checked-out HEAD does not equal GITHUB_SHA'
git -C "$repository_root" diff --quiet --ignore-submodules -- ||
  fail 'tracked worktree is dirty'
git -C "$repository_root" diff --cached --quiet --ignore-submodules -- ||
  fail 'index is dirty'
[[ -z "$(git -C "$repository_root" ls-files --others --exclude-standard)" ]] ||
  fail 'checkout has unexpected untracked files'
git -C "$repository_root" merge-base --is-ancestor \
  "$accepted_product_revision" "$source_revision" ||
  fail 'accepted Product revision is not an ancestor of HEAD'
git -C "$repository_root" diff --quiet \
  "$accepted_product_revision" "$source_revision" -- \
  VERSION backend contracts frontend updater \
  ':(top,exclude)contracts/artifacts/test/ci-policy.test.mjs' ||
  fail 'accepted Product inputs differ from the reviewed revision'

ci_policy="$repository_root/contracts/artifacts/test/ci-policy.test.mjs"
ci_policy_sha256="$(sha256sum -- "$ci_policy" | awk '{print $1}')"
[[ "$ci_policy_sha256" == "$accepted_ci_policy_sha256" ]] ||
  fail 'CI action-reference policy differs from the exact reviewed bytes'

current_ci="$repository_root/.github/workflows/ci.yml"
accepted_ci="$(mktemp "$RUNNER_TEMP/bgmss-accepted-development-workflow.XXXXXX")"
git -C "$repository_root" show \
  "${accepted_product_revision}:.github/workflows/ci.yml" >"$accepted_ci"
workflow_prefix_lines=$(
  development_workflow_prefix_lines "$accepted_ci" "$current_ci"
)
IFS='|' read -r accepted_prefix_line current_prefix_line <<<"$workflow_prefix_lines"
if ! cmp -s \
  <(_development_workflow_product_prefix "$accepted_ci" "$accepted_prefix_line") \
  <(_development_workflow_product_prefix "$current_ci" "$current_prefix_line"); then
  fail 'Development workflow product prefix differs from the accepted Product'
fi
rm -f -- "$accepted_ci"

application_version="$(sed -n '1p' "$repository_root/VERSION")"
[[ "$application_version" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] ||
  fail 'VERSION is not one normalized application version'
[[ "$(wc -l <"$repository_root/VERSION" | tr -d ' ')" == '1' ]] ||
  fail 'VERSION must contain exactly one line'

bash "$repository_root/operations/test/updater-proxy.sh"

backend_output="$repository_root/backend/build/.tmp/operations-bundle-output"
backend_cache="$repository_root/backend/build/.tmp/operations-bundle-cache"
backend_root="$(
  "$repository_root/backend/build/build.sh" \
    --target-arch amd64 \
    --output-root "$backend_output" \
    --cache-root "$backend_cache"
)"
[[ "$backend_root" == "$backend_output"/sha256-* ]] ||
  fail 'Backend build did not return one content-addressed root'
require_exact_inventory \
  "$backend_root" \
  $'backend-api-linux-amd64.oci.tar\nbackend-api-linux-amd64.tar.gz\nbackend.spdx.json\nchecksums.sha256\ncomponent-statement.json'
require_regular_file "$backend_root/backend-api-linux-amd64.oci.tar"
require_regular_file "$backend_root/backend-api-linux-amd64.tar.gz"

(
  cd "$repository_root/updater"
  export UV_CACHE_DIR="$PWD/.cache/uv"
  export UV_PYTHON_INSTALL_DIR="$PWD/.tmp/python"
  export PYTHONDONTWRITEBYTECODE=1
  export PYTHONPYCACHEPREFIX="$PWD/build/.tmp/pycache"
  uv python install 3.14.6
  uv sync --frozen --python 3.14.6
)
updater_log="$RUNNER_TEMP/bgmss-operations-updater-build.log"
"$repository_root/updater/.venv/bin/python" \
  "$repository_root/updater/build/artifact.py" build \
  --work-root "$repository_root/updater/build/.tmp/operations-bundle-work" \
  --target linux/amd64 \
  --source-revision "$source_revision" \
  --source-tree "$source_tree" \
  --uv "$(command -v uv)" \
  --python "$repository_root/updater/.venv/bin/python" \
  --docker "$(command -v docker)" \
  --contracts-root "$repository_root/contracts" \
  --publish-root "$repository_root/updater/build/.tmp/operations-bundle-output" |
  tee "$updater_log"
updater_root="$(tail -n 1 "$updater_log")"
updater_output="$repository_root/updater/build/.tmp/operations-bundle-output"
[[ "$updater_root" == "$updater_output"/sha256-* ]] ||
  fail 'Updater build did not return one content-addressed root'
updater_address="${updater_root#"$updater_output"/sha256-}"
[[ "$updater_address" =~ ^[0-9a-f]{64}$ ]] ||
  fail 'Updater content address is not one SHA-256 value'
[[ "$(grep -Fxc "$updater_root" "$updater_log")" == '1' ]] ||
  fail 'Updater build emitted an ambiguous content-addressed root'
require_regular_file "$updater_root/artifacts/updater-image-linux-amd64.oci.tar"
[[ "$(
  find "$updater_root/artifacts" -maxdepth 1 -type f \
    -name 'updater-image-*.oci.tar' -printf '%f\n'
)" == 'updater-image-linux-amd64.oci.tar' ]] ||
  fail 'Updater output does not contain one uniquely named AMD64 OCI archive'

(
  cd "$repository_root/frontend"
  npm ci --ignore-scripts --no-audit --no-fund
  npm run build
  npm run check:artifact
  node build/artifact.mjs package \
    --dist "$PWD/dist" \
    --output "$PWD/build/.tmp/operations-bundle-component" \
    --source-revision "$source_revision" \
    --source-tree "$source_tree" \
    --target-os linux \
    --target-architecture amd64
)
frontend_root="$repository_root/frontend/build/.tmp/operations-bundle-component"
require_exact_inventory \
  "$frontend_root/artifacts" \
  'frontend-static-linux-amd64.tar'
require_regular_file "$frontend_root/artifacts/frontend-static-linux-amd64.tar"

fixture_root="$repository_root/contracts/goldens/archive/valid/minimal"
require_exact_inventory \
  "$fixture_root" \
  $'archive-manifest.json\nbangumi.sqlite\ncurrent-pointer.json'
require_regular_file "$fixture_root/archive-manifest.json"
require_regular_file "$fixture_root/bangumi.sqlite"
require_regular_file "$fixture_root/current-pointer.json"

runner_temp="$(CDPATH= cd -- "$RUNNER_TEMP" && pwd -P)"
[[ "$runner_temp" == "$RUNNER_TEMP" ]] ||
  fail 'RUNNER_TEMP resolves through an unexpected path'
bundle_root="$(mktemp -d "$runner_temp/bgmss-operations-bundle.XXXXXX")"
version_root="$bundle_root/minimal-archive/versions/$data_version"
mkdir -p -- "$version_root"

install -m 0444 -- \
  "$backend_root/backend-api-linux-amd64.oci.tar" \
  "$bundle_root/api.oci.tar"
install -m 0444 -- \
  "$updater_root/artifacts/updater-image-linux-amd64.oci.tar" \
  "$bundle_root/updater.oci.tar"
install -m 0444 -- \
  "$backend_root/backend-api-linux-amd64.tar.gz" \
  "$bundle_root/backend-tools.tar.gz"
install -m 0444 -- \
  "$frontend_root/artifacts/frontend-static-linux-amd64.tar" \
  "$bundle_root/frontend.tar"
install -m 0444 -- \
  "$fixture_root/current-pointer.json" \
  "$bundle_root/minimal-archive/current.json"
install -m 0444 -- \
  "$fixture_root/archive-manifest.json" \
  "$version_root/manifest.json"
install -m 0444 -- \
  "$fixture_root/bangumi.sqlite" \
  "$version_root/bangumi.sqlite"

BUNDLE_BUILD_JSON="$bundle_root/build.json" \
SOURCE_REVISION="$source_revision" \
SOURCE_TREE="$source_tree" \
APPLICATION_VERSION="$application_version" \
node <<'NODE'
const fs = require('node:fs');

const revision = process.env.SOURCE_REVISION;
const document = {
  sourceRevision: revision,
  sourceTree: process.env.SOURCE_TREE,
  applicationVersion: process.env.APPLICATION_VERSION,
  platform: 'linux/amd64',
  apiImage: `localhost/bgmss-backend-api:${revision}-amd64`,
  updaterImage: `localhost/bgmss-updater-artifact:${revision}-amd64`,
};
fs.writeFileSync(
  process.env.BUNDLE_BUILD_JSON,
  `${JSON.stringify(document, null, 2)}\n`,
  { flag: 'wx', mode: 0o444 },
);
NODE

payload_paths=(
  'api.oci.tar'
  'backend-tools.tar.gz'
  'build.json'
  'frontend.tar'
  'minimal-archive/current.json'
  "minimal-archive/versions/$data_version/bangumi.sqlite"
  "minimal-archive/versions/$data_version/manifest.json"
  'updater.oci.tar'
)
(
  cd "$bundle_root"
  sha256sum -- "${payload_paths[@]}"
) >"$bundle_root/SHA256SUMS"
chmod 0444 "$bundle_root/SHA256SUMS"

expected_bundle_inventory="$(
  printf '%s\n' 'SHA256SUMS' "${payload_paths[@]}" | LC_ALL=C sort
)"
actual_bundle_inventory="$(
  find "$bundle_root" -type f -printf '%P\n' | LC_ALL=C sort
)"
[[ "$actual_bundle_inventory" == "$expected_bundle_inventory" ]] ||
  fail 'assembled bundle inventory is not closed'
[[ "$(wc -l <"$bundle_root/SHA256SUMS" | tr -d ' ')" == \
  "${#payload_paths[@]}" ]] ||
  fail 'SHA256SUMS does not cover every payload file exactly once'
(
  cd "$bundle_root"
  sha256sum --check --strict SHA256SUMS >/dev/null
)

printf 'BUNDLE_ROOT=%s\n' "$bundle_root"
