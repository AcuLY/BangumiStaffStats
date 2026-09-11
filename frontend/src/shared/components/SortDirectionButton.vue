<script setup lang="ts">
import { NButton, type ButtonProps } from 'naive-ui';
import { computed } from 'vue';

import AppIcon from './AppIcon.vue';

const props = withDefaults(
  defineProps<{
    contextLabel?: string;
    order: 'asc' | 'desc';
    size: 'small' | 'medium';
  }>(),
  {
    contextLabel: '排序方向',
  },
);
const emit = defineEmits<{
  change: [order: 'asc' | 'desc'];
}>();

const controlSurfaceThemeOverrides: NonNullable<
  ButtonProps['themeOverrides']
> = {
  border: '1px solid var(--control-outline)',
  color: 'var(--control-background)',
  colorDisabled: 'var(--control-background)',
  colorFocus: 'var(--control-background)',
  colorHover: 'var(--control-background)',
  colorPressed: 'var(--control-background)',
};

const ascending = computed(() => props.order === 'asc');
const currentLabel = computed(() => (ascending.value ? '升序' : '降序'));
const nextLabel = computed(() => (ascending.value ? '降序' : '升序'));
const accessibleLabel = computed(
  () =>
    `${props.contextLabel}：当前${currentLabel.value}，切换为${nextLabel.value}`,
);

function toggle(): void {
  emit('change', props.order === 'asc' ? 'desc' : 'asc');
}
</script>

<template>
  <n-button
    class="ranking-order-button"
    :size="size"
    :theme-overrides="controlSurfaceThemeOverrides"
    attr-type="button"
    :aria-label="accessibleLabel"
    :title="accessibleLabel"
    @click="toggle"
  >
    <span class="ranking-order-button__content">
      <span>{{ currentLabel }}</span>
      <app-icon
        name="arrow-down"
        :size="16"
        :class="{ 'is-ascending': ascending }"
      />
    </span>
  </n-button>
</template>

<style scoped>
.ranking-order-button {
  min-width: 80px;
}

.ranking-order-button:not(:hover):not(:focus):not(:active) {
  color: var(--control-text);
}
</style>
