<script setup lang="ts">
import { useMediaQuery } from '../composables/useMediaQuery'

withDefaults(defineProps<{
	showSummary?: boolean
}>(), {
	showSummary: true,
})

const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const compactViewport = useMediaQuery('(width < 780px)')
const pageItems = Array.from({ length: 5 }, (_, index) => index)
</script>

<template>
	<nav class="adaptive-pagination query-skeleton__adaptive-pagination" aria-hidden="true">
		<span v-if="showSummary" class="adaptive-pagination__summary query-skeleton__pagination-summary">
			<n-skeleton :animated="!reducedMotion" width="96px" height="12px" :sharp="false" />
		</span>
		<div class="adaptive-pagination__pages query-skeleton__pagination-pages">
			<n-skeleton
				v-for="item in pageItems"
				:key="item"
				:animated="!reducedMotion"
				:width="compactViewport ? '22px' : '28px'"
				:height="compactViewport ? '22px' : '28px'"
				:sharp="false"
			/>
		</div>
		<div class="adaptive-pagination__control adaptive-pagination__control--tools query-skeleton__pagination-tools">
			<n-skeleton :animated="!reducedMotion" width="88px" :height="compactViewport ? '22px' : '28px'" :sharp="false" />
			<n-skeleton :animated="!reducedMotion" width="60px" :height="compactViewport ? '22px' : '28px'" :sharp="false" />
		</div>
	</nav>
</template>
