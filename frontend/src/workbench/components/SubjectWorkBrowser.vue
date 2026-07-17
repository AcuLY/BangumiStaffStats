<script setup lang="ts">
import { computed } from 'vue'
import type { Subject } from '../types'
import type { SubjectWorkSortOption, SubjectWorkSortOrder } from '../composables/useSubjectWorkBrowser'
import WorkListToolbar from './WorkListToolbar.vue'
import SubjectWorkList from './SubjectWorkList.vue'
import AdaptivePagination from './AdaptivePagination.vue'

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
}>(), {
	searchName: 'workSearch',
	headingMeta: '',
	showPagination: true,
})

const emit = defineEmits<{
	'update:search': [value: string]
	'update:sort': [value: string]
	'update:order': [value: SubjectWorkSortOrder]
	'update:page': [value: number]
	'update:page-size': [value: number]
}>()

defineSlots<{
	role(props: { subject: Subject }): unknown
	participants(props: { subject: Subject }): unknown
}>()

const headingLabel = computed(() => props.headingMeta
	? `${props.title}，${props.headingMeta}`
	: props.title)
</script>

<template>
	<div class="subject-work-browser">
		<div class="section-heading subject-work-browser__heading">
			<div class="subject-work-browser__heading-copy">
				<h2 :id="titleId">{{ title }}</h2>
				<p v-if="headingMeta" class="section-heading__meta" role="status" aria-live="polite">{{ headingMeta }}</p>
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
		<SubjectWorkList :subjects="subjects" :empty-text="emptyText" :aria-label="headingLabel">
			<template v-if="$slots.role" #role="{ subject }">
				<slot name="role" :subject="subject" />
			</template>
			<template v-if="$slots.participants" #participants="{ subject }">
				<slot name="participants" :subject="subject" />
			</template>
		</SubjectWorkList>
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
