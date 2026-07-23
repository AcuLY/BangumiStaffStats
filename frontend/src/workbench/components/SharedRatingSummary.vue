<script setup lang="ts">
const props = defineProps<{
	sharedCount: number
	ratedCount: number
	globalAverage: number | null
	personalAverage: number | null
	personalHighest: number | null
	personalLowest: number | null
	showPersonal: boolean
	seriesMode?: boolean
}>()

const formatAverage = (value: number | null) => Number.isFinite(value) ? Number(value).toFixed(2) : '—'
const formatPersonalScore = (value: number | null) => Number.isFinite(value)
	? props.seriesMode ? Number(value).toFixed(2) : String(Number(value))
	: '—'
</script>

<template>
	<dl
		class="analysis-profile-summary shared-rating-summary shared-rating-summary--below metric-grid"
		:data-metric-count="props.showPersonal ? 6 : 2"
		aria-label="多人组合概览"
	>
		<div class="metric-unit"><dd class="metric-unit__value">{{ props.sharedCount }}</dd><dt class="metric-unit__label">{{ props.seriesMode ? '共同系列' : '共同作品' }}</dt></div>
		<div v-if="props.showPersonal" class="metric-unit"><dd class="metric-unit__value">{{ props.ratedCount }}</dd><dt class="metric-unit__label">{{ props.seriesMode ? '已评系列' : '已评作品' }}</dt></div>
		<div class="metric-unit"><dd class="metric-unit__value">{{ formatAverage(props.globalAverage) }}</dd><dt class="metric-unit__label">{{ props.showPersonal ? '全站均分' : '均分' }}</dt></div>
		<div v-if="props.showPersonal" class="analysis-profile-summary__metric--primary metric-unit"><dd class="metric-unit__value">{{ formatAverage(props.personalAverage) }}</dd><dt class="metric-unit__label">我的均分</dt></div>
		<div v-if="props.showPersonal" class="metric-unit"><dd class="metric-unit__value">{{ formatPersonalScore(props.personalHighest) }}</dd><dt class="metric-unit__label">{{ props.seriesMode ? '最高均分' : '最高评分' }}</dt></div>
		<div v-if="props.showPersonal" class="metric-unit"><dd class="metric-unit__value">{{ formatPersonalScore(props.personalLowest) }}</dd><dt class="metric-unit__label">{{ props.seriesMode ? '最低均分' : '最低评分' }}</dt></div>
	</dl>
</template>
