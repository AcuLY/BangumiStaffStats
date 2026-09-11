<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import AppIcon from '../../../shared/components/AppIcon.vue';
import { useResultReveal } from '../../../shared/composables/useResultReveal';
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
import RankingListSkeleton from './RankingListSkeleton.vue';
import RankingResultsSkeleton from './RankingResultsSkeleton.vue';
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
    expandedPersonId?: number | null;
    executeView: (view: Readonly<RankingView>) => Promise<boolean>;
    pendingPersonal?: boolean;
    pendingHasCharacterCount?: boolean;
    pendingWorkUnit?: 'series' | 'subject';
    resource: RankingResource;
    retry: () => Promise<boolean>;
    selectedPersonId?: number | null;
    suppressErrorMessage?: boolean;
  }>(),
  {
    devicePixelRatio: 1,
    expandedPersonId: null,
    pendingPersonal: false,
    pendingHasCharacterCount: false,
    pendingWorkUnit: 'subject',
    selectedPersonId: null,
    suppressErrorMessage: false,
  },
);
const emit = defineEmits<{
  activate: [personId: number, trigger: HTMLElement];
}>();

const search = ref(props.resource.view.search);
const {
  attention: resultAttention,
  reveal: revealResults,
  target: resultTarget,
} = useResultReveal();
let searchTimer: number | undefined;
const payload = computed(() => props.resource.payload);
const corePending = computed(
  () => props.resource.phase === 'pending' && !props.resource.viewPending,
);
const completeZero = computed(
  () => payload.value?.summary.personCount === 0,
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

async function requestView(patch: Partial<RankingView>): Promise<boolean> {
  const view = updateRankingView(props.resource.view, patch);
  if (rankingViewEquals(view, props.resource.view)) {
    return false;
  }
  return props.executeView(view);
}

async function requestPage(patch: Partial<RankingView>): Promise<void> {
  if (await requestView(patch)) {
    await revealResults();
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
  <ranking-results-skeleton
    v-if="corePending"
    :page-size="resource.view.pageSize"
    :personal="pendingPersonal"
    :has-character-count="pendingHasCharacterCount"
    :view="resource.view"
    :work-unit="pendingWorkUnit"
  />

  <section
    v-else-if="!payload && resource.error"
    class="ranking-surface surface-panel ranking-surface--state"
    role="alert"
  >
    <span class="state-icon"><app-icon name="refresh" :size="26" /></span>
    <h1>人物排行加载失败</h1>
    <p v-if="!suppressErrorMessage">{{ resource.error }}</p>
    <button class="app-primary-action" type="button" @click="retry">
      重试查询
    </button>
  </section>

  <section
    v-else-if="payload && completeZero"
    class="query-result-state ranking-page-empty-state"
    aria-labelledby="ranking-complete-empty-title"
  >
    <span class="state-icon">
      <app-icon name="search" :size="28" />
    </span>
    <h1 id="ranking-complete-empty-title">没有符合查询条件的人物</h1>
  </section>

  <section
    v-else-if="payload"
    ref="resultTarget"
    class="ranking-surface ranking-pane surface-panel result-reveal-target"
    :class="{ 'is-reveal-attention': resultAttention }"
    aria-label="人物排行结果"
    :aria-busy="resource.viewPending ? 'true' : undefined"
    tabindex="-1"
  >
    <header class="ranking-surface__header ranking-controls">
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
      v-if="resource.error && !suppressErrorMessage"
      class="ranking-inline-error"
      role="alert"
    >
      {{ resource.error }}
    </p>

    <div class="ranking-surface__body ranking-list-scroll">
      <template v-if="resource.viewPending">
        <span class="sr-only" role="status" aria-live="polite">
          正在更新排行结果
        </span>
        <ranking-list-skeleton
          :page-size="resource.view.pageSize"
          :personal="payload.scope === 'personal'"
          :work-unit="payload.summary.workUnit"
        />
      </template>
      <template v-else>
        <ranked-person-list
          v-if="payload.items.length"
          :device-pixel-ratio="devicePixelRatio"
          :expanded-person-id="expandedPersonId"
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
        :page="payload.pagination.page"
        :page-size="payload.pagination.pageSize"
        :pending="resource.viewPending"
        :total="payload.pagination.total"
        @page="requestPage({ page: $event })"
        @page-size="requestPage({ pageSize: $event })"
      />
    </footer>
  </section>
</template>
