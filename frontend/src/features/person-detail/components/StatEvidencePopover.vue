<script setup lang="ts">
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

function onDocumentPointerDown(event: PointerEvent): void {
  if (open.value && !root.value?.contains(event.target as Node)) {
    close();
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    close();
    root.value?.querySelector<HTMLButtonElement>('button')?.focus();
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <span ref="root" class="stat-evidence">
    <button
      class="stat-evidence__trigger"
      type="button"
      :aria-label="label"
      :aria-controls="panelId"
      :aria-expanded="open"
      @click="open = !open"
    >
      i
    </button>
    <span
      v-if="open"
      :id="panelId"
      class="stat-evidence__panel"
      role="status"
    >
      <slot />
    </span>
  </span>
</template>
