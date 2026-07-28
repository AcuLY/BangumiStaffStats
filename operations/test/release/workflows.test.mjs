import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WORKFLOW_PATHS,
  WorkflowPolicyError,
  checkRepositoryWorkflows,
  parseWorkflowSource,
  readWorkflowSources,
  validateWorkflowSet,
  validateWorkflowSource,
} from '../../release/check-workflows.mjs';

const sources = readWorkflowSources();

function replaceRequired(source, before, after) {
  assert.ok(source.includes(before), `fixture source must contain ${before}`);
  return source.replace(before, after);
}

function assertRejected(relativePath, source, expectedCodes) {
  const codes = new Set(
    Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes],
  );
  assert.throws(
    () => validateWorkflowSource(relativePath, source),
    (error) =>
      error instanceof WorkflowPolicyError &&
      codes.has(error.code),
  );
}

test('all four repository workflows pass the closed policy', () => {
  const result = checkRepositoryWorkflows();
  assert.deepEqual(Object.keys(result), WORKFLOW_PATHS);
  assert.equal(
    result['.github/workflows/ci.yml'].name,
    'development-artifacts',
  );
  assert.equal(
    result['.github/workflows/operations.yml'].permissions.contents,
    'read',
  );
  assert.equal(
    result['.github/workflows/release.yml'].jobs.publish.environment,
    'release',
  );
  assert.equal(
    result['.github/workflows/deploy.yml'].jobs.deploy.environment,
    'production',
  );
});

test('workflow set is closed and rejects a missing protected workflow', () => {
  const incomplete = { ...sources };
  delete incomplete['.github/workflows/ci.yml'];
  assert.throws(
    () => validateWorkflowSet(incomplete),
    (error) =>
      error instanceof WorkflowPolicyError &&
      error.code === 'CLOSED_SHAPE',
  );
});

test('YAML duplicate keys are rejected before policy evaluation', () => {
  assert.throws(
    () =>
      parseWorkflowSource(
        'name: first\nname: second\non: {}\npermissions: {}\nconcurrency: {}\njobs: {}\n',
        'duplicate.yml',
      ),
    (error) =>
      error instanceof WorkflowPolicyError &&
      error.code === 'YAML_PARSE',
  );
});

test('YAML aliases and merge indirection are rejected', () => {
  const alias = [
    'name: alias',
    'on: {}',
    'permissions: &permissions',
    '  contents: read',
    'concurrency: {}',
    'jobs:',
    '  verify:',
    '    permissions: *permissions',
    '',
  ].join('\n');
  assert.throws(
    () => parseWorkflowSource(alias, 'alias.yml'),
    (error) =>
      error instanceof WorkflowPolicyError &&
      ['YAML_ALIAS', 'YAML_PARSE'].includes(error.code),
  );
});

test('deeply nested YAML is rejected with a fixed collection limit', () => {
  const lines = [];
  for (let depth = 0; depth < 36; depth += 1) {
    lines.push(`${'  '.repeat(depth)}level_${depth}:`);
  }
  lines.push(`${'  '.repeat(36)}value: true`);
  const nested = `${lines.join('\n')}\n`;
  assert.throws(
    () => parseWorkflowSource(nested, 'deep.yml'),
    (error) =>
      error instanceof WorkflowPolicyError &&
      error.code === 'YAML_DEPTH',
  );
});

test('protected ci.yml is bound to the accepted byte digest', () => {
  const changed = replaceRequired(
    sources['.github/workflows/ci.yml'],
    'name: development-artifacts',
    'name: development-artifacts-changed',
  );
  assertRejected('.github/workflows/ci.yml', changed, ['NAME', 'CI_DIGEST']);
});

test('floating Action refs are rejected', () => {
  const changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'actions/checkout@v4',
  );
  assertRejected('.github/workflows/operations.yml', changed, 'ACTION_PIN');
});

test('an unknown Action remains forbidden even with a full commit pin', () => {
  const changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    `malicious/example@${'a'.repeat(40)}`,
  );
  assertRejected(
    '.github/workflows/operations.yml',
    changed,
    'ACTION_ALLOWLIST',
  );
});

