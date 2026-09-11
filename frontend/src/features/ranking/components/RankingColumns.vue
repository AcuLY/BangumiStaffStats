<script setup lang="ts">
defineProps<{
  personal: boolean;
  workUnit: 'series' | 'subject';
}>();
</script>

<template>
  <div
    class="ranking-columns list-columns list-columns--ranking"
    :class="{ 'is-global': !personal }"
    aria-hidden="true"
  >
    <span>#</span>
    <span />
    <span>人物</span>
    <span
      class="ranking-columns__metrics list-columns__metrics"
      :class="{ 'is-global': !personal }"
      :style="{ '--ranking-metric-columns': personal ? 4 : 3 }"
    >
      <span>{{ workUnit === 'series' ? '系列' : '作品' }}</span>
      <span>均分</span>
      <span>综合</span>
      <span v-if="personal">偏好</span>
    </span>
  </div>
</template>
