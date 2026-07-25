<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import {
  formatHundredths,
  primaryEntityName,
  type PersonDetailPayload,
  type PersonDetailRatingSet,
} from '../model';

const props = defineProps<{
  payload: PersonDetailPayload;
}>();

type RatingSource = 'global' | 'personal';
const source = ref<RatingSource>(
  props.payload.ratings.personal ? 'personal' : 'global',
);

watch(
  () => props.payload.person.id,
  () => {
    source.value = props.payload.ratings.personal ? 'personal' : 'global';
  },
);
watch(
  () => props.payload.ratings.personal,
  (personal) => {
    if (!personal) {
      source.value = 'global';
    }
  },
);

const rating = computed<PersonDetailRatingSet>(
  () =>
    (source.value === 'personal' ? props.payload.ratings.personal : null) ??
    props.payload.ratings.global,
);
const maxCount = computed(() =>
  Math.max(1, ...rating.value.buckets.map((bucket) => bucket.count)),
);
const timelinePoints = computed(() => {
  const entries = rating.value.timeline;
  return entries.map((entry, index) => ({
    entry,
    x:
      entries.length === 1
        ? 220
        : 28 + (index / (entries.length - 1)) * 384,
    y: 18 + ((1000 - entry.average) / 1000) * 108,
  }));
});
const timelineLabel = computed(() =>
  timelinePoints.value
    .map(
      ({ entry }) =>
        `${entry.year} 年第 ${entry.quarter} 季度，均分 ${formatHundredths(entry.average)}，${entry.count} 个样本`,
    )
    .join('；'),
);

function bucketLabel(
  bucket: PersonDetailRatingSet['buckets'][number],
): string {
  const examples = bucket.examples
    .map((example) => primaryEntityName(example))
    .join('、');
  return [
    `${bucket.score} 分，${bucket.count} 个`,
    examples ? `示例：${examples}` : '',
    bucket.hiddenCount ? `另有 ${bucket.hiddenCount} 个未列出` : '',
  ]
    .filter(Boolean)
    .join('；');
}
</script>

<template>
  <section
    class="person-inspector__section rating-evidence"
    aria-labelledby="person-ratings-title"
  >
    <header class="person-section-heading">
      <div>
        <h3 id="person-ratings-title">评分分布</h3>
        <p>
          {{ rating.validCount }} 个有效样本 · 均分
          {{ formatHundredths(rating.average) }}
        </p>
      </div>
      <div
        v-if="payload.ratings.personal"
        class="person-segmented-control"
        role="group"
        aria-label="评分数据来源"
      >
        <button
          type="button"
          :aria-pressed="source === 'personal'"
          @click="source = 'personal'"
        >
          我的评分
        </button>
        <button
          type="button"
          :aria-pressed="source === 'global'"
          @click="source = 'global'"
        >
          全站评分
        </button>
      </div>
    </header>

    <div
      v-if="rating.validCount"
      class="person-score-distribution"
      role="img"
      :aria-label="`${source === 'personal' ? '我的' : '全站'}评分分布`"
    >
      <div
        v-for="bucket in rating.buckets"
        :key="bucket.score"
        class="person-score-bar"
        :class="{ 'is-empty': bucket.count === 0 }"
        :aria-label="bucketLabel(bucket)"
        :tabindex="bucket.count ? 0 : undefined"
      >
        <span class="person-score-bar__count">{{ bucket.count }}</span>
        <span class="person-score-bar__track" aria-hidden="true">
          <i
            :style="{
              '--person-score-height': `${(bucket.count / maxCount) * 100}%`,
            }"
          />
        </span>
        <small>{{ bucket.score }}</small>
      </div>
    </div>
    <p v-else class="person-section-empty">没有可展示的评分样本</p>

    <div v-if="timelinePoints.length" class="person-rating-timeline">
      <h4>季度评分走势</h4>
      <svg
        viewBox="0 0 440 154"
        role="img"
        :aria-label="timelineLabel"
        preserveAspectRatio="none"
      >
        <g class="person-rating-timeline__grid" aria-hidden="true">
          <line v-for="score in [0, 250, 500, 750, 1000]" :key="score"
            x1="28" x2="412"
            :y1="18 + ((1000 - score) / 1000) * 108"
            :y2="18 + ((1000 - score) / 1000) * 108"
          />
        </g>
        <polyline
          v-if="timelinePoints.length > 1"
          class="person-rating-timeline__line"
          :points="timelinePoints.map((point) => `${point.x},${point.y}`).join(' ')"
        />
        <g
          v-for="point in timelinePoints"
          :key="`${point.entry.year}-${point.entry.quarter}`"
          class="person-rating-timeline__point"
        >
          <circle :cx="point.x" :cy="point.y" r="4.5">
            <title>
              {{ point.entry.year }} Q{{ point.entry.quarter }} ·
              {{ formatHundredths(point.entry.average) }} ·
              {{ point.entry.count }} 个
            </title>
          </circle>
          <text :x="point.x" y="146" text-anchor="middle">
            {{ point.entry.year }} Q{{ point.entry.quarter }}
          </text>
        </g>
      </svg>
    </div>
  </section>
</template>
