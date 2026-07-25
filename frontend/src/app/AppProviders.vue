<script setup lang="ts">
import {
  darkTheme,
  NConfigProvider,
  NGlobalStyle,
  type GlobalThemeOverrides,
} from 'naive-ui';
import { computed } from 'vue';

import type { AppTheme } from './theme';
import { appThemeOverrides } from './themeOverrides';

const props = defineProps<{
  theme: AppTheme;
}>();

const themeOverrides = computed<GlobalThemeOverrides>(() =>
  appThemeOverrides(props.theme),
);
</script>

<template>
  <n-config-provider
    :theme="theme === 'dark' ? darkTheme : null"
    :theme-overrides="themeOverrides"
  >
    <n-global-style />
    <slot />
  </n-config-provider>
</template>
