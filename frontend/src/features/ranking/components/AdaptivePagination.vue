<script setup lang="ts">
import { NPagination } from 'naive-ui';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { useCompactLayout } from '../../query/composables/useCompactLayout';
import type { RankingPageSize } from '../model';

const props = withDefaults(
  defineProps<{
    ariaLabel?: string;
    itemCount: number;
    page: number;
    pageSize: RankingPageSize;
    pageSizeLabel?: string;
    pageSizeUnit?: string;
    pending?: boolean;
    total: number;
  }>(),
  {
    ariaLabel: '人物排行分页',
    pageSizeLabel: '每页人数',
    pageSizeUnit: '人',
    pending: false,
  },
);
const emit = defineEmits<{
  page: [page: number];
  pageSize: [pageSize: RankingPageSize];
}>();

const compact = useCompactLayout();
const controlSize = computed(() => (compact.value ? 'small' : 'medium'));
const pagesContainer = ref<HTMLElement | null>(null);
const pageSlot = ref(9);
let resizeObserver: ResizeObserver | null = null;
let slotSyncId = 0;
const pageCount = computed(() =>
  Math.max(1, Math.ceil(props.total / props.pageSize)),
);
const pageSizes = computed(() =>
  ([5, 10, 20] as const).map((value) => ({
    label: `每页 ${value} ${props.pageSizeUnit}`,
    value,
  })),
);
const rangeSummary = computed(() => {
  if (props.itemCount === 0 || props.total === 0) {
    return `0—0 / ${props.total}`;
  }
  const start = (props.page - 1) * props.pageSize + 1;
  return `${start}—${Math.min(start + props.itemCount - 1, props.total)} / ${props.total}`;
});

async function syncPageSlot(): Promise<void> {
  const syncId = ++slotSyncId;
  pageSlot.value = 9;
  await nextTick();
  const container = pagesContainer.value;
  const pagination = container?.firstElementChild as HTMLElement | null;
  if (!container || !pagination) {
    return;
  }
  const paginationOverflows = () => {
    const first = pagination.firstElementChild;
    const last = pagination.lastElementChild;
    if (!first || !last) {
      return false;
    }
    const firstRect = first.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();
    return lastRect.right - firstRect.left > container.clientWidth + 1;
  };
  while (
    syncId === slotSyncId &&
    pageSlot.value > 3 &&
    paginationOverflows()
  ) {
    pageSlot.value -= 2;
    await nextTick();
  }
}

onMounted(() => {
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => void syncPageSlot());
    if (pagesContainer.value) {
      resizeObserver.observe(pagesContainer.value);
    }
  }
  void syncPageSlot();
});

watch(
  () => [props.page, props.pageSize, props.total, controlSize.value],
  () => void syncPageSlot(),
);

onBeforeUnmount(() => {
  slotSyncId += 1;
  resizeObserver?.disconnect();
});
</script>

<template>
  <nav class="ranking-pagination adaptive-pagination" :aria-label="ariaLabel">
    <span
      class="ranking-pagination__summary adaptive-pagination__summary"
      role="status"
      aria-live="polite"
    >{{ rangeSummary }}</span>
    <div
      ref="pagesContainer"
      class="ranking-pagination__pages adaptive-pagination__pages"
    >
      <n-pagination
        class="adaptive-pagination__control adaptive-pagination__control--pages"
        :size="controlSize"
        :page="page"
        :page-size="pageSize"
        :item-count="total"
        :page-slot="pageSlot"
        :display-order="['pages']"
        @update:page="emit('page', $event)"
      />
    </div>
    <n-pagination
      class="adaptive-pagination__control adaptive-pagination__control--tools"
      :size="controlSize"
      :page="page"
      :page-size="pageSize"
      :item-count="total"
      :page-sizes="pageSizes"
      :display-order="['size-picker', 'quick-jumper']"
      show-size-picker
      show-quick-jumper
      :disabled="pending"
      :aria-label="pageSizeLabel"
      @update:page="emit('page', $event)"
      @update:page-size="
        emit('pageSize', $event as RankingPageSize)
      "
    >
      <template #goto><span>跳至</span></template>
    </n-pagination>
    <span class="sr-only">{{ page }} / {{ pageCount }}</span>
  </nav>
</template>
