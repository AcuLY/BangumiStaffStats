<script setup lang="ts">
import { computed } from 'vue'
import type { Subject } from '../types'
import { buildScoreTooltipModel } from '../domain/ratingDistribution'

const props = withDefaults(defineProps<{
	works: Subject[]
	scoreLabel: string
	seriesLabel?: string
	unitLabel?: string
}>(), {
	unitLabel: '部作品',
})

const model = computed(() => buildScoreTooltipModel(props.works))
const heading = computed(() => [props.seriesLabel, `${props.scoreLabel} 分`, `${props.works.length} ${props.unitLabel}`]
	.filter(Boolean)
	.join(' · '))
</script>

<template>
	<div class="score-distribution-tooltip">
		<strong>{{ heading }}</strong>
		<ul :aria-label="`${heading}列表`">
			<li v-for="item in model.items" :key="item.id" :title="item.name">{{ item.name }}</li>
			<li v-if="model.hiddenCount" class="score-distribution-tooltip__more">… +{{ model.hiddenCount }}</li>
		</ul>
	</div>
</template>

<style scoped>
.score-distribution-tooltip {
	display: grid;
	gap: var(--space-2);
	min-width: min(240px, calc(100dvw - 80px));
	max-width: 100%;
}

.score-distribution-tooltip > strong {
	color: var(--text-1);
	font-size: var(--text-body);
}

.score-distribution-tooltip ul {
	display: grid;
	gap: var(--space-1);
	min-width: 0;
	margin: 0;
	padding: 0;
	list-style: none;
}

.score-distribution-tooltip li {
	min-width: 0;
	overflow: hidden;
	color: var(--text-2);
	font-size: var(--text-caption);
	line-height: 20px;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.score-distribution-tooltip .score-distribution-tooltip__more {
	color: var(--text-3);
	font-weight: 600;
}
</style>
