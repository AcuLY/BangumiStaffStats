<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { darkTheme, zhCN } from 'naive-ui'
import { loadWorkbenchFixtures } from './data/loadFixtures'
import { provideWorkbench } from './composables/useWorkbench'
import { useWorkbenchControlSize } from './composables/useWorkbenchControlSize'
import type { PositionData, WorkbenchSnapshot } from './types'
import WorkbenchHeader from './components/WorkbenchHeader.vue'
import QueryWorkspace from './components/QueryWorkspace.vue'
import RankingWorkbench from './components/RankingWorkbench.vue'
import CoStarWorkbench from './components/CoStarWorkbench.vue'
import AppIcon from './components/AppIcon.vue'
import WorkbenchFooter from './components/WorkbenchFooter.vue'
import RankingQuerySkeleton from './components/RankingQuerySkeleton.vue'
import CoStarQuerySkeleton from './components/CoStarQuerySkeleton.vue'
import QueryMobilePickerSkeleton from './components/QueryMobilePickerSkeleton.vue'
import { getWorkbenchThemeOverrides } from './naiveThemeOverrides'

const snapshot = ref<WorkbenchSnapshot | null>(null)
const positionData = ref<PositionData | null>(null)
const loading = ref(true)
const error = ref('')
const workbench = provideWorkbench(snapshot, positionData)
const { controlSize } = useWorkbenchControlSize()
const queryWorkspace = ref<{ openEditor: () => Promise<void> } | null>(null)

const isDark = computed(() => workbench.theme.value === 'dark')
const themeOverrides = computed(() => getWorkbenchThemeOverrides(isDark.value))
const backgroundInert = computed(() => workbench.peopleDrawerOpen.value || workbench.inspectorDrawerOpen.value)
const mobilePickerSelectionLabel = computed(() => {
	if (!workbench.selectedPeople.value.length) return '尚未选择人物'
	return `已选 ${workbench.selectedPeople.value.length} 人、${workbench.selectedScopes.value.length} 个身份：${workbench.selectedPeople.value.map((item) => {
		const positions = item.positionIds.map(workbench.positionLabel).join('、') || '未选择职位'
		return `人物：${workbench.personName(item.person)}，职位：${positions}`
	}).join('；')}`
})
const load = async () => {
	loading.value = true
	error.value = ''
	try {
		const fixtures = await loadWorkbenchFixtures()
		snapshot.value = fixtures.snapshot
		positionData.value = fixtures.positionData
		if (workbench.hasAppliedQuery.value) {
			workbench.focusedPersonId.value = workbench.rankingPeople.value[0]?.id ?? 0
		}
	} catch (reason) {
		console.error('Failed to load workbench data', reason)
		error.value = '请稍后重试'
	} finally {
		loading.value = false
	}
}

const openQueryEditor = () => queryWorkspace.value?.openEditor()

const warnOnUnsavedQuery = (event: BeforeUnloadEvent) => {
	if (!workbench.queryDraftDirty.value) return
	event.preventDefault()
	event.returnValue = ''
}

watch(workbench.theme, (theme) => {
	document.documentElement.dataset.visual = 'archive'
	document.documentElement.dataset.theme = theme
	document.documentElement.style.colorScheme = theme
	document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
		?.setAttribute('content', theme === 'dark' ? '#0e0e10' : '#f4f4f6')
	try {
		window.localStorage.setItem('bgmss-workbench-theme', theme)
	} catch {
		// Storage can be unavailable in privacy-restricted contexts; the in-memory mode still works.
	}
	const url = new URL(window.location.href)
	url.searchParams.delete('direction')
	if (theme === 'dark') url.searchParams.set('theme', 'dark')
	else url.searchParams.delete('theme')
	window.history.replaceState({}, '', url)
}, { immediate: true })

watch(workbench.mode, (mode) => {
	const url = new URL(window.location.href)
	if (mode === 'ranking') url.searchParams.set('mode', 'ranking')
	else url.searchParams.delete('mode')
	window.history.replaceState({}, '', url)
})

watch(() => workbench.query.mergeSeries, (mergeSeries) => {
	const url = new URL(window.location.href)
	if (mergeSeries) url.searchParams.set('result', 'series')
	else url.searchParams.delete('result')
	window.history.replaceState({}, '', url)
}, { immediate: true })