test('reviewed Actions cannot select a different tool version', () => {
  const changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    '          node-version: 24.18.0',
    '          node-version: 24.19.0',
  );
  assertRejected(
    '.github/workflows/operations.yml',
    changed,
    'TOOL_IDENTITY',
  );
});

test('pull_request_target is forbidden', () => {
  const changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    'on:\n  pull_request:',
    'on:\n  pull_request_target:',
  );
  assertRejected('.github/workflows/operations.yml', changed, 'TRIGGER');
});

test('operations workflow cannot acquire publication authority', () => {
  const changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    '          npm --prefix operations run check',
    [
      '          npm --prefix operations run check',
      '          docker login ghcr.io',
    ].join('\n'),
  );
  assertRejected(
    '.github/workflows/operations.yml',
    changed,
    'PUBLICATION_AUTHORITY',
  );
});

test('operations workflow cannot narrow the aggregate Operations check set', () => {
  const changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    'npm --prefix operations run check',
    'npm --prefix operations run test:release',
  );
  assertRejected(
    '.github/workflows/operations.yml',
    changed,
    'REQUIRED_GATE',
  );
});

test('operations workflow cannot select an Environment', () => {
  const changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    '    runs-on: ubuntu-24.04\n    timeout-minutes: 20',
    [
      '    runs-on: ubuntu-24.04',
      '    timeout-minutes: 20',
      '    environment: production',
    ].join('\n'),
  );
  assertRejected(
    '.github/workflows/operations.yml',
    changed,
    ['CLOSED_SHAPE', 'ENVIRONMENT'],
  );
});

test('operations candidate verification cannot skip pull requests', () => {
  const changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    "      github.event_name == 'pull_request' ||\n",
    '',
  );
  assertRejected(
    '.github/workflows/operations.yml',
    changed,
    'CANDIDATE_CONDITION',
  );
});

test('validation handoff cannot be sealed before candidate verification', () => {
  let changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    'npm --prefix operations run verify:candidate --',
    'npm --prefix operations run verify-disabled --',
  );
  changed = replaceRequired(
    changed,
    '          sha256sum --check validation-candidate.tar.sha256',
    [
      '          sha256sum --check validation-candidate.tar.sha256',
      '          npm --prefix operations run verify:candidate -- --root "${candidate_roots[0]}"',
    ].join('\n'),
  );
  assertRejected(
    '.github/workflows/operations.yml',
    changed,
    'VALIDATION_HANDOFF',
  );
});

test('validation handoff upload is one-day and non-overwriting', () => {
  const changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    '          retention-days: 1',
    '          retention-days: 2',
  );
  assertRejected(
    '.github/workflows/operations.yml',
    changed,
    'TOOL_IDENTITY',
  );
});

test('validation handoff keeps its complete inventory outside the tar', () => {
  const changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    '            operations/.tmp/actions-validation-handoff/candidate-complete-inventory.json\n',
    '',
  );
  assertRejected(
    '.github/workflows/operations.yml',
    changed,
    'TOOL_IDENTITY',
  );
});

test('critical workflow steps cannot be disabled with an ad-hoc condition', () => {
  const changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    '      - name: Run the complete Operations policy and test set\n        shell: bash',
    [
      '      - name: Run the complete Operations policy and test set',
      '        if: false',
      '        shell: bash',
    ].join('\n'),
  );
  assertRejected(
    '.github/workflows/operations.yml',
    changed,
    'STEP_CONDITION',
  );
});

test('workflow run scripts cannot modify protected repository paths', () => {
  const changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    '          git diff --check',
    '          echo changed > VERSION\n          git diff --check',
  );
  assertRejected(
    '.github/workflows/operations.yml',
    changed,
    'PROTECTED_WRITE',
  );
});

test('workflow run scripts cannot copy into protected product trees', () => {
  const changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    '          git diff --check',
    '          cp "$RUNNER_TEMP/payload" backend/overwrite\n          git diff --check',
  );
  assertRejected(
    '.github/workflows/operations.yml',
    changed,
    'PROTECTED_WRITE',
  );
});

