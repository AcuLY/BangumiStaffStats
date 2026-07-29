import fs from 'node:fs';
import path from 'node:path';

import { sha256 } from '../lib/digest.mjs';
import {
  requireCanonicalPath,
} from '../lib/path-policy.mjs';
import {
  buildSanitizedEnvironment,
  runSubprocess,
} from '../lib/subprocess.mjs';
import { parseJsonStrict } from '../lib/strict-json.mjs';
import { SOURCE_EPOCH_RANGE } from './constants.mjs';

const OBJECT_ID = /^[0-9a-f]{40}$/u;
const ZERO_OBJECT_ID = '0000000000000000000000000000000000000000';
const TREE_LINE = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/u;
const RAW_DIFFERENCE_HEADER =
  /^:(000000|100644|100755) (000000|100644|100755) ([0-9a-f]{40}) ([0-9a-f]{40}) ([AMD])$/u;

export class ReleaseGitError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ReleaseGitError';
  }
}

function fail(message, cause) {
  throw new ReleaseGitError(message, cause ? { cause } : undefined);
}

function assertDifferencePath(relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    relativePath.length > 4096 ||
    !/^[A-Za-z0-9._/-]+$/u.test(relativePath) ||
    relativePath.startsWith('/') ||
    relativePath.endsWith('/') ||
    relativePath.includes('//') ||
    relativePath.split('/').some((entry) => entry === '.' || entry === '..')
  ) {
    fail('Git difference path is outside the closed ASCII path policy');
  }
  return relativePath;
}

function assertDifferenceShape({
  newGitBlob,
  newMode,
  oldGitBlob,
  oldMode,
  status,
}) {
  const oldAbsent = oldMode === '000000' && oldGitBlob === ZERO_OBJECT_ID;
  const newAbsent = newMode === '000000' && newGitBlob === ZERO_OBJECT_ID;
  const oldRegular =
    ['100644', '100755'].includes(oldMode) &&
    OBJECT_ID.test(oldGitBlob) &&
    oldGitBlob !== ZERO_OBJECT_ID;
  const newRegular =
    ['100644', '100755'].includes(newMode) &&
    OBJECT_ID.test(newGitBlob) &&
    newGitBlob !== ZERO_OBJECT_ID;
  if (
    (status === 'A' && (!oldAbsent || !newRegular)) ||
    (status === 'D' && (!oldRegular || !newAbsent)) ||
    (
      status === 'M' &&
      (
        !oldRegular ||
        !newRegular ||
        (oldMode === newMode && oldGitBlob === newGitBlob)
      )
    )
  ) {
    fail('Git difference modes and blobs disagree with its A/M/D status');
  }
}

export function parseRawDifferenceRecords(output) {
  if (typeof output !== 'string') {
    throw new TypeError('raw Git difference output must be text');
  }
  if (output.length === 0) return Object.freeze([]);
  if (!output.endsWith('\0')) {
    fail('Git raw difference output is not NUL terminated');
  }
  const fields = output.split('\0');
  fields.pop();
  if (fields.length % 2 !== 0) {
    fail('Git raw difference output has an ambiguous path record');
  }
  const records = [];
  const paths = new Set();
  for (let index = 0; index < fields.length; index += 2) {
    const match = RAW_DIFFERENCE_HEADER.exec(fields[index]);
    if (!match) {
      fail('Git raw difference record is not one ordinary A/M/D entry');
    }
    const [, oldMode, newMode, oldGitBlob, newGitBlob, status] = match;
    const changedPath = assertDifferencePath(fields[index + 1]);
    if (paths.has(changedPath)) {
      fail('Git raw difference contains a duplicate path');
    }
    paths.add(changedPath);
    assertDifferenceShape({
      newGitBlob,
      newMode,
      oldGitBlob,
      oldMode,
      status,
    });
    records.push(Object.freeze({
      newGitBlob,
      newMode,
      oldGitBlob,
      oldMode,
      path: changedPath,
      status,
    }));
  }
  return Object.freeze(records);
}

export function executableFromPath(name, searchPath = process.env.PATH) {
  if (!/^[a-z][a-z0-9+._-]{0,63}$/u.test(name)) {
    throw new TypeError('executable name is invalid');
  }
  if (typeof searchPath !== 'string' || searchPath.length === 0) {
    fail('PATH is unavailable');
  }
  for (const directory of searchPath.split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, name);
    try {
      const resolved = fs.realpathSync.native(candidate);
      const information = fs.statSync(resolved);
      if (information.isFile() && (information.mode & 0o111) !== 0) {
        return requireCanonicalPath(resolved, {
          label: `${name} executable`,
          type: 'file',
        });
      }
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) {
        fail(`cannot inspect ${name} on PATH`, error);
      }
    }
  }
  fail(`required executable is unavailable: ${name}`);
}

