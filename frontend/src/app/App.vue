<!--
THESIS: 查询是正式应用的唯一入口，拒绝用假数据或结果卡片掩盖尚未接入的垂直能力。
OWN-WORLD: Bangumi 粉色、冷灰单层表面、固定 Header 与高密度两阶段查询编辑器。
STORY: 用户选择数据范围与动态职位，清楚地应用、取消、恢复或分享最后一次成功查询。
FIRST VIEWPORT: 品牌与双模式操作在第一行，完整查询 disclosure 紧随其下，主体保留可信空态。
FORM: 已建立的 Operate 世界；桌面使用 Header 下覆盖层，低于 780px 回到文档流。
-->
<script setup lang="ts">
import { NSkeleton } from 'naive-ui';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { createCatalogApi, type CatalogApi } from '../api/catalog';
import { createApiClient } from '../api/client';
import { createRankingsDriver } from '../api/rankings';
import { useCatalogStore } from '../features/catalog/store';
import RankingResults from '../features/ranking/components/RankingResults.vue';
import type { RankingPayload } from '../api/adapters/rankings';
import AppHeader from '../features/query/components/AppHeader.vue';
import QueryIcon from '../features/query/components/QueryIcon.vue';
import QueryWorkspace from '../features/query/components/QueryWorkspace.vue';
import {
  createQueryCoordinator,
  type QueryDrivers,
  unavailableQueryDrivers,
} from '../features/query/coordinator';
import { draftFromEffective } from '../features/query/model';
import type { SharePayload } from '../features/query/share';
import { useQueryStore } from '../features/query/store';
import AppProviders from './AppProviders.vue';
import { createRouteOwner } from './routes';
import { useRuntimeStore } from './store/runtime';
import { createThemeOwner } from './theme';

interface AppServices {
  readonly catalogApi: CatalogApi;
  readonly drivers: QueryDrivers<RankingPayload, unknown>;
  readonly targetWindow: Window;
}

const props = defineProps<{
  services?: Partial<AppServices>;
}>();

const targetWindow = props.services?.targetWindow ?? window;
const runtime = useRuntimeStore();
const catalogStore = useCatalogStore();
const queryStore = useQueryStore();
const route = createRouteOwner(targetWindow);
const themeOwner = createThemeOwner(targetWindow.document);
const routeError = ref<string | null>(null);
const queryWorkspace = ref<InstanceType<typeof QueryWorkspace> | null>(null);

const fetchImplementation =
  targetWindow.fetch?.bind(targetWindow) ??
  globalThis.fetch?.bind(globalThis) ??
  (async () => {
    throw new TypeError('Fetch is unavailable');
  });
const apiClient = createApiClient(fetchImplementation);
const catalogApi =
  props.services?.catalogApi ??
  createCatalogApi(apiClient);
const unavailableDrivers = unavailableQueryDrivers();
const drivers: QueryDrivers<RankingPayload, unknown> =
  props.services?.drivers ?? {
    candidates: unavailableDrivers.candidates,
    rankings: createRankingsDriver(apiClient),
  };
const coordinator = createQueryCoordinator(queryStore, drivers, (query) => {
  route.updateSuccessfulQuery(query);
  routeError.value = null;
});

const activeResource = computed(() =>
  route.mode.value === 'ranking'
    ? coordinator.rankings
    : coordinator.candidates,
);
const operationFeedback = computed(
  () => coordinator.lastOperationFeedback.value,
);

function installShareWorkspace(payload: SharePayload): void {
  if (payload.workspace.kind === 'ranking') {
    coordinator.rankings.view = Object.freeze({
      order: payload.workspace.rankingsView.order ?? 'desc',
      page: payload.workspace.rankingsView.page ?? 1,
      pageSize: payload.workspace.rankingsView.pageSize ?? 10,
      search: payload.workspace.rankingsView.search ?? '',
      sort: payload.workspace.rankingsView.sort ?? 'count',
    });
    return;
  }
  coordinator.candidates.input = Object.freeze(
    structuredClone(payload.workspace.candidates.input),
  );
  coordinator.candidates.view = Object.freeze(
    structuredClone(payload.workspace.candidates.view),
  );
}

async function replayShare(payload: SharePayload): Promise<boolean> {
  queryStore.replaceDraft(draftFromEffective(payload.query));
  installShareWorkspace(payload);
  return coordinator.execute({
    candidateInput:
      payload.workspace.kind === 'co-star'
        ? payload.workspace.candidates.input
        : undefined,
    catalog: catalogStore.snapshot,
    mode: route.mode.value,
  });
}