test('release prepare cannot receive package write permission', () => {
  const changed = replaceRequired(
    sources['.github/workflows/release.yml'],
    [
      '  prepare:',
      '    name: prepare one closed tag candidate',
      '    runs-on: ubuntu-24.04',
      '    timeout-minutes: 180',
      '    permissions:',
      '      contents: read',
    ].join('\n'),
    [
      '  prepare:',
      '    name: prepare one closed tag candidate',
      '    runs-on: ubuntu-24.04',
      '    timeout-minutes: 180',
      '    permissions:',
      '      contents: read',
      '      packages: write',
    ].join('\n'),
  );
  assertRejected('.github/workflows/release.yml', changed, 'CLOSED_SHAPE');
});

test('release cannot add a manual or branch trigger', () => {
  const changed = replaceRequired(
    sources['.github/workflows/release.yml'],
    'on:\n  push:',
    'on:\n  workflow_dispatch:\n  push:',
  );
  assertRejected('.github/workflows/release.yml', changed, 'TRIGGER');
});

test('release publish must use a separate release Environment', () => {
  const changed = replaceRequired(
    sources['.github/workflows/release.yml'],
    '    environment: release',
    '    environment: production',
  );
  assertRejected('.github/workflows/release.yml', changed, 'ENVIRONMENT');
});

test('release prepare cannot log in to a registry', () => {
  const changed = replaceRequired(
    sources['.github/workflows/release.yml'],
    '          test -s tag-release-candidate.tar',
    [
      '          test -s tag-release-candidate.tar',
      '          docker login ghcr.io',
    ].join('\n'),
  );
  assertRejected(
    '.github/workflows/release.yml',
    changed,
    'AUTHORITY_SPLIT',
  );
});

test('release must revalidate the downloaded candidate before login', () => {
  const changed = replaceRequired(
    sources['.github/workflows/release.yml'],
    'node operations/release/verify-handoff.mjs',
    'node operations/release/verify-handoff-disabled.mjs',
  );
  assertRejected('.github/workflows/release.yml', changed, 'ORDER');
});

test('release cannot bypass the bounded handoff extractor with raw tar', () => {
  const changed = replaceRequired(
    sources['.github/workflows/release.yml'],
    '          node operations/release/verify-handoff.mjs \\',
    [
      '          tar --extract --file "$incoming/tag-release-candidate.tar"',
      '          node operations/release/verify-handoff.mjs \\',
    ].join('\n'),
  );
  assertRejected(
    '.github/workflows/release.yml',
    changed,
    'ARTIFACT_TRANSFER',
  );
});

test('release refuses mutable latest publication', () => {
  const changed = replaceRequired(
    sources['.github/workflows/release.yml'],
    '            destination="$repository:$version_tag"',
    '            destination="$repository:latest"',
  );
  assertRejected(
    '.github/workflows/release.yml',
    changed,
    'RELEASE_BOUNDARY',
  );
});

test('GitHub Release creation cannot move the mutable latest pointer', () => {
  const changed = replaceRequired(
    sources['.github/workflows/release.yml'],
    '            --latest=false \\',
    '            --latest \\',
  );
  assertRejected('.github/workflows/release.yml', changed, [
    'REQUIRED_ASSET',
    'RELEASE_BOUNDARY',
  ]);
});

test('release publication cannot trust the docker push log as registry evidence', () => {
  const changed = replaceRequired(
    sources['.github/workflows/release.yml'],
    '            docker buildx imagetools inspect "$destination" --raw \\',
    '            printf "%s\\n" "$destination" > "$manifest_file" #',
  );
  assertRejected('.github/workflows/release.yml', changed, 'ORDER');
});

test('release cannot consume the unpublished Operations validation handoff', () => {
  const changed = replaceRequired(
    sources['.github/workflows/release.yml'],
    '          incoming="$RUNNER_TEMP/bgmss-tag-release-download"',
    [
      '          incoming="$RUNNER_TEMP/bgmss-tag-release-download"',
      '          test ! -f validation-candidate.tar',
    ].join('\n'),
  );
  assertRejected(
    '.github/workflows/release.yml',
    changed,
    'VALIDATION_HANDOFF',
  );
});

