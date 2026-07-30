<script setup lang="ts">
defineProps<{
  name:
    | 'check'
    | 'chevron'
    | 'edit'
    | 'info'
    | 'moon'
    | 'plus'
    | 'search'
    | 'share'
    | 'sun';
  size?: number;
}>();
</script>

<template>
  <svg
    class="query-icon"
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'share'">
      <circle cx="18" cy="5" r="2.4" />
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="19" r="2.4" />
      <path d="m8.2 10.9 7.6-4.6M8.2 13.1l7.6 4.6" />
    </template>
    <template v-else-if="name === 'check'">
      <path d="m5 12.5 4.2 4.2L19 7" />
    </template>
    <template v-else-if="name === 'edit'">
      <path d="M13.7 5.3 18.7 10.3M4.5 19.5l3.8-.8L19.4 7.6a1.8 1.8 0 0 0 0-2.5l-.5-.5a1.8 1.8 0 0 0-2.5 0L5.3 15.7l-.8 3.8Z" />
    </template>
    <template v-else-if="name === 'search'">
      <circle cx="10.7" cy="10.7" r="6.4" />
      <path d="m15.5 15.5 4.2 4.2" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 6v12M6 12h12" />
    </template>
    <template v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'chevron'">
      <path d="m7 9.5 5 5 5-5" />
    </template>
    <template v-else-if="name === 'moon'">
      <path d="M20 15.3A8.1 8.1 0 0 1 8.7 4a8.2 8.2 0 1 0 11.3 11.3Z" />
    </template>
    <template v-else>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </template>
  </svg>
</template>
