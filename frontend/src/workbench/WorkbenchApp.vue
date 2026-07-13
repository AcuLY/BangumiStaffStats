<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { darkTheme, zhCN, type GlobalThemeOverrides } from 'naive-ui'
import { loadWorkbenchFixtures } from './data/loadFixtures'
import { provideWorkbench } from './composables/useWorkbench'
import type { PositionData, WorkbenchSnapshot } from './types'
import WorkbenchHeader from './components/WorkbenchHeader.vue'
import RankingWorkbench from './components/RankingWorkbench.vue'
import CoStarWorkbench from './components/CoStarWorkbench.vue'
import AppIcon from './components/AppIcon.vue'

const FONT_STACK = '"Source Han Sans SC VF", "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", sans-serif'

const snapshot = ref<WorkbenchSnapshot | null>(null)
const positionData = ref<PositionData | null>(null)
const loading = ref(true)
const error = ref('')
const workbench = provideWorkbench(snapshot, positionData)

const isDark = computed(() => workbench.direction.value === 'screening')
const backgroundInert = computed(() => workbench.peopleDrawerOpen.value || workbench.inspectorDrawerOpen.value)
const directionPalette = computed(() => ({
	archive: { base: '#c60475', hover: '#d42281', pressed: '#b40069' },
	split: { base: '#a80868', hover: '#bd2677', pressed: '#841154' },
	screening: { base: '#d91a80', hover: '#e63893', pressed: '#bd0b6d' },
})[workbench.direction.value])
const themeOverrides = computed<GlobalThemeOverrides>(() => ({
	common: {
		fontFamily: FONT_STACK,
		fontFamilyMono: FONT_STACK,
		primaryColor: directionPalette.value.base,
		primaryColorHover: directionPalette.value.hover,
		primaryColorPressed: directionPalette.value.pressed,
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

watch(workbench.direction, (direction) => {
	document.documentElement.dataset.visual = direction
	document.documentElement.dataset.theme = direction === 'screening' ? 'dark' : 'light'
	document.documentElement.style.colorScheme = direction === 'screening' ? 'dark' : 'light'
	const url = new URL(window.location.href)
	url.searchParams.set('direction', direction)
	window.history.replaceState({}, '', url)
}, { immediate: true })

onMounted(load)
</script>

<template>
	<n-config-provider :theme="isDark ? darkTheme : null" :theme-overrides="themeOverrides" :locale="zhCN">
		<n-message-provider>
			<n-dialog-provider>
				<a class="skip-link" href="#workbench-main">跳到主要内容</a>
				<div class="workbench-app" :inert="backgroundInert || undefined" :aria-hidden="backgroundInert ? 'true' : undefined">
					<WorkbenchHeader />

					<main id="workbench-main" class="workbench-body" tabindex="-1">
						<div v-if="loading" class="workbench-state surface-panel" aria-busy="true">
							<span class="state-icon state-icon--loading"><AppIcon name="brand" :size="28" /></span>
							<h1>正在整理本地人物快照</h1>
							<p>人物、作品与职位数据会从本项目的静态 JSON 读取。</p>
							<div class="skeleton-lines" aria-hidden="true"><i /><i /><i /></div>
						</div>

						<div v-else-if="error" class="workbench-state surface-panel" role="alert">
							<span class="state-icon"><AppIcon name="image" :size="28" /></span>
							<h1>本地数据没有加载成功</h1>
							<p>{{ error }}</p>
							<n-button type="primary" @click="load">重新加载</n-button>
						</div>

						<RankingWorkbench v-else-if="workbench.mode.value === 'ranking'" />
						<CoStarWorkbench v-else />
					</main>
				</div>
			</n-dialog-provider>
		</n-message-provider>
	</n-config-provider>
</template>
