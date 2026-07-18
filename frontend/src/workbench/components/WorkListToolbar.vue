<script setup lang="ts">
import { computed } from 'vue'
import type { SubjectWorkSortOption, SubjectWorkSortOrder } from '../composables/useSubjectWorkBrowser'
import { useWorkbenchControlSize } from '../composables/useWorkbenchControlSize'
import AppIcon from './AppIcon.vue'
import SortDirectionButton from './SortDirectionButton.vue'
import { getWorkbenchControlThemeOverrides, getWorkbenchSelectThemeOverrides } from '../naiveThemeOverrides'

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

const { controlSize, isMobile } = useWorkbenchControlSize()
const controlThemeOverrides = computed(() => getWorkbenchControlThemeOverrides(isMobile.value))
const selectThemeOverrides = computed(() => getWorkbenchSelectThemeOverrides(isMobile.value))
</script>

<template>
	<n-config-provider :theme-overrides="controlThemeOverrides">
		<div class="work-list-toolbar">
			<n-input
				:size="controlSize"
				:value="search"
				:clearable="Boolean(search)"
				:placeholder="searchPlaceholder"
				autocomplete="off"
				:aria-label="searchAriaLabel"
				:input-props="{ 'aria-label': searchAriaLabel, name: searchName, spellcheck: 'false' }"
				@update:value="emit('update:search', $event)"
			>
				<template #prefix><AppIcon name="search" :size="16" /></template>
			</n-input>
			<slot
				name="before-sort"
				:size="controlSize"
				:select-theme-overrides="selectThemeOverrides"
			/>
			<n-select
				:size="controlSize"
				menu-size="small"
				:value="sort"
				:options="sortOptions"
				:theme-overrides="selectThemeOverrides"
				:consistent-menu-width="false"
				:aria-label="sortAriaLabel"
				@update:value="emit('update:sort', $event)"
			/>
			<SortDirectionButton
				:size="controlSize"
				:order="order"
				:context-label="orderAriaLabel"
				@update:order="emit('update:order', $event)"
			/>
		</div>
	</n-config-provider>
</template>
