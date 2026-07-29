import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const OPERATIONS = path.resolve(import.meta.dirname, '..', '..');
const TRANSACTION = path.join(OPERATIONS, 'bin/lib/transaction.sh');
const DIGEST = '0'.repeat(64);
const MALICIOUS_KEY = '$(touch${IFS}pwned)';
const RELEASE_ASSETS = [
  'archive-smoke',
  'backend-component-statement.json',
  'backend.spdx.json',
  'compatibility-manifest.json',
  'frontend-component-statement.json',
  'frontend-static-linux-amd64.tar',
  'frontend.spdx.json',
  'updater-component-statement.json',
  'updater.spdx.json',
];

const bashVersion = spawnSync('bash', ['--version'], {
  encoding: 'utf8',
});
const bashMajor = Number.parseInt(
  /version\s+([0-9]+)/u.exec(bashVersion.stdout)?.[1] ?? '0',
  10,
);
const bash5Only =
  bashMajor >= 5
    ? {}
    : { skip: 'requires Bash 5 associative-array semantics' };

const SHELL_HARNESS = String.raw`
source "$OPS_TEST_TRANSACTION"

ops_fail() {
  printf 'FAIL=%s:%s\n' "$1" "$2" >&2
  return 1
}

ops_sha256_file() {
  printf 'sha256:%s\n' "$OPS_TEST_DIGEST"
}

ops_command() {
  case "$1" in
    find)
      printf '%s\n' "/usr/bin/find"
      ;;
    tar)
      printf '%s\n' "ops_test_tar"
      ;;
    *)
      return 1
      ;;
  esac
}

ops_verify_frontend_tar_headers() {
  return 0
}

ops_test_tar() {
  case "$1" in
    -tf)
      /bin/cat -- "$OPS_TEST_LISTING"
      ;;
    -tvf)
      /bin/cat -- "$OPS_TEST_VERBOSE"
      ;;
    *)
      return 1
      ;;
  esac
}

case "$-" in
  *u*) ;;
  *) exit 98 ;;
esac

case "$OPS_TEST_KIND" in
  checksum)
    if ops_verify_payload_checksums \
      "$OPS_TEST_SUBJECT" "$OPS_TEST_INVENTORY"; then
      result=0
    else
      result=$?
    fi
    ;;
  frontend)
    if ops_verify_frontend_tar \
      "$OPS_TEST_SUBJECT" "$OPS_TEST_LISTING" "$OPS_TEST_VERBOSE"; then
      result=0
    else
      result=$?
    fi
    ;;
  runtime)
    if ops_verify_runtime_inventory \
      "$OPS_TEST_SUBJECT" "$OPS_TEST_INVENTORY"; then
      result=0
    else
      result=$?
    fi
    ;;
  *)
    exit 97
    ;;
esac

printf 'NOUNSET=on\n'
printf 'RESULT=%s\n' "$result"
`;

function makeRoot() {
  return realpathSync(
    mkdtempSync(path.join(tmpdir(), 'bgmss-membership-test-')),
  );
}

function writeLines(file, lines) {
  writeFileSync(file, `${lines.join('\n')}\n`);
}

function checksumFixture(root, variant) {
  const payload = path.join(root, 'payload');
  mkdirSync(payload);
  for (const relative of RELEASE_ASSETS) {
    writeFileSync(path.join(payload, relative), `${relative}\n`);
  }
  const inventory = path.join(payload, 'payload-checksums.sha256');
  const complete = RELEASE_ASSETS.map(
    (relative) => `${DIGEST}  ${relative}`,
  );
  if (variant === 'duplicate') {
    writeLines(inventory, [complete[0], complete[0]]);
  } else {
    writeLines(inventory, complete);
    const extra =
      variant === 'malicious-extra' ? MALICIOUS_KEY : 'unlisted.txt';
    writeFileSync(path.join(payload, extra), 'unlisted\n');
  }
  return { inventory, kind: 'checksum', subject: payload };
}

function runtimeFixture(root, variant) {
  const release = path.join(root, 'release');
  const relatives = [
    'bin/archive-smoke',
    'checksums.txt',
    'frontend/index.html',
    'release-manifest.json',
  ];
  for (const relative of relatives) {
    const candidate = path.join(release, relative);
    mkdirSync(path.dirname(candidate), { recursive: true });
    writeFileSync(candidate, `${relative}\n`);
  }
  const inventory = path.join(root, 'runtime-inventory.sha256');
  const complete = relatives.map((relative) => `${DIGEST}  ${relative}`);
  if (variant === 'duplicate') {
    writeLines(inventory, [complete[0], complete[0]]);
  } else {
    writeLines(inventory, complete);
  }
  if (variant === 'unlisted-file') {
    writeFileSync(path.join(release, 'frontend/unlisted.js'), 'unlisted\n');
  } else if (variant === 'unlisted-directory') {
    mkdirSync(path.join(release, 'unlisted'));
  } else if (variant === 'malicious-extra') {
    writeFileSync(
      path.join(release, 'frontend', MALICIOUS_KEY),
      'unlisted\n',
    );
  }
  return { inventory, kind: 'runtime', subject: release };
}

