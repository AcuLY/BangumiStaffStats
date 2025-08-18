<script setup lang="ts">
import { useDisplayStore } from '@/stores/display'
import { useGlobalStore } from '@/stores/global'

const props = defineProps<{
	ids?: number[]
	names?: string[]
	images?: string[]
	characterSubjectNames?: string[]
}>()

const globalStore = useGlobalStore()
const displayStore = useDisplayStore()

const width = computed((): number => {
	if (displayStore.showCharacter) {
		return globalStore.isMobile ? 40 : 64
	} else {
		return globalStore.isMobile ? 40 : 50
	}
})
const height = computed((): number => {
	if (displayStore.showCharacter) {
		return globalStore.isMobile ? 40 : 64
	} else {
		return globalStore.isMobile ? 56.5 : 70.6
	}
})

const name = (index: number): string => (props.names ? props.names[index] : '')
const image = (index: number): string => (props.images ? props.images[index] : '')
const characterSubjectName = (index: number): string =>
	props.characterSubjectNames ? props.characterSubjectNames[index] : ''

const SUBJECT_BASE_URL = 'https://bgm.tv/subject/'
const CHARACTER_BASE_URL = 'https://bgm.tv/character/'
const baseURL = computed((): string =>
	props.characterSubjectNames ? CHARACTER_BASE_URL : SUBJECT_BASE_URL
)
</script>

<template>
	<div class="image-wrapper" :style="{ maxHeight: `${displayStore.rowHeight}px` }">
		<a
			v-for="(id, index) in props.ids"
			:href="`${baseURL}${id}`"
			target="_blank"
			:data-link-id="id"
		>
			<n-tooltip
				placement="top-end"
				:content-style="{ maxWidth: globalStore.isMobile ? '200px' : '300px' }"
			>
				<template #trigger>
					<img
						class="image"
						:style="{ width: `${width}px`, height: `${height}px` }"
						:src="image(index)"
						:alt="image(index)"
						loading="lazy"
					/>
				</template>
				<TableText :value="name(index)" />
				<TableText
					v-show="props.characterSubjectNames"
					:value="`【${characterSubjectName(index)}】`"
				/>
			</n-tooltip>
		</a>
	</div>
</template>

<style scoped>
.image-wrapper {
	margin: 0 8px;
	padding: 8px 12px;
	text-align: center;
	overflow-x: hidden;
	overflow-y: scroll;
}

.image-wrapper::-webkit-scrollbar {
	width: 4px;
}

.image {
	margin: 2px 8px 2px 0;
	border-radius: 5px;
	transition: all 0.1s;
}

.image:hover {
	box-shadow: 0 0 12px var(--color-primary);
}

@media (max-width: 768px) {
	.image-wrapper {
		margin: 6px;
	}

	.image-wrapper::-webkit-scrollbar {
		width: 2px;
	}

	.image {
		margin: 1px 4px 1px 0;
		border-radius: 3px;
	}
}
</style>
