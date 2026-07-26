import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';

import { throwIfAborted } from './abort-context.mjs';
import { canonicalJson, canonicalJsonDigest } from './canonical-json.mjs';
import { requireCanonicalPath } from './paths.mjs';

export class SealError extends Error {}

function fail(message) {
  throw new SealError(message);
}

export async function sha256File(filePath) {
  throwIfAborted();
  const canonical = requireCanonicalPath(filePath, {
    label: 'seal input',
    type: 'file',
  });
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(canonical)) {
    throwIfAborted();
    digest.update(chunk);
  }
  throwIfAborted();
  return `sha256:${digest.digest('hex')}`;
}

export async function sealDirectory(root, { paths } = {}) {
  const canonicalRoot = requireCanonicalPath(root, {
    label: 'sealed directory',
    type: 'directory',
  });
  const requested = paths ? new Set(paths) : null;
  const entries = [];
  async function visit(directory, prefix) {
    throwIfAborted();
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      const information = fs.lstatSync(absolute);
      if (information.isSymbolicLink()) fail(`sealed directory contains symlink ${relative}`);
      if (information.isDirectory()) {
        if (!requested || [...requested].some((item) => item.startsWith(`${relative}/`))) {
          await visit(absolute, relative);
        }
      } else if (information.isFile()) {
        if (!requested || requested.has(relative)) {
          entries.push({
            path: relative,
            mode: information.mode & 0o777,
            size: information.size,
            sha256: await sha256File(absolute),
          });
        }
      } else {
        fail(`sealed directory contains special file ${relative}`);
      }
    }
  }
  await visit(canonicalRoot, '');
  if (requested) {
    for (const relative of requested) {
      if (!entries.some((entry) => entry.path === relative)) {
        fail(`sealed path is missing: ${relative}`);
      }
    }
  }
  const canonical = canonicalJson(entries);
  return Object.freeze({
    root: canonicalRoot,
    entries: Object.freeze(entries),
    digest: canonicalJsonDigest(entries),
    canonical,
  });
}

export async function sealDirectoryTree(root) {
  const canonicalRoot = requireCanonicalPath(root, {
    label: 'sealed directory tree',
    type: 'directory',
  });
  const entries = [];
  const identities = [];
  async function visit(directory, prefix) {
    throwIfAborted();
    const directoryInformation = fs.lstatSync(directory);
    if (
      directoryInformation.isSymbolicLink() ||
      !directoryInformation.isDirectory()
    ) {
      fail(`sealed tree directory is not real: ${prefix || '.'}`);
    }
    entries.push({
      kind: 'directory',
      mode: directoryInformation.mode & 0o777,
      path: prefix || '.',
    });
    identities.push({
      device: directoryInformation.dev,
      inode: directoryInformation.ino,
      kind: 'directory',
      links: directoryInformation.nlink,
      path: prefix || '.',
    });
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      const information = fs.lstatSync(absolute);
      if (information.isSymbolicLink()) {
        fail(`sealed directory tree contains symlink ${relative}`);
      }
      if (information.isDirectory()) {
        await visit(absolute, relative);
      } else if (information.isFile()) {
        if (information.nlink !== 1) {
          fail(`sealed directory tree contains hard-linked file ${relative}`);
        }
        entries.push({
          kind: 'file',
          mode: information.mode & 0o777,
          path: relative,
          sha256: await sha256File(absolute),
          size: information.size,
        });
        identities.push({
          device: information.dev,
          inode: information.ino,
          kind: 'file',
          links: information.nlink,
          path: relative,
        });
      } else {
        fail(`sealed directory tree contains special file ${relative}`);
      }
    }
  }
  await visit(canonicalRoot, '');
  entries.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  identities.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const canonical = canonicalJson(entries);
  const identityCanonical = canonicalJson(identities);
  return Object.freeze({
    root: canonicalRoot,
    entries: Object.freeze(entries),
    digest: canonicalJsonDigest(entries),
    canonical,
    identities: Object.freeze(identities),
    identityDigest: canonicalJsonDigest(identities),
    identityCanonical,
  });
}

