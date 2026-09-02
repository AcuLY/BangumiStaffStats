import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '../../src/app/App.vue';
import type { CandidatePayload } from '../../src/api/adapters/candidates';
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
import {
  createShareUrl,
  type ShareWorkspace,
} from '../../src/features/query/share';
import { useQueryStore } from '../../src/features/query/store';
import { catalogFixture } from '../features/query/fixtures';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const originalClipboard = Object.getOwnPropertyDescriptor(
  window.navigator,
  'clipboard',
);

type CoStarDrivers = QueryDrivers<
  never,
  CandidatePayload,
  never,
  PartnersPayload,
  CoStarPayload
>;
type CandidateRequest = Parameters<
  CoStarDrivers['candidates']['execute']
>[0];
type CoStarRequest = Parameters<
  NonNullable<CoStarDrivers['coStar']>['execute']
>[0];
type PartnersRequest = Parameters<
  NonNullable<CoStarDrivers['partners']>['execute']
>[0];

const primaryDataVersion = `dv1-${'a'.repeat(64)}`;
const primaryFetchedAt = '2026-07-25T00:00:00Z';

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
  positionKey: string,
  requestId: string,
  dataVersion = primaryDataVersion,
  fetchedAt = primaryFetchedAt,
): CandidatePayload {
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
        workCount: 12,
      }),
      Object.freeze({
        person: Object.freeze({
          id: 2,
          name: 'Candidate Two',
          nameCN: '候选二',
        }),
        rank: 2,
        workCount: 8,
      }),
    ]),
    pagination: Object.freeze({
      page: 1,
      pageSize: 10,
      total: 2,
    }),
    positionCounts: Object.freeze([
      Object.freeze({ count: 2, positionKey }),
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
            String(request.input.positionKey),
            requestId,
          ),
          requestId,
          transactionId: request.transactionId,
        };
      },
    },
    coStar: {
      async execute(request) {
        return {
          payload: coStarPayload(),
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function uncheckedFragment(payload: unknown): string {
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `#q=v1.${btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')}`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalClipboard) {
    Object.defineProperty(
      window.navigator,
      'clipboard',
      originalClipboard,
    );
  } else {
    Reflect.deleteProperty(window.navigator, 'clipboard');
  }
});

describe('App co-star production slice', () => {
  it('runs candidates, partners, and analysis through one persistent topology owner', async () => {
    window.history.replaceState({}, '', '/co-star?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = seedPersonalQuery();
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

    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    expect(candidates).toHaveBeenCalledOnce();
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
    const rows = wrapper.findAll<HTMLButtonElement>('button.candidate-row');
    await rows[0]!.trigger('click');
    await flushPromises();
    await vi.waitFor(() => {
      expect(partners).toHaveBeenCalledOnce();
    });
    expect(partners).toHaveBeenCalledOnce();
    expect(partners.mock.calls[0]![0].input).toEqual({
      source: {
        personId: 1,
        positionKeys: ['staff:anime:2'],
      },
    });
    await vi.waitFor(() => {
      expect(wrapper.find('.partners-surface').exists()).toBe(true);
    });
    expect(wrapper.find('.partners-surface').exists()).toBe(true);
    expect(
      wrapper
        .get('button[aria-label="复制当前查询链接"]')
        .attributes('disabled'),
    ).toBeUndefined();

    await rows[1]!.trigger('click');
    await flushPromises();
    await vi.waitFor(() => {
      expect(coStar).toHaveBeenCalledOnce();
    });
    expect(coStar).toHaveBeenCalledOnce();
    expect(coStar.mock.calls[0]![0].input).toEqual({
      participants: [
        { personId: 1, positionKeys: ['staff:anime:2'] },
        { personId: 2, positionKeys: ['staff:anime:2'] },
      ],
    });
    await vi.waitFor(() => {
      expect(wrapper.find('.co-star-surface').exists()).toBe(true);
    });
    expect(wrapper.find('.co-star-surface').exists()).toBe(true);
    expect(
      wrapper
        .get('button[aria-label="复制当前查询链接"]')
        .attributes('disabled'),
    ).toBeUndefined();

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
    expect(candidates).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.co-star-empty').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps sharing disabled until the visible child topology has an authoritative response', async () => {
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
    const rows = wrapper.findAll<HTMLButtonElement>('button.candidate-row');
    await rows[0]!.trigger('click');
    await nextTick();
    await vi.waitFor(() => {
      expect(partners).toHaveBeenCalledOnce();
    });
    expect(partners).toHaveBeenCalledOnce();
    const share = wrapper.get(
      'button[aria-label="复制当前查询链接"]',
    );
    expect(share.attributes('disabled')).toBeDefined();

    rejectPartners(new Error('offline'));
    await flushPromises();
    expect(share.attributes('disabled')).toBeDefined();

    await rows[1]!.trigger('click');
    await nextTick();
    await vi.waitFor(() => {
      expect(coStar).toHaveBeenCalledOnce();
    });
    expect(coStar).toHaveBeenCalledOnce();
    expect(share.attributes('disabled')).toBeDefined();
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
          String(request.input.positionKey),
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
    const rows = wrapper.findAll('button.candidate-row');
    await rows[0]!.trigger('click');
    await flushPromises();
    await rows[1]!.trigger('click');
    await flushPromises();

    expect(coStar).toHaveBeenCalledOnce();
    expect(wrapper.get('.co-star-initial-error').text()).toContain(
      '结果数据版本已变化，请重新查询后重试',
    );
    expect(
      wrapper
        .get('button[aria-label="复制当前查询链接"]')
        .attributes('disabled'),
    ).toBeDefined();

    await wrapper
      .get('.co-star-initial-error__actions button')
      .trigger('click');
    await flushPromises();

    expect(coStar).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.co-star-initial-error').exists()).toBe(false);
    expect(
      wrapper
        .get('button[aria-label="复制当前查询链接"]')
        .attributes('disabled'),
    ).toBeUndefined();
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
            participants: [
              { personId: 1, positionKeys: ['staff:anime:2'] },
              { personId: 2, positionKeys: ['staff:anime:2'] },
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
    'replays the exact $state views once and hydrates names from the authoritative response',
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
      const sharedUrl = createShareUrl(
        new URL(`${window.location.origin}/co-star`),
        '/co-star',
        query,
        workspace as ShareWorkspace,
      );
      window.history.replaceState({}, '', sharedUrl);
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
      const child = state === 'partners' ? partners : coStar;
      const expectedChild =
        state === 'partners' ? workspace.partners : workspace.coStar;
      expect(child).toHaveBeenCalledOnce();
      expect(child.mock.calls[0]![0].view).toEqual(expectedChild.view);
      expect(wrapper.find('.query-editor-overlay').exists()).toBe(false);
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain(expectedName);
      });
      expect(wrapper.text()).toContain(expectedName);
      expect(window.location.hash).toBe('');
      wrapper.unmount();
    },
  );

  it('keeps the Header opener authoritative and isolates the app while its Drawer is open', async () => {
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
        wrapper.find(
          '.app-header__mobile-context .co-star-mobile-entry',
        ).exists(),
      ).toBe(true);
    });
    let opener = wrapper.get<HTMLButtonElement>(
      '.app-header__mobile-context .co-star-mobile-entry',
    );
    await wrapper.get('.query-summary').trigger('click');
    await nextTick();
    expect(
      wrapper.find('.app-header__mobile-context').exists(),
    ).toBe(false);
    await wrapper.get('#query-editor').trigger('keydown', { key: 'Escape' });
    await nextTick();

    opener = wrapper.get(
      '.app-header__mobile-context .co-star-mobile-entry',
    );
    opener.element.focus();
    await opener.trigger('click');
    await flushPromises();
    const appRoot = wrapper.get('[data-app-root]');
    expect(appRoot.attributes()).toMatchObject({
      'aria-hidden': 'true',
      inert: 'true',
    });
    const drawer = document.body.querySelector<HTMLElement>(
      '#co-star-mobile-picker',
    );
    expect(drawer).not.toBeNull();
    expect(drawer!.closest('[inert]')).toBeNull();

    const drawerClose = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="关闭人物选择"]',
    );
    expect(drawerClose).not.toBeNull();
    drawerClose!.focus();
    drawerClose!.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        code: 'Escape',
        key: 'Escape',
      }),
    );
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    await nextTick();
    expect(appRoot.attributes('inert')).toBeUndefined();
    expect(appRoot.attributes('aria-hidden')).toBeUndefined();
    expect(document.activeElement).toBe(opener.element);
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
    expect(wrapper.get('#mode-panel-co-star').text()).toContain(
      '正在加载候选人物',
    );
    expect(
      wrapper.find(
        '.app-header__mobile-context .co-star-mobile-entry',
      ).exists(),
    ).toBe(true);

    firstLoad.reject(new Error('chunk unavailable'));
    await flushPromises();
    expect(wrapper.get('#mode-panel-co-star').text()).toContain(
      '候选人物加载失败',
    );
    expect(
      wrapper.find(
        '.app-header__mobile-context .co-star-mobile-entry',
      ).exists(),
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
    'rejects $label before any business request and consumes the fragment',
    async ({ payload }) => {
      const fragment = uncheckedFragment(payload);
      window.history.replaceState(
        {},
        '',
        `${window.location.origin}/co-star${fragment}`,
      );
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
      expect(wrapper.get('.app-local-error').text()).toContain(
        '分享查询无效',
      );
      wrapper.unmount();
    },
  );
});
