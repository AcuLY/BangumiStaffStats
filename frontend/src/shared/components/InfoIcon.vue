<script setup lang="ts">
import { InformationCircleOutline } from '@vicons/ionicons5';

withDefaults(defineProps<{ size?: number }>(), { size: 18 });
</script>

<template>
  <information-circle-outline
    class="info-icon"
    :width="size"
    :height="size"
    fill="currentColor"
    aria-hidden="true"
  />
</template>
