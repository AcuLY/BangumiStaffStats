<script setup lang="ts">
import { NRadioButton, NRadioGroup, NTooltip } from 'naive-ui';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { useCompactLayout } from '../../query/composables/useCompactLayout';
import {
  closestTimelinePointIndex,
  timelineHitSizeInViewBox,
} from '../ratingTimelineGeometry';
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
type ChartMode = 'score' | 'time';
const compact = useCompactLayout();
const controlSize = computed(() => (compact.value ? 'small' : 'medium'));
const chartMode = ref<ChartMode>('score');
const source = ref<RatingSource>(
  props.payload.ratings.personal ? 'personal' : 'global',
);
const hoveredBucket = ref<number | null>(null);
const timelineSvg = ref<SVGSVGElement | null>(null);
const timelineHitSize = ref({ height: 44, width: 44 });
const hoveredTimelineIndex = ref<number | null>(null);
const focusedTimelineIndex = ref<number | null>(null);
let timelineResizeObserver: ResizeObserver | null = null;
const seriesMode = computed(
  () => props.payload.summary.workUnit === 'series',
);
const sourceLabel = computed(() =>
  source.value === 'personal'
    ? '我的评分'
    : props.payload.scope === 'global'
      ? '评分'
      : '全站评分',
);
const resultUnit = computed(() =>
  seriesMode.value ? '个系列' : '部作品',
);

