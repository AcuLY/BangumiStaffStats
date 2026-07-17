<script setup lang="ts">
import { computed } from 'vue'
import type { SubjectWorkSortOption, SubjectWorkSortOrder } from '../composables/useSubjectWorkBrowser'
import { SUBJECT_WORK_ORDER_OPTIONS } from '../composables/useSubjectWorkBrowser'
import { useMediaQuery } from '../composables/useMediaQuery'
import AppIcon from './AppIcon.vue'

withDefaults(defineProps<{
	search: string
	sort: string
	order: SubjectWorkSortOrder
	sortOptions: SubjectWorkSortOption[]
	searchPlaceholder: string
	searchAriaLabel: string
	sortAriaLabel: string
	orderAriaLabel: string
	searchName?: string
}>(), {
	searchName: 'workSearch',
})

const emit = defineEmits<{
	'update:search': [value: string]
	'update:sort': [value: string]
	'update:order': [value: SubjectWorkSortOrder]
}>()

const isMobile = useMediaQuery('(max-width: 780px)')
const controlSize = computed<'small' | 'medium'>(() => isMobile.value ? 'medium' : 'small')
</script>

<template>
	<div class="work-list-toolbar">
		<n-input
			:size="controlSize"
			:value="search"
			clearable
			:placeholder="searchPlaceholder"
			autocomplete="off"
			:aria-label="searchAriaLabel"
			:input-props="{ 'aria-label': searchAriaLabel, name: searchName, spellcheck: 'false' }"
			@update:value="emit('update:search', $event)"
		>
			<template #prefix><AppIcon name="search" :size="16" /></template>
		</n-input>
		<n-select
			:size="controlSize"
			:value="sort"
			:options="sortOptions"
			:aria-label="sortAriaLabel"
			@update:value="emit('update:sort', $event)"
		/>
		<n-select
			:size="controlSize"
			:value="order"
			:options="SUBJECT_WORK_ORDER_OPTIONS"
			:aria-label="orderAriaLabel"
			@update:value="emit('update:order', $event)"
		/>
	</div>
</template>
