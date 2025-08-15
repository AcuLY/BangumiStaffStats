<script setup lang="ts">
import type { PersonalSummary } from '@/api/api'
import { useDisplayStore } from '@/stores/display'
import { useGlobalStore } from '@/stores/global';

const props = defineProps<{ row: PersonalSummary }>()

const globalStore = useGlobalStore()
const displayStore = useDisplayStore()

const dataTableRef = inject<Ref<ComponentPublicInstance | null>>('dataTableRef')
let prevFocusID: number | null = null

const onContainerClick = (event: MouseEvent): void => {
	if (!globalStore.isMobile) {
		return
	}

	const target = event.target as HTMLElement
	if (!dataTableRef?.value?.$el.contains(target)) {
		prevFocusID = null
		return
	}
	
	const link = target.closest('a[data-link-id]') as HTMLAnchorElement | null

	if (!link) {
		prevFocusID = null
		return
	}

	const idAttr = link.getAttribute('data-link-id')
	const id = Number(idAttr)

	if (id != prevFocusID) {
		prevFocusID = id
		event.preventDefault()
		return
	}
}

onMounted(() => {
	document.addEventListener('click', onContainerClick, true)
})

onBeforeUnmount(() => {
	document.removeEventListener('click', onContainerClick, true)
})
</script>

<template>
	<template v-if="displayStore.showCharacter">
		<ItemImages
			v-if="displayStore.showImage"
			:ids="props.row.characterIDs"
			:names="displayStore.showChinese ? props.row.characterNamesCN : props.row.characterNames"
			:images="props.row.characterImages"
			:character-subject-names="
				displayStore.showChinese
					? props.row.characterSubjectNamesCN
					: props.row.characterSubjectNames
			"
		/>
		<ItemNames
			v-else
			:ids="props.row.characterIDs"
			:names="displayStore.showChinese ? props.row.characterNamesCN : props.row.characterNames"
			:character-subject-names="
				displayStore.showChinese
					? props.row.characterSubjectNamesCN
					: props.row.characterSubjectNames
			"
		/>
	</template>
	<template v-else>
		<ItemImages
			v-if="displayStore.showImage"
			:ids="props.row.subjectIDs"
			:names="displayStore.showChinese ? props.row.subjectNamesCN : props.row.subjectNames"
			:images="props.row.subjectImages"
		/>
		<ItemNames
			v-else
			:ids="props.row.subjectIDs"
			:names="displayStore.showChinese ? props.row.subjectNamesCN : props.row.subjectNames"
			:rates="props.row.rates"
		/>
	</template>
</template>
