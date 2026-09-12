<script setup lang="ts">
import { NTag, NTooltip } from 'naive-ui';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';

import { packAdaptiveAppearanceRows, type AdaptiveAppearanceRow } from '../adaptiveAppearanceLayout';
import { primaryEntityName, type PersonDetailContribution } from '../model';

type CastContribution = Extract<PersonDetailContribution, { kind: 'cast' }>;
const props = defineProps<{ contributions: readonly CastContribution[] }>();
const root = ref<HTMLElement | null>(null);
const rows = ref<AdaptiveAppearanceRow[]>([]);
const tooltipOpen = ref(false);
const tooltipId = `cast-roles-${useId()}`;
let observer: ResizeObserver | undefined;
let measureFrame = 0;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

const rolePriority: Record<CastContribution['roleLabel'], number> = {
  主役: 6,
  配角: 5,
  客串: 4,
  闲角: 3,
  旁白: 2,
  声库: 1,
};
const entries = computed(() =>
  props.contributions
    .map((contribution, index) => ({
      contribution,
      index,
      name: primaryEntityName(contribution.character),
      count: 'workCount' in contribution ? contribution.workCount : undefined,
    }))
    .sort((left, right) =>
      rolePriority[right.contribution.roleLabel] - rolePriority[left.contribution.roleLabel]
      || left.index - right.index,
    ),
);
const hiddenCount = computed(() => rows.value.find((row) => row.hiddenCount)?.hiddenCount ?? 0);
const fullLabel = computed(() => entries.value.map((entry) =>
  `${entry.name} ${entry.contribution.roleLabel}${entry.count ? `，参与 ${entry.count} 部` : ''}`,
).join('；'));

function fallbackRows(): AdaptiveAppearanceRow[] {
  return entries.value.slice(0, 2).map((_, index) => ({
    entries: [index],
    ...(index === 1 && entries.value.length > 2 ? { hiddenCount: entries.value.length - 2 } : {}),
  }));
}

function measure(): void {
  const element = root.value;
  const copies = element?.querySelectorAll<HTMLElement>('[data-role-measure]');
  const more = element?.querySelector<HTMLElement>('[data-role-more-measure]');
  if (!element?.clientWidth || !copies?.length || !more) {
    rows.value = fallbackRows();
    return;
  }
  rows.value = packAdaptiveAppearanceRows(
    Array.from(copies, (copy) => Math.ceil(copy.getBoundingClientRect().width)),
    element.clientWidth,
    Number.parseFloat(getComputedStyle(element).getPropertyValue('--space-1')) || 4,
    Math.ceil(more.getBoundingClientRect().width),
    2,
  );
  if (!hiddenCount.value) closeTooltip();
}

function scheduleMeasure(): void {
  if (typeof requestAnimationFrame !== 'function') {
    void nextTick().then(measure);
    return;
  }
  cancelAnimationFrame(measureFrame);
  measureFrame = requestAnimationFrame(measure);
}

function clearCloseTimer(): void {
  clearTimeout(closeTimer);
  closeTimer = undefined;
}

function openTooltip(): void {
  clearCloseTimer();
  tooltipOpen.value = hiddenCount.value > 0;
}

function closeTooltip(): void {
  clearCloseTimer();
  tooltipOpen.value = false;
}

function leaveTooltip(): void {
  clearCloseTimer();
  // Keep the complete list reachable when the pointer crosses into its tooltip.
  closeTimer = setTimeout(closeTooltip, 100);
}

watch(entries, async () => {
  closeTooltip();
  rows.value = fallbackRows();
  await nextTick();
  scheduleMeasure();
}, { immediate: true });

onMounted(() => {
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(scheduleMeasure);
    if (root.value) observer.observe(root.value);
  }
  void document.fonts?.ready.then(scheduleMeasure);
  scheduleMeasure();
});

onBeforeUnmount(() => {
  observer?.disconnect();
  clearCloseTimer();
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(measureFrame);
});
</script>

