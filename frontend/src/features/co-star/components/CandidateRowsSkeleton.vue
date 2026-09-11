<script setup lang="ts">
import { NSkeleton } from 'naive-ui';

withDefaults(defineProps<{ count?: number; showPositions?: boolean }>(), {
  count: 20,
  showPositions: true,
});
</script>

<template>
  <div class="candidate-row-skeletons" aria-hidden="true">
    <div v-for="index in count" :key="index" class="candidate-row candidate-row--skeleton">
      <span class="candidate-row__portrait">
        <n-skeleton class="app-skeleton" width="100%" height="100%" :sharp="false" />
      </span>
      <span class="candidate-row__identity candidate-row-skeleton__identity">
        <strong><n-skeleton class="app-skeleton" width="82%" height="1lh" :sharp="false" /></strong>
        <small class="candidate-row-skeleton__facts">
          <n-skeleton class="app-skeleton" width="24px" height="1lh" :sharp="false" />
          <n-skeleton class="app-skeleton" width="36px" height="1lh" :sharp="false" />
        </small>
        <span v-if="showPositions" class="candidate-row__positions"><n-skeleton class="app-skeleton" width="68%" height="1lh" :sharp="false" /></span>
      </span>
    </div>
  </div>
</template>
