<script setup lang="ts">
import { NInput, NSelect } from 'naive-ui';
import { computed } from 'vue';

import { useCompactLayout } from '../../query/composables/useCompactLayout';
import type {
  RankingOrder,
  RankingSort,
  RankingView,
} from '../model';
import SortDirectionButton from './SortDirectionButton.vue';

const props = defineProps<{
  personal: boolean;
  search: string;
  view: Readonly<RankingView>;
  workUnit: 'series' | 'subject';
}>();
const emit = defineEmits<{
  order: [order: RankingOrder];
  search: [search: string];
  searchNow: [];
  sort: [sort: RankingSort];
}>();

const compact = useCompactLayout();
const controlSize = computed(() => (compact.value ? 'small' : 'medium'));
const sortOptions = computed(() => [
  {
    label: props.workUnit === 'series' ? '系列数' : '作品数',
    value: 'count',
  },
  { label: '均分', value: 'average' },
  { label: '综合分', value: 'overall' },
  ...(props.personal
    ? [{ label: '相对偏好', value: 'preference' }]
    : []),
]);
</script>

<template>
  <form class="ranking-toolbar" role="search" @submit.prevent="emit('searchNow')">
    <n-input
      class="ranking-search-control"
      :size="controlSize"
      :value="search"
      :clearable="Boolean(search)"
      placeholder="搜索人物"
      autocomplete="off"
      aria-label="搜索排行人物"
      :input-props="{
        'aria-label': '搜索排行人物',
        name: 'ranking-search',
        spellcheck: 'false',
      }"
      @update:value="emit('search', $event)"
    />

    <n-select
      class="ranking-sort-control"
      :size="controlSize"
      :menu-size="controlSize"
      :value="view.sort"
      :options="sortOptions"
      :consistent-menu-width="false"
      aria-label="人物排序规则"
      @update:value="emit('sort', $event as RankingSort)"
    />

    <sort-direction-button
      :order="view.order"
      context-label="人物排行排序方向"
      @change="emit('order', $event)"
    />
  </form>
</template>