<template>
  <n-tooltip
    :show="tooltipOpen && hiddenCount > 0"
    :disabled="hiddenCount === 0"
    trigger="manual"
    placement="top-start"
    :animated="false"
    style="max-width: min(336px, calc(100dvw - 72px));"
    content-class="workbench-tooltip-content"
    @clickoutside="closeTooltip"
  >
    <template #trigger>
      <ul
        ref="root"
        class="adaptive-role-list"
        :aria-label="`完整配音角色：${fullLabel}`"
        :aria-describedby="tooltipOpen && hiddenCount ? tooltipId : undefined"
        :tabindex="hiddenCount ? 0 : undefined"
        @mouseenter="openTooltip"
        @mouseleave="leaveTooltip"
        @focus="openTooltip"
        @blur="closeTooltip"
        @click="openTooltip"
        @keydown.enter.prevent="openTooltip"
        @keydown.space.prevent="openTooltip"
        @keydown.esc.stop.prevent="closeTooltip"
      >
        <li
          v-for="(row, rowIndex) in rows"
          :key="rowIndex"
          class="adaptive-role-list__row"
          :class="{ 'adaptive-role-list__row--pair': row.entries.length + (row.hiddenCount ? 1 : 0) === 2 }"
        >
          <span v-for="entryIndex in row.entries" :key="entryIndex" class="adaptive-role-list__item">
            <span class="adaptive-role-list__name" :title="entries[entryIndex]!.name">{{ entries[entryIndex]!.name }}</span>
            <n-tag
              class="character-role-tag"
              size="small"
              round
            >
              {{ entries[entryIndex]!.contribution.roleLabel }}
              <span v-if="entries[entryIndex]!.count" class="adaptive-role-list__count">{{ entries[entryIndex]!.count }}</span>
            </n-tag>
          </span>
          <span v-if="row.hiddenCount" class="adaptive-role-list__more">… +{{ row.hiddenCount }}</span>
        </li>
        <li class="adaptive-role-list__measure" aria-hidden="true">
          <span v-for="(entry, index) in entries" :key="index" class="adaptive-role-list__item" data-role-measure>
            <span class="adaptive-role-list__name">{{ entry.name }}</span>
            <n-tag class="character-role-tag" size="small" round>
              {{ entry.contribution.roleLabel }}
              <span v-if="entry.count" class="adaptive-role-list__count">{{ entry.count }}</span>
            </n-tag>
          </span>
          <span class="adaptive-role-list__more" data-role-more-measure>… +{{ entries.length }}</span>
        </li>
      </ul>
    </template>
    <div
      :id="tooltipId"
      class="adaptive-role-tooltip"
      role="list"
      :aria-label="`全部配音角色，共 ${entries.length} 项`"
      @mouseenter="openTooltip"
      @mouseleave="leaveTooltip"
    >
      <span v-for="(entry, index) in entries" :key="index" role="listitem">
        <span class="adaptive-role-tooltip__name">{{ entry.name }}</span>
        <n-tag
          class="character-role-tag"
          size="small"
          round
          :aria-label="entry.count ? `${entry.contribution.roleLabel}，参与 ${entry.count} 部` : undefined"
        >
          {{ entry.contribution.roleLabel }}
          <span v-if="entry.count" class="adaptive-role-list__count" aria-hidden="true">{{ entry.count }}</span>
        </n-tag>
      </span>
    </div>
  </n-tooltip>
</template>

<style scoped>
.adaptive-role-list {
  position: relative;
  display: grid;
  width: 100%;
  min-width: 0;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.adaptive-role-list[tabindex="0"] {
  min-height: 44px;
  align-content: center;
}

.adaptive-role-list:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.adaptive-role-list__row,
.adaptive-role-list__item {
  min-width: 0;
}

.adaptive-role-list__row--pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.adaptive-role-list__row--pair .adaptive-role-list__item:first-child {
  padding-right: var(--space-1);
}

.adaptive-role-list__item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  line-height: 20px;
  white-space: nowrap;
}

.adaptive-role-list__name {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 400;
  text-overflow: ellipsis;
}

.adaptive-role-list__more {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}

.adaptive-role-list__count {
  margin-left: var(--space-1);
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.adaptive-role-list__measure {
  position: absolute;
  inset: 0 auto auto 0;
  display: grid;
  width: 0;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
}

.adaptive-role-list__measure > span {
  width: max-content;
}

.adaptive-role-tooltip {
  display: grid;
  gap: var(--space-1);
}

.adaptive-role-tooltip > span {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
}

.adaptive-role-tooltip__name {
  min-width: 0;
  font-weight: 400;
  overflow-wrap: anywhere;
}
</style>
