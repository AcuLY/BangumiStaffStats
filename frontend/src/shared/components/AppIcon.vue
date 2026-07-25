<script setup lang="ts">
withDefaults(
  defineProps<{
    name:
      | 'chevron-down'
      | 'chevron-left'
      | 'chevron-right'
      | 'image'
      | 'person'
      | 'refresh'
      | 'search';
    size?: number;
  }>(),
  {
    size: 18,
  },
);
</script>

<template>
  <svg
    class="app-icon"
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
    <template v-if="name === 'search'">
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m16 16 4 4" />
    </template>
    <template v-else-if="name === 'person'">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20c.6-4 2.8-6 6.5-6s5.9 2 6.5 6" />
    </template>
    <template v-else-if="name === 'image'">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m5 18 4.5-4 3 2.5 2.5-2 4 3.5" />
    </template>
    <template v-else-if="name === 'refresh'">
      <path d="M19 7v5h-5" />
      <path d="M18 12a6.5 6.5 0 1 0-1.4 4" />
    </template>
    <path
      v-else-if="name === 'chevron-left'"
      d="m14.5 5-7 7 7 7"
    />
    <path
      v-else-if="name === 'chevron-right'"
      d="m9.5 5 7 7-7 7"
    />
    <path
      v-else-if="name === 'chevron-down'"
      d="m6 9 6 6 6-6"
    />
  </svg>
</template>
