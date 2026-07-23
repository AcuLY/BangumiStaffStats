<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CharacterCredit } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import { sortByCharacterRolePriority } from '../domain/characterCredits'
import { packAdaptiveOverflowRows, type AdaptiveOverflowRow } from './adaptiveOverflowGrid'
import CharacterRoleTag from './CharacterRoleTag.vue'

const props = defineProps<{
	credit: CharacterCredit
	characterName: string
}>()

const MAX_VISIBLE_ROWS = 2
const workbench = useWorkbench()
const root = ref<HTMLElement | null>(null)
const rows = ref<AdaptiveOverflowRow[]>([])
const tooltipVisible = ref(false)
let resizeObserver: ResizeObserver | null = null
let measureFrame = 0

const appearances = computed(() => sortByCharacterRolePriority(
	props.credit.appearances,
	appearance => appearance.roleLabel,
))

const fallbackRows = (): AdaptiveOverflowRow[] => {
	const entryCount = appearances.value.length
	if (!entryCount) return []
	if (entryCount <= MAX_VISIBLE_ROWS) {
		return appearances.value.map((_, index) => ({ entries: [index] }))
	}
	return [
		{ entries: [0] },
		{ entries: [1], hiddenCount: entryCount - MAX_VISIBLE_ROWS },
	]
}

const measure = () => {
	const element = root.value
	if (!element) return
	const measuredCopies = Array.from(element.querySelectorAll<HTMLElement>('[data-appearance-measure]'))
	const overflowMeasure = element.querySelector<HTMLElement>('[data-appearance-more-measure]')
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

watch(appearances, async () => {
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
				class="character-role-card__appearances"
				:aria-label="`${characterName}出演 ${credit.subjectCount} 部作品`"
				:tabindex="hiddenCount ? 0 : undefined"
				@mouseenter="tooltipVisible = hiddenCount > 0"
				@mouseleave="tooltipVisible = false"
				@focusin="tooltipVisible = hiddenCount > 0"
				@focusout="tooltipVisible = false"
			>
				<li
					v-for="(row, rowIndex) in rows"
					:key="`appearance-row-${rowIndex}-${row.hiddenCount ?? row.entries.join('-')}`"
					class="character-role-card__appearance-row"
					:class="{ 'character-role-card__appearance-row--pair': row.entries.length + (row.hiddenCount ? 1 : 0) === 2 }"
				>
					<span
						v-for="appearanceIndex in row.entries"
						:key="appearances[appearanceIndex].subject.id"
						class="character-role-card__appearance"
					>
						<CharacterRoleTag :label="appearances[appearanceIndex].roleLabel" />
						<a
							:href="`https://bgm.tv/subject/${appearances[appearanceIndex].subject.id}`"
							target="_blank"
							rel="noopener noreferrer"
							:title="workbench.subjectName(appearances[appearanceIndex].subject)"
						>{{ workbench.subjectName(appearances[appearanceIndex].subject) }}</a>
					</span>
					<span
						v-if="row.hiddenCount"
						class="character-role-card__source-more"
						:aria-label="`另有 ${row.hiddenCount} 部出演作品`"
					>… +{{ row.hiddenCount }}</span>
				</li>
				<li class="character-role-card__appearance-measure" aria-hidden="true">
					<span
						v-for="(appearance, index) in appearances"
						:key="`appearance-measure-${appearance.subject.id}-${index}`"
						class="character-role-card__appearance character-role-card__appearance--measure"
						data-appearance-measure
					>
						<CharacterRoleTag :label="appearance.roleLabel" />
						<span>{{ workbench.subjectName(appearance.subject) }}</span>
					</span>
					<span class="character-role-card__source-more" data-appearance-more-measure>… +{{ credit.appearances.length }}</span>
				</li>
			</ul>
		</template>
		<div class="character-role-source-tooltip" role="list" :aria-label="`全部出演作品，共 ${credit.subjectCount} 部`">
			<span v-for="appearance in appearances" :key="`full-${appearance.subject.id}`" role="listitem">
				<CharacterRoleTag :label="appearance.roleLabel" />{{ workbench.subjectName(appearance.subject) }}
			</span>
		</div>
	</n-tooltip>
</template>
