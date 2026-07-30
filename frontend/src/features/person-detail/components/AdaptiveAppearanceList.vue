<script setup lang="ts">
import { NPopover } from 'naive-ui';
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
const rows = ref<AdaptiveAppearanceRow[]>([]);
const overflowOpen = ref(false);
const popoverId = `character-appearances-${useId()}`;
let resizeObserver: ResizeObserver | null = null;
let measureFrame = 0;

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
  overflowOpen.value = false;
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
            <small
              class="character-role-tag"
              :class="{
                'character-role-tag--prominent':
                  /主角|主役/.test(
                    appearances[appearanceIndex]!.roleLabel,
                  ),
              }"
            >
              {{ appearances[appearanceIndex]!.roleLabel }}
            </small>
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
            @mouseenter="overflowOpen = true"
            @focus="overflowOpen = true"
            @click="overflowOpen = !overflowOpen"
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
            <small class="character-role-tag">
              {{ appearance.roleLabel }}
            </small>
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
      class="character-role-source-tooltip"
      role="list"
      :aria-label="`全部出演作品，共 ${item.workCount} 部`"
    >
      <span
        v-for="(appearance, index) in appearances"
        :key="`full-${appearance.subject.id}-${index}`"
        role="listitem"
      >
        <small
          class="character-role-tag"
          :class="{
            'character-role-tag--prominent':
              /主角|主役/.test(appearance.roleLabel),
          }"
        >
          {{ appearance.roleLabel }}
        </small>
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
