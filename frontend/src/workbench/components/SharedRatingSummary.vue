<script setup lang="ts">
const props = defineProps<{
	sharedCount: number
	ratedCount: number
	globalAverage: number | null
	personalAverage: number | null
	personalHighest: number | null
	personalLowest: number | null
	showPersonal: boolean
	placement: 'pair' | 'below'
}>()

const formatAverage = (value: number | null) => Number.isFinite(value) ? Number(value).toFixed(2) : '—'
const formatPersonalScore = (value: number | null) => Number.isFinite(value) ? String(Number(value)) : '—'
</script>

<template>
	<aside
		class="analysis-profile-summary shared-rating-summary"
		:class="`shared-rating-summary--${props.placement}`"
		:aria-label="props.placement === 'pair' ? '双人组合概览' : '多人组合概览'"
	>
		<dl>
			<div><dt>共同作品</dt><dd>{{ props.sharedCount }}</dd></div>
			<div v-if="props.showPersonal"><dt>已评作品</dt><dd>{{ props.ratedCount }}</dd></div>
			<div><dt>全站均分</dt><dd>{{ formatAverage(props.globalAverage) }}</dd></div>
			<div v-if="props.showPersonal" class="analysis-profile-summary__metric--primary"><dt>我的均分</dt><dd>{{ formatAverage(props.personalAverage) }}</dd></div>
			<div v-if="props.showPersonal"><dt>我的最高</dt><dd>{{ formatPersonalScore(props.personalHighest) }}</dd></div>
			<div v-if="props.showPersonal"><dt>我的最低</dt><dd>{{ formatPersonalScore(props.personalLowest) }}</dd></div>
		</dl>
	</aside>
</template>