function frontendFixture(root, variant) {
  const archive = path.join(root, 'frontend.tar');
  const listing = path.join(root, 'frontend.list');
  const verbose = path.join(root, 'frontend.verbose');
  writeFileSync(archive, 'header validation is isolated by the harness\n');
  writeFileSync(verbose, 'drwxr-xr-x 0 0 frontend/\n');
  if (variant === 'duplicate') {
    writeLines(listing, [
      'frontend/',
      'frontend/index.html',
      'frontend/index.html',
    ]);
  } else if (variant === 'missing-index') {
    writeLines(listing, ['frontend/', 'frontend/app.js']);
  } else {
    writeLines(listing, [
      'frontend/',
      'frontend/index.html',
      `frontend/${MALICIOUS_KEY}`,
    ]);
  }
  return {
    inventory: path.join(root, 'unused.inventory'),
    kind: 'frontend',
    listing,
    subject: archive,
    verbose,
  };
}

function assertRejected(prepare, expectedCode) {
  const root = makeRoot();
  try {
    const fixture = prepare(root);
    const listing = fixture.listing ?? path.join(root, 'unused.listing');
    const verbose = fixture.verbose ?? path.join(root, 'unused.verbose');
    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-c', SHELL_HARNESS],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          LANG: 'C.UTF-8',
          LC_ALL: 'C.UTF-8',
          OPS_TEST_DIGEST: DIGEST,
          OPS_TEST_INVENTORY: fixture.inventory,
          OPS_TEST_KIND: fixture.kind,
          OPS_TEST_LISTING: listing,
          OPS_TEST_SUBJECT: fixture.subject,
          OPS_TEST_TRANSACTION: TRANSACTION,
          OPS_TEST_VERBOSE: verbose,
          PATH: '/usr/bin:/bin',
          TZ: 'UTC',
        },
      },
    );
    assert.equal(
      result.status,
      0,
      `membership harness aborted\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
    assert.match(result.stdout, /^NOUNSET=on$/mu);
    assert.match(result.stdout, /^RESULT=1$/mu);
    assert.match(
      result.stderr,
      new RegExp(`^FAIL=${expectedCode}:`, 'mu'),
    );
    assert.equal(
      existsSync(path.join(root, 'pwned')),
      false,
      'associative-array membership evaluated an untrusted key',
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

test(
  'Bash 5 checksum membership rejects duplicate and unlisted payloads without evaluating keys',
  bash5Only,
  () => {
    assertRejected(
      (root) => checksumFixture(root, 'duplicate'),
      'CHECKSUM_PATH_INVALID',
    );
    assertRejected(
      (root) => checksumFixture(root, 'unlisted-file'),
      'UNLISTED_PAYLOAD_FILE',
    );
    assertRejected(
      (root) => checksumFixture(root, 'malicious-extra'),
      'UNLISTED_PAYLOAD_FILE',
    );
  },
);

test(
  'Bash 5 runtime inventory membership rejects duplicate and unlisted paths without evaluating keys',
  bash5Only,
  () => {
    assertRejected(
      (root) => runtimeFixture(root, 'duplicate'),
      'RUNTIME_INVENTORY_PATH',
    );
    assertRejected(
      (root) => runtimeFixture(root, 'unlisted-file'),
      'UNLISTED_RUNTIME_FILE',
    );
    assertRejected(
      (root) => runtimeFixture(root, 'unlisted-directory'),
      'UNLISTED_RUNTIME_DIRECTORY',
    );
    assertRejected(
      (root) => runtimeFixture(root, 'malicious-extra'),
      'UNLISTED_RUNTIME_FILE',
    );
  },
);

test(
  'Bash 5 frontend tar membership rejects duplicates, a missing index, and executable-looking names',
  bash5Only,
  () => {
    assertRejected(
      (root) => frontendFixture(root, 'duplicate'),
      'FRONTEND_TAR_PATH_INVALID',
    );
    assertRejected(
      (root) => frontendFixture(root, 'missing-index'),
      'FRONTEND_TAR_INCOMPLETE',
    );
    assertRejected(
      (root) => frontendFixture(root, 'malicious'),
      'FRONTEND_TAR_PATH_INVALID',
    );
  },
);
