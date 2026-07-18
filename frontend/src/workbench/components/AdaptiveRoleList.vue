<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { sortByCharacterRolePriority } from '../domain/characterCredits'
import { packAdaptiveOverflowRows, type AdaptiveOverflowRow } from './adaptiveOverflowGrid'
import CharacterRoleTag from './CharacterRoleTag.vue'
import WorkbenchTooltip from './WorkbenchTooltip.vue'

const props = withDefaults(defineProps<{
	entries: Array<{
		name: string
		label?: string
	}>
	mode?: 'ranking' | 'co-star'
}>(), {
	mode: 'ranking',
})

const MAX_VISIBLE_ROWS = 2
const root = ref<HTMLElement | null>(null)
const rows = ref<AdaptiveOverflowRow[]>([])
let resizeObserver: ResizeObserver | null = null
let measureFrame = 0

const displayEntries = computed(() => sortByCharacterRolePriority(props.entries, entry => entry.label))

const fallbackRows = (): AdaptiveOverflowRow[] => {
	const entryCount = displayEntries.value.length
	if (!entryCount) return []
	if (props.mode === 'co-star') {
		return [
			{ entries: [0] },
			...(entryCount > 1 ? [{ entries: [], hiddenCount: entryCount - 1 }] : []),
		]
	}
	if (entryCount <= MAX_VISIBLE_ROWS) {
		return displayEntries.value.map((_, index) => ({ entries: [index] }))
	}

	return [
		{ entries: [0] },
		{ entries: [1], hiddenCount: entryCount - MAX_VISIBLE_ROWS },
	]
}

const measure = () => {
	const element = root.value
	if (!element) return
	if (props.mode === 'co-star') {
		rows.value = fallbackRows()
		return
	}
	const measuredCopies = Array.from(element.querySelectorAll<HTMLElement>('[data-role-measure]'))
	const overflowMeasure = element.querySelector<HTMLElement>('[data-role-more-measure]')
	if (!measuredCopies.length || !overflowMeasure || element.clientWidth <= 0) {
		rows.value = fallbackRows()
		return
	}

	const widths = measuredCopies.map(copy => Math.ceil(copy.getBoundingClientRect().width))
	const columnGap = Number.parseFloat(getComputedStyle(element).getPropertyValue('--space-1')) || 4
	rows.value = packAdaptiveOverflowRows({
		widths,
		availableWidth: element.clientWidth,
		columnGap,
		overflowWidth: Math.ceil(overflowMeasure.getBoundingClientRect().width),
		maxRows: MAX_VISIBLE_ROWS,
	})
}

const scheduleMeasure = () => {
	cancelAnimationFrame(measureFrame)
	measureFrame = requestAnimationFrame(measure)
}

watch(() => [props.mode, props.entries], async () => {
	rows.value = fallbackRows()
	await nextTick()
	scheduleMeasure()
}, { deep: true, immediate: true })

onMounted(() => {
	resizeObserver = new ResizeObserver(scheduleMeasure)
	if (root.value) resizeObserver.observe(root.value)
	document.fonts?.ready.then(scheduleMeasure)
	scheduleMeasure()
})

onBeforeUnmount(() => {
	resizeObserver?.disconnect()
	cancelAnimationFrame(measureFrame)
})

const hiddenCount = computed(() => rows.value.find(row => row.hiddenCount)?.hiddenCount ?? 0)
const entryText = (entry: { name: string; label?: string }) => [entry.name, entry.label].filter(Boolean).join(' ')
const fullRoleLabel = computed(() => displayEntries.value.map(entryText).join('；'))
const tooltipVisible = ref(false)
</script>

<template>
	<WorkbenchTooltip :show="tooltipVisible" :disabled="!hiddenCount" trigger="manual" placement="top-start">
		<template #trigger>
			<ul
				ref="root"
				class="adaptive-role-list"
				:class="`adaptive-role-list--${mode}`"
				:aria-label="`完整参与身份：${fullRoleLabel}`"
				:tabindex="hiddenCount ? 0 : undefined"
				@mouseenter="tooltipVisible = hiddenCount > 0"
				@mouseleave="tooltipVisible = false"
				@focusin="tooltipVisible = hiddenCount > 0"
				@focusout="tooltipVisible = false"
			>
				<li
					v-for="(row, rowIndex) in rows"
					:key="`row-${rowIndex}-${row.hiddenCount ?? row.entries?.join('-')}`"
					class="adaptive-role-list__row"
					:class="{ 'adaptive-role-list__row--pair': row.entries.length + (row.hiddenCount ? 1 : 0) === 2 }"
				>
					<span v-for="entryIndex in row.entries" :key="entryIndex" class="adaptive-role-list__item">
						<span class="adaptive-role-list__copy">
							<span class="adaptive-role-list__name" :title="displayEntries[entryIndex].name">{{ displayEntries[entryIndex].name }}</span>
							<CharacterRoleTag v-if="displayEntries[entryIndex].label" :label="displayEntries[entryIndex].label" />
						</span>
					</span>
					<span v-if="row.hiddenCount" class="adaptive-role-list__more" :aria-label="`另有 ${row.hiddenCount} 个参与身份`">… +{{ row.hiddenCount }}</span>
				</li>
				<li class="adaptive-role-list__measure" aria-hidden="true">
					<span v-for="(entry, index) in displayEntries" :key="`measure-${index}`" class="adaptive-role-list__copy" data-role-measure>
						<span class="adaptive-role-list__name">{{ entry.name }}</span>
						<CharacterRoleTag v-if="entry.label" :label="entry.label" />
					</span>
					<span class="adaptive-role-list__more" data-role-more-measure>… +{{ entries.length }}</span>
				</li>
			</ul>
		</template>
		<div class="adaptive-role-tooltip" role="list" :aria-label="`全部参与身份，共 ${entries.length} 个`">
			<span v-for="(entry, index) in displayEntries" :key="`full-${entry.name}-${entry.label ?? ''}-${index}`" role="listitem">
				<span class="adaptive-role-tooltip__name">{{ entry.name }}</span><CharacterRoleTag v-if="entry.label" :label="entry.label" />
			</span>
		</div>
	</WorkbenchTooltip>
</template>

<style scoped>
.adaptive-role-list {
	position: relative;
	display: grid;
	gap: var(--space-1);
	width: 100%;
	margin: 0;
	padding: 0;
	list-style: none;
}

.adaptive-role-list__row {
	min-width: 0;
}

.adaptive-role-list__row--pair {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
}

.adaptive-role-list--co-star .adaptive-role-list__row--pair {
	display: block;
}

.adaptive-role-list__row--pair .adaptive-role-list__item:first-child {
	padding-right: var(--space-1);
}

.adaptive-role-list__item {
	min-width: 0;
}

.adaptive-role-list__measure {
	position: absolute;
	inset: 0 auto auto 0;
	display: grid;
	width: 0;
	height: 0;
	overflow: hidden;
	visibility: hidden;
	pointer-events: none;
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

.adaptive-role-list__measure .adaptive-role-list__copy,
.adaptive-role-list__measure .adaptive-role-list__more {
	width: max-content;
}

.adaptive-role-list__name {
	flex: 0 1 auto;
	min-width: 0;
	overflow: hidden;
	color: var(--text-1);
	font-size: var(--text-control);
	font-weight: 400;
	line-height: 20px;
	text-overflow: ellipsis;
}

.adaptive-role-list__more {
	flex: 0 0 auto;
	color: var(--text-2);
	font-size: var(--text-caption);
	font-weight: 600;
	line-height: 20px;
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

.adaptive-role-tooltip__name {
	font-weight: 400;
}
</style>
