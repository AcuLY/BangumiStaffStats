import { describe, expect, it } from 'vitest';

import { decodeRecoveryPayload } from '../../../src/features/query/recovery';

const query = {
  scope: 'personal', uid: 'luca', collectionStatuses: ['completed'],
  subjectType: 'anime', positionKeys: ['staff:anime:2'],
  includeNSFW: false, mergeSeries: false,
};
const view = { order: 'desc', page: 1, pageSize: 10, search: '', sort: 'count' };
const ranking = { query, workspace: { kind: 'ranking', rankingsView: view } };
const candidates = { input: { positionKey: null }, view };
const empty = { query, workspace: { kind: 'co-star', state: 'empty', candidates } };
const analysis = {
  query,
  workspace: {
    kind: 'co-star', state: 'analysis', candidates,
    coStar: {
      input: { participants: [
        { personId: 1, positionKeys: ['staff:anime:2'] },
        { personId: 2, positionKeys: ['staff:anime:2'] },
      ] },
      view: { ...view, sort: 'globalScore' },
    },
  },
};

describe('local recovery validation', () => {
  it('preserves candidate participant constraints and rejects invalid identities', () => {
    const participants = [{ personId: 1, positionKeys: ['staff:anime:2'] }];
    const payload = { ...analysis, workspace: { ...analysis.workspace, candidates: { ...candidates,
      input: { positionKey: null, participants } } } };
    expect(decodeRecoveryPayload('/co-star', payload).workspace).toMatchObject({ candidates: { input: { participants } } });
    for (const invalid of [
      [...participants, ...participants],
      [{ personId: 1, positionKeys: ['staff:anime:2', 'staff:anime:2'] }],
      [{ personId: 1, positionKeys: ['staff:anime:101'] }],
    ]) {
      expect(() => decodeRecoveryPayload('/co-star', { ...payload, workspace: { ...payload.workspace,
        candidates: { ...candidates, input: { positionKey: null, participants: invalid } } } })).toThrow();
    }
  });
  it('restores first all queries with no concrete query positions in every co-star topology', () => {
    const allQuery = { ...query, positionKeys: [] };
    const allCandidates = { ...candidates, input: { positionKey: null, positionScope: 'all' } };
    const payloads = [
      { query: allQuery, workspace: { kind: 'co-star', state: 'empty', candidates: allCandidates } },
      { query: allQuery, workspace: { kind: 'co-star', state: 'partners', candidates: allCandidates,
        partners: { input: { positionScope: 'all', source: { personId: 1, positionKeys: ['staff:anime:2'] } }, view } } },
      { query: allQuery, workspace: { ...analysis.workspace, candidates: allCandidates,
        coStar: { ...analysis.workspace.coStar, input: { ...analysis.workspace.coStar.input, positionScope: 'all' } } } },
    ];
    for (const payload of payloads) {
      expect(decodeRecoveryPayload('/co-star', payload)).toEqual(payload);
      const queryScope = structuredClone(payload);
      queryScope.workspace.candidates.input.positionScope = 'query';
      expect(() => decodeRecoveryPayload('/co-star', queryScope)).toThrow();
    }
    expect(() => decodeRecoveryPayload('/ranking', { ...ranking, query: allQuery })).toThrow();
  });

  it('requires active all-scope operations and canonical fields when recovered query positions are empty', () => {
    const payload = {
      query: { ...query, positionKeys: [] },
      workspace: { ...analysis.workspace,
        candidates: { ...candidates, input: { positionKey: null, positionScope: 'all' } },
        coStar: { ...analysis.workspace.coStar, input: { ...analysis.workspace.coStar.input, positionScope: 'query' } },
      },
    };
    expect(() => decodeRecoveryPayload('/co-star', payload)).toThrow();
    payload.workspace.coStar.input.positionScope = 'all';
    payload.query.uid = ' luca ';
    expect(() => decodeRecoveryPayload('/co-star', payload)).toThrow();
    payload.query.uid = 'luca';
    payload.query.collectionStatuses = ['completed', 'completed'];
    expect(() => decodeRecoveryPayload('/co-star', payload)).toThrow();
  });

  it('accepts ranking state and all-position candidate selection without a URL codec', () => {
    expect(decodeRecoveryPayload('/ranking', structuredClone(ranking))).toEqual(ranking);
    expect(decodeRecoveryPayload('/co-star', structuredClone(empty))).toEqual(empty);
    expect(decodeRecoveryPayload('/co-star', structuredClone(analysis))).toEqual(analysis);
  });

  it.each([
    null, [], {}, { ...ranking, response: {} },
    { ...ranking, workspace: { ...ranking.workspace, pending: true } },
    { ...ranking, workspace: { ...ranking.workspace, rankingsView: { ...view, page: 0 } } },
    { ...ranking, workspace: { ...ranking.workspace, rankingsView: { ...view, extra: 1 } } },
  ])('rejects malformed or transient ranking state %#', (payload) => {
    expect(() => decodeRecoveryPayload('/ranking', payload)).toThrow();
  });

  it('rejects incompatible route and workspace topology', () => {
    expect(() => decodeRecoveryPayload('/ranking', empty)).toThrow();
    expect(() => decodeRecoveryPayload('/co-star', ranking)).toThrow();
    expect(() => decodeRecoveryPayload('/co-star', {
      ...empty, workspace: { ...empty.workspace, coStar: analysis.workspace.coStar },
    })).toThrow();
  });

  it.each(['duplicate person', 'outside position', 'unknown identity field'])(
    'rejects %s in recovered analysis', (condition) => {
      const payload = structuredClone(analysis);
      const people = payload.workspace.coStar.input.participants;
      if (condition === 'duplicate person') people[1]!.personId = people[0]!.personId;
      else if (condition === 'outside position') people[1]!.positionKeys = ['staff:anime:101'];
      else Object.assign(people[0]!, { name: 'stale response' });
      expect(() => decodeRecoveryPayload('/co-star', payload)).toThrow();
    },
  );

  it('rejects a candidate identity outside the applied query', () => {
    expect(() => decodeRecoveryPayload('/co-star', {
      ...empty, workspace: { ...empty.workspace,
        candidates: { ...candidates, input: { positionKey: 'staff:anime:101' } },
      },
    })).toThrow();
  });

  it('rejects invalid detail section and sort combinations', () => {
    expect(() => decodeRecoveryPayload('/ranking', {
      ...ranking, workspace: { ...ranking.workspace,
        detail: { input: { personId: 12 }, view: { ...view, section: 'works', sort: 'role' } },
      },
    })).toThrow();
  });
});


