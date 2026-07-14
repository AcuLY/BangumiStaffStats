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

const FONT_STACK = '"Source Han Sans SC VF", "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", sans-serif'

const snapshot = ref<WorkbenchSnapshot | null>(null)
const positionData = ref<PositionData | null>(null)
const loading = ref(true)
const error = ref('')
const workbench = provideWorkbench(snapshot, positionData)

const isDark = computed(() => workbench.theme.value === 'dark')
const backgroundInert = computed(() => workbench.peopleDrawerOpen.value || workbench.inspectorDrawerOpen.value)
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
	Button: { heightMedium: '36px', borderRadiusMedium: '6px', fontSizeMedium: '13px' },
	Input: { heightMedium: '36px', borderRadius: '6px', fontSizeMedium: '13px' },
	Select: { peers: { InternalSelection: { heightMedium: '36px', borderRadius: '6px', fontSizeMedium: '13px' } } },
	Pagination: { itemSizeMedium: '34px', itemBorderRadius: '6px' },
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
		error.value = reason instanceof Error ? reason.message : '本地静态数据加载失败。'
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
				<a class="skip-link" href="#workbench-main">跳到主要内容</a>
				<div class="workbench-app" :inert="backgroundInert || undefined" :aria-hidden="backgroundInert ? 'true' : undefined">
					<WorkbenchHeader>
						<template #query>
							<QueryWorkspace v-if="!loading && !error" />
						</template>
					</WorkbenchHeader>

					<main id="workbench-main" class="workbench-body" tabindex="-1">
						<div v-if="loading" class="workbench-state surface-panel" role="status" aria-live="polite" aria-busy="true">
							<span class="state-icon state-icon--loading"><AppIcon name="brand" :size="28" /></span>
							<h1>正在整理本地人物快照…</h1>
							<p>人物、作品与职位数据会从本项目的静态 JSON 读取。</p>
							<div class="skeleton-lines" aria-hidden="true"><i /><i /><i /></div>
						</div>

						<div v-else-if="error" class="workbench-state surface-panel" role="alert">
							<span class="state-icon"><AppIcon name="image" :size="28" /></span>
							<h1>本地数据没有加载成功</h1>
							<p>{{ error }}</p>
							<n-button type="primary" @click="load">重新加载</n-button>
						</div>

						<template v-else>
							<RankingWorkbench v-if="workbench.mode.value === 'ranking'" />
							<CoStarWorkbench v-else />
						</template>
					</main>
				</div>
			</n-dialog-provider>
		</n-message-provider>
	</n-config-provider>
</template>
