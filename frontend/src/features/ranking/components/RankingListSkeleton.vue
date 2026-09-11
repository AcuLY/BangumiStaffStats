<script setup lang="ts">
import { NSkeleton } from 'naive-ui';

import RankingColumns from './RankingColumns.vue';

withDefaults(
  defineProps<{
    pageSize?: number;
    personal?: boolean;
    showPositions?: boolean;
    workUnit?: 'series' | 'subject';
  }>(),
  {
    pageSize: 10,
    personal: false,
    showPositions: false,
    workUnit: 'subject',
  },
);
</script>

<template>
  <ranking-columns :personal="personal" :work-unit="workUnit" />

  <div class="ranking-row-skeletons" aria-hidden="true">
    <div
      v-for="index in pageSize"
      :key="index"
      class="ranking-row-skeleton"
    >
      <n-skeleton
        class="app-skeleton ranked-person-row__rank ranking-row-skeleton__rank"
        :sharp="false"
      />
      <n-skeleton
        class="app-skeleton ranked-person-row__avatar ranking-row-skeleton__avatar"
        :sharp="false"
      />
      <span class="ranked-person-row__identity ranking-row-skeleton__identity" :style="showPositions ? { gridTemplateRows: '22px 20px 18px' } : undefined">
        <n-skeleton class="app-skeleton" :sharp="false" />
        <n-skeleton class="app-skeleton" :sharp="false" />
        <n-skeleton v-if="showPositions" class="app-skeleton" :sharp="false" />
      </span>
      <span
        class="ranked-person-row__metrics ranking-row-skeleton__metrics"
        :class="{ 'is-global': !personal }"
        :style="{ '--ranking-metric-columns': personal ? 4 : 3 }"
      >
        <span v-for="metric in personal ? 4 : 3" :key="metric" class="person-row__metric">
          <strong><n-skeleton class="app-skeleton" width="68%" height="1lh" :sharp="false" /></strong>
        </span>
      </span>
    </div>
  </div>
</template>
