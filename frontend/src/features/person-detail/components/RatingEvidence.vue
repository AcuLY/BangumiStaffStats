<script setup lang="ts">
import { NRadioButton, NRadioGroup, NTooltip } from 'naive-ui';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from 'vue';

import { useCompactLayout } from '../../../shared/composables/useCompactLayout';
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
const ratingsTitleId = `person-ratings-${useId()}`;
type ChartMode = 'score' | 'time';
const compact = useCompactLayout();
const controlSize = computed(() => (compact.value ? 'small' : 'medium'));
const chartMode = ref<ChartMode>('score');
const source = ref<RatingSource>(
  props.payload.ratings.personal ? 'personal' : 'global',
);
const hoveredBucket = ref<number | null>(null);
const timelineSvg = ref<SVGSVGElement | null>(null);
const timelineWidth = ref(440);
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
const timelineAxis = computed(() => {
  const entries = rating.value.timeline;
  const first = entries[0];
  const last = entries.at(-1);
  if (!first || !last) return { first: 0, quarterWidth: 0, years: [], quarters: [] };
  const start = first.year * 4 + first.quarter - 1;
  const end = last.year * 4 + last.quarter - 1;
  const plotWidth = Math.max(1, timelineWidth.value - 48);
  const quarterWidth = plotWidth / (end - start + 1);
  const years = Array.from({ length: last.year - first.year + 1 }, (_, index) => {
    const year = first.year + index;
    const left = Math.max(start, year * 4) - start;
    const right = Math.min(end + 1, (year + 1) * 4) - start;
    return { year, x: 34 + (left + right) / 2 * quarterWidth, lineX: 34 + left * quarterWidth };
  });
  const visibleYears: typeof years = [];
  for (const year of years) {
    if (!visibleYears.length || year.x - visibleYears.at(-1)!.x >= 52) visibleYears.push(year);
  }
  const finalYear = years.at(-1)!;
  if (visibleYears.at(-1) !== finalYear) {
    if (finalYear.x - visibleYears.at(-1)!.x < 52) visibleYears.pop();
    visibleYears.push(finalYear);
  }
  return {
    first: start,
    quarterWidth,
    years: visibleYears,
    quarters: quarterWidth >= 24 ? Array.from({ length: end - start + 1 }, (_, index) => ({
      key: start + index,
      quarter: (start + index) % 4 + 1,
      x: 34 + (index + 0.5) * quarterWidth,
    })) : [],
  };
});
const seasonLabel = (quarter: number): string =>
  ['冬季', '春季', '夏季', '秋季'][quarter - 1] ?? `第 ${quarter} 季度`;
