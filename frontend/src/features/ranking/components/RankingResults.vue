<script setup lang="ts">
import { NSkeleton } from 'naive-ui';
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
  <section
    v-if="corePending"
    class="ranking-surface ranking-pane surface-panel ranking-surface--loading"
    aria-busy="true"
  >
    <span class="sr-only" role="status" aria-live="polite">
      正在加载人物排行
    </span>

    <header
      class="ranking-surface__header ranking-controls"
      aria-hidden="true"
    >
      <div class="ranking-result-stats ranking-skeleton__summary">
        <n-skeleton
          class="app-skeleton ranking-skeleton__summary-label"
          :sharp="false"
        />
        <n-skeleton
          class="app-skeleton ranking-skeleton__summary-values"
          :sharp="false"
        />
      </div>
      <div class="ranking-toolbar ranking-skeleton__toolbar">
        <n-skeleton
          class="app-skeleton ranking-skeleton__control"
          :sharp="false"
        />
        <n-skeleton
          class="app-skeleton ranking-skeleton__control"
          :sharp="false"
        />
        <n-skeleton
          class="app-skeleton ranking-skeleton__control ranking-skeleton__control--order"
          :sharp="false"
        />
      </div>
    </header>

    <div
      class="ranking-surface__body ranking-list-scroll"
      aria-hidden="true"
    >
      <div
        class="ranking-columns list-columns list-columns--ranking"
        :class="{ 'is-global': !pendingPersonal }"
      >
        <span>#</span>
        <span />
        <span>人物</span>
        <span
          class="ranking-columns__metrics list-columns__metrics"
          :class="{ 'is-global': !pendingPersonal }"
          :style="{
            '--ranking-metric-columns': pendingPersonal ? 4 : 3,
          }"
        >
          <span>{{ pendingWorkUnit === 'series' ? '系列' : '作品' }}</span>
          <span>均分</span>
          <span>综合</span>
          <span v-if="pendingPersonal">偏好</span>
        </span>
      </div>

      <div class="ranking-row-skeletons">
        <div
          v-for="index in resource.view.pageSize"
          :key="index"
          class="ranking-row-skeleton"
        >
          <n-skeleton
            class="app-skeleton ranked-person-row__rank ranking-row-skeleton__rank"
            :sharp="false"
          />
          <n-skeleton
            class="app-skeleton ranked-person-row__avatar ranking-row-skeleton__avatar"
            :sharp="false"
          />
          <span class="ranked-person-row__identity ranking-row-skeleton__identity">
            <n-skeleton class="app-skeleton" :sharp="false" />
            <n-skeleton class="app-skeleton" :sharp="false" />
          </span>
          <span
            class="ranked-person-row__metrics ranking-row-skeleton__metrics"
            :class="{ 'is-global': !pendingPersonal }"
            :style="{
              '--ranking-metric-columns': pendingPersonal ? 4 : 3,
            }"
          >
            <span><n-skeleton class="app-skeleton" :sharp="false" /></span>
            <span><n-skeleton class="app-skeleton" :sharp="false" /></span>
            <span><n-skeleton class="app-skeleton" :sharp="false" /></span>
            <span v-if="pendingPersonal">
              <n-skeleton class="app-skeleton" :sharp="false" />
            </span>
          </span>
        </div>
      </div>
    </div>

    <footer class="ranking-surface__footer" aria-hidden="true">
      <n-skeleton
        class="app-skeleton ranking-pagination-skeleton"
        :sharp="false"
      />
    </footer>
  </section>

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
      <div
        v-if="resource.viewPending"
        class="ranking-view-pending"
        aria-live="polite"
      >
        <span class="sr-only">正在更新排行结果</span>
        <n-skeleton
          v-for="index in 5"
          :key="index"
          class="app-skeleton"
          :sharp="false"
          aria-hidden="true"
        />
      </div>
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
        v-if="!resource.viewPending"
        :item-count="payload.items.length"
        :page="payload.pagination.page"
        :page-size="payload.pagination.pageSize"
        :pending="resource.viewPending"
        :total="payload.pagination.total"
        @page="requestPage({ page: $event })"
        @page-size="requestPage({ pageSize: $event })"
      />
      <n-skeleton
        v-else
        class="app-skeleton ranking-pagination-skeleton"
        :sharp="false"
        aria-hidden="true"
      />
    </footer>
  </section>
</template>
