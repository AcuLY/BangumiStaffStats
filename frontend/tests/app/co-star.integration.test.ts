import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '../../src/app/App.vue';
import type { CandidatePayload } from '../../src/api/adapters/candidates';
import type { RankingPayload } from '../../src/api/adapters/rankings';
import {
  decodeCoStarPayload,
  type CoStarPayload,
} from '../../src/api/adapters/coStar';
import {
  decodePartnersPayload,
  type PartnersPayload,
} from '../../src/api/adapters/partners';
import type { CatalogApi } from '../../src/api/catalog';
import type {
  OperationResponse,
  QueryDrivers,
} from '../../src/features/query/coordinator';
import type { AppliedQuery } from '../../src/features/query/model';
import { createQuerySessionOwner, QUERY_SESSION_STORAGE_KEY } from '../../src/features/query/session';
import type { RecoveryWorkspace } from '../../src/features/query/recovery';
import { useQueryStore } from '../../src/features/query/store';
import { catalogFixture } from '../features/query/fixtures';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
type CoStarDrivers = QueryDrivers<
  RankingPayload,
  CandidatePayload,
  never,
  PartnersPayload,
  CoStarPayload
>;
type CandidateRequest = Parameters<
  CoStarDrivers['candidates']['execute']
>[0];
type RankingRequest = Parameters<
  CoStarDrivers['rankings']['execute']
>[0];
type CoStarRequest = Parameters<
  NonNullable<CoStarDrivers['coStar']>['execute']
>[0];
type PartnersRequest = Parameters<
  NonNullable<CoStarDrivers['partners']>['execute']
>[0];

const primaryDataVersion = `dv1-${'a'.repeat(64)}`;
const primaryFetchedAt = '2026-07-25T00:00:00Z';

function emptyRankingPayload(requestId: string): RankingPayload {
  return Object.freeze({
    collection: Object.freeze({
      fetchedAt: primaryFetchedAt,
      stale: false,
      warningCodes: Object.freeze([]),
    }),
    dataVersion: primaryDataVersion,
    items: Object.freeze([]),
    metricScale: Object.freeze({ kind: 'linear', max: null, metric: 'count' }),
    pagination: Object.freeze({ page: 1, pageSize: 10, total: 0 }),
    requestId,
    scope: 'personal',
    summary: Object.freeze({ personCount: 0, workCount: 0, workUnit: 'subject' }),
  });
}

function readGoldenBody(relativePath: string): unknown {
  const golden = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8'),
  ) as { cases: Array<{ expected: { body: unknown } }> };
  return structuredClone(golden.cases[0]!.expected.body);
}

function partnersPayload(
  dataVersion = primaryDataVersion,
  fetchedAt = primaryFetchedAt,
): PartnersPayload {
  const payload = decodePartnersPayload(
    readGoldenBody(
      'contracts/goldens/api/partners/cases/personal.json',
    ),
    'personal',
  );
  return Object.freeze({
    ...payload,
    collection: Object.freeze({
      ...payload.collection!,
      fetchedAt,
    }),
    dataVersion,
  });
}

function coStarPayload(
  dataVersion = primaryDataVersion,
  fetchedAt = primaryFetchedAt,
): CoStarPayload {
  const body = readGoldenBody(
    'contracts/goldens/api/co-star/cases/personal.json',
  ) as {
    data: {
      participants: Array<{ positionKeys: string[] }>;
    };
  };
  for (const participant of body.data.participants) {
    participant.positionKeys = ['staff:anime:2'];
  }
  const payload = decodeCoStarPayload(body, 'personal');
  return Object.freeze({
    ...payload,
    collection: Object.freeze({
      ...payload.collection!,
      fetchedAt,
    }),
    dataVersion,
  });
}

function coStarPayloadWithWork(
  dataVersion = primaryDataVersion,
  fetchedAt = primaryFetchedAt,
): CoStarPayload {
  const payload = coStarPayload(dataVersion, fetchedAt);
  const item = Object.freeze({
    globalScore: 800,
    key: 'subject:101',
    kind: 'subject' as const,
    metaTags: Object.freeze([]),
    participants: Object.freeze(
      payload.data.participants.map((participant) =>
        Object.freeze({
          credits: Object.freeze([]),
          personId: participant.person.id,
        }),
      ),
    ),
    personal: Object.freeze({
      score: 800,
      updatedAt: '2026-07-01T00:00:00Z',
    }),
    subject: Object.freeze({
      date: '2026-07',
      id: 101,
      name: 'Shared Work',
      nameCN: '共同作品',
    }),
  });
  return Object.freeze({
    ...payload,
    data: Object.freeze({
      ...payload.data,
      items: Object.freeze([item]),
      summary: Object.freeze({
        ...payload.data.summary,
        average: 800,
        commonWorkCount: 1,
        globalAverage: 800,
        globalRatedWorkCount: 1,
        highest: 800,
        lowest: 800,
        ratedWorkCount: 1,
      }),
    }),
    pagination: Object.freeze({
      ...payload.pagination,
      total: 1,
    }),
  }) as CoStarPayload;
}