const timelineAverages = computed(() => {
  const axis = timelineAxis.value;
  return rating.value.timeline.map((entry) => ({
    entry,
    x: 34 + (entry.year * 4 + entry.quarter - 1 - axis.first + 0.5) * axis.quarterWidth,
    y: 18 + ((1000 - entry.average) / 1000) * 176,
  }));
});
const timelinePoints = computed(() => {
  const axis = timelineAxis.value;
  return rating.value.timeline.flatMap((entry) => entry.works.map((work, index) => ({
    entry,
    work,
    x: 34 + (
      entry.year * 4 + entry.quarter - 1 - axis.first
      + (index + 1) / (entry.works.length + 1)
    ) * axis.quarterWidth,
    y: 18 + ((1000 - work.score) / 1000) * 176,
  })));
});
const timelineLabel = computed(() =>
  timelinePoints.value
    .map(
      ({ entry, work }) =>
        `${primaryEntityName(work.subject)}，${entry.year} 年${seasonLabel(entry.quarter)}，${work.subject.date}，${formatHundredths(work.score)} 分，季度均分 ${formatHundredths(entry.average)}`,
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

function bucketAccessibleLabel(
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
    bounds.width || 440,
  );
  if (bounds.width > 0) timelineWidth.value = bounds.width;
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
    22,
    timelineWidth.value,
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
watch(rating, () => {
  hoveredTimelineIndex.value = null;
  focusedTimelineIndex.value = null;
});

onMounted(observeTimelineSvg);
onBeforeUnmount(() => {
  timelineResizeObserver?.disconnect();
});
</script>

<template>
  <section
    class="person-inspector__section rating-evidence"
    :aria-labelledby="ratingsTitleId"
  >
    <header
      class="person-section-heading rating-distribution-panel__heading"
    >
      <h2 :id="ratingsTitleId">
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
        }"
        :aria-label="bucketAccessibleLabel(bucket)"
        :tabindex="bucket.count ? 0 : undefined"
        @mouseenter="hoveredBucket = bucket.count ? bucket.score : null"
        @mouseleave="hoveredBucket = null"
        @focus="hoveredBucket = bucket.count ? bucket.score : null"
        @blur="hoveredBucket = null"
      >
        <span
          class="person-score-bar__track score-bar__track"
          aria-hidden="true"
          :style="{
            '--person-score-height': `${(bucket.count / axisMax) * 100}%`,
            '--score-bar-height': `${(bucket.count / axisMax) * 100}%`,
          }"
        >
          <span
            v-if="bucket.count"
            class="person-score-bar__count score-bar__value"
          >
            {{ bucket.count }}
          </span>
          <n-tooltip
            v-if="bucket.count"
            :show="hoveredBucket === bucket.score"
            trigger="manual"
            placement="top"
            :animated="false"
            style="max-width: min(336px, calc(100dvw - 72px)); pointer-events: none;"
            content-class="workbench-tooltip-content"
          >
            <template #trigger>
              <i />
            </template>
            <ul class="score-distribution-tooltip">
              <li
                v-for="example in bucket.examples"
                :key="example.key"
                :title="primaryEntityName(example)"
              >
                {{ primaryEntityName(example) }}
              </li>
              <li
                v-if="bucket.hiddenCount"
                class="score-distribution-tooltip__more"
              >
                … +{{ bucket.hiddenCount }}
              </li>
            </ul>
          </n-tooltip>
          <i v-else />
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
        圆点表示单部作品评分 · 折线表示季度均分
      </p>
      <div class="person-rating-timeline rating-time-chart__viewport">
      <svg
        v-if="timelinePoints.length"
        ref="timelineSvg"
        class="rating-time-chart"
        :viewBox="`0 0 ${timelineWidth} 236`"
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
              :x2="timelineWidth - 14"
              :y1="18 + ((1000 - score) / 1000) * 176"
              :y2="18 + ((1000 - score) / 1000) * 176"
            />
            <text
              x="26"
              :y="22 + ((1000 - score) / 1000) * 176"
              text-anchor="end"
            >{{ score / 100 }}</text>
          </template>
          <g v-for="year in timelineAxis.years" :key="year.year">
            <line :x1="year.lineX" :x2="year.lineX" y1="18" y2="194" />
            <text class="rating-time-chart__year-label" :x="year.x" y="228" text-anchor="middle">{{ year.year }}</text>
          </g>
          <text
            v-for="quarter in timelineAxis.quarters"
            :key="quarter.key"
            class="rating-time-chart__quarter-label"
            :x="quarter.x"
            y="211"
            text-anchor="middle"
          >{{ seasonLabel(quarter.quarter) }}</text>
        </g>
        <polyline
          v-if="timelineAverages.length > 1"
          class="person-rating-timeline__line rating-time-chart__line"
          :points="timelineAverages.map((point) => `${point.x},${point.y}`).join(' ')"
        />
        <g
          v-for="(point, pointIndex) in timelinePoints"
          :key="point.work.subject.id"
          class="person-rating-timeline__point rating-time-chart__point"
          :class="{
            'is-active': activeTimelineIndex === pointIndex,
          }"
        >
          <rect
            class="rating-time-chart__hit-target"
            :x="
              Math.min(
                timelineWidth - timelineHitSize.width,
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
            :aria-label="`${primaryEntityName(point.work.subject)}，${point.work.subject.date}，${formatHundredths(point.work.score)} 分，季度均分 ${formatHundredths(point.entry.average)}；使用方向键浏览相邻作品`"
            @focus="focusedTimelineIndex = pointIndex"
            @blur="focusedTimelineIndex = null"
            @keydown="moveTimelineFocus($event, pointIndex)"
          >
            <title>
              {{ primaryEntityName(point.work.subject) }} ·
              {{ formatHundredths(point.work.score) }} 分 ·
              {{ point.work.subject.date }}
            </title>
          </rect>
          <circle
            class="rating-time-chart__visible-point"
            :cx="point.x"
            :cy="point.y"
            r="4"
            aria-hidden="true"
          />
        </g>
      </svg>
      <div
        v-if="activeTimelinePoint"
        class="rating-time-chart__tooltip"
        :class="{ 'is-below': activeTimelinePoint.y < 92 }"
        :style="{
          left: `${Math.min(timelineWidth - Math.min(130, timelineWidth / 2), Math.max(Math.min(130, timelineWidth / 2), activeTimelinePoint.x))}px`,
          top: `${(activeTimelinePoint.y / 236) * 100}%`,
        }"
        role="tooltip"
      >
        <strong>
          {{ primaryEntityName(activeTimelinePoint.work.subject) }}
        </strong>
        <span>
          {{ formatHundredths(activeTimelinePoint.work.score) }} 分
        </span>
        <small>
          {{ activeTimelinePoint.work.subject.date }} · 季度均分
          {{ formatHundredths(activeTimelinePoint.entry.average) }}
        </small>
      </div>
      <p v-if="!timelinePoints.length" class="person-section-empty rating-distribution-panel__empty">
        没有同时具备时间和{{ sourceLabel }}的数据
      </p>
      </div>
    </template>
  </section>
</template>
