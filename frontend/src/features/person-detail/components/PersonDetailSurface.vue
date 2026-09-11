<script setup lang="ts">
import { NScrollbar } from 'naive-ui';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import { shellScrollbarThemeOverrides } from '../../../app/themeOverrides';
import { useCompactLayout } from '../../../shared/composables/useCompactLayout';
import AppIcon from '../../../shared/components/AppIcon.vue';
import type {
  PersonDetailPayload,
  PersonDetailView,
  PersonPositionLabelResolver,
} from '../model';
import PersonInspector from './PersonInspector.vue';

interface PersonDetailResource {
  readonly acceptedQuery: Readonly<{
    scope?: 'personal' | 'global';
    mergeSeries?: boolean;
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
    hasCharacterCount?: boolean;
    inline?: boolean;
    executeView: (view: Readonly<PersonDetailView>) => Promise<boolean>;
    open: boolean;
    returnFocus?: HTMLElement | null;
    panelId?: string;
    positionLabel: PersonPositionLabelResolver;
    resource: PersonDetailResource;
    retry: (personId: number) => Promise<boolean>;
    targetWindow?: Window;
  }>(),
  {
    devicePixelRatio: 1,
    inline: false,
    panelId: 'person-detail-panel',
    targetWindow: () => window,
  },
);
const emit = defineEmits<{
  close: [];
}>();

const mobileViewport = useCompactLayout(props.targetWindow);
const drawerScrollbarThemeOverrides = computed(() => mobileViewport.value
  ? { ...shellScrollbarThemeOverrides, width: '6px', height: '6px' }
  : shellScrollbarThemeOverrides);

const dialog = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
let previousDocumentOverflow: string | null = null;
let inertRoot: HTMLElement | null = null;
let previousRootAriaHidden: string | null = null;
let previousRootInert = false;
let previousFocus: HTMLElement | null = null;

function restoreDocumentScroll(): void {
  if (previousDocumentOverflow === null) {
    return;
  }
  props.targetWindow.document.documentElement.style.overflow =
    previousDocumentOverflow;
  previousDocumentOverflow = null;
}

function lockDocumentScroll(): void {
  if (previousDocumentOverflow !== null) {
    return;
  }
  previousDocumentOverflow =
    props.targetWindow.document.documentElement.style.overflow;
  props.targetWindow.document.documentElement.style.overflow = 'hidden';
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
  const root = props.targetWindow.document.querySelector<HTMLElement>('.app-page-scroll');
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
  if (props.returnFocus?.isConnected) {
    previousFocus = props.returnFocus;
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
  if (props.targetWindow.document.activeElement?.closest('.app-header')) {
    return;
  }
  if (target?.isConnected && !target.closest('[hidden], [inert]')) {
    target.focus({ preventScroll: true });
  }
}

async function finishDrawerClose(focusInline = false): Promise<void> {
  if (props.compact && props.open) {
    return;
  }
  restoreDocumentScroll();
  restoreBackgroundInteraction();
  props.targetWindow.document.removeEventListener('keydown', onDialogKeydown);
  await nextTick();
  if (focusInline && !props.compact && props.open) {
    previousFocus = null;
    panel.value?.focus({ preventScroll: true });
  } else {
    restoreBackgroundFocus();
  }
}

watch(
  [() => props.compact, () => props.open],
  async ([compact, open], [wasCompact]) => {
    const focusInline = Boolean(wasCompact && !compact && open &&
      dialog.value?.contains(props.targetWindow.document.activeElement));
    if (compact && open) {
      captureBackgroundFocus();
      lockDocumentScroll();
      isolateBackgroundInteraction();
      props.targetWindow.document.addEventListener('keydown', onDialogKeydown);
      await nextTick();
      dialog.value?.focus({ preventScroll: true });
      return;
    }
    if (!compact || !inertRoot) {
      await finishDrawerClose(focusInline);
    }
  },
  { immediate: true },
);

function focusableElements(): HTMLElement[] {
  if (!dialog.value) {
    return [];
  }
  const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), details > summary, [tabindex]:not([tabindex="-1"])';
  const elements = Array.from(dialog.value.querySelectorAll<HTMLElement>(selector))
    .filter((element) => element.tabIndex >= 0 && !element.closest('[hidden], [inert]'))
    .flatMap((element) => {
      if (element.getAttribute('aria-expanded') !== 'true') return [element];
      const popups = (element.getAttribute('aria-controls') ?? '').split(/\s+/)
        .map((id) => props.targetWindow.document.getElementById(id))
        .filter((popup) => popup?.hasAttribute('data-person-detail-popup'));
      return [element, ...popups.flatMap((popup) =>
        Array.from(popup!.querySelectorAll<HTMLElement>(selector))
          .filter((item) => item.tabIndex >= 0 && !item.closest('[hidden], [inert]')),
      )];
    });
  const headerElements = Array.from(
    props.targetWindow.document.querySelector('.app-header')?.querySelectorAll<HTMLElement>(selector) ?? [],
  ).filter((element) => element.tabIndex >= 0 && !element.closest('[hidden], [inert]'));
  const close = closeButton.value;
  const drawerElements = close && elements.includes(close)
    ? [close, ...elements.filter((element) => element !== close)] : elements;
  return [...headerElements, ...drawerElements];
}

