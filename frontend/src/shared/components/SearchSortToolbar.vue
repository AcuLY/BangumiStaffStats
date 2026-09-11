<script setup lang="ts" generic="Sort extends string">
import { NInput, NSelect, type InputInst } from 'naive-ui';
import { computed, ref } from 'vue';

import { useCompactLayout } from '../composables/useCompactLayout';
import AppIcon from './AppIcon.vue';
import SortDirectionButton from './SortDirectionButton.vue';

const props = withDefaults(
  defineProps<{
    search: string;
    sort: Sort;
    order: 'asc' | 'desc';
    options: readonly { label: string; value: Sort }[];
    searchLabel: string;
    sortLabel: string;
    orderLabel?: string;
    placeholder?: string;
    searchName?: string;
    searchIcon?: boolean;
    disabled?: boolean;
    searchClass?: string;
    sortClass?: string;
    orderClass?: string;
  }>(),
  {
    orderLabel: '排序方向',
    placeholder: '搜索人物',
    searchClass: 'ranking-search-control',
    sortClass: 'ranking-sort-control',
  },
);
const emit = defineEmits<{
  search: [value: string];
  sort: [value: Sort];
  order: [value: 'asc' | 'desc'];
  submit: [];
}>();

const compact = useCompactLayout();
const controlSize = computed<'small' | 'medium'>(() =>
  compact.value ? 'small' : 'medium',
);
const selectOptions = computed(() => [...props.options]);
const sortOptionWidth = computed(() => {
  const characters = Math.max(
    1,
    ...props.options.map((option) => Array.from(option.label).length),
  );
  // Labels are Chinese; reserve the select's padding, arrow, and border as well.
  return `calc(${characters}ic + 40px)`;
});
const searchInput = ref<InputInst | null>(null);
const inputElRef = computed(() => searchInput.value?.inputElRef ?? null);

defineExpose({ inputElRef });
</script>

<template>
  <form
    class="search-sort-toolbar"
    role="search"
    :style="{
      '--search-sort-control-height': compact ? '28px' : '34px',
      '--search-sort-select-width': sortOptionWidth,
    }"
    @submit.prevent="emit('submit')"
  >
    <n-input
      ref="searchInput"
      :class="['search-sort-toolbar__search', searchClass]"
      :size="controlSize"
      :value="search"
      :clearable="Boolean(search)"
      :placeholder="placeholder"
      :disabled="disabled"
      autocomplete="off"
      :aria-label="searchLabel"
      :input-props="{
        'aria-label': searchLabel,
        name: searchName,
        spellcheck: 'false',
      }"
      @update:value="emit('search', $event)"
    >
      <template v-if="searchIcon" #prefix>
        <app-icon class="search-sort-toolbar__search-icon" name="search" :size="16" />
      </template>
    </n-input>

    <div class="search-sort-toolbar__controls">
      <div class="search-sort-toolbar__filters">
        <slot name="filters" :size="controlSize" />
      </div>

      <n-select
        :class="['search-sort-toolbar__sort', sortClass]"
        :style="{ width: 'var(--search-sort-select-width)' }"
        :size="controlSize"
        :menu-size="controlSize"
        :value="sort"
        :options="selectOptions"
        :disabled="disabled"
        :consistent-menu-width="false"
        :aria-label="sortLabel"
        @update:value="emit('sort', $event as Sort)"
      />

      <sort-direction-button
        :class="['search-sort-toolbar__order', orderClass]"
        :size="controlSize"
        :order="order"
        :disabled="disabled"
        :context-label="orderLabel"
        @change="emit('order', $event)"
      />
    </div>
  </form>
</template>

<style scoped>
.search-sort-toolbar {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) var(--search-sort-select-width) auto;
  align-items: center;
  gap: var(--space-2);
}

.search-sort-toolbar__controls {
  display: contents;
}

.search-sort-toolbar__filters {
  display: none;
}

/* Keep the last three controls together when their combined width needs a row. */
.search-sort-toolbar:has(.search-sort-toolbar__filters > *) {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
}

.search-sort-toolbar:has(.search-sort-toolbar__filters > *) .search-sort-toolbar__search {
  flex: 1 1 var(--search-sort-search-basis, 11rem);
  min-width: 0;
}

.search-sort-toolbar:has(.search-sort-toolbar__filters > *) .search-sort-toolbar__controls {
  display: flex;
  flex: var(--search-sort-controls-grow, 1) 1 calc(var(--search-sort-filter-width, 6ic + 40px) + var(--search-sort-select-width) + 80px + 2 * var(--space-2));
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
}

.search-sort-toolbar__filters:has(> *) {
  display: block;
  flex: 1 1 0;
  min-width: 0;
}

.search-sort-toolbar__sort {
  flex: 0 0 var(--search-sort-select-width);
}

.search-sort-toolbar__order {
  flex: 0 0 80px;
}

.search-sort-toolbar__search,
.search-sort-toolbar__controls > :deep(:not(.search-sort-toolbar__filters)),
.search-sort-toolbar__filters > :deep(*) {
  position: relative;
  min-height: 0;
}

.search-sort-toolbar :deep(input) {
  min-height: 0;
}

.search-sort-toolbar__search::before,
.search-sort-toolbar__controls > :deep(:not(.search-sort-toolbar__filters))::before,
.search-sort-toolbar__filters > :deep(*)::before {
  position: absolute;
  inset-block: calc(
    (var(--touch-target) - var(--search-sort-control-height)) / -2
  );
  inset-inline: 0;
  content: "";
}

.search-sort-toolbar .search-sort-toolbar__search-icon {
  position: static;
  inset: auto;
}
</style>
