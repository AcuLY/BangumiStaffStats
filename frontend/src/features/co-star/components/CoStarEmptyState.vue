<script setup lang="ts">
import CoStarIcon from './CoStarIcon.vue';

const emit = defineEmits<{
  select: [trigger: HTMLElement];
}>();

function select(event: MouseEvent): void {
  if (event.currentTarget instanceof HTMLElement) {
    emit('select', event.currentTarget);
  }
}
</script>

<template>
  <div class="co-star-empty surface-panel">
    <span class="co-star-empty__icon">
      <co-star-icon name="people" :size="30" />
    </span>
    <h2>尚未选择人物</h2>
    <button class="app-primary-action" type="button" @click="select">
      选择人物
    </button>
  </div>
</template>
