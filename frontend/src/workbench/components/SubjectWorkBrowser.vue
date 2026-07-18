<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Subject } from '../types'
import type { SubjectWorkSortOption, SubjectWorkSortOrder } from '../composables/useSubjectWorkBrowser'
import WorkListToolbar from './WorkListToolbar.vue'
import SubjectWorkList from './SubjectWorkList.vue'
import AdaptivePagination from './AdaptivePagination.vue'
import { useWorkbenchControlSize, type WorkbenchControlSize } from '../composables/useWorkbenchControlSize'

const props = withDefaults(defineProps<{
	title: string
	titleId: string
	subjects: Subject[]
	emptyText: string
	search: string
	sort: string
	order: SubjectWorkSortOrder
	sortOptions: SubjectWorkSortOption[]
	searchPlaceholder: string
	searchAriaLabel: string
	sortAriaLabel: string
	orderAriaLabel: string
	searchName?: string
	headingMeta?: string
	page: number
	pageSize: number
	itemCount: number
	pageSizes: Array<number | { label: string; value: number }>
	paginationSummary: string
	paginationAriaLabel: string
	showPagination?: boolean
	compactAriaLabel?: string
	compactDescription?: string
}>(), {
	searchName: 'workSearch',
	headingMeta: '',
	showPagination: true,
	compactAriaLabel: '作品缩略模式',
	compactDescription: '仅显示序号、双语名和我的分数',
})

const emit = defineEmits<{
	'update:search': [value: string]
	'update:sort': [value: string]
	'update:order': [value: SubjectWorkSortOrder]
	'update:page': [value: number]
	'update:page-size': [value: number]
}>()

defineSlots<{
	heading(props: { title: string; titleId: string; headingMeta: string; controlSize: WorkbenchControlSize }): unknown
	list(props: { compact: boolean; startIndex: number; ariaLabel: string }): unknown
	role(props: { subject: Subject }): unknown
	participants(props: { subject: Subject }): unknown
}>()

const headingLabel = computed(() => props.headingMeta
	? `${props.title}，${props.headingMeta}`
	: props.title)
const densityMode = ref<'detailed' | 'compact'>('detailed')
const compactMode = computed(() => densityMode.value === 'compact')
const subjectStartIndex = computed(() => Math.max(0, (props.page - 1) * props.pageSize))
const { controlSize } = useWorkbenchControlSize()
</script>

<template>
	<div class="subject-work-browser">
		<div class="section-heading subject-work-browser__heading">
			<div class="subject-work-browser__heading-copy">
				<slot name="heading" :title="title" :title-id="titleId" :heading-meta="headingMeta" :control-size="controlSize">
					<h2 :id="titleId">{{ title }}</h2>
					<p v-if="headingMeta" class="section-heading__meta" role="status" aria-live="polite">{{ headingMeta }}</p>
				</slot>
			</div>
			<div class="subject-work-browser__density-toggle">
				<n-radio-group
					v-model:value="densityMode"
					:size="controlSize"
					role="radiogroup"
					:aria-label="compactAriaLabel"
				>
					<n-radio-button value="detailed" title="显示完整作品信息">
						<span class="subject-work-browser__density-label">详细</span>
					</n-radio-button>
					<n-radio-button value="compact" :title="compactDescription">
						<span class="subject-work-browser__density-label">缩略</span>
					</n-radio-button>
				</n-radio-group>
			</div>
		</div>
		<WorkListToolbar
			:search="search"
			:sort="sort"
			:order="order"
			:sort-options="sortOptions"
			:search-placeholder="searchPlaceholder"
			:search-aria-label="searchAriaLabel"
			:sort-aria-label="sortAriaLabel"
			:order-aria-label="orderAriaLabel"
			:search-name="searchName"
			@update:search="emit('update:search', $event)"
			@update:sort="emit('update:sort', $event)"
			@update:order="emit('update:order', $event)"
		/>
		<slot name="list" :compact="compactMode" :start-index="subjectStartIndex" :aria-label="headingLabel">
			<SubjectWorkList
				:subjects="subjects"
				:empty-text="emptyText"
				:aria-label="headingLabel"
				:compact="compactMode"
				:start-index="subjectStartIndex"
			>
				<template v-if="$slots.role" #role="{ subject }">
					<slot name="role" :subject="subject" />
				</template>
				<template v-if="$slots.participants" #participants="{ subject }">
					<slot name="participants" :subject="subject" />
				</template>
			</SubjectWorkList>
		</slot>
		<AdaptivePagination
			v-if="showPagination"
			:page="page"
			:page-size="pageSize"
			:item-count="itemCount"
			:page-sizes="pageSizes"
			:summary="paginationSummary"
			:aria-label="paginationAriaLabel"
			@update:page="emit('update:page', $event)"
			@update:page-size="emit('update:page-size', $event)"
		/>
	</div>
</template>
