<script setup lang="ts">
import { NDivider } from 'naive-ui';

defineProps<{ vertical?: boolean }>();

const themeOverrides = { color: 'var(--divider)' };
</script>

<template>
  <n-divider class="content-divider" :vertical="vertical" :theme-overrides="themeOverrides" />
</template>

<style scoped>
.content-divider {
  margin: 0;
  flex-shrink: 0;
}
</style>
