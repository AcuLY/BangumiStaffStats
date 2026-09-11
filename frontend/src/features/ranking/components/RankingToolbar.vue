<script setup lang="ts">
import { computed } from 'vue';

import SearchSortToolbar from '../../../shared/components/SearchSortToolbar.vue';
import type {
  RankingOrder,
  RankingSort,
  RankingView,
} from '../model';

const props = defineProps<{
  disabled?: boolean;
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
  <search-sort-toolbar
    class="ranking-toolbar"
    :disabled="disabled"
    :search="search"
    :sort="view.sort"
    :order="view.order"
    :options="sortOptions"
    search-label="搜索排行人物"
    search-name="ranking-search"
    sort-label="人物排序规则"
    order-label="人物排行排序方向"
    @search="emit('search', $event)"
    @sort="emit('sort', $event as RankingSort)"
    @order="emit('order', $event)"
    @submit="emit('searchNow')"
  />
</template>
