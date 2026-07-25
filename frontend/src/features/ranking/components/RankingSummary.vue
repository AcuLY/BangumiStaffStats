<script setup lang="ts">
import type { RankingPayload } from '../model';

defineProps<{
  summary: RankingPayload['summary'];
}>();
</script>

<template>
  <p class="ranking-summary" role="status" aria-live="polite">
    共统计到
    <strong>{{ summary.personCount }}</strong>
    个人物，
    <strong>{{ summary.workCount }}</strong>
    个{{ summary.workUnit === 'series' ? '系列' : '条目' }}<template
      v-if="summary.characterCount !== undefined"
    >，<strong>{{ summary.characterCount }}</strong> 个角色</template>
  </p>
</template>
