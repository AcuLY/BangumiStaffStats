import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export type RuntimePhase = 'booting' | 'ready' | 'failed';

export const useRuntimeStore = defineStore('runtime', () => {
  const phase = ref<RuntimePhase>('booting');
  const failureMessage = ref<string | null>(null);

  const isReady = computed(() => phase.value === 'ready');

  function markReady(): void {
    failureMessage.value = null;
    phase.value = 'ready';
  }

  function markFailed(): void {
    failureMessage.value = '应用基础启动失败';
    phase.value = 'failed';
  }

  return {
    failureMessage,
    isReady,
    markFailed,
    markReady,
    phase,
  };
});
