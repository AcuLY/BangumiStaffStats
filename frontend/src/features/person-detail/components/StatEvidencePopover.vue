<script setup lang="ts">
import { NPopover } from 'naive-ui';
import {
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
} from 'vue';

const props = defineProps<{
  label: string;
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const panelId = `stat-evidence-${useId()}`;

function close(): void {
  open.value = false;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    close();
    root.value?.querySelector<HTMLButtonElement>('button')?.focus();
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <span ref="root" class="stat-evidence">
    <n-popover
      :show="open"
      trigger="manual"
      placement="top-end"
      :animated="false"
      style="max-width: min(336px, calc(100dvw - 72px));"
      content-class="person-stat-evidence__content"
      @clickoutside="close"
    >
      <template #trigger>
        <button
          class="stat-evidence__trigger"
          type="button"
          :aria-label="label"
          :aria-controls="panelId"
          :aria-expanded="open"
          @mouseenter="open = true"
          @mouseleave="open = false"
          @focus="open = true"
          @blur="open = false"
          @click.stop="open = true"
          @keydown.esc.stop.prevent="close"
        >
          i
        </button>
      </template>
      <span :id="panelId" class="stat-evidence__panel" role="status">
        <slot />
      </span>
    </n-popover>
  </span>
</template>