function pathDirectories(searchPath = process.env.PATH) {
  const result = [];
  for (const entry of String(searchPath ?? '').split(path.delimiter)) {
    if (!path.isAbsolute(entry)) continue;
    try {
      const canonical = requireCanonicalPath(fs.realpathSync.native(entry), {
        label: 'PATH directory',
        type: 'directory',
      });
      if (!result.includes(canonical)) result.push(canonical);
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) throw error;
    }
  }
  if (result.length === 0) fail('no canonical PATH directory is available');
  return result;
}

export class GitRepository {
  constructor({
    repositoryRoot,
    runRoot,
    git = executableFromPath('git'),
    searchPath = process.env.PATH,
  }) {
    this.repositoryRoot = requireCanonicalPath(repositoryRoot, {
      label: 'Git repository root',
      type: 'directory',
    });
    this.runRoot = requireCanonicalPath(runRoot, {
      label: 'Git controller run root',
      type: 'directory',
    });
    this.git = requireCanonicalPath(git, {
      label: 'Git executable',
      type: 'file',
    });
    this.environment = buildSanitizedEnvironment({
      runRoot: this.runRoot,
      pathEntries: pathDirectories(searchPath),
    });
  }

  async command(args, {
    cwd = this.repositoryRoot,
    acceptedExitCodes = [0],
    hashAndCountStdout = false,
    hashStdout = false,
    maxOutputBytes = 8 * 1024 * 1024,
    timeoutMs = 120_000,
  } = {}) {
    return await runSubprocess({
      acceptedExitCodes,
      args,
      command: this.git,
      cwd,
      environment: this.environment,
      hashAndCountStdout,
      hashStdout,
      maxOutputBytes,
      timeoutMs,
    });
  }

  async text(args, options) {
    const result = await this.command(args, options);
    if (result.stdoutTruncated || result.stderrTruncated) {
      fail(`Git output was truncated for ${args[0]}`);
    }
    return result.stdout;
  }

  async resolve(revisionExpression) {
    if (
      typeof revisionExpression !== 'string' ||
      revisionExpression.length === 0 ||
      revisionExpression.length > 512 ||
      /[\u0000-\u001f\u007f]/u.test(revisionExpression) ||
      revisionExpression.startsWith('-')
    ) {
      fail('Git revision expression is invalid');
    }
    const value = (await this.text([
      'rev-parse',
      '--verify',
      `${revisionExpression}^{commit}`,
    ])).trim();
    if (!OBJECT_ID.test(value)) fail('Git did not resolve one commit object');
    return value;
  }

  async tree(revision) {
    const commit = await this.resolve(revision);
    const value = (await this.text([
      'rev-parse',
      '--verify',
      `${commit}^{tree}`,
    ])).trim();
    if (!OBJECT_ID.test(value)) fail('Git did not resolve one tree object');
    return value;
  }

  async commitEpoch(revision) {
    const commit = await this.resolve(revision);
    const value = (await this.text([
      'show',
      '--no-patch',
      '--format=%ct',
      commit,
    ])).trim();
    if (!/^(?:0|[1-9][0-9]{0,15})$/u.test(value)) {
      fail('Git did not emit one canonical commit epoch');
    }
    const epoch = Number(value);
    if (
      !Number.isSafeInteger(epoch) ||
      epoch < SOURCE_EPOCH_RANGE.minimum ||
      epoch > SOURCE_EPOCH_RANGE.maximum
    ) {
      fail('Git commit epoch is outside the admitted range');
    }
    return epoch;
  }

  async fileAtRevision(revision, relativePath) {
    const commit = await this.resolve(revision);
    const listing = await this.text([
      'ls-tree',
      commit,
      '--',
      relativePath,
    ]);
    const lines = listing.trimEnd().split('\n').filter(Boolean);
    if (lines.length !== 1) {
      fail(`Git authority path is missing or ambiguous: ${relativePath}`);
    }
    const match = TREE_LINE.exec(lines[0]);
    if (!match || match[3] !== relativePath) {
      fail(`Git authority path is not one regular blob: ${relativePath}`);
    }
    const [, mode, gitBlob] = match;
    const bytes = await this.text(
      ['cat-file', 'blob', gitBlob],
      { maxOutputBytes: 16 * 1024 * 1024 },
    );
    return Object.freeze({
      bytes,
      gitBlob,
      mode,
      path: relativePath,
      revision: commit,
      sha256: sha256(Buffer.from(bytes, 'utf8')),
    });
  }