function candidatePayload(
  positionKey: string | null,
  requestId: string,
  dataVersion = primaryDataVersion,
  fetchedAt = primaryFetchedAt,
): CandidatePayload {
  const itemPositionKeys = Object.freeze([positionKey ?? 'staff:anime:2']);
  return Object.freeze({
    collection: Object.freeze({
      fetchedAt,
      stale: false,
      warningCodes: Object.freeze([]),
    }),
    dataVersion,
    items: Object.freeze([
      Object.freeze({
        person: Object.freeze({
          id: 1,
          name: 'Candidate One',
          nameCN: '候选一',
        }),
        rank: 1,
        positionKeys: itemPositionKeys,
        workCount: 12,
      }),
      Object.freeze({
        person: Object.freeze({
          id: 2,
          name: 'Candidate Two',
          nameCN: '候选二',
        }),
        rank: 2,
        positionKeys: itemPositionKeys,
        workCount: 8,
      }),
    ]),
    pagination: Object.freeze({
      page: 1,
      pageSize: 10,
      total: 2,
    }),
    positionCounts: Object.freeze([
      Object.freeze({ count: 2, positionKey: 'staff:anime:2' }),
    ]),
    positionKey,
    requestId,
    scope: 'personal',
    workUnit: 'subject',
  });
}

function catalogApi(): CatalogApi {
  return {
    async load() {
      return catalogFixture();
    },
  };
}

function defaultDrivers(
  overrides: Partial<CoStarDrivers> = {},
): CoStarDrivers {
  return {
    candidates: {
      async execute(request) {
        const requestId = `server-${request.transactionId}`;
        return {
          payload: candidatePayload(
            request.input.positionKey,
            requestId,
          ),
          requestId,
          transactionId: request.transactionId,
        };
      },
    },
    coStar: {
      async execute(request) {
        const payload = coStarPayload();
        return {
          payload: {
            ...payload,
            data: { ...payload.data, participants: payload.data.participants.map((participant, index) => ({
              ...participant, positionKeys: request.input.participants[index]!.positionKeys,
            })) },
          },
          requestId: 'server-co-star',
          transactionId: request.transactionId,
        };
      },
    },
    partners: {
      async execute(request) {
        return {
          payload: partnersPayload(),
          requestId: 'server-partners',
          transactionId: request.transactionId,
        };
      },
    },
    rankings: {
      async execute(): Promise<never> {
        throw new Error('rankings are outside this integration slice');
      },
    },
    ...overrides,
  };
}

function seedPersonalQuery(): ReturnType<typeof useQueryStore> {
  const store = useQueryStore();
  store.draft.uid = 'luca';
  store.draft.positionKeys = ['staff:anime:2'];
  return store;
}

function installCompactLayout(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          addEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => true),
          matches: query === '(width < 780px)',
          media: query,
          onchange: null,
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    ),
  );
}

