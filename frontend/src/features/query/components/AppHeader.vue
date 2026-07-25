<script setup lang="ts">
import { NButton, NButtonGroup, NInput, NPopover } from 'naive-ui';
import { computed, onBeforeUnmount, ref } from 'vue';

import brandMark from '../../../assets/brand/bgmss.png';
import type { AppTheme } from '../../../app/theme';
import type { QueryCoordinator } from '../coordinator';
import { querySignature, type QueryMode } from '../model';
import {
  copyShareUrl,
  createShareUrl,
  type ShareWorkspace,
} from '../share';
import type { useQueryStore } from '../store';
import QueryIcon from './QueryIcon.vue';

const props = defineProps<{
  coordinator: QueryCoordinator<unknown, unknown>;
  mode: QueryMode;
  navigate: (mode: QueryMode) => void;
  queryStore: ReturnType<typeof useQueryStore>;
  targetWindow: Window;
  theme: AppTheme;
  toggleTheme: () => void;
}>();

const copied = ref(false);
const fallbackOpen = ref(false);
const fallbackLink = ref('');
let copiedTimer: number | undefined;

const modes: readonly { label: string; value: QueryMode }[] = [
  { label: '人物排行', value: 'ranking' },
  { label: '共演分析', value: 'co-star' },
];

const shareWorkspace = computed<ShareWorkspace | null>(() => {
  const applied = props.queryStore.applied;
  if (!applied) {
    return null;
  }
  if (props.mode === 'ranking') {
    const resource = props.coordinator.rankings;
    if (
      resource.revision !== props.queryStore.revision ||
      resource.acceptedQuery === null ||
      querySignature(resource.acceptedQuery) !== querySignature(applied)
    ) {
      return null;
    }
    return {
      kind: 'ranking',
      rankingsView: structuredClone(resource.view),
    };
  }
  const resource = props.coordinator.candidates;
  if (
    resource.revision !== props.queryStore.revision ||
    resource.acceptedQuery === null ||
    querySignature(resource.acceptedQuery) !== querySignature(applied)
  ) {
    return null;
  }
  return {
    kind: 'co-star',
    state: 'empty',
    candidates: {
      input: structuredClone(resource.input),
      view: structuredClone(resource.view),
    },
  };
});

const shareDisabled = computed(
  () => !props.queryStore.applied || !shareWorkspace.value,
);

function shareLink(): string {
  if (!props.queryStore.applied || !shareWorkspace.value) {
    throw new Error('No successful query is available to share');
  }
  return createShareUrl(
    new URL(props.targetWindow.location.href),
    props.mode === 'ranking' ? '/ranking' : '/co-star',
    props.queryStore.applied,
    shareWorkspace.value,
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
    props.navigate(mode.value);
    props.targetWindow.requestAnimationFrame(() =>
      props.targetWindow.document
        .querySelector<HTMLElement>(`#mode-tab-${mode.value}`)
        ?.focus(),
    );
  }
}

onBeforeUnmount(() => {
  props.targetWindow.clearTimeout(copiedTimer);
});
</script>

<template>
  <div class="app-header__bar">
    <a class="app-brand" href="/ranking" aria-label="Bangumi Staff Statistics 首页">
      <img :src="brandMark" class="app-brand__mark" alt="" width="32" height="32" />
      <span class="app-brand__name" translate="no">Bangumi Staff Statistics</span>
    </a>

    <nav class="mode-tabs" role="tablist" aria-label="分析模式">
      <n-button-group>
        <n-button
          v-for="(item, index) in modes"
          :id="`mode-tab-${item.value}`"
          :key="item.value"
          :type="mode === item.value ? 'primary' : 'default'"
          :secondary="mode === item.value"
          attr-type="button"
          role="tab"
          :aria-selected="mode === item.value"
          :tabindex="mode === item.value ? 0 : -1"
          @click="navigate(item.value)"
          @keydown="onModeKeydown($event, index)"
        >
          {{ item.label }}
        </n-button>
      </n-button-group>
    </nav>

    <n-popover
      v-model:show="fallbackOpen"
      trigger="manual"
      placement="bottom-end"
      :show-arrow="false"
      class="share-fallback"
    >
      <template #trigger>
        <n-button
          class="header-icon-action share-action"
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

    <n-button
      class="header-icon-action theme-action"
      quaternary
      circle
      attr-type="button"
      :aria-pressed="theme === 'dark'"
      :aria-label="theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
      :title="theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
      @click="toggleTheme"
    >
      <template #icon>
        <query-icon :name="theme === 'dark' ? 'sun' : 'moon'" />
      </template>
    </n-button>

    <span class="sr-only" role="status" aria-live="polite">
      {{ copied ? '查询链接已复制' : '' }}
    </span>
  </div>
</template>
