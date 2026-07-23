<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Subject } from '../types'
import {
	buildQuarterlyRatingAverages,
	buildScoreDistribution,
	formatRatingDate,
	type RatingSource,
} from '../domain/ratingDistribution'
import { useWorkbenchControlSize } from '../composables/useWorkbenchControlSize'
import ScoreDistributionTooltip from './ScoreDistributionTooltip.vue'

const props = withDefaults(defineProps<{
	subjects: Subject[]
	personName: string
	isGlobalQuery: boolean
	seriesMode?: boolean
}>(), {
	seriesMode: false,
})

const { controlSize } = useWorkbenchControlSize()

type ChartMode = 'score' | 'time'

const chartMode = ref<ChartMode>('score')
const scoreSource = ref<RatingSource>(props.isGlobalQuery ? 'global' : 'personal')
const hoveredDistributionLabel = ref<string | null>(null)
const hoveredTimeWork = ref<string | null>(null)
const focusedTimeWork = ref<string | null>(null)
const timeChartHost = ref<HTMLElement | null>(null)
const timeChartWidth = ref(360)

watch(() => props.isGlobalQuery, (isGlobal) => {
	scoreSource.value = isGlobal ? 'global' : 'personal'
}, { immediate: true })

watch(() => props.seriesMode, (seriesMode) => {
	if (seriesMode) chartMode.value = 'score'
}, { immediate: true })

watch(() => props.personName, () => {
	hoveredDistributionLabel.value = null
	hoveredTimeWork.value = null
	focusedTimeWork.value = null
})

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

watch(scoreSource, () => {
	hoveredDistributionLabel.value = null
	hoveredTimeWork.value = null
	focusedTimeWork.value = null
})

const sourceLabel = computed(() => scoreSource.value === 'personal'
	? '我的评分'
	: props.isGlobalQuery ? '评分' : '全站评分')
const resultUnit = computed(() => props.seriesMode ? '个系列' : '部作品')
const distribution = computed(() => buildScoreDistribution(props.subjects, scoreSource.value))
const distributionTotal = computed(() => distribution.value.reduce((sum, item) => sum + item.value, 0))
const maxDistribution = computed(() => Math.max(1, ...distribution.value.map((item) => item.value)))
const distributionTickStep = computed(() => {
	const roughStep = maxDistribution.value / 4
	const magnitude = 10 ** Math.floor(Math.log10(roughStep))
	const normalized = roughStep / magnitude
	const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
	return Math.max(1, multiplier * magnitude)
})
const distributionAxisMax = computed(() => Math.ceil(maxDistribution.value / distributionTickStep.value) * distributionTickStep.value)
const distributionTicks = computed(() => Array.from(
	{ length: Math.round(distributionAxisMax.value / distributionTickStep.value) + 1 },
	(_, index) => index * distributionTickStep.value,
))
const distributionBarHeight = (value: number) => value
	? Math.max(4, value / distributionAxisMax.value * 100)
	: 0
const distributionLabel = computed(() => `${props.personName}的${sourceLabel.value}分布：${distribution.value
	.map((item) => `${item.label} 分 ${item.value} ${resultUnit.value}`)
	.join('，')}`)

const TIME_CHART_HEIGHT = 236
const TIME_CHART_TOP = 18
const TIME_CHART_BOTTOM = 194
const TIME_CHART_LEFT = 34
const TIME_CHART_RIGHT = 14
const TIME_POINT_RADIUS = 4
const TIME_POINT_ACTIVE_RADIUS = 6
const TIME_POINT_HIT_RADIUS = 22
const timeYTicks = [0, 2, 4, 6, 8, 10]
const MIN_YEAR_LABEL_GAP = 52
const SEASON_LABELS = ['冬季', '春季', '夏季', '秋季'] as const
const seasonLabel = (quarter: number) => SEASON_LABELS[quarter - 1] ?? `第 ${quarter} 季度`

