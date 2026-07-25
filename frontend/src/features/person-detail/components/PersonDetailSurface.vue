<script setup lang="ts">
import { NScrollbar } from 'naive-ui';
import {
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import { shellScrollbarThemeOverrides } from '../../../app/themeOverrides';
import AppIcon from '../../../shared/components/AppIcon.vue';
import type {
  PersonDetailPayload,
  PersonDetailView,
  PersonPositionLabelResolver,
} from '../model';
import PersonInspector from './PersonInspector.vue';

interface PersonDetailResource {
  readonly acceptedQuery: Readonly<{
    positionKeys: readonly unknown[];
  }> | null;
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
let inertRoot: HTMLElement | null = null;
let previousRootAriaHidden: string | null = null;
let previousRootInert = false;
let previousFocus: HTMLElement | null = null;

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

function restoreBackgroundInteraction(): void {
  if (!inertRoot) {
    return;
  }
  inertRoot.inert = previousRootInert;
  if (previousRootAriaHidden === null) {
    inertRoot.removeAttribute('aria-hidden');
  } else {
    inertRoot.setAttribute('aria-hidden', previousRootAriaHidden);
  }
  inertRoot = null;
  previousRootAriaHidden = null;
}

function isolateBackgroundInteraction(): void {
  if (inertRoot) {
    return;
  }
  const root = props.targetWindow.document.getElementById('app');
  if (!root) {
    return;
  }
  inertRoot = root;
  previousRootInert = Boolean(root.inert);
  previousRootAriaHidden = root.getAttribute('aria-hidden');
  root.inert = true;
  root.setAttribute('aria-hidden', 'true');
}

function captureBackgroundFocus(): void {
  if (previousFocus) {
    return;
  }
  const active = props.targetWindow.document.activeElement;
  const elementConstructor =
    props.targetWindow.document.defaultView?.HTMLElement ?? HTMLElement;
  previousFocus =
    active instanceof elementConstructor ? active : null;
}

function restoreBackgroundFocus(): void {
  const target = previousFocus;
  previousFocus = null;
  if (target?.isConnected) {
    target.focus({ preventScroll: true });
  }
}

watch(
  [() => props.compact, () => props.open],
  async ([compact, open]) => {
    if (compact && open) {
      captureBackgroundFocus();
      lockBodyScroll();
      isolateBackgroundInteraction();
      await nextTick();
      closeButton.value?.focus();
      return;
    }
    restoreBodyScroll();
    restoreBackgroundInteraction();
    await nextTick();
    restoreBackgroundFocus();
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

function containDrawerWheel(event: WheelEvent): void {
  if (!event.deltaY) {
    return;
  }
  const elementConstructor =
    props.targetWindow.document.defaultView?.HTMLElement ?? HTMLElement;
  const scrollContainer = event
    .composedPath()
    .find(
      (node): node is HTMLElement =>
        node instanceof elementConstructor &&
        node.scrollHeight > node.clientHeight,
    );
  if (!scrollContainer) {
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

onBeforeUnmount(() => {
  restoreBodyScroll();
  restoreBackgroundInteraction();
  restoreBackgroundFocus();
});
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
          <span
            class="person-detail-drawer__close-hit"
            @click="emit('close')"
          >
            <button
              ref="closeButton"
              class="person-detail-drawer__close"
              type="button"
              aria-label="关闭人物详情"
              title="关闭人物详情"
              @click.stop="emit('close')"
            >
              <app-icon name="close" :size="16" />
            </button>
          </span>
        </header>
        <n-scrollbar
          class="person-detail-drawer__scroll"
          :theme-overrides="shellScrollbarThemeOverrides"
          @wheel.capture="containDrawerWheel"
        >
          <person-inspector
            :device-pixel-ratio="devicePixelRatio"
            :execute-view="executeView"
            :position-label="positionLabel"
            :resource="resource"
            :retry="retry"
          />
        </n-scrollbar>
      </section>
    </div>
  </teleport>
</template>

<style src="../person-detail.css"></style>
