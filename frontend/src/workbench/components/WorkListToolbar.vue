<script setup lang="ts">
import { computed } from 'vue'
import type { SubjectWorkSortOption, SubjectWorkSortOrder } from '../composables/useSubjectWorkBrowser'
import { useMediaQuery } from '../composables/useMediaQuery'
import AppIcon from './AppIcon.vue'
import SortDirectionButton from './SortDirectionButton.vue'

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
const controlSize = 'small' as const
const controlThemeOverrides = computed(() => isMobile.value
	? { common: { fontSizeSmall: '12px' } } // naive-size-token-exception: keep the native 28px small control height while applying the 12px mobile type spec.
	: undefined)
const selectThemeOverrides = computed(() => isMobile.value
	? {
		peers: {
			InternalSelection: { fontSizeSmall: '12px' }, // naive-size-token-exception: NSelect trigger text does not inherit the provider's common small font size.
			InternalSelectMenu: { optionFontSizeSmall: '12px' }, // naive-size-token-exception: keep expanded menu options aligned with the mobile toolbar type spec.
		},
	}
	: undefined)
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
