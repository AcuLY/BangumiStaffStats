<script setup lang="ts">
import type { CheckboxProps } from 'naive-ui';
import {
  NCheckbox,
  NRadioButton,
  NRadioGroup,
  NTooltip,
} from 'naive-ui';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { categoricalSeriesSlot } from '../../../shared/charts/categoricalPalette';
import {
  closestTimelinePointIndex,
  timelineHitSizeInViewBox,
} from '../../../shared/charts/timelineGeometry';
import { useCompactLayout } from '../../query/composables/useCompactLayout';
import { formatHundredths } from '../../ranking/format';
import type {
  CoStarParticipant,
  CoStarRatingDataset,
  CoStarRatingDistribution,
} from '../coStar';

const props = defineProps<{
  datasets: readonly CoStarRatingDataset[];
  participants: readonly CoStarParticipant[];
  scope: 'global' | 'personal';
  workUnit: 'series' | 'subject';
}>();

type ChartMode = 'score' | 'time';
type RatingSource = 'global' | 'personal';
type RatingDistribution = CoStarRatingDistribution;
type RatingBucket = RatingDistribution['buckets'][number];
type TimelineEntry = RatingDistribution['timeline'][number];

interface DisplayDataset {
  readonly color: string;
  readonly contrast: string;
  readonly distribution: RatingDistribution;
  readonly key: string;
  readonly label: string;
  readonly marker: string;
}