const timeChart = computed(() => {
	const sourceQuarters = buildQuarterlyRatingAverages(props.subjects, scoreSource.value)
	const width = timeChartWidth.value
	if (!sourceQuarters.length) {
		return {
			width,
			years: [] as Array<{ year: number; x: number; lineX: number; showLabel: boolean }>,
			quarterLabels: [] as Array<{ key: number; quarter: number; x: number }>,
			averages: [] as Array<{ key: number; x: number; y: number }>,
			works: [] as Array<{
				key: string
				date: string
				year: number
				quarter: number
				x: number
				y: number
				score: number
				quarterAverage: number
				name: string
				tooltipX: number
				tooltipBelow: boolean
				tooltip: string
			}>,
			polyline: '',
			label: `没有同时具备播出时间和${sourceLabel.value}的作品`,
		}
	}

	const firstQuarter = sourceQuarters[0].quarterIndex
	const lastQuarter = sourceQuarters[sourceQuarters.length - 1].quarterIndex
	const quarterCount = lastQuarter - firstQuarter + 1
	const plotWidth = Math.max(1, width - TIME_CHART_LEFT - TIME_CHART_RIGHT)
	const quarterWidth = plotWidth / quarterCount
	const plotHeight = TIME_CHART_BOTTOM - TIME_CHART_TOP
	const quarterLabels = quarterWidth >= 24
		? Array.from({ length: quarterCount }, (_, index) => {
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
	const maxYearLabels = Math.max(2, Math.floor(plotWidth / 52))
	const yearLabelInterval = Math.max(1, Math.ceil(yearCount / maxYearLabels))
	const years = Array.from({ length: yearCount }, (_, index) => {
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

	const averages = sourceQuarters.map((quarter) => {
		const x = TIME_CHART_LEFT + (quarter.quarterIndex - firstQuarter + 0.5) * quarterWidth
		const y = TIME_CHART_TOP + (10 - quarter.average) / 10 * plotHeight
		return {
			key: quarter.quarterIndex,
			x,
			y,
		}
	})
	const works = sourceQuarters.flatMap((quarter) => quarter.works.map((point, index) => {
		const quarterOffset = (index + 1) / (quarter.works.length + 1)
		const x = TIME_CHART_LEFT + (quarter.quarterIndex - firstQuarter + quarterOffset) * quarterWidth
		const y = TIME_CHART_TOP + (10 - point.score) / 10 * plotHeight
		const name = point.subject.displayName || point.subject.nameCN || point.subject.name || `条目 ${point.subject.id}`
		const score = Number.isInteger(point.score) ? String(point.score) : point.score.toFixed(2)
		return {
			key: `${quarter.quarterIndex}-${point.subject.id}`,
			date: point.date,
			year: quarter.year,
			quarter: quarter.quarter,
			x,
			y,
			score: point.score,
			quarterAverage: quarter.average,
			name,
			tooltipX: Math.min(width - 130, Math.max(130, x)),
			tooltipBelow: y < 92,
			tooltip: `${name} · ${score} 分 · ${formatRatingDate(point.date)}`,
		}
	}))
	return {
		width,
		years,
		quarterLabels,
		averages,
		works,
		polyline: averages.map((point) => `${point.x},${point.y}`).join(' '),
		label: `${props.personName}的${sourceLabel.value}时间图，共 ${works.length} 个作品点；折线表示各季度平均分，从 ${sourceQuarters[0].year} ${seasonLabel(sourceQuarters[0].quarter)}至 ${sourceQuarters[sourceQuarters.length - 1].year} ${seasonLabel(sourceQuarters[sourceQuarters.length - 1].quarter)}。`,
	}
})

const activeTimeWork = computed(() => focusedTimeWork.value ?? hoveredTimeWork.value)
const hoveredTimePoint = computed(() => timeChart.value.works.find((point) => point.key === activeTimeWork.value) ?? null)

const updateHoveredTimeWork = (event: PointerEvent) => {
	const chart = event.currentTarget
	if (!(chart instanceof SVGSVGElement)) return
	const bounds = chart.getBoundingClientRect()
	if (!bounds.width || !bounds.height) return

	let nearestKey: string | null = null
	let nearestDistance = Number.POSITIVE_INFINITY
	for (const point of timeChart.value.works) {
		const clientX = bounds.left + point.x / timeChart.value.width * bounds.width
		const clientY = bounds.top + point.y / TIME_CHART_HEIGHT * bounds.height
		const distance = Math.hypot(event.clientX - clientX, event.clientY - clientY)
		if (distance >= nearestDistance) continue
		nearestKey = point.key
		nearestDistance = distance
	}

	hoveredTimeWork.value = nearestDistance <= TIME_POINT_HIT_RADIUS ? nearestKey : null
}

const timeTickY = (score: number) => TIME_CHART_TOP + (10 - score) / 10 * (TIME_CHART_BOTTOM - TIME_CHART_TOP)
</script>

<template>
	<div class="rating-distribution-panel">
		<div class="section-heading rating-distribution-panel__heading">
			<h2 id="rating-distribution-title">{{ seriesMode ? '系列均分分布' : '评分分布' }}</h2>
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

		<div
			v-if="chartMode === 'score' && distributionTotal"
			class="score-distribution"
			role="img"
			:aria-label="distributionLabel"
			:style="{ '--distribution-steps': Math.max(1, distributionTicks.length - 1) }"
		>
			<div class="score-distribution__axis" aria-hidden="true">
				<span
					v-for="tick in distributionTicks"
					:key="tick"
					:style="{ bottom: `${tick / distributionAxisMax * 100}%` }"
				>{{ tick }}</span>
			</div>
			<div
				v-for="item in distribution"
				:key="item.label"
				class="score-bar"
				:class="{ 'score-bar--peak': item.value === maxDistribution && item.value > 0, 'score-bar--empty': !item.value }"
				:style="{ '--score-bar-height': `${distributionBarHeight(item.value)}%` }"
				:tabindex="item.value ? 0 : undefined"
				:aria-label="item.value ? `${item.label} 分，共 ${item.value} ${resultUnit}` : `${item.label} 分，没有${seriesMode ? '系列' : '作品'}`"
				@mouseenter="hoveredDistributionLabel = item.value ? item.label : null"
				@mouseleave="hoveredDistributionLabel = null"
				@focus="hoveredDistributionLabel = item.value ? item.label : null"
				@blur="hoveredDistributionLabel = null"
			>
				<span class="score-bar__track">
					<n-tooltip
						v-if="item.value"
						:show="hoveredDistributionLabel === item.label"
						trigger="manual"
						placement="top"
						:animated="false"
						style="max-width: min(336px, calc(100dvw - 72px));"
						content-class="workbench-tooltip-content"
					>
						<template #trigger><span class="score-bar__value">{{ item.value }}</span></template>
						<ScoreDistributionTooltip :score-label="item.label" :works="item.works" :unit-label="resultUnit" />
					</n-tooltip>
					<i />
				</span>
				<small>{{ item.label }}</small>
			</div>
		</div>
		<p v-else-if="chartMode === 'score'" class="rating-distribution-panel__empty">没有可用于统计的{{ sourceLabel }}</p>

		<template v-else>
			<p class="rating-time-chart__meaning">圆点表示单部作品评分 · 折线表示季度均分</p>
			<div ref="timeChartHost" class="rating-time-chart__viewport">
			<svg
				v-if="timeChart.works.length"
				class="rating-time-chart"
				:viewBox="`0 0 ${timeChart.width} ${TIME_CHART_HEIGHT}`"
				role="img"
				:aria-label="timeChart.label"
				@pointermove="updateHoveredTimeWork"
				@pointerleave="hoveredTimeWork = null"
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
				<polyline v-if="timeChart.averages.length > 1" class="rating-time-chart__line" :points="timeChart.polyline" />
				<g
					v-for="point in timeChart.works"
					:key="point.key"
					class="rating-time-chart__point"
				>
					<circle
						class="rating-time-chart__visible-point"
						:cx="point.x"
						:cy="point.y"
						:r="activeTimeWork === point.key ? TIME_POINT_ACTIVE_RADIUS : TIME_POINT_RADIUS"
						:style="{
							transform: 'scale(1)',
							fill: activeTimeWork === point.key ? 'var(--primary-text)' : undefined,
							stroke: focusedTimeWork === point.key ? 'var(--focus)' : undefined,
							strokeWidth: focusedTimeWork === point.key ? 2.5 : undefined,
						}"
						tabindex="0"
						:aria-label="point.tooltip"
						@focus="focusedTimeWork = point.key"
						@blur="focusedTimeWork = null"
					>
						<title>{{ point.tooltip }}</title>
					</circle>
				</g>
			</svg>
			<div
				v-if="hoveredTimePoint"
				class="rating-time-chart__tooltip"
				:class="{ 'is-below': hoveredTimePoint.tooltipBelow }"
				:style="{ left: `${hoveredTimePoint.tooltipX}px`, top: `${hoveredTimePoint.y}px` }"
				role="tooltip"
			>
				<strong>{{ hoveredTimePoint.name }}</strong>
				<span>{{ sourceLabel }} {{ Number.isInteger(hoveredTimePoint.score) ? hoveredTimePoint.score : hoveredTimePoint.score.toFixed(2) }}</span>
				<small>{{ formatRatingDate(hoveredTimePoint.date) }} · 季度均分 {{ hoveredTimePoint.quarterAverage.toFixed(2) }}</small>
			</div>
			<p v-if="!timeChart.works.length" class="rating-distribution-panel__empty">{{ timeChart.label }}</p>
			</div>
		</template>
	</div>
</template>
