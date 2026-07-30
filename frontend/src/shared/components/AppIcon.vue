<script setup lang="ts">
withDefaults(
  defineProps<{
    name:
      | 'chevron-down'
      | 'chevron-left'
      | 'chevron-right'
      | 'close'
      | 'external-link'
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
    <template v-else-if="name === 'close'">
      <path d="m6 6 12 12M18 6 6 18" />
    </template>
    <template v-else-if="name === 'external-link'">
      <path d="M14 5h5v5M19 5l-8 8" />
      <path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
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
