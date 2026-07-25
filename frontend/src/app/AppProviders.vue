<script setup lang="ts">
import {
  darkTheme,
  NConfigProvider,
  NGlobalStyle,
  type GlobalThemeOverrides,
} from 'naive-ui';
import { computed } from 'vue';

import type { AppTheme } from './theme';

const props = defineProps<{
  theme: AppTheme;
}>();

const themeOverrides = computed<GlobalThemeOverrides>(() => ({
  common: {
    borderRadius: '6px',
    borderRadiusSmall: '6px',
    fontFamily:
      '"Source Han Sans SC VF", "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", sans-serif',
    primaryColor: props.theme === 'dark' ? '#F16A9C' : '#C82A70',
    primaryColorHover: props.theme === 'dark' ? '#FC85AF' : '#D23978',
    primaryColorPressed: props.theme === 'dark' ? '#DA578A' : '#AD215F',
    primaryColorSuppl: props.theme === 'dark' ? '#F16A9C' : '#C82A70',
    textColorBase: props.theme === 'dark' ? '#F1F0F4' : '#2E2B32',
  },
  Input: {
    heightMedium: '44px',
  },
  Radio: {
    buttonHeightMedium: '44px',
  },
}));
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