test('release cannot expose a repository secret', () => {
  const changed = replaceRequired(
    sources['.github/workflows/release.yml'],
    '          GH_TOKEN: ${{ github.token }}',
    '          GH_TOKEN: ${{ secrets.RELEASE_TOKEN }}',
  );
  assertRejected('.github/workflows/release.yml', changed, 'SECRET_FLOW');
});

test('deploy remains manual-only', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    'on:\n  workflow_dispatch:',
    'on:\n  push:\n  workflow_dispatch:',
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'TRIGGER');
});

test('deploy cannot remove production Environment approval', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '    environment: production',
    '    environment: release',
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'ENVIRONMENT');
});

test('deploy inputs cannot select a host or path', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '      manifest_digest:',
    [
      '      host:',
      '        description: Arbitrary target',
      '        required: true',
      '        type: string',
      '      manifest_digest:',
    ].join('\n'),
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'CLOSED_SHAPE');
});

test('deploy cannot follow a mutable image or build during dispatch', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '          ssh \\',
    '          docker pull ghcr.io/example/api:latest\n          ssh \\',
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'DEPLOY_BOUNDARY');
});

test('deploy verifier cannot drop closed manifest unknown-field rejection', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '            def exact($expected): keys == ($expected | sort);',
    '            def exact($expected): true;',
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'REQUIRED_GATE');
});

test('deploy verifier cannot weaken accepted authority binding', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    'sha256:17145d4869050dc2ff347e4dbfb60a5a6369d32890f0abc3e8f766b8ea28a80a',
    'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'REQUIRED_GATE');
});

test('deploy verifier cannot omit complete manifest asset descriptor checks', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '          test "$descriptor_count" -eq 10',
    '          test "$descriptor_count" -ge 1',
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'REQUIRED_GATE');
});

test('deploy verifier requires the canonical checksum inventory separator', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '$0 !~ /^[0-9a-f]{64}  [A-Za-z0-9][A-Za-z0-9._-]*$/',
    '$1 !~ /^[0-9a-f]{64}$/',
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'REQUIRED_GATE');
});

test('deploy transaction must use only the fixed noninteractive sudo entrypoint', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '            sudo -n -- /usr/local/sbin/bgmss-v2-deploy \\',
    '            /usr/local/sbin/bgmss-v2-deploy \\',
  );
  assertRejected('.github/workflows/deploy.yml', changed, [
    'REQUIRED_GATE',
    'DEPLOY_SSH',
  ]);
});

test('deploy cannot invoke a second or free-form SSH command', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '          ssh \\',
    '          ssh "$RELEASE_VERSION"\n          ssh \\',
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'DEPLOY_SSH');
});

test('deploy cannot check out a second deployment implementation', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '    steps:\n      - name: Validate bounded dispatch inputs before reading a secret',
    [
      '    steps:',
      '      - name: Check out a controller',
      '        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      '        with:',
      '          persist-credentials: false',
      '      - name: Validate bounded dispatch inputs before reading a secret',
    ].join('\n'),
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'DEPLOY_BOUNDARY');
});

test('deploy cannot invoke a repository-side Node controller', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '          ssh \\',
    '          node operations/runtime/deploy.mjs\n          ssh \\',
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'DEPLOY_BOUNDARY');
});

test('deploy remote entry is the one reviewed root-managed forced wrapper', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '/usr/local/sbin/bgmss-v2-deploy',
    '/srv/bgmss-v2/bin/bgmss-ops',
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'REQUIRED_GATE');
});

test('deploy cannot consume an Actions validation handoff', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '            --pattern release-manifest.json \\',
    [
      '            --pattern validation-candidate.tar \\',
      '            --pattern release-manifest.json \\',
    ].join('\n'),
  );
  assertRejected(
    '.github/workflows/deploy.yml',
    changed,
    'VALIDATION_HANDOFF',
  );
});

test('deploy secret cannot flow into a pre-verification step', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '      - name: Verify the immutable published manifest and assets\n        shell: bash',
    [
      '      - name: Verify the immutable published manifest and assets',
      '        shell: bash',
      '        env:',
      '          EARLY_SECRET: ${{ secrets.BGMSS_PRODUCTION_SSH_PRIVATE_KEY }}',
    ].join('\n'),
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'SECRET_FLOW');
});
