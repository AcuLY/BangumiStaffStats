<script setup lang="ts">
import { watch } from 'vue'
import { useWorkbench } from '../composables/useWorkbench'
import { useMediaQuery } from '../composables/useMediaQuery'
import PersonPicker from './PersonPicker.vue'
import AnalysisDashboard from './AnalysisDashboard.vue'

const workbench = useWorkbench()
const isMobile = useMediaQuery('(max-width: 780px)')

const containDrawerWheel = (event: WheelEvent) => {
	if (!event.deltaY) return
	const scrollContainer = event.currentTarget
	if (!(scrollContainer instanceof HTMLElement)) return

	const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight
	const canScroll = event.deltaY < 0
		? scrollContainer.scrollTop > 0
		: scrollContainer.scrollTop < maxScrollTop - 1
	if (!canScroll) event.preventDefault()
	event.stopPropagation()
}

const drawerScrollbarProps = {
	containerStyle: { overscrollBehavior: 'contain' },
	onWheel: containDrawerWheel,
}

watch(isMobile, (mobile) => {
	if (!mobile) workbench.peopleDrawerOpen.value = false
})

</script>

<template>
	<div id="mode-panel-co-star" class="co-star-workbench" role="tabpanel" aria-labelledby="mode-tab-co-star">
		<aside v-if="!isMobile" class="people-rail" aria-label="人物选择面板">
			<PersonPicker />
		</aside>

		<section id="analysis-main" class="analysis-main" aria-label="共演分析结果">
			<AnalysisDashboard />
		</section>

		<n-drawer
			v-if="isMobile"
			id="mobile-person-picker"
			v-model:show="workbench.peopleDrawerOpen.value"
			class="workbench-translucent-drawer"
			:block-scroll="true"
			placement="bottom"
			height="min(88dvh, 760px)"
			aria-label="人物选择"
		>
			<!-- Special case: DrawerContent has no edge-to-edge body prop; use its public body-content-style API. -->
			<n-drawer-content :native-scrollbar="false" :scrollbar-props="drawerScrollbarProps" body-content-style="padding: 0;" :closable="false">
				<PersonPicker drawer @close="workbench.peopleDrawerOpen.value = false" />
			</n-drawer-content>
		</n-drawer>
	</div>
</template>
