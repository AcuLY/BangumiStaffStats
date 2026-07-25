<script setup lang="ts">
import { NButton } from 'naive-ui';
import { computed } from 'vue';

import AppIcon from '../../../shared/components/AppIcon.vue';
import { useCompactLayout } from '../../query/composables/useCompactLayout';
import type { RankingOrder } from '../model';

const props = withDefaults(
  defineProps<{
    contextLabel?: string;
    order: RankingOrder;
  }>(),
  {
    contextLabel: '排序方向',
  },
);
const emit = defineEmits<{
  change: [order: RankingOrder];
}>();

const compact = useCompactLayout();
const controlSize = computed(() => (compact.value ? 'small' : 'medium'));
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
    :size="controlSize"
    attr-type="button"
    :aria-label="accessibleLabel"
    :title="accessibleLabel"
    @click="toggle"
  >
    <span class="ranking-order-button__content">
      <span>{{ currentLabel }}</span>
      <app-icon
        name="chevron-down"
        :size="16"
        :class="{ 'is-ascending': ascending }"
      />
    </span>
  </n-button>
</template>
