import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { createRouteOwner } from '../../../src/app/routes';
import {
  copyShareUrl,
  createShareFragment,
  createShareUrl,
  readShare,
  type SharePayload,
} from '../../../src/features/query/share';
import type { AppliedQuery } from '../../../src/features/query/model';

const query: AppliedQuery = {
  scope: 'personal',
  uid: 'luca',
  collectionStatuses: ['completed'],
  subjectType: 'anime',
  positionKeys: ['staff:anime:2'],
  includeNSFW: false,
  mergeSeries: false,
};

const workspace = {
  kind: 'ranking' as const,
  rankingsView: {
    order: 'desc' as const,
    page: 1,
    pageSize: 10 as const,
    search: '',
    sort: 'count' as const,
  },
};

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const shareGoldens = JSON.parse(
  fs.readFileSync(
    path.join(
      repositoryRoot,
      'contracts/goldens/query/cases/shares.json',
    ),
    'utf8',
  ),
) as {
  cases: Array<{
    expectedFragment: string;
    id: string;
    path: '/co-star' | '/ranking';
    payload: SharePayload;
  }>;
};

describe('share and route owner', () => {
  it('round-trips only the applied query and accepted workspace', () => {
    const url = createShareUrl(
      new URL(`${window.location.origin}/ranking?user=other`),
      '/ranking',
      query,
      workspace,
    );
    const parsed = new URL(url);
    expect(readShare('/ranking', parsed.hash)).toEqual({ query, workspace });
    expect(parsed.searchParams.get('user')).toBe('other');
  });

  it('consumes one initial share, removes the fragment, and never replays it twice', async () => {
    const url = createShareUrl(
      new URL(`${window.location.origin}/ranking?user=other`),
      '/ranking',
      query,
      workspace,
    );
    window.history.replaceState({}, '', url);
    const owner = createRouteOwner(window);
    const replay = vi.fn(async () => true);

    await expect(owner.consumeInitialShare(replay)).resolves.toBe('applied');
    await expect(owner.consumeInitialShare(replay)).resolves.toBe('absent');

    expect(replay).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('');
    owner.dispose();
  });

  it('rejects an invalid fragment without replay or user fallback request', async () => {
    window.history.replaceState(
      {},
      '',
      `${window.location.origin}/ranking?user=other#q=v9.invalid`,
    );
    const owner = createRouteOwner(window);
    const replay = vi.fn(async () => true);

    await expect(owner.consumeInitialShare(replay)).resolves.toBe('invalid');

    expect(replay).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    owner.dispose();
  });

  it('consumes a valid fragment after one deferred or failed application attempt', async () => {
    const url = createShareUrl(
      new URL(`${window.location.origin}/ranking`),
      '/ranking',
      query,
      workspace,
    );
    window.history.replaceState({}, '', url);
    const owner = createRouteOwner(window);
    const replay = vi.fn(async () => false);

    await expect(
      owner.consumeInitialShare(replay),
    ).resolves.toBe('deferred');
    expect(window.location.hash).toBe('');

    await expect(
      owner.consumeInitialShare(async () => true),
    ).resolves.toBe('absent');
    expect(replay).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('');
    owner.dispose();

    window.history.replaceState({}, '', url);
    const throwingOwner = createRouteOwner(window);
    await expect(
      throwingOwner.consumeInitialShare(async () => {
        throw new Error('offline');
      }),
    ).resolves.toBe('deferred');
    expect(window.location.hash).toBe('');
    await expect(
      throwingOwner.consumeInitialShare(async () => true),
    ).resolves.toBe('absent');
    throwingOwner.dispose();
  });

  it('updates personal/global URL without navigating or starting another action', () => {
    window.history.replaceState({}, '', `${window.location.origin}/ranking?user=old`);
    const owner = createRouteOwner(window);
    const replace = vi.spyOn(window.history, 'replaceState');

    owner.updateSuccessfulQuery(query);
    expect(window.location.search).toBe('?user=luca');
    owner.updateSuccessfulQuery({
      scope: 'global',
      subjectType: 'anime',
      positionKeys: ['staff:anime:2'],
      includeNSFW: false,
      mergeSeries: false,
    });
    expect(window.location.search).toBe('');
    expect(replace).toHaveBeenCalledTimes(2);
    owner.dispose();
  });

  it('uses Clipboard when available and preserves the link on absence or failure', async () => {
    const writeText = vi.fn(async () => undefined);
    await expect(copyShareUrl('https://example.test', { writeText })).resolves.toBe(
      'copied',
    );
    expect(writeText).toHaveBeenCalledWith('https://example.test');

    await expect(copyShareUrl('https://example.test', undefined)).resolves.toBe(
      'fallback',
    );
    await expect(
      copyShareUrl('https://example.test', {
        writeText: vi.fn(async () => {
          throw new Error('denied');
        }),
      }),
    ).resolves.toBe('fallback');
  });

  it.each(shareGoldens.cases)(
    'matches the accepted canonical share bytes for $id',
    (testCase) => {
      const fragment = createShareFragment(
        testCase.path,
        testCase.payload.query,
        testCase.payload.workspace,
      );

      expect(`${testCase.path}${fragment}`).toBe(testCase.expectedFragment);
      expect(readShare(testCase.path, fragment)).toEqual(testCase.payload);
    },
  );

  it('rejects noncanonical bytes and identities outside the applied query', () => {
    const base = shareGoldens.cases.find(
      ({ id }) => id === 'co-star-analysis-share',
    )!;
    const duplicatePerson = structuredClone(base.payload);
    if (
      duplicatePerson.workspace.kind !== 'co-star' ||
      duplicatePerson.workspace.state !== 'analysis'
    ) {
      throw new Error('Unexpected share golden');
    }
    duplicatePerson.workspace.coStar.input.participants[1] = structuredClone(
      duplicatePerson.workspace.coStar.input.participants[0]!,
    );
    expect(() =>
      createShareFragment(
        base.path,
        duplicatePerson.query,
        duplicatePerson.workspace,
      ),
    ).toThrow();

    const empty = shareGoldens.cases.find(
      ({ id }) => id === 'co-star-empty-share',
    )!;
    const outside = structuredClone(empty.payload);
    if (outside.workspace.kind !== 'co-star') {
      throw new Error('Unexpected share golden');
    }
    outside.workspace.candidates.input.positionKey = 'staff:anime:2';
    expect(() =>
      createShareFragment(empty.path, outside.query, outside.workspace),
    ).toThrow();

    const ranking = shareGoldens.cases.find(
      ({ id }) => id === 'ranking-share',
    )!;
    const encoded = ranking.expectedFragment.split('#q=v1.')[1]!;
    const binary = atob(
      encoded.replaceAll('-', '+').replaceAll('_', '/').padEnd(
        Math.ceil(encoded.length / 4) * 4,
        '=',
      ),
    );
    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(binary, (character) => character.charCodeAt(0)),
      ),
    );
    const prettyBytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
    let prettyBinary = '';
    for (const byte of prettyBytes) {
      prettyBinary += String.fromCharCode(byte);
    }
    const noncanonical = `#q=v1.${btoa(prettyBinary)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/u, '')}`;
    expect(() => readShare('/ranking', noncanonical)).toThrow();
  });
});
