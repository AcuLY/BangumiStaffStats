<script setup lang="ts">
import { computed } from 'vue';

import SafeImage from '../../../shared/components/SafeImage.vue';
import { personImageCandidates } from '../../../shared/media/bangumiImage';
import {
  formatHundredths,
  formatRational,
  rankingProgress,
} from '../format';
import type {
  RankingItem,
  RankingMetricScale,
  RankingSort,
} from '../model';

const props = withDefaults(
  defineProps<{
    devicePixelRatio?: number;
    items: readonly RankingItem[];
    metricScale: RankingMetricScale;
    personal: boolean;
    sort: RankingSort;
    workUnit: 'series' | 'subject';
  }>(),
  {
    devicePixelRatio: 1,
  },
);
const emit = defineEmits<{
  activate: [personId: number];
}>();

const metricColumns = computed(() => (props.personal ? 4 : 3));

function primaryName(item: RankingItem): string {
  return item.person.nameCN ?? item.person.name;
}

function secondaryName(item: RankingItem): string {
  return item.person.nameCN && item.person.nameCN !== item.person.name
    ? item.person.name
    : '人物资料';
}

function preference(item: RankingItem): string {
  return formatRational(item.preference?.score);
}

function metricSummary(item: RankingItem): string {
  return [
    `${item.workCount} 个${props.workUnit === 'series' ? '系列' : '作品'}`,
    `均分 ${formatHundredths(item.average)}`,
    `综合分 ${formatHundredths(item.overall)}`,
    ...(props.personal ? [`相对偏好 ${preference(item)}`] : []),
  ].join('，');
}

function progressStyle(item: RankingItem): Record<string, string> {
  const progress = rankingProgress(item, props.metricScale);
  return {
    '--ranking-progress': `${progress.percent}%`,
    '--ranking-progress-direction': progress.direction,
  };
}

function progressDirection(item: RankingItem): string {
  return `is-${rankingProgress(item, props.metricScale).direction}`;
}
</script>

<template>
  <div
    class="ranking-columns"
    :class="{ 'is-global': !personal }"
    aria-hidden="true"
  >
    <span>#</span>
    <span />
    <span>人物</span>
    <span
      class="ranking-columns__metrics"
      :style="{ '--ranking-metric-columns': metricColumns }"
    >
      <span>{{ workUnit === 'series' ? '系列' : '作品' }}</span>
      <span>均分</span>
      <span>综合</span>
      <span v-if="personal">偏好</span>
    </span>
  </div>

  <div class="ranked-person-list">
    <button
      v-for="item in items"
      :key="item.person.id"
      class="ranked-person-row"
      :class="[
        progressDirection(item),
        { 'is-signed': sort === 'preference' },
      ]"
      :style="progressStyle(item)"
      type="button"
      :aria-label="`${item.rank}. ${primaryName(item)}，${secondaryName(item)}，${metricSummary(item)}`"
      @click="emit('activate', item.person.id)"
    >
      <span class="ranked-person-row__progress" aria-hidden="true" />
      <span class="ranked-person-row__rank">{{ item.rank }}</span>
      <safe-image
        class="ranked-person-row__avatar"
        :sources="
          personImageCandidates(item.person.id, 36, devicePixelRatio)
        "
        :alt="primaryName(item)"
        decorative
        :width="36"
      />
      <span class="ranked-person-row__identity">
        <strong :title="primaryName(item)">{{ primaryName(item) }}</strong>
        <small :title="secondaryName(item)">{{ secondaryName(item) }}</small>
      </span>
      <span
        class="ranked-person-row__metrics"
        :style="{ '--ranking-metric-columns': metricColumns }"
        :aria-label="metricSummary(item)"
      >
        <span :class="{ 'is-active': sort === 'count' }">
          <strong>{{ item.workCount }}</strong>
        </span>
        <span :class="{ 'is-active': sort === 'average' }">
          <strong>{{ formatHundredths(item.average) }}</strong>
        </span>
        <span :class="{ 'is-active': sort === 'overall' }">
          <strong>{{ formatHundredths(item.overall) }}</strong>
        </span>
        <span
          v-if="personal"
          :class="{
            'is-active': sort === 'preference',
            'is-unavailable': item.preference === null,
          }"
        >
          <strong>{{ preference(item) }}</strong>
        </span>
      </span>
    </button>
  </div>
</template>
