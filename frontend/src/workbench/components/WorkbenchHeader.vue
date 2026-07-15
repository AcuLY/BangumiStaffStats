<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { WorkbenchMode } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import AppIcon from './AppIcon.vue'

const workbench = useWorkbench()
const headerElement = ref<HTMLElement | null>(null)
let headerResizeObserver: ResizeObserver | null = null

const syncHeaderHeight = () => {
	if (workbench.queryEditing.value) return
	if (!headerElement.value?.querySelector('.query-summary')) return
	const height = Math.ceil(headerElement.value?.getBoundingClientRect().height ?? 0)
	if (height <= 0) return
	const breakpoint = window.matchMedia('(max-width: 780px)').matches ? 'mobile' : 'desktop'
	document.documentElement.style.setProperty(`--workbench-header-${breakpoint}-height`, `${height}px`)
}

const modes: Array<{ value: WorkbenchMode; label: string; icon: 'ranking' | 'people' }> = [
	{ value: 'ranking', label: '人物排行', icon: 'ranking' },
	{ value: 'co-star', label: '共同参与分析', icon: 'people' },
]

const activateMode = (mode: WorkbenchMode, focus = false) => {
	workbench.mode.value = mode
	if (focus) requestAnimationFrame(() => {
		document.querySelector<HTMLButtonElement>(`[data-mode-tab="${mode}"]`)?.focus()
	})
}

const onModeKeydown = (event: KeyboardEvent, index: number) => {
	let next = index
	if (event.key === 'ArrowRight') next = (index + 1) % modes.length
	else if (event.key === 'ArrowLeft') next = (index - 1 + modes.length) % modes.length
	else if (event.key === 'Home') next = 0
	else if (event.key === 'End') next = modes.length - 1
	else return
	event.preventDefault()
	activateMode(modes[next].value, true)
}

onMounted(() => {
	document.documentElement.style.removeProperty('--workbench-header-height')
	headerResizeObserver = new ResizeObserver(syncHeaderHeight)
	if (headerElement.value) headerResizeObserver.observe(headerElement.value)
	window.addEventListener('resize', syncHeaderHeight)
	syncHeaderHeight()
})

watch(workbench.queryEditing, (editing) => {
	if (!editing) requestAnimationFrame(syncHeaderHeight)
})

onBeforeUnmount(() => {
	headerResizeObserver?.disconnect()
	window.removeEventListener('resize', syncHeaderHeight)
	document.documentElement.style.removeProperty('--workbench-header-desktop-height')
	document.documentElement.style.removeProperty('--workbench-header-mobile-height')
})
</script>

<template>
	<header ref="headerElement" class="workbench-header" :class="{ 'has-query-editor': workbench.queryEditing.value }">
		<div class="workbench-header__bar">
			<a class="workbench-brand" href="/person-workbench.html" aria-label="Bangumi Staff Statistics 人物工作台首页" translate="no">
				<span class="workbench-brand__mark"><AppIcon name="brand" :size="25" /></span>
				<span class="workbench-brand__copy">
					<strong>Bangumi Staff Statistics</strong>
				</span>
			</a>

			<nav class="mode-tabs" role="tablist" aria-label="工作台模式">
				<button
					v-for="(item, index) in modes"
					:key="item.value"
						:data-mode-tab="item.value"
						:id="`mode-tab-${item.value}`"
						class="mode-tab"
					:class="{ 'is-active': workbench.mode.value === item.value }"
					type="button"
					role="tab"
						:aria-selected="workbench.mode.value === item.value"
						:aria-controls="workbench.mode.value === item.value ? `mode-panel-${item.value}` : undefined"
					:tabindex="workbench.mode.value === item.value ? 0 : -1"
					@click="activateMode(item.value)"
					@keydown="onModeKeydown($event, index)"
				>
					<AppIcon :name="item.icon" :size="17" />
					{{ item.label }}
				</button>
			</nav>

			<n-button
				class="theme-toggle"
				quaternary
				circle
				attr-type="button"
				:aria-pressed="workbench.theme.value === 'dark'"
				:aria-label="workbench.theme.value === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
				:title="workbench.theme.value === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
				@click="workbench.toggleTheme"
			>
				<template #icon><AppIcon :name="workbench.theme.value === 'dark' ? 'sun' : 'moon'" :size="17" /></template>
			</n-button>

		</div>
		<div class="workbench-header__query">
			<slot name="query" />
		</div>
	</header>
</template>
