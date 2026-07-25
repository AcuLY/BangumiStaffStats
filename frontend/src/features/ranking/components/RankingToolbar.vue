<script setup lang="ts">
import AppIcon from '../../../shared/components/AppIcon.vue';
import type {
  RankingOrder,
  RankingSort,
  RankingView,
} from '../model';
import SortDirectionButton from './SortDirectionButton.vue';

defineProps<{
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

function inputSearch(event: Event): void {
  emit('search', (event.target as HTMLInputElement).value);
}

function selectSort(event: Event): void {
  emit('sort', (event.target as HTMLSelectElement).value as RankingSort);
}
</script>

<template>
  <form class="ranking-toolbar" role="search" @submit.prevent="emit('searchNow')">
    <label class="ranking-search-control">
      <span class="sr-only">搜索排行人物</span>
      <app-icon name="search" :size="16" />
      <input
        :value="search"
        type="search"
        name="ranking-search"
        autocomplete="off"
        placeholder="搜索人物"
        @input="inputSearch"
      />
    </label>

    <label class="ranking-sort-control">
      <span class="sr-only">人物排序规则</span>
      <select :value="view.sort" @change="selectSort">
        <option value="count">
          {{ workUnit === 'series' ? '系列数' : '作品数' }}
        </option>
        <option value="average">均分</option>
        <option value="overall">综合分</option>
        <option v-if="personal" value="preference">相对偏好</option>
      </select>
    </label>

    <sort-direction-button :order="view.order" @change="emit('order', $event)" />
  </form>
</template>