function onDialogKeydown(event: KeyboardEvent): void {
  if (!props.compact || !props.open) return;
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
  const activeIndex = focusable.indexOf(active as HTMLElement);
  const next = focusable[(activeIndex + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length]!;
  if (active === dialog.value) {
    event.preventDefault();
    const closeIndex = focusable.indexOf(closeButton.value!);
    (event.shiftKey ? (focusable[closeIndex - 1] ?? last) : (closeButton.value ?? first)).focus();
  } else if (activeIndex >= 0 && (
    (active as HTMLElement).closest('[data-person-detail-popup]')
    || next.closest('[data-person-detail-popup]')
  )) {
    event.preventDefault();
    next.focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

onBeforeUnmount(() => {
  props.targetWindow.document.removeEventListener('keydown', onDialogKeydown);
  restoreDocumentScroll();
  restoreBackgroundInteraction();
  restoreBackgroundFocus();
});
</script>

<template>
  <aside
    v-if="!compact"
    ref="panel"
    :id="panelId"
    class="person-detail-surface surface-panel"
    :class="{ 'person-detail-surface--inline': inline }"
    aria-label="人物详情"
    tabindex="-1"
  >
    <div v-if="$slots.actions" class="person-detail-surface__actions">
      <slot name="actions" />
    </div>
    <person-inspector
      v-if="resource.phase !== 'idle'"
      :device-pixel-ratio="devicePixelRatio"
      :has-character-count="hasCharacterCount"
      :execute-view="executeView"
      :position-label="positionLabel"
      :resource="resource"
      :retry="retry"
    >
      <template v-if="$slots['profile-action']" #profile-action><slot name="profile-action" /></template>
    </person-inspector>
    <div v-else class="person-detail-placeholder">
      <span class="state-icon">
        <app-icon name="person" :size="26" />
      </span>
      <h2>选择人物查看详情</h2>
      <p>从左侧排行中选择一位人物，查看评分、证据和参与作品。</p>
    </div>
  </aside>

  <teleport v-else :to="targetWindow.document.body">
    <transition name="person-detail-drawer" appear @after-leave="finishDrawerClose()">
      <div v-if="open" class="person-detail-drawer-layer">
        <button
          class="person-detail-drawer__backdrop"
          type="button"
          aria-label="关闭人物详情"
          @click="emit('close')"
        />
        <section
          ref="dialog"
          :id="panelId"
          class="person-detail-drawer"
          role="dialog"
          aria-label="人物详情"
          tabindex="-1"
        >
          <header class="person-detail-drawer__bar">
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
            trigger="none"
            :theme-overrides="drawerScrollbarThemeOverrides"
            :container-style="{ overscrollBehavior: 'contain' }"
            :content-style="{
              boxSizing: 'border-box',
              paddingInlineEnd: drawerScrollbarThemeOverrides.width,
            }"
          >
            <div v-if="$slots.actions" class="person-detail-surface__actions">
              <slot name="actions" />
            </div>
            <person-inspector
              :device-pixel-ratio="devicePixelRatio"
              :has-character-count="hasCharacterCount"
              :execute-view="executeView"
              :position-label="positionLabel"
              :resource="resource"
              :retry="retry"
            >
              <template v-if="$slots['profile-action']" #profile-action><slot name="profile-action" /></template>
            </person-inspector>
          </n-scrollbar>
        </section>
      </div>
    </transition>
  </teleport>
</template>

<style src="../person-detail.css"></style>
