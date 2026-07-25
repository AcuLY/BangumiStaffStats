<script setup lang="ts">
import { NFlex, NNumberAnimation, NStatistic } from 'naive-ui';
import { computed } from 'vue';

import { useCompactLayout } from '../../query/composables/useCompactLayout';
import type { RankingPayload } from '../model';

const props = defineProps<{
  summary: RankingPayload['summary'];
}>();

const compact = useCompactLayout();
const hasCharacters = computed(
  () => props.summary.characterCount !== undefined,
);
const statisticThemeOverrides = computed(() => ({
  valueFontSize: hasCharacters.value
    ? '1rem'
    : compact.value
      ? '1.125rem'
      : '1.25rem',
}));
</script>

<template>
  <div class="ranking-result-stats" role="status" aria-live="polite">
    <n-flex
      class="ranking-result-stats__line"
      :size="hasCharacters ? 2 : 4"
      align="flex-end"
      :wrap="false"
    >
      <n-statistic
        label="共统计到"
        tabular-nums
        :theme-overrides="statisticThemeOverrides"
      >
        <n-number-animation :from="0" :to="summary.personCount" />
        <template #suffix> 个人物，</template>
      </n-statistic>
      <n-statistic
        :label="'\u200B'"
        tabular-nums
        :theme-overrides="statisticThemeOverrides"
      >
        <n-number-animation :from="0" :to="summary.workCount" />
        <template #suffix>
          {{ summary.workUnit === 'series' ? ' 个系列' : ' 个条目' }}<template
            v-if="hasCharacters"
          >，</template>
        </template>
      </n-statistic>
      <n-statistic
        v-if="summary.characterCount !== undefined"
        :label="'\u200B'"
        tabular-nums
        :theme-overrides="statisticThemeOverrides"
      >
        <n-number-animation :from="0" :to="summary.characterCount" />
        <template #suffix> 个角色</template>
      </n-statistic>
    </n-flex>
  </div>
</template>
