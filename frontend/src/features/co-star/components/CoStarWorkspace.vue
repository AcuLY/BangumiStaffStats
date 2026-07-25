<script setup lang="ts">
import {
  NDrawer,
  NDrawerContent,
} from 'naive-ui';
import {
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import { useCompactLayout } from '../../query/composables/useCompactLayout';
import type {
  CandidateInput,
  CandidateResource,
  CandidateView,
} from '../model';
import type { CoStarSelection } from '../selection';
import CandidatePicker from './CandidatePicker.vue';
import CoStarEmptyState from './CoStarEmptyState.vue';
import MobileCandidateEntry from './MobileCandidateEntry.vue';

const props = withDefaults(
  defineProps<{
    cancel: () => void;
    devicePixelRatio?: number;
    executeView: (
      input: Readonly<CandidateInput>,
      view: Readonly<CandidateView>,
    ) => Promise<boolean>;
    positionLabel: (positionKey: string) => string;
    resource: CandidateResource;
    retry: () => Promise<boolean>;
    selection: CoStarSelection;
    targetWindow?: Window;
  }>(),
  {
    devicePixelRatio: 1,
    targetWindow: () => window,
  },
);

const compact = useCompactLayout(props.targetWindow);
const workspace = ref<HTMLElement | null>(null);
const drawerOpen = ref(false);
const drawerOpener = ref<HTMLElement | null>(null);
const railHighlighted = ref(false);
let railHighlightTimer: number | undefined;
let drawerFocusTimer: number | undefined;

function clearRailHighlight(): void {
  railHighlighted.value = false;
  if (railHighlightTimer !== undefined) {
    props.targetWindow.clearTimeout(railHighlightTimer);
    railHighlightTimer = undefined;
  }
}

async function openPicker(trigger: HTMLElement): Promise<void> {
  if (compact.value) {
    drawerOpener.value = trigger;
    drawerOpen.value = true;
    return;
  }
  clearRailHighlight();
  await nextTick();
  railHighlighted.value = true;
  railHighlightTimer = props.targetWindow.setTimeout(
    clearRailHighlight,
    900,
  );
}

function closePicker(): void {
  drawerOpen.value = false;
}

function containDrawerWheel(event: WheelEvent): void {
  if (!event.deltaY) {
    return;
  }
  const scrollContainer = event.currentTarget;
  if (!(scrollContainer instanceof HTMLElement)) {
    return;
  }

  const maxScrollTop =
    scrollContainer.scrollHeight - scrollContainer.clientHeight;
  const canScroll =
    event.deltaY < 0
      ? scrollContainer.scrollTop > 0
      : scrollContainer.scrollTop < maxScrollTop - 1;
  if (!canScroll) {
    event.preventDefault();
  }
  event.stopPropagation();
}

const drawerScrollbarProps = {
  containerStyle: { overscrollBehavior: 'contain' },
  onWheel: containDrawerWheel,
};

function scheduleMobileEntryFocus(delay: number): void {
  if (drawerFocusTimer !== undefined) {
    props.targetWindow.clearTimeout(drawerFocusTimer);
  }
  drawerFocusTimer = props.targetWindow.setTimeout(() => {
    drawerFocusTimer = undefined;
    workspace.value
      ?.querySelector<HTMLButtonElement>('.co-star-mobile-entry')
      ?.focus();
  }, delay);
}

async function restoreDrawerFocus(): Promise<void> {
  const opener = drawerOpener.value;
  drawerOpener.value = null;
  await nextTick();
  if (opener?.isConnected) {
    opener.focus();
  } else {
    scheduleMobileEntryFocus(0);
  }
}

watch(drawerOpen, (open, wasOpen) => {
  if (!open && wasOpen && !drawerOpener.value?.isConnected) {
    scheduleMobileEntryFocus(250);
  }
});

watch(compact, (isCompact) => {
  if (isCompact) {
    clearRailHighlight();
  } else if (drawerOpen.value) {
      drawerOpen.value = false;
  }
});

onBeforeUnmount(() => {
  clearRailHighlight();
  if (drawerFocusTimer !== undefined) {
    props.targetWindow.clearTimeout(drawerFocusTimer);
  }
});

defineExpose({ openPicker });
</script>

<template>
  <div ref="workspace" class="co-star-candidate-workspace">
    <mobile-candidate-entry
      v-if="compact"
      :drawer-open="drawerOpen"
      :selection="selection"
      @open="openPicker"
    />

    <div class="co-star-candidate-layout">
      <aside
        v-if="!compact"
        class="co-star-candidate-rail"
        :class="{ 'is-attention': railHighlighted }"
        aria-label="人物选择面板"
      >
        <candidate-picker
          :cancel="cancel"
          :device-pixel-ratio="devicePixelRatio"
          :execute-view="executeView"
          :position-label="positionLabel"
          :resource="resource"
          :retry="retry"
          :selection="selection"
          :target-window="targetWindow"
        />
      </aside>

      <section class="co-star-analysis-main" aria-label="共演分析">
        <co-star-empty-state
          v-if="selection.personCount.value === 0"
          @select="openPicker"
        />
        <slot v-else name="analysis" />
      </section>
    </div>

    <n-drawer
      v-if="compact"
      id="co-star-mobile-picker"
      :show="drawerOpen"
      class="co-star-picker-drawer"
      :block-scroll="true"
      show-mask="transparent"
      placement="bottom"
      height="calc(100dvh - var(--header-bar-height))"
      aria-label="人物选择"
      @update:show="drawerOpen = $event"
      @after-leave="restoreDrawerFocus"
    >
      <n-drawer-content
        :native-scrollbar="false"
        :scrollbar-props="drawerScrollbarProps"
        body-content-style="padding: 0;"
        :closable="false"
      >
        <candidate-picker
          drawer
          :cancel="cancel"
          :device-pixel-ratio="devicePixelRatio"
          :execute-view="executeView"
          :position-label="positionLabel"
          :resource="resource"
          :retry="retry"
          :selection="selection"
          :target-window="targetWindow"
          @close="closePicker"
        />
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<style src="../co-star.css"></style>
