<script setup lang="ts">
import AppIcon from '../../../shared/components/AppIcon.vue';

defineProps<{
  name: 'check' | 'edit' | 'info' | 'people' | 'warning';
  size?: number;
}>();
</script>

<template>
  <app-icon class="co-star-icon" :name="name" :size="size" />
</template>
