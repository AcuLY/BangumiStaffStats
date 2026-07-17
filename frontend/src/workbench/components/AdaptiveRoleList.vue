<script setup lang="ts">
import { computed, ref } from 'vue'

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
	<n-tooltip :show="tooltipVisible" trigger="manual" placement="top-start">
		<template #trigger>
			<ul
				class="adaptive-role-list"
				:aria-label="`完整参与身份：${fullRoleLabel}`"
				tabindex="0"
				@mouseenter="tooltipVisible = true"
				@mouseleave="tooltipVisible = false"
				@focusin="tooltipVisible = true"
				@focusout="tooltipVisible = false"
			>
				<li v-for="(entry, index) in visibleEntries" :key="`${entry.name}-${entry.label ?? ''}-${index}`" class="adaptive-role-list__item">
					<span class="adaptive-role-list__copy">
						<strong :title="entry.name">{{ entry.name }}</strong>
						<small v-if="entry.label">{{ entry.label }}</small>
						<span v-if="index === MAX_VISIBLE_ROLES - 1 && hiddenCount" class="adaptive-role-list__more">… +{{ hiddenCount }}</span>
					</span>
				</li>
			</ul>
		</template>
		<div class="adaptive-role-tooltip" role="list" :aria-label="`全部参与身份，共 ${entries.length} 个`">
			<span v-for="(entry, index) in entries" :key="`full-${entry.name}-${entry.label ?? ''}-${index}`" role="listitem">
				<strong>{{ entry.name }}</strong><small v-if="entry.label">{{ entry.label }}</small>
			</span>
		</div>
	</n-tooltip>
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

.adaptive-role-list__copy {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto auto;
	align-items: center;
	gap: var(--space-2);
	width: 100%;
	min-width: 0;
	line-height: 20px;
	white-space: nowrap;
}

.adaptive-role-list__copy strong {
	min-width: 0;
	overflow: hidden;
	color: var(--text-1);
	font-size: var(--text-control);
	font-weight: 700;
	text-overflow: ellipsis;
}

.adaptive-role-list__copy small {
	flex: 0 0 auto;
	color: var(--text-3);
	font-size: var(--text-caption);
	font-weight: 400;
}

.adaptive-role-list__more {
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
