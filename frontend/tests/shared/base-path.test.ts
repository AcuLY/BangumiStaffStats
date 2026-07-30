import { describe, expect, it } from 'vitest';

import {
  normalizeApplicationBasePath,
  toLogicalAppPath,
  toPublicApiReference,
  toPublicAppPath,
} from '../../src/shared/navigation/basePath';

describe('shared application base path', () => {
  it('keeps existing logical URLs at the root development base', () => {
    expect(toPublicAppPath('/ranking', '/')).toBe('/ranking');
    expect(toPublicApiReference('/api/v1/catalog', '/')).toBe(
      '/api/v1/catalog',
    );
    expect(toLogicalAppPath('/co-star', '/')).toBe('/co-star');
  });

  it('projects every browser-owned URL below the production base', () => {
    expect(toPublicAppPath('/ranking', '/v2/')).toBe('/v2/ranking');
    expect(toPublicAppPath('/co-star', '/v2')).toBe('/v2/co-star');
    expect(
      toPublicApiReference('/api/v1/catalog?scope=global', '/v2/'),
    ).toBe('/v2/api/v1/catalog?scope=global');
    expect(toLogicalAppPath('/v2/', '/v2/')).toBe('/');
    expect(toLogicalAppPath('/v2/index.html', '/v2/')).toBe('/index.html');
    expect(toLogicalAppPath('/v2/co-star', '/v2/')).toBe('/co-star');
    expect(toLogicalAppPath('/ranking', '/v2/')).toBeNull();
    expect(toLogicalAppPath('/v20/ranking', '/v2/')).toBeNull();
  });

  it('rejects ambiguous or escaping base paths and non-API references', () => {
    for (const value of [
      'v2',
      '/v2//',
      '/v2/../',
      '/v2?mode=ranking',
      '/v2#ranking',
      '/v2%2franking',
      String.raw`/v2\ranking`,
    ]) {
      expect(() => normalizeApplicationBasePath(value)).toThrow(TypeError);
    }
    expect(() => toPublicApiReference('/ranking', '/v2/')).toThrow(TypeError);
  });
});
