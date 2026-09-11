<script setup lang="ts">
import AppIcon from '../../../shared/components/AppIcon.vue';

defineProps<{
  name:
    | 'check'
    | 'chevron'
    | 'edit'
    | 'external-link'
    | 'info'
    | 'moon'
    | 'plus'
    | 'search'
    | 'sun';
  size?: number;
}>();
</script>

<template>
  <app-icon
    class="query-icon"
    :name="name === 'chevron' ? 'chevron-down' : name"
    :size="size"
  />
</template>
