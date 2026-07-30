import fs from 'node:fs';
import path from 'node:path';

export class GeneratedPathError extends Error {}

function fail(message) {
  throw new GeneratedPathError(message);
}

function requirePathText(candidate, label) {
  if (
    typeof candidate !== 'string' ||
    candidate.length === 0 ||
    candidate.includes('\0') ||
    candidate.includes('\\')
  ) {
    fail(`${label} must be a non-empty native path without NUL or backslash`);
  }
  if (candidate.split('/').includes('..')) {
    fail(`${label} must not contain a parent traversal segment`);
  }
}

function strictlyBelow(candidate, root) {
  return candidate !== root && candidate.startsWith(`${root}${path.sep}`);
}

function lstatIfPresent(candidate) {
  try {
    return fs.lstatSync(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

function inspectExistingChain(repositoryRoot, candidate, label) {
  const relative = path.relative(repositoryRoot, candidate);
  let current = repositoryRoot;
  const parts = relative === '' ? [] : relative.split(path.sep);
  for (const part of parts) {
    current = path.join(current, part);
    const information = lstatIfPresent(current);
    if (!information) break;
    if (information.isSymbolicLink()) {
      fail(`${label} crosses symlink ${current}`);
    }
    if (current !== candidate && !information.isDirectory()) {
      fail(`${label} crosses non-directory ${current}`);
    }
    if (fs.realpathSync(current) !== current) {
      fail(`${label} leaves the canonical repository path at ${current}`);
    }
  }
}

export function requireGeneratedPath(
  candidate,
  {
    repositoryRoot,
    temporaryRoot,
    label = 'generated path',
    allowTemporaryRoot = false,
  },
) {
  requirePathText(candidate, label);
  const repository = path.resolve(repositoryRoot);
  const temporary = path.resolve(temporaryRoot);
  const resolved = path.resolve(candidate);

  if (!strictlyBelow(temporary, repository)) {
    fail(`temporary root must remain strictly below repository root ${repository}`);
  }
  if (
    resolved !== temporary &&
    !strictlyBelow(resolved, temporary)
  ) {
    fail(`${label} must remain below ${temporary}`);
  }
  if (resolved === temporary && !allowTemporaryRoot) {
    fail(`${label} must remain strictly below ${temporary}`);
  }

  let repositoryInformation;
  try {
    repositoryInformation = fs.lstatSync(repository);
  } catch {
    fail(`repository root does not exist: ${repository}`);
  }
  if (repositoryInformation.isSymbolicLink() || !repositoryInformation.isDirectory()) {
    fail(`repository root must be a real directory: ${repository}`);
  }
  if (fs.realpathSync(repository) !== repository) {
    fail(`repository root must use its canonical path: ${repository}`);
  }

  inspectExistingChain(repository, temporary, 'temporary root');
  inspectExistingChain(repository, resolved, label);
  return resolved;
}

export function ensureGeneratedDirectory(candidate, options) {
  const resolved = requireGeneratedPath(candidate, {
    ...options,
    allowTemporaryRoot: options.allowTemporaryRoot ?? true,
  });
  const information = lstatIfPresent(resolved);
  if (information) {
    if (information.isSymbolicLink() || !information.isDirectory()) {
      fail(`generated directory must be a real directory: ${resolved}`);
    }
  } else {
    fs.mkdirSync(resolved, { recursive: true });
  }
  requireGeneratedPath(resolved, {
    ...options,
    allowTemporaryRoot: options.allowTemporaryRoot ?? true,
  });
  return resolved;
}

export function removeGeneratedPath(candidate, options) {
  const resolved = requireGeneratedPath(candidate, options);
  if (lstatIfPresent(resolved)) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  requireGeneratedPath(path.dirname(resolved), {
    ...options,
    label: `${options.label ?? 'generated path'} parent`,
    allowTemporaryRoot: true,
  });
}
