<script setup lang="ts">
import { NPopover, NTag } from 'naive-ui';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from 'vue';

import {
  packAdaptiveAppearanceRows,
  type AdaptiveAppearanceRow,
} from '../adaptiveAppearanceLayout';
import {
  primaryEntityName,
  type PersonDetailCharacterItem,
} from '../model';

const props = defineProps<{
  item: PersonDetailCharacterItem;
}>();

const maxVisibleRows = 2;
const root = ref<HTMLElement | null>(null);
const popoverContent = ref<HTMLElement | null>(null);
const rows = ref<AdaptiveAppearanceRow[]>([]);
const overflowOpen = ref(false);
const popoverId = `character-appearances-${useId()}`;
let resizeObserver: ResizeObserver | null = null;
let measureFrame = 0;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

const appearances = computed(() => props.item.appearances);
const hiddenCount = computed(
  () => rows.value.find((row) => row.hiddenCount)?.hiddenCount ?? 0,
);

function fallbackRows(): AdaptiveAppearanceRow[] {
  const count = appearances.value.length;
  if (count <= maxVisibleRows) {
    return appearances.value.map((_, index) => ({
      entries: [index],
    }));
  }
  return [
    { entries: [0] },
    { entries: [1], hiddenCount: count - maxVisibleRows },
  ];
}

function measure(): void {
  const element = root.value;
  if (!element || element.clientWidth <= 0) {
    rows.value = fallbackRows();
    return;
  }
  const copies = Array.from(
    element.querySelectorAll<HTMLElement>(
      '[data-appearance-measure]',
    ),
  );
  const overflow = element.querySelector<HTMLElement>(
    '[data-appearance-more-measure]',
  );
  if (!copies.length || !overflow) {
    rows.value = fallbackRows();
    return;
  }
  const columnGap =
    Number.parseFloat(
      getComputedStyle(element).getPropertyValue('--space-1'),
    ) || 4;
  rows.value = packAdaptiveAppearanceRows(
    copies.map((copy) =>
      Math.ceil(copy.getBoundingClientRect().width),
    ),
    element.clientWidth,
    columnGap,
    Math.ceil(overflow.getBoundingClientRect().width),
    maxVisibleRows,
  );
}

function scheduleMeasure(): void {
  if (typeof requestAnimationFrame !== 'function') {
    void nextTick().then(measure);
    return;
  }
  cancelAnimationFrame(measureFrame);
  measureFrame = requestAnimationFrame(measure);
}

function closeOverflow(): void {
  clearTimeout(closeTimer);
  overflowOpen.value = false;
}

function openOverflow(): void {
  clearTimeout(closeTimer);
  overflowOpen.value = true;
}

function leaveOverflow(): void {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(closeOverflow, 100);
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null;
  if (next && (root.value?.contains(next) || popoverContent.value?.contains(next))) return;
  closeOverflow();
}

function escapePopover(): void {
  root.value?.querySelector<HTMLButtonElement>('.character-role-card__source-more')
    ?.focus({ preventScroll: true });
  closeOverflow();
}

watch(
  appearances,
  async () => {
    rows.value = fallbackRows();
    overflowOpen.value = false;
    await nextTick();
    scheduleMeasure();
  },
  { deep: true, immediate: true },
);

onMounted(() => {
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(scheduleMeasure);
    if (root.value) {
      resizeObserver.observe(root.value);
    }
  }
  void document.fonts?.ready.then(scheduleMeasure);
  scheduleMeasure();
});

onBeforeUnmount(() => {
  clearTimeout(closeTimer);
  resizeObserver?.disconnect();
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(measureFrame);
  }
});
</script>

<template>
  <n-popover
    :show="overflowOpen && hiddenCount > 0"
    :disabled="hiddenCount === 0"
    trigger="manual"
    placement="top-start"
    :animated="false"
    style="max-width: min(336px, calc(100dvw - 72px));"
    content-class="character-role-source-popover"
    @clickoutside="closeOverflow"
  >
    <template #trigger>
      <ul
        ref="root"
        class="person-character-appearances character-role-card__appearances"
        :aria-label="`${primaryEntityName(item.character)}出演 ${item.workCount} 部作品`"
        @mouseleave="leaveOverflow"
        @focusout="onFocusOut"
      >
        <li
          v-for="(row, rowIndex) in rows"
          :key="`appearance-row-${rowIndex}-${row.hiddenCount ?? row.entries.join('-')}`"
          class="character-role-card__appearance-row"
          :class="{
            'character-role-card__appearance-row--pair':
              row.entries.length + (row.hiddenCount ? 1 : 0) === 2,
          }"
        >
          <span
            v-for="appearanceIndex in row.entries"
            :key="`${appearances[appearanceIndex]!.subject.id}-${appearanceIndex}`"
            class="character-role-card__appearance"
          >
            <n-tag
              class="character-role-tag"
              size="small"
              round
            >
              {{ appearances[appearanceIndex]!.roleLabel }}
            </n-tag>
            <a
              :href="`https://bgm.tv/subject/${appearances[appearanceIndex]!.subject.id}`"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{
                primaryEntityName(
                  appearances[appearanceIndex]!.subject,
                )
              }}
            </a>
          </span>
          <button
            v-if="row.hiddenCount"
            class="character-role-card__source-more"
            type="button"
            :aria-label="`查看全部出演作品，另有 ${row.hiddenCount} 部`"
            :aria-controls="popoverId"
            :aria-expanded="overflowOpen"
            @mouseenter="openOverflow"
            @focus="openOverflow"
            @click="openOverflow"
            @keydown.esc.stop.prevent="closeOverflow"
          >
            … +{{ row.hiddenCount }}
          </button>
        </li>
        <li
          class="character-role-card__appearance-measure"
          aria-hidden="true"
        >
          <span
            v-for="(appearance, index) in appearances"
            :key="`appearance-measure-${appearance.subject.id}-${index}`"
            class="character-role-card__appearance character-role-card__appearance--measure"
            data-appearance-measure
          >
            <n-tag class="character-role-tag" size="small" round>
              {{ appearance.roleLabel }}
            </n-tag>
            <span>{{ primaryEntityName(appearance.subject) }}</span>
          </span>
          <span
            class="character-role-card__source-more"
            data-appearance-more-measure
          >… +{{ appearances.length }}</span>
        </li>
      </ul>
    </template>

    <div
      :id="popoverId"
      ref="popoverContent"
      data-person-detail-popup
      class="character-role-source-tooltip"
      role="list"
      :aria-label="`全部出演作品，共 ${item.workCount} 部`"
      @mouseenter="openOverflow"
      @mouseleave="leaveOverflow"
      @focusin="openOverflow"
      @focusout="onFocusOut"
      @keydown.esc.stop.prevent="escapePopover"
    >
      <span
        v-for="(appearance, index) in appearances"
        :key="`full-${appearance.subject.id}-${index}`"
        role="listitem"
      >
        <n-tag
          class="character-role-tag"
          size="small"
          round
        >
          {{ appearance.roleLabel }}
        </n-tag>
        <a
          :href="`https://bgm.tv/subject/${appearance.subject.id}`"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ primaryEntityName(appearance.subject) }}
        </a>
      </span>
    </div>
  </n-popover>
</template>
