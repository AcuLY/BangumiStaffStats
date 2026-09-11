<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { useResultReveal } from '../../../shared/composables/useResultReveal';
import { useCompactLayout } from '../../../shared/composables/useCompactLayout';
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
    beforeOpenPicker?: (trigger: HTMLElement) => boolean | Promise<boolean>;
    analysisPending?: boolean;
    cancel: () => void;
    devicePixelRatio?: number;
    executeView: (
      input: Readonly<CandidateInput>,
      view: Readonly<CandidateView>,
    ) => Promise<boolean>;
    externalOwnsMobileEntry?: boolean;
    positionLabel: (positionKey: string) => string;
    resource: CandidateResource;
    retry: () => Promise<boolean>;
    selection: CoStarSelection;
    suppressErrorMessage?: boolean;
    targetWindow?: Window;
  }>(),
  {
    devicePixelRatio: 1,
    analysisPending: false,
    externalOwnsMobileEntry: false,
    suppressErrorMessage: false,
    targetWindow: () => window,
  },
);
const emit = defineEmits<{
  pickerOpenChange: [open: boolean];
}>();

const compact = useCompactLayout(props.targetWindow);
const workspace = ref<HTMLElement | null>(null);
const compactPickerPanel = ref<HTMLElement | null>(null);
const pickerExpanded = ref(false);
const {
  attention: railHighlighted,
  clear: clearRailHighlight,
  reveal: revealCandidateRail,
  target: candidateRail,
} = useResultReveal(props.targetWindow);
const {
  attention: analysisHighlighted,
  reveal: revealAnalysisRegion,
  target: analysisRegion,
} = useResultReveal(props.targetWindow);
let breakpointFocusTimer: number | undefined;
let breakpointFocusTransfer = 0;
type PickerFocusOwner = 'panel' | 'rail' | 'summary';
let lastPickerFocusOwner: PickerFocusOwner | null = null;

function mobileEntry(): HTMLButtonElement | null {
  return (
    workspace.value?.parentElement?.querySelector<HTMLButtonElement>(
      '.co-star-mobile-entry',
    ) ??
    props.targetWindow.document.querySelector<HTMLButtonElement>(
      '.co-star-mobile-entry',
    )
  );
}

function focusOwnerFor(target: EventTarget | null): PickerFocusOwner | null {
  if (!target || typeof target !== 'object' || !('nodeType' in target)) {
    return null;
  }
  const node = target as Node;
  if (mobileEntry()?.contains(node)) {
    return 'summary';
  }
  if (compactPickerPanel.value?.contains(node)) {
    return 'panel';
  }
  if (candidateRail.value?.contains(node)) {
    return 'rail';
  }
  return null;
}

function rememberFocusOwner(event: FocusEvent): void {
  const owner = focusOwnerFor(event.target);
  if (owner) {
    lastPickerFocusOwner = owner;
    return;
  }
  if (
    event.target === props.targetWindow.document.body ||
    event.target === props.targetWindow.document.documentElement
  ) {
    return;
  }
  lastPickerFocusOwner = null;
}

function clearFocusOwnerFromExternalPointer(event: PointerEvent): void {
  if (!focusOwnerFor(event.target)) {
    lastPickerFocusOwner = null;
  }
}

async function openPicker(trigger: HTMLElement): Promise<void> {
  const summaryActivation = trigger.matches('.co-star-mobile-entry');
  if (compact.value && summaryActivation && pickerExpanded.value) {
    pickerExpanded.value = false;
    return;
  }
  if (
    props.beforeOpenPicker &&
    !(await props.beforeOpenPicker(trigger))
  ) {
    return;
  }
  if (compact.value) {
    pickerExpanded.value = true;
    if (!summaryActivation) {
      await nextTick();
      compactPickerPanel.value
        ?.querySelector<HTMLInputElement>('input[name="candidateSearch"]')
        ?.focus();
    }
    return;
  }
  clearRailHighlight();
  await nextTick();
  await revealCandidateRail({
    focus: candidateRail.value?.querySelector<HTMLInputElement>(
      'input[name="candidateSearch"]',
    ),
  });
}

async function revealAnalysis(): Promise<void> {
  await revealAnalysisRegion();
}

function closePicker(): void {
  pickerExpanded.value = false;
}

function scheduleDesktopSearchFocus(transfer: number): void {
  if (breakpointFocusTimer !== undefined) {
    props.targetWindow.clearTimeout(breakpointFocusTimer);
  }
  breakpointFocusTimer = props.targetWindow.setTimeout(() => {
    breakpointFocusTimer = undefined;
    if (
      transfer !== breakpointFocusTransfer ||
      compact.value ||
      (lastPickerFocusOwner !== 'panel' &&
        lastPickerFocusOwner !== 'summary')
    ) {
      return;
    }
    workspace.value
      ?.querySelector<HTMLInputElement>(
        '.co-star-candidate-rail input[name="candidateSearch"]',
      )
      ?.focus({ preventScroll: true });
  }, 0);
}