watch(
  () => props.payload.person.id,
  () => {
    source.value = props.payload.ratings.personal ? 'personal' : 'global';
    chartMode.value = 'score';
    hoveredBucket.value = null;
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
watch(seriesMode, (enabled) => {
  if (enabled) {
    chartMode.value = 'score';
  }
});

const rating = computed<PersonDetailRatingSet>(
  () =>
    (source.value === 'personal' ? props.payload.ratings.personal : null) ??
    props.payload.ratings.global,
);
const maxCount = computed(() =>
  Math.max(1, ...rating.value.buckets.map((bucket) => bucket.count)),
);
const tickStep = computed(() => {
  const roughStep = maxCount.value / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const multiplier =
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 2.5
          ? 2.5
          : normalized <= 5
            ? 5
            : 10;
  return Math.max(1, multiplier * magnitude);
});
const axisMax = computed(
  () => Math.ceil(maxCount.value / tickStep.value) * tickStep.value,
);
const ticks = computed(() =>
  Array.from(
    { length: Math.round(axisMax.value / tickStep.value) + 1 },
    (_, index) => index * tickStep.value,
  ),
);
const timelinePoints = computed(() => {
  const entries = rating.value.timeline;
  return entries.map((entry, index) => ({
    entry,
    x:
      entries.length === 1
        ? 220
        : 34 + (index / (entries.length - 1)) * 392,
    y: 18 + ((1000 - entry.average) / 1000) * 176,
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
const activeTimelineIndex = computed(
  () => hoveredTimelineIndex.value ?? focusedTimelineIndex.value,
);
const activeTimelinePoint = computed(() => {
  const index = activeTimelineIndex.value;
  return index === null ? null : (timelinePoints.value[index] ?? null);
});

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

function moveTimelineFocus(
  event: KeyboardEvent,
  currentIndex: number,
): void {
  const keyOffsets: Partial<Record<string, number>> = {
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -1,
  };
  let nextIndex: number | undefined;
  if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = timelinePoints.value.length - 1;
  } else if (event.key in keyOffsets) {
    const offset = keyOffsets[event.key]!;
    nextIndex = Math.min(
      timelinePoints.value.length - 1,
      Math.max(0, currentIndex + offset),
    );
  }
  if (nextIndex === undefined || nextIndex === currentIndex) {
    return;
  }
  event.preventDefault();
  const currentTarget =
    event.currentTarget as SVGElement | null;
  const targets =
    currentTarget?.ownerSVGElement?.querySelectorAll<SVGElement>(
      '.rating-time-chart__hit-target',
    );
  targets?.item(nextIndex).focus();
}

function syncTimelineHitSize(): void {
  const bounds = timelineSvg.value?.getBoundingClientRect();
  if (!bounds) {
    return;
  }
  timelineHitSize.value = timelineHitSizeInViewBox(
    bounds.width,
    bounds.height,
  );
}

function observeTimelineSvg(): void {
  timelineResizeObserver?.disconnect();
  timelineResizeObserver = null;
  const svg = timelineSvg.value;
  if (!svg) {
    return;
  }
  if (typeof ResizeObserver === 'function') {
    timelineResizeObserver = new ResizeObserver(syncTimelineHitSize);
    timelineResizeObserver.observe(svg);
  }
  syncTimelineHitSize();
}

function nearestTimelineIndex(event: PointerEvent): number | null {
  const svg = timelineSvg.value;
  if (!svg) {
    return null;
  }
  return closestTimelinePointIndex(
    event.clientX,
    event.clientY,
    svg.getBoundingClientRect(),
    timelinePoints.value,
  );
}

function updateHoveredTimelinePoint(event: PointerEvent): void {
  hoveredTimelineIndex.value = nearestTimelineIndex(event);
}

function focusNearestTimelinePoint(event: PointerEvent): void {
  const index = nearestTimelineIndex(event);
  if (index === null) {
    return;
  }
  event.preventDefault();
  timelineSvg.value
    ?.querySelectorAll<SVGElement>('.rating-time-chart__hit-target')
    .item(index)
    .focus();
}

watch(
  [chartMode, () => timelinePoints.value.length],
  async () => {
    await nextTick();
    observeTimelineSvg();
  },
);

onMounted(observeTimelineSvg);
onBeforeUnmount(() => {
  timelineResizeObserver?.disconnect();
});
</script>

<template>
  <section
    class="person-inspector__section rating-evidence"
    aria-labelledby="person-ratings-title"
  >
    <header
      class="person-section-heading rating-distribution-panel__heading"
    >
      <h2 id="person-ratings-title">
        {{ seriesMode ? '系列均分分布' : '评分分布' }}
      </h2>
      <div
        v-if="!seriesMode || payload.ratings.personal"
        class="rating-distribution-panel__controls"
      >
        <n-radio-group
          v-if="!seriesMode"
          v-model:value="chartMode"
          :size="controlSize"
          role="radiogroup"
          aria-label="评分图表维度"
        >
          <n-radio-button value="score">按评分</n-radio-button>
          <n-radio-button value="time">按时间</n-radio-button>
        </n-radio-group>
        <n-radio-group
          v-if="payload.ratings.personal"
          v-model:value="source"
          :size="controlSize"
          role="radiogroup"
          aria-label="评分数据来源"
        >
          <n-radio-button value="personal">我的评分</n-radio-button>
          <n-radio-button value="global">全站评分</n-radio-button>
        </n-radio-group>
      </div>
    </header>

    <div
      v-if="chartMode === 'score' && rating.validCount"
      class="person-score-distribution score-distribution"
      role="img"
      :aria-label="`${sourceLabel}分布：${rating.buckets
        .map((bucket) => `${bucket.score} 分 ${bucket.count} ${resultUnit}`)
        .join('，')}`"
      :style="{ '--distribution-steps': Math.max(1, ticks.length - 1) }"
    >
      <div class="score-distribution__axis" aria-hidden="true">
        <span
          v-for="tick in ticks"
          :key="tick"
          :style="{ bottom: `${(tick / axisMax) * 100}%` }"
        >{{ tick }}</span>
      </div>
      <div
        v-for="bucket in rating.buckets"
        :key="bucket.score"
        class="person-score-bar score-bar"
        :class="{
          'is-empty': bucket.count === 0,
          'score-bar--empty': bucket.count === 0,
          'score-bar--peak':
            bucket.count === maxCount && bucket.count > 0,
        }"
        :aria-label="bucketLabel(bucket)"
        :tabindex="bucket.count ? 0 : undefined"
        @mouseenter="hoveredBucket = bucket.count ? bucket.score : null"
        @mouseleave="hoveredBucket = null"
        @focus="hoveredBucket = bucket.count ? bucket.score : null"
        @blur="hoveredBucket = null"
      >
        <span
          class="person-score-bar__track score-bar__track"
          aria-hidden="true"
        >
          <n-tooltip
            v-if="bucket.count"
            :show="hoveredBucket === bucket.score"
            trigger="manual"
            placement="top"
            :animated="false"
            style="max-width: min(336px, calc(100dvw - 72px));"
          >
            <template #trigger>
              <span class="person-score-bar__count score-bar__value">
                {{ bucket.count }}
              </span>
            </template>
            <span>{{ bucketLabel(bucket) }}</span>
          </n-tooltip>
          <i
            :style="{
              '--person-score-height': `${(bucket.count / axisMax) * 100}%`,
              '--score-bar-height': `${(bucket.count / axisMax) * 100}%`,
            }"
          />
        </span>
        <small>{{ bucket.score }}</small>
      </div>
    </div>
    <p
      v-else-if="chartMode === 'score'"
      class="person-section-empty rating-distribution-panel__empty"
    >
      没有可用于统计的{{ sourceLabel }}
    </p>

    <template v-else>
      <p class="person-rating-timeline__meaning">
        圆点表示季度均分 · 折线表示评分变化
      </p>
      <div class="person-rating-timeline rating-time-chart__viewport">
      <svg
        v-if="timelinePoints.length"
        ref="timelineSvg"
        class="rating-time-chart"
        viewBox="0 0 440 236"
        role="img"
        :aria-label="timelineLabel"
        preserveAspectRatio="none"
        @pointermove="updateHoveredTimelinePoint"
        @pointerdown="focusNearestTimelinePoint"
        @pointerleave="hoveredTimelineIndex = null"
      >
        <g
          class="person-rating-timeline__grid rating-time-chart__grid"
          aria-hidden="true"
        >
          <template v-for="score in [0, 200, 400, 600, 800, 1000]" :key="score">
            <line
              x1="34"
              x2="426"
              :y1="18 + ((1000 - score) / 1000) * 176"
              :y2="18 + ((1000 - score) / 1000) * 176"
            />
            <text
              x="26"
              :y="22 + ((1000 - score) / 1000) * 176"
              text-anchor="end"
            >{{ score / 100 }}</text>
          </template>
        </g>
        <polyline
          v-if="timelinePoints.length > 1"
          class="person-rating-timeline__line rating-time-chart__line"
          :points="timelinePoints.map((point) => `${point.x},${point.y}`).join(' ')"
        />
        <g
          v-for="(point, pointIndex) in timelinePoints"
          :key="`${point.entry.year}-${point.entry.quarter}`"
          class="person-rating-timeline__point rating-time-chart__point"
          :class="{
            'is-active': activeTimelineIndex === pointIndex,
          }"
        >
          <rect
            class="rating-time-chart__hit-target"
            :x="
              Math.min(
                440 - timelineHitSize.width,
                Math.max(0, point.x - timelineHitSize.width / 2),
              )
            "
            :y="
              Math.min(
                236 - timelineHitSize.height,
                Math.max(0, point.y - timelineHitSize.height / 2),
              )
            "
            :width="timelineHitSize.width"
            :height="timelineHitSize.height"
            :rx="Math.min(timelineHitSize.width, timelineHitSize.height) / 2"
            tabindex="0"
            :aria-label="`${point.entry.year} 年第 ${point.entry.quarter} 季度，均分 ${formatHundredths(point.entry.average)}，${point.entry.count} 个样本；使用方向键浏览相邻时间点`"
            @focus="focusedTimelineIndex = pointIndex"
            @blur="focusedTimelineIndex = null"
            @keydown="moveTimelineFocus($event, pointIndex)"
          >
            <title>
              {{ point.entry.year }} Q{{ point.entry.quarter }} ·
              {{ formatHundredths(point.entry.average) }} ·
              {{ point.entry.count }} 个
            </title>
          </rect>
          <circle
            class="rating-time-chart__visible-point"
            :cx="point.x"
            :cy="point.y"
            r="4"
            aria-hidden="true"
          />
          <text :x="point.x" y="228" text-anchor="middle">
            {{ point.entry.year }} Q{{ point.entry.quarter }}
          </text>
        </g>
      </svg>
      <div
        v-if="activeTimelinePoint"
        class="rating-time-chart__tooltip"
        :class="{ 'is-below': activeTimelinePoint.y < 70 }"
        :style="{
          left: `${(activeTimelinePoint.x / 440) * 100}%`,
          top: `${(activeTimelinePoint.y / 236) * 100}%`,
        }"
        role="tooltip"
      >
        <strong>
          {{ activeTimelinePoint.entry.year }} Q{{
            activeTimelinePoint.entry.quarter
          }}
        </strong>
        <span>
          均分
          {{ formatHundredths(activeTimelinePoint.entry.average) }}
        </span>
        <small>{{ activeTimelinePoint.entry.count }} 个样本</small>
      </div>
      <p v-else class="person-section-empty rating-distribution-panel__empty">
        没有同时具备时间和{{ sourceLabel }}的数据
      </p>
      </div>
    </template>
  </section>
</template>
