<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { darkTheme, zhCN, type GlobalThemeOverrides } from 'naive-ui'
import { loadWorkbenchFixtures } from './data/loadFixtures'
import { provideWorkbench } from './composables/useWorkbench'
import type { PositionData, WorkbenchSnapshot } from './types'
import WorkbenchHeader from './components/WorkbenchHeader.vue'
import QueryWorkspace from './components/QueryWorkspace.vue'
import RankingWorkbench from './components/RankingWorkbench.vue'
import CoStarWorkbench from './components/CoStarWorkbench.vue'
import AppIcon from './components/AppIcon.vue'
import WorkbenchFooter from './components/WorkbenchFooter.vue'

const FONT_STACK = '"Source Han Sans SC VF", "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", sans-serif'

const snapshot = ref<WorkbenchSnapshot | null>(null)
const positionData = ref<PositionData | null>(null)
const loading = ref(true)
const error = ref('')
const workbench = provideWorkbench(snapshot, positionData)

const isDark = computed(() => workbench.theme.value === 'dark')
const backgroundInert = computed(() => workbench.peopleDrawerOpen.value || workbench.inspectorDrawerOpen.value)
const mobilePickerSelectionLabel = computed(() => {
	if (!workbench.selectedPeople.value.length) return '尚未选择人物'
	return `已选 ${workbench.selectedPeople.value.length} 人、${workbench.selectedScopes.value.length} 个身份：${workbench.selectedPeople.value.map((item) => {
		const positions = item.positionIds.map(workbench.positionLabel).join('、') || '未选择职位'
		return `人物：${workbench.personName(item.person)}，职位：${positions}`
	}).join('；')}`
})
const archivePalette = { base: '#c60475', hover: '#d42281', pressed: '#b40069' }
const themeOverrides = computed<GlobalThemeOverrides>(() => ({
	common: {
		fontFamily: FONT_STACK,
		fontFamilyMono: FONT_STACK,
		primaryColor: archivePalette.base,
		primaryColorHover: archivePalette.hover,
		primaryColorPressed: archivePalette.pressed,
		borderRadius: '6px',
		borderRadiusSmall: '6px',
	},
	Button: {
		borderRadiusMedium: '6px',
		textColorPrimary: '#fff',
		textColorHoverPrimary: '#fff',
		textColorPressedPrimary: '#fff',
		textColorFocusPrimary: '#fff',
		textColorDisabledPrimary: '#fff',
	},
	Radio: {
		buttonColorActive: archivePalette.base,
		buttonBorderColorActive: archivePalette.base,
		buttonTextColorActive: '#fff',
	},
	Input: { borderRadius: '6px' },
	Select: { peers: { InternalSelection: { borderRadius: '6px' } } },
	Pagination: { itemBorderRadius: '6px' },
	Drawer: { color: 'transparent' },
	Tabs: {
		tabColorSegment: archivePalette.base,
		tabFontSizeSmall: '13px',
		tabTextColorActiveSegment: '#fff',
	},
}))

const load = async () => {
	loading.value = true
	error.value = ''
	try {
		const fixtures = await loadWorkbenchFixtures()
		snapshot.value = fixtures.snapshot
		positionData.value = fixtures.positionData
		workbench.focusedPersonId.value = workbench.rankingPeople.value[0]?.id ?? 0
	} catch (reason) {
		console.error('Failed to load workbench data', reason)
		error.value = '请稍后重试。'
	} finally {
		loading.value = false
	}
}

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
		?.setAttribute('content', theme === 'dark' ? '#101014' : '#ffffff')
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

onMounted(() => {
	window.addEventListener('beforeunload', warnOnUnsavedQuery)
	load()
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnOnUnsavedQuery))
</script>

<template>
	<n-config-provider :theme="isDark ? darkTheme : null" :theme-overrides="themeOverrides" :locale="zhCN">
		<n-message-provider>
			<n-dialog-provider>
				<div class="workbench-app" :inert="backgroundInert || undefined" :aria-hidden="backgroundInert ? 'true' : undefined">
					<WorkbenchHeader>
						<template #query>
							<QueryWorkspace v-if="!loading && !error" />
						</template>
						<template #mobile-context>
							<button
								v-if="!loading && !error && !workbench.queryEditing.value && workbench.mode.value === 'co-star'"
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
								<p>正在准备人物、作品与职位信息。</p>
								<div class="skeleton-lines" aria-hidden="true"><i /><i /><i /></div>
							</div>

							<div v-else-if="error" class="workbench-state surface-panel" role="alert">
								<span class="state-icon"><AppIcon name="image" :size="28" /></span>
								<h1>无法加载人物数据</h1>
								<p>{{ error }}</p>
								<n-button size="large" type="primary" @click="load">重新加载</n-button>
							</div>

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
