<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CheckboxProps } from 'naive-ui'
import type { Subject } from '../types'
import {
	buildQuarterlyRatingAverages,
	buildScoreDistribution,
	type RatingSource,
} from '../domain/ratingDistribution'
import { useWorkbenchControlSize } from '../composables/useWorkbenchControlSize'
import ScoreDistributionTooltip from './ScoreDistributionTooltip.vue'

interface ComparisonSeriesInput {
	key: string
	marker: string
	label: string
	color: string
	subjects: Subject[]
}

interface TimeAxisYear {
	year: number
	x: number
	lineX: number
	showLabel: boolean
}

interface TimeAxisQuarter {
	key: number
	quarter: number
	x: number
}

interface ComparisonTimePoint {
	key: number
	x: number
	y: number
	tooltip: string
}

interface ComparisonTimeSeries {
	key: string
	label: string
	color: string
	points: ComparisonTimePoint[]
	polyline: string
	summary: string
}

const props = withDefaults(defineProps<{
	series: ComparisonSeriesInput[]
	isGlobalQuery: boolean
	seriesMode?: boolean
}>(), {
	seriesMode: false,
})

const { controlSize } = useWorkbenchControlSize()

type ChartMode = 'score' | 'time'

const toLinearRgbChannel = (value: number) => {
	const channel = value / 255
	return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

const seriesCheckMarkColor = (color: string) => {
	const match = /^#([\da-f]{6})$/i.exec(color.trim())
	if (!match) return '#ffffff'
	const red = toLinearRgbChannel(Number.parseInt(match[1].slice(0, 2), 16))
	const green = toLinearRgbChannel(Number.parseInt(match[1].slice(2, 4), 16))
	const blue = toLinearRgbChannel(Number.parseInt(match[1].slice(4, 6), 16))
	const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
	return luminance > 0.2 ? '#18181c' : '#ffffff'
}

const seriesCheckboxThemeOverrides: NonNullable<CheckboxProps['themeOverrides']> = {
	colorChecked: 'var(--series-color)',
	checkMarkColor: 'var(--series-contrast)',
	borderChecked: '1px solid var(--series-color)',
	borderFocus: '1px solid var(--series-color)',
	boxShadowFocus: '0 0 0 2px var(--focus)',
}

const chartMode = ref<ChartMode>('score')
const scoreSource = ref<RatingSource>(props.isGlobalQuery ? 'global' : 'personal')
const hoveredGroupedBar = ref<string | null>(null)
const hoveredTimePointKey = ref<string | null>(null)
const focusedTimePointKey = ref<string | null>(null)
const timeChartHost = ref<HTMLElement | null>(null)
const timeChartWidth = ref(360)
const hiddenSeriesKeys = ref<Set<string>>(new Set())

watch(() => props.isGlobalQuery, (isGlobal) => {
	scoreSource.value = isGlobal ? 'global' : 'personal'
}, { immediate: true })

watch(() => props.seriesMode, (seriesMode) => {
	if (seriesMode) chartMode.value = 'score'
}, { immediate: true })

watch([scoreSource, chartMode], () => {
	hoveredGroupedBar.value = null
	hoveredTimePointKey.value = null
	focusedTimePointKey.value = null
})

watch(() => props.series.map((series) => series.key), (seriesKeys) => {
	const currentKeys = new Set(seriesKeys)
	const nextHiddenKeys = new Set([...hiddenSeriesKeys.value].filter((key) => currentKeys.has(key)))
	if (nextHiddenKeys.size !== hiddenSeriesKeys.value.size) {
		hiddenSeriesKeys.value = nextHiddenKeys
	}
}, { immediate: true })

watch(timeChartHost, (host, _previousHost, onCleanup) => {
	if (!host) return
	const updateWidth = () => {
		timeChartWidth.value = Math.max(280, Math.round(host.getBoundingClientRect().width))
	}
	updateWidth()
	const observer = new ResizeObserver(updateWidth)
	observer.observe(host)
	onCleanup(() => observer.disconnect())
}, { flush: 'post' })

const sourceLabel = computed(() => scoreSource.value === 'personal'
	? '我的评分'
	: props.isGlobalQuery ? '评分' : '全站评分')
const resultUnit = computed(() => props.seriesMode ? '个系列' : '部作品')
const isSeriesVisible = (seriesKey: string) => !hiddenSeriesKeys.value.has(seriesKey)
const setSeriesVisible = (seriesKey: string, visible: boolean) => {
	const nextHiddenKeys = new Set(hiddenSeriesKeys.value)
	if (visible) nextHiddenKeys.delete(seriesKey)
	else nextHiddenKeys.add(seriesKey)
	hiddenSeriesKeys.value = nextHiddenKeys
	hoveredGroupedBar.value = null
	hoveredTimePointKey.value = null
	focusedTimePointKey.value = null
}
const scoreSeries = computed(() => props.series.map((series) => {
	const buckets = buildScoreDistribution(series.subjects, scoreSource.value)
	return {
		...series,
		counts: buckets.map((bucket) => bucket.value),
		buckets,
		total: buckets.reduce((sum, bucket) => sum + bucket.value, 0),
	}
}))
const scoreLabels = computed(() => scoreSeries.value[0]?.buckets.map((bucket) => bucket.label) ?? [])
const scoreBins = computed(() => scoreLabels.value
	.map((label, index) => ({ label, index }))
	.reverse())
const scoreTotal = computed(() => scoreSeries.value.reduce((sum, series) => sum + series.total, 0))
const availableScoreSeriesKeys = computed(() => new Set(scoreSeries.value
	.filter((series) => series.total)
	.map((series) => series.key)))
const visibleScoreSeries = computed(() => scoreSeries.value.filter((series) => (
	availableScoreSeriesKeys.value.has(series.key) && isSeriesVisible(series.key)
)))
const renderedScoreBins = computed(() => scoreBins.value.map((scoreBin) => ({
	...scoreBin,
	series: visibleScoreSeries.value.filter((series) => series.counts[scoreBin.index] > 0),
})))
const maxGroupedDistribution = computed(() => Math.max(1, ...scoreSeries.value.flatMap((series) => series.counts)))
const distributionTickStep = computed(() => {
	const roughStep = maxGroupedDistribution.value / 4
	const magnitude = 10 ** Math.floor(Math.log10(roughStep))
	const normalized = roughStep / magnitude
	const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
	return Math.max(1, multiplier * magnitude)
})
const distributionAxisMax = computed(() => Math.ceil(maxGroupedDistribution.value / distributionTickStep.value) * distributionTickStep.value)
const distributionTicks = computed(() => Array.from(
	{ length: Math.round(distributionAxisMax.value / distributionTickStep.value) + 1 },
	(_, index) => index * distributionTickStep.value,
))
const distributionBarWidth = (value: number) => value
	? Math.max(2, value / distributionAxisMax.value * 100)
	: 0
const scoreBarKey = (seriesKey: string, scoreLabel: string) => `${seriesKey}-${scoreLabel}`
const scoreComparisonLabel = computed(() => `${sourceLabel.value}分布对比；评分位于纵轴，每档评分下横向柱按当前勾选数据组分组，并使用同一${props.seriesMode ? '系列' : '作品'}数量刻度。${visibleScoreSeries.value
	.map((series) => `${series.label}：${scoreBins.value.map((scoreBin) => `${scoreBin.label} 分 ${series.counts[scoreBin.index]} ${resultUnit.value}`).join('，')}`)
	.join('；')}`)

const TIME_CHART_HEIGHT = 236
const TIME_CHART_TOP = 18
const TIME_CHART_BOTTOM = 194
const TIME_CHART_LEFT = 34
const TIME_CHART_RIGHT = 14
const TIME_POINT_RADIUS = 4
const TIME_POINT_ACTIVE_RADIUS = 6
const TIME_POINT_HIT_RADIUS = 22
const MIN_YEAR_LABEL_GAP = 52
const timeYTicks = [0, 2, 4, 6, 8, 10]
const SEASON_LABELS = ['冬季', '春季', '夏季', '秋季'] as const
const seasonLabel = (quarter: number) => SEASON_LABELS[quarter - 1] ?? `第 ${quarter} 季度`
const timeTickY = (score: number) => TIME_CHART_TOP + (10 - score) / 10 * (TIME_CHART_BOTTOM - TIME_CHART_TOP)

const timeChart = computed(() => {
	const sourceSeries = props.series.map((series) => ({
		...series,
		quarters: buildQuarterlyRatingAverages(series.subjects, scoreSource.value),
	}))
	const allQuarters = sourceSeries.flatMap((series) => series.quarters)
	const width = timeChartWidth.value
	if (!allQuarters.length) {
		return {
			width,
			years: [] as TimeAxisYear[],
			quarterLabels: [] as TimeAxisQuarter[],
			series: [] as ComparisonTimeSeries[],
			label: `没有同时具备播出时间和${sourceLabel.value}的作品`,
		}
	}

	const firstQuarter = Math.min(...allQuarters.map((quarter) => quarter.quarterIndex))
	const lastQuarter = Math.max(...allQuarters.map((quarter) => quarter.quarterIndex))
	const quarterCount = lastQuarter - firstQuarter + 1
	const plotWidth = Math.max(1, width - TIME_CHART_LEFT - TIME_CHART_RIGHT)
	const quarterWidth = plotWidth / quarterCount
	const plotHeight = TIME_CHART_BOTTOM - TIME_CHART_TOP
	const quarterLabels = quarterWidth >= 24
		? Array.from({ length: quarterCount }, (_, index): TimeAxisQuarter => {
			const key = firstQuarter + index
			return {
				key,
				quarter: key % 4 + 1,
				x: TIME_CHART_LEFT + (index + 0.5) * quarterWidth,
			}
		})
		: []

	const firstYear = Math.floor(firstQuarter / 4)
	const lastYear = Math.floor(lastQuarter / 4)
	const yearCount = lastYear - firstYear + 1
	const maxYearLabels = Math.max(2, Math.floor(plotWidth / MIN_YEAR_LABEL_GAP))
	const yearLabelInterval = Math.max(1, Math.ceil(yearCount / maxYearLabels))
	const years = Array.from({ length: yearCount }, (_, index): TimeAxisYear => {
		const year = firstYear + index
		const startQuarter = Math.max(firstQuarter, year * 4)
		const endQuarter = Math.min(lastQuarter, year * 4 + 3)
		const startOffset = startQuarter - firstQuarter
		const endOffset = endQuarter - firstQuarter + 1
		return {
			year,
			lineX: TIME_CHART_LEFT + startOffset * quarterWidth,
			x: TIME_CHART_LEFT + (startOffset + endOffset) / 2 * quarterWidth,
			showLabel: false,
		}
	})
	let previousYearLabelIndex = -1
	for (let index = 0; index < years.length; index += 1) {
		const isLast = index === years.length - 1
		const isCandidate = index === 0 || isLast || index % yearLabelInterval === 0
		if (!isCandidate) continue
		if (isLast && previousYearLabelIndex >= 0 && years[index].x - years[previousYearLabelIndex].x < MIN_YEAR_LABEL_GAP) {
			years[previousYearLabelIndex].showLabel = false
		}
		years[index].showLabel = true
		previousYearLabelIndex = index
	}

	const chartSeries = sourceSeries
		.filter((series) => series.quarters.length)
		.map((series): ComparisonTimeSeries => {
			const points = series.quarters.map((quarter): ComparisonTimePoint => {
				const x = TIME_CHART_LEFT + (quarter.quarterIndex - firstQuarter + 0.5) * quarterWidth
				const y = TIME_CHART_TOP + (10 - quarter.average) / 10 * plotHeight
				return {
					key: quarter.quarterIndex,
					x,
					y,
					tooltip: `${series.label} · ${quarter.year} ${seasonLabel(quarter.quarter)} · 均分 ${quarter.average.toFixed(2)} · ${quarter.works.length} 部作品`,
				}
			})
			return {
				key: series.key,
				label: series.label,
				color: series.color,
				points,
				polyline: points.map((point) => `${point.x},${point.y}`).join(' '),
				summary: `${series.label}，共 ${points.length} 个季度，均分范围 ${Math.min(...series.quarters.map((quarter) => quarter.average)).toFixed(2)} 到 ${Math.max(...series.quarters.map((quarter) => quarter.average)).toFixed(2)}`,
			}
		})

	return {
		width,
		years,
		quarterLabels,
		series: chartSeries,
		label: `${sourceLabel.value}时间对比；折线表示各系列的季度均分。${chartSeries.map((series) => `${series.label} ${series.points.length} 个季度`).join('；')}`,
	}
})

const timePointTotal = computed(() => timeChart.value.series.reduce((sum, series) => sum + series.points.length, 0))
const availableTimeSeriesKeys = computed(() => new Set(timeChart.value.series.map((series) => series.key)))
const availableSeriesKeys = computed(() => chartMode.value === 'score'
	? availableScoreSeriesKeys.value
	: availableTimeSeriesKeys.value)
const isSeriesAvailable = (seriesKey: string) => availableSeriesKeys.value.has(seriesKey)
const visibleTimeSeries = computed(() => timeChart.value.series.filter((series) => isSeriesVisible(series.key)))
const renderedTimeSeries = computed(() => [
	...visibleTimeSeries.value.filter((series) => series.key !== 'shared-works'),
	...visibleTimeSeries.value.filter((series) => series.key === 'shared-works'),
])
const comparisonTimePointKey = (seriesKey: string, pointKey: number) => `${seriesKey}:${pointKey}`
const activeTimePointKey = computed(() => focusedTimePointKey.value ?? hoveredTimePointKey.value)
const updateHoveredTimePoint = (event: PointerEvent) => {
	const chart = event.currentTarget
	if (!(chart instanceof SVGSVGElement)) return
	const bounds = chart.getBoundingClientRect()
	if (!bounds.width || !bounds.height) return

	let nearestKey: string | null = null
	let nearestDistance = Number.POSITIVE_INFINITY
	for (const series of renderedTimeSeries.value) {
		for (const point of series.points) {
			const clientX = bounds.left + point.x / timeChart.value.width * bounds.width
			const clientY = bounds.top + point.y / TIME_CHART_HEIGHT * bounds.height
			const distance = Math.hypot(event.clientX - clientX, event.clientY - clientY)
			if (distance >= nearestDistance) continue
			nearestKey = comparisonTimePointKey(series.key, point.key)
			nearestDistance = distance
		}
	}

	hoveredTimePointKey.value = nearestDistance <= TIME_POINT_HIT_RADIUS ? nearestKey : null
}
const visibleTimeChartLabel = computed(() => visibleTimeSeries.value.length
	? `${sourceLabel.value}时间对比；折线表示当前勾选系列的季度均分。${visibleTimeSeries.value
		.map((series) => `${series.label} ${series.points.length} 个季度`)
		.join('；')}`
	: `${sourceLabel.value}时间对比；当前未显示时间曲线`)
</script>

<template>
	<div class="analysis-domain__block rating-distribution-panel">
		<div class="section-heading rating-distribution-panel__heading">
			<h2 id="comparison-rating-distribution-title">{{ seriesMode ? '系列均分分布' : '评分分布' }}</h2>
			<div v-if="!seriesMode || !isGlobalQuery" class="rating-distribution-panel__controls">
				<div v-if="!seriesMode" class="rating-distribution-panel__control-group">
					<n-radio-group v-model:value="chartMode" :size="controlSize" role="radiogroup" aria-label="评分图表维度">
						<n-radio-button value="score">按评分</n-radio-button>
						<n-radio-button value="time">按时间</n-radio-button>
					</n-radio-group>
				</div>
				<div v-if="!isGlobalQuery" class="rating-distribution-panel__control-group">
					<n-radio-group v-model:value="scoreSource" :size="controlSize" role="radiogroup" aria-label="评分数据来源">
						<n-radio-button value="personal">我的评分</n-radio-button>
						<n-radio-button value="global">全站评分</n-radio-button>
					</n-radio-group>
				</div>
			</div>
		</div>

		<div class="distribution-legend" role="group" aria-label="评分对比系列">
			<span
				v-for="series in series"
				:key="series.key"
				:class="{ 'is-hidden': !isSeriesVisible(series.key) || !isSeriesAvailable(series.key) }"
				:style="{ '--series-color': series.color, '--series-contrast': seriesCheckMarkColor(series.color) }"
			>
				<n-checkbox
					:size="controlSize"
					:theme-overrides="seriesCheckboxThemeOverrides"
					:checked="isSeriesVisible(series.key) && isSeriesAvailable(series.key)"
					:disabled="!isSeriesAvailable(series.key)"
					@update:checked="setSeriesVisible(series.key, $event)"
				>
					<span class="distribution-legend__checkbox-label">
						<b><template v-if="series.marker">{{ series.marker }} · </template>{{ series.label }}</b>
					</span>
				</n-checkbox>
			</span>
		</div>

		<template v-if="chartMode === 'score'">
			<Transition name="score-source" mode="out-in">
				<div
					v-if="scoreTotal"
					:key="scoreSource"
					class="horizontal-distribution"
					role="group"
					:aria-label="scoreComparisonLabel"
					:style="{
						'--distribution-steps': Math.max(1, distributionTicks.length - 1),
						'--series-count': Math.max(1, visibleScoreSeries.length),
					}"
				>
					<div class="horizontal-distribution__axis" aria-hidden="true">
						<span
							v-for="tick in distributionTicks"
							:key="tick"
							:style="{ left: `${tick / distributionAxisMax * 100}%` }"
						>{{ tick }}</span>
					</div>
					<div
						v-for="(scoreBin, scoreRowIndex) in renderedScoreBins"
						:key="scoreBin.label"
						class="horizontal-score-group"
					>
						<small>{{ scoreBin.label }}</small>
						<div class="horizontal-score-group__plot">
							<div
								v-for="(series, seriesIndex) in scoreBin.series"
								:key="series.key"
								class="horizontal-score-bar"
								:style="{
									'--series-color': series.color,
									'--bar-width': `${distributionBarWidth(series.counts[scoreBin.index])}%`,
									'--bar-delay': `${scoreRowIndex * 12 + seriesIndex * 8}ms`,
								}"
								tabindex="0"
								:aria-label="`${series.label}，${scoreBin.label} 分，${series.counts[scoreBin.index]} ${resultUnit}`"
								@mouseenter="hoveredGroupedBar = scoreBarKey(series.key, scoreBin.label)"
								@mouseleave="hoveredGroupedBar = null"
								@focus="hoveredGroupedBar = scoreBarKey(series.key, scoreBin.label)"
								@blur="hoveredGroupedBar = null"
							>
								<n-tooltip
									:show="hoveredGroupedBar === scoreBarKey(series.key, scoreBin.label)"
									trigger="manual"
									placement="top"
									:animated="false"
									style="max-width: min(336px, calc(100dvw - 72px));"
									content-class="workbench-tooltip-content"
								>
									<template #trigger>
										<span class="horizontal-score-bar__track">
											<span class="horizontal-score-bar__fill" aria-hidden="true">
												<span class="horizontal-score-bar__value">{{ series.counts[scoreBin.index] }}</span>
											</span>
										</span>
									</template>
									<ScoreDistributionTooltip
										:series-label="series.label"
										:score-label="scoreBin.label"
										:works="series.buckets[scoreBin.index].works"
										:unit-label="resultUnit"
									/>
								</n-tooltip>
							</div>
						</div>
					</div>
				</div>
				<p v-else key="score-empty-data" class="rating-distribution-panel__empty">没有可用于比较的{{ sourceLabel }}</p>
			</Transition>
		</template>

		<template v-else>
			<p class="rating-time-chart__meaning">圆点与折线均表示各对比系列的季度均分</p>
			<div ref="timeChartHost" class="rating-time-chart__viewport comparison-time-chart__viewport">
			<svg
				v-if="timePointTotal"
				class="rating-time-chart comparison-time-chart"
				:viewBox="`0 0 ${timeChart.width} ${TIME_CHART_HEIGHT}`"
				role="img"
				:aria-label="visibleTimeChartLabel"
				@pointermove="updateHoveredTimePoint"
				@pointerleave="hoveredTimePointKey = null"
			>
				<g class="rating-time-chart__grid" aria-hidden="true">
					<template v-for="tick in timeYTicks" :key="tick">
						<line :x1="TIME_CHART_LEFT" :x2="timeChart.width - TIME_CHART_RIGHT" :y1="timeTickY(tick)" :y2="timeTickY(tick)" />
						<text :x="TIME_CHART_LEFT - 8" :y="timeTickY(tick) + 4" text-anchor="end">{{ tick }}</text>
					</template>
					<template v-for="year in timeChart.years" :key="year.year">
						<line v-if="year.showLabel" class="rating-time-chart__quarter-line is-year" :x1="year.lineX" :x2="year.lineX" :y1="TIME_CHART_TOP" :y2="TIME_CHART_BOTTOM" />
						<text v-if="year.showLabel" class="rating-time-chart__year-label" :x="year.x" y="228" text-anchor="middle">{{ year.year }}</text>
					</template>
					<template v-for="quarter in timeChart.quarterLabels" :key="quarter.key">
						<text class="rating-time-chart__quarter-label" :x="quarter.x" y="211" text-anchor="middle">{{ seasonLabel(quarter.quarter) }}</text>
					</template>
				</g>
				<g
					v-for="(series, seriesIndex) in renderedTimeSeries"
					:key="`${scoreSource}-${series.key}`"
					class="comparison-time-chart__series"
					:class="{ 'is-shared': series.key === 'shared-works' }"
					:style="{ '--series-color': series.color, '--series-delay': `${seriesIndex * 24}ms` }"
					role="group"
					:aria-label="series.summary"
				>
					<polyline v-if="series.points.length > 1" class="comparison-time-chart__line" pathLength="1" :points="series.polyline" />
					<circle
						v-for="point in series.points"
						:key="point.key"
						class="comparison-time-chart__point"
						:cx="point.x"
						:cy="point.y"
						:r="activeTimePointKey === comparisonTimePointKey(series.key, point.key) ? TIME_POINT_ACTIVE_RADIUS : TIME_POINT_RADIUS"
						:style="{
							transform: 'scale(1)',
							stroke: activeTimePointKey === comparisonTimePointKey(series.key, point.key) ? 'var(--focus)' : undefined,
							strokeWidth: activeTimePointKey === comparisonTimePointKey(series.key, point.key) ? 2.5 : undefined,
						}"
						tabindex="0"
						:aria-label="point.tooltip"
						@focus="focusedTimePointKey = comparisonTimePointKey(series.key, point.key)"
						@blur="focusedTimePointKey = null"
					>
						<title>{{ point.tooltip }}</title>
					</circle>
				</g>
			</svg>
			<p v-else class="rating-distribution-panel__empty">{{ timeChart.label }}</p>
			</div>
		</template>
	</div>
</template>
