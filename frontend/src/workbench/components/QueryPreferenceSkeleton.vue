<script setup lang="ts">
import { computed } from 'vue'
import { useMediaQuery } from '../composables/useMediaQuery'

const props = withDefaults(defineProps<{
	variant?: 'ranking' | 'shared'
}>(), {
	variant: 'ranking',
})

const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const columns = Array.from({ length: 2 }, (_, index) => index)
const worksByColumn = computed(() => columns.map((column) => (
	props.variant === 'shared' && column === 0
		? []
		: Array.from({ length: 3 }, (_, index) => index)
)))
</script>

<template>
	<div class="preference-list query-skeleton__preference-list">
		<div class="preference-columns">
			<div v-for="column in columns" :key="column">
				<h3><n-skeleton :animated="!reducedMotion" width="72px" height="18px" :sharp="false" /></h3>
				<ul>
					<li v-for="work in worksByColumn[column]" :key="work">
						<div class="preference-work query-skeleton__preference-work">
							<span class="safe-image safe-image--subject query-skeleton__preference-cover">
								<n-skeleton :animated="!reducedMotion" width="100%" height="100%" sharp />
							</span>
							<span class="preference-work__copy query-skeleton__preference-copy">
								<n-skeleton :animated="!reducedMotion" :width="work % 2 ? '68%' : '82%'" height="13px" :sharp="false" />
								<n-skeleton :animated="!reducedMotion" width="76%" height="10px" :sharp="false" />
							</span>
							<b><n-skeleton :animated="!reducedMotion" width="28px" height="13px" :sharp="false" /></b>
						</div>
					</li>
					<li v-if="!worksByColumn[column].length" class="muted-row query-skeleton__preference-empty">
						<n-skeleton :animated="!reducedMotion" width="132px" height="17px" :sharp="false" />
					</li>
				</ul>
			</div>
		</div>
	</div>
</template>
