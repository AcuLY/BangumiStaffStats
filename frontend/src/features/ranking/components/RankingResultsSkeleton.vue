<script setup lang="ts">
import { NFlex, NSkeleton, NStatistic } from 'naive-ui';
import { computed } from 'vue';

import { useCompactLayout } from '../../../shared/composables/useCompactLayout';
import type { RankingView } from '../model';
import RankingListSkeleton from './RankingListSkeleton.vue';
import RankingToolbar from './RankingToolbar.vue';

const props = withDefaults(
  defineProps<{
    pageSize?: RankingView['pageSize'];
    personal?: boolean;
    hasCharacterCount?: boolean;
    view?: Readonly<RankingView>;
    workUnit?: 'series' | 'subject';
  }>(),
  {
    pageSize: 10,
    personal: false,
    hasCharacterCount: false,
    workUnit: 'subject',
  },
);

const compact = useCompactLayout();
const statisticThemeOverrides = computed(() => ({
  valueFontSize: props.hasCharacterCount ? '1rem' : compact.value ? '1.125rem' : '1.25rem',
}));
const pendingView = computed<Readonly<RankingView>>(() => props.view ?? {
  order: 'desc',
  page: 1,
  pageSize: props.pageSize,
  search: '',
  sort: props.personal ? 'preference' : 'count',
});
</script>

<template>
  <section
    class="ranking-surface ranking-pane surface-panel ranking-surface--loading"
    aria-busy="true"
  >
    <span class="sr-only" role="status" aria-live="polite">
      正在加载人物排行
    </span>

    <header class="ranking-surface__header ranking-controls">
      <div class="ranking-result-stats ranking-skeleton__summary">
        <n-flex
          class="ranking-result-stats__line"
          :size="hasCharacterCount ? 2 : 4"
          align="flex-end"
          :wrap="false"
        >
          <n-statistic
            label="共统计到"
            tabular-nums
            :theme-overrides="statisticThemeOverrides"
          >
            <n-skeleton
              class="app-skeleton ranking-skeleton__number"
              width="32px"
              height="1em"
              :sharp="false"
              aria-hidden="true"
            />
            <template #suffix> 个人物，</template>
          </n-statistic>
          <n-statistic
            :label="'\u200B'"
            tabular-nums
            :theme-overrides="statisticThemeOverrides"
          >
            <n-skeleton
              class="app-skeleton ranking-skeleton__number"
              width="32px"
              height="1em"
              :sharp="false"
              aria-hidden="true"
            />
            <template #suffix>
              {{ workUnit === 'series' ? ' 个系列' : ' 个条目' }}
              <template v-if="hasCharacterCount">，</template>
            </template>
          </n-statistic>
          <n-statistic v-if="hasCharacterCount" :label="'\u200B'" tabular-nums :theme-overrides="statisticThemeOverrides">
            <n-skeleton class="app-skeleton ranking-skeleton__number" width="32px" height="1em" :sharp="false" aria-hidden="true" />
            <template #suffix> 个角色</template>
          </n-statistic>
        </n-flex>
      </div>
      <ranking-toolbar
        disabled
        :personal="personal"
        :search="pendingView.search"
        :view="pendingView"
        :work-unit="workUnit"
      />
    </header>

    <div
      class="ranking-surface__body ranking-list-scroll"
      aria-hidden="true"
    >
      <ranking-list-skeleton
        :page-size="pageSize"
        :personal="personal"
        :work-unit="workUnit"
      />
    </div>
  </section>
</template>

<style scoped>
.ranking-skeleton__summary {
  display: block;
  min-height: 0;
}

.ranking-skeleton__number {
  display: inline-block;
  vertical-align: baseline;
}
</style>