it('preserves all-position candidates and exact cross-role identities through recovery', () => {
  const payload = structuredClone(analysis);
  Object.assign(payload.workspace.candidates.input, { positionKey: 'staff:anime:101', positionScope: 'all' });
  Object.assign(payload.workspace.coStar.input, { positionScope: 'all' });
  payload.workspace.coStar.input.participants[1]!.positionKeys = ['staff:anime:101'];
  expect(decodeRecoveryPayload('/co-star', payload)).toEqual(payload);
  const partners = { query, workspace: { kind: 'co-star', state: 'partners',
    candidates: payload.workspace.candidates,
    partners: { input: { source: { personId: 2, positionKeys: ['staff:anime:101'] },
      positionScope: 'all', candidatePositionKey: 'staff:anime:2' }, view },
  } };
  expect(decodeRecoveryPayload('/co-star', partners)).toEqual(partners);
  Object.assign(payload.workspace.coStar.input, { positionScope: 'query' });
  expect(() => decodeRecoveryPayload('/co-star', payload)).toThrow();
});

it('keeps duplicate and identity-count limits in all-position recovery', () => {
  const payload = structuredClone(analysis);
  Object.assign(payload.workspace.coStar.input, { positionScope: 'all' });
  payload.workspace.coStar.input.participants[1]!.positionKeys = Array.from({ length: 20 }, (_, i) => `staff:anime:${i + 101}`);
  expect(() => decodeRecoveryPayload('/co-star', payload)).toThrow();
  payload.workspace.coStar.input.participants[1]!.positionKeys = ['staff:anime:101', 'staff:anime:101'];
  expect(() => decodeRecoveryPayload('/co-star', payload)).toThrow();
});