export async function sealDistributionTree(
  root,
  { allowInternalSymlinks = false } = {},
) {
  const canonicalRoot = requireCanonicalPath(root, {
    label: 'sealed distribution root',
    type: 'directory',
  });
  const entries = [];
  const identities = [];
  async function visit(directory, prefix) {
    throwIfAborted();
    const information = fs.lstatSync(directory);
    if (information.isSymbolicLink() || !information.isDirectory()) {
      fail(`distribution directory is not real: ${prefix || '.'}`);
    }
    entries.push({
      kind: 'directory',
      mode: information.mode & 0o777,
      path: prefix || '.',
    });
    identities.push({
      device: information.dev,
      inode: information.ino,
      kind: 'directory',
      links: information.nlink,
      path: prefix || '.',
    });
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      const child = fs.lstatSync(absolute);
      if (child.isSymbolicLink()) {
        if (!allowInternalSymlinks || child.nlink !== 1) {
          fail(`distribution contains unsupported symlink ${relative}`);
        }
        const target = fs.readlinkSync(absolute);
        const resolved = path.resolve(path.dirname(absolute), target);
        if (
          resolved === canonicalRoot ||
          !resolved.startsWith(`${canonicalRoot}${path.sep}`)
        ) {
          fail(`distribution symlink escapes its root: ${relative}`);
        }
        let canonicalTarget;
        try {
          canonicalTarget = fs.realpathSync.native(absolute);
        } catch (error) {
          fail(`distribution symlink target is unavailable: ${relative}: ${error.message}`);
        }
        if (
          canonicalTarget === canonicalRoot ||
          !canonicalTarget.startsWith(`${canonicalRoot}${path.sep}`)
        ) {
          fail(`distribution symlink resolves outside its root: ${relative}`);
        }
        entries.push({ kind: 'symlink', path: relative, target });
        identities.push({
          device: child.dev,
          inode: child.ino,
          kind: 'symlink',
          links: child.nlink,
          path: relative,
        });
      } else if (child.isDirectory()) {
        await visit(absolute, relative);
      } else if (child.isFile()) {
        if (child.nlink !== 1) {
          fail(`distribution contains hard-linked file ${relative}`);
        }
        entries.push({
          kind: 'file',
          mode: child.mode & 0o777,
          path: relative,
          sha256: await sha256File(absolute),
          size: child.size,
        });
        identities.push({
          device: child.dev,
          inode: child.ino,
          kind: 'file',
          links: child.nlink,
          path: relative,
        });
      } else {
        fail(`distribution contains special file ${relative}`);
      }
    }
  }
  await visit(canonicalRoot, '');
  entries.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  identities.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const canonical = canonicalJson(entries);
  const identityCanonical = canonicalJson(identities);
  return Object.freeze({
    root: canonicalRoot,
    entries: Object.freeze(entries),
    digest: canonicalJsonDigest(entries),
    canonical,
    identities: Object.freeze(identities),
    identityDigest: canonicalJsonDigest(identities),
    identityCanonical,
  });
}

export async function sealSingleFileDistribution(filePath) {
  const canonical = requireCanonicalPath(filePath, {
    label: 'single-file distribution',
    type: 'file',
  });
  const information = fs.lstatSync(canonical);
  if (information.isSymbolicLink() || information.nlink !== 1) {
    fail('single-file distribution must be one unlinked regular file');
  }
  const entry = Object.freeze({
    kind: 'file',
    mode: information.mode & 0o777,
    path: '.',
    sha256: await sha256File(canonical),
    size: information.size,
  });
  const identity = Object.freeze({
    device: information.dev,
    inode: information.ino,
    kind: 'file',
    links: information.nlink,
    path: '.',
  });
  const contentCanonical = canonicalJson([entry]);
  const identityCanonical = canonicalJson([identity]);
  return Object.freeze({
    root: canonical,
    entries: Object.freeze([entry]),
    digest: canonicalJsonDigest([entry]),
    canonical: contentCanonical,
    identities: Object.freeze([identity]),
    identityDigest: canonicalJsonDigest([identity]),
    identityCanonical,
  });
}

export function assertSameSeal(before, after, label = 'input') {
  if (
    before.digest !== after.digest ||
    before.canonical !== after.canonical ||
    before.identityDigest !== after.identityDigest ||
    before.identityCanonical !== after.identityCanonical
  ) {
    fail(`${label} changed during acceptance`);
  }
}
