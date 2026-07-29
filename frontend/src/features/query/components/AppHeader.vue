<script setup lang="ts">
import { NButton, NInput, NPopover, NTab, NTabs } from 'naive-ui';
import { computed, onBeforeUnmount, ref } from 'vue';

import brandMark from '../../../assets/brand/bgmss.png';
import type { AppTheme } from '../../../app/theme';
import { toPublicAppPath } from '../../../shared/navigation/basePath';
import type { QueryCoordinator } from '../coordinator';
import { useCompactLayout } from '../composables/useCompactLayout';
import { querySignature, type QueryMode } from '../model';
import {
  copyShareUrl,
  createShareUrl,
  type ShareWorkspace,
} from '../share';
import type { useQueryStore } from '../store';
import QueryIcon from './QueryIcon.vue';

const props = withDefaults(
  defineProps<{
    compactContextVisible?: boolean;
    coordinator: QueryCoordinator<unknown, unknown>;
    mode: QueryMode;
    navigate: (mode: QueryMode) => void;
    queryStore: ReturnType<typeof useQueryStore>;
    shareWorkspace?: ShareWorkspace | null;
    targetWindow: Window;
    theme: AppTheme;
    toggleTheme: () => void;
  }>(),
  {
    compactContextVisible: false,
    shareWorkspace: undefined,
  },
);

const copied = ref(false);
const fallbackOpen = ref(false);
const fallbackLink = ref('');
const compact = useCompactLayout(props.targetWindow);
const modeControlSize = computed(() => (compact.value ? 'small' : 'medium'));
const headerActionThemeOverrides = computed(() =>
  compact.value ? undefined : { heightMedium: '38px' },
);
let copiedTimer: number | undefined;

const modes: readonly { label: string; value: QueryMode }[] = [
  { label: '人物排行', value: 'ranking' },
  { label: '共演分析', value: 'co-star' },
];
const rankingHref = toPublicAppPath('/ranking');

const fallbackShareWorkspace = computed<ShareWorkspace | null>(() => {
  const applied = props.queryStore.applied;
  if (!applied) {
    return null;
  }
  if (props.mode === 'ranking') {
    const resource = props.coordinator.rankings;
    if (
      resource.revision !== props.queryStore.revision ||
      resource.acceptedQuery === null ||
      !resource.acceptedView ||
      querySignature(resource.acceptedQuery) !== querySignature(applied)
    ) {
      return null;
    }
    return {
      kind: 'ranking',
      rankingsView: structuredClone(resource.acceptedView),
    };
  }
  const resource = props.coordinator.candidates;
  if (
    resource.revision !== props.queryStore.revision ||
    resource.acceptedQuery === null ||
    !resource.acceptedInput ||
    !resource.acceptedView ||
    querySignature(resource.acceptedQuery) !== querySignature(applied)
  ) {
    return null;
  }
  return {
    kind: 'co-star',
    state: 'empty',
    candidates: {
      input: structuredClone(resource.acceptedInput),
      view: structuredClone(resource.acceptedView),
    },
  };
});
const acceptedShareWorkspace = computed(() =>
  props.shareWorkspace === undefined
    ? fallbackShareWorkspace.value
    : props.shareWorkspace,
);

const shareDisabled = computed(
  () => !props.queryStore.applied || !acceptedShareWorkspace.value,
);

function shareLink(): string {
  if (!props.queryStore.applied || !acceptedShareWorkspace.value) {
    throw new Error('No successful query is available to share');
  }
  return createShareUrl(
    new URL(props.targetWindow.location.href),
    props.mode === 'ranking' ? '/ranking' : '/co-star',
    props.queryStore.applied,
    acceptedShareWorkspace.value,
  );
}

async function share(): Promise<void> {
  const link = shareLink();
  let clipboard: Clipboard | undefined;
  try {
    clipboard = props.targetWindow.navigator.clipboard;
  } catch {
    clipboard = undefined;
  }
  const result = await copyShareUrl(link, clipboard);
  if (result === 'fallback') {
    fallbackLink.value = link;
    fallbackOpen.value = true;
    copied.value = false;
    return;
  }
  fallbackOpen.value = false;
  copied.value = true;
  props.targetWindow.clearTimeout(copiedTimer);
  copiedTimer = props.targetWindow.setTimeout(() => {
    copied.value = false;
  }, 1500);
}