async function loadCatalog(): Promise<boolean> {
  return catalogStore.load(catalogApi);
}

async function retryRanking(): Promise<boolean> {
  return coordinator.execute({
    catalog: catalogStore.snapshot,
    mode: 'ranking',
  });
}

async function initialize(): Promise<void> {
  runtime.markReady();
  const hadFragment = targetWindow.location.hash.length > 0;
  if (!hadFragment) {
    queryStore.draft.uid = route.prefilledUser();
  }
  await loadCatalog();
  const shareResult = await route.consumeInitialShare(replayShare);
  if (shareResult === 'invalid') {
    routeError.value = '分享查询无效或已不受支持';
  } else if (shareResult === 'deferred') {
    routeError.value = '分享查询已读取，但暂时无法应用；可重试后再次查询';
  }
}

onMounted(initialize);

onBeforeUnmount(() => {
  coordinator.cancel('ranking');
  coordinator.cancel('co-star');
  catalogStore.cancel();
  route.dispose();
  themeOwner.dispose();
});
</script>

<template>
  <app-providers :theme="themeOwner.theme.value">
    <div
      class="app-shell"
      data-app-root
      :data-app-ready="runtime.isReady ? 'true' : 'false'"
      :data-runtime-phase="runtime.phase"
    >
      <header class="app-header">
        <div class="app-content-line">
          <app-header
            :coordinator="coordinator"
            :mode="route.mode.value"
            :navigate="route.navigate"
            :query-store="queryStore"
            :target-window="targetWindow"
            :theme="themeOwner.theme.value"
            :toggle-theme="themeOwner.toggle"
          />
        </div>
        <div class="app-header__query">
          <query-workspace
            ref="queryWorkspace"
            :catalog-store="catalogStore"
            :coordinator="coordinator"
            :mode="route.mode.value"
            :query-store="queryStore"
            :retry-catalog="loadCatalog"
            :target-window="targetWindow"
          />
        </div>
      </header>

      <div class="app-page-scroll">
        <main id="main-content" class="app-main">
          <p
            v-if="operationFeedback"
            class="app-query-feedback"
            :class="{
              'app-query-feedback--error': operationFeedback.kind === 'error',
            }"
            :data-operation="operationFeedback.operation"
            role="status"
            aria-live="polite"
          >
            {{ operationFeedback.message }}
          </p>
          <p v-if="routeError" class="app-local-error" role="alert">
            {{ routeError }}
          </p>

          <ranking-results
            v-if="
              route.mode.value === 'ranking' &&
              (coordinator.rankings.phase === 'pending' ||
                coordinator.rankings.payload !== null ||
                coordinator.rankings.error !== null)
            "
            :device-pixel-ratio="targetWindow.devicePixelRatio"
            :execute-view="coordinator.executeRankingView"
            :resource="coordinator.rankings"
            :retry="retryRanking"
          />

          <section
            v-else-if="activeResource.phase === 'pending'"
            class="query-result-state surface-panel"
            aria-busy="true"
            aria-live="polite"
          >
            <span class="state-icon state-icon--loading">
              <query-icon name="search" :size="28" />
            </span>
            <h1>正在应用查询</h1>
            <div class="query-result-skeleton" aria-hidden="true">
              <n-skeleton text :repeat="4" />
            </div>
          </section>

          <section
            v-else-if="!queryStore.applied"
            class="query-result-state surface-panel"
            aria-labelledby="query-empty-title"
          >
            <span class="state-icon"><query-icon name="search" :size="28" /></span>
            <h1 id="query-empty-title">尚未开始查询</h1>
            <button
              class="app-primary-action"
              type="button"
              @click="queryWorkspace?.openEditor()"
            >
              设置查询条件
            </button>
          </section>

          <section
            v-else
            class="query-result-state surface-panel"
            aria-labelledby="query-ready-title"
          >
            <span class="state-icon"><query-icon name="check" :size="28" /></span>
            <h1 id="query-ready-title">查询条件已应用</h1>
            <p>结果区域将由当前模式的正式数据能力继续呈现</p>
          </section>
        </main>

        <footer class="app-footer">
          <div class="app-content-line">
            Bangumi Staff Statistics · 数据口径以当前查询与 Archive 版本为准
          </div>
        </footer>
      </div>
    </div>
  </app-providers>
</template>
