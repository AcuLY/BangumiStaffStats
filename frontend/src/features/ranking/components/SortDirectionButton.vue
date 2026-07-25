<script setup lang="ts">
import AppIcon from '../../../shared/components/AppIcon.vue';
import type { RankingOrder } from '../model';

const props = defineProps<{
  order: RankingOrder;
}>();
const emit = defineEmits<{
  change: [order: RankingOrder];
}>();

function toggle(): void {
  emit('change', props.order === 'asc' ? 'desc' : 'asc');
}
</script>

<template>
  <button
    class="ranking-order-button"
    type="button"
    :aria-label="
      order === 'asc'
        ? '当前为升序，切换为降序'
        : '当前为降序，切换为升序'
    "
    :title="order === 'asc' ? '升序' : '降序'"
    @click="toggle"
  >
    <app-icon
      name="chevron-down"
      :size="16"
      :class="{ 'is-ascending': order === 'asc' }"
    />
    <span>{{ order === 'asc' ? '升序' : '降序' }}</span>
  </button>
</template>
