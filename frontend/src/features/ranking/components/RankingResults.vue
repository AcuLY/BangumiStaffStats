<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import AppIcon from '../../../shared/components/AppIcon.vue';
import type {
  RankingPayload,
  RankingSort,
  RankingView,
} from '../model';
import {
  rankingViewEquals,
  updateRankingView,
} from '../model';
import AdaptivePagination from './AdaptivePagination.vue';
import RankedPersonList from './RankedPersonList.vue';
import RankingSummary from './RankingSummary.vue';
import RankingToolbar from './RankingToolbar.vue';

interface RankingResource {
  readonly error: string | null;
  readonly payload: RankingPayload | null;
  readonly phase: 'error' | 'idle' | 'pending' | 'ready';
  readonly view: Readonly<RankingView>;
  readonly viewPending: boolean;
}

const props = withDefaults(
  defineProps<{
    devicePixelRatio?: number;
    executeView: (view: Readonly<RankingView>) => Promise<boolean>;
    resource: RankingResource;
    retry: () => Promise<boolean>;
    selectedPersonId?: number | null;
  }>(),
  {
    devicePixelRatio: 1,
    selectedPersonId: null,
  },
);
const emit = defineEmits<{
  activate: [personId: number, trigger: HTMLElement];
}>();

const search = ref(props.resource.view.search);
let searchTimer: number | undefined;
const payload = computed(() => props.resource.payload);
const corePending = computed(
  () => props.resource.phase === 'pending' && !props.resource.viewPending,
);
const emptyTitle = computed(() =>
  props.resource.view.search.trim()
    ? '没有符合搜索条件的人物'
    : '没有符合查询条件的人物',
);

watch(
  () => props.resource.view.search,
  (value) => {
    search.value = value;
  },
);

function clearSearchTimer(): void {
  if (searchTimer !== undefined) {
    window.clearTimeout(searchTimer);
    searchTimer = undefined;
  }
}

async function requestView(patch: Partial<RankingView>): Promise<void> {
  const view = updateRankingView(props.resource.view, patch);
  if (!rankingViewEquals(view, props.resource.view)) {
    await props.executeView(view);
  }
}

function scheduleSearch(value: string): void {
  search.value = value;
  clearSearchTimer();
  searchTimer = window.setTimeout(() => {
    searchTimer = undefined;
    void requestView({ search: value });
  }, 240);
}

function submitSearch(): void {
  clearSearchTimer();
  void requestView({ search: search.value });
}

function changeSort(sort: RankingSort): void {
  void requestView({ sort });
}

function forwardActivation(
  personId: number,
  trigger: HTMLElement,
): void {
  emit('activate', personId, trigger);
}

onBeforeUnmount(clearSearchTimer);
</script>

<template>
  <section
    v-if="corePending"
    class="ranking-surface surface-panel ranking-surface--loading"
    aria-busy="true"
    aria-live="polite"
  >
    <div class="ranking-surface__loading-copy">
      <app-icon name="search" :size="24" />
      <strong>正在加载人物排行</strong>
    </div>
    <div class="ranking-row-skeletons" aria-hidden="true">
      <span v-for="index in 6" :key="index" />
    </div>
  </section>

  <section
    v-else-if="!payload && resource.error"
    class="ranking-surface surface-panel ranking-surface--state"
    role="alert"
  >
    <span class="state-icon"><app-icon name="refresh" :size="26" /></span>
    <h1>人物排行加载失败</h1>
    <p>{{ resource.error }}</p>
    <button class="app-primary-action" type="button" @click="retry">
      重试查询
    </button>
  </section>

  <section
    v-else-if="payload"
    class="ranking-surface surface-panel"
    :aria-busy="resource.viewPending ? 'true' : undefined"
  >
    <header class="ranking-surface__header">
      <ranking-summary :summary="payload.summary" />
      <ranking-toolbar
        :personal="payload.scope === 'personal'"
        :search="search"
        :view="resource.view"
        :work-unit="payload.summary.workUnit"
        @search="scheduleSearch"
        @search-now="submitSearch"
        @sort="changeSort"
        @order="requestView({ order: $event })"
      />
    </header>

    <p
      v-if="resource.error"
      class="ranking-inline-error"
      role="alert"
    >
      {{ resource.error }}
    </p>

    <div class="ranking-surface__body">
      <div
        v-if="resource.viewPending"
        class="ranking-view-pending"
        aria-live="polite"
      >
        <span class="sr-only">正在更新排行结果</span>
        <span v-for="index in 5" :key="index" aria-hidden="true" />
      </div>
      <template v-else>
        <ranked-person-list
          v-if="payload.items.length"
          :device-pixel-ratio="devicePixelRatio"
          :items="payload.items"
          :metric-scale="payload.metricScale"
          :personal="payload.scope === 'personal'"
          :selected-person-id="selectedPersonId"
          :sort="resource.view.sort"
          :work-unit="payload.summary.workUnit"
          @activate="forwardActivation"
        />
        <div v-else class="ranking-empty-state">
          <app-icon name="search" :size="22" />
          <strong>{{ emptyTitle }}</strong>
        </div>
      </template>
    </div>

    <footer class="ranking-surface__footer">
      <adaptive-pagination
        v-if="!resource.viewPending"
        :item-count="payload.items.length"
        :page="payload.pagination.page"
        :page-size="payload.pagination.pageSize"
        :pending="resource.viewPending"
        :total="payload.pagination.total"
        @page="requestView({ page: $event })"
        @page-size="requestView({ pageSize: $event })"
      />
      <div v-else class="ranking-pagination-skeleton" aria-hidden="true" />
    </footer>
  </section>
</template>
