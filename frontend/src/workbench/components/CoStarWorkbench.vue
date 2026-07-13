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
			<button
				class="rail-toggle"
				type="button"
				:aria-expanded="!railCollapsed"
				:aria-label="railCollapsed ? '展开人物选择面板' : '收起人物选择面板'"
				@click="railCollapsed = !railCollapsed"
			>
				<AppIcon name="chevron" :size="17" />
			</button>
			<div v-if="railCollapsed" class="collapsed-rail">
				<strong>{{ workbench.selectedPeople.value.length }}</strong>
				<span>选择人物</span>
			</div>
			<PersonPicker v-else />
		</aside>

		<section id="analysis-main" class="analysis-main" aria-label="共同参与分析结果">
			<AnalysisDashboard />
			<footer class="workbench-footer">
				<strong>Bangumi Staff Statistics · 人物工作台</strong>
				<span>数据来自本地静态快照；合作默契为原型计算。</span>
			</footer>
		</section>

		<n-drawer v-if="isMobile" v-model:show="workbench.peopleDrawerOpen.value" placement="left" width="min(390px, calc(100vw - 24px))">
			<n-drawer-content :native-scrollbar="false" body-content-style="padding: 0;" :closable="false">
				<PersonPicker drawer @close="workbench.peopleDrawerOpen.value = false" />
			</n-drawer-content>
		</n-drawer>
	</div>
</template>
