<script setup lang="ts">
import AppIcon from './AppIcon.vue';

withDefaults(
  defineProps<{
    error?: boolean;
    loadingTitle: string;
    errorTitle: string;
    retryLabel?: string;
  }>(),
  {
    error: false,
    retryLabel: '重试',
  },
);

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <section
    v-if="error"
    class="query-result-state surface-panel deferred-surface-state"
    data-deferred-surface
    :aria-busy="error ? undefined : 'true'"
    :aria-live="error ? undefined : 'polite'"
    :role="error ? 'alert' : 'status'"
  >
    <span
      class="state-icon"
      :class="{ 'state-icon--loading': !error }"
    >
      <app-icon :name="error ? 'refresh' : 'search'" :size="28" />
    </span>
    <h2>{{ error ? errorTitle : loadingTitle }}</h2>
    <button
      v-if="error"
      class="app-primary-action"
      type="button"
      @click="emit('retry')"
    >
      {{ retryLabel }}
    </button>
  </section>
  <slot v-else name="loading">
    <span role="status" aria-live="polite">{{ loadingTitle }}</span>
  </slot>
</template>

<style scoped>
.deferred-surface-state h2 {
  margin: 0;
  font-size: 28px;
  line-height: 1.25;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
</style>