function activateMode(value: string | number, focus = false): void {
  if (value !== 'ranking' && value !== 'co-star') {
    return;
  }
  props.navigate(value);
  if (focus) {
    props.targetWindow.requestAnimationFrame(() =>
      props.targetWindow.document
        .querySelector<HTMLElement>(`#mode-tab-${value}`)
        ?.focus(),
    );
  }
}

function onModeKeydown(event: KeyboardEvent, index: number): void {
  let next = index;
  if (event.key === 'ArrowRight') {
    next = (index + 1) % modes.length;
  } else if (event.key === 'ArrowLeft') {
    next = (index - 1 + modes.length) % modes.length;
  } else if (event.key === 'Home') {
    next = 0;
  } else if (event.key === 'End') {
    next = modes.length - 1;
  } else {
    return;
  }
  event.preventDefault();
  const mode = modes[next];
  if (mode) {
    activateMode(mode.value, true);
  }
}

onBeforeUnmount(() => {
  props.targetWindow.clearTimeout(copiedTimer);
});
</script>

<template>
  <div class="app-header__contents">
    <div class="app-content-line">
      <div class="app-header__bar">
    <a
      class="app-brand"
      :href="rankingHref"
      aria-label="Bangumi Staff Statistics 人物工作台首页"
      translate="no"
    >
      <img :src="brandMark" class="app-brand__mark" alt="" width="28" height="28" />
      <span class="app-brand__name" translate="no">Bangumi Staff Statistics</span>
    </a>

    <nav class="mode-tabs" role="tablist" aria-label="工作台模式">
      <n-tabs
        type="segment"
        :size="modeControlSize"
        :value="mode"
        @update:value="activateMode"
      >
        <n-tab
          v-for="(item, index) in modes"
          :id="`mode-tab-${item.value}`"
          :key="item.value"
          :name="item.value"
          role="tab"
          :aria-selected="mode === item.value"
          :aria-controls="`mode-panel-${item.value}`"
          :tabindex="mode === item.value ? 0 : -1"
          @keydown="onModeKeydown($event, index)"
        >
          {{ item.label }}
        </n-tab>
      </n-tabs>
    </nav>

    <span class="header-action-slot share-action">
      <n-popover
        v-model:show="fallbackOpen"
        trigger="manual"
        placement="bottom-end"
        :show-arrow="false"
        class="share-fallback"
      >
        <template #trigger>
          <n-button
            class="header-icon-action"
            size="medium"
            :theme-overrides="headerActionThemeOverrides"
            quaternary
            circle
            attr-type="button"
            :disabled="shareDisabled"
            aria-label="复制当前查询链接"
            title="复制当前查询链接"
            @click="share"
          >
            <template #icon>
              <query-icon :name="copied ? 'check' : 'share'" />
            </template>
          </n-button>
        </template>
        <div class="share-fallback__content">
          <strong>复制当前查询链接</strong>
          <n-input
            :value="fallbackLink"
            readonly
            aria-label="当前查询链接"
            @focus="($event.target as HTMLInputElement).select()"
          />
        </div>
      </n-popover>
    </span>

    <span class="header-action-slot theme-action">
      <n-button
        class="header-icon-action"
        size="medium"
        :theme-overrides="headerActionThemeOverrides"
        quaternary
        circle
        attr-type="button"
        :aria-pressed="theme === 'dark'"
        :aria-label="theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
        :title="theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
        @click="toggleTheme"
      >
        <template #icon>
          <query-icon :name="theme === 'dark' ? 'sun' : 'moon'" :size="18" />
        </template>
      </n-button>
    </span>

        <span class="sr-only" role="status" aria-live="polite">
          {{ copied ? '查询链接已复制' : '' }}
        </span>
      </div>
    </div>

    <div class="app-header__query">
      <slot name="query" />
    </div>

    <div
      v-if="compact && compactContextVisible"
      class="app-header__mobile-context"
    >
      <slot name="compact-context" />
    </div>
  </div>
</template>
