<script setup lang="ts">
import type { Character, Subject } from '@/api/api'
import { useDisplayStore } from '@/stores/display'
import { useGlobalStore } from '@/stores/global'

const props = defineProps<{
	items: Subject[] | Character[]
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

const name = (item: { name: string; nameCN: string }): string => {
	return displayStore.showChinese ? item.nameCN : item.name
}

const SUBJECT_BASE_URL = 'https://bgm.tv/subject/'
const CHARACTER_BASE_URL = 'https://bgm.tv/character/'
const baseURL = computed((): string =>
	displayStore.showCharacter ? CHARACTER_BASE_URL : SUBJECT_BASE_URL
)
</script>

<template>
	<div class="image-wrapper" :style="{ maxHeight: `${displayStore.rowHeight}px` }">
		<a
			v-for="item in props.items"
			:href="`${baseURL}${item.id}`"
			target="_blank"
			:data-link-id="item.id"
		>
			<n-tooltip
				placement="top-end"
				:content-style="{ maxWidth: globalStore.isMobile ? '200px' : '300px' }"
			>
				<template #trigger>
					<img
						class="image"
						:style="{ width: `${width}px`, height: `${height}px` }"
						:src="item.image"
						:alt="item.image"
						loading="lazy"
					/>
				</template>
				<TableText :value="name(item)" />
				<TableText
					v-if="'subject' in item"
					:value="`【${name(item.subject)}】`"
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
