<script setup lang="ts">
import type { ActiveQueryProgress } from '../progress';
defineProps<{ active: readonly ActiveQueryProgress[] }>();
</script>

<template>
  <section v-if="active.length" class="query-progress" aria-label="实时查询进度">
    <div v-for="item in active" :key="item.id" class="query-progress-item" :data-operation="item.reference.split('/').pop()">
      <p class="query-progress-description" role="status" aria-live="polite" aria-atomic="true">
        <strong>{{ item.label }}</strong>
        <span>{{ item.message }}</span>
        <span v-if="item.total !== undefined && item.completed !== undefined" class="query-progress-count">本阶段 {{ item.completed }} / {{ item.total }}</span>
      </p>
      <progress :aria-label="`${item.label}：${item.message}`" :max="item.total ?? 1" :value="item.total !== undefined ? item.completed : undefined" />
    </div>
  </section>
</template>

<style scoped>
.query-progress { display: grid; gap: var(--space-3); margin-block: var(--space-3); }
.query-progress-item { min-width: 0; }
.query-progress-description {
  display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-2);
  margin: 0 0 var(--space-1); color: var(--text-secondary); font-size: 13px; overflow-wrap: anywhere;
}
.query-progress-description strong { color: var(--text-primary); font-weight: 600; }
.query-progress-count { font-variant-numeric: tabular-nums; }
progress { display: block; width: 100%; height: 6px; accent-color: var(--brand); }
</style>
