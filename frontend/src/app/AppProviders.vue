<script setup lang="ts">
import {
  NConfigProvider,
  NGlobalStyle,
  type GlobalThemeOverrides,
} from 'naive-ui';

const themeOverrides: GlobalThemeOverrides = {
  common: {
    borderRadius: '6px',
    borderRadiusSmall: '6px',
    fontFamily:
      '"Source Han Sans SC VF", "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", sans-serif',
    primaryColor: '#C82A70',
    primaryColorHover: '#D23978',
    primaryColorPressed: '#AD215F',
    primaryColorSuppl: '#C82A70',
  },
};
</script>

<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <n-global-style />
    <slot />
  </n-config-provider>
</template>
