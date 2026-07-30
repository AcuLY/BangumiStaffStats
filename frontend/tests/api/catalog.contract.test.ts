import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { decodeCatalogEnvelope } from '../../src/api/adapters/catalog';
import { createCatalogApi } from '../../src/api/catalog';
import type { ApiClient } from '../../src/api/client';
import { ApiDecodeError } from '../../src/api/errors';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const success = JSON.parse(
  fs.readFileSync(
    path.join(
      repositoryRoot,
      'contracts/goldens/api/catalog/cases/success-empty.json',
    ),
    'utf8',
  ),
) as { expected: { body: unknown } };

describe('catalog contract adapter', () => {
  it('strictly maps the accepted catalog into immutable entities', () => {
    const snapshot = decodeCatalogEnvelope(success.expected.body);

    expect(snapshot.subjectTypes.map(({ key }) => key)).toEqual([
      'book',
      'anime',
      'music',
      'game',
      'real',
    ]);
    expect(snapshot.positionsByKey.get('staff:anime:2')).toMatchObject({
      key: 'staff:anime:2',
      label: '导演',
      selectable: true,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.positions)).toBe(true);
  });

  it('rejects unknown properties and semantic dangling references', () => {
    const unknown = structuredClone(success.expected.body) as Record<string, unknown>;
    unknown.extra = true;
    expect(() => decodeCatalogEnvelope(unknown)).toThrow(ApiDecodeError);

    const dangling = structuredClone(success.expected.body) as {
      data: { groups: Array<{ positionKeys: string[] }> };
    };
    dangling.data.groups[0]!.positionKeys[0] = 'staff:book:999';
    expect(() => decodeCatalogEnvelope(dangling)).toThrow(ApiDecodeError);
  });

  it('treats a schema-valid position key as opaque instead of decoding it', () => {
    const opaque = structuredClone(success.expected.body) as {
      data: {
        groups: Array<{ positionKeys: string[] }>;
        positions: Array<{
          key: string;
          positionId?: number;
          subjectType: string;
        }>;
        selectionRules: Array<{ positionKey: string }>;
      };
    };
    const originalKey = 'staff:book:1';
    const opaqueKey = 'staff:anime:999';
    const position = opaque.data.positions.find(({ key }) => key === originalKey);
    expect(position).toBeDefined();
    position!.key = opaqueKey;
    for (const group of opaque.data.groups) {
      group.positionKeys = group.positionKeys.map((key) =>
        key === originalKey ? opaqueKey : key,
      );
    }
    for (const rule of opaque.data.selectionRules) {
      if (rule.positionKey === originalKey) {
        rule.positionKey = opaqueKey;
      }
    }

    const snapshot = decodeCatalogEnvelope(opaque);

    expect(snapshot.positionsByKey.get(opaqueKey)).toMatchObject({
      key: opaqueKey,
      kind: 'staff',
      subjectType: 'book',
    });
  });

  it('uses only the accepted input-free catalog endpoint', async () => {
    const request = vi.fn(async ({ decode }: { decode: (value: unknown) => unknown }) =>
      decode(success.expected.body),
    );
    const api = createCatalogApi({ request } as unknown as ApiClient);
    const controller = new AbortController();

    await api.load(controller.signal);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        reference: '/api/v1/catalog',
        signal: controller.signal,
      }),
    );
  });
});
