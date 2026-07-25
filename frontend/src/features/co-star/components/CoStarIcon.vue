<script setup lang="ts">
withDefaults(
  defineProps<{
    name: 'check' | 'edit' | 'people';
    size?: number;
  }>(),
  {
    size: 18,
  },
);
</script>

<template>
  <svg
    class="co-star-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'check'">
      <path d="m5 12.5 4.2 4.2L19 7" />
    </template>
    <template v-else-if="name === 'edit'">
      <path d="m4 20 4.2-1 10.6-10.6a2.1 2.1 0 0 0-3-3L5.2 16Z" />
      <path d="m14.8 6.4 2.8 2.8" />
    </template>
    <template v-else>
      <circle cx="9" cy="8.5" r="3" />
      <circle cx="17" cy="9.5" r="2.3" />
      <path d="M3.5 19c.5-3.7 2.3-5.5 5.5-5.5s5 1.8 5.5 5.5" />
      <path d="M14.2 14.5c2.7-.6 4.8.8 5.6 3.8" />
    </template>
  </svg>
</template>
