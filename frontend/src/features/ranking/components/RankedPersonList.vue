<script setup lang="ts">
import { computed } from 'vue';

import SafeImage from '../../../shared/components/SafeImage.vue';
import { personImageCandidates } from '../../../shared/media/bangumiImage';
import {
  bilingualNameTitle,
  resolveBilingualName,
} from '../../../shared/names/bilingualName';
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
import RankingColumns from './RankingColumns.vue';

const props = withDefaults(
  defineProps<{
    activationLabel?: string;
    devicePixelRatio?: number;
    expandedPersonId?: number | null;
    identityLabels?: Readonly<Record<number, string>>;
    items: readonly RankingItem[];
    metricScale: RankingMetricScale;
    personal: boolean;
    selectedPersonId?: number | null;
    sort: RankingSort;
    workUnit: 'series' | 'subject';
  }>(),
  {
    devicePixelRatio: 1,
    expandedPersonId: null,
    selectedPersonId: null,
  },
);
const emit = defineEmits<{
  activate: [personId: number, trigger: HTMLElement];
}>();

const metricColumns = computed(() => (props.personal ? 4 : 3));

function primaryName(item: RankingItem): string {
  return resolveBilingualName(item.person).primary;
}

function secondaryName(item: RankingItem): string {
  return resolveBilingualName(item.person).secondary;
}

function identityTitle(item: RankingItem): string {
  const identityLabel = props.identityLabels?.[item.person.id];
  return identityLabel === undefined
    ? bilingualNameTitle(item.person)
    : `${bilingualNameTitle(item.person)}\n${identityLabel}`;
}

function activationSummary(item: RankingItem): string {
  const positions = props.identityLabels?.[item.person.id];
  const summary = `${item.rank}. ${primaryName(item)}，${secondaryName(item)}，${positions ? `${positions}，` : ''}${metricSummary(item)}`;
  return props.activationLabel ? `${summary}；${props.activationLabel}` : summary;
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

function progressClasses(item: RankingItem): Record<string, boolean> {
  const progress = rankingProgress(item, props.metricScale);
  return {
    'is-signed': props.sort === 'preference',
    'is-positive': progress.direction === 'positive',
    'is-negative': progress.direction === 'negative',
    'is-neutral': progress.direction === 'neutral',
  };
}

function activate(personId: number, event: MouseEvent): void {
  if (event.currentTarget instanceof HTMLElement) {
    emit('activate', personId, event.currentTarget);
  }
}

</script>

<template>
  <ranking-columns :personal="personal" :work-unit="workUnit" />

  <div class="ranked-person-list">
    <button
      v-for="item in items"
      :key="item.person.id"
      class="ranked-person-row person-row person-row--ranking"
      :class="[
        progressDirection(item),
        {
          'has-signed-progress': sort === 'preference',
          'is-focused': selectedPersonId === item.person.id,
          'is-selected': selectedPersonId === item.person.id,
          'is-signed': sort === 'preference',
        },
      ]"
      :style="progressStyle(item)"
      type="button"
      :data-person-id="item.person.id"
      :aria-controls="
        expandedPersonId === item.person.id
          ? 'person-detail-panel'
          : undefined
      "
      :aria-current="
        selectedPersonId === item.person.id ? 'true' : undefined
      "
      :aria-expanded="
        expandedPersonId === item.person.id ? 'true' : undefined
      "
      :aria-label="activationSummary(item)"
      @click="activate(item.person.id, $event)"
    >
      <span
        class="ranked-person-row__progress person-row__progress"
        :class="progressClasses(item)"
        aria-hidden="true"
      />
      <span class="ranked-person-row__rank person-row__rank">{{ item.rank }}</span>
      <safe-image
        class="ranked-person-row__avatar person-row__avatar"
        :sources="
          personImageCandidates(item.person.id, 36, devicePixelRatio)
        "
        :alt="primaryName(item)"
        decorative
        :width="36"
      />
      <span
        class="ranked-person-row__identity person-row__identity"
        :class="{ 'person-row__identity--positions': identityLabels?.[item.person.id] }"
        :title="identityTitle(item)"
      >
        <strong>{{ primaryName(item) }}</strong>
        <small>{{ secondaryName(item) }}</small>
        <small v-if="identityLabels?.[item.person.id]" class="person-row__positions">{{ identityLabels[item.person.id] }}</small>
      </span>
      <span
        class="ranked-person-row__metrics person-row__metrics"
        :class="{ 'is-global': !personal }"
        :style="{ '--ranking-metric-columns': metricColumns }"
        :aria-label="metricSummary(item)"
      >
        <span
          class="person-row__metric"
          :class="{ 'is-active': sort === 'count' }"
        >
          <strong>{{ item.workCount }}</strong>
        </span>
        <span
          class="person-row__metric"
          :class="{ 'is-active': sort === 'average' }"
        >
          <strong>{{ formatHundredths(item.average) }}</strong>
        </span>
        <span
          class="person-row__metric"
          :class="{ 'is-active': sort === 'overall' }"
        >
          <strong>{{ formatHundredths(item.overall) }}</strong>
        </span>
        <span
          v-if="personal"
          class="person-row__metric"
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

<style>
.ranked-person-results .person-row__identity--positions {
  grid-template-rows: 22px 20px 18px;
}

.ranked-person-results .person-row__identity--positions .person-row__positions {
  font-size: 12px;
  line-height: 18px;
}
</style>
