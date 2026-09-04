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
application_version="$(sed -n '1p' "$repository_root/VERSION")"
[[ "$application_version" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] ||
  fail 'VERSION is not one normalized application version'
[[ "$(wc -l <"$repository_root/VERSION" | tr -d ' ')" == '1' ]] ||
  fail 'VERSION must contain exactly one line'

bash "$repository_root/operations/test/runtime.sh"

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
producer_runtime_input='contracts/producer-runtime-inputs-v1'
BACKEND_STATEMENT="$backend_root/component-statement.json" \
PRODUCER_RUNTIME_INPUT="$producer_runtime_input" \
node <<'NODE'
const fs = require('node:fs');
const statement = JSON.parse(fs.readFileSync(process.env.BACKEND_STATEMENT, 'utf8'));
const matches = statement.inputs.filter(
  (input) => input.path === process.env.PRODUCER_RUNTIME_INPUT,
);
if (matches.length !== 1) throw new Error('Backend statement lacks producer input');
NODE

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
  components: ['backend', 'frontend'],
};
fs.writeFileSync(
  process.env.BUNDLE_BUILD_JSON,
  `${JSON.stringify(document, null, 2)}\n`,
  { flag: 'wx', mode: 0o444 },
);
NODE

BACKEND_ROOT="$backend_root" \
FRONTEND_ROOT="$frontend_root" \
COMPATIBILITY_MANIFEST="$bundle_root/compatibility-manifest.json" \
CONTRACTS_ARTIFACTS="$repository_root/contracts/artifacts" \
node --input-type=module <<'NODE'
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const validator = await import(
  pathToFileURL(`${process.env.CONTRACTS_ARTIFACTS}/lib/validation.mjs`).href
);
const assembled = validator.assembleCompatibilityManifest([
  process.env.BACKEND_ROOT,
  process.env.FRONTEND_ROOT,
]);
fs.writeFileSync(process.env.COMPATIBILITY_MANIFEST, assembled.canonical, {
  flag: 'wx',
  mode: 0o444,
});
NODE

payload_paths=(
  'api.oci.tar'
  'build.json'
  'compatibility-manifest.json'
  'frontend.tar'
  'minimal-archive/current.json'
  "minimal-archive/versions/$data_version/bangumi.sqlite"
  "minimal-archive/versions/$data_version/manifest.json"
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