interface TimelinePoint {
  readonly datasetKey: string;
  readonly entry: TimelineEntry;
  readonly key: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

interface TimelineSeries {
  readonly color: string;
  readonly key: string;
  readonly label: string;
  readonly points: readonly TimelinePoint[];
  readonly polyline: string;
}

const TIME_HEIGHT = 236;
const TIME_TOP = 18;
const TIME_BOTTOM = 194;
const TIME_LEFT = 34;
const TIME_RIGHT = 14;
const MIN_QUARTER_LABEL_WIDTH = 24;
const MIN_YEAR_LABEL_GAP = 52;
const SEASON_LABELS = ['冬季', '春季', '夏季', '秋季'] as const;
const checkboxThemeOverrides: NonNullable<
  CheckboxProps['themeOverrides']
> = {
  borderChecked: '1px solid var(--series-color)',
  borderFocus: '1px solid var(--series-color)',
  boxShadowFocus: '0 0 0 2px var(--focus)',
  checkMarkColor: 'var(--series-contrast)',
  colorChecked: 'var(--series-color)',
};

const compactLayout = useCompactLayout();
const controlSize = computed(() =>
  compactLayout.value ? 'small' : 'medium',
);
const chartMode = ref<ChartMode>('score');
const source = ref<RatingSource>(
  props.scope === 'personal' ? 'personal' : 'global',
);
const hiddenDatasetKeys = ref<ReadonlySet<string>>(new Set());
const hoveredBar = ref<string | null>(null);
const hoveredTimelinePointKey = ref<string | null>(null);
const focusedTimelinePointKey = ref<string | null>(null);
const timelineHost = ref<HTMLElement | null>(null);
const timelineSvg = ref<SVGSVGElement | null>(null);
const timelineWidth = ref(360);
const timelineHitSize = ref({ height: 44, width: 44 });
let timelineResizeObserver: ResizeObserver | null = null;
const activeTimelineKey = computed(
  () =>
    focusedTimelinePointKey.value ??
    hoveredTimelinePointKey.value,
);

const participantNames = computed(
  () =>
    new Map(
      props.participants.map((participant) => [
        participant.person.id,
        participant.person.nameCN ?? participant.person.name,
      ]),
    ),
);
const sourceLabel = computed(() =>
  source.value === 'personal'
    ? '我的评分'
    : props.scope === 'personal'
      ? '全站评分'
      : '评分',
);
const resultUnit = computed(() =>
  props.workUnit === 'series' ? '个系列' : '部作品',
);
const displayDatasets = computed<readonly DisplayDataset[]>(() => {
  let participantIndex = 0;
  return props.datasets.map((dataset) => {
    const datasetKey =
      dataset.kind === 'common'
        ? 'shared-works'
        : `person-${dataset.personId}`;
    const palette = categoricalSeriesSlot(
      dataset.kind === 'common'
        ? 0
        : participantIndex++ + 1,
    );
    const distribution =
      source.value === 'personal' && 'personal' in dataset
        ? dataset.personal
        : dataset.global;
    return {
      color: palette.color,
      contrast: palette.contrast,
      distribution,
      key: datasetKey,
      label:
        dataset.kind === 'common'
          ? props.workUnit === 'series'
            ? '共同系列'
            : '共同作品'
          : participantNames.value.get(dataset.personId) ??
            `人物 ${dataset.personId}`,
      marker:
        dataset.kind === 'common'
          ? ''
          : String(participantIndex).padStart(2, '0'),
    };
  });
});
const availableDatasetKeys = computed(
  () =>
    new Set(
      displayDatasets.value
        .filter((dataset) =>
          chartMode.value === 'score'
            ? dataset.distribution.validCount > 0
            : dataset.distribution.timeline.length > 0,
        )
        .map((dataset) => dataset.key),
    ),
);
const visibleDatasets = computed(() =>
  displayDatasets.value.filter(
    (dataset) =>
      availableDatasetKeys.value.has(dataset.key) &&
      !hiddenDatasetKeys.value.has(dataset.key),
  ),
);
const scoreBins = computed(() =>
  Array.from({ length: 10 }, (_, index) => {
    const score = 10 - index;
    return {
      datasets: visibleDatasets.value
        .map((dataset) => ({
          ...dataset,
          bucket: dataset.distribution.buckets[score - 1]!,
        }))
        .filter(({ bucket }) => bucket.count > 0),
      score,
    };
  }),
);
const hasScoreData = computed(() =>
  displayDatasets.value.some(
    (dataset) => dataset.distribution.validCount > 0,
  ),
);
const maximumBucketCount = computed(() =>
  Math.max(
    1,
    ...displayDatasets.value.flatMap((dataset) =>
      dataset.distribution.buckets.map((bucket) => bucket.count),
    ),
  ),
);
const tickStep = computed(() => {
  const roughStep = maximumBucketCount.value / 4;
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
const scoreAxisMaximum = computed(
  () =>
    Math.ceil(maximumBucketCount.value / tickStep.value) *
    tickStep.value,
);
const scoreTicks = computed(() =>
  Array.from(
    {
      length:
        Math.round(scoreAxisMaximum.value / tickStep.value) + 1,
    },
    (_, index) => index * tickStep.value,
  ),
);
const scoreComparisonLabel = computed(
  () =>
    `${sourceLabel.value}分布对比；评分位于纵轴，每档评分下横向柱按当前勾选数据组分组，并使用同一${props.workUnit === 'series' ? '系列' : '作品'}数量刻度。` +
    visibleDatasets.value
      .map(
        (dataset) =>
          `${dataset.label}：${[...dataset.distribution.buckets]
            .reverse()
            .map(
              (bucket) =>
                `${bucket.score} 分 ${bucket.count} ${resultUnit.value}`,
            )
            .join('，')}`,
      )
      .join('；'),
);

const timelineQuarterIndices = computed(() => {
  const indices = displayDatasets.value.flatMap((dataset) =>
    dataset.distribution.timeline.map(
      (entry) => entry.year * 4 + entry.quarter - 1,
    ),
  );
  return [...new Set(indices)].sort((left, right) => left - right);
});
const firstTimelineQuarter = computed(
  () => timelineQuarterIndices.value[0] ?? 0,
);
const lastTimelineQuarter = computed(
  () =>
    timelineQuarterIndices.value[
      timelineQuarterIndices.value.length - 1
    ] ?? firstTimelineQuarter.value,
);
const timelineQuarterCount = computed(
  () => lastTimelineQuarter.value - firstTimelineQuarter.value + 1,
);
const timelinePlotWidth = computed(() =>
  Math.max(1, timelineWidth.value - TIME_LEFT - TIME_RIGHT),
);
const timelineQuarterWidth = computed(
  () => timelinePlotWidth.value / timelineQuarterCount.value,
);
const timelineX = (entry: TimelineEntry): number => {
  const index = entry.year * 4 + entry.quarter - 1;
  return (
    TIME_LEFT +
    (index - firstTimelineQuarter.value + 0.5) *
      timelineQuarterWidth.value
  );
};
const timelineY = (average: number): number =>
  TIME_TOP +
  ((1000 - average) / 1000) * (TIME_BOTTOM - TIME_TOP);
const timeSeries = computed<readonly TimelineSeries[]>(() =>
  displayDatasets.value
    .filter((dataset) => dataset.distribution.timeline.length > 0)
    .map((dataset) => {
      const points = dataset.distribution.timeline.map((entry) => {
        const key = `${dataset.key}:${entry.year}:${entry.quarter}`;
        return {
          datasetKey: dataset.key,
          entry,
          key,
          label: `${dataset.label} · ${entry.year} ${seasonLabel(entry.quarter)} · 均分 ${formatHundredths(entry.average)} · ${entry.count} ${resultUnit.value}`,
          x: timelineX(entry),
          y: timelineY(entry.average),
        };
      });
      return {
        color: dataset.color,
        key: dataset.key,
        label: dataset.label,
        points,
        polyline: points
          .map((point) => `${point.x},${point.y}`)
          .join(' '),
      };
    }),
);
const visibleTimeSeries = computed(() =>
  timeSeries.value.filter(
    (dataset) => !hiddenDatasetKeys.value.has(dataset.key),
  ),
);
const activeTimelinePoint = computed(
  () =>
    visibleTimeSeries.value
      .flatMap((dataset) => dataset.points)
      .find(
        (point) => point.key === activeTimelineKey.value,
      ) ??
    null,
);
const timelineYears = computed(() => {
  if (!timelineQuarterIndices.value.length) {
    return [];
  }
  const firstYear = Math.floor(firstTimelineQuarter.value / 4);
  const lastYear = Math.floor(lastTimelineQuarter.value / 4);
  const yearCount = lastYear - firstYear + 1;
  const maximumLabelCount = Math.max(
    2,
    Math.floor(timelinePlotWidth.value / MIN_YEAR_LABEL_GAP),
  );
  const labelInterval = Math.max(
    1,
    Math.ceil(yearCount / maximumLabelCount),
  );
  const years = Array.from(
    { length: lastYear - firstYear + 1 },
    (_, index) => {
      const year = firstYear + index;
      const firstQuarter = Math.max(
        firstTimelineQuarter.value,
        year * 4,
      );
      const lastQuarter = Math.min(
        lastTimelineQuarter.value,
        year * 4 + 3,
      );
      const startOffset =
        firstQuarter - firstTimelineQuarter.value;
      const endOffset =
        lastQuarter - firstTimelineQuarter.value + 1;
      return {
        key: year,
        label: year,
        lineX:
          TIME_LEFT +
          startOffset * timelineQuarterWidth.value,
        showLabel: false,
        x:
          TIME_LEFT +
          ((startOffset + endOffset) / 2) *
            timelineQuarterWidth.value,
      };
    },
  );
  let previousLabelIndex = -1;
  for (let index = 0; index < years.length; index += 1) {
    const isLast = index === years.length - 1;
    const isCandidate =
      index === 0 || isLast || index % labelInterval === 0;
    if (!isCandidate) {
      continue;
    }
    if (
      isLast &&
      previousLabelIndex >= 0 &&
      years[index]!.x - years[previousLabelIndex]!.x <
        MIN_YEAR_LABEL_GAP
    ) {
      years[previousLabelIndex]!.showLabel = false;
    }
    years[index]!.showLabel = true;
    previousLabelIndex = index;
  }
  return years;
});
const timelineSeasonLabels = computed(() => {
  if (
    !timelineQuarterIndices.value.length ||
    timelineQuarterWidth.value < MIN_QUARTER_LABEL_WIDTH
  ) {
    return [];
  }
  return Array.from(
    { length: timelineQuarterCount.value },
    (_, index) => {
      const quarterIndex = firstTimelineQuarter.value + index;
      return {
        key: quarterIndex,
        label: seasonLabel((quarterIndex % 4) + 1),
        x:
          TIME_LEFT +
          (index + 0.5) * timelineQuarterWidth.value,
      };
    },
  );
});
const timelineLabel = computed(
  () =>
    `${sourceLabel.value}时间对比；折线表示当前勾选系列的季度均分。` +
    visibleTimeSeries.value
      .map(
        (dataset) =>
          `${dataset.label} ${dataset.points
            .map((point) => point.label)
            .join('，')}`,
      )
      .join('；'),
);

function seasonLabel(quarter: number): string {
  return SEASON_LABELS[quarter - 1] ?? `第 ${quarter} 季度`;
}

function datasetIsVisible(key: string): boolean {
  return !hiddenDatasetKeys.value.has(key);
}

function setDatasetVisible(key: string, visible: boolean): void {
  const next = new Set(hiddenDatasetKeys.value);
  if (visible) {
    next.delete(key);
  } else {
    next.add(key);
  }
  hiddenDatasetKeys.value = next;
  hoveredBar.value = null;
  hoveredTimelinePointKey.value = null;
  focusedTimelinePointKey.value = null;
}

function barWidth(count: number): string {
  return `${count === 0 ? 0 : Math.max(2, (count / scoreAxisMaximum.value) * 100)}%`;
}

function bucketLabel(
  datasetLabel: string,
  bucket: RatingBucket,
): string {
  const examples = bucket.examples
    .map((unit) => unit.nameCN ?? unit.name)
    .join('、');
  return [
    `${datasetLabel}，${bucket.score} 分，${bucket.count} ${resultUnit.value}`,
    examples ? `示例：${examples}` : '',
    bucket.hiddenCount > 0
      ? `另有 ${bucket.hiddenCount} 项未展示`
      : '',
  ]
    .filter(Boolean)
    .join('；');
}

function scoreBarKey(datasetKey: string, score: number): string {
  return `${datasetKey}:${score}`;
}

function scoreTickLeft(tick: number): string {
  return `${(tick / scoreAxisMaximum.value) * 100}%`;
}

function syncTimelineHitSize(): void {
  const hostBounds = timelineHost.value?.getBoundingClientRect();
  if (hostBounds?.width) {
    timelineWidth.value = Math.max(280, Math.round(hostBounds.width));
  }
  const bounds = timelineSvg.value?.getBoundingClientRect();
  if (!bounds?.width || !bounds.height) {
    return;
  }
  timelineHitSize.value = timelineHitSizeInViewBox(
    bounds.width,
    bounds.height,
    timelineWidth.value,
    TIME_HEIGHT,
  );
}

function observeTimeline(): void {
  timelineResizeObserver?.disconnect();
  timelineResizeObserver = null;
  if (!timelineSvg.value || !timelineHost.value) {
    return;
  }
  if (typeof ResizeObserver === 'function') {
    timelineResizeObserver = new ResizeObserver(syncTimelineHitSize);
    timelineResizeObserver.observe(timelineHost.value);
  }
  syncTimelineHitSize();
}

function updateHoveredTimelinePoint(event: PointerEvent): void {
  const bounds = timelineSvg.value?.getBoundingClientRect();
  if (!bounds?.width || !bounds.height) {
    return;
  }
  const points = visibleTimeSeries.value.flatMap(
    (dataset) => dataset.points,
  );
  const index = closestTimelinePointIndex(
    event.clientX,
    event.clientY,
    bounds,
    points,
    22,
    timelineWidth.value,
    TIME_HEIGHT,
  );
  hoveredTimelinePointKey.value =
    index === null ? null : (points[index]?.key ?? null);
}

function moveTimelineFocus(event: KeyboardEvent): void {
  const targets =
    timelineSvg.value?.querySelectorAll<SVGElement>(
      '.comparison-time-chart__hit-target',
    );
  if (!targets?.length) {
    return;
  }
  const current = Array.from(targets).indexOf(
    event.currentTarget as SVGElement,
  );
  const offset =
    event.key === 'ArrowLeft' || event.key === 'ArrowUp'
      ? -1
      : event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : 0;
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? targets.length - 1
        : offset
          ? Math.min(targets.length - 1, Math.max(0, current + offset))
          : current;
  if (next === current) {
    return;
  }
  event.preventDefault();
  targets.item(next).focus();
}

watch(
  () => props.scope,
  (scope) => {
    source.value = scope === 'personal' ? 'personal' : 'global';
  },
);
watch(
  () => props.workUnit,
  (workUnit) => {
    if (workUnit === 'series') {
      chartMode.value = 'score';
    }
  },
);
watch(
  () => displayDatasets.value.map((dataset) => dataset.key),
  (keys) => {
    const current = new Set(keys);
    hiddenDatasetKeys.value = new Set(
      [...hiddenDatasetKeys.value].filter((key) => current.has(key)),
    );
  },
);
watch([source, chartMode], () => {
  hoveredBar.value = null;
  hoveredTimelinePointKey.value = null;
  focusedTimelinePointKey.value = null;
});
watch(
  [chartMode, () => visibleTimeSeries.value.length],
  async () => {
    await nextTick();
    observeTimeline();
  },
);

onMounted(observeTimeline);
onBeforeUnmount(() => timelineResizeObserver?.disconnect());
</script>

<template>
  <div class="analysis-domain__block rating-distribution-panel">
    <div
      class="section-heading co-star-section-heading rating-distribution-panel__heading"
    >
      <h2 id="co-star-ratings-title">
        {{ workUnit === 'series' ? '系列均分分布' : '评分分布' }}
      </h2>
      <div
        v-if="workUnit !== 'series' || scope === 'personal'"
        class="rating-distribution-panel__controls"
      >
        <n-radio-group
          v-if="workUnit !== 'series'"
          v-model:value="chartMode"
          :size="controlSize"
          role="radiogroup"
          aria-label="评分图表维度"
        >
          <n-radio-button value="score">按评分</n-radio-button>
          <n-radio-button value="time">按时间</n-radio-button>
        </n-radio-group>
        <n-radio-group
          v-if="scope === 'personal'"
          v-model:value="source"
          :size="controlSize"
          role="radiogroup"
          aria-label="评分数据来源"
        >
          <n-radio-button value="personal">我的评分</n-radio-button>
          <n-radio-button value="global">全站评分</n-radio-button>
        </n-radio-group>
      </div>
    </div>

    <div class="distribution-legend" role="group" aria-label="评分对比系列">
      <span
        v-for="dataset in displayDatasets"
        :key="dataset.key"
        :class="{
          'is-hidden':
            !datasetIsVisible(dataset.key) ||
            !availableDatasetKeys.has(dataset.key),
        }"
        :style="{
          '--series-color': dataset.color,
          '--series-contrast': dataset.contrast,
        }"
      >
        <n-checkbox
          :size="controlSize"
          :theme-overrides="checkboxThemeOverrides"
          :checked="
            datasetIsVisible(dataset.key) &&
            availableDatasetKeys.has(dataset.key)
          "
          :disabled="!availableDatasetKeys.has(dataset.key)"
          @update:checked="setDatasetVisible(dataset.key, $event)"
        >
          <span class="distribution-legend__checkbox-label">
            <b>
              <template v-if="dataset.marker">
                {{ dataset.marker }} ·
              </template>
              {{ dataset.label }}
            </b>
          </span>
        </n-checkbox>
      </span>
    </div>

