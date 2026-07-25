<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import AppIcon from '../../../shared/components/AppIcon.vue';
import type {
  PersonDetailPayload,
  PersonDetailView,
  PersonPositionLabelResolver,
} from '../model';
import PersonInspector from './PersonInspector.vue';

interface PersonDetailResource {
  readonly error: string | null;
  readonly feedback: string | null;
  readonly input: Readonly<{ personId: number }>;
  readonly payload: PersonDetailPayload | null;
  readonly phase: 'error' | 'idle' | 'pending' | 'ready';
  readonly view: Readonly<PersonDetailView>;
  readonly viewPending: boolean;
}

const props = withDefaults(
  defineProps<{
    compact: boolean;
    devicePixelRatio?: number;
    executeView: (view: Readonly<PersonDetailView>) => Promise<boolean>;
    open: boolean;
    positionLabel: PersonPositionLabelResolver;
    resource: PersonDetailResource;
    retry: (personId: number) => Promise<boolean>;
    targetWindow?: Window;
  }>(),
  {
    devicePixelRatio: 1,
    targetWindow: () => window,
  },
);
const emit = defineEmits<{
  close: [];
}>();

const dialog = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
let previousBodyOverflow: string | null = null;

function restoreBodyScroll(): void {
  if (previousBodyOverflow === null) {
    return;
  }
  props.targetWindow.document.body.style.overflow = previousBodyOverflow;
  previousBodyOverflow = null;
}

function lockBodyScroll(): void {
  if (previousBodyOverflow !== null) {
    return;
  }
  previousBodyOverflow =
    props.targetWindow.document.body.style.overflow;
  props.targetWindow.document.body.style.overflow = 'hidden';
}

watch(
  [() => props.compact, () => props.open],
  async ([compact, open]) => {
    if (compact && open) {
      lockBodyScroll();
      await nextTick();
      closeButton.value?.focus();
      return;
    }
    restoreBodyScroll();
  },
  { immediate: true },
);

function focusableElements(): HTMLElement[] {
  return dialog.value
    ? Array.from(
        dialog.value.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), details > summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('hidden'))
    : [];
}

function onDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key !== 'Tab') {
    return;
  }
  const focusable = focusableElements();
  if (!focusable.length) {
    event.preventDefault();
    dialog.value?.focus();
    return;
  }
  const active = props.targetWindow.document.activeElement;
  const first = focusable[0]!;
  const last = focusable.at(-1)!;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

onBeforeUnmount(restoreBodyScroll);
</script>

<template>
  <aside
    v-if="!compact"
    id="person-detail-panel"
    class="person-detail-surface surface-panel"
    aria-label="人物详情"
  >
    <person-inspector
      v-if="resource.phase !== 'idle'"
      :device-pixel-ratio="devicePixelRatio"
      :execute-view="executeView"
      :position-label="positionLabel"
      :resource="resource"
      :retry="retry"
    />
    <div v-else class="person-detail-placeholder">
      <span class="state-icon">
        <app-icon name="person" :size="26" />
      </span>
      <h2>选择人物查看详情</h2>
      <p>从左侧排行中选择一位人物，查看评分、证据和参与作品。</p>
    </div>
  </aside>

  <teleport v-else-if="open" :to="targetWindow.document.body">
    <div class="person-detail-drawer-layer">
      <button
        class="person-detail-drawer__backdrop"
        type="button"
        aria-label="关闭人物详情"
        @click="emit('close')"
      />
      <section
        ref="dialog"
        id="person-detail-panel"
        class="person-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="人物详情"
        tabindex="-1"
        @keydown="onDialogKeydown"
      >
        <header class="person-detail-drawer__bar">
          <strong>人物详情</strong>
          <button
            ref="closeButton"
            type="button"
            aria-label="关闭人物详情"
            @click="emit('close')"
          >
            <app-icon name="close" :size="20" />
          </button>
        </header>
        <div class="person-detail-drawer__scroll">
          <person-inspector
            :device-pixel-ratio="devicePixelRatio"
            :execute-view="executeView"
            :position-label="positionLabel"
            :resource="resource"
            :retry="retry"
          />
        </div>
      </section>
    </div>
  </teleport>
</template>

<style src="../person-detail.css"></style>
