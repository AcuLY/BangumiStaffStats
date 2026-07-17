<script setup lang="ts">
import { watch } from 'vue'
import {
	scheduleTooltipViewportClamp,
	useTooltipViewportBoundary,
} from '../composables/useTooltipViewportBoundary'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
	show?: boolean
}>()

useTooltipViewportBoundary()
const handleShowChange = (show: boolean) => {
	if (show) scheduleTooltipViewportClamp()
}
watch(() => props.show, (show) => {
	if (show) scheduleTooltipViewportClamp()
}, { flush: 'post' })
</script>

<template>
	<n-tooltip
		v-bind="$attrs"
		:show="show"
		:flip="true"
		:animated="false"
		:internal-extra-class="['workbench-viewport-tooltip']"
		content-class="workbench-tooltip-content"
		@update:show="handleShowChange"
	>
		<template #trigger>
			<slot name="trigger" />
		</template>
		<slot />
	</n-tooltip>
</template>
