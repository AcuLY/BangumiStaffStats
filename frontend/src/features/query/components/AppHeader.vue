<script setup lang="ts">
import { NButton, NTab, NTabs } from 'naive-ui';
import { computed } from 'vue';

import brandMarkDark from '../../../assets/brand/bgmss-dark.svg?no-inline';
import brandMarkLight from '../../../assets/brand/bgmss-light.svg?no-inline';
import type { AppTheme } from '../../../app/theme';
import { toPublicAppPath } from '../../../shared/navigation/basePath';
import { useCompactLayout } from '../../../shared/composables/useCompactLayout';
import type { QueryMode } from '../model';
import QueryIcon from './QueryIcon.vue';

const props = defineProps<{
  mode: QueryMode;
  navigate: (mode: QueryMode) => void;
  targetWindow: Window;
  theme: AppTheme;
  toggleTheme: () => void;
}>();

const compact = useCompactLayout(props.targetWindow);
const brandMark = computed(() => props.theme === 'dark' ? brandMarkDark : brandMarkLight);
const modeControlSize = computed(() => (compact.value ? 'small' : 'medium'));

const modes: readonly { label: string; value: QueryMode }[] = [
  { label: '人物排行', value: 'ranking' },
  { label: '共演分析', value: 'co-star' },
];
const rankingHref = toPublicAppPath('/ranking');

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

    <div class="header-actions">
      <n-button
        class="legacy-action"
        tag="a"
        href="https://search.bgmss.fun/old/"
        aria-label="回到旧版"
        title="回到旧版"
        quaternary
        size="medium"
      >
        <template #icon>
          <query-icon name="external-link" :size="18" />
        </template>
        {{ compact ? '旧版' : '回到旧版' }}
      </n-button>
      <span class="header-action-slot theme-action">
        <n-button
          class="header-icon-action"
          size="medium"
          quaternary
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
    </div>

      </div>
    </div>
  </div>
</template>
