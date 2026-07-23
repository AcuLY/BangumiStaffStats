<script setup lang="ts">
import { useMediaQuery } from '../composables/useMediaQuery'

const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const compactViewport = useMediaQuery('(max-width: 520px)')
const tagWidths = [
	['68px', '59px', '80px', '68px', '68px', '78px'],
	['56px', '68px', '68px', '80px', '68px', '68px', '66px', '90px'],
	['52px'],
]
</script>

<template>
	<div class="section-heading query-skeleton__section-heading">
		<div><n-skeleton :animated="!reducedMotion" width="84px" height="20px" :sharp="false" /></div>
		<n-skeleton :animated="!reducedMotion" width="108px" height="12px" :sharp="false" />
	</div>
	<div class="tag-groups query-skeleton__tag-groups">
		<div v-for="(widths, rowIndex) in tagWidths" :key="rowIndex" class="tag-row">
			<strong><n-skeleton :animated="!reducedMotion" width="64px" :height="compactViewport ? '16px' : '12px'" :sharp="false" /></strong>
			<div>
				<n-skeleton
					v-for="width in widths"
					:key="width"
					:animated="!reducedMotion"
					:width="width"
					:height="compactViewport ? '20px' : '28px'"
					round
				/>
			</div>
		</div>
	</div>
</template>