function installResponsiveLayout(
  initialCompact: boolean,
): (compact: boolean) => void {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let compact = initialCompact;
  const compactMedia = {
    addEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
    ),
    dispatchEvent: vi.fn(() => true),
    get matches() {
      return compact;
    },
    media: '(width < 780px)',
    onchange: null,
    removeEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
    ),
  } as unknown as MediaQueryList;
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) =>
      query === '(width < 780px)'
        ? compactMedia
        : ({
            addEventListener: vi.fn(),
            dispatchEvent: vi.fn(() => true),
            matches: false,
            media: query,
            onchange: null,
            removeEventListener: vi.fn(),
          } as unknown as MediaQueryList),
    ),
  );
  return (nextCompact: boolean) => {
    compact = nextCompact;
    const event = Object.assign(new Event('change'), {
      matches: compact,
      media: compactMedia.media,
    }) as MediaQueryListEvent;
    listeners.forEach((listener) => listener(event));
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App co-star production slice', () => {
  it.each([false, true])('filters default and changed selections, hides failed or cancelled stale options, and clears without refilling (all=%s)', async (all) => {
    window.history.replaceState({}, '', '/co-star?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = seedPersonalQuery();
    if (all) {
      store.draft.positionKeys = [];
      store.setCoStarPositionScope('all');
    }
    const candidates = vi.fn(defaultDrivers().candidates.execute);
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: { services: { catalogApi: catalogApi(), drivers: defaultDrivers({ candidates: { execute: candidates } }), targetWindow: window } },
    });
    await flushPromises();
    await wrapper.get('#query-editor').trigger('submit');
    await vi.waitFor(() => expect(wrapper.findAll('button.candidate-row')).toHaveLength(2));
    expect(candidates).toHaveBeenCalledTimes(2);
    expect(candidates.mock.calls[0]![0].input.participants).toBeUndefined();
    expect(candidates.mock.calls[1]![0].input.participants).toEqual([{ personId: 1, positionKeys: ['staff:anime:2'] }]);
    const selection = wrapper.findComponent({ name: 'CandidatePicker' }).props('selection');
    selection.replace([...selection.identities.value, {
      person: selection.people.value[0].person, positionKey: 'cast:anime:all', positionLabel: '声优',
    }]);
    await flushPromises();
    expect(candidates.mock.calls.at(-1)![0].input.participants).toEqual([
      { personId: 1, positionKeys: ['staff:anime:2', 'cast:anime:all'] },
    ]);
    await wrapper.findAll('button.candidate-selected-position')[1]!.trigger('click');
    await flushPromises();
    expect(candidates.mock.calls.at(-1)![0].input.participants).toEqual([{ personId: 1, positionKeys: ['staff:anime:2'] }]);
    const candidateView = { page: 3, pageSize: 5, search: '候选', sort: 'globalAverage', order: 'asc' };
    await wrapper.findComponent({ name: 'CandidatePicker' }).props('executeView')({ positionKey: 'staff:anime:2' }, candidateView);
    await flushPromises();

    const failed = deferred<OperationResponse<CandidatePayload>>();
    candidates.mockImplementationOnce(() => failed.promise);
    await wrapper.findAll('button.candidate-row')[1]!.trigger('click');
    expect(wrapper.findAll('button.candidate-row')).toHaveLength(0);
    expect(wrapper.findAll('.candidate-selected-person')).toHaveLength(2);
    expect(candidates.mock.calls.at(-1)![0].input.participants?.map((person) => person.personId)).toEqual([1, 2]);
    expect(candidates.mock.calls.at(-1)![0].view).toEqual({ ...candidateView, page: 1 });
    expect(candidates.mock.calls.at(-1)![0].input.positionKey).toBe('staff:anime:2');
    failed.reject(new Error('network failed'));
    await flushPromises();
    expect(wrapper.findAll('button.candidate-row')).toHaveLength(0);
    await wrapper.findAll('button.candidate-retry').at(-1)!.trigger('click');
    await flushPromises();
    expect(candidates.mock.calls.at(-1)![0].input.participants?.map((person) => person.personId)).toEqual([1, 2]);
    expect(wrapper.findAll('button.candidate-row')).toHaveLength(2);

    const cancelled = deferred<OperationResponse<CandidatePayload>>();
    candidates.mockImplementationOnce(() => cancelled.promise);
    await wrapper.findAll('button.candidate-selected-person__remove')[1]!.trigger('click');
    const cancelledRequest = candidates.mock.calls.at(-1)![0];
    await wrapper.get('button.candidate-cancel').trigger('click');
    expect(cancelledRequest.signal.aborted).toBe(true);
    expect(wrapper.findAll('button.candidate-row')).toHaveLength(0);
    await wrapper.findAll('button.candidate-retry').at(-1)!.trigger('click');
    await flushPromises();
    expect(candidates.mock.calls.at(-1)![0].input.participants).toEqual([{ personId: 1, positionKeys: ['staff:anime:2'] }]);
    cancelled.resolve(await defaultDrivers().candidates.execute(cancelledRequest));
    await flushPromises();
    await wrapper.get('button.candidate-selected-person__remove').trigger('click');
    await flushPromises();
    expect(candidates.mock.calls.at(-1)![0].input.participants).toEqual([]);
    expect(wrapper.findAll('.candidate-selected-person')).toHaveLength(0);
    expect(wrapper.findAll('button.candidate-row')).toHaveLength(2);
    wrapper.unmount();
  }, 15000);

  it.each([false, true])('keeps the analysis placeholder through candidate and analysis loading (compact=%s)', async (compact) => {
    installResponsiveLayout(compact);
    window.history.replaceState({}, '', '/co-star?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = seedPersonalQuery();
    let candidateGate = deferred<OperationResponse<CandidatePayload>>();
    let analysisGate = deferred<OperationResponse<PartnersPayload>>();
    const candidates = vi.fn((request: CandidateRequest) => defaultDrivers().candidates.execute(request))
      .mockImplementationOnce(() => candidateGate.promise);
    const analysis = vi.fn((_request: PartnersRequest) => analysisGate.promise);
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: { services: {
        catalogApi: catalogApi(),
        drivers: defaultDrivers({ candidates: { execute: candidates }, partners: { execute: analysis } }),
        targetWindow: window,
      } },
    });
    const resolveCandidates = async () => {
      const request = candidates.mock.calls.at(-1)![0];
      candidateGate.resolve(await defaultDrivers().candidates.execute(request));
    };
    const resolveAnalysis = async () => {
      const request = analysis.mock.calls.at(-1)![0];
      analysisGate.resolve(await defaultDrivers().partners!.execute(request));
      await vi.waitFor(() => expect(wrapper.find('.partners-summary-skeleton').exists()).toBe(false));
    };
    try {
      await flushPromises();
      await wrapper.get('#query-editor').trigger('submit');
      await vi.waitFor(() => expect(candidates).toHaveBeenCalledOnce());
      await vi.waitFor(() => expect(wrapper.find('.co-star-analysis-main .co-star-full-skeleton').exists()).toBe(true));
      expect(wrapper.find('.co-star-full-skeleton [data-selected-person-id]').exists()).toBe(false);
      expect(wrapper.get('.co-star-full-skeleton').text()).not.toContain('0 人共演');
      expect(analysis).not.toHaveBeenCalled();
      await resolveCandidates();
      await vi.waitFor(() => expect(analysis).toHaveBeenCalledOnce(), { timeout: 10000 });
      expect(wrapper.find('.co-star-analysis-main .partners-summary-skeleton').exists()).toBe(true);
      await resolveAnalysis();

      candidateGate = deferred<OperationResponse<CandidatePayload>>();
      analysisGate = deferred<OperationResponse<PartnersPayload>>();
      candidates.mockImplementationOnce(() => candidateGate.promise);
      await wrapper.get('.query-summary').trigger('click');
      await nextTick();
      store.draft.includeNSFW = !store.draft.includeNSFW;
      await wrapper.get('#query-editor').trigger('submit');
      await vi.waitFor(() => expect(candidates).toHaveBeenCalledTimes(3));
      expect(wrapper.find('.co-star-analysis-main .partners-summary-skeleton').exists()).toBe(true);
      expect(analysis).toHaveBeenCalledOnce();
      await resolveCandidates();
      await vi.waitFor(() => expect(analysis).toHaveBeenCalledTimes(2));
      await resolveAnalysis();

      const filteredCandidates = deferred<OperationResponse<CandidatePayload>>();
      candidates.mockImplementationOnce(() => filteredCandidates.promise);
      await wrapper.get('input[name="candidateSearch"]').setValue('One');
      await vi.waitFor(() => expect(candidates).toHaveBeenCalledTimes(5));
      expect(wrapper.find('.candidate-row-skeletons').exists()).toBe(true);
      expect(wrapper.find('.co-star-full-skeleton').exists()).toBe(false);
      expect(analysis).toHaveBeenCalledTimes(2);
      filteredCandidates.resolve(await defaultDrivers().candidates.execute(candidates.mock.calls.at(-1)![0]));
      await flushPromises();
      expect(analysis).toHaveBeenCalledTimes(2);
    } finally { wrapper.unmount(); }
  }, 15000);

  it('loads the other mode from Applied Query and reuses current mode resources', async () => {
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = seedPersonalQuery();
    const ranking = vi.fn(async (request: RankingRequest) => ({
      payload: emptyRankingPayload('server-ranking'),
      requestId: 'server-ranking',
      transactionId: request.transactionId,
    }));
    const candidates = vi.fn(defaultDrivers().candidates.execute);
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: defaultDrivers({
            candidates: { execute: candidates },
            rankings: { execute: ranking },
          }),
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    expect(ranking).toHaveBeenCalledOnce();

    store.draft.includeNSFW = true;
    await wrapper.get('#mode-tab-co-star').trigger('click');
    await flushPromises();

    expect(candidates).toHaveBeenCalledTimes(2);
    expect(candidates.mock.calls[0]![0].query.includeNSFW).toBe(false);
    expect(store.draft.includeNSFW).toBe(true);
    expect(store.dirty).toBe(true);
    expect(wrapper.text()).not.toContain('查询条件已应用');
    await vi.waitFor(() => {
      expect(wrapper.findAll('.candidate-selected-person')).toHaveLength(1);
    });

    await wrapper.get('#mode-tab-ranking').trigger('click');
    await flushPromises();
    expect(ranking).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('runs candidates, partners, and analysis through one persistent topology owner', async () => {
    window.history.replaceState({}, '', '/co-star?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = seedPersonalQuery();
    const candidates = vi.fn(async (request: CandidateRequest) => {
      const result = await defaultDrivers().candidates.execute(request);
      return request.input.positionScope === 'all' ? {
        ...result,
        payload: { ...result.payload, items: [...result.payload.items].reverse().map((item) => ({
          ...item, positionKeys: ['cast:anime:all'],
        })) },
      } : result;
    });
    const partners = vi.fn(async (request: PartnersRequest) => {
      const result = await defaultDrivers().partners!.execute(request);
      return {
        ...result,
        payload: Object.freeze({
          ...result.payload,
          items: Object.freeze(
            result.payload.items.map((item) =>
              Object.freeze({
                ...item,
                positionKeys: Object.freeze(['staff:anime:2']),
              }),
            ),
          ),
        }),
      };
    });
    const coStar = vi.fn(defaultDrivers().coStar!.execute);
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: defaultDrivers({
            candidates: { execute: candidates },
            coStar: { execute: coStar },
            partners: { execute: partners },
          }),
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    expect(candidates).toHaveBeenCalledTimes(2);
    expect(candidates.mock.calls.map(([request]) => request.input.positionScope ?? 'query')).toEqual(['query', 'all']);
    expect(candidates.mock.calls.every(([request]) => request.query.positionKeys.join() === 'staff:anime:2')).toBe(true);
    expect(wrapper.findAll('[role="tabpanel"]')).toHaveLength(2);
    expect(wrapper.get('#mode-panel-ranking').attributes()).toMatchObject({
      hidden: '',
      inert: 'true',
    });
    expect(
      wrapper.get('#mode-panel-co-star').attributes('hidden'),
    ).toBeUndefined();

    await vi.waitFor(() => {
      expect(
        wrapper.findAll('button.candidate-row'),
      ).toHaveLength(2);
    });
    expect(wrapper.findAll('.candidate-selected-person')).toHaveLength(1);
    expect(wrapper.get('.candidate-selected-person').attributes('data-selected-person-id')).toBe('1');
    expect(wrapper.text()).toContain('可继续选择人物，进行多人共演分析');
    expect(coStar).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(partners).toHaveBeenCalledOnce();
    });
    expect(partners).toHaveBeenCalledOnce();
    expect(partners.mock.calls[0]![0].input).toEqual({
      positionScope: 'all',
      source: {
        personId: 1,
        positionKeys: ['staff:anime:2'],
      },
    });
    await vi.waitFor(() => {
      expect(wrapper.find('.partners-surface').exists()).toBe(true);
    });
    expect(wrapper.find('.partners-surface').exists()).toBe(true);
    await vi.waitFor(() => {
      expect(createQuerySessionOwner(window).read('/co-star')?.workspace).toMatchObject({ state: 'partners' });
    });

    const analysisRegion = wrapper.get('.co-star-analysis-main');
    const scrollIntoView = vi.fn();
    Object.defineProperty(analysisRegion.element, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    await wrapper.get('.partners-results-boundary .ranked-person-row').trigger('click');
    await flushPromises();
    await vi.waitFor(() => {
      expect(coStar).toHaveBeenCalledOnce();
      expect(wrapper.find('.co-star-surface:not([aria-busy="true"])').exists()).toBe(true);
    });
    expect(coStar).toHaveBeenCalledOnce();
    expect(coStar.mock.calls[0]![0].input).toEqual({
      positionScope: 'all',
      participants: [
        { personId: 1, positionKeys: ['staff:anime:2'] },
        { personId: 2, positionKeys: ['staff:anime:2'] },
      ],
    });
    await vi.waitFor(() => {
      expect(wrapper.find('.co-star-surface').exists()).toBe(true);
    });
    expect(wrapper.find('.co-star-surface').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('可继续选择人物，进行多人共演分析');
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(analysisRegion.element);
    expect(analysisRegion.classes()).toContain('is-reveal-attention');
    await vi.waitFor(() => {
      expect(createQuerySessionOwner(window).read('/co-star')?.workspace).toMatchObject({ state: 'analysis' });
    });

    await wrapper.get('#mode-tab-ranking').trigger('click');
    await nextTick();
    expect(wrapper.get('#mode-panel-co-star').attributes()).toMatchObject({
      hidden: '',
      inert: 'true',
    });
    expect(wrapper.find('.co-star-surface').exists()).toBe(true);

    await wrapper.get('#mode-tab-co-star').trigger('click');
    await nextTick();
    expect(coStar).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('2 人');

    await wrapper.get('.query-summary').trigger('click');
    await nextTick();
    store.draft.includeNSFW = true;
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    expect(candidates).toHaveBeenCalledTimes(5);
    expect(wrapper.findAll('.candidate-selected-person')).toHaveLength(1);
    expect(wrapper.find('.co-star-empty').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps pending and failed child operations retryable after selection changes', async () => {
    window.history.replaceState({}, '', '/co-star?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    seedPersonalQuery();
    let rejectPartners!: (reason: unknown) => void;
    const partners = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectPartners = reject;
        }),
    );
    const coStar = vi.fn(() => new Promise<never>(() => undefined));
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: defaultDrivers({
            coStar: { execute: coStar },
            partners: { execute: partners },
          }),
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();

    await vi.waitFor(() => {
      expect(
        wrapper.findAll('button.candidate-row'),
      ).toHaveLength(2);
    });
    await vi.waitFor(() => {
      expect(partners).toHaveBeenCalledOnce();
    });
    const rows = wrapper.findAll<HTMLButtonElement>('button.candidate-row');
    await rows[1]!.trigger('click');
    await nextTick();
    await vi.waitFor(() => {
      expect(coStar).toHaveBeenCalledOnce();
    });
    await rows[1]!.trigger('click');
    await vi.waitFor(() => expect(partners).toHaveBeenCalledTimes(2));
    rejectPartners(new Error('offline'));
    await flushPromises();

    await rows[1]!.trigger('click');
    await nextTick();
    await vi.waitFor(() => {
      expect(coStar).toHaveBeenCalledTimes(2);
    });
    expect(coStar).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('rejects a child response from a different collection snapshot and permits an explicit retry', async () => {
    window.history.replaceState({}, '', '/co-star?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    seedPersonalQuery();
    const reproducedPrimaryDataVersion = `dv1-${'b'.repeat(64)}`;
    const reproducedPrimaryFetchedAt = '2026-07-25T08:00:00Z';
    const mismatchedDataVersion = `dv1-${'c'.repeat(64)}`;
    const candidates = vi.fn(async (request: CandidateRequest) => {
      const requestId = `server-${request.transactionId}`;
      return {
        payload: candidatePayload(
          request.input.positionKey,
          requestId,
          reproducedPrimaryDataVersion,
          reproducedPrimaryFetchedAt,
        ),
        requestId,
        transactionId: request.transactionId,
      };
    });
    const coStar = vi
      .fn<(request: CoStarRequest) => Promise<OperationResponse<CoStarPayload>>>()
      .mockImplementationOnce(async (request) => ({
        payload: coStarPayload(
          mismatchedDataVersion,
          primaryFetchedAt,
        ),
        requestId: 'server-co-star-mismatched',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(async (request) => ({
        payload: coStarPayload(
          reproducedPrimaryDataVersion,
          reproducedPrimaryFetchedAt,
        ),
        requestId: 'server-co-star-retry',
        transactionId: request.transactionId,
      }));
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: defaultDrivers({
            candidates: { execute: candidates },
            coStar: { execute: coStar },
          }),
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    await vi.waitFor(() => {
      expect(wrapper.findAll('button.candidate-row')).toHaveLength(2);
    });
    await wrapper.findAll('button.candidate-row')[1]!.trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.candidate-selected-person')).toHaveLength(2);
    expect(coStar).toHaveBeenCalledOnce();
    expect(wrapper.get('.co-star-initial-error').text()).toContain(
      '结果数据版本已变化，请重新查询后重试',
    );

    await wrapper
      .get('.co-star-initial-error__actions button')
      .trigger('click');
    await flushPromises();

    expect(coStar).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.co-star-initial-error').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([
    {
      expectedName: 'Source',
      state: 'partners' as const,
      workspace: {
        candidates: {
          input: { positionKey: 'staff:anime:2' },
          view: {
            order: 'asc' as const,
            page: 3,
            pageSize: 5 as const,
            search: '候选',
            sort: 'globalAverage' as const,
          },
        },
        kind: 'co-star' as const,
        partners: {
          input: {
            candidatePositionKey: 'staff:anime:2',
            source: {
              personId: 1,
              positionKeys: ['staff:anime:2'],
            },
          },
          view: {
            order: 'asc' as const,
            page: 4,
            pageSize: 5 as const,
            search: '合作',
            sort: 'preference' as const,
          },
        },
        state: 'partners' as const,
      },
    },
    {
      expectedName: 'One',
      state: 'analysis' as const,
      workspace: {
        candidates: {
          input: { positionKey: 'staff:anime:2' },
          view: {
            order: 'asc' as const,
            page: 3,
            pageSize: 5 as const,
            search: '候选',
            sort: 'globalAverage' as const,
          },
        },
        coStar: {
          input: {
            positionScope: 'all' as const,
            participants: [
              { personId: 1, positionKeys: ['staff:anime:2'] },
              { personId: 2, positionKeys: ['cast:anime:all'] },
            ],
          },
          view: {
            order: 'asc' as const,
            page: 6,
            pageSize: 20 as const,
            search: '共同',
            sort: 'personalScore' as const,
          },
        },
        kind: 'co-star' as const,
        state: 'analysis' as const,
      },
    },
  ])(
    'replays the exact saved $state views once and hydrates names from the authoritative response',
    async ({ expectedName, state, workspace }) => {
      const query: AppliedQuery = {
        scope: 'personal',
        uid: 'luca',
        collectionStatuses: ['completed'],
        subjectType: 'anime',
        positionKeys: ['staff:anime:2'],
        includeNSFW: false,
        mergeSeries: false,
      };
      window.history.replaceState({}, '', '/co-star');
      expect(createQuerySessionOwner(window).write('/co-star', query, workspace as RecoveryWorkspace)).toBe(true);
      const pinia = createPinia();
      setActivePinia(pinia);
      const candidates = vi.fn(defaultDrivers().candidates.execute);
      const partners = vi.fn(defaultDrivers().partners!.execute);
      const coStar = vi.fn(defaultDrivers().coStar!.execute);
      const wrapper = mount(App, {
        attachTo: document.body,
        global: { plugins: [pinia], stubs: { teleport: true } },
        props: {
          services: {
            catalogApi: catalogApi(),
            drivers: defaultDrivers({
              candidates: { execute: candidates },
              coStar: { execute: coStar },
              partners: { execute: partners },
            }),
            targetWindow: window,
          },
        },
      });
      await flushPromises();
      await nextTick();

      expect(candidates).toHaveBeenCalledOnce();
      expect(candidates.mock.calls[0]![0].view).toEqual(
        workspace.candidates.view,
      );
      expect(candidates.mock.calls[0]![0].input).toMatchObject(workspace.candidates.input);
      expect(candidates.mock.calls[0]![0].input.participants).toEqual(
        state === 'partners' ? [workspace.partners.input.source] : workspace.coStar.input.participants,
      );
      if (state === 'analysis') {
        expect(candidates.mock.calls[0]![0].input.positionScope).toBe('all');
      }
      const child = state === 'partners' ? partners : coStar;
      const expectedChild =
        state === 'partners' ? workspace.partners : workspace.coStar;
      expect(child).toHaveBeenCalledOnce();
      expect(child.mock.calls[0]![0].view).toEqual(expectedChild.view);
      expect(child.mock.calls[0]![0].input).toMatchObject(expectedChild.input);
      expect(wrapper.find('.query-editor-overlay').exists()).toBe(false);
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain(expectedName);
      });
      expect(wrapper.text()).toContain(expectedName);
      expect(window.location.hash).toBe('');
      wrapper.unmount();
    },
  );

  it('keeps the content opener authoritative while its in-flow accordion is open', async () => {
    installCompactLayout();
    window.history.replaceState({}, '', '/co-star?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    seedPersonalQuery();
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia] },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: defaultDrivers(),
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();

    await vi.waitFor(() => {
      expect(
        wrapper.find('#mode-panel-co-star > .co-star-mobile-entry').exists(),
      ).toBe(true);
    });
    let opener = wrapper.get<HTMLButtonElement>(
      '#mode-panel-co-star > .co-star-mobile-entry',
    );
    await wrapper.get('.query-summary').trigger('click');
    await nextTick();
    expect(
      wrapper.find('#mode-panel-co-star > .co-star-mobile-entry').exists(),
    ).toBe(true);
    await wrapper.get('#query-editor').trigger('keydown', { key: 'Escape' });
    await nextTick();

    opener = wrapper.get(
      '#mode-panel-co-star > .co-star-mobile-entry',
    );
    opener.element.focus();
    await opener.trigger('click');
    await flushPromises();
    const appRoot = wrapper.get('[data-app-root]');
    expect(appRoot.attributes('inert')).toBeUndefined();
    expect(appRoot.attributes('aria-hidden')).toBeUndefined();
    expect(opener.attributes('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(opener.element);
    expect(document.body.querySelector('.n-drawer-container')).toBeNull();
    const panel = wrapper.get<HTMLElement>(
      '#co-star-mobile-picker-panel',
    );
    expect(wrapper.get('#mode-panel-co-star').element.contains(panel.element)).toBe(
      true,
    );
    expect(panel.attributes('aria-hidden')).toBeUndefined();
    const search = panel.get<HTMLInputElement>(
      'input[name="candidateSearch"]',
    );
    search.element.focus();
    await search.trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(appRoot.attributes('inert')).toBeUndefined();
    expect(appRoot.attributes('aria-hidden')).toBeUndefined();
    expect(opener.attributes('aria-expanded')).toBe('false');
    expect(panel.attributes()).toMatchObject({
      'aria-hidden': 'true',
      inert: 'true',
    });
    expect(document.activeElement).toBe(opener.element);
    wrapper.unmount();
  });

  it('keeps the external entry mounted and transfers rail focus while editing across 779px', async () => {
    const setCompact = installResponsiveLayout(false);
    window.history.replaceState({}, '', '/co-star?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    seedPersonalQuery();
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia] },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: defaultDrivers(),
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    await vi.waitFor(() => {
      expect(wrapper.find('.co-star-candidate-rail').exists()).toBe(true);
    });

    await wrapper.get('.query-summary').trigger('click');
    await nextTick();
    expect(wrapper.find('#query-editor').exists()).toBe(true);
    const entry = wrapper.get<HTMLButtonElement>(
      '#mode-panel-co-star > .co-star-mobile-entry',
    );
    const search = wrapper.get<HTMLInputElement>(
      '.co-star-candidate-rail input[name="candidateSearch"]',
    );
    search.element.focus();

    setCompact(true);
    await nextTick();

    expect(entry.element.isConnected).toBe(true);
    expect(entry.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(entry.element);
    expect(document.activeElement).not.toBe(document.body);
    wrapper.unmount();
  });

  it('keeps the co-star panel and Header entry usable while its deferred workspace loads, fails, and retries', async () => {
    installCompactLayout();
    window.history.replaceState({}, '', '/co-star?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    seedPersonalQuery();
    type WorkspaceModule =
      typeof import('../../src/features/co-star/components/CoStarWorkspace.vue');
    const firstLoad = deferred<WorkspaceModule>();
    const workspaceLoader = vi
      .fn<() => Promise<WorkspaceModule>>()
      .mockImplementationOnce(() => firstLoad.promise)
      .mockImplementationOnce(
        () =>
          import(
            '../../src/features/co-star/components/CoStarWorkspace.vue'
          ),
      );
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia] },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: defaultDrivers(),
          surfaceLoaders: {
            coStarWorkspace: workspaceLoader,
          },
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();

    expect(workspaceLoader).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(wrapper.find('.candidate-workspace-skeleton .co-star-analysis-main .partners-surface[aria-busy="true"]').exists()).toBe(true);
    });
    expect(wrapper.get('#mode-panel-co-star').text()).toContain(
      '正在加载候选人物',
    );
    expect(
      wrapper.find('#mode-panel-co-star > .co-star-mobile-entry').exists(),
    ).toBe(true);

    firstLoad.reject(new Error('chunk unavailable'));
    await flushPromises();
    expect(wrapper.get('#mode-panel-co-star').text()).toContain(
      '候选人物加载失败',
    );
    expect(
      wrapper.find('#mode-panel-co-star > .co-star-mobile-entry').exists(),
    ).toBe(true);

    await wrapper
      .get('#mode-panel-co-star [data-deferred-surface] button')
      .trigger('click');
    await flushPromises();
    await vi.waitFor(() => {
      expect(
        wrapper.find('.co-star-candidate-workspace').exists(),
      ).toBe(true);
    });
    expect(workspaceLoader).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it.each([
    {
      label: 'a cross-scope candidate view',
      payload: {
        query: {
          scope: 'global',
          subjectType: 'anime',
          positionKeys: ['staff:anime:2'],
          includeNSFW: false,
          mergeSeries: false,
        },
        workspace: {
          candidates: {
            input: { positionKey: 'staff:anime:2' },
            view: {
              order: 'desc',
              page: 1,
              pageSize: 10,
              search: '',
              sort: 'globalAverage',
            },
          },
          kind: 'co-star',
          state: 'empty',
        },
      },
    },
    {
      label: 'twenty-one partner identities',
      payload: {
        query: {
          scope: 'global',
          subjectType: 'anime',
          positionKeys: Array.from(
            { length: 21 },
            (_, index) => `staff:anime:${index + 1}`,
          ),
          includeNSFW: false,
          mergeSeries: false,
        },
        workspace: {
          candidates: {
            input: { positionKey: 'staff:anime:1' },
            view: {
              order: 'desc',
              page: 1,
              pageSize: 10,
              search: '',
              sort: 'count',
            },
          },
          kind: 'co-star',
          partners: {
            input: {
              source: {
                personId: 1,
                positionKeys: Array.from(
                  { length: 21 },
                  (_, index) => `staff:anime:${index + 1}`,
                ),
              },
            },
            view: {
              order: 'desc',
              page: 1,
              pageSize: 10,
              search: '',
              sort: 'count',
            },
          },
          state: 'partners',
        },
      },
    },
    {
      label: 'a global partners preference view',
      payload: {
        query: {
          scope: 'global',
          subjectType: 'anime',
          positionKeys: ['staff:anime:2'],
          includeNSFW: false,
          mergeSeries: false,
        },
        workspace: {
          candidates: {
            input: { positionKey: 'staff:anime:2' },
            view: {
              order: 'desc',
              page: 1,
              pageSize: 10,
              search: '',
              sort: 'count',
            },
          },
          kind: 'co-star',
          partners: {
            input: {
              source: {
                personId: 1,
                positionKeys: ['staff:anime:2'],
              },
            },
            view: {
              order: 'desc',
              page: 1,
              pageSize: 10,
              search: '',
              sort: 'preference',
            },
          },
          state: 'partners',
        },
      },
    },
    {
      label: 'a global personal-score analysis view',
      payload: {
        query: {
          scope: 'global',
          subjectType: 'anime',
          positionKeys: ['staff:anime:2'],
          includeNSFW: false,
          mergeSeries: true,
        },
        workspace: {
          candidates: {
            input: { positionKey: 'staff:anime:2' },
            view: {
              order: 'desc',
              page: 1,
              pageSize: 10,
              search: '',
              sort: 'count',
            },
          },
          coStar: {
            input: {
              participants: [
                { personId: 1, positionKeys: ['staff:anime:2'] },
                { personId: 2, positionKeys: ['staff:anime:2'] },
              ],
            },
            view: {
              order: 'desc',
              page: 1,
              pageSize: 10,
              search: '',
              sort: 'personalScore',
            },
          },
          kind: 'co-star',
          state: 'analysis',
        },
      },
    },
    {
      label: 'a non-series series-size analysis view',
      payload: {
        query: {
          scope: 'global',
          subjectType: 'anime',
          positionKeys: ['staff:anime:2'],
          includeNSFW: false,
          mergeSeries: false,
        },
        workspace: {
          candidates: {
            input: { positionKey: 'staff:anime:2' },
            view: {
              order: 'desc',
              page: 1,
              pageSize: 10,
              search: '',
              sort: 'count',
            },
          },
          coStar: {
            input: {
              participants: [
                { personId: 1, positionKeys: ['staff:anime:2'] },
                { personId: 2, positionKeys: ['staff:anime:2'] },
              ],
            },
            view: {
              order: 'desc',
              page: 1,
              pageSize: 10,
              search: '',
              sort: 'seriesSize',
            },
          },
          kind: 'co-star',
          state: 'analysis',
        },
      },
    },
  ])(
    'rejects $label before any business request and discards invalid session data',
    async ({ payload }) => {
      window.sessionStorage.setItem(QUERY_SESSION_STORAGE_KEY, JSON.stringify({version: 2, coStar: payload}));
      window.history.replaceState({}, '', '/co-star');
      const pinia = createPinia();
      setActivePinia(pinia);
      const candidates = vi.fn(defaultDrivers().candidates.execute);
      const partners = vi.fn(defaultDrivers().partners!.execute);
      const coStar = vi.fn(defaultDrivers().coStar!.execute);
      const wrapper = mount(App, {
        attachTo: document.body,
        global: { plugins: [pinia], stubs: { teleport: true } },
        props: {
          services: {
            catalogApi: catalogApi(),
            drivers: defaultDrivers({
              candidates: { execute: candidates },
              coStar: { execute: coStar },
              partners: { execute: partners },
            }),
            targetWindow: window,
          },
        },
      });
      await flushPromises();

      expect(candidates).not.toHaveBeenCalled();
      expect(partners).not.toHaveBeenCalled();
      expect(coStar).not.toHaveBeenCalled();
      expect(window.location.hash).toBe('');
      expect(wrapper.find('.app-local-error').exists()).toBe(false);
      expect(window.sessionStorage.getItem(QUERY_SESSION_STORAGE_KEY)).toBeNull();
      wrapper.unmount();
    },
  );
});
