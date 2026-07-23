<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { sortByCharacterRolePriority } from '../domain/characterCredits'
import {
	packAdaptiveOverflowRows,
	packCompactOverflowRows,
	type AdaptiveOverflowRow,
} from './adaptiveOverflowGrid'
import CharacterRoleTag from './CharacterRoleTag.vue'

const props = withDefaults(defineProps<{
	entries: Array<{
		name: string
		label?: string
		tagOnly?: boolean
		count?: number
	}>
	mode?: 'ranking' | 'co-star'
	maxVisibleItems?: number
	entryNoun?: string
}>(), {
	mode: 'ranking',
	maxVisibleItems: 0,
	entryNoun: '参与身份',
})

const MAX_VISIBLE_ROWS = 2
const root = ref<HTMLElement | null>(null)
const rows = ref<AdaptiveOverflowRow[]>([])
let resizeObserver: ResizeObserver | null = null
let measureFrame = 0

const displayEntries = computed(() => sortByCharacterRolePriority(props.entries, entry => entry.label ?? entry.name))
const compactTagMode = computed(() => props.mode === 'co-star'
	&& displayEntries.value.length > 0
	&& displayEntries.value.every(entry => entry.tagOnly))
const visibleItemLimit = computed(() => props.maxVisibleItems > 0
	? Math.max(1, Math.floor(props.maxVisibleItems))
	: Number.POSITIVE_INFINITY)
const exceedsVisibleItemLimit = computed(() => displayEntries.value.length > visibleItemLimit.value)

const fallbackRows = (): AdaptiveOverflowRow[] => {
	const entryCount = displayEntries.value.length
	if (!entryCount) return []
	if (exceedsVisibleItemLimit.value) {
		const visibleCount = Math.min(entryCount, visibleItemLimit.value)
		const limitedRows = Array.from({ length: visibleCount }, (_, index): AdaptiveOverflowRow => ({ entries: [index] }))
		limitedRows[limitedRows.length - 1].hiddenCount = entryCount - visibleCount
		return limitedRows
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
	if (exceedsVisibleItemLimit.value) {
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
	const packRows = compactTagMode.value ? packCompactOverflowRows : packAdaptiveOverflowRows
	rows.value = packRows({
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

watch(() => [props.mode, props.maxVisibleItems, props.entries], async () => {
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
const entryText = (entry: { name: string; label?: string; tagOnly?: boolean; count?: number }) => {
	const identity = entry.tagOnly ? entry.name : [entry.name, entry.label].filter(Boolean).join(' ')
	return entry.count ? `${identity}，参与 ${entry.count} 部` : identity
}
const fullRoleLabel = computed(() => displayEntries.value.map(entryText).join('；'))
const tooltipVisible = ref(false)
</script>

<template>
	<n-tooltip
		:show="tooltipVisible"
		:disabled="!hiddenCount"
		trigger="manual"
		placement="top-start"
		:animated="false"
		style="max-width: min(336px, calc(100dvw - 72px));"
		content-class="workbench-tooltip-content"
	>
		<template #trigger>
			<ul
				ref="root"
				class="adaptive-role-list"
				:class="[
					`adaptive-role-list--${mode}`,
					{ 'adaptive-role-list--compact-tags': compactTagMode },
				]"
				:aria-label="`完整${entryNoun}：${fullRoleLabel}`"
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
					:class="{
						'adaptive-role-list__row--pair': !compactTagMode
							&& row.entries.length + (row.hiddenCount ? 1 : 0) === 2,
					}"
				>
					<span v-for="entryIndex in row.entries" :key="entryIndex" class="adaptive-role-list__item">
						<span class="adaptive-role-list__copy">
							<CharacterRoleTag v-if="displayEntries[entryIndex].tagOnly" :label="displayEntries[entryIndex].name" :count="displayEntries[entryIndex].count" />
							<template v-else>
								<span class="adaptive-role-list__name" :title="displayEntries[entryIndex].name">{{ displayEntries[entryIndex].name }}</span>
								<CharacterRoleTag v-if="displayEntries[entryIndex].label" :label="displayEntries[entryIndex].label" :count="displayEntries[entryIndex].count" />
							</template>
						</span>
					</span>
					<span v-if="row.hiddenCount" class="adaptive-role-list__more" :aria-label="`另有 ${row.hiddenCount} 个${entryNoun}`">… +{{ row.hiddenCount }}</span>
				</li>
				<li class="adaptive-role-list__measure" aria-hidden="true">
					<span v-for="(entry, index) in displayEntries" :key="`measure-${index}`" class="adaptive-role-list__copy" data-role-measure>
						<CharacterRoleTag v-if="entry.tagOnly" :label="entry.name" :count="entry.count" />
						<template v-else>
							<span class="adaptive-role-list__name">{{ entry.name }}</span>
							<CharacterRoleTag v-if="entry.label" :label="entry.label" :count="entry.count" />
						</template>
					</span>
					<span class="adaptive-role-list__more" data-role-more-measure>… +{{ entries.length }}</span>
				</li>
			</ul>
		</template>
		<div class="adaptive-role-tooltip" role="list" :aria-label="`全部${entryNoun}，共 ${entries.length} 个`">
			<span v-for="(entry, index) in displayEntries" :key="`full-${entry.name}-${entry.label ?? ''}-${index}`" role="listitem">
				<CharacterRoleTag v-if="entry.tagOnly" :label="entry.name" :count="entry.count" />
				<template v-else><span class="adaptive-role-tooltip__name">{{ entry.name }}</span><CharacterRoleTag v-if="entry.label" :label="entry.label" :count="entry.count" /></template>
			</span>
		</div>
	</n-tooltip>
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

.adaptive-role-list[tabindex="0"] {
	align-content: center;
	min-height: var(--touch-target-min);
}

.adaptive-role-list__row {
	min-width: 0;
}

.adaptive-role-list__row--pair {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
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

.adaptive-role-list--compact-tags .adaptive-role-list__row {
	display: flex;
	align-items: center;
	justify-content: flex-start;
	gap: var(--space-1);
}

.adaptive-role-list--compact-tags .adaptive-role-list__item {
	flex: 0 1 auto;
	max-width: 100%;
	min-width: 0;
}

.adaptive-role-list--compact-tags .adaptive-role-list__copy {
	width: max-content;
	max-width: 100%;
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
