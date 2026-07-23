<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useWorkbench } from '../composables/useWorkbench'
import { useMediaQuery } from '../composables/useMediaQuery'
import { shellScrollbarThemeOverrides } from '../naiveThemeOverrides'
import PersonPicker from './PersonPicker.vue'
import AnalysisDashboard from './AnalysisDashboard.vue'

const workbench = useWorkbench()
const isMobile = useMediaQuery('(width < 780px)')
const peopleRailHighlighted = ref(false)
let peopleRailHighlightTimer: number | undefined

const clearPeopleRailHighlight = () => {
	peopleRailHighlighted.value = false
	if (peopleRailHighlightTimer !== undefined) {
		window.clearTimeout(peopleRailHighlightTimer)
		peopleRailHighlightTimer = undefined
	}
}

const requestPersonSelection = async () => {
	if (isMobile.value) {
		workbench.peopleDrawerOpen.value = true
		return
	}

	clearPeopleRailHighlight()
	await nextTick()
	peopleRailHighlighted.value = true
	peopleRailHighlightTimer = window.setTimeout(clearPeopleRailHighlight, 900)
}

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
	themeOverrides: shellScrollbarThemeOverrides,
	onWheel: containDrawerWheel,
}

watch(isMobile, (mobile) => {
	if (mobile) clearPeopleRailHighlight()
	else workbench.peopleDrawerOpen.value = false
})

onBeforeUnmount(clearPeopleRailHighlight)

</script>

<template>
	<div id="mode-panel-co-star" class="co-star-workbench" role="tabpanel" aria-labelledby="mode-tab-co-star">
		<aside v-if="!isMobile" class="people-rail" :class="{ 'people-rail--attention': peopleRailHighlighted }" aria-label="人物选择面板">
			<PersonPicker />
		</aside>

		<section id="analysis-main" class="analysis-main" aria-label="共演分析">
			<AnalysisDashboard @request-person-selection="requestPersonSelection" />
		</section>

		<n-drawer
			v-if="isMobile"
			id="mobile-person-picker"
			v-model:show="workbench.peopleDrawerOpen.value"
			class="workbench-translucent-drawer"
			:block-scroll="true"
			show-mask="transparent"
			placement="bottom"
			height="calc(100dvh - var(--workbench-header-bar-height))"
			aria-label="人物选择"
		>
			<!-- Special case: DrawerContent has no edge-to-edge body prop; use its public body-content-style API. -->
			<n-drawer-content :native-scrollbar="false" :scrollbar-props="drawerScrollbarProps" body-content-style="padding: 0;" :closable="false">
				<PersonPicker drawer @close="workbench.peopleDrawerOpen.value = false" />
			</n-drawer-content>
		</n-drawer>
	</div>
</template>
