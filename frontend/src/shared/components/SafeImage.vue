<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import AppIcon from './AppIcon.vue';

export type SafeImageState = 'error' | 'loaded' | 'loading' | 'missing';

const props = withDefaults(
  defineProps<{
    alt: string;
    decorative?: boolean;
    loading?: 'eager' | 'lazy';
    sources?: readonly string[];
    timeoutMs?: number;
    width: number;
  }>(),
  {
    decorative: false,
    loading: 'lazy',
    sources: () => [],
    timeoutMs: 10_000,
  },
);

const sourceIndex = ref(0);
const loaded = ref(false);
let timeoutId: number | undefined;
const safeProxyReference =
  /^\/api\/v1\/images\/bangumi\/(?:subjects|persons|characters)\/[1-9][0-9]*\?type=(?:small|grid|large|medium|common)$/;
const sources = computed(() =>
  Object.freeze([
    ...new Set(
      props.sources.filter((source) => safeProxyReference.test(source)),
    ),
  ]),
);
const sourceKey = computed(() => sources.value.join('\u0000'));
const currentSource = computed(() => sources.value[sourceIndex.value] ?? null);
const state = computed<SafeImageState>(() => {
  if (sources.value.length === 0) {
    return 'missing';
  }
  if (currentSource.value === null) {
    return 'error';
  }
  return loaded.value ? 'loaded' : 'loading';
});
const height = computed(() => Math.round((props.width * 4) / 3));
const fallbackLabel = computed(() => {
  if (state.value === 'loading') {
    return `${props.alt} 图片加载中`;
  }
  if (state.value === 'error') {
    return `${props.alt} 图片加载失败`;
  }
  return `${props.alt} 暂无图片`;
});
const fallbackRole = computed(() => {
  if (props.decorative) {
    return undefined;
  }
  return state.value === 'loading' ? 'status' : 'img';
});

function clearSourceTimeout(): void {
  if (timeoutId !== undefined) {
    window.clearTimeout(timeoutId);
    timeoutId = undefined;
  }
}

function scheduleSourceTimeout(): void {
  clearSourceTimeout();
  if (!currentSource.value || loaded.value) {
    return;
  }
  const timeoutMs = Math.min(30_000, Math.max(1, props.timeoutMs));
  timeoutId = window.setTimeout(tryNextSource, timeoutMs);
}

watch(sourceKey, () => {
  clearSourceTimeout();
  sourceIndex.value = 0;
  loaded.value = false;
  scheduleSourceTimeout();
});

function markLoaded(): void {
  loaded.value = true;
  clearSourceTimeout();
}

function tryNextSource(): void {
  clearSourceTimeout();
  loaded.value = false;
  sourceIndex.value += 1;
}

watch(
  currentSource,
  () => {
    loaded.value = false;
    scheduleSourceTimeout();
  },
  { immediate: true },
);

onBeforeUnmount(clearSourceTimeout);
</script>

<template>
  <span
    class="safe-image"
    :data-image-state="state"
    :style="{
      '--safe-image-width': `${width}px`,
      '--safe-image-height': `${height}px`,
    }"
  >
    <span
      v-if="state !== 'loaded'"
      class="safe-image__fallback"
      :class="`safe-image__fallback--${state}`"
      :role="fallbackRole"
      :aria-label="decorative ? undefined : fallbackLabel"
      :aria-hidden="decorative ? 'true' : undefined"
    >
      <app-icon name="person" :size="Math.min(24, width * 0.56)" />
    </span>
    <img
      v-if="currentSource"
      :key="currentSource"
      :src="currentSource"
      :alt="decorative ? '' : alt"
      :loading="loading"
      :width="width"
      :height="height"
      decoding="async"
      referrerpolicy="no-referrer"
      :class="{ 'is-loaded': state === 'loaded' }"
      @load="markLoaded"
      @error="tryNextSource"
    />
  </span>
</template>
