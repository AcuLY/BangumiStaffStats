<script setup lang="ts">
import { useMediaQuery } from '../composables/useMediaQuery'

const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const selections = [
	{ person: '40px', positions: '48px' },
	{ person: '46px', positions: '42px' },
	{ person: '36px', positions: '56px' },
]
</script>

<template>
	<div
		class="mobile-picker-entry header-edit-card query-skeleton query-skeleton__mobile-picker-entry"
		aria-hidden="true"
	>
		<span class="mobile-picker-entry__copy">
			<span class="mobile-picker-entry__selections mobile-header-context-summary">
				<span
					v-for="(selection, index) in selections"
					:key="index"
					class="mobile-picker-entry__selection query-skeleton__mobile-picker-selection"
				>
					<n-skeleton :animated="!reducedMotion" :width="selection.person" height="12px" :sharp="false" />
					<n-skeleton :animated="!reducedMotion" :width="selection.positions" height="12px" :sharp="false" />
				</span>
			</span>
		</span>
		<span class="mobile-picker-entry__action header-edit-card__action">
			<n-skeleton :animated="!reducedMotion" width="18px" height="18px" round />
		</span>
	</div>
</template>
