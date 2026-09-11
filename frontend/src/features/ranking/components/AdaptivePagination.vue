<script setup lang="ts">
import {
  NPagination,
  type PaginationInfo,
  type PaginationProps,
  type PaginationRenderLabel,
} from 'naive-ui';
import {
  computed,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import AppIcon from '../../../shared/components/AppIcon.vue';
import { useCompactLayout } from '../../../shared/composables/useCompactLayout';
import type { RankingPageSize } from '../model';

const props = withDefaults(
  defineProps<{
    ariaLabel?: string;
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
// Naive Pagination renders its Select and Input one size below its own size.
const toolsSize = computed(() => (compact.value ? 'medium' : 'large'));
const pageThemeOverrides: NonNullable<
  PaginationProps['themeOverrides']
> = {
  itemMarginMedium: '0 0 0 10px',
  itemMarginMediumRtl: '0 10px 0 0',
  itemMarginSmall: '0 0 0 16px',
  itemMarginSmallRtl: '0 16px 0 0',
  itemPaddingMedium: '0',
  itemPaddingSmall: '0',
  itemSizeMedium: '34px',
  itemSizeSmall: '28px',
};
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

function renderPrevious(info: PaginationInfo) {
  const atFirstPage = info.page <= 1;
  const disabled = props.pending || atFirstPage;
  return h(
    'button',
    {
      'aria-label': atFirstPage
        ? '上一页，已到第一页'
        : `上一页，前往第 ${info.page - 1} 页`,
      class:
        'adaptive-pagination__button adaptive-pagination__button--previous',
      disabled,
      type: 'button',
    },
    [h(AppIcon, { name: 'chevron-left', size: 16 })],
  );
}

function renderNext(info: PaginationInfo) {
  const atLastPage = info.page >= info.pageCount;
  const disabled = props.pending || atLastPage;
  return h(
    'button',
    {
      'aria-label': atLastPage
        ? '下一页，已到最后一页'
        : `下一页，前往第 ${info.page + 1} 页`,
      class: 'adaptive-pagination__button adaptive-pagination__button--next',
      disabled,
      type: 'button',
    },
    [h(AppIcon, { name: 'chevron-right', size: 16 })],
  );
}

const renderLabel: PaginationRenderLabel = (info) => {
  if (info.type === 'page') {
    const pageNumber = info.node;
    return h(
      'button',
      {
        'aria-current': info.active ? 'page' : undefined,
        'aria-label': info.active
          ? `第 ${pageNumber} 页，当前页`
          : `前往第 ${pageNumber} 页`,
        class: 'adaptive-pagination__button adaptive-pagination__button--page',
        disabled: props.pending || info.active,
        type: 'button',
      },
      String(pageNumber),
    );
  }

  const backward = info.type === 'fast-backward';
  return h(
    'button',
    {
      'aria-label': backward ? '向前跳转多页' : '向后跳转多页',
      class: [
        'adaptive-pagination__button',
        'adaptive-pagination__button--fast-jump',
        info.active && 'is-active',
      ],
      disabled: props.pending,
      type: 'button',
    },
    [
      h(
        'span',
        {
          'aria-hidden': 'true',
          class: 'adaptive-pagination__fast-jump-icon',
        },
        [info.node],
      ),
    ],
  );
};

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
        :disabled="pending"
        :theme-overrides="pageThemeOverrides"
        :prev="renderPrevious"
        :next="renderNext"
        :label="renderLabel"
        @update:page="emit('page', $event)"
      />
    </div>
    <n-pagination
      class="adaptive-pagination__control adaptive-pagination__control--tools"
      :size="toolsSize"
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

<style scoped>
.adaptive-pagination__pages {
  padding-inline-end: 0;
}
</style>
