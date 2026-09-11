<script setup lang="ts">
import { NTag, NTooltip } from 'naive-ui';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';

const props = defineProps<{ labels: readonly string[] }>();
const root = ref<HTMLElement | null>(null);
const open = ref(false);
const clipped = ref(props.labels.length > 2);
const labelLimits = ref<number[]>([]);
const tooltipId = `co-star-credits-${useId()}`;
const hiddenCount = computed(() => Math.max(0, props.labels.length - 2));
let observer: ResizeObserver | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let measureFrame = 0;

function measure(): void {
  const px = (value: string) => Number.parseFloat(value) || 0;
  const limits = Array.from(root.value?.querySelectorAll<HTMLElement>('.credit-list__row') ?? [], (row) => {
    const tag = row.querySelector<HTMLElement>('.co-star-participant-credit')!;
    const more = row.querySelector<HTMLElement>('.credit-list__more');
    const style = getComputedStyle(tag);
    const padding = px(style.paddingLeft) + px(style.paddingRight)
      + px(style.borderLeftWidth) + px(style.borderRightWidth);
    const extra = more ? more.getBoundingClientRect().width + px(getComputedStyle(row).columnGap) : 0;
    return Math.max(0, row.clientWidth - padding - extra);
  });
  if (limits.length !== labelLimits.value.length || limits.some((value, index) => Math.abs(value - labelLimits.value[index]!) > 0.5)) {
    labelLimits.value = limits;
  }
  clipped.value = hiddenCount.value > 0 || Array.from(
    root.value?.querySelectorAll<HTMLElement>('.credit-list__label') ?? [],
  ).some((label, index) => label.scrollWidth > Math.min(label.clientWidth, limits[index] ?? label.clientWidth) + 1);
  if (!clipped.value) close();
}

function show(): void {
  clearTimeout(closeTimer);
  measure();
  open.value = clipped.value;
}

function close(): void {
  clearTimeout(closeTimer);
  open.value = false;
}

function leave(): void {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(close, 100);
}

onMounted(() => {
  if (typeof ResizeObserver === 'function' && root.value) {
    observer = new ResizeObserver(() => {
      if (typeof requestAnimationFrame !== 'function') { measure(); return; }
      cancelAnimationFrame(measureFrame);
      measureFrame = requestAnimationFrame(measure);
    });
    observer.observe(root.value);
  }
  void document.fonts?.ready.then(measure);
  measure();
});
watch(() => props.labels, async () => { close(); await nextTick(); measure(); });
onBeforeUnmount(() => {
  observer?.disconnect();
  clearTimeout(closeTimer);
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(measureFrame);
});
</script>

<template>
  <n-tooltip :show="open" trigger="manual" placement="top" :animated="false"
    style="max-width: min(336px, calc(100dvw - 24px));" content-class="workbench-tooltip-content">
    <template #trigger>
      <div ref="root" class="credit-list" :tabindex="clipped ? 0 : undefined"
        :aria-label="`完整参与身份：${labels.join('；')}`" :aria-describedby="open ? tooltipId : undefined"
        @mouseenter="show" @mouseleave="leave" @focus="show" @blur="close" @click="show"
        @keydown.enter.prevent="show" @keydown.space.prevent="show" @keydown.esc.stop.prevent="close">
        <div v-for="(label, index) in labels.slice(0, 2)" :key="index" class="credit-list__row">
          <n-tag class="co-star-participant-credit" data-provenance="exact" size="small" round style="max-width: 100%">
            <span class="credit-list__label" :style="{ maxWidth: labelLimits[index] === undefined ? undefined : `${labelLimits[index]}px` }">{{ label }}</span>
          </n-tag>
          <span v-if="index === 1 && hiddenCount" class="credit-list__more">… +{{ hiddenCount }}</span>
        </div>
      </div>
    </template>
    <ul :id="tooltipId" class="credit-list__full" @mouseenter="show" @mouseleave="leave">
      <li v-for="(label, index) in labels" :key="index">
        <n-tag size="small" round style="height: auto; min-height: 22px; max-width: 100%">
          <span class="credit-list__full-label">{{ label }}</span>
        </n-tag>
      </li>
    </ul>
  </n-tooltip>
</template>

<style scoped>
.credit-list { min-width: 0; display: grid; gap: var(--space-1); }
.credit-list[tabindex="0"] { min-height: var(--touch-target); align-content: center; }
.credit-list:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.credit-list__row { min-width: 0; display: flex; align-items: center; gap: var(--space-1); }
.credit-list__label { min-width: 0; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.credit-list__more { flex: none; font-size: var(--text-caption); color: var(--text-2); }
.credit-list__full { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
.credit-list__full-label { white-space: normal; overflow-wrap: anywhere; font-weight: 400; }
</style>
