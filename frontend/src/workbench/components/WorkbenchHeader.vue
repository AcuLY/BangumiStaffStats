<script setup lang="ts">
import type { WorkbenchMode } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import AppIcon from './AppIcon.vue'
import QueryWorkspace from './QueryWorkspace.vue'

const workbench = useWorkbench()

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
</script>

<template>
	<header class="workbench-header">
		<div class="workbench-header__bar">
			<a class="workbench-brand" href="/person-workbench.html" aria-label="Bangumi Staff Statistics 人物工作台首页">
				<span class="workbench-brand__mark"><AppIcon name="brand" :size="25" /></span>
				<span class="workbench-brand__copy">
					<strong>Bangumi Staff Statistics</strong>
					<small>人物工作台 · 静态原型</small>
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
						:aria-controls="`mode-panel-${item.value}`"
					:tabindex="workbench.mode.value === item.value ? 0 : -1"
					@click="activateMode(item.value)"
					@keydown="onModeKeydown($event, index)"
				>
					<AppIcon :name="item.icon" :size="17" />
					{{ item.label }}
				</button>
			</nav>

			<button
				class="theme-toggle"
				type="button"
				:aria-pressed="workbench.theme.value === 'dark'"
				:aria-label="workbench.theme.value === 'dark' ? '切换到社区档案台浅色模式' : '切换到社区档案台深色模式'"
				:title="workbench.theme.value === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
				@click="workbench.toggleTheme"
			>
				<AppIcon :name="workbench.theme.value === 'dark' ? 'sun' : 'moon'" :size="17" />
				<span class="theme-toggle__copy">
					<small>社区档案台</small>
					<strong>{{ workbench.theme.value === 'dark' ? '深色模式' : '浅色模式' }}</strong>
				</span>
			</button>

			<button
				v-if="workbench.mode.value === 'co-star'"
				class="mobile-people-trigger"
				type="button"
				:aria-label="`打开人物选择，已选 ${workbench.selectedPeople.value.length} 人`"
				@click="workbench.peopleDrawerOpen.value = true"
			>
				<AppIcon name="people" />
				<span>{{ workbench.selectedPeople.value.length }}</span>
			</button>
		</div>

		<QueryWorkspace />
	</header>
</template>
