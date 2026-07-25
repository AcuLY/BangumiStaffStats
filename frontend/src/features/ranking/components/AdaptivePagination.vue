<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import AppIcon from '../../../shared/components/AppIcon.vue';
import type { RankingPageSize } from '../model';

const props = defineProps<{
  itemCount: number;
  page: number;
  pageSize: RankingPageSize;
  pending?: boolean;
  total: number;
}>();
const emit = defineEmits<{
  page: [page: number];
  pageSize: [pageSize: RankingPageSize];
}>();

const jumpPage = ref(String(props.page));
const pageCount = computed(() =>
  Math.max(1, Math.ceil(props.total / props.pageSize)),
);
const displayPages = computed<readonly (number | 'ellipsis')[]>(() => {
  const count = pageCount.value;
  if (count <= 7) {
    return Array.from({ length: count }, (_, index) => index + 1);
  }
  const current = Math.min(count, Math.max(1, props.page));
  const values = new Set([1, count, current - 1, current, current + 1]);
  const ordered = [...values]
    .filter((value) => value >= 1 && value <= count)
    .sort((left, right) => left - right);
  const pages: (number | 'ellipsis')[] = [];
  for (const value of ordered) {
    const previous = pages.at(-1);
    if (typeof previous === 'number' && value - previous > 1) {
      pages.push('ellipsis');
    }
    pages.push(value);
  }
  return pages;
});
const rangeSummary = computed(() => {
  if (props.itemCount === 0 || props.total === 0) {
    return `0—0 / ${props.total}`;
  }
  const start = (props.page - 1) * props.pageSize + 1;
  return `${start}—${Math.min(start + props.itemCount - 1, props.total)} / ${props.total}`;
});

watch(
  () => props.page,
  (page) => {
    jumpPage.value = String(page);
  },
);

function requestPage(page: number): void {
  if (
    Number.isInteger(page) &&
    page >= 1 &&
    page <= pageCount.value &&
    page !== props.page
  ) {
    emit('page', page);
  }
}

function changePageSize(event: Event): void {
  emit(
    'pageSize',
    Number((event.target as HTMLSelectElement).value) as RankingPageSize,
  );
}

function jump(): void {
  const page = Number(jumpPage.value);
  if (!Number.isInteger(page)) {
    jumpPage.value = String(props.page);
    return;
  }
  requestPage(Math.min(pageCount.value, Math.max(1, page)));
}
</script>

<template>
  <nav class="ranking-pagination" aria-label="人物排行分页">
    <span class="ranking-pagination__summary">{{ rangeSummary }}</span>

    <div class="ranking-pagination__pages">
      <button
        type="button"
        :disabled="page <= 1"
        aria-label="上一页"
        @click="requestPage(page - 1)"
      >
        <app-icon name="chevron-left" :size="16" />
      </button>
      <template v-for="(entry, index) in displayPages" :key="`${entry}-${index}`">
        <span v-if="entry === 'ellipsis'" class="ranking-pagination__ellipsis">
          …
        </span>
        <button
          v-else
          type="button"
          :aria-current="entry === page ? 'page' : undefined"
          :class="{ 'is-current': entry === page }"
          @click="requestPage(entry)"
        >
          {{ entry }}
        </button>
      </template>
      <button
        type="button"
        :disabled="page >= pageCount"
        aria-label="下一页"
        @click="requestPage(page + 1)"
      >
        <app-icon name="chevron-right" :size="16" />
      </button>
    </div>

    <div class="ranking-pagination__compact" aria-hidden="true">
      <span>{{ page }} / {{ pageCount }}</span>
    </div>

    <label class="ranking-page-size">
      <span class="sr-only">每页人数</span>
      <select :value="pageSize" @change="changePageSize">
        <option :value="5">每页 5 人</option>
        <option :value="10">每页 10 人</option>
        <option :value="20">每页 20 人</option>
      </select>
    </label>

    <form class="ranking-page-jump" @submit.prevent="jump">
      <label>
        <span>前往</span>
        <input
          v-model="jumpPage"
          inputmode="numeric"
          pattern="[0-9]*"
          aria-label="前往页码"
        />
      </label>
      <button type="submit" :disabled="pending">跳转</button>
    </form>
  </nav>
</template>
