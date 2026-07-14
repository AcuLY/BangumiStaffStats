<script setup lang="ts">
import { ref, watch } from 'vue'
import { useWorkbench } from '../composables/useWorkbench'
import { useMediaQuery } from '../composables/useMediaQuery'
import PersonPicker from './PersonPicker.vue'
import AnalysisDashboard from './AnalysisDashboard.vue'
import AppIcon from './AppIcon.vue'

const workbench = useWorkbench()
const isMobile = useMediaQuery('(max-width: 780px)')
const railCollapsed = ref(false)

watch(isMobile, (mobile) => {
	if (!mobile) workbench.peopleDrawerOpen.value = false
})
</script>

<template>
		<div id="mode-panel-co-star" class="co-star-workbench" :class="{ 'is-rail-collapsed': railCollapsed }" role="tabpanel" aria-labelledby="mode-tab-co-star">
		<aside v-if="!isMobile" class="people-rail surface-panel" :aria-label="railCollapsed ? '人物选择面板已收起' : '人物选择面板'">
			<n-button
				class="rail-toggle"
				secondary
				circle
				size="small"
				attr-type="button"
				:aria-expanded="!railCollapsed"
				:aria-label="railCollapsed ? '展开人物选择面板' : '收起人物选择面板'"
				@click="railCollapsed = !railCollapsed"
			>
				<template #icon><AppIcon name="chevron" :size="17" /></template>
			</n-button>
			<div v-if="railCollapsed" class="collapsed-rail">
				<strong>{{ workbench.selectedPeople.value.length }}</strong>
				<span>选择人物</span>
			</div>
			<PersonPicker v-else />
		</aside>

		<section id="analysis-main" class="analysis-main" aria-label="共同参与分析结果">
			<button
				v-if="isMobile"
				class="mobile-picker-entry surface-panel"
				type="button"
				:aria-label="`打开人物选择，已选 ${workbench.selectedPeople.value.length} 人、${workbench.selectedScopes.value.length} 个身份`"
				@click="workbench.peopleDrawerOpen.value = true"
			>
				<span class="mobile-picker-entry__icon"><AppIcon name="people" :size="18" /></span>
				<span class="mobile-picker-entry__copy">
					<strong>人物选择</strong>
					<small>{{ workbench.selectedPeople.value.length }} 人 · {{ workbench.selectedScopes.value.length }} 个身份</small>
				</span>
				<AppIcon name="chevron" :size="17" />
			</button>
			<AnalysisDashboard />
		</section>

		<n-drawer v-if="isMobile" v-model:show="workbench.peopleDrawerOpen.value" placement="left" width="min(390px, calc(100vw - 24px))" aria-label="人物选择">
			<n-drawer-content :native-scrollbar="false" body-content-style="padding: 0;" :closable="false">
				<PersonPicker drawer @close="workbench.peopleDrawerOpen.value = false" />
			</n-drawer-content>
		</n-drawer>
	</div>
</template>