async function closePickerAndFocusSummary(): Promise<void> {
  pickerExpanded.value = false;
  await nextTick();
  if (compact.value) {
    mobileEntry()?.focus({ preventScroll: true });
  }
}

watch(pickerExpanded, (open) => {
  emit('pickerOpenChange', open);
});

watch(
  compact,
  async (isCompact, wasCompact) => {
    if (isCompact === wasCompact) {
      return;
    }
    const transfer = ++breakpointFocusTransfer;
    const activeElement = props.targetWindow.document.activeElement;
    const currentOwner = focusOwnerFor(activeElement);
    const transitionOwner =
      currentOwner ??
      (activeElement === props.targetWindow.document.body ||
      activeElement === props.targetWindow.document.documentElement
        ? lastPickerFocusOwner
        : null);
    const railOwnedFocus = transitionOwner === 'rail';
    const panelOwnedFocus = transitionOwner === 'panel';
    const summaryOwnedFocus = transitionOwner === 'summary';

    if (isCompact) {
      clearRailHighlight();
      pickerExpanded.value = false;
      if (!railOwnedFocus) {
        return;
      }
      await nextTick();
      if (
        transfer === breakpointFocusTransfer &&
        compact.value &&
        lastPickerFocusOwner === 'rail'
      ) {
        mobileEntry()?.focus({ preventScroll: true });
      }
      return;
    }

    pickerExpanded.value = false;
    if (!panelOwnedFocus && !summaryOwnedFocus) {
      return;
    }
    await nextTick();
    if (transfer !== breakpointFocusTransfer || compact.value) {
      return;
    }
    scheduleDesktopSearchFocus(transfer);
  },
  { flush: 'sync' },
);

onMounted(() => {
  const document = props.targetWindow.document;
  document.addEventListener('focusin', rememberFocusOwner, true);
  document.addEventListener(
    'pointerdown',
    clearFocusOwnerFromExternalPointer,
    true,
  );
  lastPickerFocusOwner = focusOwnerFor(document.activeElement);
});

onBeforeUnmount(() => {
  clearRailHighlight();
  const document = props.targetWindow.document;
  document.removeEventListener('focusin', rememberFocusOwner, true);
  document.removeEventListener(
    'pointerdown',
    clearFocusOwnerFromExternalPointer,
    true,
  );
  if (breakpointFocusTimer !== undefined) {
    props.targetWindow.clearTimeout(breakpointFocusTimer);
  }
});

defineExpose({ closePicker, openPicker, revealAnalysis });
</script>

<template>
  <div ref="workspace" class="co-star-candidate-workspace">
    <mobile-candidate-entry
      v-if="compact && !externalOwnsMobileEntry"
      class="co-star-content-entry"
      :expanded="pickerExpanded"
      :selection="selection"
      @toggle="openPicker"
    />

    <div v-if="compact" class="co-star-picker-accordion-host">
      <transition name="co-star-picker-panel">
        <section
          v-show="pickerExpanded"
          id="co-star-mobile-picker-panel"
          ref="compactPickerPanel"
          class="co-star-picker-accordion"
          role="region"
          aria-labelledby="co-star-mobile-picker-toggle"
          :aria-hidden="pickerExpanded ? undefined : 'true'"
          :inert="pickerExpanded ? undefined : true"
          @keydown.esc.stop.prevent="closePickerAndFocusSummary"
        >
          <candidate-picker
            :cancel="cancel"
            :device-pixel-ratio="devicePixelRatio"
            :execute-view="executeView"
            :position-label="positionLabel"
            :resource="resource"
            :retry="retry"
            :selection="selection"
            :suppress-error-message="suppressErrorMessage"
            :target-window="targetWindow"
          />
        </section>
      </transition>
    </div>

    <div class="co-star-candidate-layout">
      <aside
        v-if="!compact"
        ref="candidateRail"
        class="co-star-candidate-rail result-reveal-target"
        :class="{ 'is-attention': railHighlighted }"
        aria-label="人物选择面板"
        tabindex="-1"
      >
        <candidate-picker
          :cancel="cancel"
          :device-pixel-ratio="devicePixelRatio"
          :execute-view="executeView"
          :position-label="positionLabel"
          :resource="resource"
          :retry="retry"
          :selection="selection"
          :suppress-error-message="suppressErrorMessage"
          :target-window="targetWindow"
        />
      </aside>

      <section
        ref="analysisRegion"
        class="co-star-analysis-main result-reveal-target"
        :class="{ 'is-reveal-attention': analysisHighlighted }"
        aria-label="共演分析"
        tabindex="-1"
      >
        <slot v-if="analysisPending" name="analysis-loading" />
        <co-star-empty-state
          v-else-if="selection.personCount.value === 0"
          @select="openPicker"
        />
        <slot v-else name="analysis" />
      </section>
    </div>

  </div>
</template>

<style src="../co-star.css"></style>
