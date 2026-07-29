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
import { readAcceptedDevelopment } from '../../release/receipt.mjs';

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

test('release publisher cannot select a different ORAS version', () => {
  const changed = replaceRequired(
    sources['.github/workflows/release.yml'],
    '          version: 1.3.2',
    '          version: 1.3.3',
  );
  assertRejected(
    '.github/workflows/release.yml',
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

test('operations push covers every branch and continues to exclude every tag', () => {
  const narrowedBranches = replaceRequired(
    sources['.github/workflows/operations.yml'],
    '    branches:\n      - "**"',
    '    branches:\n      - "main"',
  );
  assertRejected(
    '.github/workflows/operations.yml',
    narrowedBranches,
    'TRIGGER',
  );

  const admittedTags = replaceRequired(
    sources['.github/workflows/operations.yml'],
    '    tags-ignore:\n      - "**"',
    '    tags-ignore:\n      - "preview-*"',
  );
  assertRejected(
    '.github/workflows/operations.yml',
    admittedTags,
    'TRIGGER',
  );
});

test('operations triggers cannot omit the root generated-state boundary', () => {
  const changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    '      - ".gitignore"\n',
    '',
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

test('workflow run scripts cannot execute dynamic shell source commands', () => {
  const changed = replaceRequired(
    sources['.github/workflows/operations.yml'],
    '          git diff --check',
    '          source ./unreviewed.sh\n          git diff --check',
  );
  assertRejected(
    '.github/workflows/operations.yml',
    changed,
    'DYNAMIC_COMMAND',
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

test('release publication cannot route the OCI graph through classic Docker push', () => {
  const changed = replaceRequired(
    sources['.github/workflows/release.yml'],
    '            oras cp --from-oci-layout \\',
    '            docker push "$destination" #',
  );
  assertRejected('.github/workflows/release.yml', changed, 'ORDER');
});

test('release publication must compare candidate and registry manifest bytes', () => {
  const changed = replaceRequired(
    sources['.github/workflows/release.yml'],
    '            cmp --silent "$candidate_manifest" "$manifest_file"\n',
    '',
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

test('deploy cannot replace the fixed accepted receipt or final Product baseline', () => {
  const receipt = readAcceptedDevelopment();
  for (const [before, after] of [
    [
      receipt.digest,
      '__MUTATED_ACCEPTED_DEVELOPMENT_SHA256__',
    ],
    [
      receipt.value.frozenProduct.revision,
      '__MUTATED_FINAL_PRODUCT_REVISION__',
    ],
    [
      receipt.value.frozenProduct.tree,
      '__MUTATED_FINAL_PRODUCT_TREE__',
    ],
  ]) {
    const changed = replaceRequired(
      sources['.github/workflows/deploy.yml'],
      before,
      after,
    );
    assertRejected('.github/workflows/deploy.yml', changed, 'INPUT_FLOW');
  }
});

test('deploy job baseline equals the untouched canonical accepted-development receipt', () => {
  const receipt = readAcceptedDevelopment();
  const deploy = parseWorkflowSource(
    sources['.github/workflows/deploy.yml'],
    '.github/workflows/deploy.yml',
  ).jobs.deploy;
  assert.deepEqual(
    {
      frozenProduct: {
        revision: deploy.env.FINAL_PRODUCT_REVISION,
        tree: deploy.env.FINAL_PRODUCT_TREE,
      },
      receiptDigest: deploy.env.ACCEPTED_DEVELOPMENT_SHA256,
    },
    {
      frozenProduct: { ...receipt.value.frozenProduct },
      receiptDigest: receipt.digest,
    },
  );
});

test('deploy steps cannot reassign the fixed accepted-development baseline', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '          actual_digest="sha256:$(\n',
    [
      '          FINAL_PRODUCT_REVISION=ffffffffffffffffffffffffffffffffffffffff',
      '          actual_digest="sha256:$(',
      '',
    ].join('\n'),
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'INPUT_FLOW');
});

test('deploy steps cannot override job authority or dispatch inputs through step env', () => {
  for (const name of [
    'ACCEPTED_DEVELOPMENT_SHA256',
    'FINAL_PRODUCT_REVISION',
    'FINAL_PRODUCT_TREE',
    'RELEASE_MANIFEST_DIGEST',
    'RELEASE_VERSION',
  ]) {
    const changed = replaceRequired(
      sources['.github/workflows/deploy.yml'],
      '      - name: Validate bounded dispatch inputs before reading a secret\n        shell: bash',
      [
        '      - name: Validate bounded dispatch inputs before reading a secret',
        '        shell: bash',
        '        env:',
        `          ${name}: unreviewed-step-override`,
      ].join('\n'),
    );
    assertRejected('.github/workflows/deploy.yml', changed, 'INPUT_FLOW');
  }
});

test('deploy steps cannot use GitHub environment or PATH command files', () => {
  for (const commandFile of ['GITHUB_ENV', 'GITHUB_PATH']) {
    const changed = replaceRequired(
      sources['.github/workflows/deploy.yml'],
      '          set -euo pipefail\n',
      [
        '          set -euo pipefail',
        `          printf '%s\\n' unreviewed >> "$${commandFile}"`,
        '',
      ].join('\n'),
    );
    assertRejected('.github/workflows/deploy.yml', changed, 'INPUT_FLOW');
  }
});

test('deploy program rejects extra steps even when they carry no obvious forbidden command', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '      - name: Validate bounded dispatch inputs before reading a secret',
    [
      '      - name: Unreviewed preparation',
      '        shell: bash',
      '        run: |',
      '          set -euo pipefail',
      '          true',
      '      - name: Validate bounded dispatch inputs before reading a secret',
    ].join('\n'),
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'DEPLOY_PROGRAM');
});

test('deploy validate and verify steps reject shell startup environments', () => {
  for (const [stepName, startupName] of [
    [
      'Validate bounded dispatch inputs before reading a secret',
      'BASH_ENV',
    ],
    [
      'Verify the immutable published manifest and assets',
      'ENV',
    ],
  ]) {
    const changed = replaceRequired(
      sources['.github/workflows/deploy.yml'],
      `      - name: ${stepName}\n        shell: bash`,
      [
        `      - name: ${stepName}`,
        '        shell: bash',
        '        env:',
        `          ${startupName}: /tmp/unreviewed-startup`,
      ].join('\n'),
    );
    assertRejected('.github/workflows/deploy.yml', changed, 'DEPLOY_PROGRAM');
  }
});

test('deploy exact run blocks reject obfuscated GitHub command-file writes', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '          set -euo pipefail\n',
    [
      '          set -euo pipefail',
      "          command_file='GITHUB_'",
      "          command_file+='ENV'",
      '          printf \'%s\\n\' unreviewed >> "${!command_file}"',
      '',
    ].join('\n'),
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'DEPLOY_PROGRAM');
});

test('deploy exact reviewed run blocks reject otherwise innocuous script drift', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '          release_root="$RUNNER_TEMP/bgmss-existing-release"\n',
    [
      '          : "unreviewed but superficially harmless change"',
      '          release_root="$RUNNER_TEMP/bgmss-existing-release"',
      '',
    ].join('\n'),
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'DEPLOY_PROGRAM');
});

test('deploy verifier cannot drop receipt and final Product cross-checks', () => {
  for (const [before, after] of [
    [
      '                revision: $finalProductRevision,',
      '                revision: $finalProductTree,',
    ],
    [
      '                tree: $finalProductTree',
      '                tree: $finalProductRevision',
    ],
    [
      '              and .receiptDigest\n                == $acceptedDevelopmentSha256',
      '              and (.receiptDigest | type == "string")',
    ],
  ]) {
    const changed = replaceRequired(
      sources['.github/workflows/deploy.yml'],
      before,
      after,
    );
    assertRejected('.github/workflows/deploy.yml', changed, 'REQUIRED_GATE');
  }
});

test('deploy verifier cannot omit complete manifest asset descriptor checks', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '          test "$descriptor_count" -eq 10',
    '          test "$descriptor_count" -ge 1',
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'REQUIRED_GATE');
});

test('deploy applies only the reviewed executable mode after descriptor verification', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '          chmod 0555 -- archive-smoke',
    '          chmod 0555 -- archive-smoke backend.spdx.json',
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'ASSET_MODE');
});

test('deploy cannot apply release asset modes before verifying their bytes', () => {
  const changed = replaceRequired(
    sources['.github/workflows/deploy.yml'],
    '          descriptor_count=0',
    [
      '          chmod 0555 -- archive-smoke',
      '          descriptor_count=0',
    ].join('\n'),
  );
  assertRejected('.github/workflows/deploy.yml', changed, 'ASSET_MODE');
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
