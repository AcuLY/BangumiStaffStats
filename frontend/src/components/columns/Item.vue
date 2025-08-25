<script setup lang="ts">
import type { PersonalSummary } from '@/api/api'
import { useDisplayStore } from '@/stores/display'

const props = defineProps<{ row: PersonalSummary }>()

const displayStore = useDisplayStore()
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