    <template v-if="chartMode === 'score'">
      <div
        v-if="hasScoreData"
        class="horizontal-distribution"
        role="group"
        :aria-label="scoreComparisonLabel"
        :style="{
          '--distribution-steps': Math.max(1, scoreTicks.length - 1),
          '--series-count': Math.max(1, visibleDatasets.length),
        }"
      >
        <div class="horizontal-distribution__axis" aria-hidden="true">
          <span
            v-for="tick in scoreTicks"
            :key="tick"
            :style="{ left: scoreTickLeft(tick) }"
          >{{ tick }}</span>
        </div>
        <div
          v-for="(scoreBin, scoreIndex) in scoreBins"
          :key="scoreBin.score"
          class="horizontal-score-group"
        >
          <small>{{ scoreBin.score }}</small>
          <div class="horizontal-score-group__plot">
            <div
              v-for="(dataset, datasetIndex) in scoreBin.datasets"
              :key="dataset.key"
              class="horizontal-score-bar"
              :style="{
                '--bar-delay': `${scoreIndex * 12 + datasetIndex * 8}ms`,
                '--bar-width': barWidth(dataset.bucket.count),
                '--series-color': dataset.color,
              }"
              tabindex="0"
              :aria-label="bucketLabel(dataset.label, dataset.bucket)"
              @mouseenter="
                hoveredBar = scoreBarKey(dataset.key, scoreBin.score)
              "
              @mouseleave="hoveredBar = null"
              @focus="
                hoveredBar = scoreBarKey(dataset.key, scoreBin.score)
              "
              @blur="hoveredBar = null"
            >
              <n-tooltip
                :show="
                  hoveredBar ===
                  scoreBarKey(dataset.key, scoreBin.score)
                "
                trigger="manual"
                placement="top"
                :animated="false"
                style="max-width: min(336px, calc(100dvw - 72px));"
              >
                <template #trigger>
                  <span class="horizontal-score-bar__track">
                    <span
                      class="horizontal-score-bar__fill"
                      aria-hidden="true"
                    >
                      <span class="horizontal-score-bar__value">
                        {{ dataset.bucket.count }}
                      </span>
                    </span>
                  </span>
                </template>
                <span>{{ bucketLabel(dataset.label, dataset.bucket) }}</span>
              </n-tooltip>
            </div>
          </div>
        </div>
      </div>
      <p v-else class="rating-distribution-panel__empty">
        没有可用于比较的{{ sourceLabel }}
      </p>
    </template>

    <template v-else>
      <p class="rating-time-chart__meaning">
        圆点与折线均表示各对比系列的季度均分
      </p>
      <div
        ref="timelineHost"
        class="rating-time-chart__viewport comparison-time-chart__viewport"
      >
        <svg
          v-if="timeSeries.length"
          ref="timelineSvg"
          class="rating-time-chart comparison-time-chart"
          :viewBox="`0 0 ${timelineWidth} ${TIME_HEIGHT}`"
          role="img"
          :aria-label="timelineLabel"
          @pointermove="updateHoveredTimelinePoint"
          @pointerleave="hoveredTimelinePointKey = null"
        >
          <g class="rating-time-chart__grid" aria-hidden="true">
            <template v-for="score in [0, 2, 4, 6, 8, 10]" :key="score">
              <line
                :x1="TIME_LEFT"
                :x2="timelineWidth - TIME_RIGHT"
                :y1="timelineY(score * 100)"
                :y2="timelineY(score * 100)"
              />
              <text
                :x="TIME_LEFT - 8"
                :y="timelineY(score * 100) + 4"
                text-anchor="end"
              >{{ score }}</text>
            </template>
            <template v-for="year in timelineYears" :key="year.key">
              <line
                v-if="year.showLabel"
                class="rating-time-chart__quarter-line is-year"
                :x1="year.lineX"
                :x2="year.lineX"
                :y1="TIME_TOP"
                :y2="TIME_BOTTOM"
              />
              <text
                v-if="year.showLabel"
                class="rating-time-chart__year-label"
                :x="year.x"
                y="228"
                text-anchor="middle"
              >{{ year.label }}</text>
            </template>
            <text
              v-for="quarter in timelineSeasonLabels"
              :key="quarter.key"
              class="rating-time-chart__quarter-label"
              :x="quarter.x"
              y="211"
              text-anchor="middle"
            >{{ quarter.label }}</text>
          </g>
          <g
            v-for="(dataset, datasetIndex) in visibleTimeSeries"
            :key="dataset.key"
            class="comparison-time-chart__series"
            :class="{ 'is-shared': dataset.key === 'shared-works' }"
            :style="{
              '--series-color': dataset.color,
              '--series-delay': `${datasetIndex * 24}ms`,
            }"
            role="group"
            :aria-label="`${dataset.label}季度均分`"
          >
            <polyline
              v-if="dataset.points.length > 1"
              class="comparison-time-chart__line"
              pathLength="1"
              :points="dataset.polyline"
            />
            <g
              v-for="point in dataset.points"
              :key="point.key"
              class="comparison-time-chart__point"
              :class="{
                'is-active': activeTimelineKey === point.key,
              }"
            >
              <rect
                class="comparison-time-chart__hit-target"
                :x="
                  Math.min(
                    timelineWidth - timelineHitSize.width,
                    Math.max(
                      0,
                      point.x - timelineHitSize.width / 2,
                    ),
                  )
                "
                :y="
                  Math.min(
                    TIME_HEIGHT - timelineHitSize.height,
                    Math.max(
                      0,
                      point.y - timelineHitSize.height / 2,
                    ),
                  )
                "
                :width="timelineHitSize.width"
                :height="timelineHitSize.height"
                :rx="
                  Math.min(
                    timelineHitSize.width,
                    timelineHitSize.height,
                  ) / 2
                "
                tabindex="0"
                :aria-label="`${point.label}；使用方向键浏览相邻时间点`"
                @focus="focusedTimelinePointKey = point.key"
                @blur="focusedTimelinePointKey = null"
                @keydown="moveTimelineFocus"
              >
                <title>{{ point.label }}</title>
              </rect>
              <circle
                class="comparison-time-chart__visible-point"
                :cx="point.x"
                :cy="point.y"
                r="4"
                aria-hidden="true"
              />
            </g>
          </g>
        </svg>
        <div
          v-if="activeTimelinePoint"
          class="rating-time-chart__tooltip"
          :class="{ 'is-below': activeTimelinePoint.y < 70 }"
          :style="{
            left: `${(activeTimelinePoint.x / timelineWidth) * 100}%`,
            top: `${(activeTimelinePoint.y / TIME_HEIGHT) * 100}%`,
          }"
          role="tooltip"
        >
          <strong>{{ activeTimelinePoint.label.split(' · ')[0] }}</strong>
          <span>
            {{ activeTimelinePoint.entry.year }}
            {{ seasonLabel(activeTimelinePoint.entry.quarter) }} · 均分
            {{ formatHundredths(activeTimelinePoint.entry.average) }}
          </span>
          <small>
            {{ activeTimelinePoint.entry.count }} {{ resultUnit }}
          </small>
        </div>
        <p v-if="!timeSeries.length" class="rating-distribution-panel__empty">
          没有同时具备时间和{{ sourceLabel }}的数据
        </p>
      </div>
    </template>
  </div>
</template>
