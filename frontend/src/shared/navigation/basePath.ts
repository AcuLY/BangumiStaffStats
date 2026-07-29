/** Logical route identities, independent of the public deployment prefix. */
export type AppPath = '/co-star' | '/ranking';

export function normalizeApplicationBasePath(value: string): string {
  if (value === '/') {
    return '/';
  }
  if (
    !value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('%') ||
    value.includes('//')
  ) {
    throw new TypeError('Application base path must be a safe absolute path');
  }
  const path = value.replace(/\/+$/, '');
  if (
    path.length === 0 ||
    path
      .split('/')
      .some((segment) => segment === '.' || segment === '..')
  ) {
    throw new TypeError('Application base path must be a safe absolute path');
  }
  return `${path}/`;
}

export const APPLICATION_BASE_PATH = normalizeApplicationBasePath(
  import.meta.env.BASE_URL,
);

function publicPrefix(basePath: string): string {
  const normalized = normalizeApplicationBasePath(basePath);
  return normalized === '/' ? '' : normalized.slice(0, -1);
}

export function toPublicAppPath(
  path: AppPath,
  basePath = APPLICATION_BASE_PATH,
): string {
  return `${publicPrefix(basePath)}${path}`;
}

export function toLogicalAppPath(
  pathname: string,
  basePath = APPLICATION_BASE_PATH,
): string | null {
  const prefix = publicPrefix(basePath);
  if (prefix === '') {
    return pathname;
  }
  if (pathname === prefix) {
    return '/';
  }
  if (!pathname.startsWith(`${prefix}/`)) {
    return null;
  }
  return pathname.slice(prefix.length);
}

export function toPublicApiReference(
  reference: string,
  basePath = APPLICATION_BASE_PATH,
): string {
  if (!reference.startsWith('/api/')) {
    throw new TypeError('API reference must use the logical /api/ path');
  }
  return `${publicPrefix(basePath)}${reference}`;
}
