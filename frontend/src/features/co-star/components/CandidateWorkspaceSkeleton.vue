<script setup lang="ts">
import { NSelect } from 'naive-ui';

import SearchSortToolbar from '../../../shared/components/SearchSortToolbar.vue';
import CandidateRowsSkeleton from './CandidateRowsSkeleton.vue';

withDefaults(defineProps<{ pageSize?: number; compact?: boolean; workUnit?: 'series' | 'subject' }>(), {
  pageSize: 20,
  compact: false,
  workUnit: 'subject',
});
</script>

<template>
  <section class="co-star-candidate-workspace candidate-workspace-skeleton" :class="{ 'is-compact': compact }" aria-busy="true" aria-label="候选人物">
    <span class="sr-only" role="status">正在加载候选人物</span>
    <div class="co-star-candidate-layout">
      <div class="co-star-candidate-rail">
        <div class="candidate-picker">
          <section class="candidate-browser">
            <div class="candidate-browser__heading"><strong>候选人物</strong></div>
            <div class="candidate-position-results">
              <search-sort-toolbar
                class="candidate-toolbar"
                search=""
                sort="count"
                order="desc"
                :options="[{ label: workUnit === 'series' ? '系列数' : '作品数', value: 'count' }]"
                search-label="搜索候选人物"
                search-class="candidate-search-control"
                sort-label="候选人物排序"
                sort-class="candidate-sort-select"
                order-class="candidate-sort-direction"
                search-icon
                disabled
              >
                <template #filters="{ size }">
                  <n-select value="all" :options="[{ label: '全部职位', value: 'all' }]" :size="size" :menu-size="size" disabled loading aria-label="候选职位正在加载" />
                </template>
              </search-sort-toolbar>
              <candidate-rows-skeleton :count="pageSize" />
            </div>
          </section>
        </div>
      </div>
      <section v-if="$slots.analysis" class="co-star-analysis-main" aria-label="共演分析" aria-busy="true">
        <slot name="analysis" />
      </section>
    </div>
  </section>
</template>

<style src="../co-star.css"></style>