onMounted(() => {
	window.addEventListener('beforeunload', warnOnUnsavedQuery)
	load()
})
onBeforeUnmount(() => {
	window.removeEventListener('beforeunload', warnOnUnsavedQuery)
})
</script>

<template>
	<n-config-provider :theme="isDark ? darkTheme : null" :theme-overrides="themeOverrides" :locale="zhCN">
		<n-message-provider>
			<n-dialog-provider>
				<div
					class="workbench-app"
					:inert="backgroundInert || undefined"
					:aria-hidden="backgroundInert ? 'true' : undefined"
				>
					<WorkbenchHeader>
						<template #query>
							<QueryWorkspace v-if="!loading && !error" ref="queryWorkspace" />
						</template>
						<template #mobile-context>
							<QueryMobilePickerSkeleton
								v-if="!loading && !error && workbench.queryLoading.value && workbench.mode.value === 'co-star'"
							/>
							<button
								v-else-if="!loading && !error && workbench.hasAppliedQuery.value && !workbench.queryEditing.value && workbench.mode.value === 'co-star'"
								class="mobile-picker-entry header-edit-card"
								type="button"
								aria-haspopup="dialog"
								:aria-expanded="workbench.peopleDrawerOpen.value"
								aria-controls="mobile-person-picker"
								:aria-label="`${workbench.selectedPeople.value.length ? '调整人物选择' : '选择人物'}。${mobilePickerSelectionLabel}`"
								@click="workbench.peopleDrawerOpen.value = true"
							>
								<span class="mobile-picker-entry__copy">
									<span v-if="workbench.selectedPeople.value.length" class="mobile-picker-entry__selections mobile-header-context-summary" aria-hidden="true">
										<span
											v-for="item in workbench.selectedPeople.value"
											:key="item.person.id"
											class="mobile-picker-entry__selection"
										>
											<b class="mobile-picker-entry__person">{{ workbench.personName(item.person) }}</b>
											<span class="mobile-picker-entry__positions">{{ item.positionIds.map(workbench.positionLabel).join(' / ') || '未选择职位' }}</span>
										</span>
									</span>
									<small v-else class="mobile-picker-entry__empty">尚未选择人物</small>
								</span>
								<span class="mobile-picker-entry__action header-edit-card__action" aria-hidden="true"><AppIcon name="edit" :size="18" /></span>
							</button>
						</template>
					</WorkbenchHeader>

					<div class="workbench-page-scroll">
						<main id="workbench-main" class="workbench-body" tabindex="-1">
							<div v-if="loading" class="workbench-state surface-panel" role="status" aria-live="polite" aria-busy="true">
								<span class="state-icon state-icon--loading"><AppIcon name="brand" :size="28" /></span>
								<h1>正在加载人物数据…</h1>
								<p>正在准备人物、作品与职位信息</p>
								<div class="skeleton-lines" aria-hidden="true"><i /><i /><i /></div>
							</div>

							<div v-else-if="error" class="workbench-state surface-panel" role="alert">
								<span class="state-icon"><AppIcon name="image" :size="28" /></span>
								<h1>无法加载人物数据</h1>
								<p>{{ error }}</p>
								<n-button :size="controlSize" type="primary" @click="load">重新加载</n-button>
							</div>

							<RankingQuerySkeleton v-else-if="workbench.queryLoading.value && workbench.mode.value === 'ranking'" />
							<CoStarQuerySkeleton v-else-if="workbench.queryLoading.value && workbench.mode.value === 'co-star'" />

							<section v-else-if="!workbench.hasAppliedQuery.value" class="workbench-state surface-panel" aria-labelledby="query-empty-title">
								<span class="state-icon"><AppIcon name="search" :size="28" /></span>
								<h1 id="query-empty-title">尚未开始查询</h1>
								<n-button :size="controlSize" type="primary" @click="openQueryEditor">设置查询条件</n-button>
							</section>

							<template v-else>
								<RankingWorkbench v-if="workbench.mode.value === 'ranking'" />
								<CoStarWorkbench v-else />
							</template>
						</main>
						<WorkbenchFooter />
					</div>
				</div>
			</n-dialog-provider>
		</n-message-provider>
	</n-config-provider>
</template>
