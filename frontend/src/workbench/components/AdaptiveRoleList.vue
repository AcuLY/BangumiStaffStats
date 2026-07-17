<script setup lang="ts">
import { computed, ref } from 'vue'
import WorkbenchTooltip from './WorkbenchTooltip.vue'

const props = defineProps<{
	entries: Array<{
		name: string
		label?: string
	}>
}>()

const MAX_VISIBLE_ROLES = 2
const visibleEntries = computed(() => props.entries.slice(0, MAX_VISIBLE_ROLES))
const hiddenCount = computed(() => Math.max(0, props.entries.length - MAX_VISIBLE_ROLES))
const entryText = (entry: { name: string; label?: string }) => [entry.name, entry.label].filter(Boolean).join(' ')
const fullRoleLabel = computed(() => props.entries.map(entryText).join('；'))
const tooltipVisible = ref(false)
</script>

<template>
	<WorkbenchTooltip :show="tooltipVisible" :disabled="!hiddenCount" trigger="manual" placement="top-start">
		<template #trigger>
			<ul
				class="adaptive-role-list"
				:aria-label="`完整参与身份：${fullRoleLabel}`"
				:tabindex="hiddenCount ? 0 : undefined"
				@mouseenter="tooltipVisible = hiddenCount > 0"
				@mouseleave="tooltipVisible = false"
				@focusin="tooltipVisible = hiddenCount > 0"
				@focusout="tooltipVisible = false"
			>
				<li v-for="(entry, index) in visibleEntries" :key="`${entry.name}-${entry.label ?? ''}-${index}`" class="adaptive-role-list__item">
					<span class="adaptive-role-list__copy">
						<strong :title="entry.name">{{ entry.name }}</strong>
						<small v-if="entry.label">{{ entry.label }}</small>
					</span>
				</li>
				<li v-if="hiddenCount" class="adaptive-role-list__more-row">
					<span class="adaptive-role-list__more">… +{{ hiddenCount }}</span>
				</li>
			</ul>
		</template>
		<div class="adaptive-role-tooltip" role="list" :aria-label="`全部参与身份，共 ${entries.length} 个`">
			<span v-for="(entry, index) in entries" :key="`full-${entry.name}-${entry.label ?? ''}-${index}`" role="listitem">
				<strong>{{ entry.name }}</strong><small v-if="entry.label">{{ entry.label }}</small>
			</span>
		</div>
	</WorkbenchTooltip>
</template>

<style scoped>
.adaptive-role-list {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 2px;
	width: 100%;
	margin: 0;
	padding: 0;
	list-style: none;
}

.adaptive-role-list__item {
	min-width: 0;
}

.adaptive-role-list__more-row {
	min-width: 0;
	line-height: 18px;
}

.adaptive-role-list__copy {
	display: flex;
	align-items: baseline;
	gap: var(--space-1);
	width: 100%;
	min-width: 0;
	line-height: 20px;
	white-space: nowrap;
}

.adaptive-role-list__copy strong {
	flex: 0 1 auto;
	min-width: 0;
	overflow: hidden;
	color: var(--text-1);
	font-size: var(--text-control);
	font-weight: 700;
	line-height: 20px;
	text-overflow: ellipsis;
}

.adaptive-role-list__copy small {
	flex: 0 0 auto;
	color: var(--text-3);
	font-size: var(--text-caption);
	font-weight: 400;
	line-height: 16px;
}

.adaptive-role-list__more {
	flex: 0 0 auto;
	color: var(--text-2);
	font-size: var(--text-caption);
	font-weight: 700;
}

.adaptive-role-tooltip {
	display: grid;
	gap: var(--space-1);
}

.adaptive-role-tooltip > span {
	display: flex;
	align-items: baseline;
	gap: var(--space-2);
}

.adaptive-role-tooltip small {
	color: var(--text-3);
}
</style>
