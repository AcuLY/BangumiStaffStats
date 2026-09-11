<script setup lang="ts">
import { NScrollbar } from 'naive-ui';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { useCompactLayout } from '../shared/composables/useCompactLayout';
import { shellScrollbarThemeOverrides } from './themeOverrides';

const props = withDefaults(defineProps<{ targetWindow?: Window }>(), {
  targetWindow: () => window,
});
const compact = useCompactLayout(props.targetWindow);
const header = ref<HTMLElement | null>(null);
const headerHeight = ref<number | null>(null);
let headerObserver: ResizeObserver | undefined;

const scrollbarTheme = computed(() => ({
  ...shellScrollbarThemeOverrides,
  height: compact.value ? '6px' : '10px',
  width: compact.value ? '6px' : '10px',
  railInsetVerticalRight: `${headerHeight.value ?? (compact.value ? 55 : 59)}px 0 0 auto`,
}));

function measureHeader(): void {
  const height = header.value?.getBoundingClientRect().height;
  if (!height || height === headerHeight.value) return;
  headerHeight.value = height;
}

onMounted(() => {
  measureHeader();
  const Observer = (props.targetWindow as Window & typeof globalThis).ResizeObserver;
  if (Observer && header.value) {
    headerObserver = new Observer(measureHeader);
    headerObserver.observe(header.value);
  }
});

onBeforeUnmount(() => headerObserver?.disconnect());
</script>

<template>
  <div
    class="app-shell"
    :style="headerHeight === null ? undefined : { '--app-header-height': `${headerHeight}px` }"
  >
    <header ref="header" class="app-header"><slot name="header" /></header>
    <n-scrollbar
      class="app-page-scroll"
      content-class="app-page-content"
      trigger="none"
      :theme-overrides="scrollbarTheme"
    >
      <slot />
    </n-scrollbar>
  </div>
</template>