  async assertCleanCheckout({ revision, tree }) {
    const head = await this.resolve('HEAD');
    const headTree = await this.tree(head);
    if (head !== revision || headTree !== tree) {
      fail('isolated checkout identity differs from its admitted source');
    }
    const status = await this.text([
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
    ]);
    if (status !== '') fail('isolated checkout is dirty or has untracked files');
    const staged = await this.command(
      ['diff', '--cached', '--quiet', '--exit-code'],
      { acceptedExitCodes: [0, 1] },
    );
    const worktree = await this.command(
      ['diff', '--quiet', '--exit-code'],
      { acceptedExitCodes: [0, 1] },
    );
    if (staged.exitCode !== 0 || worktree.exitCode !== 0) {
      fail('isolated checkout index or tracked worktree differs from HEAD');
    }
    const flags = await this.text(['ls-files', '-t', '-v']);
    for (const line of flags.split('\n').filter(Boolean)) {
      if (!/^H /u.test(line)) {
        fail('isolated checkout contains a hidden or non-ordinary index flag');
      }
    }
    return Object.freeze({ revision: head, tree: headTree });
  }

  async isAncestor(ancestor, descendant) {
    const result = await this.command(
      ['merge-base', '--is-ancestor', ancestor, descendant],
      { acceptedExitCodes: [0, 1] },
    );
    return result.exitCode === 0;
  }

  async differenceRecords(fromRevision, toRevision) {
    const source = await this.resolve(fromRevision);
    const target = await this.resolve(toRevision);
    const output = await this.text([
      'diff',
      '--raw',
      '-z',
      '--no-renames',
      '--no-abbrev',
      source,
      target,
      '--',
    ]);
    return parseRawDifferenceRecords(output);
  }

  async blobSha256(gitBlob) {
    if (
      typeof gitBlob !== 'string' ||
      !OBJECT_ID.test(gitBlob) ||
      gitBlob === ZERO_OBJECT_ID
    ) {
      fail('Git blob object ID is invalid');
    }
    const result = await this.command(
      ['cat-file', 'blob', gitBlob],
      {
        hashAndCountStdout: true,
        maxOutputBytes: 1024 * 1024,
      },
    );
    const expectedSizeText = (
      await this.text(['cat-file', '-s', gitBlob])
    ).trim();
    const expectedSize = Number(expectedSizeText);
    if (
      result.stderrTruncated ||
      !/^(?:0|[1-9][0-9]{0,15})$/u.test(expectedSizeText) ||
      !Number.isSafeInteger(expectedSize) ||
      expectedSize < 0 ||
      result.stdoutByteCount !== expectedSize
    ) {
      fail(`Git blob hash-and-byte-count evidence drifted for ${gitBlob}`);
    }
    return result.stdoutSha256;
  }

  async changedPaths(fromRevision, toRevision) {
    const source = await this.resolve(fromRevision);
    const target = await this.resolve(toRevision);
    const output = await this.text([
      'diff',
      '--name-status',
      '--no-renames',
      source,
      target,
      '--',
    ]);
    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('\t');
        if (separator < 1) fail('Git emitted an invalid changed-path record');
        const status = line.slice(0, separator);
        const changedPath = line.slice(separator + 1);
        if (!/^[AMD]$/u.test(status) || changedPath.length === 0) {
          fail('Git changed-path record is outside the closed policy');
        }
        return Object.freeze({ path: changedPath, status });
      });
  }

  async pathDiffers(fromRevision, toRevision, relativePath) {
    const source = await this.resolve(fromRevision);
    const target = await this.resolve(toRevision);
    const result = await this.command(
      ['diff', '--quiet', '--exit-code', source, target, '--', relativePath],
      { acceptedExitCodes: [0, 1] },
    );
    return result.exitCode === 1;
  }

  async readJsonAtRevision(revision, relativePath, label = relativePath) {
    const authority = await this.fileAtRevision(revision, relativePath);
    return parseJsonStrict(authority.bytes, label);
  }
}

export async function createDetachedCheckout({
  gitRepository,
  destination,
  revision,
}) {
  const target = path.resolve(destination);
  const parent = requireCanonicalPath(path.dirname(target), {
    label: 'checkout parent',
    type: 'directory',
  });
  if (fs.existsSync(target)) fail('isolated checkout destination already exists');
  fs.mkdirSync(target, { mode: 0o700 });
  requireCanonicalPath(target, {
    below: parent,
    label: 'isolated checkout',
    type: 'directory',
  });
  await gitRepository.command(
    ['init', '--quiet', '--initial-branch=detached', target],
  );
  await gitRepository.command(
    [
      '-C',
      target,
      'fetch',
      '--quiet',
      '--no-tags',
      '--depth=1',
      gitRepository.repositoryRoot,
      revision,
    ],
    { timeoutMs: 600_000 },
  );
  await gitRepository.command(
    ['-C', target, 'checkout', '--quiet', '--detach', 'FETCH_HEAD'],
  );
  const config = await gitRepository.text([
    '-C',
    target,
    'remote',
  ]);
  if (config !== '') fail('isolated checkout unexpectedly retained a remote');
  const checkoutRepository = new GitRepository({
    repositoryRoot: target,
    runRoot: path.dirname(target),
    git: gitRepository.git,
  });
  const tree = await checkoutRepository.tree(revision);
  await checkoutRepository.assertCleanCheckout({ revision, tree });
  return Object.freeze({ repository: checkoutRepository, revision, root: target, tree });
}
